-- Enable RLS for invoice_card_returns without breaking offline-first sync.
-- Current app sync uses the Supabase anon/publishable key and app-level
-- project/license users, not Supabase Auth user/project mapping.
--
-- TODO: Replace these permissive sync policies with project-scoped RLS after
-- Supabase Auth users are explicitly mapped to public.users/project_id.

BEGIN;

ALTER TABLE public.invoice_card_returns ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.invoice_card_returns TO anon;
GRANT SELECT, INSERT, UPDATE ON public.invoice_card_returns TO authenticated;
GRANT ALL ON public.invoice_card_returns TO service_role;

DROP POLICY IF EXISTS "invoice_card_returns_select_sync" ON public.invoice_card_returns;
DROP POLICY IF EXISTS "invoice_card_returns_insert_sync" ON public.invoice_card_returns;
DROP POLICY IF EXISTS "invoice_card_returns_update_sync" ON public.invoice_card_returns;

CREATE POLICY "invoice_card_returns_select_sync"
ON public.invoice_card_returns
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "invoice_card_returns_insert_sync"
ON public.invoice_card_returns
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "invoice_card_returns_update_sync"
ON public.invoice_card_returns
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

COMMIT;
