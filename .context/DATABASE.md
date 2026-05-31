# Database

Local SQLite schema is created/migrated in `src/services/dbCore.js`. Supabase schema is mirrored for sync, but screens query SQLite.

## Core Tables
- `project`: project/license metadata.
- `phases`: operational periods with `status` (`active`, `closed`, planning values may exist), `project_id`, `closed_at`.
- `users`: app users with `role`, `project_id`, active flag.
- `users.push_token` exists locally for push notification routing and sync parity.
- `pos_customers`: POS/customer records, credit limits, assigned agents.
- `card_categories`: card product categories/prices.
- `batches`: inventory batches; has `project_id`, `phase_id`, soft-delete fields.
- `agent_wallets`: stock assigned to agents per batch/category.
- `invoices`: invoice header, total/net/paid/approved amounts, discount workflow fields, `project_id`, `phase_id`, soft-delete fields.
- `invoice_items`: invoice lines by batch/category/wallet.
- `collections`: payments against invoices, status `pending`/`approved`/`rejected`, `project_id`, `phase_id`, `supply_id`.
- `supplies`: cashier/admin supply records for approved collections.
- `sync_queue`: outgoing local mutations.
- `operations_log`: audit/pending/general operation log.
- `app_notifications`: in-app notification inbox.
- `invoice_notifications_log`: dedupe log for invoice notifications, including overdue.
- `app_permissions`: per-role/user screen permission overrides.
- `invoice_discount_approvals`: audit log for discount decisions.

## Relationships
- Project -> phases/users/POS/categories/batches/invoices/collections/wallets/supplies.
- Phase -> batches/invoices/collections/wallets/supplies.
- Invoice -> invoice_items and collections.
- Collection -> invoice, optional supply.
- Agent wallet -> agent, batch, category.
- Batch -> invoice_items and agent_wallets.

## Important Rules
- Active rows must respect `active`, `is_deleted`, and `deleted_at`.
- Soft-deleted invoices/batches/categories/users must be excluded from business calculations.
- Local soft-delete fields can exist in SQLite but must not be sent to Supabase unless the remote schema supports them.
- Invoice amount basis: use approved-discount `net_amount`; otherwise use `total_amount`.
- Active collections for payment: pending + approved; exclude rejected/cancelled/canceled/deleted/inactive.
- Approved collections only drive invoice approval status.

## Status Rules
- Payment status: `pending`/معلقة when active collected amount is zero, `partial`/مسددة جزئياً when collected amount is less than invoice amount, `paid`/مسددة when collected amount covers invoice amount.
- Approval status: `unapproved`/غير معتمدة when approved amount is zero, `approval_partial`/معتمد جزئي when approved amount is less than invoice amount, `approved`/معتمدة when approved amount covers invoice amount.
- Pending collections may make payment status partial/paid, but approval status remains based only on approved collections.
