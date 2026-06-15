# Architecture

## Runtime Flow
`App.js` -> providers (`AuthContext`, loading/theme/etc.) -> `AppNavigator.js` -> screens -> services -> SQLite. Supabase sync runs through `SyncService.js` and should not be called directly by screens for business reads/writes.

## Offline-First Mutation Flow
Every create/update/delete/approval should follow:
1. Validate project, active phase, permissions, closed-phase rules.
2. Save locally to SQLite quickly.
3. Insert `sync_queue` item with `project_id`, `phase_id`, `record_id`, operation payload.
4. Insert/update `operations_log`.
5. Notify local subscribers/refresh UI from SQLite.
6. Push to Supabase in background.

Do not block UI waiting for Supabase after the local write succeeds.

## Project + Phase Model
- `project_id` is the top-level scope. No screen/report/sync query should fall back to all projects.
- `phase_id` scopes operational data. Invoices and collections must always belong to the current active phase when created.
- Active phase is chosen/configured by admin/manager. Accountants/agents adapt automatically.
- Closed phases are read-only and can be selected for viewing/filtering, but operational writes are blocked.
- A phase can be resumed only if no newer phase was created after it.

## Startup Loading Policy
Preferred behavior:
- First install / first project login / empty local data: show one short Arabic message `جاري جلب البيانات...` and required initial sync progress.
- Normal app restart with local project data: open quickly from SQLite, run Supabase sync silently in background.
- Offline with local data: open in offline mode with warning.
- Offline without local data: block data screens with a clear Arabic message.

Do not show detailed table names to the user unless in debug mode.

## Data Change Events
Use `notifyDataChanged` / `subscribeDataChanges` to refresh dashboards/lists after local writes or sync. Avoid refresh loops and repeated full-screen loaders.

## Business Logic Location
Screens render UI. Services own validation, calculations, SQLite writes, sync queue writes, and notification decisions.
