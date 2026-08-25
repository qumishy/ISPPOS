create or replace function private.active_project_role_for_user(
  p_user_id uuid,
  p_project_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select access.role
  from public.users u
  join public.user_project_access access
    on access.user_id = u.id
   and access.project_id = p_project_id
   and access.active = true
  join public.project p
    on p.id = access.project_id
   and p.active = true
  where u.id = p_user_id
    and coalesce(u.is_active, true) = true
  limit 1;
$$;

revoke all on function private.active_project_role_for_user(uuid, uuid) from public;
grant execute on function private.active_project_role_for_user(uuid, uuid) to anon, authenticated;

create or replace function public.create_admin_wallet_distribution_atomic(p_wallet jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_wallet_id uuid := nullif(p_wallet->>'id', '')::uuid;
  v_project_id uuid := nullif(p_wallet->>'project_id', '')::uuid;
  v_phase_id uuid := nullif(p_wallet->>'phase_id', '')::uuid;
  v_agent_id uuid := nullif(p_wallet->>'agent_id', '')::uuid;
  v_batch_id uuid := nullif(p_wallet->>'batch_id', '')::uuid;
  v_category_id uuid := nullif(p_wallet->>'category_id', '')::uuid;
  v_issued_by uuid := nullif(p_wallet->>'issued_by', '')::uuid;
  v_total_cards integer := coalesce(nullif(p_wallet->>'total_cards', '')::integer, 0);
  v_created_at timestamptz := coalesce(nullif(p_wallet->>'created_at', '')::timestamptz, now());
  v_issuer_role text;
  v_agent_role text;
  v_batch public.batches%rowtype;
  v_wallet public.agent_wallets%rowtype;
begin
  if v_wallet_id is null or v_project_id is null or v_agent_id is null
     or v_batch_id is null or v_category_id is null or v_issued_by is null
     or v_total_cards <= 0 then
    raise exception 'invalid admin wallet distribution payload';
  end if;

  v_issuer_role := private.active_project_role_for_user(v_issued_by, v_project_id);
  if coalesce(v_issuer_role, '') not in ('admin', 'manager') then
    raise exception 'issuer is not an active admin or manager';
  end if;

  v_agent_role := private.active_project_role_for_user(v_agent_id, v_project_id);
  if coalesce(v_agent_role, '') <> 'agent' then
    raise exception 'target agent is invalid';
  end if;

  if v_phase_id is not null and not exists (
    select 1
    from public.phases p
    where p.id = v_phase_id
      and p.project_id = v_project_id
      and coalesce(p.status, 'active') <> 'closed'
  ) then
    raise exception 'target phase is invalid or closed';
  end if;

  select b.*
    into v_batch
  from public.batches b
  where b.id = v_batch_id
    and b.project_id = v_project_id
    and b.category_id = v_category_id
    and coalesce(b.active, true) = true
  for update;

  if not found then
    raise exception 'batch is invalid for this project and category';
  end if;

  if coalesce(v_batch.available_cards, 0) < v_total_cards then
    raise exception 'insufficient batch inventory';
  end if;

  insert into public.agent_wallets (
    id, project_id, phase_id, agent_id, batch_id, category_id,
    total_cards, sold_cards, issued_by, notes, created_at
  ) values (
    v_wallet_id,
    v_project_id,
    v_phase_id,
    v_agent_id,
    v_batch_id,
    v_category_id,
    v_total_cards,
    0,
    v_issued_by,
    coalesce(p_wallet->>'notes', ''),
    v_created_at
  )
  returning * into v_wallet;

  update public.batches
  set available_cards = available_cards - v_total_cards
  where id = v_batch_id
    and project_id = v_project_id
    and available_cards >= v_total_cards
  returning * into v_batch;

  if not found then
    raise exception 'batch inventory changed before distribution completed';
  end if;

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'batch', to_jsonb(v_batch)
  );
end;
$$;

revoke all on function public.create_admin_wallet_distribution_atomic(jsonb) from public;
grant execute on function public.create_admin_wallet_distribution_atomic(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
