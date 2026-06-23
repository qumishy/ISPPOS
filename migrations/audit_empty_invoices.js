#!/usr/bin/env node
/*
 * Read-only audit for Supabase invoices that have no invoice_items.
 *
 * Required env:
 *   SUPABASE_URL=https://...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Optional env:
 *   AUDIT_PROJECT_ID=<project uuid>
 *   AUDIT_OUT_DIR=migrations/audit-output
 *
 * This script does not INSERT/UPDATE/DELETE remote data. It only reads from
 * Supabase and writes local report/preview files.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.DST_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DST_KEY;
const PROJECT_FILTER = process.env.AUDIT_PROJECT_ID || '';
const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join('migrations', 'audit-output');

const PRICE_COLUMNS = ['price', 'value', 'amount', 'card_value', 'category_value'];
const PAGE_SIZE = 1000;
const EPS_CENTS = 1;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or DST_URL/DST_KEY) and re-run.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const asArray = (v) => Array.isArray(v) ? v : [];
const cents = (v) => Math.round(Number(v || 0) * 100);
const money = (v) => Number((Number(v || 0)).toFixed(2));
const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const sqlString = (v) => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const sqlNumber = (v) => Number.isFinite(Number(v)) ? String(Number(v)) : '0';

async function fetchAll(table, select = '*') {
  let from = 0;
  const rows = [];
  while (true) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (PROJECT_FILTER && table !== 'project') query = query.eq('project_id', PROJECT_FILTER);
    if (PROJECT_FILTER && table === 'project') query = query.eq('id', PROJECT_FILTER);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...asArray(data));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function columnSet(rows) {
  const cols = new Set();
  for (const row of rows) Object.keys(row || {}).forEach(k => cols.add(k));
  return cols;
}

function isActiveInvoice(inv) {
  const status = String(inv.status || 'pending').toLowerCase();
  return inv.active !== false &&
    inv.active !== 0 &&
    status !== 'cancelled' &&
    status !== 'canceled' &&
    status !== 'rejected' &&
    status !== 'deleted';
}

function samePhaseOrUnscoped(row, phaseId, cols) {
  if (!cols.has('phase_id')) return true;
  if (isBlank(row.phase_id)) return true;
  if (isBlank(phaseId)) return true;
  return String(row.phase_id) === String(phaseId);
}

function activeRow(row, cols) {
  if (!cols.has('active')) return true;
  return row.active === true || row.active === 1 || row.active === 'true' || row.active === null || row.active === undefined;
}

function determinePriceColumn(categories) {
  const cols = columnSet(categories);
  const candidates = PRICE_COLUMNS.filter(c => cols.has(c));
  const usable = candidates.find(c => categories.some(row => Number(row[c] || 0) > 0));
  if (!usable) {
    throw new Error(`Could not determine card category price column. Checked: ${PRICE_COLUMNS.join(', ')}`);
  }
  return usable;
}

function buildDerivedWalletSold(invoices, items) {
  const invoiceById = new Map(invoices.map(inv => [inv.id, inv]));
  const sold = new Map();
  for (const item of items) {
    if (isBlank(item.wallet_id)) continue;
    const inv = invoiceById.get(item.invoice_id);
    if (!inv || !isActiveInvoice(inv)) continue;
    const key = String(item.wallet_id);
    sold.set(key, (sold.get(key) || 0) + Number(item.quantity || 0));
  }
  return sold;
}

function findReconstructions(targetCents, wallets) {
  const usable = wallets
    .map(w => ({ ...w, price_cents: cents(w.unit_price), max_qty: Math.floor(Number(w.available_cards || 0)) }))
    .filter(w => w.price_cents > 0 && w.max_qty > 0)
    .sort((a, b) => {
      if (a.phase_preferred !== b.phase_preferred) return a.phase_preferred ? -1 : 1;
      return b.price_cents - a.price_cents;
    });

  const suffixMax = new Array(usable.length + 1).fill(0);
  for (let i = usable.length - 1; i >= 0; i--) {
    suffixMax[i] = suffixMax[i + 1] + usable[i].price_cents * usable[i].max_qty;
  }

  const solutions = [];
  const chosen = [];

  function search(index, remaining) {
    if (solutions.length > 1) return;
    if (remaining <= EPS_CENTS && remaining >= -EPS_CENTS) {
      solutions.push(chosen.map(x => ({ ...x })));
      return;
    }
    if (index >= usable.length || remaining < -EPS_CENTS) return;
    if (suffixMax[index] + EPS_CENTS < remaining) return;

    const w = usable[index];
    const maxQ = Math.min(w.max_qty, Math.floor((remaining + EPS_CENTS) / w.price_cents));
    for (let q = maxQ; q >= 0; q--) {
      if (q > 0) chosen.push({ wallet: w, quantity: q });
      search(index + 1, remaining - q * w.price_cents);
      if (q > 0) chosen.pop();
      if (solutions.length > 1) return;
    }
  }

  search(0, targetCents);
  return solutions;
}

function makeItemPreview(invoice, solution) {
  const createdAt = invoice.created_at || new Date().toISOString();
  return solution.map(({ wallet, quantity }) => ({
    id: 'GENERATED_UUID_AT_REPAIR_TIME',
    invoice_id: invoice.id,
    project_id: invoice.project_id,
    phase_id: invoice.phase_id || null,
    category_id: wallet.category_id,
    batch_id: wallet.batch_id,
    wallet_id: wallet.id,
    quantity,
    unit_price: wallet.unit_price,
    total_price: money(quantity * Number(wallet.unit_price || 0)),
    created_at: createdAt,
  }));
}

function previewInsertSql(item, hasTotalPrice) {
  const cols = ['id', 'invoice_id', 'project_id', 'category_id', 'batch_id', 'wallet_id', 'quantity', 'unit_price'];
  const vals = ['gen_random_uuid()', sqlString(item.invoice_id), sqlString(item.project_id), sqlString(item.category_id), sqlString(item.batch_id), sqlString(item.wallet_id), sqlNumber(item.quantity), sqlNumber(item.unit_price)];
  if (hasTotalPrice) {
    cols.push('total_price');
    vals.push(sqlNumber(item.total_price));
  }
  cols.push('created_at');
  vals.push(sqlString(item.created_at));
  return `INSERT INTO invoice_items (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const [invoices, invoiceItems, wallets, batches, categories, collections] = await Promise.all([
    fetchAll('invoices'),
    fetchAll('invoice_items'),
    fetchAll('agent_wallets'),
    fetchAll('batches'),
    fetchAll('card_categories'),
    fetchAll('collections'),
  ]);

  const priceColumn = determinePriceColumn(categories);
  const walletCols = columnSet(wallets);
  const batchCols = columnSet(batches);
  const itemCols = columnSet(invoiceItems);
  const hasItemTotalPrice = itemCols.has('total_price');
  const itemCountByInvoice = new Map();
  for (const item of invoiceItems) {
    itemCountByInvoice.set(item.invoice_id, (itemCountByInvoice.get(item.invoice_id) || 0) + 1);
  }
  const collectionsByInvoice = new Map();
  for (const col of collections) {
    if (!col.invoice_id) continue;
    collectionsByInvoice.set(col.invoice_id, (collectionsByInvoice.get(col.invoice_id) || 0) + 1);
  }
  const batchById = new Map(batches.map(b => [b.id, b]));
  const categoryById = new Map(categories.map(c => [c.id, c]));
  const derivedWalletSold = buildDerivedWalletSold(invoices, invoiceItems);

  const emptyInvoices = invoices.filter(inv => (itemCountByInvoice.get(inv.id) || 0) === 0);
  const results = [];

  for (const inv of emptyInvoices) {
    const totalCents = cents(inv.total_amount);
    const hasCollections = (collectionsByInvoice.get(inv.id) || 0) > 0;
    const paidAmount = Number(inv.paid_amount || 0);
    const active = isActiveInvoice(inv);
    const candidateWallets = wallets
      .filter(w => String(w.project_id || '') === String(inv.project_id || ''))
      .filter(w => String(w.agent_id || '') === String(inv.agent_id || ''))
      .filter(w => samePhaseOrUnscoped(w, inv.phase_id, walletCols))
      .filter(w => activeRow(w, walletCols))
      .filter(w => !isBlank(w.batch_id) && !isBlank(w.category_id))
      .map(w => {
        const batch = batchById.get(w.batch_id);
        const category = categoryById.get(w.category_id);
        const totalCards = Number(w.total_cards || 0);
        const soldCards = Number(derivedWalletSold.get(String(w.id)) || 0);
        return {
          ...w,
          batch_exists: !!batch,
          category_exists: !!category,
          batch_category_match: batch ? String(batch.category_id || '') === String(w.category_id || '') : false,
          batch_phase_match: !batch || samePhaseOrUnscoped(batch, inv.phase_id, batchCols),
          unit_price: category ? Number(category[priceColumn] || 0) : 0,
          derived_sold_cards: soldCards,
          available_cards: Math.max(0, totalCards - soldCards),
          phase_preferred: !walletCols.has('phase_id') || isBlank(w.phase_id) ? false : String(w.phase_id) === String(inv.phase_id || ''),
        };
      })
      .filter(w => w.batch_exists && w.category_exists && w.batch_category_match && w.batch_phase_match && w.available_cards > 0 && w.unit_price > 0);

    const maxValueCents = candidateWallets.reduce((sum, w) => sum + cents(w.unit_price) * Math.floor(w.available_cards), 0);
    const solutions = maxValueCents >= totalCents
      ? findReconstructions(totalCents, candidateWallets)
      : [];

    let classification = 'UNRECOVERABLE';
    if (maxValueCents < totalCents) classification = 'INSUFFICIENT_WALLET_STOCK';
    else if (solutions.length === 1) classification = 'HIGH_CONFIDENCE';
    else if (solutions.length > 1) classification = 'AMBIGUOUS';

    const highRisk = hasCollections || paidAmount > 0 || !active;
    const autoRepairAllowed = classification === 'HIGH_CONFIDENCE' && active && !highRisk;

    results.push({
      classification,
      high_risk: highRisk,
      auto_repair_allowed: autoRepairAllowed,
      invoice: {
        id: inv.id,
        invoice_number: inv.invoice_number,
        project_id: inv.project_id,
        phase_id: inv.phase_id,
        agent_id: inv.agent_id,
        pos_id: inv.pos_id,
        total_amount: inv.total_amount,
        net_amount: inv.net_amount,
        status: inv.status,
        active: inv.active,
        paid_amount: inv.paid_amount,
        created_at: inv.created_at,
      },
      collections_count: collectionsByInvoice.get(inv.id) || 0,
      candidate_wallet_count: candidateWallets.length,
      max_wallet_value: money(maxValueCents / 100),
      reconstructed_items: solutions.length === 1 ? makeItemPreview(inv, solutions[0]) : [],
      ambiguous_solution_count_observed: solutions.length,
    });
  }

  const summary = {
    generated_at: new Date().toISOString(),
    project_filter: PROJECT_FILTER || null,
    price_column: priceColumn,
    invoice_items_has_total_price: hasItemTotalPrice,
    counts: {
      total_invoices: invoices.length,
      total_invoice_items: invoiceItems.length,
      empty_invoices: emptyInvoices.length,
      active_empty: results.filter(r => isActiveInvoice(r.invoice)).length,
      inactive_empty: results.filter(r => !isActiveInvoice(r.invoice)).length,
      paid_empty: results.filter(r => Number(r.invoice.paid_amount || 0) > 0 || r.collections_count > 0).length,
      pending_empty: results.filter(r => String(r.invoice.status || '').toLowerCase() === 'pending').length,
      high_confidence: results.filter(r => r.classification === 'HIGH_CONFIDENCE').length,
      auto_repair_allowed: results.filter(r => r.auto_repair_allowed).length,
      ambiguous: results.filter(r => r.classification === 'AMBIGUOUS').length,
      unrecoverable: results.filter(r => r.classification === 'UNRECOVERABLE').length,
      insufficient_wallet_stock: results.filter(r => r.classification === 'INSUFFICIENT_WALLET_STOCK').length,
      high_risk: results.filter(r => r.high_risk).length,
    },
  };

  const report = { summary, results };
  fs.writeFileSync(path.join(OUT_DIR, 'empty_invoice_audit_report.json'), JSON.stringify(report, null, 2));

  const previewSql = [];
  previewSql.push('-- PREVIEW ONLY. Do not run as repair without explicit approval.');
  previewSql.push('-- Generated inserts for HIGH_CONFIDENCE + active + no collections/paid rows only.');
  for (const r of results.filter(x => x.auto_repair_allowed)) {
    previewSql.push('');
    previewSql.push(`-- invoice ${r.invoice.invoice_number || r.invoice.id} (${r.invoice.id}) total=${r.invoice.total_amount}`);
    for (const item of r.reconstructed_items) {
      previewSql.push('-- ' + previewInsertSql(item, hasItemTotalPrice));
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, 'repair_preview_commented.sql'), previewSql.join('\n') + '\n');

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${path.join(OUT_DIR, 'empty_invoice_audit_report.json')}`);
  console.log(`Wrote ${path.join(OUT_DIR, 'repair_preview_commented.sql')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
