# Sync Process

## Local First
Services write to SQLite first and enqueue mutations with `addToSyncQueue(table, operation, payload, recordId)`.

## Outgoing Sync
- `sync_queue` stores table, operation, payload, record id, attempts, project id.
- `SyncService.js` processes queue when online.
- Success marks records `synced = 1`, removes/updates queue state, and updates `operations_log`.
- Failures stay pending with attempt/error metadata for `OperationsScreen`.
- Queue attempts >= 5 are treated as failed/blocking until retried/reset.

## Incoming Sync
`SyncService.js` pulls Supabase tables into SQLite using table allowlists and SQLite-only field filters. Local-only fields such as `synced` and notification flags are not pushed.

## Initial Sync Readiness
- Global startup flags:
  - `DB_READY`: SQLite init/migrations completed.
  - `INITIAL_SYNC_IN_PROGRESS`: startup sync currently running.
  - `INITIAL_SYNC_READY`: required project data is locally available.
- Required tables before opening app data screens:
  - `project`, `phases`, `app_permissions`, `users`, `pos_customers`, `card_categories`, `batches`, `agent_wallets`, `invoices`, `invoice_items`, `collections`, `supplies`.
- Progress is real and table-based (completed required tables / total required tables), surfaced in Arabic via loading overlay.
- Offline startup:
  - If local required data exists, open in offline mode.
  - If local required data does not exist, block and show Arabic error.

## Supabase Role
Supabase is the remote transport and login/license data source. Screen calculations, dashboard summaries, reports, status logic, and inventory math should use local SQLite data.

## Operations Log
- `operationLogger.js` creates `operations_log` entries for queued operations.
- `OperationsScreen.js` shows pending and general operation history, scoped by `project_id` and selected `phase_id`.

## Notifications
- Local and push helpers live in `NotificationService.js`.
- Overdue invoice checks are centralized in `checkAndSendOverdueInvoiceNotifications`.
- `invoice_notifications_log` claims overdue notifications by invoice/project/phase before sending, so app restart/dashboard/sync refresh should not resend the same overdue invoice.

## Do Not
- Do not write business changes directly to Supabase from screens.
- Do not bypass `sync_queue` for local mutations.
