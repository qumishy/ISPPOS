CREATE OR REPLACE FUNCTION public.create_admin_wallet_distribution_atomic(p_wallet jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_wallet_id uuid := NULLIF(p_wallet->>'id', '')::uuid;
  v_project_id uuid := NULLIF(p_wallet->>'project_id', '')::uuid;
  v_phase_id uuid := NULLIF(p_wallet->>'phase_id', '')::uuid;
  v_agent_id uuid := NULLIF(p_wallet->>'agent_id', '')::uuid;
  v_batch_id uuid := NULLIF(p_wallet->>'batch_id', '')::uuid;
  v_category_id uuid := NULLIF(p_wallet->>'category_id', '')::uuid;
  v_issued_by uuid := NULLIF(p_wallet->>'issued_by', '')::uuid;
  v_total_cards integer := COALESCE(NULLIF(p_wallet->>'total_cards', '')::integer, 0);
  v_created_at timestamptz := COALESCE(NULLIF(p_wallet->>'created_at', '')::timestamptz, now());
  v_issuer_role text;
  v_batch public.batches%ROWTYPE;
  v_wallet public.agent_wallets%ROWTYPE;
BEGIN
  IF v_wallet_id IS NULL OR v_project_id IS NULL OR v_agent_id IS NULL
     OR v_batch_id IS NULL OR v_category_id IS NULL OR v_issued_by IS NULL
     OR v_total_cards <= 0 THEN
    RAISE EXCEPTION 'invalid admin wallet distribution payload';
  END IF;

  SELECT u.role
    INTO v_issuer_role
  FROM public.users u
  WHERE u.id = v_issued_by
    AND u.project_id = v_project_id
    AND COALESCE(u.is_active, true) = true;

  IF COALESCE(v_issuer_role, '') NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'issuer is not an active admin or manager';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = v_agent_id
      AND u.project_id = v_project_id
      AND u.role = 'agent'
      AND COALESCE(u.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'target agent is invalid';
  END IF;

  IF v_phase_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.phases p
    WHERE p.id = v_phase_id
      AND p.project_id = v_project_id
      AND COALESCE(p.status, 'active') <> 'closed'
  ) THEN
    RAISE EXCEPTION 'target phase is invalid or closed';
  END IF;

  SELECT b.*
    INTO v_batch
  FROM public.batches b
  WHERE b.id = v_batch_id
    AND b.project_id = v_project_id
    AND b.category_id = v_category_id
    AND COALESCE(b.active, true) = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch is invalid for this project and category';
  END IF;

  IF COALESCE(v_batch.available_cards, 0) < v_total_cards THEN
    RAISE EXCEPTION 'insufficient batch inventory';
  END IF;

  INSERT INTO public.agent_wallets (
    id, project_id, phase_id, agent_id, batch_id, category_id,
    total_cards, sold_cards, issued_by, notes, created_at
  ) VALUES (
    v_wallet_id,
    v_project_id,
    v_phase_id,
    v_agent_id,
    v_batch_id,
    v_category_id,
    v_total_cards,
    0,
    v_issued_by,
    COALESCE(p_wallet->>'notes', ''),
    v_created_at
  )
  RETURNING * INTO v_wallet;

  UPDATE public.batches
  SET available_cards = available_cards - v_total_cards
  WHERE id = v_batch_id
    AND project_id = v_project_id
    AND available_cards >= v_total_cards
  RETURNING * INTO v_batch;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch inventory changed before distribution completed';
  END IF;

  RETURN jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'batch', to_jsonb(v_batch)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_wallet_distribution_atomic(jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_wallet_distribution_atomic(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.create_admin_wallet_distribution_atomic(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
