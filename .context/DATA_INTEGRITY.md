# Data Integrity Findings And Repair Policy

Supabase data integrity audit found serious issues. Do not run repair SQL until root-cause analysis is complete and explicit approval is given.

## Critical Audit Findings
- 28 invoices without `invoice_items`.
- 16 active invoices have non-zero `total_amount` but zero items.
- Phantom active invoice value around 1,447,000.
- 36 `invoice_items` have `batch_id = NULL`.
- 27 `invoice_items` have `wallet_id = NULL`.
- 8 `invoice_items` reference non-existent wallets.
- 73 `invoice_items` belong to inactive invoices.
- Duplicate invoice groups exist from retry/sync failure storms.
- 1 inactive collection references a non-existent invoice.

## Healthy Findings
- No true invoice_items without parent invoice.
- `project_id` consistency between invoices and items is good.
- Phase scoping via invoice is consistent.
- Batch/category chain is intact when wallet and batch exist.
- 264 fully-linked items had consistent Invoice -> Item -> Wallet -> Batch -> Category.

## Safe Repair Candidates After Approval
High-confidence repairs only:
1. Backfill `invoice_items.batch_id` from `agent_wallets.batch_id` where item has valid wallet and missing batch.
2. Nullify `invoice_items.wallet_id` when wallet id references a non-existent wallet but item has valid batch/category.
3. Mark inactive empty invoices as `cancelled` if already `active=false` and no items.
4. Nullify inactive orphan collection invoice_id only if referenced invoice truly does not exist.

## Repairs To Avoid Until Deeper Audit
- Do not cancel active empty invoices until checking source device SQLite, `sync_queue`, and operations logs. Items may still be pending upload.
- Do not auto-repair items missing both wallet_id and batch_id. Correct batch is ambiguous.
- Do not adjust wallet `sold_cards` counters until reconciling active invoice_items vs inactive history.
- Do not delete invoice_items on inactive invoices without business approval; they may be audit history.

## Required Deep Audit Before Repair
Trace:
- `src/screens/NewInvoiceScreen.js`
- `src/services/invoiceService.js`
- `src/services/SyncService.js`
- `src/services/dbCore.js`
- `src/services/operationLogger.js`

Questions:
- How can invoice headers sync without items?
- Are invoice and items queued separately?
- Can the sync timer push invoice before `addInvoiceItem()` completes?
- Are retries creating new invoice_numbers instead of resuming the same local operation?
- Are inactive duplicates being excluded consistently from calculations?

## Policy
Data integrity is more important than preserving corrupted values. However, no UPDATE/DELETE should run without backup, preview SELECT, transaction, and approval.
