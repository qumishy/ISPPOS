-- SQLite local migration reference for card category units and card return approvals.
-- The app applies these safely via dbCore PRAGMA table_info guards.
-- This file is intentionally additive and does not touch invoice_items or invoice totals.

ALTER TABLE card_categories ADD COLUMN card_value REAL DEFAULT 0;
ALTER TABLE card_categories ADD COLUMN cards_per_sheet INTEGER DEFAULT 1;

UPDATE card_categories
SET cards_per_sheet = 1
WHERE COALESCE(cards_per_sheet, 0) < 1;

UPDATE card_categories
SET card_value = COALESCE(NULLIF(card_value, 0), price, 0)
WHERE COALESCE(card_value, 0) <= 0;

CREATE TABLE IF NOT EXISTS invoice_card_returns (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT,
  phase_id TEXT,
  invoice_id TEXT NOT NULL,
  collection_id TEXT,
  invoice_item_id TEXT,
  category_id TEXT NOT NULL,
  batch_id TEXT,
  wallet_id TEXT,
  returned_cards_count INTEGER NOT NULL DEFAULT 0,
  card_value REAL NOT NULL DEFAULT 0,
  return_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  approval_notes TEXT,
  rejection_notes TEXT,
  created_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  rejected_by TEXT,
  rejected_at TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  synced INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_project_id
  ON invoice_card_returns(project_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_phase_id
  ON invoice_card_returns(phase_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_invoice_id
  ON invoice_card_returns(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_collection_id
  ON invoice_card_returns(collection_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_status
  ON invoice_card_returns(status);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_active
  ON invoice_card_returns(active);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_invoice_item_id
  ON invoice_card_returns(invoice_item_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_category_id
  ON invoice_card_returns(category_id);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_invoice_active
  ON invoice_card_returns(project_id, invoice_id, active, status);

CREATE INDEX IF NOT EXISTS idx_invoice_card_returns_project_pending
  ON invoice_card_returns(project_id, phase_id, status, active, created_at);
