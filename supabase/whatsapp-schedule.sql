-- Execute depois de configurar os secrets das Edge Functions e o secret do Vault.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'zapagenda_whatsapp_worker_token') then
    raise exception 'Crie no Vault o secret zapagenda_whatsapp_worker_token, com o mesmo valor de WHATSAPP_WORKER_TOKEN.';
  end if;
end;
$$;

select cron.schedule(
  'zapagenda-whatsapp-worker',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://ynkxjhyirdxuzdhtirfs.supabase.co/functions/v1/whatsapp-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
          where name = 'zapagenda_whatsapp_worker_token' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
