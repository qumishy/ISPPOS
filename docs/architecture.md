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

Application users are global identities. `user_project_access` is the authoritative project-membership and project-role source. The legacy `users.project_id` and `users.role` columns remain as backward-compatible defaults and are backfilled into memberships; they must not override the selected membership role in an active session.

Login authenticates first through `authenticate_user_projects`, then exposes only active memberships and active projects. A single allowed project is selected automatically. Multiple allowed projects are presented in the Arabic login flow, and the chosen membership supplies both the session `project_id` and active role. No project list is loaded before credential validation.

### Temporary legacy APK login compatibility

APK versions released before the membership login flow still query `users`, `project`, `phases`, and `app_permissions` directly with the legacy anonymous client. Migration `20260825165022_legacy_login_read_compatibility.sql` records explicit SELECT-only grants and named RLS policies for that transition. It does not expose `user_project_access` and adds no write policy. These compatibility policies may be removed only after supported installed versions no longer use direct table login; historical phase reads must be accounted for before removing the phases policy.

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

- The legacy license verification service remains available for compatibility, but normal navigation starts with account authentication rather than a pre-authentication project/license selector.
- Online login validates credentials through the restricted project-access RPC and caches only the returned memberships. Offline login can use only that user's previously cached active memberships.
- The last project is stored per user under `last_project_for_user_<userId>` and is accepted only while it remains in the newly loaded allowed-project set.
- `multi_project_login_cache_migrated_v1` marks the one-time device migration from legacy global project/session state. Before restoring a session, the app requires matching `isp_user`, `isp_project_id`, an active cached membership, and an active local project row. A stale legacy session is removed and the user returns to the account-first flow.
- Automatic recovery removes only the stale session/global-project keys, selected-phase keys, and a malformed membership cache when present. Manual **إصلاح بيانات الدخول** additionally removes credential/project-selector caches and per-user last-project preferences. Neither path deletes SQLite rows, resets the database, or changes `sync_queue`.
- Session creation occurs only after a project and active phase have been resolved. The selected membership role becomes `user.role`, and the selected project becomes `user.project_id`, `AuthContext.projectId`, and `AuthContext.project`.
- Push-token persistence is remote after notification registration.
- Backup/restore is an explicit maintenance workflow in `dbBackupService.js` and is not an ordinary screen business query.
- Project-membership mutations are online-only RPC workflows. `SYSTEM_ADMIN` may manage every project; a project `admin` is limited to active projects where that actor has an active admin membership and may assign only `cashier` or `agent`.

## Startup Behavior

- On project setup or when critical local reference data is absent, the application blocks navigation while the required initial sync runs.
- With required local data, startup proceeds from SQLite and synchronization continues in the background.
- Offline with local data opens in offline mode and displays a warning.
- Offline without required local data keeps data screens blocked and offers retry/logout behavior.
- Historical phase transactions are synchronized separately in the background after critical startup readiness.

## Data Change Events

Services call `notifyDataChanged`; screens and providers subscribe through `subscribeDataChanges`. Subscribers should use soft refreshes where possible and avoid refresh loops or repeated full-screen loaders.
