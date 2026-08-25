-- ════════════════════════════════════════════════════════════════════════
-- Fixes for system_admin_module discovered during live application:
--
--   1) users has NO updated_at column → create_system_user /
--      update_system_user recreated without it.
--   2) users.role is guarded by users_role_check which did not include
--      'SYSTEM_ADMIN' → whitelist widened additively.
--
-- Both steps are guarded/idempotent. No existing rows are modified.
-- Target project: ybpzjvswutvdbjevgawt
-- ════════════════════════════════════════════════════════════════════════

-- ── Fix 1: users.updated_at does not exist in this project ──────────────

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

revoke all on function public.create_system_user(text, text, text, text, text, text, text) from public;
grant execute on function public.create_system_user(text, text, text, text, text, text, text) to anon, authenticated;

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
  -- NOTE: users has no updated_at column in this project.
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

revoke all on function public.update_system_user(text, text, uuid, text, text, boolean, text) from public;
grant execute on function public.update_system_user(text, text, uuid, text, text, boolean, text) to anon, authenticated;

-- ── Fix 2: widen users_role_check with the SYSTEM_ADMIN value ───────────

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'users_role_check'
      and conrelid = 'public.users'::regclass
      and pg_get_constraintdef(oid) not like '%SYSTEM_ADMIN%'
  ) then
    alter table public.users drop constraint users_role_check;
    alter table public.users add constraint users_role_check
      check (role = ANY (ARRAY[
        'admin'::text,
        'agent'::text,
        'cashier'::text,
        'viewer'::text,
        'SYSTEM_ADMIN'::text
      ]));
  end if;
end
$$;

notify pgrst, 'reload schema';
