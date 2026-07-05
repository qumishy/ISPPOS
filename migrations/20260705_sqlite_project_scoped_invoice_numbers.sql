-- SQLite reference migration for project-scoped invoice numbers.
-- Guard for existing duplicate rows before applying this manually:
--
-- SELECT project_id, invoice_number, COUNT(*)
-- FROM invoices
-- WHERE invoice_number IS NOT NULL AND invoice_number != ''
-- GROUP BY project_id, invoice_number
-- HAVING COUNT(*) > 1;
--
-- If the query returns rows, stop and inspect before creating the index.

DROP INDEX IF EXISTS idx_invoices_invoice_number_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_project_invoice_number_unique
  ON invoices(project_id, invoice_number);
