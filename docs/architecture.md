# Architecture

## Runtime Layers

```text
index.js
  -> App.js
  -> ThemeProvider
  -> LoadingProvider
  -> AuthProvider
  -> AppNavigator
  -> screens
  -> domain services
  -> SQLite
  -> SyncService
  -> Supabase
```

Screens are presentation and interaction layers. Services own business validation, calculations, persistence, synchronization queue entries, operation logging, and data-change notifications.

SQLite is the operational source of truth. Business screens render local data. Supabase is used by services for project-license lookup, online user lookup, background cloud synchronization, realtime changes, push-token persistence, backup/restore workflows, and explicitly online-only RPC operations.

## Project And Phase Context

`project_id` is the tenant boundary. All business reads, writes, reports, queue processing, and remote pulls must use the current project.

Operational data is phase-aware. New invoices and collections use the active phase. A selected closed phase may be viewed, but operational writes and approvals are blocked. Phase selection is stored per project.

The phase service implements phase closure/resume and outstanding-invoice carry-forward reconciliation. `phase_invoice_carryforwards` is the local reconciliation record for an invoice carried from a source phase to a target phase.

## Default Mutation Flow

Ordinary operational mutations follow this sequence:

1. Validate project, active/selected phase, closed-phase state, role/permission, and domain rules.
2. Persist to SQLite.
3. Add a `sync_queue` row containing record and project context, plus phase context where applicable.
4. Write/update `operations_log` for user-visible operation tracking.
5. Call `notifyDataChanged` for affected entities.
6. Synchronize later when connectivity is available.

A successful local write should not wait for background Supabase synchronization.

## Named Exceptions

### Admin inventory creation and wallet distribution

Admin batch creation uses `createOnlineAdminBatch` in `inventoryService.js`. It requires connectivity, inserts the batch remotely, then saves the returned row to SQLite as synced.

Admin wallet distribution uses `createOnlineAdminAgentWallet` in `walletService.js`. It requires connectivity and calls `create_admin_wallet_distribution_atomic` before changing local state. The returned remote batch and wallet rows are then written to SQLite with `synced = 1`.

This remote-first ordering keeps administrative inventory mutations authoritative online and prevents concurrent administrators from over-distributing the same batch. It is a deliberate exception to the default mutation flow.

### Authentication and device services

- License verification queries the remote `project` table.
- User login tries the remote project-scoped active user first and falls back to the local credential cache when the network path fails.
- Push-token persistence is remote after notification registration.
- Backup/restore is an explicit maintenance workflow in `dbBackupService.js` and is not an ordinary screen business query.

## Startup Behavior

- On project setup or when critical local reference data is absent, the application blocks navigation while the required initial sync runs.
- With required local data, startup proceeds from SQLite and synchronization continues in the background.
- Offline with local data opens in offline mode and displays a warning.
- Offline without required local data keeps data screens blocked and offers retry/logout behavior.
- Historical phase transactions are synchronized separately in the background after critical startup readiness.

## Data Change Events

Services call `notifyDataChanged`; screens and providers subscribe through `subscribeDataChanges`. Subscribers should use soft refreshes where possible and avoid refresh loops or repeated full-screen loaders.
