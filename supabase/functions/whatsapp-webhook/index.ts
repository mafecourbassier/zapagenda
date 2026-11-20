import { createWebhook } from '../_shared/whatsapp.mjs';

Deno.serve(createWebhook({ env: name => Deno.env.get(name) }));
