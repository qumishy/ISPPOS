# ISP Database Migration Guide
## Source: `isp-cards-system` → Destination: `isp`

---

## What's already imported (via Supabase MCP)

| Table | Status | Count |
|-------|--------|-------|
| `pos_customers` | ✅ Done | 68 |
| `batches` | ✅ Done | 20 |
| `supplies` | ✅ Done | 2 |

## Remaining tables to import

| Table | Rows | Depends on |
|-------|------|------------|
| `agent_wallets` | 79 | users, batches, card_categories |
| `invoices` | 134 | users, pos_customers |
| `invoice_items` | 296 | invoices, batches, card_categories |
| `collections` | 72 | users, pos_customers, invoices, supplies |

---

## Option A — Run `rest_import.py` (Recommended, no DB password needed)

Requires only **service role keys** from your Supabase dashboard.

```bash
# 1. Get service role keys from:
#    https://supabase.com/dashboard/project/vddwtksrxokdazhassjp/settings/api
#    https://supabase.com/dashboard/project/ybpzjvswutvdbjevgawt/settings/api

export SRC_KEY="<isp-cards-system service_role key>"
export DST_KEY="<isp service_role key>"

cd /home/kali/Videos/ISP\ 04042026/ISPCards3/migrations
python3 rest_import.py
```

---

## Option B — Run `isp_migrate.py` (Uses direct DB connection via pooler)

Requires your **database password** (NOT service role key).

```bash
export SRC_DB_PASSWORD="<isp-cards-system db password>"
export DST_DB_PASSWORD="<isp db password>"

cd /home/kali/Videos/ISP\ 04042026/ISPCards3/migrations
python3 isp_migrate.py
```

---

## Constants used in destination

```
project_id = 00000000-0000-4000-a000-000000000001   (مشروع ISP)
phase_id   = 00000000-0000-4000-b000-000000000001   (المرحلة الأولى)
```

## Import order (dependency-safe)

```
1. users          (already in dest — stamp project_id only)
2. card_categories (already in dest — stamp project_id only)
3. pos_customers  ← ✅ done
4. batches        ← ✅ done
5. supplies       ← ✅ done
6. agent_wallets  ← PENDING
7. invoices       ← PENDING
8. invoice_items  ← PENDING (after invoices)
9. collections    ← PENDING (after invoices + supplies)
```

## After import — run validation SQL

```bash
# Run on destination (isp):
# migrations/step4_post_import_validation.sql
```

---

## Safety guarantees

- Source (`isp-cards-system`) opened **read-only** in `isp_migrate.py`
- All inserts use `ON CONFLICT (id) DO NOTHING` — safe to re-run
- No schema changes, no trigger modifications, no RLS changes
- `project_id` and `phase_id` injected at INSERT time only
- Original UUIDs, timestamps, amounts, statuses preserved exactly
