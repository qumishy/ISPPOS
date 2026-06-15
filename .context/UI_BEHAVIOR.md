# UI Behavior Rules

## Invoice Cards
Primary files:
- `src/screens/InvoicesListScreen.js`
- `src/screens/InvoicesScreen.js`
- `src/services/invoiceService.js`

Rules:
- Show total invoice amount at top, large/prominent.
- Show invoice date directly under total amount.
- Do not show overdue countdown in that position.
- Hide paid amount from invoice card.
- Show remaining amount clearly in red.
- Show payment status and approval status compactly; do not change calculation logic.
- Fully paid invoices must not appear in overdue tab.
- "فواتير يجب سدادها" includes unpaid/partial invoices near overdue threshold, not already overdue negative values if explicitly excluded.

## Invoice Details
- Deleting an invoice as manager/admin should remove it immediately from invoice list through local state/data refresh.
- Deleted invoices must not affect active inventory/report calculations.

## Collections Cards
Primary files:
- `src/screens/CollectionsListScreen.js`
- `src/screens/CollectionsScreen.js`
- `src/services/collectionService.js`

Rules:
- `حالة سداد الفاتورة` should use the same compact vertical layout/style as `اعتماد الفاتورة`.
- Show label on top and value below.
- Prevent overflow outside card.
- Keep collection number/value positioning consistent with latest UI: collection number above POS/customer grouping when requested.

## Loading
- Loading/progress overlays should block duplicate taps during mutations.
- Any async save path must have try/catch/finally and always hide loading in finally.
- Local save should complete quickly; sync runs background.

## Dashboard
- Dashboard must scope by current `project_id` and selected/current `phase_id`.
- Agent wallet category cards show all categories, including zero values.
- Never show negative wallet values; clamp UI to zero and log inconsistency.
- Do not leak data between projects.
