import { createSandboxWebhook } from '../_shared/whatsapp.mjs';

Deno.serve(createSandboxWebhook({ env: name => Deno.env.get(name) }));
