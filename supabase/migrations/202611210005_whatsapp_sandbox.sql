-- Ambiente de demonstração. Não altera o cadastro nem os modelos da conta Meta.
begin;

create table if not exists public.za_whatsapp_sandbox_usage (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check (attempts between 0 and 20),
  updated_at timestamptz not null default now()
);
alter table public.za_whatsapp_sandbox_usage enable row level security;
revoke all on public.za_whatsapp_sandbox_usage from public, anon, authenticated;

create or replace function public.za_claim_whatsapp_sandbox_jobs(
  p_phone text, p_created_after timestamptz, p_key_hash text
) returns setof public.za_whatsapp_outbox
language plpgsql security definer set search_path = '' as $$
declare job public.za_whatsapp_outbox; used integer;
begin
  if p_phone is null or p_phone !~ '^[0-9]{10,15}$' or p_created_after is null
    or p_created_after > now() or p_created_after <= now() - interval '24 hours'
    or p_key_hash is null or p_key_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Configuração de teste inválida.' using errcode = '22023';
  end if;
  -- Contador persistente: reiniciar a função ou abrir outra sessão não libera a cota.
  -- Reserva no máximo 20 tentativas para deixar margem aos testes manuais do usuário.
  insert into public.za_whatsapp_sandbox_usage(key_hash) values (p_key_hash) on conflict do nothing;
  select attempts into used from public.za_whatsapp_sandbox_usage where key_hash = p_key_hash for update;
  if used >= 20 then return; end if;
  update public.za_whatsapp_outbox set status = 'uncertain', error_code = 'worker_interrupted', updated_at = now()
    where phone = p_phone and created_at >= p_created_after and status = 'sending' and lease_expires < now();
  update public.za_whatsapp_outbox q set status = 'canceled', updated_at = now()
    where q.phone = p_phone and q.created_at >= p_created_after and q.status = 'pending'
      and not za_internal.whatsapp_job_valid(q);
  select q.* into job from public.za_whatsapp_outbox q
    where q.status = 'pending' and q.phone = p_phone and q.created_at >= p_created_after and q.due_at <= now()
      and exists(select 1 from public.za_spaces s where s.id = q.space_id and s.whatsapp_enabled)
      and za_internal.whatsapp_job_valid(q)
    order by q.due_at, q.id for update skip locked limit 1;
  if not found then return; end if;
  update public.za_whatsapp_sandbox_usage set attempts = attempts + 1, updated_at = now() where key_hash = p_key_hash;
  update public.za_whatsapp_outbox q set status = 'sending', lease_id = gen_random_uuid(),
    lease_expires = now() + interval '5 minutes', updated_at = now()
    where q.id = job.id returning q.* into job;
  return next job;
end;
$$;

revoke all on function public.za_claim_whatsapp_sandbox_jobs(text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.za_claim_whatsapp_sandbox_jobs(text,timestamptz,text) to service_role;
commit;
