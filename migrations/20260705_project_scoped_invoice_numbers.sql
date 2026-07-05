-- Make invoice numbers unique per project instead of globally.
-- Safe guards:
--   * aborts if duplicates already exist inside the same project
--   * drops only the old global invoice_number unique constraint
--   * does not alter invoice_items
--   * does not change invoice totals or financial data

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE invoice_number IS NOT NULL
      AND invoice_number <> ''
    GROUP BY project_id, invoice_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create project-scoped invoice number uniqueness: duplicate invoice_number exists within the same project.';
  END IF;
END $$;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_project_invoice_number_key
  ON public.invoices(project_id, invoice_number);

COMMIT;
