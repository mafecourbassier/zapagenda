begin;

create schema if not exists za_internal;
revoke all on schema za_internal from public, anon, authenticated;

alter table public.za_bookings add column if not exists price integer not null default 0;
alter table public.za_bookings add column if not exists recovered boolean not null default false;

create table if not exists public.za_services (
  space_id uuid not null references public.za_spaces(id),
  id text not null,
  name text not null,
  duration integer not null check (duration > 0),
  price integer not null check (price >= 0),
  primary key (space_id, id)
);

create table if not exists public.za_gaps (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.za_spaces(id),
  date date not null,
  start_min integer not null check (start_min >= 0),
  end_min integer not null check (end_min > start_min and end_min <= 1440),
  created_at timestamptz not null default now()
);

create table if not exists public.za_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.za_spaces(id),
  client_id uuid not null references auth.users(id),
  client_name text not null,
  service_id text not null,
  date date not null,
  start_min integer not null check (start_min >= 0),
  end_min integer not null check (end_min > start_min and end_min <= 1440),
  status text not null default 'waiting' check (status in ('waiting', 'accepted', 'canceled')),
  offer_id uuid,
  offer_gap_id uuid references public.za_gaps(id),
  offer_start integer,
  offer_expires timestamptz,
  booking_id uuid references public.za_bookings(id),
  created_at timestamptz not null default now(),
  foreign key (space_id, service_id) references public.za_services(space_id, id)
);

alter table public.za_bookings add column if not exists gap_id uuid references public.za_gaps(id);

create unique index if not exists za_requests_one_waiting
  on public.za_requests (space_id, client_id, service_id, date) where status = 'waiting';
create index if not exists za_requests_space_queue on public.za_requests (space_id, date, created_at);
create index if not exists za_gaps_space_date on public.za_gaps (space_id, date);

create table if not exists public.za_space_events (
  space_id uuid primary key references public.za_spaces(id),
  version bigint not null default 0
);

-- Os três espaços deste piloto pertencem ao profissional já vinculado à barbearia.
insert into public.za_spaces (slug, owner_id)
select additional.slug, owner_id from public.za_spaces
cross join (values ('manicure'), ('estetica')) as additional(slug)
where public.za_spaces.slug = 'barbearia'
on conflict (slug) do nothing;

insert into public.za_services (space_id, id, name, duration, price)
select s.id, catalog.service_id, catalog.name, catalog.duration, catalog.price
from public.za_spaces s join (values
  ('barbearia','corte','Corte clássico',45,65),
  ('barbearia','barba','Barba completa',30,45),
  ('barbearia','combo','Corte + barba',75,100),
  ('manicure','manutencao','Manutenção em gel',60,90),
  ('manicure','esmaltacao','Esmaltação',30,50),
  ('manicure','alongamento','Alongamento em gel',90,155),
  ('estetica','pele','Avaliação facial',60,120),
  ('estetica','botox','Avaliação para botox',30,100),
  ('estetica','acne','Avaliação de pele acneica',90,150)
) as catalog(slug, service_id, name, duration, price) on catalog.slug = s.slug
on conflict (space_id, id) do nothing;

insert into public.za_space_events (space_id) select id from public.za_spaces on conflict do nothing;

alter table public.za_services enable row level security;
alter table public.za_requests enable row level security;
alter table public.za_gaps enable row level security;
alter table public.za_space_events enable row level security;
revoke all on public.za_services, public.za_requests, public.za_gaps, public.za_space_events from public, anon, authenticated;
grant select on public.za_space_events to authenticated;
drop policy if exists za_events_authenticated_read on public.za_space_events;
create policy za_events_authenticated_read on public.za_space_events for select to authenticated using (true);

create or replace function za_internal.instant(p_date date, p_minute integer)
returns timestamptz language sql immutable set search_path = '' as $$
  select (p_date::timestamp + make_interval(mins => p_minute)) at time zone 'America/Sao_Paulo';
$$;

create or replace function za_internal.is_free(p_space uuid, p_date date, p_start integer, p_end integer)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(
    p_end > p_start and p_start >= 480 and p_end <= 1080
    and not (p_start < 780 and p_end > 720)
    and not exists (
      select 1 from public.za_bookings b where b.space_id = p_space
      and b.status in ('booked', 'completed')
      and b.starts_at < za_internal.instant(p_date, p_end)
      and b.ends_at > za_internal.instant(p_date, p_start)
    ), false
  );
$$;

create or replace function za_internal.validate_date(p_date date, p_start integer)
returns void language plpgsql set search_path = '' as $$
begin
  if p_date is null or p_start is null or p_date > (now() at time zone 'America/Sao_Paulo')::date + 56
    or za_internal.instant(p_date, p_start) <= now() then
    raise exception 'Escolha um horário futuro nos próximos 56 dias.' using errcode = '22023';
  end if;
end;
$$;

create or replace function za_internal.offer_free(p_space uuid, p_date date, p_start integer, p_end integer, p_request uuid)
returns boolean language sql stable set search_path = '' as $$
  select za_internal.is_free(p_space, p_date, p_start, p_end)
    and not exists (
      select 1 from public.za_requests r join public.za_services s
        on s.space_id = r.space_id and s.id = r.service_id
      where r.space_id = p_space and r.date = p_date and r.id <> p_request
        and r.status = 'waiting' and r.offer_expires > now()
        and r.offer_start < p_end and r.offer_start + s.duration > p_start
    );
$$;

create or replace function za_internal.dispatch(p_gap uuid)
returns void language plpgsql set search_path = '' as $$
declare
  g public.za_gaps;
  r record;
  candidate integer;
  earliest integer;
begin
  select * into g from public.za_gaps where id = p_gap;
  if not found or za_internal.instant(g.date, g.end_min) <= now() then return; end if;
  earliest := g.start_min;
  if g.date = (now() at time zone 'America/Sao_Paulo')::date then
    earliest := greatest(earliest, extract(hour from now() at time zone 'America/Sao_Paulo')::integer * 60
      + extract(minute from now() at time zone 'America/Sao_Paulo')::integer + 1);
  end if;
  for r in
    select q.*, s.duration from public.za_requests q join public.za_services s
      on s.space_id = q.space_id and s.id = q.service_id
    where q.space_id = g.space_id and q.date = g.date and q.status = 'waiting'
      and (q.offer_expires is null or q.offer_expires <= now())
    order by q.created_at, q.id
  loop
    for candidate in select generate_series(greatest(earliest, r.start_min), least(g.end_min, r.end_min) - r.duration, 5)
    loop
      if za_internal.offer_free(g.space_id, g.date, candidate, candidate + r.duration, r.id) then
        update public.za_requests set offer_id = gen_random_uuid(), offer_gap_id = g.id,
          offer_start = candidate, offer_expires = now() + interval '5 minutes' where id = r.id;
        exit;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.za_snapshot(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  space public.za_spaces;
  staff boolean;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  reservations jsonb;
  waiting jsonb;
  gaps jsonb;
begin
  if caller is null then raise exception 'Entre na sua conta para abrir a agenda.' using errcode = '42501'; end if;
  select * into space from public.za_spaces where slug = p_slug;
  if not found then raise exception 'Este espaço ainda não foi configurado.' using errcode = '22023'; end if;
  staff := space.owner_id = caller;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', case when staff or b.client_id = caller then b.id::text else 'busy-' || b.id::text end,
    'name', case when staff or b.client_id = caller then b.client_name else '' end,
    'clientId', case when staff or b.client_id = caller then b.client_id else null end,
    'serviceId', case when staff or b.client_id = caller then b.service_id else null end,
    'price', case when staff or b.client_id = caller then b.price else 0 end,
    'date', (b.starts_at at time zone 'America/Sao_Paulo')::date,
    'start', extract(hour from b.starts_at at time zone 'America/Sao_Paulo')::integer * 60
      + extract(minute from b.starts_at at time zone 'America/Sao_Paulo')::integer,
    'end', extract(hour from b.ends_at at time zone 'America/Sao_Paulo')::integer * 60
      + extract(minute from b.ends_at at time zone 'America/Sao_Paulo')::integer,
    'status', b.status, 'recovered', case when staff or b.client_id = caller then b.recovered else false end,
    'gapId', case when staff or b.client_id = caller then b.gap_id else null end
  ) order by b.starts_at), '[]'::jsonb) into reservations
  from public.za_bookings b where b.space_id = space.id
    and b.starts_at >= za_internal.instant(today - 7, 0)
    and b.starts_at < za_internal.instant(today + 57, 0)
    and (staff or b.client_id = caller or b.status in ('booked', 'completed'));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'clientId', q.client_id, 'name', q.client_name, 'serviceId', q.service_id,
    'date', q.date, 'start', q.start_min, 'end', q.end_min, 'status', q.status,
    'offer', case when q.status = 'waiting' and q.offer_expires > now()
      and za_internal.is_free(space.id, q.date, q.offer_start, q.offer_start + s.duration)
      then jsonb_build_object('id', q.offer_id, 'gapId', q.offer_gap_id, 'start', q.offer_start,
        'expires', floor(extract(epoch from q.offer_expires) * 1000)) else null end
  ) order by q.created_at, q.id), '[]'::jsonb) into waiting
  from public.za_requests q join public.za_services s on s.space_id = q.space_id and s.id = q.service_id
  where q.space_id = space.id and (staff or q.client_id = caller) and q.date >= today - 7;

  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'date', g.date, 'start', g.start_min, 'end', g.end_min)
    order by g.created_at desc, g.id), '[]'::jsonb) into gaps
  from public.za_gaps g where g.space_id = space.id and g.date between today and today + 56;

  return jsonb_build_object('spaceId', space.id, 'isOwner', staff, 'appointments', reservations,
    'requests', waiting, 'gaps', gaps, 'gap', gaps->0);
end;
$$;

create or replace function public.za_command(p_slug text, p_action text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  space public.za_spaces;
  service public.za_services;
  booking public.za_bookings;
  request public.za_requests;
  gap public.za_gaps;
  operation uuid;
  chosen_date date;
  chosen_start integer;
  chosen_end integer;
  chosen_name text;
  existing_id uuid;
  staff boolean;
begin
  if caller is null then raise exception 'Entre na sua conta para continuar.' using errcode = '42501'; end if;
  -- Uma transação por espaço serializa reservas, cancelamentos e aceites concorrentes.
  select * into space from public.za_spaces where slug = p_slug for update;
  if not found then raise exception 'Este espaço ainda não foi configurado.' using errcode = '22023'; end if;
  staff := caller = space.owner_id;
  if p_action in ('gap', 'offer', 'complete') and not staff then
    raise exception 'Essa ação pertence ao profissional.' using errcode = '42501';
  end if;
  if p_action in ('book', 'wait', 'accept') and staff then
    raise exception 'Use uma conta de cliente para reservar.' using errcode = '42501';
  end if;

  if p_action in ('book', 'wait', 'gap') then
    operation := (p_payload->>'id')::uuid;
    if operation is null then raise exception 'Identificador da solicitação ausente.' using errcode = '22023'; end if;
    chosen_date := (p_payload->>'date')::date;
    chosen_start := (p_payload->>'start')::integer;
    perform za_internal.validate_date(chosen_date, chosen_start);
  end if;

  if p_action in ('book', 'wait') then
    chosen_name := btrim(p_payload->>'name');
    if chosen_name is null or length(chosen_name) not between 1 and 45 then
      raise exception 'Informe um nome de até 45 caracteres.' using errcode = '22023';
    end if;
    select * into service from public.za_services where space_id = space.id and id = p_payload->>'serviceId';
    if not found then raise exception 'Serviço indisponível.' using errcode = '22023'; end if;
  end if;

  case p_action
  when 'book' then
    select * into booking from public.za_bookings where id = operation;
    if found then
      if booking.client_id <> caller or booking.space_id <> space.id or booking.service_id <> service.id
        or booking.starts_at <> za_internal.instant(chosen_date, chosen_start) then
        raise exception 'Identificador já utilizado por outra reserva.' using errcode = '22023';
      end if;
      return booking.id;
    end if;
    chosen_end := chosen_start + service.duration;
    if not za_internal.is_free(space.id, chosen_date, chosen_start, chosen_end) then
      raise exception 'Esse horário foi ocupado ou está fora do expediente.' using errcode = '22023';
    end if;
    insert into public.za_bookings (id, space_id, client_id, client_name, service_id, starts_at, ends_at, price)
      values (operation, space.id, caller, chosen_name, service.id,
        za_internal.instant(chosen_date, chosen_start), za_internal.instant(chosen_date, chosen_end), service.price);

  when 'wait' then
    chosen_end := (p_payload->>'end')::integer;
    if chosen_end is null or chosen_start < 480 or chosen_end > 1080 or chosen_end - chosen_start < service.duration
      or not exists (select 1 from generate_series(chosen_start, chosen_end - service.duration, 1) as candidate
        where not (candidate < 780 and candidate + service.duration > 720)) then
      raise exception 'Escolha um período comercial que comporte o serviço fora das pausas.' using errcode = '22023';
    end if;
    select id into existing_id from public.za_requests
      where space_id = space.id and client_id = caller and service_id = service.id and date = chosen_date and status = 'waiting';
    if existing_id is not null then return existing_id; end if;
    select * into request from public.za_requests where id = operation;
    if found then
      if request.client_id <> caller or request.space_id <> space.id then
        raise exception 'Identificador já utilizado.' using errcode = '22023';
      end if;
      return request.id;
    end if;
    insert into public.za_requests (id, space_id, client_id, client_name, service_id, date, start_min, end_min)
      values (operation, space.id, caller, chosen_name, service.id, chosen_date, chosen_start, chosen_end);
    for gap in select * from public.za_gaps where space_id = space.id and date = chosen_date order by created_at loop
      perform za_internal.dispatch(gap.id);
    end loop;

  when 'gap' then
    chosen_end := (p_payload->>'end')::integer;
    if not za_internal.is_free(space.id, chosen_date, chosen_start, chosen_end) then
      raise exception 'Informe uma faixa livre dentro do expediente e fora das pausas.' using errcode = '22023';
    end if;
    insert into public.za_gaps (id, space_id, date, start_min, end_min)
      values (operation, space.id, chosen_date, chosen_start, chosen_end) on conflict (id) do nothing;
    select * into gap from public.za_gaps where id = operation;
    if gap.space_id <> space.id or gap.date <> chosen_date or gap.start_min <> chosen_start or gap.end_min <> chosen_end then
      raise exception 'Identificador já utilizado por outra janela.' using errcode = '22023';
    end if;
    perform za_internal.dispatch(operation);

  when 'cancel', 'complete' then
    select * into booking from public.za_bookings where id = (p_payload->>'id')::uuid and space_id = space.id;
    if not found or (not staff and booking.client_id <> caller) then
      raise exception 'Agendamento indisponível para esta conta.' using errcode = '42501';
    end if;
    operation := booking.id;
    if (p_action = 'cancel' and booking.status = 'canceled') or (p_action = 'complete' and booking.status = 'completed') then
      return operation;
    end if;
    if booking.status <> 'booked' then raise exception 'Esse atendimento já foi encerrado.' using errcode = '22023'; end if;
    if p_action = 'complete' then
      if booking.starts_at > now() then raise exception 'O horário do atendimento ainda não começou.' using errcode = '22023'; end if;
      update public.za_bookings set status = 'completed' where id = booking.id;
    else
      update public.za_bookings set status = 'canceled' where id = booking.id;
      if booking.ends_at > now() then
        insert into public.za_gaps (space_id, date, start_min, end_min) values (
          space.id, (booking.starts_at at time zone 'America/Sao_Paulo')::date,
          extract(hour from booking.starts_at at time zone 'America/Sao_Paulo')::integer * 60
            + extract(minute from booking.starts_at at time zone 'America/Sao_Paulo')::integer,
          extract(hour from booking.ends_at at time zone 'America/Sao_Paulo')::integer * 60
            + extract(minute from booking.ends_at at time zone 'America/Sao_Paulo')::integer
        ) returning * into gap;
        perform za_internal.dispatch(gap.id);
      end if;
    end if;

  when 'offer', 'accept' then
    select * into request from public.za_requests where id = (p_payload->>'id')::uuid and space_id = space.id;
    if not found or (p_action = 'accept' and request.client_id <> caller) then
      raise exception 'Pedido indisponível para esta conta.' using errcode = '42501';
    end if;
    if p_action = 'accept' and request.status = 'accepted' and request.offer_id = (p_payload->>'offerId')::uuid then
      return request.booking_id;
    end if;
    if request.status <> 'waiting' then raise exception 'Esse pedido já foi encerrado.' using errcode = '22023'; end if;
    select * into service from public.za_services where space_id = space.id and id = request.service_id;
    if p_action = 'offer' then
      select * into gap from public.za_gaps where id = (p_payload->>'gapId')::uuid and space_id = space.id;
      chosen_start := (p_payload->>'start')::integer;
      chosen_end := chosen_start + service.duration;
      perform za_internal.validate_date(request.date, chosen_start);
      if gap.id is null or gap.date <> request.date or chosen_start < greatest(gap.start_min, request.start_min)
        or chosen_end > least(gap.end_min, request.end_min)
        or not za_internal.offer_free(space.id, request.date, chosen_start, chosen_end, request.id) then
        raise exception 'O horário mudou. Confira as sugestões novamente.' using errcode = '22023';
      end if;
      if request.offer_start = chosen_start and request.offer_gap_id = gap.id and request.offer_expires > now() then return request.id; end if;
      update public.za_requests set offer_id = gen_random_uuid(), offer_gap_id = gap.id,
        offer_start = chosen_start, offer_expires = now() + interval '5 minutes' where id = request.id;
      operation := request.id;
    else
      if request.offer_id is null or (p_payload->>'offerId')::uuid is distinct from request.offer_id
        or request.offer_expires <= now() or request.offer_expires is null then
        raise exception 'Essa oferta expirou ou foi substituída.' using errcode = '22023';
      end if;
      chosen_start := request.offer_start;
      perform za_internal.validate_date(request.date, chosen_start);
      chosen_end := chosen_start + service.duration;
      if chosen_start < request.start_min or chosen_end > request.end_min
        or not za_internal.is_free(space.id, request.date, chosen_start, chosen_end) then
        raise exception 'Esse horário já foi ocupado. Seu pedido continua na fila.' using errcode = '22023';
      end if;
      operation := gen_random_uuid();
      insert into public.za_bookings (id, space_id, client_id, client_name, service_id, starts_at, ends_at, price, recovered, gap_id)
        values (operation, space.id, caller, request.client_name, service.id,
          za_internal.instant(request.date, chosen_start), za_internal.instant(request.date, chosen_end), service.price, true, request.offer_gap_id);
      update public.za_requests set status = 'accepted', booking_id = operation where id = request.id;
    end if;

  else
    raise exception 'Ação desconhecida.' using errcode = '22023';
  end case;

  -- Uma reserva comum pode ocupar um horário oferecido. O aceite sempre revalida a disponibilidade.
  update public.za_requests r set offer_expires = now()
    from public.za_services s where r.space_id = space.id and s.space_id = r.space_id and s.id = r.service_id
      and r.status = 'waiting' and r.offer_expires > now()
      and not za_internal.is_free(space.id, r.date, r.offer_start, r.offer_start + s.duration);
  update public.za_space_events set version = version + 1 where space_id = space.id;
  return operation;
end;
$$;

revoke all on all functions in schema za_internal from public, anon, authenticated;
revoke all on function public.za_snapshot(text), public.za_command(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.za_snapshot(text), public.za_command(text, text, jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'za_space_events') then
    alter publication supabase_realtime add table public.za_space_events;
  end if;
end;
$$;

commit;
