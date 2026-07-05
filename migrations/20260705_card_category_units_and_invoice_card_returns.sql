-- Card category unit fields and invoice card return approval workflow.
-- Safe additive migration:
--   * does not delete data
--   * does not modify invoice_items
--   * does not reduce invoices.total_amount or invoices.net_amount
--   * only backfills card category unit defaults required by the feature

BEGIN;

ALTER TABLE public.card_categories
  ADD COLUMN IF NOT EXISTS card_value numeric NOT NULL DEFAULT 0;

ALTER TABLE public.card_categories
  ADD COLUMN IF NOT EXISTS cards_per_sheet integer NOT NULL DEFAULT 1;

UPDATE public.card_categories
SET cards_per_sheet = 1
WHERE COALESCE(cards_per_sheet, 0) < 1;

UPDATE public.card_categories
SET card_value = COALESCE(NULLIF(card_value, 0), price, 0)
WHERE COALESCE(card_value, 0) <= 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.collections'::regclass
      AND conname = 'collections_status_check'
  ) THEN
    ALTER TABLE public.collections DROP CONSTRAINT collections_status_check;
  END IF;

  ALTER TABLE public.collections
    ADD CONSTRAINT collections_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'pending_card_return_approval')) NOT VALID;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'card_categories_card_value_nonnegative'
  ) THEN
    ALTER TABLE public.card_categories
      ADD CONSTRAINT card_categories_card_value_nonnegative CHECK (card_value >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'card_categories_cards_per_sheet_positive'
  ) THEN
    ALTER TABLE public.card_categories
      ADD CONSTRAINT card_categories_cards_per_sheet_positive CHECK (cards_per_sheet >= 1) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.invoice_card_returns (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.project(id) ON DELETE RESTRICT,
  phase_id uuid REFERENCES public.phases(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  collection_id uuid REFERENCES public.collections(id) ON DELETE SET NULL,
  invoice_item_id uuid REFERENCES public.invoice_items(id) ON DELETE SET NULL,
  category_id uuid NOT NULL REFERENCES public.card_categories(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  wallet_id uuid REFERENCES public.agent_wallets(id) ON DELETE SET NULL,
  returned_cards_count integer NOT NULL DEFAULT 0,
  card_value numeric NOT NULL DEFAULT 0,
  return_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  approval_notes text,
  rejection_notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE public.invoice_card_returns
  ALTER COLUMN card_value SET DEFAULT 0,
  ALTER COLUMN return_amount SET DEFAULT 0,
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.invoice_card_returns
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS rejection_notes text,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_card_returns_count_nonnegative'
  ) THEN
    ALTER TABLE public.invoice_card_returns
      ADD CONSTRAINT invoice_card_returns_count_nonnegative CHECK (returned_cards_count >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_card_returns_card_value_nonnegative'
  ) THEN
    ALTER TABLE public.invoice_card_returns
      ADD CONSTRAINT invoice_card_returns_card_value_nonnegative CHECK (card_value >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_card_returns_amount_nonnegative'
  ) THEN
    ALTER TABLE public.invoice_card_returns
      ADD CONSTRAINT invoice_card_returns_amount_nonnegative CHECK (return_amount >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_card_returns_amount_matches'
  ) THEN
    ALTER TABLE public.invoice_card_returns
      ADD CONSTRAINT invoice_card_returns_amount_matches CHECK (return_amount = returned_cards_count * card_value) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_card_returns_status_valid'
  ) THEN
    ALTER TABLE public.invoice_card_returns
      ADD CONSTRAINT invoice_card_returns_status_valid CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_project_id
  ON public.invoice_card_returns(project_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_phase_id
  ON public.invoice_card_returns(phase_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_invoice_id
  ON public.invoice_card_returns(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_collection_id
  ON public.invoice_card_returns(collection_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_status
  ON public.invoice_card_returns(status);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_active
  ON public.invoice_card_returns(active);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_invoice_item_id
  ON public.invoice_card_returns(invoice_item_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_category_id
  ON public.invoice_card_returns(category_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_project_invoice_approved
  ON public.invoice_card_returns(project_id, invoice_id, status, active)
  WHERE status = 'approved' AND active = true;

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_project_pending
  ON public.invoice_card_returns(project_id, phase_id, status, active, created_at)
  WHERE status = 'pending' AND active = true;

DO $$
BEGIN
  IF to_regclass('public.app_permissions') IS NOT NULL
     AND to_regclass('public.project') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'app_permissions'
         AND column_name IN ('id', 'project_id', 'entity_type', 'entity_id', 'screen_name', 'can_view', 'can_add', 'can_edit', 'can_delete')
       GROUP BY table_schema, table_name
       HAVING COUNT(DISTINCT column_name) = 9
     ) THEN
    INSERT INTO public.app_permissions
      (id, project_id, entity_type, entity_id, screen_name, can_view, can_add, can_edit, can_delete, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      p.id,
      'ROLE',
      'admin',
      'approve_card_returns',
      true,
      true,
      true,
      true,
      now(),
      now()
    FROM public.project p
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.app_permissions ap
      WHERE ap.project_id = p.id
        AND ap.entity_type = 'ROLE'
        AND ap.entity_id = 'admin'
        AND ap.screen_name = 'approve_card_returns'
    );
  END IF;
END $$;

COMMIT;
