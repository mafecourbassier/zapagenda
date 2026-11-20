begin;

alter table public.za_spaces add column if not exists whatsapp_enabled boolean not null default false;

create table if not exists public.za_whatsapp_preferences (
  space_id uuid not null references public.za_spaces(id),
  client_id uuid not null references auth.users(id),
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  enabled boolean not null default false,
  consented_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (space_id, client_id)
);

create table if not exists public.za_whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.za_spaces(id),
  client_id uuid not null references auth.users(id),
  booking_id uuid references public.za_bookings(id),
  request_id uuid references public.za_requests(id),
  kind text not null check (kind in ('confirmation', 'reminder', 'cancellation', 'offer')),
  dedupe_key text not null unique,
  phone text not null,
  payload jsonb not null,
  due_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in
    ('pending', 'sending', 'submitted', 'sent', 'delivered', 'read', 'failed', 'canceled', 'uncertain')),
  lease_id uuid,
  lease_expires timestamptz,
  provider_id text unique,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists za_whatsapp_due on public.za_whatsapp_outbox (due_at) where status = 'pending';
create index if not exists za_whatsapp_space_log on public.za_whatsapp_outbox (space_id, created_at desc);
create table if not exists public.za_whatsapp_events (
  provider_id text not null,
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  occurred_at timestamptz not null,
  error_code text,
  primary key (provider_id, status, occurred_at)
);

alter table public.za_whatsapp_preferences enable row level security;
alter table public.za_whatsapp_outbox enable row level security;
alter table public.za_whatsapp_events enable row level security;
revoke all on public.za_whatsapp_preferences, public.za_whatsapp_outbox, public.za_whatsapp_events from public, anon, authenticated;

create or replace function za_internal.enqueue_whatsapp(
  p_space uuid, p_client uuid, p_kind text, p_key text, p_payload jsonb,
  p_due timestamptz, p_expires timestamptz, p_booking uuid default null, p_request uuid default null
)
returns void language plpgsql set search_path = '' as $$
declare preference public.za_whatsapp_preferences;
begin
  select * into preference from public.za_whatsapp_preferences
    where space_id = p_space and client_id = p_client and enabled;
  if not found or p_expires <= now() then return; end if;
  insert into public.za_whatsapp_outbox
    (space_id, client_id, booking_id, request_id, kind, dedupe_key, phone, payload, due_at, expires_at)
    values (p_space, p_client, p_booking, p_request, p_kind, p_key, preference.phone, p_payload, p_due, p_expires)
    on conflict (dedupe_key) do nothing;
end;
$$;

create or replace function za_internal.whatsapp_payload(p_space uuid, p_name text, p_time timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('name', p_name, 'slug', slug,
    'studio', case slug when 'barbearia' then 'Clube do Corte' when 'manicure' then 'Studio Rosa'
      when 'estetica' then 'Casa Orla' else slug end,
    'date', to_char(p_time at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
    'time', to_char(p_time at time zone 'America/Sao_Paulo', 'HH24:MI'))
  from public.za_spaces where id = p_space;
$$;

create or replace function za_internal.whatsapp_booking_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare payload jsonb;
begin
  payload := za_internal.whatsapp_payload(new.space_id, new.client_name, new.starts_at);
  if tg_op = 'INSERT' and new.status = 'booked' then
    perform za_internal.enqueue_whatsapp(new.space_id, new.client_id, 'confirmation', 'confirmation:' || new.id,
      payload, now(), new.starts_at, new.id);
    if new.starts_at - interval '3 hours' > now() then
      perform za_internal.enqueue_whatsapp(new.space_id, new.client_id, 'reminder', 'reminder:' || new.id,
        payload, new.starts_at - interval '3 hours', new.starts_at, new.id);
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'booked' and new.status <> 'booked' then
    update public.za_whatsapp_outbox set status = 'canceled', updated_at = now()
      where booking_id = new.id and status = 'pending';
    if new.status = 'canceled' then
      perform za_internal.enqueue_whatsapp(new.space_id, new.client_id, 'cancellation', 'cancellation:' || new.id,
        payload, now(), now() + interval '24 hours', new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists za_whatsapp_booking_changed on public.za_bookings;
create trigger za_whatsapp_booking_changed after insert or update of status on public.za_bookings
  for each row execute function za_internal.whatsapp_booking_changed();

create or replace function za_internal.whatsapp_request_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.za_whatsapp_outbox set status = 'canceled', updated_at = now()
    where request_id = new.id and status = 'pending'
      and (new.status <> 'waiting' or payload->>'offerId' is distinct from new.offer_id::text);
  if new.status = 'waiting' and new.offer_id is not null and new.offer_expires > now()
    and (tg_op = 'INSERT' or old.offer_id is distinct from new.offer_id) then
    perform za_internal.enqueue_whatsapp(new.space_id, new.client_id, 'offer', 'offer:' || new.offer_id,
      za_internal.whatsapp_payload(new.space_id, new.client_name, za_internal.instant(new.date, new.offer_start))
        || jsonb_build_object('offerId', new.offer_id), now(), new.offer_expires, null, new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists za_whatsapp_request_changed on public.za_requests;
create trigger za_whatsapp_request_changed after insert or update of offer_id, status, offer_expires on public.za_requests
  for each row execute function za_internal.whatsapp_request_changed();

create or replace function public.za_set_whatsapp_preferences(p_slug text, p_phone text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); space public.za_spaces; normalized_phone text;
begin
  if caller is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select * into space from public.za_spaces where slug = p_slug;
  if not found or space.owner_id = caller then
    raise exception 'Abra as preferências pela conta do cliente.' using errcode = '42501';
  end if;
  if p_enabled is null then raise exception 'Informe a preferência de recebimento.' using errcode = '22023'; end if;
  normalized_phone := regexp_replace(coalesce(p_phone, ''), '[[:space:]()+.-]', '', 'g');
  if not p_enabled then
    select phone into normalized_phone from public.za_whatsapp_preferences where space_id = space.id and client_id = caller;
    if not found then return; end if;
  end if;
  if normalized_phone !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'Informe o WhatsApp com código do país e DDD. Exemplo: +55 11 99999-9999.' using errcode = '22023';
  end if;
  insert into public.za_whatsapp_preferences (space_id, client_id, phone, enabled, consented_at)
    values (space.id, caller, normalized_phone, p_enabled, case when p_enabled then now() else null end)
  on conflict (space_id, client_id) do update set phone = excluded.phone, enabled = excluded.enabled,
    consented_at = case when excluded.enabled then now() else public.za_whatsapp_preferences.consented_at end, updated_at = now();
  update public.za_whatsapp_outbox set status = 'canceled', updated_at = now()
    where space_id = space.id and client_id = caller and status = 'pending' and (not p_enabled or normalized_phone <> public.za_whatsapp_outbox.phone);
  update public.za_space_events set version = version + 1 where space_id = space.id;
end;
$$;

create or replace function public.za_whatsapp_state(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid(); space public.za_spaces; preference jsonb; messages jsonb;
begin
  if caller is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select * into space from public.za_spaces where slug = p_slug;
  if not found then raise exception 'Espaço indisponível.' using errcode = '22023'; end if;
  select jsonb_build_object('phone', phone, 'enabled', enabled) into preference
    from public.za_whatsapp_preferences where space_id = space.id and client_id = caller;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'status', q.status, 'name', q.payload->>'name',
    'dueAt', q.due_at, 'createdAt', q.created_at, 'errorCode', q.error_code) order by q.created_at desc), '[]'::jsonb)
    into messages from (select * from public.za_whatsapp_outbox
      where space_id = space.id and (space.owner_id = caller or client_id = caller)
      order by created_at desc limit 20) q;
  return jsonb_build_object('preference', preference, 'messages', messages, 'deliveryEnabled', space.whatsapp_enabled);
end;
$$;

create or replace function za_internal.whatsapp_job_valid(job public.za_whatsapp_outbox)
returns boolean language sql stable set search_path = '' as $$
  select job.expires_at > now() and exists (
    select 1 from public.za_whatsapp_preferences p where p.space_id = job.space_id and p.client_id = job.client_id
      and p.enabled and p.phone = job.phone
  ) and case
    when job.kind in ('confirmation', 'reminder') then exists (
      select 1 from public.za_bookings b where b.id = job.booking_id and b.status = 'booked' and b.starts_at > now())
    when job.kind = 'offer' then exists (
      select 1 from public.za_requests r join public.za_services s on s.space_id = r.space_id and s.id = r.service_id
      where r.id = job.request_id and r.status = 'waiting' and r.offer_id::text = job.payload->>'offerId'
        and r.offer_expires > now() and za_internal.is_free(r.space_id, r.date, r.offer_start, r.offer_start + s.duration))
    else true end;
$$;

create or replace function public.za_claim_whatsapp_jobs(p_limit integer default 10)
returns setof public.za_whatsapp_outbox language plpgsql security definer set search_path = '' as $$
begin
  update public.za_whatsapp_outbox set status = 'uncertain', error_code = 'worker_interrupted', updated_at = now()
    where status = 'sending' and lease_expires < now();
  update public.za_whatsapp_outbox job set status = 'canceled', updated_at = now()
    where status = 'pending' and not za_internal.whatsapp_job_valid(job);
  return query update public.za_whatsapp_outbox as job set status = 'sending', lease_id = gen_random_uuid(),
    lease_expires = now() + interval '5 minutes', updated_at = now()
    from (select id from public.za_whatsapp_outbox where status = 'pending' and due_at <= now()
      and exists (select 1 from public.za_spaces s where s.id = space_id and s.whatsapp_enabled)
      order by due_at, id for update skip locked limit least(greatest(coalesce(p_limit, 10), 1), 10)) selected
    where job.id = selected.id returning job.*;
end;
$$;

create or replace function public.za_prepare_whatsapp_job(p_id uuid, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.za_whatsapp_outbox;
begin
  select * into job from public.za_whatsapp_outbox where id = p_id and lease_id = p_lease and status = 'sending' for update;
  if not found then return null; end if;
  if job.lease_expires <= now() or not za_internal.whatsapp_job_valid(job)
    or not exists (select 1 from public.za_spaces where id = job.space_id and whatsapp_enabled) then
    update public.za_whatsapp_outbox set status = 'canceled', updated_at = now() where id = job.id;
    return null;
  end if;
  return to_jsonb(job);
end;
$$;

create or replace function za_internal.apply_whatsapp_events(p_provider text)
returns void language plpgsql set search_path = '' as $$
declare job public.za_whatsapp_outbox; event record;
begin
  select * into job from public.za_whatsapp_outbox where provider_id = p_provider for update;
  if not found then return; end if;
  for event in select * from public.za_whatsapp_events where provider_id = p_provider order by occurred_at, status loop
    if event.status = 'read' or (event.status = 'delivered' and job.status <> 'read')
      or (event.status = 'sent' and job.status in ('sending','submitted','uncertain','failed'))
      or (event.status = 'failed' and job.status in ('sending','submitted','sent','uncertain')) then
      job.status := event.status;
      update public.za_whatsapp_outbox set status = event.status, error_code = event.error_code, updated_at = now() where id = job.id;
    end if;
  end loop;
end;
$$;

create or replace function public.za_finish_whatsapp_job(p_id uuid, p_lease uuid, p_status text,
  p_provider_id text default null, p_error_code text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('submitted','failed','uncertain','canceled') then raise exception 'Estado inválido.'; end if;
  update public.za_whatsapp_outbox set status = p_status, provider_id = p_provider_id,
    error_code = left(p_error_code, 80), lease_expires = null, updated_at = now()
    where id = p_id and lease_id = p_lease and status = 'sending';
  if found and p_provider_id is not null then perform za_internal.apply_whatsapp_events(p_provider_id); end if;
end;
$$;

create or replace function public.za_record_whatsapp_status(p_provider_id text, p_status text,
  p_occurred_at timestamptz, p_error_code text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('sent','delivered','read','failed') or p_provider_id is null or p_occurred_at is null then
    raise exception 'Evento inválido.' using errcode = '22023';
  end if;
  insert into public.za_whatsapp_events (provider_id, status, occurred_at, error_code)
    values (p_provider_id, p_status, p_occurred_at, left(p_error_code, 80)) on conflict do nothing;
  perform za_internal.apply_whatsapp_events(p_provider_id);
end;
$$;

revoke all on all functions in schema za_internal from public, anon, authenticated;
revoke all on function public.za_set_whatsapp_preferences(text,text,boolean), public.za_whatsapp_state(text)
  from public, anon, authenticated;
grant execute on function public.za_set_whatsapp_preferences(text,text,boolean), public.za_whatsapp_state(text) to authenticated;
revoke all on function public.za_claim_whatsapp_jobs(integer), public.za_prepare_whatsapp_job(uuid,uuid),
  public.za_finish_whatsapp_job(uuid,uuid,text,text,text), public.za_record_whatsapp_status(text,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.za_claim_whatsapp_jobs(integer), public.za_prepare_whatsapp_job(uuid,uuid),
  public.za_finish_whatsapp_job(uuid,uuid,text,text,text), public.za_record_whatsapp_status(text,text,timestamptz,text) to service_role;

commit;
