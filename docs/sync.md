# Synchronization

## Model

SQLite is the operational store. `SyncService.js` transports local changes to Supabase, pulls remote changes into SQLite, manages realtime subscriptions, sanitizes payloads, and exposes synchronization state to the operations UI.

Every remote query or queue item must remain scoped to the current `project_id`. Foreign-project queue payloads are rejected and marked failed.

The authenticated project membership is resolved before synchronization begins. `setCurrentUser` receives a session whose `project_id` and `role` come from the selected membership. Changing users/projects tears down the previous realtime subscription; pull, push, queue processing, and realtime filters then use only the new project key.

Project membership discovery is not an ordinary sync-table pull. Online login calls the restricted authentication RPC, then caches its allowed project list per user. Offline login reads only that cache and never derives access from locally present business projects.

## Startup Sync

Current startup readiness depends on these critical tables:

- `project`
- `phases`
- `app_permissions`
- `users`
- `pos_customers`
- `card_categories`
- `batches`
- `agent_wallets`

`REQUIRED_INITIAL_SYNC_TABLES` is currently the same list as `CRITICAL_TABLES`.

The following transaction tables are pulled as noncritical/background data and do not define initial readiness:

- `invoices`
- `invoice_items`
- `collections`
- `invoice_card_returns`
- `supplies`

Historical phases may continue synchronizing after the active critical dataset is ready.

## Outgoing Queue

Ordinary local writes add `sync_queue` entries. Successful processing marks local records/operation logs synced and removes the queue entry. A failed operation remains available for user-visible retry. Repeated failures reach the failed state until retry logic resets the queue record.

Queue rows should carry `project_id`; operational payloads carry `phase_id` where the remote table supports it. Use an operation group for dependent changes that must be presented or synchronized together.

## Atomic Invoice Bundle

Invoice creation is synchronized through `upsert_invoice_bundle_atomic` with:

- the sanitized invoice header;
- all locally saved invoice items;
- dependent wallet updates.

The sync service refuses to push an invoice that has no local items. It also refuses a bundle when a sold wallet lacks its dependent queued wallet state. Items and wallet queue records are marked synced only after the RPC succeeds.

Cash-invoice collection records grouped with creation are synchronized only after the invoice bundle RPC succeeds. Duplicate invoice or collection number conflicts invoke local recovery/renumbering and retry behavior.

## Payload Sanitization

All outgoing payloads pass `sanitizePayload(tableName, payload)`. The service strips global local-only fields and table-specific fields such as local sync markers, local deletion metadata unsupported remotely, notification flags, and derived wallet values.

When a remote schema-cache/unknown-column error occurs:

1. inspect the current SQLite and remote schemas;
2. inspect the sanitizer whitelist/strip lists;
3. update the appropriate schema migration or sanitizer deliberately;
4. do not blindly remove business fields or send every local column.

## Realtime And Notifications

Realtime subscriptions refresh local invoice/collection state and trigger local notification history where appropriate. Screens still consume the resulting SQLite data rather than relying on realtime payloads as their primary business store.

## Explicit Non-Queue Remote Workflows

- project-license lookup and online login;
- authenticated user-project membership lookup and per-user access caching;
- push-token update;
- backup/restore maintenance;
- remote-first admin batch creation and atomic admin wallet distribution.

These exceptions must not be generalized to ordinary business screens.
