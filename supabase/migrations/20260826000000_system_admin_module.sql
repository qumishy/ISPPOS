-- ════════════════════════════════════════════════════════════════════════
-- System Administration module — top-level SYSTEM_ADMIN role.
--
-- Apply MANUALLY to the ISPPOS Supabase project (ybpzjvswutvdbjevgawt).
-- Guarded and idempotent. Safe to re-run.
--
-- Guarantees:
--   * No DELETE grants anywhere (soft deactivate/close only).
--   * No new broad RLS policies; existing policies untouched.
--   * Every mutation verifies the actor is an active SYSTEM_ADMIN via
--     legacy credentials inside SECURITY DEFINER functions
--     (same trust model as authenticate_user_projects).
--   * list_system_users never returns password_hash or push_token.
--   * Legacy login compatibility, users.project_id/role columns,
--     user_project_access backfill trigger behavior are preserved;
--     the trigger only learns to skip mirroring the global SYSTEM_ADMIN
--     role into project memberships.
-- ════════════════════════════════════════════════════════════════════════

-- ── Optional guarded column additions ───────────────────────────────────
alter table public.project add column if not exists notes text;

alter table public.user_project_access add column if not exists created_by uuid;
alter table public.user_project_access add column if not exists updated_by uuid;

-- ── Legacy backfill trigger: keep previous semantics, but never mirror
--    the global SYSTEM_ADMIN role into project memberships. ─────────────
create or replace function public.sync_legacy_user_project_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is not null and coalesce(new.role, '') <> 'SYSTEM_ADMIN' then
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

-- ── Private actor verification helper ───────────────────────────────────
create or replace function private.assert_system_admin(
  p_username text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
begin
  if p_username is null or p_password is null
     or length(trim(p_username)) = 0 or length(p_password) = 0 then
    raise exception 'بيانات التحقق من مدير النظام العام مفقودة.';
  end if;

  select u.id into v_actor_id
  from public.users u
  where u.username = trim(p_username)
    and u.password_hash = p_password
    and u.role = 'SYSTEM_ADMIN'
    and coalesce(u.is_active, true) = true
  limit 1;

  if v_actor_id is null then
    raise exception 'لا تملك صلاحية الوصول إلى إدارة النظام.';
  end if;

  return v_actor_id;
end;
$$;

revoke all on function private.assert_system_admin(text, text) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- Read-only listing RPCs (include inactive rows for administration UIs)
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.list_system_projects(
  p_actor_username text,
  p_actor_password text
)
returns table (
  id uuid,
  name text,
  license_number text,
  owner_name text,
  owner_phone text,
  active boolean,
  notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_system_admin(p_actor_username, p_actor_password);
  return query
    select p.id,
           p.name,
           p.license_number,
           p.owner_name,
           p.owner_phone,
           coalesce(p.active, true) as active,
           p.notes,
           p.created_at
    from public.project p
    order by p.created_at desc nulls last, p.id;
end;
$$;

create or replace function public.list_system_users(
  p_actor_username text,
  p_actor_password text
)
returns table (
  id uuid,
  name text,
  username text,
  phone text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_system_admin(p_actor_username, p_actor_password);
  return query
    select u.id,
           u.name,
           u.username,
           u.phone,
           u.role,
           coalesce(u.is_active, true) as is_active,
           u.created_at
    from public.users u
    order by coalesce(u.name, '') asc, u.id;
end;
$$;

create or replace function public.list_system_phases(
  p_actor_username text,
  p_actor_password text,
  p_project_id uuid
)
returns table (
  id uuid,
  project_id uuid,
  name text,
  description text,
  start_date text,
  end_date text,
  status text,
  created_by uuid,
  created_at timestamptz,
  closed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_system_admin(p_actor_username, p_actor_password);
  return query
    select ph.id,
           ph.project_id,
           ph.name,
           ph.description,
           ph.start_date::text as start_date,
           ph.end_date::text as end_date,
           coalesce(ph.status, 'active') as status,
           ph.created_by,
           ph.created_at,
           ph.closed_at
    from public.phases ph
    where ph.project_id = p_project_id
    order by ph.created_at desc nulls last, ph.id;
end;
$$;

create or replace function public.list_system_memberships(
  p_actor_username text,
  p_actor_password text,
  p_project_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  username text,
  project_id uuid,
  project_name text,
  role text,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_system_admin(p_actor_username, p_actor_password);
  return query
    select m.id,
           m.user_id,
           u.name as user_name,
           u.username,
           m.project_id,
           pj.name as project_name,
           m.role,
           coalesce(m.active, true) as active,
           m.created_at,
           m.updated_at
    from public.user_project_access m
    join public.users u on u.id = m.user_id
    join public.project pj on pj.id = m.project_id
    where m.project_id = p_project_id
    order by coalesce(u.name, '') asc, m.id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Project mutations
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.create_system_project(
  p_actor_username text,
  p_actor_password text,
  p_name text,
  p_license_number text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.project%rowtype;
  v_name text;
  v_license text;
begin
  perform private.assert_system_admin(p_actor_username, p_actor_password);

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'اسم المشروع مطلوب.';
  end if;

  v_license := nullif(trim(coalesce(p_license_number, '')), '');
  if v_license is not null and exists (
    select 1 from public.project x where x.license_number = v_license
  ) then
    raise exception 'رقم الترخيص مستخدم بالفعل في مشروع آخر.';
  end if;

  insert into public.project (name, license_number, notes, active, created_at)
  values (v_name, v_license, p_notes, true, now())
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_system_project(
  p_actor_username text,
  p_actor_password text,
  p_project_id uuid,
  p_name text,
  p_license_number text default null,
  p_notes text default null,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.project%rowtype;
  v_name text;
  v_license text;
begin
  perform private.assert_system_admin(p_actor_username, p_actor_password);

  select * into v_row
  from public.project p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'المشروع غير موجود.';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'اسم المشروع مطلوب.';
  end if;

  v_license := nullif(trim(coalesce(p_license_number, '')), '');
  if v_license is not null and exists (
    select 1 from public.project x
    where x.license_number = v_license and x.id <> p_project_id
  ) then
    raise exception 'رقم الترخيص مستخدم بالفعل في مشروع آخر.';
  end if;

  update public.project
  set name = v_name,
      license_number = v_license,
      notes = p_notes,
      active = coalesce(p_active, true)
  where id = p_project_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Phase mutations (one active phase per project preserved; close only)
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.create_system_phase(
  p_actor_username text,
  p_actor_password text,
  p_project_id uuid,
  p_name text,
  p_start_date text default null,
  p_end_date text default null,
  p_description text default '',
  p_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_row public.phases%rowtype;
  v_name text;
  v_status text;
begin
  v_actor_id := private.assert_system_admin(p_actor_username, p_actor_password);

  if p_project_id is null then
    raise exception 'لا يمكن إنشاء مرحلة بدون مشروع.';
  end if;

  if not exists (
    select 1 from public.project pj
    where pj.id = p_project_id and coalesce(pj.active, true) = true
  ) then
    raise exception 'المشروع غير موجود أو غير مفعل.';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'اسم المرحلة مطلوب.';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'active');
  if v_status not in ('active', 'closed') then
    raise exception 'حالة المرحلة غير صالحة.';
  end if;

  if v_status = 'active' and exists (
    select 1 from public.phases ph
    where ph.project_id = p_project_id and coalesce(ph.status, 'active') = 'active'
  ) then
    raise exception 'لا يمكن إنشاء مرحلة جديدة قبل إغلاق المرحلة الحالية.';
  end if;

  -- Date columns are written through quoted literals so Postgres coerces
  -- them correctly whether the underlying column type is date or text.
  execute format(
    'insert into public.phases
       (project_id, name, description, start_date, end_date,
        status, created_by, created_at, closed_at)
     values (%L, %L, %L, %L, %L, %L, %L, now(), %L)
     returning *',
    p_project_id,
    v_name,
    coalesce(p_description, ''),
    nullif(trim(coalesce(p_start_date, '')), ''),
    nullif(trim(coalesce(p_end_date, '')), ''),
    v_status,
    v_actor_id,
    case when v_status = 'closed' then now() else null end
  ) into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_system_phase(
  p_actor_username text,
  p_actor_password text,
  p_phase_id uuid,
  p_name text,
  p_start_date text default null,
  p_end_date text default null,
  p_description text default null,
  p_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.phases%rowtype;
  v_name text;
  v_status text;
begin
  perform private.assert_system_admin(p_actor_username, p_actor_password);

  select * into v_row
  from public.phases ph
  where ph.id = p_phase_id
  for update;

  if not found then
    raise exception 'المرحلة غير موجودة.';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'اسم المرحلة مطلوب.';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'active');
  if v_status not in ('active', 'closed') then
    raise exception 'حالة المرحلة غير صالحة.';
  end if;

  if v_status = 'active'
     and coalesce(v_row.status, 'active') <> 'active'
     and exists (
       select 1 from public.phases other
       where other.project_id = v_row.project_id
         and other.id <> v_row.id
         and coalesce(other.status, 'active') = 'active'
     ) then
    raise exception 'لا يمكن تفعيل هذه المرحلة لوجود مرحلة نشطة حالياً في المشروع.';
  end if;

  execute format(
    'update public.phases
     set name = %L,
         description = coalesce(%L, description),
         start_date = %L,
         end_date = %L,
         status = %L,
         closed_at = case
           when %L = ''closed'' then coalesce(closed_at, now())
           else null
         end
     where id = %L
     returning *',
    v_name,
    p_description,
    nullif(trim(coalesce(p_start_date, '')), ''),
    nullif(trim(coalesce(p_end_date, '')), ''),
    v_status,
    v_status,
    p_phase_id
  ) into v_row;

  return to_jsonb(v_row);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- User mutations (username immutable; empty password keeps existing;
-- soft deactivate only; responses never include password_hash)
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.create_system_user(
  p_actor_username text,
  p_actor_password text,
  p_name text,
  p_username text,
  p_password text,
  p_phone text default '',
  p_role text default 'agent'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.users%rowtype;
  v_name text;
  v_username text;
  v_role text;
begin
  perform private.assert_system_admin(p_actor_username, p_actor_password);

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'الاسم الكامل مطلوب.';
  end if;

  v_username := trim(coalesce(p_username, ''));
  if v_username = '' then
    raise exception 'اسم المستخدم مطلوب.';
  end if;

  if coalesce(p_password, '') = '' then
    raise exception 'كلمة المرور مطلوبة.';
  end if;

  if exists (select 1 from public.users x where x.username = v_username) then
    raise exception 'اسم المستخدم مستخدم بالفعل.';
  end if;

  v_role := coalesce(nullif(trim(p_role), ''), 'agent');
  if v_role not in ('admin', 'cashier', 'agent') then
    raise exception 'الدور المحدد غير مدعوم.';
  end if;

  insert into public.users (project_id, name, username, password_hash, role, phone, is_active, created_at)
  values (null, v_name, v_username, p_password, v_role, coalesce(p_phone, ''), true, now())
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'username', v_row.username,
    'phone', v_row.phone,
    'role', v_row.role,
    'is_active', v_row.is_active,
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.update_system_user(
  p_actor_username text,
  p_actor_password text,
  p_user_id uuid,
  p_name text,
  p_phone text default '',
  p_is_active boolean default true,
  p_new_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.users%rowtype;
  v_name text;
begin
  perform private.assert_system_admin(p_actor_username, p_actor_password);

  select * into v_row
  from public.users u
  where u.id = p_user_id
  for update;

  if not found then
    raise exception 'المستخدم غير موجود.';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'الاسم الكامل مطلوب.';
  end if;

  -- username, role, project_id and legacy bindings are intentionally immutable here
  -- NOTE: users has no updated_at column in this project (see
  -- 20260826000001_system_admin_module_users_timestamp_fix.sql).
  update public.users as u
  set name = v_name,
      phone = coalesce(p_phone, ''),
      is_active = coalesce(p_is_active, true),
      password_hash = case when coalesce(p_new_password, '') = '' then u.password_hash else p_new_password end
  where u.id = p_user_id
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'username', v_row.username,
    'phone', v_row.phone,
    'role', v_row.role,
    'is_active', v_row.is_active,
    'created_at', v_row.created_at
  );
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Membership mutations (canonical roles only; upsert prevents duplicates)
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.upsert_user_project_access(
  p_actor_username text,
  p_actor_password text,
  p_user_id uuid,
  p_project_id uuid,
  p_role text,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_row public.user_project_access%rowtype;
  v_role text;
begin
  v_actor_id := private.assert_system_admin(p_actor_username, p_actor_password);

  if p_user_id is null then
    raise exception 'يجب اختيار المستخدم.';
  end if;
  if p_project_id is null then
    raise exception 'يجب اختيار المشروع.';
  end if;

  if not exists (
    select 1 from public.users u
    where u.id = p_user_id and coalesce(u.is_active, true) = true
  ) then
    raise exception 'المستخدم غير موجود أو غير مفعل.';
  end if;

  if not exists (
    select 1 from public.project pj
    where pj.id = p_project_id and coalesce(pj.active, true) = true
  ) then
    raise exception 'المشروع غير موجود أو غير مفعل.';
  end if;

  v_role := nullif(trim(coalesce(p_role, '')), '');
  if v_role not in ('admin', 'cashier', 'agent') then
    raise exception 'الدور المحدد غير مدعوم.';
  end if;

  insert into public.user_project_access (user_id, project_id, role, active, created_by, updated_by, created_at, updated_at)
  values (p_user_id, p_project_id, v_role, coalesce(p_active, true), v_actor_id, v_actor_id, now(), now())
  on conflict (user_id, project_id) do update
    set role = excluded.role,
        active = excluded.active,
        updated_by = v_actor_id,
        updated_at = now();

  select * into v_row
  from public.user_project_access m
  where m.user_id = p_user_id and m.project_id = p_project_id;

  return jsonb_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'project_id', v_row.project_id,
    'role', v_row.role,
    'active', v_row.active
  );
end;
$$;

create or replace function public.deactivate_user_project_access(
  p_actor_username text,
  p_actor_password text,
  p_membership_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_row public.user_project_access%rowtype;
begin
  v_actor_id := private.assert_system_admin(p_actor_username, p_actor_password);

  select * into v_row
  from public.user_project_access m
  where m.id = p_membership_id
  for update;

  if not found then
    raise exception 'ربط المستخدم بالمشروع غير موجود.';
  end if;

  update public.user_project_access
  set active = false,
      updated_by = v_actor_id,
      updated_at = now()
  where id = p_membership_id
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'project_id', v_row.project_id,
    'role', v_row.role,
    'active', v_row.active
  );
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Login integration: expose the user's GLOBAL role (users.role) alongside
-- memberships. Additive column only — existing clients ignore it.
-- ════════════════════════════════════════════════════════════════════════

-- Return type changed (global_role added): Postgres requires an explicit
-- drop before replacing functions defined by OUT parameters. Both drops and
-- recreations run inside this single migration transaction.
drop function if exists public.authenticate_user_projects(text, text);
drop function if exists private.authenticate_user_projects_internal(text, text);

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
  project_active boolean,
  global_role text
)
language sql
security definer
set search_path = ''
as $$  select
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
    coalesce(p.active, false) as project_active,
    u.role as global_role
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
  project_active boolean,
  global_role text
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

-- ── ACL: app reaches admin RPCs through the anon key only ───────────────
revoke all on function public.list_system_projects(text, text) from public;
grant execute on function public.list_system_projects(text, text) to anon, authenticated;

revoke all on function public.list_system_users(text, text) from public;
grant execute on function public.list_system_users(text, text) to anon, authenticated;

revoke all on function public.list_system_phases(text, text, uuid) from public;
grant execute on function public.list_system_phases(text, text, uuid) to anon, authenticated;

revoke all on function public.list_system_memberships(text, text, uuid) from public;
grant execute on function public.list_system_memberships(text, text, uuid) to anon, authenticated;

revoke all on function public.create_system_project(text, text, text, text, text) from public;
grant execute on function public.create_system_project(text, text, text, text, text) to anon, authenticated;

revoke all on function public.update_system_project(text, text, uuid, text, text, text, boolean) from public;
grant execute on function public.update_system_project(text, text, uuid, text, text, text, boolean) to anon, authenticated;

revoke all on function public.create_system_phase(text, text, uuid, text, text, text, text, text) from public;
grant execute on function public.create_system_phase(text, text, uuid, text, text, text, text, text) to anon, authenticated;

revoke all on function public.update_system_phase(text, text, uuid, text, text, text, text, text) from public;
grant execute on function public.update_system_phase(text, text, uuid, text, text, text, text, text) to anon, authenticated;

revoke all on function public.create_system_user(text, text, text, text, text, text, text) from public;
grant execute on function public.create_system_user(text, text, text, text, text, text, text) to anon, authenticated;

revoke all on function public.update_system_user(text, text, uuid, text, text, boolean, text) from public;
grant execute on function public.update_system_user(text, text, uuid, text, text, boolean, text) to anon, authenticated;

revoke all on function public.upsert_user_project_access(text, text, uuid, uuid, text, boolean) from public;
grant execute on function public.upsert_user_project_access(text, text, uuid, uuid, text, boolean) to anon, authenticated;

revoke all on function public.deactivate_user_project_access(text, text, uuid) from public;
grant execute on function public.deactivate_user_project_access(text, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
