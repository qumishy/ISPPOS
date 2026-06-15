# Sync Process

## Core Model
- SQLite is the operational source of truth.
- Supabase is sync transport and cloud copy.
- Screens should load from SQLite. Supabase reads in screens are not allowed for business data.

## Outgoing Sync
- Local writes enqueue `sync_queue` records.
- Queue records must include `project_id` and `phase_id` where applicable.
- `SyncService.js` processes the queue when online.
- Success updates local `synced`/queue/operations log state.
- Failure leaves records visible in `OperationsScreen` with error and retry support.
- Attempts >= threshold are failed/blocking until manual retry/reset.

## Payload Sanitization
Known Supabase schema-cache errors occurred for fields that exist locally but not remotely:
- `delete_reason`, `deleted_at`, `is_deleted` on `invoices`.
- `push_token` missing locally was fixed by adding SQLite users.push_token.

All Supabase writes must pass table-specific sanitizer/whitelist. Do not send unknown local-only fields.

## Initial Sync
Required initial data set includes:
- `project`, `phases`, `app_permissions`, `users`, `pos_customers`, `card_categories`, `batches`, `agent_wallets`, `invoices`, `invoice_items`, `collections`, `supplies`.

Progress should be real, based on required table/row completion, not fake timers. Preferred user message is short: `جاري جلب البيانات...`.

## Startup Behavior Target
- First setup or no local project data: block data screens until required tables are pulled into SQLite.
- Normal startup with local data: open immediately from SQLite, sync silently in background.
- Offline + local data: open offline with warning.
- Offline + no local data: block with clear Arabic message.

## Invoice Sync Integrity Rule
Do not push an invoice header to Supabase without its items. The app had critical partial-sync failures where invoice headers reached Supabase while `invoice_items` did not.

Required direction:
- Treat invoice + invoice_items as one logical operation.
- Either push header and items atomically/transactionally where possible, or ensure dependent item sync cannot be skipped.
- If item push fails, the operation must remain failed/pending and visible.
- Prevent retry storms from creating duplicate invoice headers.

## Operations Log
`OperationsScreen` is the user-facing view of pending/failed/general operations. It must not flicker or clear pending rows while offline.
