-- Test script to verify batch financial calculations
-- Run this in your SQLite database to test the calculations

-- First, let's check the actual schema
SELECT 'batches' as table_name, sql FROM sqlite_master WHERE type='table' AND name='batches';
SELECT 'invoice_items' as table_name, sql FROM sqlite_master WHERE type='table' AND name='invoice_items';
SELECT 'invoices' as table_name, sql FROM sqlite_master WHERE type='table' AND name='invoices';
SELECT 'collections' as table_name, sql FROM sqlite_master WHERE type='table' AND name='collections';

-- Sample data for testing
-- Let's assume we have a batch with id = 'test-batch-id'

-- Test 1: Calculate total sales for a batch
-- This should sum all active invoice_items linked to this batch
SELECT
  ii.batch_id,
  SUM(COALESCE(ii.quantity, 0) * COALESCE(ii.unit_price, COALESCE(c.price, 0))) as total_sales,
  COUNT(*) as item_count
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
LEFT JOIN card_categories c ON c.id = ii.category_id
WHERE
  ii.batch_id = 'test-batch-id'
  AND COALESCE(i.is_deleted, 0) = 0
  AND i.deleted_at IS NULL
  AND (i.active = 1 OR i.active IS NULL OR i.active = 'true')
  AND LOWER(COALESCE(i.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')
  AND COALESCE(ii.is_deleted, 0) = 0
  AND ii.deleted_at IS NULL
  AND (ii.active = 1 OR ii.active IS NULL OR ii.active = 'true')
GROUP BY ii.batch_id;

-- Test 2: Calculate total collections for invoices containing items from this batch
-- This should sum collections for invoices that have items from this batch
WITH batch_invoices AS (
  SELECT DISTINCT i.id as invoice_id
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  WHERE
    ii.batch_id = 'test-batch-id'
    AND COALESCE(i.is_deleted, 0) = 0
    AND i.deleted_at IS NULL
    AND (i.active = 1 OR i.active IS NULL OR i.active = 'true')
    AND LOWER(COALESCE(i.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')
    AND COALESCE(ii.is_deleted, 0) = 0
    AND ii.deleted_at IS NULL
    AND (ii.active = 1 OR ii.active IS NULL OR ii.active = 'true')
)
SELECT
  col.id,
  col.invoice_id,
  col.amount,
  i.invoice_number,
  COUNT(*) as related_items,
  SUM(ii.quantity) as total_items_in_invoice
FROM collections col
JOIN batch_invoices bi ON bi.invoice_id = col.invoice_id
JOIN invoices i ON i.id = col.invoice_id
LEFT JOIN invoice_items ii ON ii.invoice_id = col.invoice_id
WHERE
  col.active = 1
  AND (col.status = 'approved' OR col.status IS NULL)
  AND COALESCE(col.is_deleted, 0) = 0
  AND col.deleted_at IS NULL
  AND (col.active = 1 OR col.active IS NULL OR col.active = 'true')
  AND LOWER(COALESCE(col.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')
GROUP BY col.id, col.invoice_id, col.amount, i.invoice_number
ORDER BY col.created_at DESC;

-- Test 3: For invoices with multiple batches, calculate the proportional allocation
WITH batch_invoices AS (
  SELECT DISTINCT i.id as invoice_id
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  WHERE
    ii.batch_id = 'test-batch-id'
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
    SUM(COALESCE(ii.quantity, 0) * COALESCE(ii.unit_price, COALESCE(c.price, 0))) as invoice_total,
    SUM(COALESCE(ii.quantity, 0)) as invoice_total_qty
  FROM invoices i
  JOIN invoice_items ii ON i.id = ii.invoice_id
  LEFT JOIN card_categories c ON c.id = ii.category_id
  WHERE
    COALESCE(i.is_deleted, 0) = 0
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
    SUM(COALESCE(ii.quantity, 0) * COALESCE(ii.unit_price, COALESCE(c.price, 0))) as batch_total,
    SUM(COALESCE(ii.quantity, 0)) as batch_qty
  FROM invoices i
  JOIN invoice_items ii ON i.id = ii.invoice_id
  LEFT JOIN card_categories c ON c.id = ii.category_id
  WHERE
    ii.batch_id = 'test-batch-id'
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
)
SELECT
  it.invoice_number,
  it.invoice_total,
  bt.batch_total,
  bt.batch_qty,
  cd.amount,
  CASE
    WHEN it.invoice_total > 0 THEN cd.amount * (bt.batch_total / it.invoice_total)
    ELSE 0
  END as allocated_collection,
  CASE
    WHEN it.invoice_total > 0 THEN (cd.amount * (bt.batch_total / it.invoice_total))
    ELSE 0
  END as batch_collection
FROM invoice_totals it
LEFT JOIN batch_totals bt ON bt.invoice_id = it.invoice_id
LEFT JOIN collections_data cd ON cd.invoice_id = it.invoice_id
ORDER BY it.invoice_number, cd.created_at DESC;