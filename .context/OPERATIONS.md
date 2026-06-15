# Operations Screen

Primary files:
- `src/screens/OperationsScreen.js`
- `src/services/operationLogger.js`
- `src/services/SyncService.js`
- `src/hooks/useSync.js`
- `src/components/UI.js`

## Purpose
Operations screen explains offline/sync status to the user. It must be stable and understandable.

## Required Layout
Two tabs:
1. `العمليات المعلقة`
2. `سجل العمليات العام`

General log should remain admin/manager only.

## Pending Behavior
- Load pending operations from local SQLite first.
- Pending/failed operations remain visible while offline.
- Do not clear list during refresh.
- Synced items disappear from pending tab only after successful sync.
- Failed items remain visible with error details.
- Avoid refresh loops and flickering.

## Buttons
- Top button in pending tab: `مزامنة الكل`.
- Button state: `جاري المزامنة...` while running.
- Disable while sync is running.
- Offline press shows `لا يوجد اتصال بالإنترنت`.
- Per-item button only for failed items: `إعادة المحاولة`.
- Do not show per-item sync button for normal pending items.

## Status Badges
- `معلقة`
- `جاري المزامنة`
- `تمت المزامنة`
- `فشلت`

Top counters:
- `المعلقة`
- `الفاشلة`
- `تمت مزامنتها`

## UI
Use FlatList, compact Arabic RTL cards, clear icons/badges, empty states, and understandable error messages.
