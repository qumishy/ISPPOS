# Inventory And Reports

## Inventory Screens
Primary files:
- `src/screens/InventoryListScreen.js`
- `src/screens/InventoryScreen.js`
- `src/screens/BatchStockDetailScreen.js`
- `src/services/inventoryService.js`
- `src/screens/ReportsScreen.js`

## Batch Values
- `batch_total_value = category_value * batch_total_cards`.
- Use `total_cards`; fallback to `available_cards` only when old data has zero/missing total.
- Batch value must appear for every batch.

## Batch Sales
When user says "sales" for inventory batch, it means invoices/invoice_items, not collections.
- `total_sales = SUM(active invoice_items amount for this batch)`.
- Include only active invoices.
- Exclude inactive/soft-deleted/cancelled/rejected/deleted invoices and items.
- Respect `project_id`, `phase_id`, `batch_id`, `category_id`.
- Do not use stale counters.

## Batch Actual Collections
Collections are linked at invoice level, not batch level. If an invoice contains items from multiple batches, do not assign the full collection to every batch.
Correct allocation:
`batch_collection = collection.amount * (batch_items_total / invoice_items_total)`

Rules:
- Include only active collections.
- Exclude deleted/rejected/cancelled/inactive collections.
- Exclude collections linked to deleted/inactive invoices.
- Avoid duplicate joins.
- `total_collections` should not exceed active `total_sales` unless data is truly invalid. Do not rely on capping as the main fix; find the cause.

## Distribution / Batch Movement Report
There was a separate UI/business definition in the distribution report: row value labeled as collection/due may be expected as:
`category_value * sold_quantity`
The header total must equal the sum of visible row values. Do not mix this with actual cash collections unless the screen explicitly represents actual collections.

## Reports Screen
`ReportsScreen.js` is SQLite-first. Do not convert reports to Supabase reads. If slow:
- Optimize SQL.
- Add targeted indexes.
- Use pagination/lazy loading.
- Reduce JS post-processing.
- Cache safely.

## Inventory Delete Rules
- Batch soft-delete may be allowed when distributed count is zero and no active wallet stock remains.
- Historical soft-deleted sales must not block deletion.
- Active distributed/sold data should block deletion.
- Soft-deleted batches disappear from inventory and dashboard totals.
