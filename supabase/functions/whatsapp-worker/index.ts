import { createWorker } from '../_shared/whatsapp.mjs';

Deno.serve(createWorker({ env: name => Deno.env.get(name) }));
