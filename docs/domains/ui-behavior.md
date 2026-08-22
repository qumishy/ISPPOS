# Durable UI Behavior

## General

- User-facing application text is Arabic and layouts are RTL.
- Use theme tokens and existing shared UI components.
- Mutation loading state must prevent duplicate submissions.
- Async save flows must clear loading state on success and failure.
- Complete local saves promptly; ordinary synchronization continues in the background.
- Do not expose raw table names or technical synchronization details in normal user messages.

## Invoice Lists And Details

Primary files are `InvoicesListScreen.js`, `InvoiceDetailScreen.js`, and `invoiceService.js`.

- Keep total amount and invoice date prominent.
- Show remaining obligation clearly and keep payment/approval statuses compact.
- Do not classify fully paid invoices as overdue.
- Deleted/cancelled/inactive invoices must disappear from active lists and calculations after local notification refresh.
- Use the service's effective invoice amount and status calculations; do not reproduce divergent arithmetic in the screen.

## Collection Lists

Primary files are `CollectionsListScreen.js`, `CashierScreen.js`, and `collectionService.js`.

- Keep payment and accounting approval status visually distinct.
- Prevent long Arabic labels, customer names, numbers, and values from overflowing cards.
- Preserve the current collection-number/customer/value hierarchy consistently across list and export views.

## Dashboard And Wallets

- Scope all dashboard metrics by current project and selected phase.
- Scope agent wallet data by agent as well as project/phase.
- Display required categories even when their current value is zero.
- Do not display negative available wallet values; clamp presentation to zero while retaining/logging the underlying inconsistency for diagnosis.

## Closed And Offline States

- A closed selected phase shows a clear read-only banner.
- Offline mode with local data shows a warning without discarding local content.
- Missing critical startup data keeps navigation blocked with retry/logout controls.
