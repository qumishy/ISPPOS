# Data Model

## Sources Of Truth

The effective local schema is created and migrated by `src/services/dbCore.js`. Standalone SQL files under `migrations/` and `supabase/migrations/` record remote or targeted migration work but do not replace inspection of the runtime SQLite migration path.

SQLite and Supabase are similar, not identical. Remote payloads must be filtered through the table-specific logic in `SyncService.js`.

## Core Data Areas

- **Tenant and access:** `project`, `phases`, `users`, `app_permissions`
- **Customers and catalog:** `pos_customers`, `card_categories`
- **Inventory:** `batches`, `agent_wallets`
- **Sales:** `invoices`, `invoice_items`, `invoice_discount_approvals`
- **Returns:** `invoice_card_returns`
- **Payments:** `collections`, `supplies`
- **Phase reconciliation:** `phase_invoice_carryforwards`
- **Local operation/sync state:** `sync_queue`, `operations_log`, `sync_meta`, `app_config`
- **Local notifications:** `app_notifications`, `invoice_notifications_log`

## Scope And Relationships

- `project_id` scopes tenant-owned records.
- `phase_id` scopes operational data where supported, including invoices, collections, batches, wallets, supplies, and card returns.
- Invoices own invoice items and may have collections and card-return requests.
- Invoice items link the sale to category, batch, and wallet.
- Wallets link an agent to batch/category inventory in a project and phase.
- Collections reference an invoice and may be grouped into supplies.
- Carry-forward rows link an outstanding invoice to source and target phases and are unique by invoice/target phase.

## Recent Domain Additions

### Card units and returns

`card_categories` includes `card_value` and `cards_per_sheet`. Card returns are recorded per invoice item in `invoice_card_returns` with returned-card count, value, calculated return amount, project/phase, optional collection, and approval metadata.

Active pending and approved returns reserve returned units. Approval is admin-only. Parent invoice/collection cancellation marks related active requests inactive with `status = 'cancelled'` and queues the updates.

### Phase carry-forward

`phase_invoice_carryforwards` records outstanding invoices reconciled from a source phase into a target phase. It is managed by `phaseService.js` and reported through `PhaseReportScreen.js`.

### Project-scoped document numbering

`documentNumberService.js` generates invoice and collection codes using:

```text
<prefix>-<YYYY>-<MM>-<agent-code>-<four-digit-sequence>
```

Sequence lookup is scoped by project, optional phase, and agent. The service derives an agent code from an available user code column or a stable ID-based fallback. Sync conflict handling may renumber a local document and retry.

## Local-Only And Remote Fields

Common local-only fields include synchronization flags, notification flags, deletion metadata where the remote table does not support it, and derived values such as `remaining_cards`. Do not send fields based on memory: use `sanitizePayload` and the per-table SQLite-only field lists in `SyncService.js`.

## Status And Amount Contracts

- Exclude inactive, deleted, cancelled, and rejected rows according to the domain query.
- Invoice amount basis is approved discounted `net_amount` when applicable; otherwise `total_amount`.
- Payment amount and accounting approval amount are separate: pending active collections can affect payment progress, while only approved collections affect approval progress.
- Zero, partial, and complete payment/approval states are determined by comparison with the effective invoice amount.
- Approved card returns reduce the effective invoice obligation; pending returns can block related approval actions.

## Indexing

`dbCore.js` defines targeted indexes for project/phase list queries, sync attempts, reports, invoice item batch/wallet joins, wallet/category joins, card-return lookups, document-number scopes, operation logs, and carry-forward reconciliation. Match new indexes to observed `WHERE`, `JOIN`, and ordering patterns rather than adding speculative indexes.
