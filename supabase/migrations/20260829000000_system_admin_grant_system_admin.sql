-- ════════════════════════════════════════════════════════════════════════
-- Grant SYSTEM_ADMIN role to eligible project admins.
--
-- Two RPCs:
--   list_system_admin_eligible_users  — eligible candidates for promotion
--   system_admin_grant_system_admin   — promotes an eligible user
--
-- Server-side guards:
--   * Actor must be an active SYSTEM_ADMIN (assert_system_admin)
--   * Target user must exist, be active, and not already SYSTEM_ADMIN
--   * Target user must hold at least one active 'admin' membership
--     in user_project_access
--   * Only users.role is modified; no password/membership/financial changes
-- ════════════════════════════════════════════════════════════════════════

-- ── List eligible users (active, have at least one active admin
--    membership, not already SYSTEM_ADMIN) ──────────────────────────────

create or replace function public.list_system_admin_eligible_users(
  p_actor_username text,
  p_actor_password text
)
returns table (
  id uuid,
  name text,
  username text,
  global_role text,
  phone text,
  is_active boolean,
  admin_projects jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_system_admin(p_actor_username, p_actor_password);

  return query
    select
      u.id,
      u.name,
      u.username,
      u.role,
      u.phone,
      coalesce(u.is_active, true) as is_active,
      (
        select jsonb_agg(jsonb_build_object(
          'project_id', upa.project_id,
          'project_name', p.name,
          'role', upa.role
        ))
        from public.user_project_access upa
        join public.project p on p.id = upa.project_id
        where upa.user_id = u.id
          and upa.role = 'admin'
          and coalesce(upa.active, true) = true
      ) as admin_projects,
      u.created_at
    from public.users u
    where coalesce(u.is_active, true) = true
      and u.role <> 'SYSTEM_ADMIN'
      and exists (
        select 1
        from public.user_project_access upa
        where upa.user_id = u.id
          and upa.role = 'admin'
          and coalesce(upa.active, true) = true
      )
    order by u.name;
end;
$$;

grant execute on function public.list_system_admin_eligible_users(text, text) to anon, authenticated;

-- ── Grant SYSTEM_ADMIN role to an eligible user ───────────────────────

create or replace function public.system_admin_grant_system_admin(
  p_actor_username text,
  p_actor_password text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_target record;
  v_has_admin_membership boolean;
begin
  -- 1. Verify the actor is an active SYSTEM_ADMIN
  v_actor_id := private.assert_system_admin(p_actor_username, p_actor_password);

  -- 2. Target user must exist and be active
  select
    u.id, u.name, u.username, u.role, u.is_active
  into v_target
  from public.users u
  where u.id = p_target_user_id;

  if v_target is null then
    raise exception 'المستخدم المحدد غير موجود.';
  end if;

  if coalesce(v_target.is_active, true) = false then
    raise exception 'لا يمكن منح صلاحية مدير النظام العام لمستخدم معطل.';
  end if;

  -- 3. Target must not already be SYSTEM_ADMIN
  if v_target.role = 'SYSTEM_ADMIN' then
    raise exception 'هذا المستخدم يحمل صلاحية مدير النظام العام بالفعل.';
  end if;

  -- 4. Target must have at least one active admin membership
  select exists(
    select 1
    from public.user_project_access upa
    where upa.user_id = p_target_user_id
      and upa.role = 'admin'
      and coalesce(upa.active, true) = true
  ) into v_has_admin_membership;

  if not v_has_admin_membership then
    raise exception 'لا يمكن منح صلاحية مدير النظام العام إلا لمدير مشروع نشط.';
  end if;

  -- 5. Perform the promotion — only users.role is touched
  update public.users
  set role = 'SYSTEM_ADMIN'
  where id = p_target_user_id;

  -- 6. Return the updated user info (no sensitive fields)
  return jsonb_build_object(
    'success', true,
    'user_id', v_target.id,
    'name', v_target.name,
    'username', v_target.username,
    'previous_role', v_target.role,
    'new_role', 'SYSTEM_ADMIN'
  );
end;
$$;

grant execute on function public.system_admin_grant_system_admin(text, text, uuid) to anon, authenticated;
