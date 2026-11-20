import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebhook, createWorker, templateMessage } from '../supabase/functions/_shared/whatsapp.mjs';

const configuration = {
  WHATSAPP_VERIFY_TOKEN: 'verify-test-only', WHATSAPP_APP_SECRET: 'app-test-only', WHATSAPP_WORKER_TOKEN: 'worker-test-only',
  WHATSAPP_ACCESS_TOKEN: 'access-test-only', WHATSAPP_PHONE_NUMBER_ID: '12345', WHATSAPP_DELIVERY_ENABLED: 'true',
  WHATSAPP_API_VERSION: 'v27.0', PUBLIC_APP_URL: 'https://example.test/',
  WHATSAPP_TEMPLATE_CONFIRMATION: 'zapagenda_confirmacao', WHATSAPP_TEMPLATE_REMINDER: 'zapagenda_lembrete',
  WHATSAPP_TEMPLATE_CANCELLATION: 'zapagenda_cancelamento', WHATSAPP_TEMPLATE_OFFER: 'zapagenda_encaixe',
};
const env = name => configuration[name];
const message = { id: 'job-1', lease_id: 'lease-1', kind: 'confirmation', phone: '5511999999999',
  payload: { name: 'Cliente', studio: 'Casa Orla', slug: 'estetica', date: '25/11/2026', time: '14:00' } };
const workerRequest = () => new Request('https://example.test/worker', { method: 'POST', headers: { Authorization: 'Bearer worker-test-only' } });

async function signedRequest(body) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(configuration.WHATSAPP_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const signature = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return new Request('https://example.test/webhook', { method: 'POST', body: raw, headers: { 'X-Hub-Signature-256': `sha256=${signature}` } });
}

test('verificação de webhook exige o token e devolve o desafio da Meta', async () => {
  const handler = createWebhook({ env });
  assert.equal((await handler(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42'))).status, 403);
  const result = await handler(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=verify-test-only&hub.challenge=42'));
  assert.equal(result.status, 200);
  assert.equal(await result.text(), '42');
});

test('webhook rejeita assinatura inválida e JSON assinado inválido antes de gravar', async () => {
  let calls = 0;
  const handler = createWebhook({ env, rpc: async () => { calls++; } });
  const fake = await handler(new Request('https://example.test/', { method: 'POST', body: '{}' }));
  assert.equal(fake.status, 401);
  assert.equal((await handler(await signedRequest('{'))).status, 400);
  assert.equal((await handler(await signedRequest('null'))).status, 400);
  assert.equal(calls, 0);
});

test('webhook grava status de entrega do número configurado e pede repetição quando o banco falha', async () => {
  const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: '12345' }, statuses: [{ id: 'wamid.1', status: 'delivered', timestamp: '1795600800' }],
  } }] }] };
  const calls = [];
  const handler = createWebhook({ env, rpc: async (...call) => { calls.push(call); } });
  assert.equal((await handler(await signedRequest(payload))).status, 200);
  assert.equal(calls[0][0], 'za_record_whatsapp_status');
  assert.equal(calls[0][1].p_provider_id, 'wamid.1');
  assert.equal(calls[0][1].p_status, 'delivered');
  payload.entry[0].changes[0].value.metadata.phone_number_id = 'another-phone';
  await handler(await signedRequest(payload));
  assert.equal(calls.length, 1);
  payload.entry[0].changes[0].value.metadata.phone_number_id = '12345';
  const failed = createWebhook({ env, rpc: async () => { throw new Error('offline'); } });
  assert.equal((await failed(await signedRequest(payload))).status, 503);
});

test('worker exige autenticação e fica desativado até a configuração de envio', async () => {
  let calls = 0;
  const handler = createWorker({ env: name => name === 'WHATSAPP_DELIVERY_ENABLED' ? 'false' : env(name),
    rpc: async () => { calls++; }, fetcher: async () => { calls++; } });
  assert.equal((await handler(new Request('https://example.test', { method: 'POST' }))).status, 401);
  const result = await handler(workerRequest());
  assert.equal((await result.json()).mode, 'disabled');
  assert.equal(calls, 0);
});

test('worker confere configurações antes de retirar mensagens da fila', async () => {
  let calls = 0;
  const handler = createWorker({ env: name => name === 'PUBLIC_APP_URL' ? '' : env(name), rpc: async () => { calls++; } });
  assert.equal((await handler(workerRequest())).status, 503);
  assert.equal(calls, 0);
});

test('mensagem usa modelo aprovado, dados de horário e link do espaço', () => {
  const body = templateMessage(message, env);
  assert.equal(body.type, 'template');
  assert.equal(body.template.language.code, 'pt_BR');
  assert.equal(body.template.components[0].parameters[4].text, 'https://example.test/#/estetica/cliente');
  assert.doesNotMatch(JSON.stringify(body), /acne|botox/);
});

test('worker revalida cada mensagem e registra aceite pela Meta sem confundir com entrega', async () => {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push([name, args]);
    if (name === 'za_claim_whatsapp_jobs') return [message];
    if (name === 'za_prepare_whatsapp_job') return message;
  };
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://graph.facebook.com/v27.0/12345/messages');
    assert.equal(options.headers.Authorization, 'Bearer access-test-only');
    assert.equal(JSON.parse(options.body).to, message.phone);
    return Response.json({ messages: [{ id: 'wamid.2' }] });
  };
  assert.equal((await createWorker({ env, rpc, fetcher })(workerRequest())).status, 200);
  const finished = calls.find(([name]) => name === 'za_finish_whatsapp_job')[1];
  assert.equal(finished.p_status, 'submitted');
  assert.equal(finished.p_provider_id, 'wamid.2');
});

test('mensagem invalidada antes do envio não chama a Meta', async () => {
  let sends = 0;
  const rpc = async name => name === 'za_claim_whatsapp_jobs' ? [message] : null;
  const handler = createWorker({ env, rpc, fetcher: async () => { sends++; } });
  assert.equal((await handler(workerRequest())).status, 200);
  assert.equal(sends, 0);
});

test('resultado externo desconhecido fica incerto e rejeição explícita fica como falha', async () => {
  for (const [fetcher, expected] of [
    [async () => { throw new Error('timeout'); }, 'uncertain'],
    [async () => Response.json({}, { status: 502 }), 'uncertain'],
    [async () => Response.json({ error: { code: 131030 } }, { status: 400 }), 'failed'],
  ]) {
    let state;
    const rpc = async (name, args) => {
      if (name === 'za_claim_whatsapp_jobs') return [message];
      if (name === 'za_prepare_whatsapp_job') return message;
      state = args.p_status;
    };
    assert.equal((await createWorker({ env, rpc, fetcher })(workerRequest())).status, 200);
    assert.equal(state, expected);
  }
});
