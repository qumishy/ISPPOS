#!/usr/bin/env python3
"""
ISP Migration via Supabase REST API
Uses service role keys to bypass RLS.
Source: isp-cards-system  (READ-ONLY)
Dest:   isp               (INSERT-ONLY)

Usage:
  export SRC_KEY="<isp-cards-system service_role key>"
  export DST_KEY="<isp service_role key>"
  python3 rest_import.py
"""
import os, sys, json, time
import urllib.request, urllib.error

SRC_URL  = "https://vddwtksrxokdazhassjp.supabase.co"
DST_URL  = "https://ybpzjvswutvdbjevgawt.supabase.co"
SRC_KEY  = os.environ.get("SRC_KEY", "")
DST_KEY  = os.environ.get("DST_KEY", "")
PID      = "00000000-0000-4000-a000-000000000001"
PHI      = "00000000-0000-4000-b000-000000000001"

if not SRC_KEY or not DST_KEY:
    print("ERROR: Set SRC_KEY and DST_KEY (service role keys) then re-run.")
    sys.exit(1)

def rpc(base_url, key, method, path, body=None):
    url  = f"{base_url}{path}"
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey",        key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type",  "application/json")
    req.add_header("Prefer",        "return=representation,resolution=ignore-duplicates")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        print(f"  HTTP {e.code} on {path}: {msg[:200]}")
        return []

def fetch_all(table, select="*", order="created_at"):
    """Paginate through source table."""
    rows, page = [], 0
    limit = 500
    while True:
        path = f"/rest/v1/{table}?select={select}&order={order}&limit={limit}&offset={page*limit}"
        batch = rpc(SRC_URL, SRC_KEY, "GET", path)
        if not batch: break
        rows.extend(batch)
        if len(batch) < limit: break
        page += 1
    return rows

def insert_batch(table, rows, chunk=200):
    """Insert rows in chunks, skip duplicates."""
    inserted = 0
    for i in range(0, len(rows), chunk):
        chunk_rows = rows[i:i+chunk]
        path = f"/rest/v1/{table}"
        result = rpc(DST_URL, DST_KEY, "POST", path, chunk_rows)
        inserted += len(result) if result else 0
    return inserted

def log_table(table, src_rows, inserted):
    skipped = len(src_rows) - inserted
    print(f"  ✅ {table:<22}: src={len(src_rows):>4}  inserted={inserted:>4}  skipped={skipped:>4}")

def count(table, key):
    url = f"{DST_URL}/rest/v1/{table}?select=id"
    req = urllib.request.Request(url)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Prefer", "count=exact")
    with urllib.request.urlopen(req, timeout=30) as r:
        return int(r.headers.get("Content-Range","0").split("/")[-1])

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== ISP MIGRATION (REST API) ===")
print(f"Source: {SRC_URL}")
print(f"Dest:   {DST_URL}\n")

# 1. pos_customers
print("[1/6] pos_customers")
rows = fetch_all("pos_customers", "id,name,owner_name,phone,city,credit_limit,credit_used,is_blocked,assigned_agent_id,notes,created_at,active", "created_at")
for r in rows: r["project_id"] = PID
inserted = insert_batch("pos_customers", rows)
log_table("pos_customers", rows, inserted)

# 2. batches
print("[2/6] batches")
rows = fetch_all("batches", "id,batch_number,category_id,serial_number,total_cards,available_cards,received_date,status,created_at,active", "created_at")
for r in rows: r["project_id"] = PID
inserted = insert_batch("batches", rows)
log_table("batches", rows, inserted)

# 3. supplies
print("[3/6] supplies")
rows = fetch_all("supplies", "id,supply_number,user_id,amount,notes,type,created_at,status,approved_at,approval_notes,agent_id", "created_at")
for r in rows:
    r["project_id"] = PID
    r["phase_id"]   = PHI
inserted = insert_batch("supplies", rows)
log_table("supplies", rows, inserted)

# 4. agent_wallets
print("[4/6] agent_wallets")
rows = fetch_all("agent_wallets", "id,agent_id,batch_id,category_id,sold_cards,issued_by,notes,created_at,total_cards", "created_at")
for r in rows:
    r["project_id"] = PID
    r["phase_id"]   = PHI
inserted = insert_batch("agent_wallets", rows)
log_table("agent_wallets", rows, inserted)

# 5. invoices
print("[5/6] invoices")
rows = fetch_all("invoices", "id,invoice_number,pos_id,agent_id,type,total_amount,paid_amount,status,notes,invoice_date,due_date,created_at,net_amount,active,approved_amount,approval_notes", "created_at")
for r in rows:
    r["project_id"] = PID
    r["phase_id"]   = PHI
inserted = insert_batch("invoices", rows)
log_table("invoices", rows, inserted)

# 5b. invoice_items (after invoices)
print("[5b/6] invoice_items")
rows = fetch_all("invoice_items", "id,invoice_id,category_id,batch_id,quantity,unit_price,created_at,wallet_id", "created_at")
for r in rows: r["project_id"] = PID
inserted = insert_batch("invoice_items", rows)
log_table("invoice_items", rows, inserted)

# 6. collections (after invoices + supplies)
print("[6/6] collections")
rows = fetch_all("collections", "id,collection_number,agent_id,pos_id,amount,method,reference_number,status,approved_by,approved_at,rejection_reason,notes,collection_date,created_at,invoice_id,active,approval_notes,supply_id", "created_at")
for r in rows:
    r["project_id"] = PID
    r["phase_id"]   = PHI
inserted = insert_batch("collections", rows)
log_table("collections", rows, inserted)

# ─── Validation ───────────────────────────────────────────────────────────────
print("\n=== POST-IMPORT VALIDATION ===")
expected = {"users":11,"pos_customers":68,"card_categories":3,"batches":20,
            "agent_wallets":79,"invoices":134,"invoice_items":296,
            "collections":72,"supplies":2}
all_ok = True
for tbl, exp in expected.items():
    actual = count(tbl, DST_KEY)
    ok = actual == exp
    if not ok: all_ok = False
    print(f"  {'✅' if ok else '❌'} {tbl:<22}: expected={exp:>4}  actual={actual:>4}")

print(f"\n{'✅ ALL OK' if all_ok else '⚠ CHECK FAILURES ABOVE'}")
print("\nDone.")
