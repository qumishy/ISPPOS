# Operations Log And Sync Status

## Purpose

`OperationsScreen.js` presents local synchronization state and audit-friendly operation history. It reads from SQLite through `operationLogger.js`/database exports and invokes `SyncService.js` for sync and retry actions.

Synchronization state is handled directly through services and data-change subscriptions; no hook layer is part of the current implementation.

## Views

- **Pending operations:** user-owned pending, syncing, and failed work grouped from local operation/queue state.
- **General log:** project/selected-phase operation history, currently limited to 50 rows and available to canonical `admin` or users who resolve the `Admin` permission.

The screen still accepts `manager` in a compatibility condition, but `manager` is not a canonical persisted role.

## Behavior

- Backfill display rows from `sync_queue` before loading.
- Keep pending/failed work visible while offline.
- Remove pending work only after its group is fully synchronized.
- Preserve failure messages and queue identifiers for retry.
- Use soft refreshes on `operations_log`, `sync_queue`, global, and phase data-change events.
- Debounce subscription reloads to avoid flicker or overlapping loads.

## Actions

- `مزامنة الكل` runs `syncNow` only while online.
- Offline state displays `لا يوجد اتصال بالإنترنت` and disables synchronization.
- A failed row exposes `إعادة المحاولة` through `retryFailedSyncQueueRecord`.
- When failed rows exist, the screen also provides `إعادة محاولة الفاشلة`.
- Disable overlapping all-sync and item-retry operations.

## Statuses And Counters

The UI uses `pending`, `syncing`, `synced`, and `failed`, rendered in Arabic as معلقة، جاري المزامنة، تمت المزامنة، and فشلت. Counters distinguish pending/syncing, failed, and synchronized general-log rows.
