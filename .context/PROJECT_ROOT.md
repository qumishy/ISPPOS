# Project Root

ISPPOS is an offline-first Expo React Native app for ISP card inventory, invoice sales, collections, cashier approval, supplies, project/phase management, operations logs, notifications, and reports.

## Active Source Tree
- `src/components`: shared UI, loading overlay, sync bar, export components.
- `src/hooks`: sync/network hooks.
- `src/navigation`: active navigation, mainly `AppNavigator.js`.
- `src/screens`: all screens including dashboard, invoices, collections, inventory, reports, operations, settings, license/login, phases/admin.
- `src/services`: SQLite core, Supabase sync, domain services, auth, notifications, operations, cache, update service.
- `src/styles`, `src/theme`, `src/utils`.

## Important Current Screens
- `LicenseScreen.js`: project license authentication before login.
- `LoginScreen.js`: user login under resolved project.
- `DashboardScreen.js`: role-aware KPIs, phase-aware data, wallet and inventory summaries.
- `InvoicesListScreen.js`, `NewInvoiceScreen.js`, `InvoiceDetailScreen.js`.
- `CollectionsListScreen.js`, `NewCollectionScreen.js`, `CashierScreen.js`.
- `InventoryListScreen.js`, `InventoryScreen.js`, `BatchStockDetailScreen.js`, `AddBatchScreen.js`, `AssignWalletScreen.js`.
- `ReportsScreen.js`: SQLite-first reports/queries.
- `OperationsScreen.js`: pending operations + general operations log.
- `NotificationsListScreen.js`.
- `SettingsScreen.js`, `UpdatesScreen.js`.
- `AdminScreen.js`, `PermissionsScreen.js`, user/POS/wallet/supply screens.

## Important Services
- `dbCore.js`: SQLite open/init/migrations/indexes, DB ready, data change notifications.
- `database.js`: service barrel/helpers used by screens.
- `SyncService.js`: sync queue, Supabase pull/push, payload sanitization, initial sync.
- `AuthContext.js`: session, project/license, active phase, permissions.
- `invoiceService.js`, `collectionService.js`, `inventoryService.js`, `walletService.js`, `supplyService.js`, `phaseService.js`, `operationLogger.js`, `NotificationService.js`, `invoiceNotificationLogService.js`, `updateService.js`.

## Cleanup Rule
Do not delete files. If asked to organize, first build a dependency map from `App.js` and navigation. Move only files proven unused to `src/old/` preserving subfolders. If uncertain, leave in place and report as uncertain.
