# Project Root

ISPPOS is an offline-first Expo React Native app for ISP card inventory, sales invoices, collections, cashier approval, supplies, and operational reporting.

## Entry Points
- `App.js`: initializes SQLite, starts network monitor/update checks, registers push token, wraps providers.
- `src/navigation/AppNavigator.js`: active navigation tree, role-filtered drawer/tabs, phase selector, notification/operations shortcuts.
- `src/services/database.js`: barrel export for local services.

## Current Active Areas
- Screens: `src/screens/*ListScreen.js`, `New*Screen.js`, `InvoiceDetailScreen.js`, `DashboardScreen.js`, `ReportsScreen.js`, `AdminScreen.js`, `OperationsScreen.js`.
- Services: `dbCore.js`, `SyncService.js`, `AuthContext.js`, domain services for invoices, collections, inventory, wallets, POS, users, supplies, phases, permissions, notifications, operations.
- Theme/styles: `src/theme/`, `src/styles/*.styles.js`.

## Major Screens
- `DashboardScreen.js`: role-aware KPIs, overdue/unpaid widgets, inventory health, weekly/agent trend widgets.
- `InvoicesListScreen.js` / `InvoiceDetailScreen.js`: invoice status, remaining amount, discount state, detail/print/share.
- `CollectionsListScreen.js` / `CashierScreen.js`: collection entry review, invoice payment/approval status display, cashier approval.
- `InventoryListScreen.js` / `BatchStockDetailScreen.js`: batch stock, category health, batch financial summary.
- `ReportsScreen.js`: SQLite audit, inventory, and wallet reports.
- `AdminScreen.js`: phases, users, categories, settings, permissions.

## Project/Phase Context
- `project_id` is required for project-scoped business data.
- `phase_id` scopes operational periods and most dashboards/lists.
- Admin manages phases. Closed phases become read-only in UI and service guards prevent new operational writes from forms.

## Legacy Files
Inactive wrappers/old modules are under `old/`. Do not reintroduce imports from `old/` unless intentionally restoring a file.
