-- Janelas sem duplicação e histórico reversível por conta. Aplicar depois da migração 005.
begin;

-- Unifica duplicatas antigas sem perder reservas, ofertas ou seus identificadores.
-- O bloco é atômico e não depende de tabela temporária entre comandos/sessões.
do $za_gap_cleanup$
declare duplicate record;
begin
  lock table public.za_gaps in share row exclusive mode;
  for duplicate in
    select id, canonical_id from (
      select id, first_value(id) over (
        partition by space_id, date, start_min, end_min order by created_at, id
      ) as canonical_id from public.za_gaps
    ) ranked where id <> canonical_id
  loop
    update public.za_bookings set gap_id = duplicate.canonical_id where gap_id = duplicate.id;
    update public.za_requests set offer_gap_id = duplicate.canonical_id where offer_gap_id = duplicate.id;
    delete from public.za_gaps where id = duplicate.id;
  end loop;
  create unique index if not exists za_gaps_unique_range
    on public.za_gaps(space_id, date, start_min, end_min);
end;
$za_gap_cleanup$;

create table if not exists public.za_history_archives (
  space_id uuid not null references public.za_spaces(id),
  viewer_id uuid not null references auth.users(id),
  kind text not null check (kind in ('booking', 'notification')),
  record_id uuid not null,
  archived_at timestamptz not null default now(),
  primary key(space_id, viewer_id, kind, record_id)
);
alter table public.za_history_archives enable row level security;
revoke all on public.za_history_archives from public, anon, authenticated;

create or replace function za_internal.history_state(p_space uuid, p_viewer uuid, p_staff boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('available', true,
    'archivedCount', (select count(*) from public.za_history_archives h
      where h.space_id = p_space and h.viewer_id = p_viewer),
    'clearableCount', (select count(*) from public.za_bookings b
      where b.space_id = p_space and (p_staff or b.client_id = p_viewer)
        and b.status in ('completed', 'canceled')
        and not exists (select 1 from public.za_history_archives h where h.space_id = p_space
          and h.viewer_id = p_viewer and h.kind = 'booking' and h.record_id = b.id))
      + (select count(*) from public.za_whatsapp_outbox q
        where q.space_id = p_space and (p_staff or q.client_id = p_viewer)
          and q.status in ('delivered', 'read', 'failed', 'canceled')
          and not exists (select 1 from public.za_history_archives h where h.space_id = p_space
            and h.viewer_id = p_viewer and h.kind = 'notification' and h.record_id = q.id)));
$$;

create or replace function public.za_manage_history(p_slug text, p_restore boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); space public.za_spaces; staff boolean;
begin
  if caller is null then raise exception 'Entre na sua conta para continuar.' using errcode = '42501'; end if;
  if p_restore is null then raise exception 'Informe a ação do histórico.' using errcode = '22023'; end if;
  select * into space from public.za_spaces where slug = p_slug for update;
  if not found then raise exception 'Espaço indisponível.' using errcode = '22023'; end if;
  staff := space.owner_id = caller;
  if p_restore then
    delete from public.za_history_archives where space_id = space.id and viewer_id = caller;
  else
    insert into public.za_history_archives(space_id, viewer_id, kind, record_id)
      select space.id, caller, 'booking', b.id from public.za_bookings b
      where b.space_id = space.id and (staff or b.client_id = caller) and b.status in ('completed', 'canceled')
      on conflict do nothing;
    insert into public.za_history_archives(space_id, viewer_id, kind, record_id)
      select space.id, caller, 'notification', q.id from public.za_whatsapp_outbox q
      where q.space_id = space.id and (staff or q.client_id = caller)
        and q.status in ('delivered', 'read', 'failed', 'canceled')
      on conflict do nothing;
  end if;
  update public.za_space_events set version = version + 1 where space_id = space.id;
  return za_internal.history_state(space.id, caller, staff);
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
    select * into gap from public.za_gaps where id = operation;
    if found then
      if gap.space_id <> space.id or gap.date <> chosen_date or gap.start_min <> chosen_start or gap.end_min <> chosen_end then
        raise exception 'Identificador já utilizado por outra janela.' using errcode = '22023';
      end if;
      -- Repetir a mesma operação não recria a janela nem renova ofertas.
      return gap.id;
    end if;
    if exists (select 1 from public.za_gaps g where g.space_id = space.id and g.date = chosen_date
      and g.start_min < chosen_end and g.end_min > chosen_start) then
      raise exception 'Essa faixa coincide com um horário já publicado. Confira as faixas deste dia e escolha outro intervalo.' using errcode = '22023';
    end if;
    insert into public.za_gaps (id, space_id, date, start_min, end_min)
      values (operation, space.id, chosen_date, chosen_start, chosen_end);
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
        chosen_date := (booking.starts_at at time zone 'America/Sao_Paulo')::date;
        chosen_start := extract(hour from booking.starts_at at time zone 'America/Sao_Paulo')::integer * 60
          + extract(minute from booking.starts_at at time zone 'America/Sao_Paulo')::integer;
        chosen_end := extract(hour from booking.ends_at at time zone 'America/Sao_Paulo')::integer * 60
          + extract(minute from booking.ends_at at time zone 'America/Sao_Paulo')::integer;
        select * into gap from public.za_gaps g where g.space_id = space.id and g.date = chosen_date
          and g.start_min <= chosen_start and g.end_min >= chosen_end
          order by g.end_min - g.start_min, g.created_at, g.id limit 1;
        if not found then
          insert into public.za_gaps (space_id, date, start_min, end_min)
            values (space.id, chosen_date, chosen_start, chosen_end) returning * into gap;
        end if;
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
    'archived', b.status in ('completed', 'canceled') and exists (
      select 1 from public.za_history_archives h where h.space_id = space.id and h.viewer_id = caller
        and h.kind = 'booking' and h.record_id = b.id),
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
    'requests', waiting, 'gaps', gaps, 'gap', gaps->0,
    'history', za_internal.history_state(space.id, caller, staff));
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
        and not exists (select 1 from public.za_history_archives h
          where h.space_id = space.id and h.viewer_id = caller and h.kind = 'notification'
            and h.record_id = public.za_whatsapp_outbox.id)
      order by created_at desc limit 20) q;
  return jsonb_build_object('preference', preference, 'messages', messages, 'deliveryEnabled', space.whatsapp_enabled);
end;
$$;

revoke all on all functions in schema za_internal from public, anon, authenticated;
revoke all on function public.za_manage_history(text,boolean) from public, anon, authenticated;
grant execute on function public.za_manage_history(text,boolean) to authenticated;
commit;
