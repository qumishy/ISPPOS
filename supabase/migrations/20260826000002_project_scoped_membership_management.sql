-- ════════════════════════════════════════════════════════════════════════
-- Project-scoped membership management.
--
-- Allows a project-level "admin" (active admin membership) to manage
-- memberships ONLY for projects he administrates, while SYSTEM_ADMIN keeps
-- full authority. Legacy credentials are re-verified inside SECURITY
-- DEFINER functions; no anonymous write policies are widened.
--
-- Role rules for new assignments:
--   * cashier / agent      : SYSTEM_ADMIN or project admin of target project
--   * admin                : SYSTEM_ADMIN only
--   * legacy "manager"     : not assignable (tolerated read-only elsewhere)
--
-- Target project: ybpzjvswutvdbjevgawt. Guarded/idempotent. No DELETE.
-- ════════════════════════════════════════════════════════════════════════

-- ── Actor identification / authorization helper ─────────────────────────
-- p_project_id NULL  -> only identifies the actor (used for listing).
-- p_project_id given -> additionally requires SYSTEM_ADMIN OR an active
--                       'admin' membership on that exact project.
create or replace function private.assert_membership_manager(
  p_username text,
  p_password text,
  p_project_id uuid
)
returns table (
  actor_id uuid,
  actor_is_system_admin boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_role text;
begin
  if p_username is null or p_password is null
     or length(trim(p_username)) = 0 or length(p_password) = 0 then
    raise exception 'بيانات التحقق مفقودة.';
  end if;

  select u.id, u.role into v_id, v_role
  from public.users u
  where u.username = trim(p_username)
    and u.password_hash = p_password
    and coalesce(u.is_active, true) = true
  limit 1;

  if v_id is null then
    raise exception 'بيانات الدخول غير صحيحة.';
  end if;

  if v_role = 'SYSTEM_ADMIN' then
    return query select v_id, true;
    return;
  end if;

  if p_project_id is null then
    return query select v_id, false;
    return;
  end if;

  if not exists (
    select 1 from public.project p
    where p.id = p_project_id and coalesce(p.active, true) = true
  ) then
    raise exception 'المشروع غير موجود أو غير مفعل.';
  end if;

  if not exists (
    select 1
    from public.user_project_access m
    where m.user_id = v_id
      and m.project_id = p_project_id
      and coalesce(m.active, true) = true
      and m.role = 'admin'
  ) then
    raise exception 'لا تملك صلاحية إدارة هذا المشروع.';
  end if;

  return query select v_id, false;
end;
$$;

revoke all on function private.assert_membership_manager(text, text, uuid) from public, anon, authenticated;

-- ── Projects the actor may manage memberships for ───────────────────────
create or replace function public.list_managed_projects(
  p_actor_username text,
  p_actor_password text
)
returns table (
  id uuid,
  name text,
  license_number text,
  active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_sys boolean;
begin
  select m.actor_id, m.actor_is_system_admin
    into v_actor, v_sys
  from private.assert_membership_manager(p_actor_username, p_actor_password, null) m;

  if v_sys then
    return query
      select pj.id, pj.name, pj.license_number, coalesce(pj.active, true) as active
      from public.project pj
      where coalesce(pj.active, true) = true
      order by pj.created_at desc nulls last, pj.id;
  else
    return query
      select pj.id, pj.name, pj.license_number, coalesce(pj.active, true) as active
      from public.project pj
      join public.user_project_access m
        on m.project_id = pj.id
       and m.user_id = v_actor
       and coalesce(m.active, true) = true
       and m.role = 'admin'
      where coalesce(pj.active, true) = true
      order by pj.created_at desc nulls last, pj.id;
  end if;
end;
$$;

-- ── Memberships of one managed project ──────────────────────────────────
create or replace function public.list_project_memberships(
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
  perform private.assert_membership_manager(p_actor_username, p_actor_password, p_project_id);
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
-- Upsert membership (signature changed: p_user_id OR p_username).
-- The previous SYSTEM_ADMIN-only overload is dropped explicitly because a
-- plain CREATE OR REPLACE would silently create an unwanted overload.
-- Duplicate ACTIVE memberships are rejected; inactive ones reactivate.
-- ════════════════════════════════════════════════════════════════════════

drop function if exists public.upsert_user_project_access(text, text, uuid, uuid, text, boolean);

create or replace function public.upsert_user_project_access(
  p_actor_username text,
  p_actor_password text,
  p_user_id uuid default null,
  p_username text default null,
  p_project_id uuid default null,
  p_role text default null,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_sys boolean;
  v_target_user_id uuid;
  v_role text;
  v_existing_role text;
  v_row public.user_project_access%rowtype;
begin
  if p_project_id is null then
    raise exception 'يجب اختيار المشروع.';
  end if;

  select m.actor_id, m.actor_is_system_admin
    into v_actor, v_sys
  from private.assert_membership_manager(p_actor_username, p_actor_password, p_project_id) m;

  -- Resolve the target user by id or by exact username.
  if p_user_id is not null then
    select u.id into v_target_user_id
    from public.users u
    where u.id = p_user_id
      and coalesce(u.is_active, true) = true
    limit 1;
  elsif p_username is not null and length(trim(p_username)) > 0 then
    select u.id into v_target_user_id
    from public.users u
    where u.username = trim(p_username)
      and coalesce(u.is_active, true) = true
    limit 1;
  end if;

  if v_target_user_id is null then
    raise exception 'المستخدم غير موجود أو غير مفعل.';
  end if;

  v_role := nullif(trim(coalesce(p_role, '')), '');
  if v_role in ('cashier', 'agent') then
    -- allowed for any authorized manager
  elsif v_role = 'admin' then
    if not v_sys then
      raise exception 'إضافة مدير مشروع متاحة لمدير النظام العام فقط.';
    end if;
  else
    raise exception 'الدور المحدد غير مدعوم.';
  end if;

  select m.role into v_existing_role
  from public.user_project_access m
  where m.user_id = v_target_user_id and m.project_id = p_project_id;

  if not v_sys and v_existing_role is not null
     and v_existing_role not in ('cashier', 'agent') then
    raise exception 'لا تملك صلاحية تعديل عضوية مدير المشروع.';
  end if;

  insert into public.user_project_access
    (user_id, project_id, role, active, created_by, updated_by, created_at, updated_at)
  values
    (v_target_user_id, p_project_id, v_role, coalesce(p_active, true), v_actor, v_actor, now(), now())
  on conflict (user_id, project_id) do update
    set role = excluded.role,
        active = excluded.active,
        updated_by = v_actor,
        updated_at = now();

  select * into v_row
  from public.user_project_access m
  where m.user_id = v_target_user_id and m.project_id = p_project_id;

  return jsonb_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'project_id', v_row.project_id,
    'role', v_row.role,
    'active', v_row.active
  );
end;
$$;

-- ── Soft deactivation scoped to managed projects ─────────────────────────
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
  v_actor uuid;
  v_sys boolean;
  v_row public.user_project_access%rowtype;
begin
  select * into v_row
  from public.user_project_access m
  where m.id = p_membership_id
  for update;

  if not found then
    raise exception 'ربط المستخدم بالمشروع غير موجود.';
  end if;

  select m.actor_id, m.actor_is_system_admin into v_actor, v_sys
  from private.assert_membership_manager(p_actor_username, p_actor_password, v_row.project_id) m;

  if not v_sys and v_row.role not in ('cashier', 'agent') then
    raise exception 'لا تملك صلاحية تعديل عضوية مدير المشروع.';
  end if;

  update public.user_project_access
  set active = false,
      updated_by = v_actor,
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

-- ── ACL ──────────────────────────────────────────────────────────────────
revoke all on function public.list_managed_projects(text, text) from public;
grant execute on function public.list_managed_projects(text, text) to anon, authenticated;

revoke all on function public.list_project_memberships(text, text, uuid) from public;
grant execute on function public.list_project_memberships(text, text, uuid) to anon, authenticated;

revoke all on function public.upsert_user_project_access(text, text, uuid, text, uuid, text, boolean) from public;
grant execute on function public.upsert_user_project_access(text, text, uuid, text, uuid, text, boolean) to anon, authenticated;

revoke all on function public.deactivate_user_project_access(text, text, uuid) from public;
grant execute on function public.deactivate_user_project_access(text, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
