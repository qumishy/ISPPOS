#!/usr/bin/env python3
"""
ISP Fast Importer - Uses Supabase service role key via pg pooler.
Usage:
  export SRC_PASS="<service-role-key-or-db-password-for-isp-cards-system>"
  export DST_PASS="<service-role-key-or-db-password-for-isp>"
  python3 fast_import.py

Alternatively, edit SRC_PASS and DST_PASS directly below (remove from env first).
"""
import os, sys, psycopg2
from psycopg2.extras import execute_values

SRC_PASS = os.environ.get("SRC_PASS", "")
DST_PASS = os.environ.get("DST_PASS", "")

if not SRC_PASS or not DST_PASS:
    print("Set SRC_PASS and DST_PASS env vars then re-run.")
    sys.exit(1)

SRC = f"host=aws-0-eu-west-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.vddwtksrxokdazhassjp password={SRC_PASS} sslmode=require"
DST = f"host=aws-0-ap-northeast-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.ybpzjvswutvdbjevgawt password={DST_PASS} sslmode=require"

PID = "00000000-0000-4000-a000-000000000001"  # project_id (مشروع ISP)
PHI = "00000000-0000-4000-b000-000000000001"  # phase_id   (المرحلة الأولى)

src = psycopg2.connect(SRC); src.set_session(readonly=True, autocommit=True)
dst = psycopg2.connect(DST)
sc  = src.cursor(); dc = dst.cursor()

def run(table, src_sql, cols, rows_transform):
    sc.execute(src_sql)
    rows = [rows_transform(r) for r in sc.fetchall()]
    dc.execute(f"SELECT COUNT(*) FROM {table}")
    before = dc.fetchone()[0]
    col_list = ",".join(cols)
    execute_values(dc, f"INSERT INTO {table}({col_list}) VALUES %s ON CONFLICT(id) DO NOTHING", rows, page_size=100)
    dst.commit()
    dc.execute(f"SELECT COUNT(*) FROM {table}")
    after = dc.fetchone()[0]
    print(f"  {table:<20}: inserted={after-before:>4}  skipped={len(rows)-(after-before):>4}  total={after}")

print("=== ISP IMPORT ===")

print("\n[1] agent_wallets (expected 79)")
run("agent_wallets",
    "SELECT id,agent_id,batch_id,category_id,sold_cards,issued_by,notes,created_at,total_cards FROM agent_wallets ORDER BY created_at",
    ["id","agent_id","batch_id","category_id","sold_cards","issued_by","notes","created_at","total_cards","project_id","phase_id"],
    lambda r: (*r, PID, PHI))

print("\n[2] invoices (expected 134)")
run("invoices",
    "SELECT id,invoice_number,pos_id,agent_id,type,total_amount,paid_amount,status,notes,invoice_date,due_date,created_at,net_amount,active,approved_amount,approval_notes FROM invoices ORDER BY created_at",
    ["id","invoice_number","pos_id","agent_id","type","total_amount","paid_amount","status","notes","invoice_date","due_date","created_at","net_amount","active","approved_amount","approval_notes","project_id","phase_id"],
    lambda r: (*r, PID, PHI))

print("\n[3] invoice_items (expected 296)")
run("invoice_items",
    "SELECT id,invoice_id,category_id,batch_id,quantity,unit_price,created_at,wallet_id FROM invoice_items ORDER BY created_at",
    ["id","invoice_id","category_id","batch_id","quantity","unit_price","created_at","wallet_id","project_id"],
    lambda r: (*r, PID))

print("\n[4] collections (expected 72)")
run("collections",
    "SELECT id,collection_number,agent_id,pos_id,amount,method,reference_number,status,approved_by,approved_at,rejection_reason,notes,collection_date,created_at,invoice_id,active,approval_notes,supply_id FROM collections ORDER BY created_at",
    ["id","collection_number","agent_id","pos_id","amount","method","reference_number","status","approved_by","approved_at","rejection_reason","notes","collection_date","created_at","invoice_id","active","approval_notes","supply_id","phase_id","project_id"],
    lambda r: (*r, PHI, PID))

print("\n=== VALIDATION ===")
for tbl, exp in [("users",11),("pos_customers",68),("card_categories",3),("batches",20),
                 ("agent_wallets",79),("invoices",134),("invoice_items",296),
                 ("collections",72),("supplies",2)]:
    dc.execute(f"SELECT COUNT(*) FROM {tbl}")
    n = dc.fetchone()[0]
    print(f"  {tbl:<20}: {n:>4}  {'✅' if n==exp else f'❌ expected {exp}'}")

print("\n=== FINANCIAL TOTALS ===")
dc.execute("SELECT COALESCE(SUM(total_amount),0), COALESCE(SUM(paid_amount),0) FROM invoices")
t,p = dc.fetchone(); print(f"  invoices total={t:,.0f}  paid={p:,.0f}")
dc.execute("SELECT COALESCE(SUM(amount),0) FROM collections WHERE status='approved'")
print(f"  collections approved={dc.fetchone()[0]:,.0f}")
dc.execute("SELECT COALESCE(SUM(amount),0) FROM supplies WHERE status='approved'")
print(f"  supplies approved={dc.fetchone()[0]:,.0f}")
dc.execute("SELECT COALESCE(SUM(total_cards),0), COALESCE(SUM(sold_cards),0) FROM agent_wallets")
tc,sc2=dc.fetchone(); print(f"  wallets total_cards={tc}  sold_cards={sc2}")

print("\n=== FK CHECKS ===")
checks = [
    ("invoices→pos_customers","SELECT COUNT(*) FROM invoices WHERE pos_id IS NOT NULL AND pos_id NOT IN (SELECT id FROM pos_customers)"),
    ("invoice_items→invoices","SELECT COUNT(*) FROM invoice_items WHERE invoice_id NOT IN (SELECT id FROM invoices)"),
    ("collections→invoices","SELECT COUNT(*) FROM collections WHERE invoice_id IS NOT NULL AND invoice_id NOT IN (SELECT id FROM invoices)"),
    ("agent_wallets→batches","SELECT COUNT(*) FROM agent_wallets WHERE batch_id NOT IN (SELECT id FROM batches)"),
]
for name, q in checks:
    dc.execute(q); n=dc.fetchone()[0]; print(f"  {'✅' if n==0 else '❌'} {name}: {n} orphans")

sc.close(); dc.close(); src.close(); dst.close()
print("\nDone.")
