# Database

Local SQLite schema is created/migrated in `src/services/dbCore.js`. Supabase has a similar but not identical schema. Always inspect schemas before assuming columns exist remotely.

## Core Tables
- `project`: project/license metadata.
- `phases`: operational stages; includes status/active/closed data and `project_id`.
- `users`: users with roles, `project_id`, active flag, and local `push_token` support.
- `pos_customers`: POS/customers, credit limits, assigned agents.
- `card_categories`: categories/prices.
- `batches`: inventory batches, category, project, phase, soft-delete/local fields.
- `agent_wallets`: papers assigned to agents per batch/category/project/phase.
- `invoices`: invoice header, totals, paid/approved values, discount workflow, project/phase.
- `invoice_items`: invoice lines; must link to invoice, category, preferably batch and wallet.
- `collections`: payments against invoices; status pending/approved/rejected; project/phase; optional supply link.
- `supplies`: supply/deposit records linked to collections.
- `sync_queue`: pending outgoing mutations.
- `operations_log`: pending/general operation history.
- `app_notifications`: local notification inbox.
- `invoice_notifications_log`: dedupe log for overdue and other invoice notifications.
- `app_permissions`: permission overrides.
- `invoice_discount_approvals`: discount decision audit.

## Relationship Rules
- Project -> users, phases, POS, categories, batches, wallets, invoices, collections, supplies, operations.
- Phase -> invoices, collections, batches/wallets/supplies when applicable.
- Invoice -> invoice_items + collections.
- Invoice item -> invoice + category + batch + wallet when available.
- Wallet -> user/agent + batch + category + project + phase.
- Batch -> category + project + phase.
- Collection -> invoice + optional supply.

## Local vs Remote Columns
SQLite may contain local-only fields that must not be sent to Supabase unless remote schema supports them. Common local-only fields:
- `synced`, `sync_status`, `pending_sync`, `pending_upload`, `local_id`, `local_only`.
- `is_deleted`, `deleted_at`, `deleted_by`, `delete_reason` when missing remotely.
- `notified_overdue`, `notified_overdue_warning`.
- Derived/cached values such as `remaining_cards` when not remote.

`SyncService.sanitizePayload(table, payload)` must whitelist/strip per table before Supabase insert/upsert/update.

## Status + Calculation Rules
- Active data excludes inactive/soft-deleted/cancelled/rejected/deleted records.
- Payment amount should include active pending + approved collections.
- Approval amount should include approved collections only.
- Invoice amount basis: approved discount `net_amount` when available, otherwise `total_amount`.
- Payment status:
  - `معلقة`: collected amount = 0.
  - `مسددة جزئياً`: collected > 0 and < invoice amount.
  - `مسددة`: collected >= invoice amount.
- Approval status:
  - `غير معتمدة`: approved = 0.
  - `معتمد جزئي`: approved > 0 and < invoice amount.
  - `معتمدة`: approved >= invoice amount.

## SQLite Indexes Added/Important
Targeted indexes were added for heavy paths:
- `sync_queue(project_id, attempts, created_at DESC)`.
- `invoices(project_id, phase_id, status, invoice_date DESC)`.
- `collections(project_id, phase_id, status, collection_date DESC)`.
- `batches(project_id, phase_id, created_at DESC)`.
- `collections(project_id, status, active, supply_id, collection_date DESC)`.
- `invoice_items(batch_id, invoice_id)`.
- `invoice_items(wallet_id, invoice_id)`.
- `agent_wallets(batch_id, phase_id, project_id)`.
- `agent_wallets(category_id, project_id)`.

Do not add indexes randomly; match real `WHERE/JOIN/ORDER BY/GROUP BY` patterns.
