-- Atomic remote sync for invoice creation bundles.
-- Deploy this to Supabase before using app versions that call
-- public.upsert_invoice_bundle_atomic().
--
-- Fixes:
-- - Casts JSON text UUIDs to uuid before comparing/inserting.
-- - Keeps invoice + items + wallet counters atomic.
-- - Recalculates wallet sold_cards from active non-cancelled invoice_items.

CREATE OR REPLACE FUNCTION public.upsert_invoice_bundle_atomic(
  p_invoice jsonb,
  p_invoice_items jsonb,
  p_wallet_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_project_id uuid;
  v_phase_id uuid;
  v_item_count integer;
  v_wallet_update_count integer;
  v_wallet_count integer;
  v_existing_item_count integer;
  v_existing_diff_count integer;
  v_wallet record;
  v_rows integer;
  v_sold_cards integer;
  v_items_total numeric;
BEGIN
  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object' THEN
    RAISE EXCEPTION 'p_invoice is required';
  END IF;

  IF p_invoice_items IS NULL OR jsonb_typeof(p_invoice_items) <> 'array' THEN
    RAISE EXCEPTION 'p_invoice_items must be a non-empty array';
  END IF;

  IF p_wallet_updates IS NULL OR jsonb_typeof(p_wallet_updates) <> 'array' THEN
    RAISE EXCEPTION 'p_wallet_updates must be an array';
  END IF;

  v_invoice_id := NULLIF(p_invoice->>'id', '')::uuid;
  v_project_id := NULLIF(p_invoice->>'project_id', '')::uuid;
  v_phase_id := NULLIF(p_invoice->>'phase_id', '')::uuid;
  v_item_count := COALESCE(jsonb_array_length(p_invoice_items), 0);
  v_wallet_update_count := COALESCE(jsonb_array_length(p_wallet_updates), 0);

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice id is required';
  END IF;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;

  IF v_item_count <= 0 THEN
    RAISE EXCEPTION 'invoice_items are required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_invoice_items) AS x(
      id text,
      invoice_id text,
      project_id text,
      category_id text,
      batch_id text,
      wallet_id text,
      quantity integer,
      unit_price numeric,
      total_price numeric
    )
    WHERE NULLIF(x.id, '') IS NULL
       OR NULLIF(x.invoice_id, '')::uuid IS DISTINCT FROM v_invoice_id
       OR NULLIF(x.project_id, '')::uuid IS DISTINCT FROM v_project_id
       OR NULLIF(x.category_id, '') IS NULL
       OR NULLIF(x.batch_id, '') IS NULL
       OR COALESCE(x.quantity, 0) <= 0
       OR COALESCE(x.unit_price, -1) < 0
       OR (
            x.total_price IS NOT NULL
        AND ABS(COALESCE(x.total_price, 0) - (COALESCE(x.quantity, 0) * COALESCE(x.unit_price, 0))) > 0.01
       )
  ) THEN
    RAISE EXCEPTION 'invalid invoice_items: id, invoice_id, project_id, category_id, batch_id, quantity, unit_price, and total_price are invalid';
  END IF;

  SELECT COALESCE(SUM(x.quantity * x.unit_price), 0)
    INTO v_items_total
  FROM jsonb_to_recordset(p_invoice_items) AS x(quantity integer, unit_price numeric);

  IF ABS(COALESCE(NULLIF(p_invoice->>'total_amount', '')::numeric, 0) - v_items_total) > 0.01 THEN
    RAISE EXCEPTION 'invoice total_amount does not match invoice_items total';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_invoice_items) AS x(id text)
    GROUP BY x.id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate invoice_item ids in incoming bundle';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_invoice_items) AS x(category_id text)
    LEFT JOIN public.card_categories c
      ON c.id = NULLIF(x.category_id, '')::uuid
     AND c.project_id = v_project_id
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'invoice item category_id does not exist in this project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_invoice_items) AS x(batch_id text, category_id text)
    LEFT JOIN public.batches b
      ON b.id = NULLIF(x.batch_id, '')::uuid
     AND b.project_id = v_project_id
    WHERE b.id IS NULL
       OR b.category_id IS DISTINCT FROM NULLIF(x.category_id, '')::uuid
       OR (
            v_phase_id IS NOT NULL
        AND NULLIF(to_jsonb(b)->>'phase_id', '') IS NOT NULL
        AND NULLIF(to_jsonb(b)->>'phase_id', '')::uuid IS DISTINCT FROM v_phase_id
       )
  ) THEN
    RAISE EXCEPTION 'invoice item batch_id does not exist in this project/phase or does not match category_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_invoice_items) AS x(wallet_id text)
    LEFT JOIN public.agent_wallets aw
      ON aw.id = NULLIF(x.wallet_id, '')::uuid
     AND aw.project_id = v_project_id
    WHERE NULLIF(x.wallet_id, '') IS NOT NULL
      AND aw.id IS NULL
  ) THEN
    RAISE EXCEPTION 'invoice item wallet_id does not exist in this project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_invoice_items) AS x(batch_id text, category_id text, wallet_id text)
    JOIN public.agent_wallets aw
      ON aw.id = NULLIF(x.wallet_id, '')::uuid
     AND aw.project_id = v_project_id
    WHERE NULLIF(x.wallet_id, '') IS NOT NULL
      AND (
        aw.batch_id IS DISTINCT FROM NULLIF(x.batch_id, '')::uuid
        OR aw.category_id IS DISTINCT FROM NULLIF(x.category_id, '')::uuid
      )
  ) THEN
    RAISE EXCEPTION 'invoice item wallet does not match batch/category';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_invoice_items) AS x(wallet_id text)
    JOIN public.agent_wallets aw
      ON aw.id = NULLIF(x.wallet_id, '')::uuid
     AND aw.project_id = v_project_id
    WHERE NULLIF(x.wallet_id, '') IS NOT NULL
      AND v_phase_id IS NOT NULL
      AND NULLIF(to_jsonb(aw)->>'phase_id', '') IS NOT NULL
      AND NULLIF(to_jsonb(aw)->>'phase_id', '')::uuid IS DISTINCT FROM v_phase_id
  ) THEN
    RAISE EXCEPTION 'invoice item wallet does not belong to invoice phase';
  END IF;

  SELECT COUNT(DISTINCT NULLIF(wallet_id, '')::uuid)
    INTO v_wallet_count
  FROM jsonb_to_recordset(p_invoice_items) AS x(wallet_id text)
  WHERE NULLIF(wallet_id, '') IS NOT NULL;

  IF v_wallet_count > 0 AND v_wallet_update_count <= 0 THEN
    RAISE EXCEPTION 'wallet updates are required for invoice items with wallet_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT NULLIF(wallet_id, '')::uuid AS wallet_id
      FROM jsonb_to_recordset(p_invoice_items) AS x(wallet_id text)
      WHERE NULLIF(wallet_id, '') IS NOT NULL
    ) iw
    LEFT JOIN (
      SELECT DISTINCT NULLIF(id, '')::uuid AS id
      FROM jsonb_to_recordset(p_wallet_updates) AS x(id text, project_id text, sold_cards integer)
      WHERE NULLIF(x.project_id, '')::uuid = v_project_id
        AND COALESCE(x.sold_cards, -1) >= 0
    ) wu ON wu.id = iw.wallet_id
    WHERE wu.id IS NULL
  ) THEN
    RAISE EXCEPTION 'wallet update is missing for one or more invoice item wallets';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_wallet_updates) AS x(id text, project_id text, sold_cards integer)
    WHERE NULLIF(x.id, '') IS NULL
       OR NULLIF(x.project_id, '')::uuid IS DISTINCT FROM v_project_id
       OR COALESCE(x.sold_cards, -1) < 0
  ) THEN
    RAISE EXCEPTION 'wallet updates must include id, matching project_id, and non-negative sold_cards';
  END IF;

  SELECT COUNT(*)
    INTO v_existing_item_count
  FROM public.invoice_items
  WHERE invoice_id = v_invoice_id;

  IF v_existing_item_count > 0 AND v_existing_item_count <> v_item_count THEN
    RAISE EXCEPTION 'existing invoice item count differs from incoming bundle';
  END IF;

  IF v_existing_item_count > 0 THEN
    WITH incoming AS (
      SELECT
        NULLIF(x.id, '')::uuid AS id,
        NULLIF(x.project_id, '')::uuid AS project_id,
        NULLIF(x.invoice_id, '')::uuid AS invoice_id,
        NULLIF(x.category_id, '')::uuid AS category_id,
        NULLIF(x.batch_id, '')::uuid AS batch_id,
        NULLIF(x.wallet_id, '')::uuid AS wallet_id,
        x.quantity,
        x.unit_price
      FROM jsonb_to_recordset(p_invoice_items) AS x(
        id text,
        project_id text,
        invoice_id text,
        category_id text,
        batch_id text,
        wallet_id text,
        quantity integer,
        unit_price numeric
      )
    ),
    existing AS (
      SELECT *
      FROM public.invoice_items
      WHERE invoice_id = v_invoice_id
    )
    SELECT COUNT(*)
      INTO v_existing_diff_count
    FROM incoming inc
    FULL JOIN existing ii
      ON ii.id = inc.id
     AND ii.invoice_id = v_invoice_id
    WHERE ii.id IS NULL
       OR inc.id IS NULL
       OR ii.project_id IS DISTINCT FROM inc.project_id
       OR ii.invoice_id IS DISTINCT FROM inc.invoice_id
       OR ii.category_id IS DISTINCT FROM inc.category_id
       OR ii.batch_id IS DISTINCT FROM inc.batch_id
       OR ii.wallet_id IS DISTINCT FROM inc.wallet_id
       OR COALESCE(ii.quantity, 0) IS DISTINCT FROM COALESCE(inc.quantity, 0)
       OR COALESCE(ii.unit_price, 0) IS DISTINCT FROM COALESCE(inc.unit_price, 0);

    IF v_existing_diff_count > 0 THEN
      RAISE EXCEPTION 'existing invoice items differ from incoming bundle';
    END IF;
  END IF;

  INSERT INTO public.invoices (
    id, project_id, invoice_number, pos_id, agent_id, type,
    total_amount, net_amount, paid_amount, approved_amount, status,
    notes, invoice_date, due_date, approval_notes, active, phase_id,
    created_at, discount_requested_value, discount_applied_value,
    discount_status, discount_requested_reason, discount_requested_by,
    discount_approved_by, discount_approved_at
  )
  SELECT
    NULLIF(x.id, '')::uuid,
    NULLIF(x.project_id, '')::uuid,
    x.invoice_number,
    NULLIF(x.pos_id, '')::uuid,
    NULLIF(x.agent_id, '')::uuid,
    x.type,
    x.total_amount,
    x.net_amount,
    x.paid_amount,
    x.approved_amount,
    x.status,
    x.notes,
    x.invoice_date,
    x.due_date,
    x.approval_notes,
    COALESCE(x.active, true),
    NULLIF(x.phase_id, '')::uuid,
    x.created_at,
    x.discount_requested_value,
    x.discount_applied_value,
    x.discount_status,
    x.discount_requested_reason,
    NULLIF(x.discount_requested_by, '')::uuid,
    NULLIF(x.discount_approved_by, '')::uuid,
    x.discount_approved_at
  FROM jsonb_to_record(p_invoice) AS x(
    id text,
    project_id text,
    invoice_number text,
    pos_id text,
    agent_id text,
    type text,
    total_amount numeric,
    net_amount numeric,
    paid_amount numeric,
    approved_amount numeric,
    status text,
    notes text,
    invoice_date date,
    due_date date,
    approval_notes text,
    active boolean,
    phase_id text,
    created_at timestamptz,
    discount_requested_value numeric,
    discount_applied_value numeric,
    discount_status text,
    discount_requested_reason text,
    discount_requested_by text,
    discount_approved_by text,
    discount_approved_at timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    project_id = EXCLUDED.project_id,
    invoice_number = EXCLUDED.invoice_number,
    pos_id = EXCLUDED.pos_id,
    agent_id = EXCLUDED.agent_id,
    type = EXCLUDED.type,
    total_amount = EXCLUDED.total_amount,
    net_amount = EXCLUDED.net_amount,
    paid_amount = EXCLUDED.paid_amount,
    approved_amount = EXCLUDED.approved_amount,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    invoice_date = EXCLUDED.invoice_date,
    due_date = EXCLUDED.due_date,
    approval_notes = EXCLUDED.approval_notes,
    active = EXCLUDED.active,
    phase_id = EXCLUDED.phase_id,
    discount_requested_value = EXCLUDED.discount_requested_value,
    discount_applied_value = EXCLUDED.discount_applied_value,
    discount_status = EXCLUDED.discount_status,
    discount_requested_reason = EXCLUDED.discount_requested_reason,
    discount_requested_by = EXCLUDED.discount_requested_by,
    discount_approved_by = EXCLUDED.discount_approved_by,
    discount_approved_at = EXCLUDED.discount_approved_at;

  INSERT INTO public.invoice_items (
    id, project_id, invoice_id, category_id, batch_id, wallet_id,
    quantity, unit_price, created_at
  )
  SELECT
    NULLIF(x.id, '')::uuid,
    NULLIF(x.project_id, '')::uuid,
    NULLIF(x.invoice_id, '')::uuid,
    NULLIF(x.category_id, '')::uuid,
    NULLIF(x.batch_id, '')::uuid,
    NULLIF(x.wallet_id, '')::uuid,
    x.quantity,
    x.unit_price,
    x.created_at
  FROM jsonb_to_recordset(p_invoice_items) AS x(
    id text,
    project_id text,
    invoice_id text,
    category_id text,
    batch_id text,
    wallet_id text,
    quantity integer,
    unit_price numeric,
    total_price numeric,
    created_at timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    project_id = EXCLUDED.project_id,
    invoice_id = EXCLUDED.invoice_id,
    category_id = EXCLUDED.category_id,
    batch_id = EXCLUDED.batch_id,
    wallet_id = EXCLUDED.wallet_id,
    quantity = EXCLUDED.quantity,
    unit_price = EXCLUDED.unit_price,
    created_at = EXCLUDED.created_at;

  FOR v_wallet IN
    SELECT DISTINCT
      NULLIF(x.id, '')::uuid AS id,
      NULLIF(x.project_id, '')::uuid AS project_id,
      NULLIF(x.phase_id, '')::uuid AS phase_id
    FROM jsonb_to_recordset(p_wallet_updates) AS x(
      id text,
      project_id text,
      phase_id text,
      sold_cards integer
    )
  LOOP
    PERFORM 1
    FROM public.agent_wallets aw
    WHERE aw.id = v_wallet.id
      AND aw.project_id = v_wallet.project_id
      AND (
           v_wallet.phase_id IS NULL
        OR NULLIF(to_jsonb(aw)->>'phase_id', '') IS NULL
        OR NULLIF(to_jsonb(aw)->>'phase_id', '')::uuid IS NOT DISTINCT FROM v_wallet.phase_id
      )
    FOR UPDATE;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'wallet lock failed for wallet %', v_wallet.id;
    END IF;

    SELECT COALESCE(SUM(ABS(ii.quantity)), 0)::integer
      INTO v_sold_cards
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE ii.wallet_id = v_wallet.id
      AND i.project_id = v_project_id
      AND COALESCE(i.active, true) = true
      AND COALESCE(i.status, 'pending') NOT IN ('cancelled', 'canceled', 'rejected', 'deleted');

    UPDATE public.agent_wallets aw
    SET sold_cards = v_sold_cards
    WHERE aw.id = v_wallet.id
      AND aw.project_id = v_wallet.project_id
      AND COALESCE(aw.total_cards, 0) >= v_sold_cards
      AND (
           v_wallet.phase_id IS NULL
        OR NULLIF(to_jsonb(aw)->>'phase_id', '') IS NULL
        OR NULLIF(to_jsonb(aw)->>'phase_id', '')::uuid IS NOT DISTINCT FROM v_wallet.phase_id
      );

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'wallet update failed for wallet %', v_wallet.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'project_id', v_project_id,
    'phase_id', v_phase_id,
    'invoice_items', v_item_count,
    'wallet_updates', v_wallet_update_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_invoice_bundle_atomic(jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_invoice_bundle_atomic(jsonb, jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_invoice_bundle_atomic(jsonb, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
