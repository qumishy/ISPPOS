# Architecture

## Flow
`App.js` -> providers -> `AppNavigator.js` -> screens -> services -> SQLite. Supabase sync runs in the background through `SyncService.js`.
Startup flow is gated by readiness flags: DB init (`DB_READY`) then required initial sync (`INITIAL_SYNC_READY`) before opening data screens.

## Layers
- UI: `src/screens`, `src/components`, `src/styles`, `src/theme`.
- Navigation: `src/navigation/AppNavigator.js`.
- Service/business logic: `src/services`.
- Utilities: `src/utils/helpers.js`.

## Offline-First Rule
Screens should not write Supabase directly. A mutation should:
1. Validate business rules in a service.
2. Write SQLite.
3. Add a `sync_queue` entry.
4. Notify subscribers through `notifyDataChanged`.
5. Let `SyncService.js` push/pull later.

## Project And Phase
- `AuthContext` tracks `projectId`, `selectedPhase`, and permissions.
- `LicenseScreen` calls `AuthContext.loginWithLicense()`; that queries Supabase `project` by `license_number`, stores `isp_project_id`, then login loads users for that project.
- `AdminScreen` is the manager/admin phase console and uses `phaseService.js` to create, close, resume, update, and migrate outstanding records.
- Closed phase: global read-only banner plus hidden/blocked create actions.

## Navigation
Active navigation is fully in `AppNavigator.js`: root stack, drawer, bottom tabs, per-tab stacks. Legacy `src/navigation/MainDrawer.js` is inactive and moved to `old/`.

## Data Change Events
`dbCore.subscribeDataChanges` and `notifyDataChanged` refresh list/dashboard screens after local writes or sync.

## Initial Loading UX
- `LoadingContext` + `LoadingOverlay` provide full-screen Arabic progress during required startup sync.
- Progress is computed from actual required table completion, not fake timers.
- Offline mode opens only when required local data already exists for the current `project_id`.

## Dashboard And Reports
- `DashboardScreen.js` reads SQLite via services and filters by `project_id`, selected `phase_id`, and agent role.
- Dashboard KPIs include sales, approved collections, pending invoice balances, overdue unpaid invoices, inventory health, wallet summaries, cashier pending approvals, and supply widgets.
- `ReportsScreen.js` is SQLite-first: invoice audit rows are built from local joins, status fields are decorated with `decorateInvoiceStatusFields`, and inventory/wallet reports use local service queries.

## Inventory
- `InventoryListScreen.js` and `inventoryService.js` manage categories, batches, stock zeroing, soft-delete, global totals, category health, and detailed batch reports.
- Batch financial calculations allocate collection amounts proportionally across invoice items when an invoice contains items from multiple batches.
