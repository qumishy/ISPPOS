-- Temporary compatibility contract for APKs released before multi-project login.
--
-- Those clients authenticate with the legacy anon key and read these tables
-- directly through PostgREST. Keep this migration read-only: it deliberately
-- grants no INSERT, UPDATE, DELETE, or access to user_project_access.

grant usage on schema public to anon, authenticated;
grant select on table public.users to anon, authenticated;
grant select on table public.project to anon, authenticated;
grant select on table public.phases to anon, authenticated;
grant select on table public.app_permissions to anon, authenticated;

alter table public.users enable row level security;
alter table public.project enable row level security;
alter table public.phases enable row level security;
alter table public.app_permissions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'legacy_apk_active_users_select'
  ) then
    create policy legacy_apk_active_users_select
      on public.users
      for select
      to anon, authenticated
      using (is_active is true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project'
      and policyname = 'legacy_apk_active_projects_select'
  ) then
    create policy legacy_apk_active_projects_select
      on public.project
      for select
      to anon, authenticated
      using (active is true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'phases'
      and policyname = 'legacy_apk_project_phases_select'
  ) then
    create policy legacy_apk_project_phases_select
      on public.phases
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_permissions'
      and policyname = 'legacy_apk_permissions_select'
  ) then
    create policy legacy_apk_permissions_select
      on public.app_permissions
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

comment on policy legacy_apk_active_users_select on public.users is
  'TEMPORARY: legacy APK direct-login SELECT. Remove after all supported installs use authenticate_user_projects.';

comment on policy legacy_apk_active_projects_select on public.project is
  'TEMPORARY: legacy APK license/project SELECT. Remove after all supported installs use authenticated project discovery.';

comment on policy legacy_apk_project_phases_select on public.phases is
  'TEMPORARY: legacy APK initial/historical phase reads. Client queries remain project-scoped.';

comment on policy legacy_apk_permissions_select on public.app_permissions is
  'TEMPORARY: legacy APK permission synchronization reads. Client queries remain project-scoped.';
