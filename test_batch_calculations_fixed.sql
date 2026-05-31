-- Test script to verify fixed batch financial calculations
-- Run this in your SQLite database to test the calculations

-- Test 1: Calculate total sales for a batch (fixed version)
-- This should sum all active invoice_items linked to this batch
SELECT
  ii.batch_id,
  SUM(COALESCE(ii.quantity, 0) * COALESCE(ii.unit_price, COALESCE(c.price, 0))) as total_sales,
  COUNT(*) as item_count
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
LEFT JOIN card_categories c ON c.id = ii.category_id
WHERE
  ii.batch_id = 'your-batch-id-here'
  AND COALESCE(i.is_deleted, 0) = 0
  AND i.deleted_at IS NULL
  AND (i.active = 1 OR i.active IS NULL OR i.active = 'true')
  AND LOWER(COALESCE(i.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')
  AND COALESCE(ii.is_deleted, 0) = 0
  AND ii.deleted_at IS NULL
  AND (ii.active = 1 OR ii.active IS NULL OR ii.active = 'true')
GROUP BY ii.batch_id;

-- Test 2: Calculate total collections with proper proportional allocation (fixed version)
WITH batch_invoices AS (
  SELECT DISTINCT i.id as invoice_id
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  WHERE
    ii.batch_id = 'your-batch-id-here'
    AND COALESCE(i.is_deleted, 0) = 0
    AND i.deleted_at IS NULL
    AND (i.active = 1 OR i.active IS NULL OR i.active = 'true')
    AND LOWER(COALESCE(i.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')
    AND COALESCE(ii.is_deleted, 0) = 0
    AND ii.deleted_at IS NULL
    AND (ii.active = 1 OR ii.active IS NULL OR ii.active = 'true')
),
invoice_totals AS (
  SELECT
    i.id as invoice_id,
    i.invoice_number,
    SUM(COALESCE(ii.quantity, 0) * COALESCE(ii.unit_price, COALESCE(c.price, 0))) as invoice_total_value,
    SUM(COALESCE(ii.quantity, 0)) as invoice_total_qty
  FROM invoices i
  JOIN invoice_items ii ON i.id = ii.invoice_id
  LEFT JOIN card_categories c ON c.id = ii.category_id
  WHERE
    i.id IN (SELECT invoice_id FROM batch_invoices)
    AND COALESCE(i.is_deleted, 0) = 0
    AND i.deleted_at IS NULL
    AND (i.active = 1 OR i.active IS NULL OR i.active = 'true')
    AND LOWER(COALESCE(i.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')
    AND COALESCE(ii.is_deleted, 0) = 0
    AND ii.deleted_at IS NULL
    AND (ii.active = 1 OR ii.active IS NULL OR ii.active = 'true')
  GROUP BY i.id, i.invoice_number
),
batch_totals AS (
  SELECT
    i.id as invoice_id,
    i.invoice_number,
    SUM(COALESCE(ii.quantity, 0) * COALESCE(ii.unit_price, COALESCE(c.price, 0))) as batch_value,
    SUM(COALESCE(ii.quantity, 0)) as batch_qty
  FROM invoices i
  JOIN invoice_items ii ON i.id = ii.invoice_id
  LEFT JOIN card_categories c ON c.id = ii.category_id
  WHERE
    ii.batch_id = 'your-batch-id-here'
    AND i.id IN (SELECT invoice_id FROM batch_invoices)
    AND COALESCE(i.is_deleted, 0) = 0
    AND i.deleted_at IS NULL
    AND (i.active = 1 OR i.active IS NULL OR i.active = 'true')
    AND LOWER(COALESCE(i.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')
    AND COALESCE(ii.is_deleted, 0) = 0
    AND ii.deleted_at IS NULL
    AND (ii.active = 1 OR ii.active IS NULL OR ii.active = 'true')
  GROUP BY i.id, i.invoice_number
),
collections_data AS (
  SELECT
    col.id,
    col.invoice_id,
    col.amount,
    i.invoice_number
  FROM collections col
  JOIN invoices i ON i.id = col.invoice_id
  WHERE
    col.active = 1
    AND (col.status = 'approved' OR col.status IS NULL)
    AND COALESCE(col.is_deleted, 0) = 0
    AND col.deleted_at IS NULL
    AND (col.active = 1 OR col.active IS NULL OR col.active = 'true')
    AND LOWER(COALESCE(col.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')
    AND i.id IN (SELECT invoice_id FROM batch_invoices)
)
SELECT
  it.invoice_number,
  it.invoice_total_value,
  bt.batch_value,
  bt.batch_qty,
  cd.amount,
  CASE
    WHEN it.invoice_total_value > 0 THEN cd.amount * (bt.batch_value / it.invoice_total_value)
    ELSE 0
  END as allocated_collection,
  CASE
    WHEN it.invoice_total_value > 0 THEN cd.amount * (bt.batch_value / it.invoice_total_value)
    ELSE 0
  END as batch_collection,
  cd.id as collection_id
FROM invoice_totals it
LEFT JOIN batch_totals bt ON bt.invoice_id = it.invoice_id
LEFT JOIN collections_data cd ON cd.invoice_id = it.invoice_id
ORDER BY it.invoice_number, cd.created_at DESC;