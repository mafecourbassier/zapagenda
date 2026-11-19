begin;

alter table public.za_spaces enable row level security;
alter table public.za_bookings enable row level security;

grant usage on schema public to authenticated;
grant select on public.za_spaces, public.za_bookings to authenticated;

create index if not exists za_spaces_owner_id_idx
  on public.za_spaces (owner_id);
create index if not exists za_bookings_client_id_idx
  on public.za_bookings (client_id);

drop policy if exists za_spaces_owner_read on public.za_spaces;
create policy za_spaces_owner_read
  on public.za_spaces
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists za_bookings_client_or_owner_read on public.za_bookings;
create policy za_bookings_client_or_owner_read
  on public.za_bookings
  for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or space_id in (
      select id
      from public.za_spaces
      where owner_id = (select auth.uid())
    )
  );

commit;
