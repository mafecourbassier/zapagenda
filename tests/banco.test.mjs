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
    create role service_role nologin bypassrls;
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
  await db.exec(migration('202611190004_whatsapp.sql'));
  await db.exec(migration('202611190004_whatsapp.sql'));
  await db.exec(migration('202611210005_whatsapp_sandbox.sql'));
  await db.exec(migration('202611210005_whatsapp_sandbox.sql'));
  await db.exec(migration('202611210006_agenda_historico.sql'));
  await db.exec(migration('202611210006_agenda_historico.sql'));
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
  async function preference(user, enabled, phone = '+55 (11) 99999-9999') {
    await as(user);
    return db.query('select public.za_set_whatsapp_preferences($1, $2, $3)', ['barbearia', phone, enabled]);
  }
  async function notificationState(user) {
    await as(user);
    return (await db.query("select public.za_whatsapp_state('barbearia') as data")).rows[0].data;
  }
  async function service(query, values = []) {
    await db.exec('reset role; set role service_role;');
    return db.query(query, values);
  }
  const noticeBooking = { ...reservation, id: crypto.randomUUID(), start: 630 };
  await t.test('WhatsApp exige telefone válido, autorização própria e isola preferências', async () => {
    await assert.rejects(preference(clientA, true, '119'), /código do país/);
    await assert.rejects(preference(owner, true), /conta do cliente/);
    await preference(clientA, true);
    assert.equal((await notificationState(clientA)).preference.phone, '5511999999999');
    assert.equal((await notificationState(clientB)).preference, null);
    assert.equal((await notificationState(owner)).preference, null);
    await as(clientA);
    await assert.rejects(db.exec('select public.za_claim_whatsapp_jobs(10)'), error => error.code === '42501');
  });
  await t.test('reserva cria uma confirmação e um lembrete para três horas antes, sem duplicar', async () => {
    await command(clientA, 'book', noticeBooking);
    await command(clientA, 'book', noticeBooking);
    await db.exec('reset role');
    const jobs = (await db.query('select o.kind, o.status, extract(epoch from (b.starts_at - o.due_at)) as delta from public.za_whatsapp_outbox o join public.za_bookings b on b.id = o.booking_id where b.id = $1', [noticeBooking.id])).rows;
    assert.equal(jobs.length, 2);
    assert.equal(jobs.find(row => row.kind === 'reminder').delta, '10800.000000');
    assert.ok(jobs.every(row => row.status === 'pending'));
    assert.equal((await notificationState(clientB)).messages.length, 0);
  });
  await t.test('cancelamento invalida lembrete e confirmação pendentes e cria um único aviso', async () => {
    await command(owner, 'cancel', { id: noticeBooking.id });
    await command(owner, 'cancel', { id: noticeBooking.id });
    const messages = (await notificationState(clientA)).messages;
    assert.equal(messages.length, 3);
    assert.equal(messages.filter(row => row.status === 'canceled').length, 2);
    assert.equal(messages.filter(row => row.kind === 'cancellation').length, 1);
  });
  let leased;
  await t.test('automação inativa mantém fila e dois workers não retiram a mesma mensagem', async () => {
    assert.equal((await service('select * from public.za_claim_whatsapp_jobs(10)')).rows.length, 0);
    await db.exec("reset role; update public.za_spaces set whatsapp_enabled = true where slug = 'barbearia';");
    const jobs = (await service('select * from public.za_claim_whatsapp_jobs(10)')).rows;
    assert.equal(jobs.length, 1);
    leased = jobs[0];
    assert.equal((await service('select * from public.za_claim_whatsapp_jobs(10)')).rows.length, 0);
    const prepared = (await service('select public.za_prepare_whatsapp_job($1, $2) as job', [leased.id, leased.lease_id])).rows[0].job;
    assert.equal(prepared.id, leased.id);
  });
  await t.test('webhook adiantado e repetido é reconciliado; leitura nunca volta para enviado', async () => {
    const time = new Date().toISOString();
    await service("select public.za_record_whatsapp_status('wamid-test', 'delivered', $1, null)", [time]);
    await service("select public.za_finish_whatsapp_job($1,$2,'submitted','wamid-test',null)", [leased.id, leased.lease_id]);
    assert.equal((await notificationState(clientA)).messages.find(item => item.id === leased.id).status, 'delivered');
    await service("select public.za_record_whatsapp_status('wamid-test', 'read', $1, null)", [time]);
    await service("select public.za_record_whatsapp_status('wamid-test', 'read', $1, null)", [time]);
    await service("select public.za_record_whatsapp_status('wamid-test', 'sent', $1, null)", [time]);
    assert.equal((await notificationState(clientA)).messages.find(item => item.id === leased.id).status, 'read');
  });
  await t.test('revogar o recebimento cancela os envios pendentes', async () => {
    await command(clientA, 'book', { ...reservation, id: crypto.randomUUID(), start: 660 });
    await preference(clientA, false, '');
    assert.ok((await notificationState(clientA)).messages.every(item => item.status !== 'pending'));
  });
  await t.test('worker interrompido sinaliza resultado incerto e não repete o envio', async () => {
    await preference(clientA, true);
    await command(clientA, 'book', { ...reservation, id: crypto.randomUUID(), start: 900 });
    const job = (await service('select * from public.za_claim_whatsapp_jobs(10)')).rows[0];
    assert.ok(job);
    await db.exec('reset role');
    await db.query("update public.za_whatsapp_outbox set lease_expires = now() - interval '1 second' where id = $1", [job.id]);
    assert.equal((await service('select * from public.za_claim_whatsapp_jobs(10)')).rows.length, 0);
    assert.equal((await notificationState(clientA)).messages.find(item => item.id === job.id).status, 'uncertain');
  });
  await t.test('oferta gera notificação individual e aceitar invalida o aviso pendente da oferta', async () => {
    await preference(clientB, true, '+5511988888888');
    const request = { ...wait, id: crypto.randomUUID(), serviceId: 'barba', start: 960, end: 1020 };
    await command(clientB, 'wait', request);
    await command(owner, 'gap', { id: crypto.randomUUID(), date, start: 960, end: 1020 });
    const offer = (await snapshot(clientB)).requests.find(item => item.id === request.id).offer;
    assert.ok(offer);
    const message = (await notificationState(clientB)).messages.find(item => item.kind === 'offer');
    assert.equal(message.status, 'pending');
    await command(clientB, 'accept', { id: request.id, offerId: offer.id });
    assert.equal((await notificationState(clientB)).messages.find(item => item.id === message.id).status, 'canceled');
  });
  await t.test('conteúdo de notificação de estética preserva os detalhes do procedimento no painel', async () => {
    await as(clientA);
    await db.query("select public.za_set_whatsapp_preferences('estetica', '+5511999999999', true)");
    const bookingId = await command(clientA, 'book', { ...reservation, id: crypto.randomUUID(), start: 780, serviceId: 'acne' }, 'estetica');
    await db.exec('reset role');
    const payload = (await db.query('select payload from public.za_whatsapp_outbox where booking_id = $1 limit 1', [bookingId])).rows[0].payload;
    assert.equal(payload.studio, 'Casa Orla');
    assert.doesNotMatch(JSON.stringify(payload), /acne|botox|serviceId/);
  });

  await t.test('sandbox só retira avisos novos do telefone de teste e a cota persiste entre sessões', async () => {
    await as(clientA);
    await assert.rejects(db.query('select * from public.za_claim_whatsapp_sandbox_jobs($1,now(),$2)',
      ['5511999999999', 'a'.repeat(64)]), error => error.code === '42501');
    await assert.rejects(db.exec('select * from public.za_whatsapp_sandbox_usage'), error => error.code === '42501');
    await db.exec('reset role');
    const cutoff = (await db.query('select now() as cutoff')).rows[0].cutoff.toISOString();
    // Cancelamento legítimo enfileira um aviso imediato; duplicatas abaixo são apenas fixtures da cota.
    const original = (await db.query("select * from public.za_whatsapp_outbox where kind='cancellation' limit 1")).rows[0];
    const seed = async (dedupe, phone, created) => (await db.query(`insert into public.za_whatsapp_outbox
      (space_id,client_id,kind,dedupe_key,phone,payload,due_at,expires_at,created_at)
      values($1,$2,'cancellation',$3,$4,$5,now(),now()+interval '1 hour',$6) returning id`,
      [original.space_id, original.client_id, dedupe, phone, original.payload, created])).rows[0].id;
    const old = await seed('sandbox-old', original.phone, '2020-01-01T00:00:00Z');
    const other = await seed('sandbox-other', '5511888888888', new Date().toISOString());
    for (let i = 0; i < 21; i++) await seed(`sandbox-new-${i}`, original.phone, new Date().toISOString());
    const claim = async () => (await service('select * from public.za_claim_whatsapp_sandbox_jobs($1,$2,$3)',
      [original.phone, cutoff, 'a'.repeat(64)])).rows;
    const ids = new Set();
    for (let i = 0; i < 20; i++) {
      const rows = await claim();
      assert.equal(rows.length, 1);
      assert.ok(!ids.has(rows[0].id));
      ids.add(rows[0].id);
      await service("select public.za_finish_whatsapp_job($1,$2,'submitted',$3,null)",
        [rows[0].id, rows[0].lease_id, `d360:quota-${i}`]);
    }
    assert.equal((await claim()).length, 0);
    await db.exec('reset role');
    assert.equal((await db.query('select attempts from public.za_whatsapp_sandbox_usage where key_hash=$1', ['a'.repeat(64)])).rows[0].attempts, 20);
    const untouched = (await db.query('select status from public.za_whatsapp_outbox where id in ($1,$2)', [old, other])).rows;
    assert.ok(untouched.every(row => row.status === 'pending'));
    await service("select public.za_record_whatsapp_status('d360:quota-0','delivered',now(),null)");
    await service("select public.za_record_whatsapp_status('d360:quota-0','read',now(),null)");
    await service("select public.za_record_whatsapp_status('d360:quota-0','sent',now(),null)");
    await db.exec('reset role');
    assert.equal((await db.query("select status from public.za_whatsapp_outbox where provider_id='d360:quota-0'")).rows[0].status, 'read');
  });

});
