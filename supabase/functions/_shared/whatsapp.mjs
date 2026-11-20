const encoder = new TextEncoder();
const response = (status, body) => Response.json(body, { status });

async function sameSecret(left, right) {
  if (!left || !right) return false;
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(left)));
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(right)));
  return a.reduce((difference, byte, index) => difference | (byte ^ b[index]), 0) === 0;
}

export async function validSignature(raw, signature, secret) {
  if (!secret || !/^sha256=[0-9a-f]{64}$/i.test(signature ?? '')) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.slice(7).match(/../g), pair => Number.parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', key, bytes, typeof raw === 'string' ? encoder.encode(raw) : raw);
}

function databaseRpc(env, fetcher) {
  const keys = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}');
  const key = keys.default || env('SUPABASE_SERVICE_ROLE_KEY');
  const url = env('SUPABASE_URL');
  if (!key || !url) throw new Error('database_configuration');
  return async (name, body) => {
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
    const result = await fetcher(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    if (!result.ok) throw new Error('database_request');
    return result.json();
  };
}

export function createWebhook({ env, fetcher = fetch, rpc = null }) {
  return async request => {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const challenge = url.searchParams.get('hub.challenge');
      if (url.searchParams.get('hub.mode') !== 'subscribe' || !challenge ||
        !await sameSecret(url.searchParams.get('hub.verify_token'), env('WHATSAPP_VERIFY_TOKEN'))) {
        return response(403, { error: 'verification_failed' });
      }
      return new Response(challenge, { headers: { 'Content-Type': 'text/plain' } });
    }
    if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });
    if (!env('WHATSAPP_APP_SECRET') || !env('WHATSAPP_PHONE_NUMBER_ID')) return response(503, { error: 'configuration_required' });
    const raw = new Uint8Array(await request.arrayBuffer());
    if (!await validSignature(raw, request.headers.get('X-Hub-Signature-256'), env('WHATSAPP_APP_SECRET'))) {
      return response(401, { error: 'invalid_signature' });
    }
    let body;
    try { body = JSON.parse(new TextDecoder().decode(raw)); }
    catch { return response(400, { error: 'invalid_json' }); }
    if (!body || typeof body !== 'object') return response(400, { error: 'invalid_json' });
    if (body.object !== 'whatsapp_business_account') return response(200, { received: true, statuses: 0 });
    if (!Array.isArray(body.entry)) return response(400, { error: 'invalid_payload' });
    try {
      const call = rpc ?? databaseRpc(env, fetcher);
      let processed = 0;
      for (const entry of body.entry ?? []) {
        for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
          const value = change.value;
          if (change.field !== 'messages' || value?.metadata?.phone_number_id !== env('WHATSAPP_PHONE_NUMBER_ID')) continue;
          for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
            const milliseconds = Number(status.timestamp) * 1000;
            if (!status.id || !['sent', 'delivered', 'read', 'failed'].includes(status.status) ||
                !Number.isFinite(milliseconds) || Number.isNaN(new Date(milliseconds).getTime())) continue;
            await call('za_record_whatsapp_status', {
              p_provider_id: status.id, p_status: status.status,
              p_occurred_at: new Date(milliseconds).toISOString(),
              p_error_code: status.errors?.[0]?.code == null ? null : String(status.errors[0].code),
            });
            processed++;
          }
        }
      }
      return response(200, { received: true, statuses: processed });
    } catch {
      // A Meta repetirá o webhook. A chave única no banco trata os eventos repetidos.
      return response(503, { error: 'storage_unavailable' });
    }
  };
}

export function templateMessage(job, env) {
  const templateVariables = {
    confirmation: 'WHATSAPP_TEMPLATE_CONFIRMATION', reminder: 'WHATSAPP_TEMPLATE_REMINDER',
    cancellation: 'WHATSAPP_TEMPLATE_CANCELLATION', offer: 'WHATSAPP_TEMPLATE_OFFER',
  };
  const variable = templateVariables[job.kind];
  const template = variable && env(variable);
  if (!template || !/^[a-z0-9_]+$/.test(template)) throw new Error('template_configuration');
  const site = new URL(env('PUBLIC_APP_URL'));
  if (site.protocol !== 'https:') throw new Error('site_configuration');
  site.hash = `/${job.payload.slug}/cliente`;
  site.search = '';
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: job.phone, type: 'template',
    template: {
      name: template, language: { code: 'pt_BR' },
      components: [{ type: 'body', parameters: [job.payload.name, job.payload.studio, job.payload.date,
        job.payload.time, site.href].map(text => ({ type: 'text', text })) }],
    },
  };
}

export function createWorker({ env, fetcher = fetch, rpc = null }) {
  return async request => {
    if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });
    const bearer = request.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!await sameSecret(bearer, env('WHATSAPP_WORKER_TOKEN'))) return response(401, { error: 'unauthorized' });
    if (env('WHATSAPP_DELIVERY_ENABLED') !== 'true') return response(200, { mode: 'disabled', processed: 0 });
    const version = env('WHATSAPP_API_VERSION') || 'v27.0';
    const phoneId = env('WHATSAPP_PHONE_NUMBER_ID');
    if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(phoneId ?? '') || !env('WHATSAPP_ACCESS_TOKEN')) {
      return response(503, { error: 'configuration_required' });
    }
    // Configurações ausentes são identificadas antes de retirar mensagens da fila.
    try {
      for (const kind of ['confirmation', 'reminder', 'cancellation', 'offer']) {
        templateMessage({ kind, phone: '5511999999999', payload: { slug: 'barbearia', name: 'Teste', studio: 'Espaço', date: '01/01/2030', time: '14:00' } }, env);
      }
    } catch { return response(503, { error: 'template_or_site_configuration' }); }
    try {
      const call = rpc ?? databaseRpc(env, fetcher);
      const jobs = await call('za_claim_whatsapp_jobs', { p_limit: 3 });
      let processed = 0;
      for (const claimed of jobs) {
        const job = await call('za_prepare_whatsapp_job', { p_id: claimed.id, p_lease: claimed.lease_id });
        if (!job) continue;
        let status = 'uncertain';
        let provider = null;
        let code = 'network_or_response_unknown';
        try {
          const result = await fetcher(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
            method: 'POST', headers: { Authorization: `Bearer ${env('WHATSAPP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(templateMessage(job, env)), signal: AbortSignal.timeout(10_000),
          });
          const data = await result.json();
          if (result.ok && data.messages?.[0]?.id) {
            status = 'submitted'; provider = data.messages[0].id; code = null;
          } else if (result.status >= 400 && result.status < 500) {
            status = 'failed'; code = String(data.error?.code ?? result.status);
          }
        } catch {
          // Sem confirmação do resultado externo, a fila mantém o estado incerto para conferência.
        }
        await call('za_finish_whatsapp_job', { p_id: job.id, p_lease: job.lease_id,
          p_status: status, p_provider_id: provider, p_error_code: code });
        processed++;
      }
      return response(200, { processed });
    } catch { return response(503, { error: 'worker_unavailable' }); }
  };
}
