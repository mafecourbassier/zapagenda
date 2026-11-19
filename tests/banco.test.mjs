import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

test('agenda compartilhada valida permissões e o ciclo de encaixe no PostgreSQL', async t => {
  const db = new PGlite({ extensions: { btree_gist } });
  t.after(() => db.close());
  await db.exec(`
    create schema auth;
    create schema extensions;
    create role anon nologin;
    create role authenticated nologin;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated;
  `);
  const owner = '00000000-0000-0000-0000-000000000001';
  const clientA = '00000000-0000-0000-0000-000000000002';
  const clientB = '00000000-0000-0000-0000-000000000003';
  const outsider = '00000000-0000-0000-0000-000000000004';
  for (const user of [owner, clientA, clientB, outsider]) {
    await db.query('insert into auth.users values ($1)', [user]);
  }
  const migration = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
  await db.exec(migration('202611190001_agenda_base.sql'));
  await db.query("insert into public.za_spaces (slug, owner_id) values ('barbearia', $1)", [owner]);
  for (let run = 0; run < 2; run++) {
    await db.exec(migration('202611190002_agenda_leitura.sql'));
    await db.exec(migration('202611190003_agenda_conectada.sql'));
  }
  const date = (await db.query("select ((now() at time zone 'America/Sao_Paulo')::date + 1)::text as day")).rows[0].day;
  async function as(user) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
    await db.exec(user ? 'set role authenticated' : 'set role anon');
  }
  async function command(user, action, payload, slug = 'barbearia') {
    await as(user);
    return (await db.query('select public.za_command($1, $2, $3::jsonb) as id', [slug, action, JSON.stringify(payload)])).rows[0].id;
  }
  async function snapshot(user, slug = 'barbearia') {
    await as(user);
    return (await db.query('select public.za_snapshot($1) as data', [slug])).rows[0].data;
  }
  const reservation = { id: crypto.randomUUID(), date, start: 540, serviceId: 'corte', name: 'Cliente A' };
  await t.test('cliente reserva e repetição não duplica o atendimento', async () => {
    assert.equal(await command(clientA, 'book', reservation), reservation.id);
    assert.equal(await command(clientA, 'book', reservation), reservation.id);
    assert.equal((await snapshot(owner)).appointments.length, 1);
  });
  await t.test('outro cliente enxerga ocupação sem dados pessoais', async () => {
    const state = await snapshot(clientB);
    assert.equal(state.isOwner, false);
    assert.equal(state.appointments[0].name, '');
    assert.equal(state.appointments[0].serviceId, null);
    assert.equal(state.appointments[0].clientId, null);
    assert.equal(state.appointments[0].start, 540);
  });
  await t.test('reservas sobrepostas, almoço e duração enviada pelo navegador são validados', async () => {
    await assert.rejects(command(clientB, 'book', { ...reservation, id: crypto.randomUUID() }), /ocupado/);
    await assert.rejects(command(clientB, 'book', { ...reservation, id: crypto.randomUUID(), start: 690, duration: 1 }), /expediente/);
    await assert.rejects(command(clientB, 'book', { ...reservation, id: crypto.randomUUID(), start: 1020, serviceId: 'combo' }), /expediente/);
    await assert.rejects(command(clientB, 'book', { ...reservation, id: crypto.randomUUID(), start: 120 }), /expediente/);
    await assert.rejects(command(clientB, 'book', { ...reservation, id: crypto.randomUUID(), serviceId: 'inexistente' }), /indisponível/);
  });
  const wait = { id: crypto.randomUUID(), date, start: 540, end: 600, serviceId: 'corte', name: 'Cliente B' };
  await t.test('fila pertence ao cliente e não aparece para terceiros', async () => {
    await command(clientB, 'wait', wait);
    await command(clientB, 'wait', { ...wait, id: crypto.randomUUID() });
    assert.equal((await snapshot(clientA)).requests.length, 0);
    assert.equal((await snapshot(clientB)).requests.length, 1);
    assert.equal((await snapshot(owner)).requests.length, 1);
  });
  await t.test('conta de profissional não reserva e cliente não cancela outra pessoa', async () => {
    await assert.rejects(command(owner, 'book', { ...reservation, id: crypto.randomUUID(), start: 840 }), /conta de cliente/);
    await assert.rejects(command(clientB, 'cancel', { id: reservation.id }), /indisponível/);
    await assert.rejects(command(clientA, 'gap', { id: crypto.randomUUID(), date, start: 840, end: 900 }), /profissional/);
    await assert.rejects(command(outsider, 'complete', { id: reservation.id }), /profissional/);
    await assert.rejects(command(owner, 'complete', { id: reservation.id }), /não começou/);
  });
  let offered;
  await t.test('cancelamento gera uma janela e oferece automaticamente para o cliente compatível', async () => {
    await command(owner, 'cancel', { id: reservation.id });
    await command(owner, 'cancel', { id: reservation.id });
    const state = await snapshot(clientB);
    assert.equal(state.gaps.length, 1);
    offered = state.requests[0].offer;
    assert.equal(offered.start, 540);
    assert.ok(offered.id);
    assert.ok(offered.expires > Date.now());
  });
  await t.test('abrir outra janela preserva a oferta; só seu destinatário pode aceitá-la', async () => {
    await command(owner, 'gap', { id: crypto.randomUUID(), date, start: 840, end: 900 });
    assert.equal((await snapshot(clientB)).requests[0].offer.id, offered.id);
    await assert.rejects(command(clientA, 'accept', { id: wait.id, offerId: offered.id }), /indisponível/);
    await assert.rejects(command(clientB, 'accept', { id: wait.id, offerId: crypto.randomUUID() }), /expirou/);
    const bookingId = await command(clientB, 'accept', { id: wait.id, offerId: offered.id });
    assert.equal(await command(clientB, 'accept', { id: wait.id, offerId: offered.id }), bookingId);
    const state = await snapshot(owner);
    assert.equal(state.appointments.filter(item => item.status === 'booked').length, 1);
    assert.equal(state.requests[0].status, 'accepted');
    assert.equal(state.appointments.find(item => item.id === bookingId).recovered, true);
  });
  await t.test('reserva comum ocupando a oferta impede o aceite e mantém o pedido na fila', async () => {
    const request = { ...wait, id: crypto.randomUUID(), start: 840, end: 900 };
    await command(clientB, 'wait', request);
    const offer = (await snapshot(clientB)).requests.find(item => item.id === request.id).offer;
    assert.ok(offer);
    await command(clientA, 'book', { ...reservation, id: crypto.randomUUID(), start: 840 });
    await assert.rejects(command(clientB, 'accept', { id: request.id, offerId: offer.id }), /expirou/);
    const state = await snapshot(clientB);
    assert.equal(state.requests.find(item => item.id === request.id).status, 'waiting');
    assert.equal(state.requests.find(item => item.id === request.id).offer, null);
  });
  await t.test('manicure e estética têm catálogo e agenda separados', async () => {
    await command(clientA, 'book', { ...reservation, id: crypto.randomUUID(), serviceId: 'esmaltacao' }, 'manicure');
    await command(clientA, 'book', { ...reservation, id: crypto.randomUUID(), serviceId: 'botox' }, 'estetica');
    assert.equal((await snapshot(owner, 'manicure')).appointments.length, 1);
    assert.equal((await snapshot(owner, 'estetica')).appointments.length, 1);
  });
  await t.test('tabelas não aceitam escrita direta e a API rejeita acesso sem login', async () => {
    await as(clientA);
    await assert.rejects(db.exec("update public.za_bookings set status = 'completed'"), error => error.code === '42501');
    await assert.rejects(db.exec('select * from public.za_requests'), error => error.code === '42501');
    await as(null);
    await assert.rejects(db.exec("select public.za_snapshot('barbearia')"), error => error.code === '42501');
  });
});
