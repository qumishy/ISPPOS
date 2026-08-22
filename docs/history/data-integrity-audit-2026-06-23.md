# Historical Data Integrity Audit — 2026-06-23

> **Historical snapshot. This document does not represent current production state unless explicitly revalidated. Do not run repair SQL from these findings without a new read-only audit, backup, preview, transaction plan, and explicit approval.**

## Sources Preserved

- legacy `.context/DATA_INTEGRITY.md` snapshot;
- `migrations/audit-output/empty_invoice_audit_report.json`, generated `2026-06-23T17:16:10.323Z`;
- repair/audit artifacts under `migrations/audit-output/`.

## Snapshot Disagreement

The legacy context reported 28 invoices without items and 16 active nonzero invoices without items. The dated JSON report records 27 empty invoices and 10 active-empty invoices out of 210 invoices and 441 items.

These counts are different historical observations or were produced by different audit queries/times. Neither is a current-state assertion.

The JSON snapshot also classified records into high-confidence, ambiguous, unrecoverable, insufficient-wallet-stock, and high-risk groups. Individual record details remain in the original audit artifact rather than being duplicated here.

## Other Legacy Findings

The context snapshot recorded missing batch/wallet links, invalid wallet references, invoice items attached to inactive invoices, duplicate invoice groups, and an inactive collection pointing to a missing invoice. These claims require revalidation against the intended current project before use.

## Durable Repair Policy

- Diagnose how the corruption occurred before repairing cloud data.
- Trace invoice creation, invoice services, synchronization, SQLite migrations, queue state, and operation logs.
- Do not cancel active empty invoices without checking the source device, `sync_queue`, and operation history.
- Do not infer a batch when both wallet and batch provenance are ambiguous.
- Do not rewrite wallet sold counters without reconciling active invoice items and inactive history.
- Preserve historical transaction rows unless business owners explicitly approve a change.
- Any approved repair requires backup, preview `SELECT`, transaction/rollback planning, post-checks, and an audit trail.

Atomic invoice bundle synchronization and document-number conflict recovery have since been added to the codebase. Their presence reduces known failure paths but does not prove historical data is repaired.
