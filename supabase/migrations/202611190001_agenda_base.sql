begin;

create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table if not exists public.za_spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  owner_id uuid not null references auth.users(id)
);

create table if not exists public.za_bookings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.za_spaces(id),
  client_id uuid not null references auth.users(id),
  client_name text not null,
  service_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked'
    check (status in ('booked', 'completed', 'canceled')),
  check (ends_at > starts_at),
  constraint za_bookings_no_overlap exclude using gist (
    space_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('booked', 'completed'))
);

alter table public.za_spaces enable row level security;
alter table public.za_bookings enable row level security;
revoke all on public.za_spaces, public.za_bookings from anon, authenticated;

commit;
