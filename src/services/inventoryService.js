import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';
import { getCached } from './cacheService';

const ACTIVE_ROW_CLAUSE = (alias) => `(${alias}.active = 1 OR ${alias}.active IS NULL OR ${alias}.active = 'true')`;
const ACTIVE_INVOICE_CLAUSE = (alias) => `(COALESCE(${alias}.is_deleted, 0) = 0 AND ${alias}.deleted_at IS NULL AND (${alias}.active = 1 OR ${alias}.active IS NULL OR ${alias}.active = 'true') AND LOWER(COALESCE(${alias}.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted'))`;
const ACTIVE_COLLECTION_CLAUSE = (alias) => `((${alias}.active = 1 OR ${alias}.active IS NULL OR ${alias}.active = 'true') AND LOWER(COALESCE(${alias}.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted'))`;
const ACTIVE_BATCH_CLAUSE = (alias) => `(COALESCE(${alias}.is_deleted, 0) = 0 AND ${alias}.deleted_at IS NULL AND (${alias}.active = 1 OR ${alias}.active IS NULL OR ${alias}.active = 'true'))`;
const LEGACY_PHASE_CLAUSE = (alias) => `(${alias}.phase_id = ? OR ${alias}.phase_id IS NULL OR ${alias}.phase_id = '')`;

const normalizeInventoryFilters = (filters = {}) => {
  if (!filters) return {};
  if (typeof filters === 'string') return { project_id: filters };
  return filters;
};

const getTableColumns = async (tableName) => {
  const r = await execSQL(`PRAGMA table_info(${tableName})`);
  return new Set((r.rows._array || []).map(col => col.name));
};

const buildActiveInvoiceClause = (alias, columns) => {
  const parts = [];
  if (columns.has('is_deleted')) parts.push(`COALESCE(${alias}.is_deleted, 0) = 0`);
  if (columns.has('deleted_at')) parts.push(`${alias}.deleted_at IS NULL`);
  if (columns.has('active')) parts.push(`(${alias}.active = 1 OR ${alias}.active IS NULL OR ${alias}.active = 'true')`);
  if (columns.has('status')) parts.push(`LOWER(COALESCE(${alias}.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')`);
  return parts.length ? `(${parts.join(' AND ')})` : '1=1';
};

const buildActiveCollectionClause = (alias, columns) => {
  const parts = [];
  if (columns.has('is_deleted')) parts.push(`COALESCE(${alias}.is_deleted, 0) = 0`);
  if (columns.has('deleted_at')) parts.push(`${alias}.deleted_at IS NULL`);
  if (columns.has('active')) parts.push(`(${alias}.active = 1 OR ${alias}.active IS NULL OR ${alias}.active = 'true')`);
  if (columns.has('status')) parts.push(`LOWER(COALESCE(${alias}.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'deleted')`);
  return parts.length ? `(${parts.join(' AND ')})` : '1=1';
};

const getInventoryBatchAvailabilityRows = async (rawFilters = {}) => {
  const filters = normalizeInventoryFilters(rawFilters);

  const soldInvoiceWhere = [ACTIVE_INVOICE_CLAUSE('i')];
  const soldInvoiceParams = [];
  if (filters.project_id) {
    soldInvoiceWhere.push('i.project_id = ?');
    soldInvoiceParams.push(filters.project_id);
  }
  if (filters.phase_id) {
    soldInvoiceWhere.push('i.phase_id = ?');
    soldInvoiceParams.push(filters.phase_id);
  }

  const batchSalesWhere = [
    'ii.batch_id IS NOT NULL',
    ACTIVE_BATCH_CLAUSE('b2'),
    ...soldInvoiceWhere,
  ];
  const batchSalesParams = [...soldInvoiceParams];
  if (filters.project_id) {
    batchSalesWhere.push('b2.project_id = ?');
    batchSalesParams.push(filters.project_id);
  }

  const walletWhere = [ACTIVE_BATCH_CLAUSE('b3')];
  const walletParams = [];
  if (filters.project_id) {
    walletWhere.push('COALESCE(aw.project_id, b3.project_id) = ?');
    walletParams.push(filters.project_id);
  }
  if (filters.phase_id) {
    walletWhere.push(LEGACY_PHASE_CLAUSE('aw'));
    walletParams.push(filters.phase_id);
  }

  const batchWhere = [ACTIVE_BATCH_CLAUSE('b')];
  const batchParams = [];
  if (filters.project_id) {
    batchWhere.push('b.project_id = ?');
    batchParams.push(filters.project_id);
  }
  if (filters.phase_id) {
    batchWhere.push(LEGACY_PHASE_CLAUSE('b'));
    batchParams.push(filters.phase_id);
  }

  const sql = `
    WITH wallet_sales AS (
      SELECT
        ii.wallet_id,
        SUM(COALESCE(ii.quantity, 0)) AS sold_qty
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE ii.wallet_id IS NOT NULL
        AND ${soldInvoiceWhere.join(' AND ')}
      GROUP BY ii.wallet_id
    ),
    batch_sales AS (
      SELECT
        ii.batch_id,
        SUM(COALESCE(ii.quantity, 0)) AS sold_qty
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN batches b2 ON b2.id = ii.batch_id
      WHERE ${batchSalesWhere.join(' AND ')}
      GROUP BY ii.batch_id
    ),
    wallet_remaining AS (
      SELECT
        aw.batch_id,
        SUM(MAX(0, COALESCE(aw.total_cards, 0) - COALESCE(ws.sold_qty, 0))) AS wallet_remaining
      FROM agent_wallets aw
      JOIN batches b3 ON b3.id = aw.batch_id
      LEFT JOIN wallet_sales ws ON ws.wallet_id = aw.id
      WHERE ${walletWhere.join(' AND ')}
      GROUP BY aw.batch_id
    )
    SELECT
      b.id AS batch_id,
      b.category_id,
      COALESCE(c.name, 'غير معروف') AS category_name,
      COALESCE(b.total_cards, 0) AS total_qty,
      COALESCE(b.available_cards, 0) AS batch_available_qty,
      COALESCE(bs.sold_qty, 0) AS sold_qty,
      COALESCE(wr.wallet_remaining, 0) AS wallet_remaining_qty,
      COALESCE(b.available_cards, 0) + COALESCE(wr.wallet_remaining, 0) AS remaining_qty
    FROM batches b
    LEFT JOIN card_categories c ON c.id = b.category_id
    LEFT JOIN batch_sales bs ON bs.batch_id = b.id
    LEFT JOIN wallet_remaining wr ON wr.batch_id = b.id
    WHERE ${batchWhere.join(' AND ')}
    ORDER BY LOWER(COALESCE(c.name, 'غير معروف')) ASC, COALESCE(b.created_at, b.received_date) DESC
  `;

  const r = await execSQL(sql, [
    ...soldInvoiceParams,
    ...batchSalesParams,
    ...walletParams,
    ...batchParams,
  ]);

  return r.rows._array || [];
};

/**
 * getInventoryTracking
 * ────────────────────────────────────────────────────────────────────────────
 * Returns ONE ROW PER PAPER/CARD (not per batch).
 * If a batch has 100 cards → 100 rows are returned.
 *
 * Strategy (count-based schema — no from_card/to_card columns exist):
 *   1. SQLite query A: every active batch with category, wallet, distributor, agent.
 *   2. SQLite query B: invoice_items per batch (sold qty + invoice/POS metadata).
 *   3. JS expansion: for each batch, loop i = 0 … total_cards-1 and assign:
 *        - i < Σ(sold quantities)       → tracking_status = 'sold'
 *        - i < wallet.total_cards       → tracking_status = 'distributed'
 *        - otherwise                    → tracking_status = 'undistributed'
 *
 * Columns per virtual row:
 *   batch_id, batch_number, category_name, card_index (1-based),
 *   received_date, distributor_name, agent_name,
 *   invoice_number, pos_name, sale_date, tracking_status
 */
export const getInventoryTracking = async (projectId, phaseId = null) => {
  if (!projectId) return [];
  const cacheKey = `reports:inventory_tracking:${projectId}:${phaseId || 'all'}`;
  return getCached(cacheKey, async () => {
  const walletPhaseClause = phaseId ? ` AND (aw1.phase_id = '${phaseId}' OR aw1.phase_id IS NULL OR aw1.phase_id = '')` : '';
  const walletPhaseClause2 = phaseId ? ` AND (aw2.phase_id = '${phaseId}' OR aw2.phase_id IS NULL OR aw2.phase_id = '')` : '';
  const walletPhaseClause3 = phaseId ? ` AND (aw3.phase_id = '${phaseId}' OR aw3.phase_id IS NULL OR aw3.phase_id = '')` : '';
  const walletPhaseClause4 = phaseId ? ` AND (aw4.phase_id = '${phaseId}' OR aw4.phase_id IS NULL OR aw4.phase_id = '')` : '';
  const walletPhaseClause5 = phaseId ? ` AND (aw5.phase_id = '${phaseId}' OR aw5.phase_id IS NULL OR aw5.phase_id = '')` : '';
  // ── Query A: batch + wallet + distributor + agent ──────────────────────────
  const batchSQL = `
    SELECT
      b.id                                              AS batch_id,
      COALESCE(b.batch_number, b.serial_number, '—')   AS batch_number,
      b.total_cards,
      COALESCE(cc.name, '—')                            AS category_name,
      COALESCE(SUBSTR(b.received_date, 1, 10),
               SUBSTR(b.created_at,   1, 10), '—')     AS received_date,
      COALESCE((
        SELECT SUM(COALESCE(aw1.total_cards, 0))
        FROM agent_wallets aw1
        WHERE aw1.batch_id = b.id AND aw1.project_id = '${projectId}'${walletPhaseClause}
      ), 0)                                             AS wallet_assigned_total,
      COALESCE((
        SELECT SUM(COALESCE(ws3.sold_qty, 0))
        FROM agent_wallets aw2
        LEFT JOIN (
          SELECT ii.wallet_id, SUM(COALESCE(ii.quantity, 0)) as sold_qty
          FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id
          WHERE ${ACTIVE_INVOICE_CLAUSE('i')} AND i.project_id = '${projectId}'
          GROUP BY ii.wallet_id
        ) ws3 ON ws3.wallet_id = aw2.id
        WHERE aw2.batch_id = b.id AND aw2.project_id = '${projectId}'${walletPhaseClause2}
      ), 0)                                             AS wallet_sold_total,
      COALESCE((
        SELECT SUM(MAX(0, COALESCE(aw3.total_cards, 0) - COALESCE(ws4.sold_qty, 0)))
        FROM agent_wallets aw3
        LEFT JOIN (
          SELECT ii.wallet_id, SUM(COALESCE(ii.quantity, 0)) as sold_qty
          FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id
          WHERE ${ACTIVE_INVOICE_CLAUSE('i')} AND i.project_id = '${projectId}'
          GROUP BY ii.wallet_id
        ) ws4 ON ws4.wallet_id = aw3.id
        WHERE aw3.batch_id = b.id AND aw3.project_id = '${projectId}'${walletPhaseClause3}
      ), 0)                                             AS wallet_remaining_total,
      COALESCE((
        SELECT u1.name
        FROM agent_wallets aw4
        LEFT JOIN users u1 ON u1.id = aw4.issued_by
        WHERE aw4.batch_id = b.id AND aw4.project_id = '${projectId}'${walletPhaseClause4}
        ORDER BY aw4.created_at DESC
        LIMIT 1
      ), '—')                                           AS distributor_name,
      COALESCE((
        SELECT u2.name
        FROM agent_wallets aw5
        LEFT JOIN users u2 ON u2.id = aw5.agent_id
        WHERE aw5.batch_id = b.id AND aw5.project_id = '${projectId}'${walletPhaseClause5}
        ORDER BY aw5.created_at DESC
        LIMIT 1
      ), '—')                                           AS agent_name
    FROM batches b
    LEFT JOIN card_categories cc   ON cc.id    = b.category_id
    WHERE (b.active = 1 OR b.active IS NULL) AND b.project_id = '${projectId}'
      ${phaseId ? `AND (b.phase_id = '${phaseId}' OR b.phase_id IS NULL OR b.phase_id = '')` : ''}
    ORDER BY b.received_date DESC, b.created_at DESC
  `;

  // ── Query B: sold invoice_items per batch ──────────────────────────────────
  const itemSQL = `
    SELECT
      ii.batch_id,
      ii.quantity,
      COALESCE(inv.invoice_number, '—')              AS invoice_number,
      COALESCE(pos.name, '—')                        AS pos_name,
      COALESCE(SUBSTR(inv.invoice_date, 1, 10), '—') AS sale_date
    FROM invoice_items ii
    JOIN  invoices      inv ON inv.id = ii.invoice_id AND ${ACTIVE_INVOICE_CLAUSE('inv')}
    LEFT JOIN pos_customers pos ON pos.id = inv.pos_id
    WHERE ii.batch_id IS NOT NULL AND inv.project_id = '${projectId}'
      ${phaseId ? `AND (inv.phase_id = '${phaseId}' OR inv.phase_id IS NULL OR inv.phase_id = '')` : ''}
    ORDER BY ii.batch_id, inv.invoice_date ASC, ii.rowid ASC
  `;

  // expo-sqlite has a single serialized transaction queue — run sequentially
  const batchRes = await execSQL(batchSQL, []);
  const itemRes = await execSQL(itemSQL, []);

  const batches = batchRes.rows._array || [];
  const allItems = itemRes.rows._array || [];

  // Index invoice_items by batch_id
  const itemsByBatch = {};
  for (const item of allItems) {
    if (!itemsByBatch[item.batch_id]) itemsByBatch[item.batch_id] = [];
    itemsByBatch[item.batch_id].push(item);
  }

  // ── JS expansion: one virtual row per card ─────────────────────────────────
  const result = [];

  for (const batch of batches) {
    const total = Math.max(0, parseInt(batch.total_cards, 10) || 0);
    const walletRemaining = Math.max(0, parseInt(batch.wallet_remaining_total, 10) || 0);
    const batchItems = itemsByBatch[batch.batch_id] || [];

    // Flatten sold quantities into an ordered slot list
    const soldSlots = [];
    for (const item of batchItems) {
      const qty = Math.max(0, parseInt(item.quantity, 10) || 0);
      for (let q = 0; q < qty; q++) {
        soldSlots.push({
          invoice_number: item.invoice_number,
          pos_name: item.pos_name,
          sale_date: item.sale_date,
        });
      }
    }

    const soldCountRaw = soldSlots.length;
    const soldCount = Math.min(total, soldCountRaw);
    const oversellExcess = Math.max(0, soldCountRaw - total);
    const distributedCount = Math.max(0, Math.min(total - soldCount, walletRemaining));

    if (oversellExcess > 0) {
      console.warn(
        `[InventoryTracking] Oversell anomaly detected: batch=${batch.batch_id} sold=${soldCountRaw} total=${total} excess=${oversellExcess}`
      );
    }

    for (let i = 0; i < total; i++) {
      const cardIndex = i + 1; // 1-based
      let tracking_status, invoice_number, pos_name, sale_date;

      if (i < soldCount) {
        tracking_status = 'sold';
        invoice_number = soldSlots[i].invoice_number;
        pos_name = soldSlots[i].pos_name;
        sale_date = soldSlots[i].sale_date;
      } else if (i < soldCount + distributedCount) {
        tracking_status = 'distributed';
        invoice_number = '—';
        pos_name = '—';
        sale_date = '—';
      } else {
        tracking_status = 'undistributed';
        invoice_number = '—';
        pos_name = '—';
        sale_date = '—';
      }

      const isDistributed = tracking_status !== 'undistributed';

      result.push({
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        category_name: batch.category_name,
        card_index: cardIndex,
        received_date: batch.received_date,
        distributor_name: isDistributed ? batch.distributor_name : '—',
        agent_name: isDistributed ? batch.agent_name : '—',
        invoice_number,
        pos_name,
        sale_date,
        tracking_status,
        oversell_excess: oversellExcess,
      });
    }
  }

  return result;
  }, 20000);
};

export const getLocalCategories = async (projectId) => {
  const cacheKey = projectId ? `card_categories:all:${projectId}` : 'card_categories:all:global';
  return getCached(cacheKey, async () => {
    const where = projectId ? `WHERE project_id = '${projectId}' AND (active = 1 OR active IS NULL)` : 'WHERE (active = 1 OR active IS NULL)';
    const r = await execSQL(`SELECT * FROM card_categories ${where} ORDER BY price ASC, name ASC`);
    return r.rows._array || [];
  });
};

export const createLocalCategory = async (data) => {
  const id = uuidv4();
  const payload = {
    id,
    name: data.name,
    price: Number(data.price || 0),
    active: 1,
    synced: 0,
    project_id: data.project_id
  };
  await execSQL(
    `INSERT INTO card_categories (id, name, price, active, synced, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.name, payload.price, payload.active, payload.synced, payload.project_id]
  );
  await addToSyncQueue('card_categories', 'INSERT', payload, id);
  notifyDataChanged('card_categories');
  return payload;
};

export const updateCategory = async (id, data) => {
  await execSQL(`UPDATE card_categories SET name=?, price=?, active=?, synced=0 WHERE id=?`, [data.name ?? null, Number(data.price || 0), data.active ?? 1, id]);
  await addToSyncQueue('card_categories', 'UPDATE', { name: data.name ?? null, price: Number(data.price || 0), active: data.active ?? 1 }, id);
  notifyDataChanged('card_categories');
  return true;
};

export const softDeleteCategory = async (id) => {
  const b = await execSQL(`SELECT id FROM batches WHERE category_id=? AND active=1 LIMIT 1`, [id]);
  const w = await execSQL(`SELECT id FROM agent_wallets WHERE category_id=? LIMIT 1`, [id]);
  const i = await execSQL(`SELECT id FROM invoice_items WHERE category_id=? LIMIT 1`, [id]);
  if (b.rows._array.length || w.rows._array.length || i.rows._array.length) throw new Error('لا يمكن حذف الفئة لوجود دفعات أو محافظ أو فواتير مرتبطة.');
  await execSQL(`UPDATE card_categories SET active=0, synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('card_categories', 'UPDATE', { active: 0 }, id);
  notifyDataChanged('card_categories');
  return true;
};

export const getLocalBatches = async (rawFilters = {}) => {
  const filters = normalizeInventoryFilters(rawFilters);
  let where = ACTIVE_BATCH_CLAUSE('b');
  const params = [];
  if (filters.project_id) {
    where += " AND b.project_id = ?";
    params.push(filters.project_id);
  }
  if (filters.phase_id) {
    where += ` AND ${LEGACY_PHASE_CLAUSE('b')}`;
    params.push(filters.phase_id);
  }
  return getCached(`batches:all:${filters.project_id || 'global'}:${filters.phase_id || 'all'}`, async () => {
    const r = await execSQL(`SELECT b.*, c.name as category_name FROM batches b LEFT JOIN card_categories c ON c.id = b.category_id WHERE ${where} ORDER BY b.created_at DESC`, params);
    return (r.rows._array || []).map(row => ({ ...row, card_categories: { name: row.category_name } }));
  });
};

export const createLocalBatch = async (data) => {
  const id = uuidv4();
  const payload = { id, batch_number: data.batch_number, category_id: data.category_id, serial_number: data.serial_number, total_cards: data.total_cards, available_cards: data.total_cards, received_date: data.received_date || new Date().toISOString(), status: 'active', synced: 0, project_id: data.project_id, phase_id: data.phase_id };
  await execSQL(`INSERT INTO batches (id, batch_number, category_id, serial_number, total_cards, available_cards, received_date, status, synced, project_id, phase_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.batch_number, payload.category_id, payload.serial_number, payload.total_cards, payload.available_cards, payload.received_date, payload.status, payload.synced, payload.project_id, payload.phase_id]);
  await addToSyncQueue('batches', 'INSERT', payload, id);
  notifyDataChanged('batches');
};

export const updateLocalBatch = async (id, updates) => {
  const w = await execSQL(`SELECT id FROM agent_wallets WHERE batch_id=? LIMIT 1`, [id]);
  if (w.rows._array.length > 0) throw new Error('لا يمكن تعديل الدفعة لأنها موزعة.');
  const sets = Object.keys(updates).map(k => `${k}=?`).join(', ');
  const vals = Object.values(updates);
  await execSQL(`UPDATE batches SET ${sets}, synced=0 WHERE id=?`, [...vals, id]);
  await addToSyncQueue('batches', 'UPDATE', updates, id);
  notifyDataChanged('batches');
  return { isDistributed: false };
};

/**
 * zeroRemainingBatchStock
 * ────────────────────────────────────────────────────────────────────────────
 * Sets the undistributed/unsold remaining stock (available_cards) of a batch
 * to zero. This affects ONLY the inventory pool — not agent wallets or invoices.
 *
 * What it changes:
 *   batches.available_cards → 0
 *
 * What it does NOT change:
 *   • agent_wallets (distributed cards are untouched)
 *   • invoice_items (sold cards are untouched)
 *   • batches.total_cards (historical total preserved)
 *
 * @param {string} batchId  - UUID of the batch to zero
 * @returns {{ zeroed: number }} - number of cards that were zeroed
 * @throws if batch not found or already at zero
 */
export const zeroRemainingBatchStock = async (batchId) => {
  // 1. Read current batch state
  const bRes = await execSQL(
    `SELECT id, batch_number, total_cards, available_cards FROM batches WHERE id = ? AND (active = 1 OR active IS NULL) LIMIT 1`,
    [batchId]
  );
  const batch = bRes.rows._array?.[0];
  if (!batch) throw new Error('الدفعة غير موجودة أو محذوفة.');

  const currentAvailable = parseInt(batch.available_cards, 10) || 0;
  if (currentAvailable <= 0) throw new Error('المخزون المتاح في هذه الدفعة يساوي صفراً بالفعل.');

  // 2. Zero only available_cards (undistributed pool) — distributed/sold untouched
  await execSQL(
    `UPDATE batches SET available_cards = 0, synced = 0 WHERE id = ?`,
    [batchId]
  );

  // 3. Queue sync to Supabase (UPDATE operation)
  await addToSyncQueue(
    'batches',
    'UPDATE',
    { available_cards: 0 },
    batchId
  );

  // 4. Notify UI of change
  notifyDataChanged('batches');

  return { zeroed: currentAvailable };
};

export const softDeleteBatch = async (id, { deletedBy = null, deleteReason = null } = {}) => {
  const bR = await execSQL(
    `SELECT id, project_id, phase_id FROM batches WHERE id = ? LIMIT 1`,
    [id]
  );
  const batch = bR.rows._array?.[0];
  if (!batch) throw new Error('الدفعة غير موجودة أو محذوفة.');

  const invoiceWhere = [ACTIVE_INVOICE_CLAUSE('i')];
  const invoiceParams = [];
  if (batch.project_id) {
    invoiceWhere.push('i.project_id = ?');
    invoiceParams.push(batch.project_id);
  }
  if (batch.phase_id) {
    invoiceWhere.push('i.phase_id = ?');
    invoiceParams.push(batch.phase_id);
  }

  const walletWhere = ['aw.batch_id = ?'];
  const walletParams = [id];
  if (batch.project_id) {
    walletWhere.push('COALESCE(aw.project_id, b.project_id) = ?');
    walletParams.push(batch.project_id);
  }
  if (batch.phase_id) {
    walletWhere.push(LEGACY_PHASE_CLAUSE('aw'));
    walletParams.push(batch.phase_id);
  }

  const usageR = await execSQL(
    `WITH active_invoice_sales AS (
       SELECT
         ii.batch_id,
         SUM(COALESCE(ii.quantity, 0)) AS active_sold_qty
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE ii.batch_id = ?
         AND ${invoiceWhere.join(' AND ')}
       GROUP BY ii.batch_id
     ),
     active_invoice_items AS (
       SELECT
         ii.batch_id,
         COUNT(*) AS active_invoice_items_count
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE ii.batch_id = ?
         AND ${invoiceWhere.join(' AND ')}
       GROUP BY ii.batch_id
     ),
     wallet_usage AS (
       SELECT
         aw.batch_id,
         SUM(COALESCE(aw.total_cards, 0)) AS distributed_qty,
         SUM(MAX(0, COALESCE(aw.total_cards, 0) - COALESCE(ws.sold_qty, 0))) AS wallet_remaining_qty
       FROM agent_wallets aw
       JOIN batches b ON b.id = aw.batch_id
       LEFT JOIN (
         SELECT ii.wallet_id, SUM(COALESCE(ii.quantity, 0)) AS sold_qty
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         WHERE ${invoiceWhere.join(' AND ')}
         GROUP BY ii.wallet_id
       ) ws ON ws.wallet_id = aw.id
       WHERE ${walletWhere.join(' AND ')}
       GROUP BY aw.batch_id
     ),
     wallet_counts AS (
       SELECT
         aw.batch_id,
         COUNT(*) AS active_wallet_count
       FROM agent_wallets aw
       JOIN batches b ON b.id = aw.batch_id
       WHERE ${walletWhere.join(' AND ')}
         AND COALESCE(aw.total_cards, 0) > 0
       GROUP BY aw.batch_id
     )
     SELECT
       COALESCE(ais.active_sold_qty, 0) AS active_sold_qty,
       COALESCE(aii.active_invoice_items_count, 0) AS active_invoice_items_count,
       COALESCE(wu.distributed_qty, 0) AS distributed_qty,
       COALESCE(wu.wallet_remaining_qty, 0) AS wallet_remaining_qty
     FROM batches b
     LEFT JOIN active_invoice_sales ais ON ais.batch_id = b.id
     LEFT JOIN active_invoice_items aii ON aii.batch_id = b.id
     LEFT JOIN wallet_usage wu ON wu.batch_id = b.id
     LEFT JOIN wallet_counts wc ON wc.batch_id = b.id
     WHERE b.id = ?
     LIMIT 1`,
    [
      id,
      ...invoiceParams,
      id,
      ...invoiceParams,
      ...walletParams,
      ...invoiceParams,
      ...walletParams,
      id
    ]
  );
  const usage = usageR.rows._array?.[0] || {};
  const activeSoldQty = Number(usage.active_sold_qty || 0);
  const activeInvoiceItemsCount = Number(usage.active_invoice_items_count || 0);
  const distributedQty = Number(usage.distributed_qty || 0);
  const walletRemainingQty = Number(usage.wallet_remaining_qty || 0);
  const activeWalletCountR = await execSQL(
    `SELECT COUNT(*) as c
     FROM agent_wallets aw
     JOIN batches b ON b.id = aw.batch_id
     WHERE ${walletWhere.join(' AND ')}
       AND COALESCE(aw.total_cards, 0) > 0`,
    walletParams
  );
  const activeWalletCount = Number(activeWalletCountR.rows._array?.[0]?.c || 0);

  console.debug('[BatchDelete] validation', {
    batch_id: id,
    active_sales_count: activeSoldQty,
    active_invoice_items_count: activeInvoiceItemsCount,
    active_distributed_count: distributedQty,
    active_wallet_count: activeWalletCount,
  });

  // New rule: if distributed_count = 0 and no active wallet stock exists, allow delete immediately.
  if (distributedQty !== 0 || walletRemainingQty > 0 || activeWalletCount > 0) {
    throw new Error('لا يمكن حذف الدفعة لأنها ما زالت موزعة.');
  }

  const deletedAt = new Date().toISOString();
  await execSQL(
    `UPDATE batches
     SET active = 0,
         is_deleted = 1,
         deleted_at = ?,
         deleted_by = ?,
         delete_reason = ?,
         synced = 0
     WHERE id = ?`,
    [deletedAt, deletedBy, deleteReason, id]
  );
  // Keep remote payload minimal/safe (Supabase batches schema may not include delete fields).
  await addToSyncQueue('batches', 'UPDATE', { active: 0 }, id);
  notifyDataChanged('batches');
  return true;
};

export const getBatchFinancialSummary = async (batchId, rawFilters = {}) => {
  const filters = normalizeInventoryFilters(rawFilters);
  const cacheKey = `batches:financial:v3:${batchId}:${filters.project_id || 'global'}:${filters.phase_id || 'all'}`;
  return getCached(cacheKey, async () => {
    const [invoiceItemColumns, invoiceColumns, batchColumns, collectionColumns, categoryColumns] = await Promise.all([
      getTableColumns('invoice_items'),
      getTableColumns('invoices'),
      getTableColumns('batches'),
      getTableColumns('collections'),
      getTableColumns('card_categories'),
    ]);
    console.log('[InventoryFinancialSchema]', {
      batch_id: batchId,
      invoice_items: Array.from(invoiceItemColumns),
      invoices: Array.from(invoiceColumns),
      batches: Array.from(batchColumns),
      collections: Array.from(collectionColumns),
      card_categories: Array.from(categoryColumns),
    });

    const quantityExpr = invoiceItemColumns.has('quantity') ? 'COALESCE(ii.quantity, 0)' : '0';
    const allQuantityExpr = invoiceItemColumns.has('quantity') ? 'COALESCE(ii_all.quantity, 0)' : '0';
    const walletQuantityExpr = invoiceItemColumns.has('quantity') ? 'COALESCE(ii2.quantity, 0)' : '0';
    const unitPriceExpr = invoiceItemColumns.has('unit_price') ? 'COALESCE(ii.unit_price, 0)' : '0';
    const allUnitPriceExpr = invoiceItemColumns.has('unit_price') ? 'COALESCE(ii_all.unit_price, 0)' : '0';
    const batchCardsExpr = batchColumns.has('total_cards')
      ? `COALESCE(NULLIF(b.total_cards, 0), ${batchColumns.has('available_cards') ? 'b.available_cards' : '0'}, 0)`
      : batchColumns.has('available_cards')
        ? 'COALESCE(b.available_cards, 0)'
        : '0';
    const categoryPriceExpr = categoryColumns.has('price')
      ? 'COALESCE(c.price, 0)'
      : categoryColumns.has('value')
        ? 'COALESCE(c.value, 0)'
        : categoryColumns.has('amount')
          ? 'COALESCE(c.amount, 0)'
          : '0';
    const totalPriceExpr = invoiceItemColumns.has('total_amount')
      ? 'COALESCE(ii.total_amount, 0)'
      : invoiceItemColumns.has('total_price')
        ? 'COALESCE(ii.total_price, 0)'
        : '0';
    const allTotalPriceExpr = invoiceItemColumns.has('total_amount')
      ? 'COALESCE(ii_all.total_amount, 0)'
      : invoiceItemColumns.has('total_price')
        ? 'COALESCE(ii_all.total_price, 0)'
        : '0';
    const itemAmountExpr = `CASE WHEN ${totalPriceExpr} > 0 THEN ${totalPriceExpr} ELSE ${quantityExpr} * ${unitPriceExpr} END`;
    const allItemAmountExpr = `CASE WHEN ${allTotalPriceExpr} > 0 THEN ${allTotalPriceExpr} ELSE ${allQuantityExpr} * ${allUnitPriceExpr} END`;

    const invoiceActiveClause = buildActiveInvoiceClause('i', invoiceColumns);
    const walletInvoiceActiveClause = buildActiveInvoiceClause('i2', invoiceColumns);
    const collectionActiveClause = buildActiveCollectionClause('col', collectionColumns);
    const invoiceItemActiveClause = [
      invoiceItemColumns.has('is_deleted') ? 'COALESCE(ii.is_deleted, 0) = 0' : null,
      invoiceItemColumns.has('deleted_at') ? 'ii.deleted_at IS NULL' : null,
      invoiceItemColumns.has('active') ? "(ii.active = 1 OR ii.active IS NULL OR ii.active = 'true')" : null,
    ].filter(Boolean).join(' AND ') || '1=1';
    const allInvoiceItemActiveClause = [
      invoiceItemColumns.has('is_deleted') ? 'COALESCE(ii_all.is_deleted, 0) = 0' : null,
      invoiceItemColumns.has('deleted_at') ? 'ii_all.deleted_at IS NULL' : null,
      invoiceItemColumns.has('active') ? "(ii_all.active = 1 OR ii_all.active IS NULL OR ii_all.active = 'true')" : null,
    ].filter(Boolean).join(' AND ') || '1=1';
    const walletInvoiceItemActiveClause = [
      invoiceItemColumns.has('is_deleted') ? 'COALESCE(ii2.is_deleted, 0) = 0' : null,
      invoiceItemColumns.has('deleted_at') ? 'ii2.deleted_at IS NULL' : null,
      invoiceItemColumns.has('active') ? "(ii2.active = 1 OR ii2.active IS NULL OR ii2.active = 'true')" : null,
    ].filter(Boolean).join(' AND ') || '1=1';

    const invoiceJoinFilters = [invoiceActiveClause, invoiceItemActiveClause];
    const invoiceJoinParams = [];
    if (filters.project_id && invoiceColumns.has('project_id')) {
      invoiceJoinFilters.push('i.project_id = ?');
      invoiceJoinParams.push(filters.project_id);
    }
    if (filters.phase_id && invoiceColumns.has('phase_id')) {
      invoiceJoinFilters.push(LEGACY_PHASE_CLAUSE('i'));
      invoiceJoinParams.push(filters.phase_id);
    }

    const walletSaleFilters = [walletInvoiceActiveClause, walletInvoiceItemActiveClause];
    const walletSaleParams = [];
    if (filters.project_id && invoiceColumns.has('project_id')) {
      walletSaleFilters.push('i2.project_id = ?');
      walletSaleParams.push(filters.project_id);
    }
    if (filters.phase_id && invoiceColumns.has('phase_id')) {
      walletSaleFilters.push(LEGACY_PHASE_CLAUSE('i2'));
      walletSaleParams.push(filters.phase_id);
    }

    const walletFilters = ['aw.batch_id = ?'];
    const walletParams = [batchId];
    if (filters.project_id) {
      walletFilters.push('aw.project_id = ?');
      walletParams.push(filters.project_id);
    }
    if (filters.phase_id) {
      walletFilters.push(LEGACY_PHASE_CLAUSE('aw'));
      walletParams.push(filters.phase_id);
    }

    const activeCollectionFilters = [collectionActiveClause];
    const activeCollectionParams = [];
    if (filters.project_id && collectionColumns.has('project_id')) {
      activeCollectionFilters.push('col.project_id = ?');
      activeCollectionParams.push(filters.project_id);
    }
    if (filters.phase_id && collectionColumns.has('phase_id')) {
      activeCollectionFilters.push('col.phase_id = ?');
      activeCollectionParams.push(filters.phase_id);
    }
    const activeCollectionSql = activeCollectionFilters.join(' AND ');
    const collectionIdExpr = collectionColumns.has('id') ? 'col.id' : 'NULL';

    // Get sample invoice_items for debugging
    const sampleColumns = [
      invoiceItemColumns.has('id') ? 'id' : 'NULL AS id',
      invoiceItemColumns.has('invoice_id') ? 'invoice_id' : 'NULL AS invoice_id',
      invoiceItemColumns.has('batch_id') ? 'batch_id' : 'NULL AS batch_id',
      invoiceItemColumns.has('category_id') ? 'category_id' : 'NULL AS category_id',
      invoiceItemColumns.has('quantity') ? 'quantity' : 'NULL AS quantity',
      invoiceItemColumns.has('unit_price') ? 'unit_price' : 'NULL AS unit_price',
      invoiceItemColumns.has('total_price') ? 'total_price' : null,
      invoiceItemColumns.has('total_amount') ? 'total_amount' : null,
      invoiceItemColumns.has('deleted_at') ? 'deleted_at' : 'NULL AS deleted_at',
      invoiceItemColumns.has('is_deleted') ? 'is_deleted' : 'NULL AS is_deleted',
    ].filter(Boolean).join(', ');
    const sampleR = await execSQL(
      `SELECT ${sampleColumns}
       FROM invoice_items
       WHERE batch_id = ?
       LIMIT 10`,
      [batchId]
    );
    console.log('[InventoryFinancialInvoiceItemsSample]', {
      batch_id: batchId,
      row_count_sample: sampleR.rows._array?.length || 0,
      rows: sampleR.rows._array || [],
    });

    // Calculate total sales for this batch (sum of all active invoice_items linked to this batch)
    const batchSalesQuery = `
      SELECT
         ii.batch_id,
         SUM(${itemAmountExpr}) AS sales_value,
         SUM(${quantityExpr}) AS sold_qty
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE ii.batch_id = ?
         AND ${invoiceJoinFilters.join(' AND ')}
       GROUP BY ii.batch_id`;
    console.log('[InventoryFinancial] Sales Query:', batchSalesQuery);
    const batchSalesR = await execSQL(batchSalesQuery, [batchId, ...invoiceJoinParams]);

    const batchSales = batchSalesR.rows._array[0] || { sales_value: 0, sold_qty: 0 };
    const sales = Number(batchSales.sales_value || 0);
    const soldQty = Number(batchSales.sold_qty || 0);

    const batchCollectionsR = await execSQL(
      `SELECT
         SUM(
           CASE
             WHEN NOT (${activeCollectionSql}) OR COALESCE(invoice_totals.invoice_items_total, 0) <= 0 THEN 0
             ELSE COALESCE(col.amount, 0) * (batch_invoice_totals.batch_items_total / invoice_totals.invoice_items_total)
           END
         ) AS total_collections,
         GROUP_CONCAT(DISTINCT CASE WHEN ${activeCollectionSql} THEN ${collectionIdExpr} END) AS collection_ids,
         SUM(CASE WHEN ${activeCollectionSql} THEN 0 ELSE 1 END) AS excluded_collections_count
       FROM (
         SELECT ii.invoice_id, SUM(${itemAmountExpr}) AS batch_items_total
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         WHERE ii.batch_id = ?
           AND ${invoiceJoinFilters.join(' AND ')}
         GROUP BY ii.invoice_id
       ) batch_invoice_totals
       JOIN (
         SELECT ii_all.invoice_id, SUM(${allItemAmountExpr}) AS invoice_items_total
         FROM invoice_items ii_all
         JOIN (
           SELECT DISTINCT ii.invoice_id
           FROM invoice_items ii
           JOIN invoices i ON i.id = ii.invoice_id
           WHERE ii.batch_id = ?
             AND ${invoiceJoinFilters.join(' AND ')}
         ) batch_invoices ON batch_invoices.invoice_id = ii_all.invoice_id
         WHERE ${allInvoiceItemActiveClause}
         GROUP BY ii_all.invoice_id
       ) invoice_totals ON invoice_totals.invoice_id = batch_invoice_totals.invoice_id
       JOIN collections col ON col.invoice_id = batch_invoice_totals.invoice_id
       JOIN invoices i ON i.id = col.invoice_id
       WHERE ${buildActiveInvoiceClause('i', invoiceColumns)}`,
      [
        ...activeCollectionParams,
        ...activeCollectionParams,
        ...activeCollectionParams,
        batchId,
        ...invoiceJoinParams,
        batchId,
        ...invoiceJoinParams,
      ]
    );

    const batchCollections = batchCollectionsR.rows._array[0] || { total_collections: 0, collection_ids: '', excluded_collections_count: 0 };
    const totalCollections = Number(batchCollections.total_collections || 0);
    const collectionIds = batchCollections.collection_ids ? batchCollections.collection_ids.split(',') : [];
    const excludedCollectionsCount = Number(batchCollections.excluded_collections_count || 0);

    const collections = totalCollections > sales + 0.01 ? sales : totalCollections;

    // Get batch details first
    const batchQuery = `
      SELECT
        b.id,
        COALESCE(b.total_cards, 0) as total_cards,
        COALESCE(b.available_cards, 0) as available_cards,
        c.price as unit_price
      FROM batches b
      LEFT JOIN card_categories c ON c.id = b.category_id
      WHERE b.id = ?`;
    console.log('[InventoryFinancial] Batch Query:', batchQuery);
    const batchR = await execSQL(batchQuery, [batchId]);
    const batch = batchR.rows._array[0] || {};
    const unitPrice = Number(batch.unit_price || 0);
    const totalCards = Number(batch.total_cards || 0);
    const totalValue = totalCards * unitPrice;

    // Calculate wallet remaining
    const walletRemainingR = await execSQL(
      `SELECT
           SUM(COALESCE(aw.total_cards, 0)) AS wallet_distributed_total,
           SUM(MAX(0, aw.total_cards - COALESCE(ws.sold_qty, 0))) AS wallet_remaining_total
         FROM agent_wallets aw
         LEFT JOIN (
           SELECT ii2.wallet_id, SUM(${walletQuantityExpr}) as sold_qty
           FROM invoice_items ii2
           JOIN invoices i2 ON i2.id = ii2.invoice_id
           WHERE ${walletSaleFilters.join(' AND ')}
           GROUP BY ii2.wallet_id
         ) ws ON ws.wallet_id = aw.id
         WHERE ${walletFilters.join(' AND ')}`,
      [...walletSaleParams, ...walletParams]
    );

    const walletRemaining = walletRemainingR.rows._array[0] || { wallet_distributed_total: 0, wallet_remaining_total: 0 };
    const walletDistributed = Number(walletRemaining.wallet_distributed_total || 0);
    const walletRemainingQty = Number(walletRemaining.wallet_remaining_total || 0);

    const remainingAmount = Math.max(0, totalValue - collections);
    const collectionProgressPct = totalValue > 0 ? Math.min(100, (collections / totalValue) * 100) : 0;

    let collectionStatus = 'none';
    if (totalValue > 0 && collections > 0) {
      collectionStatus = collections >= (totalValue - 0.01) ? 'full' : 'partial';
    }

    if (totalCollections > sales + 0.01) {
      console.log('[InventoryFinancialValidation]', {
        batch_id: batchId,
        collection_ids_counted: collectionIds,
        total_sales_value: sales,
        allocated_total_collections_value: totalCollections,
        displayed_total_collections_value: collections,
      });
    }

    console.log('[InventoryFinancial]', {
      batch_id: batchId,
      project_id: filters.project_id || null,
      phase_id: filters.phase_id || null,
      category_price: unitPrice,
      batch_cards_count: totalCards,
      batch_total_value: totalValue,
      total_sales_value: sales,
      raw_total_collections_value: totalCollections,
      allocated_total_collections_value: totalCollections,
      total_collections_value: collections,
      remaining_collection: remainingAmount,
      collection_ids_counted: collectionIds,
      deleted_rejected_collections_excluded_count: excludedCollectionsCount,
    });

    // Temporary logs for debugging zero values
    console.log('[InventoryFinancialDebug]', {
      batch_id: batchId,
      category_price: unitPrice,
      batch_cards_count: totalCards,
      batch_total_value: totalValue,
      total_sales_value: sales,
      total_collections_value: collections,
      remaining_collection: remainingAmount,
      has_sales: sales > 0,
      has_collections: collections > 0,
      has_batch_value: totalValue > 0,
    });

    // Log for comparing with Batch Movement Report
    console.log('[InventoryMovementCollectionsCompare]', {
      batch_id: batchId,
      inventory_collections_total: collections,
      counted_collection_ids: collectionIds,
      excluded_collection_count: excludedCollectionsCount,
    });

    return {
      unitPrice,
      totalValue,
      totalSalesValue: sales,
      totalCollectionsValue: collections,
      rawTotalCollectionsValue: totalCollections,
      remainingAmount,
      collectionProgressPct,
      collectionStatus,
      sales,
      collections,
      collectionIds,
      excludedCollectionsCount,
      uncollected: remainingAmount,
      walletDistributed,
      walletRemaining: walletRemainingQty,
      soldQty,
      hasActiveSalesOrDistribution: soldQty > 0 || sales > 0 || collections > 0 || walletDistributed > 0 || walletRemainingQty > 0,
    };
  });
};

export const getInventoryGlobalTotals = async (filters = {}) => {
  const rows = await getInventoryBatchAvailabilityRows(filters);
  const row = rows.reduce((acc, item) => {
    acc.total_all += Number(item.total_qty || 0);
    acc.sold_all += Number(item.sold_qty || 0);
    acc.remaining_all += Number(item.remaining_qty || 0);
    return acc;
  }, { total_all: 0, sold_all: 0, remaining_all: 0 });
  return {
    total: Number(row.total_all || 0),
    sold: Number(row.sold_all || 0),
    remaining: Number(row.remaining_all || 0)
  };
};

export const getInventoryCategoryHealth = async (filters = {}) => {
  const rows = await getInventoryBatchAvailabilityRows(filters);
  const grouped = new Map();

  rows.forEach((row, index) => {
    const name = String(row.category_name || 'غير معروف').trim() || 'غير معروف';
    const key = name.toLowerCase();
    const current = grouped.get(key) || {
      id: row.category_id || `inventory-category-${index}`,
      name,
      total: 0,
      sold: 0,
      remaining: 0,
    };

    current.total += Number(row.total_qty || 0);
    current.sold += Number(row.sold_qty || 0);
    current.remaining += Number(row.remaining_qty || 0);
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .filter(row => row.total > 0 || row.remaining > 0 || row.sold > 0)
    .sort((a, b) => {
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return a.name.localeCompare(b.name, 'ar');
    });
};
