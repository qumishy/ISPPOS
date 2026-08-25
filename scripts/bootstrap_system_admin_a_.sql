-- ════════════════════════════════════════════════════════════════════════
-- BOOTSTRAP: promote existing active user "a_" to SYSTEM_ADMIN
-- Target: ISPPOS Supabase project ybpzjvswutvdbjevgawt
--
-- Safety contract:
--   * Aborts unless the username matches EXACTLY ONE active user.
--   * Shows the selected user BEFORE applying the change.
--   * Changes ONLY public.users.role (+ updated_at timestamp).
--   * Password, username, project_id, user_project_access memberships,
--     invoices, collections, wallets, inventory and sync_queue are untouched.
--   * The patched sync_legacy_user_project_access trigger will NOT mirror
--     'SYSTEM_ADMIN' into user_project_access.
--
-- Pre-check performed on 2026-08-25: username matched exactly 1 active user
-- (id 7a114d00-bd28-4281-8e0f-79cc0b241c73, role was 'admin').
-- ════════════════════════════════════════════════════════════════════════

begin;

-- 1) Guard: abort if the username does not match exactly one active user
do $$
declare
  v_matches integer;
begin
  select count(*) into v_matches
  from public.users
  where username = trim('a_')
    and coalesce(is_active, true) = true;

  if v_matches <> 1 then
    raise exception 'Bootstrap aborted: username must match exactly one active user (found %).', v_matches;
  end if;
end
$$;

-- 2) Show the selected user BEFORE applying the change
select id, username, role, project_id, is_active
from public.users
where username = trim('a_')
  and coalesce(is_active, true) = true;

-- 3) Promote (only the global role column; users has no updated_at column)
update public.users
set role = 'SYSTEM_ADMIN'
where username = trim('a_')
  and coalesce(is_active, true) = true;

-- 4) Verification query AFTER the update (expected: role = 'SYSTEM_ADMIN')
select id, username, role, project_id, is_active, created_at
from public.users
where username = trim('a_');

-- 5) If the verification row shows role = 'SYSTEM_ADMIN', commit.
--    If anything looks wrong, run: rollback;
commit;

-- Optional post-commit cross-checks (read-only):
--   Membership count must be unchanged:
--   select count(*) from public.user_project_access
--    where user_id = (select id from public.users where username = 'a_');
