# Development

## Commands
- Install: `npm install`
- Start: `npm start`
- Android: `npm run android`
- Build preview: `npm run build`
- Syntax check: `node --check path/to/file.js`

## Coding Rules
- Documentation and code changes should be minimal and scoped.
- Screens render UI and call services.
- Business logic, calculations, validation, SQLite writes, sync queue writes, and notifications belong in `src/services`.
- Prefer `src/services/database.js` barrel imports in screens.
- Preserve `project_id`, `phase_id`, closed-phase behavior, and soft-delete filters.
- Do not modify unrelated files or revert user changes.

## Common Validation
- Run `node --check` on changed JS files.
- For import moves, scan local imports for missing paths.
- For UI changes, keep RTL Arabic layout and avoid overflow.

## Current Cleanup State
Legacy inactive modules are under `old/`. Active app code should not depend on them.

## Business Logic Hotspots
- Invoices/status/discounts: `invoiceService.js`.
- Collections/approval: `collectionService.js`.
- Inventory/batches: `inventoryService.js`.
- Wallets: `walletService.js`.
- Phase/project: `phaseService.js`, `AuthContext.js`.
- Sync/audit: `SyncService.js`, `operationLogger.js`, `dbCore.js`.
- Notifications: `NotificationService.js`, `invoiceNotificationLogService.js`.
