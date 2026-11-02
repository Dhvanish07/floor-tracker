-- Private application tables. Browser clients have no direct table access.
create table if not exists public.hub5_markers (
  id uuid primary key,
  floor integer not null check (floor between 1 and 14),
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  title text not null,
  created_at timestamptz not null default now(),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos)='array')
);
create index if not exists hub5_markers_floor on public.hub5_markers(floor);
create table if not exists public.hub5_uploads (
  id uuid primary key,
  floor integer not null check (floor between 1 and 14),
  marker_id uuid not null,
  existing boolean not null,
  x double precision,
  y double precision,
  title text not null,
  photos jsonb not null,
  expires_at timestamptz not null default now() + interval '30 minutes'
);
create table if not exists public.hub5_login_attempts (
  key text primary key,
  attempts integer not null default 1,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table public.hub5_markers enable row level security;
alter table public.hub5_uploads enable row level security;
alter table public.hub5_login_attempts enable row level security;
revoke all on public.hub5_markers, public.hub5_uploads, public.hub5_login_attempts from anon, authenticated;
