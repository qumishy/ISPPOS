# Development

## Commands
- Install: `npm install`
- Start: `npm start`
- Android: `npm run android`
- Syntax check: `node --check path/to/file.js`
- Build/export diagnostics: `npx expo export --platform android --clear`

## Coding Rules
- Minimal safe diffs.
- No unrelated refactors.
- Do not delete data or reset DB to fix bugs.
- Keep business logic in services.
- Screens should render and call services.
- Respect Arabic RTL UI and avoid overflow.
- Preserve `project_id`, `phase_id`, closed-phase rules, and soft-delete filters.
- Do not add libraries unless necessary. Prefer existing React Native/Expo APIs.
- After moving/renaming files, validate imports.

## Validation
- Run `node --check` on changed JS files.
- For build issues, inspect the real Metro error above Gradle failure.
- For schema errors, compare SQLite schema vs Supabase schema and update sanitizers/migrations.
- For data correctness, write SELECT audits first; no UPDATE/DELETE without approval.

## Known Past Errors And Fixes
- `expo-linking` missing: use `{ Linking }` from `react-native`.
- Supabase PGRST204 unknown invoice columns: sanitize payload and strip local-only fields.
- SQLite `users.push_token` missing: add local column + migration.
- New invoice save freeze: do not await non-critical operation-log backfill; always hide loader in finally.

## Hotspots
- Invoice creation/sync: `NewInvoiceScreen.js`, `invoiceService.js`, `SyncService.js`.
- Inventory calculations: `inventoryService.js`, `InventoryListScreen.js`, `BatchStockDetailScreen.js`, `ReportsScreen.js`.
- Operations: `OperationsScreen.js`, `operationLogger.js`, `SyncService.js`.
- Startup/sync: `AuthContext.js`, `SyncService.js`, `LoadingContext.js`, `LoadingOverlay.js`, `dbCore.js`.
