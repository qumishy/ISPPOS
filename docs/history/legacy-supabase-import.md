# Legacy Supabase Import Record

> **Historical snapshot. This document does not represent current production state unless explicitly revalidated. Do not rerun the import or use its credentials/IDs against a database without a fresh audit and explicit approval.**

## Recorded Migration

The legacy `migrations/README.md` described an import from a project named `isp-cards-system` into a destination named `isp`.

At the time of that record, the guide claimed these completed imports:

| Table | Recorded count |
|---|---:|
| `pos_customers` | 68 |
| `batches` | 20 |
| `supplies` | 2 |

It described `agent_wallets` (79), `invoices` (134), `invoice_items` (296), and `collections` (72) as pending. That status has not been reverified and must not be treated as current.

## Recorded Scope Constants

```text
project_id = 00000000-0000-4000-a000-000000000001
phase_id   = 00000000-0000-4000-b000-000000000001
```

These values are historical migration parameters, not defaults for new code or data repair.

## Recorded Dependency Order

```text
users -> card_categories -> pos_customers -> batches -> supplies
      -> agent_wallets -> invoices -> invoice_items -> collections
```

The legacy scripts are `migrations/rest_import.py` and `migrations/isp_migrate.py`. The old guide used a workstation-specific `/home/kali/...` path; use repository-relative paths only after reviewing the scripts.

## Known Gaps In The Old Guide

- It referenced `migrations/step4_post_import_validation.sql`, which is not present.
- It required service-role keys or database passwords and therefore must not be copied into logs or committed.
- Its completion counts and safety claims have not been checked against the current remote projects.
- Current schema, RLS, card-return, numbering, and phase changes postdate the original import instructions.

Before any future import, create a new dated plan with current schemas, dependency checks, dry-run output, backups, secret handling, idempotency review, and post-import validation.
