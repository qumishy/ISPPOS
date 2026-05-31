#!/usr/bin/env python3
"""
ISP Data Migration: isp-cards-system  →  isp
=============================================
INSERT-ONLY. Source is never written to.
Run:  pip install psycopg2-binary  &&  python3 isp_migrate.py

Set the two env-vars below before running:
  export SRC_DB_PASSWORD="<isp-cards-system db password>"
  export DST_DB_PASSWORD="<isp db password>"
"""

import os, sys, textwrap
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime

# ── Connection strings ────────────────────────────────────────────────────────
SRC_DSN = (
    "host=aws-0-eu-west-1.pooler.supabase.com port=5432 "
    "dbname=postgres user=postgres.vddwtksrxokdazhassjp "
    f"password={os.environ.get('SRC_DB_PASSWORD','')} sslmode=require"
)
DST_DSN = (
    "host=aws-0-ap-northeast-1.pooler.supabase.com port=5432 "
    "dbname=postgres user=postgres.ybpzjvswutvdbjevgawt "
    f"password={os.environ.get('DST_DB_PASSWORD','')} sslmode=require"
)

# ── Constants for destination ─────────────────────────────────────────────────
# Verify with: SELECT id,name FROM project;  and  SELECT id,name FROM phases;
PROJECT_ID = "00000000-0000-4000-a000-000000000001"   # مشروع ISP
PHASE_ID   = "00000000-0000-4000-b000-000000000001"   # المرحلة الأولى

# ── Import log ────────────────────────────────────────────────────────────────
log_lines = []
def log(msg): 
    print(msg); log_lines.append(msg)

def section(title):
    log(f"\n{'='*60}\n  {title}\n{'='*60}")

# ── Schema guard ──────────────────────────────────────────────────────────────
REQUIRED_COLUMNS = {
    "pos_customers":  ["id","name","owner_name","phone","city","credit_limit",
                        "credit_used","is_blocked","assigned_agent_id","notes",
                        "created_at","active","project_id"],
    "batches":        ["id","batch_number","category_id","serial_number",
                        "total_cards","available_cards","received_date","status",
                        "created_at","active","project_id"],
    "agent_wallets":  ["id","agent_id","batch_id","category_id","sold_cards",
                        "issued_by","notes","created_at","total_cards",
                        "project_id","phase_id"],
    "invoices":       ["id","invoice_number","pos_id","agent_id","type",
                        "total_amount","paid_amount","status","notes",
                        "invoice_date","due_date","created_at","net_amount",
                        "active","approved_amount","approval_notes",
                        "project_id","phase_id"],
    "invoice_items":  ["id","invoice_id","category_id","batch_id","quantity",
                        "unit_price","created_at","wallet_id","project_id"],
    "supplies":       ["id","supply_number","user_id","amount","notes","type",
                        "created_at","status","approved_at","approval_notes",
                        "agent_id","phase_id","project_id"],
    "collections":    ["id","collection_number","agent_id","pos_id","amount",
                        "method","reference_number","status","approved_by",
                        "approved_at","rejection_reason","notes",
                        "collection_date","created_at","invoice_id","active",
                        "approval_notes","supply_id","phase_id","project_id"],
}

def validate_schema(dst_cur):
    section("STEP 1 — Schema Validation")
    ok = True
    for tbl, cols in REQUIRED_COLUMNS.items():
        dst_cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=%s", (tbl,))
        existing = {r[0] for r in dst_cur.fetchall()}
        missing  = [c for c in cols if c not in existing]
        if missing:
            log(f"  ❌ {tbl}: MISSING columns {missing}")
            ok = False
        else:
            log(f"  ✅ {tbl}: all required columns present")
    if not ok:
        log("\n  ABORT: schema mismatch detected. Fix destination schema first.")
        sys.exit(1)
    log("  Schema validation PASSED.\n")

# ── Generic insert helper ─────────────────────────────────────────────────────
def insert_table(src_cur, dst_cur, dst_conn,
                 table, src_sql, cols, transform=None):
    """
    Select from source, insert into destination with ON CONFLICT DO NOTHING.
    transform(row) → row  for any per-row mutation (e.g. adding project_id).
    """
    src_cur.execute(src_sql)
    rows = src_cur.fetchall()
    if transform:
        rows = [transform(r) for r in rows]

    if not rows:
        log(f"  ⏭  {table}: 0 rows in source, skipped.")
        return 0

    # Count before
    dst_cur.execute(f"SELECT COUNT(*) FROM {table}")
    before = dst_cur.fetchone()[0]

    col_str   = ", ".join(cols)
    placeholders = "(" + ", ".join(["%s"] * len(cols)) + ")"
    sql = (f"INSERT INTO {table} ({col_str}) VALUES %s "
           f"ON CONFLICT (id) DO NOTHING")
    execute_values(dst_cur, sql, rows, template=placeholders, page_size=200)
    dst_conn.commit()

    dst_cur.execute(f"SELECT COUNT(*) FROM {table}")
    after    = dst_cur.fetchone()[0]
    inserted = after - before
    skipped  = len(rows) - inserted
    log(f"  ✅ {table}: {inserted} inserted, {skipped} skipped (already existed)  [total now: {after}]")
    return inserted

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if not os.environ.get("SRC_DB_PASSWORD") or not os.environ.get("DST_DB_PASSWORD"):
        print("ERROR: Set SRC_DB_PASSWORD and DST_DB_PASSWORD env vars first.")
        sys.exit(1)

    log(f"\nISP Migration  —  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"Source : isp-cards-system (vddwtksrxokdazhassjp) — READ-ONLY")
    log(f"Dest   : isp             (ybpzjvswutvdbjevgawt) — INSERT ONLY")

    src_conn = psycopg2.connect(SRC_DSN)
    dst_conn = psycopg2.connect(DST_DSN)
    src_conn.set_session(readonly=True, autocommit=True)   # enforce read-only on source

    src_cur = src_conn.cursor()
    dst_cur = dst_conn.cursor()

    # ── Schema check ────────────────────────────────────────────────────────
    validate_schema(dst_cur)

    section("STEP 2 — Dependency-safe INSERT order")

    # ── 1. users (reference; stamp project_id on existing rows) ─────────────
    log("\n[1/8] users — stamping project_id on existing rows")
    dst_cur.execute(
        "UPDATE users SET project_id=%s WHERE project_id IS NULL", (PROJECT_ID,))
    dst_conn.commit()
    dst_cur.execute("SELECT COUNT(*) FROM users")
    log(f"  ✅ users: project_id stamped. Total: {dst_cur.fetchone()[0]}")

    # ── 2. card_categories (stamp project_id) ───────────────────────────────
    log("[2/8] card_categories — stamping project_id on existing rows")
    dst_cur.execute(
        "UPDATE card_categories SET project_id=%s WHERE project_id IS NULL", (PROJECT_ID,))
    dst_conn.commit()
    dst_cur.execute("SELECT COUNT(*) FROM card_categories")
    log(f"  ✅ card_categories: project_id stamped. Total: {dst_cur.fetchone()[0]}")

    # ── 3. pos_customers ────────────────────────────────────────────────────
    log("[3/8] pos_customers")
    insert_table(
        src_cur, dst_cur, dst_conn,
        table  = "pos_customers",
        src_sql= ("SELECT id,name,owner_name,phone,city,credit_limit,"
                  "credit_used,is_blocked,assigned_agent_id,notes,created_at,active "
                  "FROM pos_customers ORDER BY created_at NULLS LAST"),
        cols   = ["id","name","owner_name","phone","city","credit_limit",
                  "credit_used","is_blocked","assigned_agent_id","notes",
                  "created_at","active","project_id"],
        transform = lambda r: tuple(r) + (PROJECT_ID,)
    )
    dst_cur.execute(
        "UPDATE pos_customers SET project_id=%s WHERE project_id IS NULL", (PROJECT_ID,))
    dst_conn.commit()

    # ── 4. batches ──────────────────────────────────────────────────────────
    log("[4/8] batches")
    insert_table(
        src_cur, dst_cur, dst_conn,
        table  = "batches",
        src_sql= ("SELECT id,batch_number,category_id,serial_number,"
                  "total_cards,available_cards,received_date,status,created_at,active "
                  "FROM batches ORDER BY created_at"),
        cols   = ["id","batch_number","category_id","serial_number",
                  "total_cards","available_cards","received_date","status",
                  "created_at","active","project_id"],
        transform = lambda r: tuple(r) + (PROJECT_ID,)
    )

    # ── 5. supplies ─────────────────────────────────────────────────────────
    log("[5/8] supplies")
    insert_table(
        src_cur, dst_cur, dst_conn,
        table  = "supplies",
        src_sql= ("SELECT id,supply_number,user_id,amount,notes,type,"
                  "created_at,status,approved_at,approval_notes,agent_id "
                  "FROM supplies ORDER BY created_at"),
        cols   = ["id","supply_number","user_id","amount","notes","type",
                  "created_at","status","approved_at","approval_notes","agent_id",
                  "phase_id","project_id"],
        transform = lambda r: tuple(r) + (PHASE_ID, PROJECT_ID)
    )

    # ── 6. agent_wallets ────────────────────────────────────────────────────
    log("[6/8] agent_wallets")
    insert_table(
        src_cur, dst_cur, dst_conn,
        table  = "agent_wallets",
        src_sql= ("SELECT id,agent_id,batch_id,category_id,sold_cards,"
                  "issued_by,notes,created_at,total_cards "
                  "FROM agent_wallets ORDER BY created_at"),
        cols   = ["id","agent_id","batch_id","category_id","sold_cards",
                  "issued_by","notes","created_at","total_cards",
                  "project_id","phase_id"],
        transform = lambda r: tuple(r) + (PROJECT_ID, PHASE_ID)
    )

    # ── 7. invoices ─────────────────────────────────────────────────────────
    log("[7/8] invoices")
    insert_table(
        src_cur, dst_cur, dst_conn,
        table  = "invoices",
        src_sql= ("SELECT id,invoice_number,pos_id,agent_id,type,"
                  "total_amount,paid_amount,status,notes,invoice_date,"
                  "due_date,created_at,net_amount,active,approved_amount,approval_notes "
                  "FROM invoices ORDER BY created_at"),
        cols   = ["id","invoice_number","pos_id","agent_id","type",
                  "total_amount","paid_amount","status","notes","invoice_date",
                  "due_date","created_at","net_amount","active",
                  "approved_amount","approval_notes","project_id","phase_id"],
        transform = lambda r: tuple(r) + (PROJECT_ID, PHASE_ID)
    )

    # ── 8. invoice_items ────────────────────────────────────────────────────
    log("[8a/8] invoice_items")
    insert_table(
        src_cur, dst_cur, dst_conn,
        table  = "invoice_items",
        src_sql= ("SELECT id,invoice_id,category_id,batch_id,quantity,"
                  "unit_price,created_at,wallet_id "
                  "FROM invoice_items ORDER BY created_at"),
        cols   = ["id","invoice_id","category_id","batch_id","quantity",
                  "unit_price","created_at","wallet_id","project_id"],
        transform = lambda r: tuple(r) + (PROJECT_ID,)
    )

    # ── 9. collections ──────────────────────────────────────────────────────
    log("[8b/8] collections")
    insert_table(
        src_cur, dst_cur, dst_conn,
        table  = "collections",
        src_sql= ("SELECT id,collection_number,agent_id,pos_id,amount,"
                  "method,reference_number,status,approved_by,approved_at,"
                  "rejection_reason,notes,collection_date,created_at,"
                  "invoice_id,active,approval_notes,supply_id "
                  "FROM collections ORDER BY created_at"),
        cols   = ["id","collection_number","agent_id","pos_id","amount",
                  "method","reference_number","status","approved_by","approved_at",
                  "rejection_reason","notes","collection_date","created_at",
                  "invoice_id","active","approval_notes","supply_id",
                  "phase_id","project_id"],
        transform = lambda r: tuple(r) + (PHASE_ID, PROJECT_ID)
    )

    # ── Validation report ───────────────────────────────────────────────────
    section("STEP 3 — Post-import Validation Report")

    EXPECTED = {
        "users": 11, "pos_customers": 68, "card_categories": 3,
        "batches": 20, "invoices": 134, "invoice_items": 296,
        "agent_wallets": 79, "collections": 72, "supplies": 2,
    }
    log(f"\n{'Table':<20} {'Expected':>9} {'Actual':>9} {'Status':>8}")
    log("-" * 52)
    all_ok = True
    for tbl, exp in EXPECTED.items():
        dst_cur.execute(f"SELECT COUNT(*) FROM {tbl}")
        actual = dst_cur.fetchone()[0]
        status = "✅ OK" if actual == exp else "⚠ CHECK"
        if actual != exp: all_ok = False
        log(f"  {tbl:<20} {exp:>9} {actual:>9} {status:>8}")

    # Financial totals
    log("\n── Financial Totals ─────────────────────────────────────────")
    dst_cur.execute("SELECT SUM(total_amount), SUM(paid_amount) FROM invoices")
    inv_total, inv_paid = dst_cur.fetchone()
    log(f"  Invoices total_amount : {inv_total:>15,.2f}")
    log(f"  Invoices paid_amount  : {inv_paid:>15,.2f}")

    dst_cur.execute("SELECT SUM(amount) FROM collections WHERE status='approved'")
    coll_total = dst_cur.fetchone()[0] or 0
    log(f"  Collections approved  : {coll_total:>15,.2f}")

    dst_cur.execute("SELECT SUM(amount) FROM supplies WHERE status='approved'")
    sup_total = dst_cur.fetchone()[0] or 0
    log(f"  Supplies approved     : {sup_total:>15,.2f}")

    dst_cur.execute("SELECT SUM(total_cards), SUM(sold_cards) FROM agent_wallets")
    wt, ws = dst_cur.fetchone()
    log(f"  Wallets total_cards   : {wt:>15}")
    log(f"  Wallets sold_cards    : {ws:>15}")

    dst_cur.execute("SELECT SUM(quantity) FROM invoice_items")
    ii_qty = dst_cur.fetchone()[0] or 0
    log(f"  Invoice items qty     : {ii_qty:>15}")

    log("\n── FK Integrity Checks ──────────────────────────────────────")
    checks = [
        ("Invoices → pos_customers",
         "SELECT COUNT(*) FROM invoices i WHERE i.pos_id IS NOT NULL "
         "AND NOT EXISTS (SELECT 1 FROM pos_customers p WHERE p.id=i.pos_id)"),
        ("invoice_items → invoices",
         "SELECT COUNT(*) FROM invoice_items ii WHERE NOT EXISTS "
         "(SELECT 1 FROM invoices i WHERE i.id=ii.invoice_id)"),
        ("agent_wallets → batches",
         "SELECT COUNT(*) FROM agent_wallets aw WHERE NOT EXISTS "
         "(SELECT 1 FROM batches b WHERE b.id=aw.batch_id)"),
        ("collections → invoices",
         "SELECT COUNT(*) FROM collections c WHERE c.invoice_id IS NOT NULL "
         "AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id=c.invoice_id)"),
        ("collections → supplies",
         "SELECT COUNT(*) FROM collections c WHERE c.supply_id IS NOT NULL "
         "AND NOT EXISTS (SELECT 1 FROM supplies s WHERE s.id=c.supply_id)"),
    ]
    for name, sql in checks:
        dst_cur.execute(sql)
        count = dst_cur.fetchone()[0]
        icon  = "✅" if count == 0 else "❌"
        log(f"  {icon} {name}: {count} orphans")
        if count > 0: all_ok = False

    log("\n── project_id Coverage ──────────────────────────────────────")
    for tbl in ["invoices","collections","agent_wallets","batches","supplies","pos_customers"]:
        dst_cur.execute(f"SELECT COUNT(*) FROM {tbl} WHERE project_id IS NULL")
        missing = dst_cur.fetchone()[0]
        log(f"  {'✅' if missing==0 else '❌'} {tbl}: {missing} rows missing project_id")

    log("\n" + ("✅ IMPORT COMPLETE — all checks passed." if all_ok
               else "⚠  IMPORT DONE — some checks need review (see above)."))

    # Save log
    log_path = os.path.join(os.path.dirname(__file__), "import_report.txt")
    with open(log_path, "w") as f:
        f.write("\n".join(log_lines))
    print(f"\nLog saved: {log_path}")

    src_cur.close(); dst_cur.close()
    src_conn.close(); dst_conn.close()

if __name__ == "__main__":
    main()
