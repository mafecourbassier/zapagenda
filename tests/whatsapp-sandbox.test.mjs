import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxWebhook, createWorker, sandboxMessage } from '../supabase/functions/_shared/whatsapp.mjs';

const instant = Date.now();
const config = {
  WHATSAPP_PROVIDER: '360dialog_sandbox', WHATSAPP_DELIVERY_ENABLED: 'true',
  WHATSAPP_WORKER_TOKEN: 'worker-test-only', D360_API_KEY: 'sandbox-key-test-only',
  D360_SANDBOX_PHONE: '5511999999999', D360_SANDBOX_STARTED_AT: new Date(instant - 60_000).toISOString(),
  D360_WEBHOOK_TOKEN: 'a'.repeat(64), PUBLIC_APP_URL: 'https://example.test/',
};
const env = name => config[name];
const job = { id: 'sandbox-job', lease_id: 'sandbox-lease', kind: 'confirmation', phone: config.D360_SANDBOX_PHONE,
  payload: { slug: 'barbearia', name: 'Cliente', studio: 'Clube do Corte', date: '25/11/2026', time: '14:00' } };
const request = () => new Request('https://example.test/worker', { method: 'POST', headers: { Authorization: 'Bearer worker-test-only' } });
const webhookRequest = (body, authorization = `Basic ${btoa(`zapagenda:${config.D360_WEBHOOK_TOKEN}`)}`) => new Request('https://example.test/webhook', {
  method: 'POST', headers: { Authorization: authorization }, body: JSON.stringify(body),
});
const statusBody = status => ({ entry: [{ changes: [{ field: 'messages', value: { statuses: [status] } }] }] });
const status = { id: 'wamid.sandbox', status: 'delivered', recipient_id: config.D360_SANDBOX_PHONE, timestamp: String(Math.floor(instant / 1000)) };

test('sandbox envia pela 360dialog sem credenciais Meta, filtra a fila e registra apenas aceite', async () => {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push([name, args]);
    if (name === 'za_claim_whatsapp_sandbox_jobs') return [job];
    if (name === 'za_prepare_whatsapp_job') return job;
  };
  const handler = createWorker({ env, rpc, now: () => instant, fetcher: async (url, options) => {
    assert.equal(url, 'https://waba-sandbox.360dialog.io/v1/messages');
    assert.equal(options.headers['D360-API-KEY'], config.D360_API_KEY);
    assert.equal(options.headers.Authorization, undefined);
    const body = JSON.parse(options.body);
    assert.equal(body.to, job.phone);
    assert.equal(body.type, 'text');
    assert.match(body.text.body, /confirmado.*25\/11\/2026.*14:00/);
    assert.match(body.text.body, /https:\/\/example.test\/#\/barbearia\/cliente/);
    return Response.json({ messages: [{ id: 'wamid.sandbox' }] }, { status: 201 });
  } });
  assert.equal((await handler(request())).status, 200);
  const claim = calls.find(([name]) => name === 'za_claim_whatsapp_sandbox_jobs')[1];
  assert.equal(claim.p_phone, job.phone);
  assert.equal(claim.p_created_after, config.D360_SANDBOX_STARTED_AT);
  assert.match(claim.p_key_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(calls).includes(config.D360_API_KEY));
  const finished = calls.find(([name]) => name === 'za_finish_whatsapp_job')[1];
  assert.equal(finished.p_status, 'submitted');
  assert.equal(finished.p_provider_id, 'd360:wamid.sandbox');
});

test('configuração inválida, provedor desconhecido e sessão expirada não retiram mensagens', async () => {
  for (const overrides of [
    { WHATSAPP_PROVIDER: 'typo' }, { D360_API_KEY: '' }, { D360_WEBHOOK_TOKEN: '' },
    { D360_SANDBOX_PHONE: '119' }, { D360_SANDBOX_STARTED_AT: '' },
    { PUBLIC_APP_URL: 'http://example.test' },
  ]) {
    let calls = 0;
    const handler = createWorker({ env: name => name in overrides ? overrides[name] : env(name), now: () => instant,
      rpc: async () => { calls++; }, fetcher: async () => { calls++; } });
    assert.equal((await handler(request())).status, 503);
    assert.equal(calls, 0);
  }
  for (const clock of [instant - 120_000, instant + 24 * 60 * 60_000]) {
    let calls = 0;
    const handler = createWorker({ env, now: () => clock, rpc: async () => { calls++; } });
    const result = await handler(request());
    assert.equal((await result.json()).mode, 'sandbox_session_expired');
    assert.equal(calls, 0);
  }
});

test('sandbox impede redirecionamento de avisos de outro telefone e suporta BSUID explícito', async () => {
  assert.throws(() => sandboxMessage({ ...job, phone: '5511888888888' }, env), /sandbox_recipient/);
  const body = sandboxMessage(job, name => name === 'D360_SANDBOX_BSUID' ? 'BR.test-user' : env(name));
  assert.equal(body.recipient, 'BR.test-user');
  assert.equal(body.to, undefined);
  for (const kind of ['confirmation', 'reminder', 'cancellation', 'offer']) {
    const payload = sandboxMessage({ ...job, kind, payload: { ...job.payload, service: 'acne' } }, env);
    assert.doesNotMatch(JSON.stringify(payload), /acne/);
  }
});

test('cota esgotada ou fila vazia não chama o provedor; timeout não dispara repetição', async () => {
  let sends = 0;
  const empty = createWorker({ env, now: () => instant, rpc: async () => [], fetcher: async () => { sends++; } });
  assert.equal((await empty(request())).status, 200);
  assert.equal(sends, 0);
  for (const [fetcher, expected, code] of [
    [async () => { throw new Error('timeout'); }, 'uncertain', 'network_or_response_unknown'],
    [async () => Response.json({ error: 'Quota exceeded' }, { status: 429 }), 'failed', '429'],
  ]) {
    let finished;
    const rpc = async (name, args) => {
      if (name === 'za_claim_whatsapp_sandbox_jobs') return [job];
      if (name === 'za_prepare_whatsapp_job') return job;
      finished = args;
    };
    assert.equal((await createWorker({ env, rpc, fetcher, now: () => instant })(request())).status, 200);
    assert.equal(finished.p_status, expected);
    assert.equal(finished.p_error_code, code);
  }
});

test('webhook do sandbox exige segredo próprio; chave API e assinatura Meta não autorizam', async () => {
  let calls = 0;
  const handler = createSandboxWebhook({ env, rpc: async () => { calls++; } });
  for (const auth of ['', 'Bearer sandbox-key-test-only', `Basic ${btoa('zapagenda:wrong')}`]) {
    assert.equal((await handler(webhookRequest(statusBody(status), auth))).status, 401);
  }
  assert.equal(calls, 0);
});

test('webhook aceita envelopes documentados, isola o destinatário e separa IDs Meta e 360dialog', async () => {
  const calls = [];
  const handler = createSandboxWebhook({ env, rpc: async (...args) => calls.push(args) });
  assert.equal((await handler(webhookRequest(statusBody(status)))).status, 200);
  assert.equal(calls[0][1].p_status, 'delivered');
  assert.equal(calls[0][1].p_provider_id, 'd360:wamid.sandbox');
  await handler(webhookRequest({ statuses: [{ ...status, status: 'read' }] }));
  assert.equal(calls[1][1].p_status, 'read');
  await handler(webhookRequest(statusBody({ ...status, recipient_id: '5511888888888' })));
  await handler(webhookRequest(statusBody({ ...status, timestamp: 'invalid' })));
  await handler(webhookRequest(statusBody({ ...status, status: 'unknown' })));
  assert.equal(calls.length, 2);
  const failed = createSandboxWebhook({ env, rpc: async () => { throw new Error('offline'); } });
  assert.equal((await failed(webhookRequest(statusBody(status)))).status, 503);
});
