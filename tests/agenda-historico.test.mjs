import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

test('janelas e histórico preservam agenda, notificações e isolamento entre contas', async t => {
  const db = new PGlite({ extensions: { btree_gist } });
  t.after(() => db.close());
  await db.exec(`
    create schema auth; create schema extensions;
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated;
  `);
  const owner = crypto.randomUUID(), client = crypto.randomUUID(), other = crypto.randomUUID();
  for (const id of [owner, client, other]) await db.query('insert into auth.users values ($1)', [id]);
  const migration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
  await db.exec(migration('202611190001_agenda_base.sql'));
  const space = (await db.query("insert into public.za_spaces(slug,owner_id) values ('barbearia',$1) returning id", [owner])).rows[0].id;
  for (const name of ['202611190002_agenda_leitura.sql', '202611190003_agenda_conectada.sql',
    '202611190004_whatsapp.sql', '202611210005_whatsapp_sandbox.sql']) await db.exec(migration(name));
  const date = (await db.query("select ((now() at time zone 'America/Sao_Paulo')::date + 1)::text as day")).rows[0].day;
  const canonical = crypto.randomUUID(), duplicate = crypto.randomUUID(), legacyRequest = crypto.randomUUID();
  const legacyOffer = crypto.randomUUID(), completed = crypto.randomUUID();
  await db.query(`insert into public.za_gaps(id,space_id,date,start_min,end_min,created_at) values
    ($1,$3,$4,840,900,now()-interval '1 hour'),($2,$3,$4,840,900,now())`, [canonical, duplicate, space, date]);
  await db.query(`insert into public.za_requests(id,space_id,client_id,client_name,service_id,date,start_min,end_min,
    offer_id,offer_gap_id,offer_start,offer_expires) values ($1,$2,$3,'Cliente','corte',$4,840,900,$5,$6,840,now()+interval '5 minutes')`,
    [legacyRequest, space, client, date, legacyOffer, duplicate]);
  await db.query(`insert into public.za_bookings(id,space_id,client_id,client_name,service_id,starts_at,ends_at,status,price,recovered,gap_id)
    values($1,$2,$3,'Cliente','corte',now()-interval '2 hours',now()-interval '1 hour','completed',65,true,$4)`,
    [completed, space, client, duplicate]);

  async function as(user) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
    await db.exec(user ? 'set role authenticated' : 'set role anon');
  }
  async function command(user, action, payload) {
    await as(user);
    return (await db.query("select public.za_command('barbearia',$1,$2) as id", [action, payload])).rows[0].id;
  }
  async function snapshot(user) {
    await as(user);
    return (await db.query("select public.za_snapshot('barbearia') as data")).rows[0].data;
  }
  async function notices(user) {
    await as(user);
    return (await db.query("select public.za_whatsapp_state('barbearia') as data")).rows[0].data;
  }
  async function history(user, restore = false, slug = 'barbearia') {
    await as(user);
    return (await db.query('select public.za_manage_history($1,$2) as data', [slug, restore])).rows[0].data;
  }

  await t.test('consolidação executada isoladamente preserva referências sem depender de outra sessão', async () => {
    const sql = migration('202611210006_agenda_historico.sql');
    const cleanup = sql.match(/do \$za_gap_cleanup\$[\s\S]*?\$za_gap_cleanup\$;/i)[0];
    // Uma chamada independente, com commit próprio, como numa execução separada do editor SQL.
    await db.exec(cleanup);
    await db.exec(cleanup);
    assert.equal((await db.query('select count(*)::int as n from public.za_gaps')).rows[0].n, 1);
    assert.equal((await db.query('select gap_id from public.za_bookings where id=$1', [completed])).rows[0].gap_id, canonical);
    const request = (await db.query('select offer_id, offer_gap_id from public.za_requests where id=$1', [legacyRequest])).rows[0];
    assert.equal(request.offer_id, legacyOffer);
    assert.equal(request.offer_gap_id, canonical);
  });

  await t.test('migração repetível unifica janelas antigas e preserva oferta e referências', async () => {
    const sql = migration('202611210006_agenda_historico.sql');
    await db.exec(sql); await db.exec(sql);
    const state = await snapshot(owner);
    assert.equal(state.gaps.length, 1);
    assert.equal(state.gaps[0].id, canonical);
    assert.equal(state.appointments.find(b => b.id === completed).gapId, canonical);
    assert.equal(state.requests.find(r => r.id === legacyRequest).offer.id, legacyOffer);
    assert.equal(state.requests.find(r => r.id === legacyRequest).offer.gapId, canonical);
    await db.exec('reset role');
    await assert.rejects(db.query('insert into public.za_gaps(space_id,date,start_min,end_min) values($1,$2,840,900)',
      [space, date]), e => e.code === '23505');
  });

  await t.test('publicar de novo ou sobrepor é rejeitado; repetir operação e faixa adjacente são seguros', async () => {
    const gap = { id: canonical, date, start: 840, end: 900 };
    const before = (await snapshot(client)).requests[0].offer;
    assert.equal(await command(owner, 'gap', gap), canonical);
    await assert.rejects(command(owner, 'gap', { ...gap, id: crypto.randomUUID() }), /já publicado/);
    await assert.rejects(command(owner, 'gap', { ...gap, id: crypto.randomUUID(), start: 870, end: 930 }), /já publicado/);
    await assert.rejects(command(other, 'gap', { ...gap, id: crypto.randomUUID() }), /profissional/);
    const state = await snapshot(client);
    assert.equal(state.gaps.length, 1);
    assert.deepEqual(state.requests[0].offer, before);
    await command(owner, 'gap', { id: crypto.randomUUID(), date, start: 900, end: 960 });
    assert.equal((await snapshot(owner)).gaps.length, 2);
  });

  let activeBooking;
  await t.test('cancelar uma reserva reutiliza a janela publicada e enfileira a oferta uma vez', async () => {
    await as(other);
    await db.query("select public.za_set_whatsapp_preferences('barbearia','5511999999999',true)");
    const gap = { id: crypto.randomUUID(), date, start: 600, end: 660 };
    await command(owner, 'gap', gap);
    const booking = { id: crypto.randomUUID(), date, start: 600, serviceId: 'corte', name: 'Cliente' };
    await command(client, 'book', booking);
    const request = { id: crypto.randomUUID(), date, start: 600, end: 660, serviceId: 'barba', name: 'Outro' };
    await command(other, 'wait', request);
    assert.equal((await snapshot(other)).requests.find(r => r.id === request.id).offer, null);
    const count = (await snapshot(owner)).gaps.length;
    await command(owner, 'cancel', { id: booking.id });
    assert.equal((await snapshot(owner)).gaps.length, count);
    const offer = (await snapshot(other)).requests.find(r => r.id === request.id).offer;
    assert.equal(offer.gapId, gap.id);
    assert.equal((await notices(other)).messages.filter(q => q.kind === 'offer').length, 1);
    await command(owner, 'cancel', { id: booking.id });
    assert.equal((await notices(other)).messages.filter(q => q.kind === 'offer').length, 1);
    activeBooking = { id: crypto.randomUUID(), date, start: 960, serviceId: 'corte', name: 'Cliente' };
    await command(client, 'book', activeBooking);
  });

  const notificationIds = {};
  await t.test('limpar oculta só encerrados da própria conta; ativos e avisos pendentes permanecem', async () => {
    await as(client);
    await db.query("select public.za_set_whatsapp_preferences('barbearia','5511888888888',true)");
    await db.exec('reset role');
    for (const status of ['delivered', 'read', 'failed', 'canceled', 'pending', 'sending', 'submitted', 'sent', 'uncertain']) {
      const id = crypto.randomUUID(); notificationIds[status] = id;
      await db.query(`insert into public.za_whatsapp_outbox(id,space_id,client_id,kind,dedupe_key,phone,payload,due_at,expires_at,status)
        values($1::uuid,$2,$3,'reminder',$1::uuid::text,'5511888888888','{"name":"Cliente"}',now()+interval '1 hour',now()+interval '4 hours',$4)`,
        [id, space, client, status]);
    }
    const before = await snapshot(owner);
    const queue = before.requests;
    const result = await history(client);
    assert.ok(result.archivedCount >= 6);
    assert.equal(result.clearableCount, 0);
    const cleaned = await snapshot(client);
    assert.equal(cleaned.appointments.find(b => b.id === completed).archived, true);
    assert.equal(cleaned.appointments.find(b => b.id === activeBooking.id).archived, false);
    assert.deepEqual(cleaned.requests, queue.filter(r => r.clientId === client));
    assert.equal(cleaned.gaps.length, before.gaps.length);
    const visible = await notices(client);
    assert.equal(visible.preference.enabled, true);
    assert.deepEqual(visible.messages.map(q => q.status).sort(), ['pending', 'sending', 'sent', 'submitted', 'uncertain'].sort());
    assert.equal((await snapshot(owner)).appointments.find(b => b.id === completed).archived, false);
    assert.ok((await notices(owner)).messages.some(q => q.id === notificationIds.read));
    assert.equal((await history(client)).archivedCount, result.archivedCount);
  });

  await t.test('restaurar e limpar em outra conta não altera dados, ocupação, receita nem a visão do cliente', async () => {
    const before = await snapshot(owner);
    const total = before.appointments.filter(b => b.recovered && b.status === 'completed').reduce((sum,b) => sum + b.price, 0);
    await db.exec('reset role');
    const countBefore = (await db.query('select count(*)::int as n from public.za_whatsapp_outbox')).rows[0].n;
    const occupiedBefore = (await db.query(`select za_internal.is_free(space_id,
      (starts_at at time zone 'America/Sao_Paulo')::date,
      extract(hour from starts_at at time zone 'America/Sao_Paulo')::int*60 + extract(minute from starts_at at time zone 'America/Sao_Paulo')::int,
      extract(hour from ends_at at time zone 'America/Sao_Paulo')::int*60 + extract(minute from ends_at at time zone 'America/Sao_Paulo')::int) as free
      from public.za_bookings where id=$1`, [completed])).rows[0].free;
    assert.equal(occupiedBefore, false);
    await history(other, true);
    assert.equal((await snapshot(client)).appointments.find(b => b.id === completed).archived, true);
    await history(owner);
    const hidden = await snapshot(owner);
    assert.equal(hidden.appointments.find(b => b.id === completed).archived, true);
    assert.equal(hidden.appointments.filter(b => b.recovered && b.status === 'completed').reduce((sum,b) => sum + b.price, 0), total);
    assert.equal(hidden.appointments.find(b => b.id === activeBooking.id).status, 'booked');
    await history(client, true);
    assert.equal((await snapshot(client)).appointments.find(b => b.id === completed).archived, false);
    assert.equal((await snapshot(owner)).appointments.find(b => b.id === completed).archived, true);
    assert.ok((await notices(client)).messages.some(q => q.id === notificationIds.read));
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from public.za_whatsapp_outbox')).rows[0].n, countBefore);
    assert.equal((await db.query('select status from public.za_bookings where id=$1', [completed])).rows[0].status, 'completed');
    await history(owner, true);
    assert.equal((await snapshot(owner)).history.archivedCount, 0);
  });

  await t.test('histórico bloqueia acesso sem login e escrita direta; terceiro só gerencia seus registros', async () => {
    await assert.rejects(history(null), e => e.code === '42501');
    await as(client);
    await assert.rejects(db.exec('delete from public.za_history_archives'), e => e.code === '42501');
    await assert.rejects(db.exec('select * from public.za_history_archives'), e => e.code === '42501');
    await assert.rejects(history(client, null), e => e.code === '22023');
    await assert.rejects(history(client, false, 'inexistente'), e => e.code === '22023');
    await history(other);
    assert.equal((await snapshot(client)).appointments.find(b => b.id === completed).archived, false);
    assert.equal((await snapshot(owner)).appointments.find(b => b.id === completed).archived, false);
  });
});
