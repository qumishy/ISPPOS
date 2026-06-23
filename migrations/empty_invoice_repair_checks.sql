-- Read-only integrity checks for empty-invoice repair planning.
-- Do not run any INSERT/UPDATE/DELETE from this file.

-- 1. Active invoices without items
SELECT i.id, i.invoice_number, i.project_id, i.phase_id, i.agent_id, i.pos_id,
       i.total_amount, i.net_amount, i.status, i.active, i.created_at
FROM invoices i
LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
WHERE COALESCE(i.active, true) = true
  AND COALESCE(i.status, 'pending') NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')
GROUP BY i.id, i.invoice_number, i.project_id, i.phase_id, i.agent_id, i.pos_id,
         i.total_amount, i.net_amount, i.status, i.active, i.created_at
HAVING COUNT(ii.id) = 0
ORDER BY i.created_at;

-- 2. invoice_items without invoice
SELECT ii.*
FROM invoice_items ii
LEFT JOIN invoices i ON i.id = ii.invoice_id
WHERE i.id IS NULL;

-- 3. invoice_items without batch_id
SELECT *
FROM invoice_items
WHERE batch_id IS NULL OR batch_id = '';

-- 4. invoice_items without category_id
SELECT *
FROM invoice_items
WHERE category_id IS NULL OR category_id = '';

-- 5. invoice_items without wallet_id
SELECT *
FROM invoice_items
WHERE wallet_id IS NULL OR wallet_id = '';

-- 6. invoice_items where wallet/category/batch mismatch
SELECT ii.*
FROM invoice_items ii
JOIN agent_wallets aw ON aw.id = ii.wallet_id
WHERE aw.project_id IS DISTINCT FROM ii.project_id
   OR aw.batch_id IS DISTINCT FROM ii.batch_id
   OR aw.category_id IS DISTINCT FROM ii.category_id;

-- 7. wallet sold_cards mismatch against active invoice_items
WITH active_sold AS (
  SELECT ii.wallet_id,
         ii.project_id,
         COALESCE(SUM(ii.quantity), 0)::integer AS derived_sold_cards
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  WHERE ii.wallet_id IS NOT NULL
    AND ii.wallet_id <> ''
    AND COALESCE(i.active, true) = true
    AND COALESCE(i.status, 'pending') NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')
  GROUP BY ii.wallet_id, ii.project_id
)
SELECT aw.id AS wallet_id,
       aw.project_id,
       aw.total_cards,
       aw.sold_cards,
       COALESCE(s.derived_sold_cards, 0) AS derived_sold_cards,
       aw.sold_cards - COALESCE(s.derived_sold_cards, 0) AS difference
FROM agent_wallets aw
LEFT JOIN active_sold s
  ON s.wallet_id = aw.id
 AND s.project_id = aw.project_id
WHERE COALESCE(aw.sold_cards, 0) <> COALESCE(s.derived_sold_cards, 0);

-- 8. invoices where total_amount differs from SUM(invoice_items.quantity * invoice_items.unit_price)
WITH item_totals AS (
  SELECT invoice_id,
         COALESCE(SUM(quantity * unit_price), 0) AS items_total
  FROM invoice_items
  GROUP BY invoice_id
)
SELECT i.id, i.invoice_number, i.project_id, i.phase_id, i.total_amount,
       COALESCE(t.items_total, 0) AS items_total,
       i.total_amount - COALESCE(t.items_total, 0) AS difference
FROM invoices i
LEFT JOIN item_totals t ON t.invoice_id = i.id
WHERE ABS(COALESCE(i.total_amount, 0) - COALESCE(t.items_total, 0)) > 0.01
ORDER BY ABS(COALESCE(i.total_amount, 0) - COALESCE(t.items_total, 0)) DESC;

-- Repair template after approval only:
-- 1. Use migrations/audit_empty_invoices.js to generate a JSON report.
-- 2. Review repair_preview_commented.sql.
-- 3. Convert only approved HIGH_CONFIDENCE statements from comments into executable SQL.
-- 4. Wrap approved statements and wallet recalculation in one transaction.
-- 5. Never include AMBIGUOUS, UNRECOVERABLE, INSUFFICIENT_WALLET_STOCK, inactive, or high-risk rows without explicit separate approval.
