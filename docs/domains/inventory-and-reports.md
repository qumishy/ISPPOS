# Inventory And Reports

## Scope

Inventory and report queries are SQLite-first and must use the current project and selected phase. Legacy rows with missing phase IDs may be included only where the current service deliberately applies a legacy-phase compatibility clause.

Primary implementation areas are `inventoryService.js`, `walletService.js`, `InventoryListScreen.js`, `BatchStockDetailScreen.js`, and `ReportsScreen.js`.

## Batch Value

```text
batch total value = category card value * batch total cards
```

Use `total_cards`; only use `available_cards` as a legacy fallback when total is absent or invalid and the existing service contract requires it.

## Sales

Inventory sales are derived from active invoice items belonging to active invoices:

```text
batch sales = SUM(active invoice-item value for the batch)
```

Do not substitute collections or stale wallet counters for sales. Exclude inactive, soft-deleted, cancelled, rejected, and deleted invoice data according to the service filters.

## Actual Collections By Batch

Collections are attached to invoices, not directly to batches. When an invoice contains items from multiple batches, allocate each active collection proportionally:

```text
batch collection = collection amount * (batch item total / invoice item total)
```

Avoid joining the full collection amount onto every invoice item or batch. Exclude inactive/rejected/cancelled collections and collections belonging to inactive invoices.

## Distribution Value Is Not Cash Collection

Some distribution/movement views use a due/value measure:

```text
category card value * sold quantity
```

This is not an actual cash-collection metric. Labels, row totals, and header totals must use one business definition consistently.

## Wallet And Batch Mutations

Normal agent-side inventory effects follow local SQLite plus queue synchronization. Admin wallet distribution is the online-only RPC exception documented in `docs/architecture.md`.

The direct `updateLocalWalletCards` helper is intentionally blocked; wallet sale effects must follow the invoice-item flow.

## Deletion

- Prefer soft deletion where the domain supports it.
- A batch with active distributed stock or active sales must not be deleted.
- Historical inactive/soft-deleted sales should not be treated as active blockers.
- Soft-deleted batches must not contribute to active inventory/dashboard totals.
- Never repair inconsistent inventory by deleting transaction history.

## Performance

Optimize report SQL and indexes before changing reports to remote reads. Use targeted indexes, bounded result sets, lazy loading, safe cache invalidation, and reduced JavaScript post-processing.
