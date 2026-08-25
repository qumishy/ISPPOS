-- Backward-compatible multi-project access.
-- public.users.project_id and public.users.role remain available as legacy
-- defaults; project-specific access and roles live in user_project_access.

alter table public.project
  add column if not exists active boolean not null default true;

create table if not exists public.user_project_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_project_access_user_project_key unique (user_id, project_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_project_access_user_id_fkey'
      and conrelid = 'public.user_project_access'::regclass
  ) then
    alter table public.user_project_access
      add constraint user_project_access_user_id_fkey
      foreign key (user_id) references public.users(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_project_access_project_id_fkey'
      and conrelid = 'public.user_project_access'::regclass
  ) then
    alter table public.user_project_access
      add constraint user_project_access_project_id_fkey
      foreign key (project_id) references public.project(id) on delete restrict;
  end if;
end
$$;

create index if not exists user_project_access_user_id_idx
  on public.user_project_access (user_id);

create index if not exists user_project_access_project_id_idx
  on public.user_project_access (project_id);

create index if not exists user_project_access_active_idx
  on public.user_project_access (active);

create index if not exists user_project_access_project_active_user_idx
  on public.user_project_access (project_id, user_id)
  where active = true;

create or replace function public.set_user_project_access_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_user_project_access_updated_at
  on public.user_project_access;

create trigger set_user_project_access_updated_at
before update on public.user_project_access
for each row execute function public.set_user_project_access_updated_at();

-- Preserve every existing user exactly as-is and copy only its current legacy
-- relationship. Duplicate users/usernames are intentionally not merged.
insert into public.user_project_access (user_id, project_id, role, active)
select
  u.id,
  u.project_id,
  u.role,
  coalesce(u.is_active, true)
from public.users u
where u.project_id is not null
on conflict (user_id, project_id) do nothing;

create or replace function public.sync_legacy_user_project_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is not null then
    insert into public.user_project_access (user_id, project_id, role, active)
    values (new.id, new.project_id, new.role, coalesce(new.is_active, true))
    on conflict (user_id, project_id) do update
      set role = excluded.role,
          active = excluded.active,
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists sync_legacy_user_project_access on public.users;

create trigger sync_legacy_user_project_access
after insert or update of project_id, role, is_active on public.users
for each row execute function public.sync_legacy_user_project_access();

revoke all on function public.sync_legacy_user_project_access() from public, anon, authenticated;

alter table public.user_project_access enable row level security;

-- The mobile app uses custom legacy credentials rather than a Supabase Auth
-- identity. Direct Data API access to memberships is therefore denied; the
-- narrowly scoped authentication RPC below is the only public read path.
revoke all on table public.user_project_access from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.authenticate_user_projects_internal(
  p_username text,
  p_password text
)
returns table (
  user_id uuid,
  legacy_project_id uuid,
  user_name text,
  username text,
  phone text,
  membership_id uuid,
  project_id uuid,
  project_name text,
  license_number text,
  role text,
  project_active boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    u.id as user_id,
    u.project_id as legacy_project_id,
    u.name as user_name,
    u.username,
    u.phone,
    access.id as membership_id,
    p.id as project_id,
    p.name as project_name,
    p.license_number,
    access.role,
    coalesce(p.active, false) as project_active
  from public.users u
  left join public.user_project_access access
    on access.user_id = u.id
   and access.active = true
  left join public.project p
    on p.id = access.project_id
   and p.active = true
  where u.username = trim(p_username)
    and u.password_hash = p_password
    and coalesce(u.is_active, true) = true
  order by p.name nulls last, p.id;
$$;

revoke all on function private.authenticate_user_projects_internal(text, text) from public;
grant execute on function private.authenticate_user_projects_internal(text, text) to anon, authenticated;

create or replace function public.authenticate_user_projects(
  p_username text,
  p_password text
)
returns table (
  user_id uuid,
  legacy_project_id uuid,
  user_name text,
  username text,
  phone text,
  membership_id uuid,
  project_id uuid,
  project_name text,
  license_number text,
  role text,
  project_active boolean
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.authenticate_user_projects_internal(p_username, p_password);
$$;

revoke all on function public.authenticate_user_projects(text, text) from public;
grant execute on function public.authenticate_user_projects(text, text) to anon, authenticated;

comment on table public.user_project_access is
  'Project-scoped membership and role for global application users.';

comment on function public.authenticate_user_projects(text, text) is
  'Validates legacy application credentials and returns active allowed projects only.';
