# CLAUDE.md

Guidance for AI coding agents in this repository.

## Commands
- Start dev server: `npm start` or `npx expo start`
- Android run: `npm run android`
- Build preview APK/AAB through EAS: `npm run build`
- Syntax check a file: `node --check path/to/file.js`

## Architecture Summary
- Entry: `App.js`
- Navigation: `src/navigation/AppNavigator.js`
- Active screens: `src/screens/*ListScreen.js`, form/detail screens, `DashboardScreen`, `AdminScreen`, `ReportsScreen`, etc.
- Legacy inactive files are under `old/`; do not import from there.
- State/context: `src/services/AuthContext.js`, `src/theme/ThemeContext.js`, `src/services/LoadingContext.js`.
- Service barrel: `src/services/database.js`.

## Business Model
- Multi-project app. `project_id` scopes users, phases, POS, inventory, invoices, collections, wallets, supplies, reports, and operations.
- Project access starts at `LicenseScreen`; `AuthContext.loginWithLicense()` resolves the project/license before normal login.
- `phase_id` scopes operational periods. Admin manages phases in `AdminScreen` through `phaseService.js`.
- Closed phases are read-only in UI; creation/action buttons are hidden or blocked in forms.
- Active phase is selected in the drawer and applied to dashboard/list filters.
- Manager/admin phase tools include create, close, resume, update, stats, and outstanding invoice/collection migration to a new phase.

## Offline And Sync
- SQLite-first. Business writes must happen locally first.
- `dbCore.addToSyncQueue()` records outgoing mutations.
- `SyncService.js` pushes queued changes to Supabase and pulls remote tables back into SQLite.
- Required startup sync runs before data screens open. It uses table-based progress (`project`, `phases`, `app_permissions`, `users`, `pos_customers`, `card_categories`, `batches`, `agent_wallets`, `invoices`, `invoice_items`, `collections`, `supplies`).
- `operations_log` records pending/general operations for `OperationsScreen`.
- Supabase is sync/auth/license infrastructure, not the runtime source for screen queries.
- If offline with required local data: app opens in offline mode. If offline with no required local data: app stays blocked with Arabic error until connectivity.

## Key Workflows
- Invoices: `invoiceService.js`; UI in `InvoicesListScreen.js`, `InvoiceDetailScreen.js`, `NewInvoiceScreen.js`.
- Invoice payment status uses active collections: pending + approved; excludes rejected/cancelled/deleted.
- Invoice approval status uses approved collections only.
- Discount workflow: invoice discount request at invoice creation; manager/admin approves/rejects in `DiscountApprovalsScreen`.
- Collections: `collectionService.js`; pending collections affect payment status but not approval status until approved.
- Inventory/batches: `inventoryService.js`, `walletService.js`; batch reports use SQLite calculations scoped by project/phase.
- Dashboard: `DashboardScreen.js` computes role-aware KPIs from local services, including unpaid overdue invoices and inventory health.
- Notifications: `NotificationService.js`; overdue invoice notifications are deduped with `invoice_notifications_log`.
- Reports: `ReportsScreen.js` uses local SQLite joins/calculations.

## Development Rules
- Keep screens UI-focused. Put calculations and database mutations in services.
- Preserve soft-delete rules: check `is_deleted`, `deleted_at`, `active`.
- Never push SQLite-only fields to Supabase; keep payload sanitization table-specific.
- Do not remove old code unless explicitly asked; moving inactive files to `old/` is preferred.
- Avoid unrelated formatting churn.
