import { execSQL, withTransaction, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';
import { getCached } from './cacheService';
import { backfillOperationsFromSyncQueue } from './operationLogger';

const loggedWalletBalanceWarnings = new Set();
const ACTIVE_INVOICE_CLAUSE = (alias) => `(COALESCE(${alias}.is_deleted, 0) = 0 AND ${alias}.deleted_at IS NULL AND (${alias}.active = 1 OR ${alias}.active IS NULL OR ${alias}.active = 'true'))`;

const getUserBasic = async (userId) => {
  if (!userId) return null;
  const r = await execSQL(`SELECT id, name, role FROM users WHERE id = ? LIMIT 1`, [userId]);
  return r.rows._array?.[0] || null;
};

export const getAgentWalletsDetailed = async (projectId = null, phaseId = null) => {
  return getCached(`agent_wallets:detailed:${projectId}:${phaseId}`, async () => {
    let sql = `SELECT
      aw.id, aw.agent_id, aw.batch_id, aw.category_id, aw.total_cards, aw.issued_by, aw.notes, aw.created_at, aw.synced,
      COALESCE(ws.sold_qty, 0) as sold_cards,
      MAX(0, aw.total_cards - COALESCE(ws.sold_qty, 0)) as remaining_cards,
      u.name as agent_name, c.name as category_name, c.price as category_price, b.batch_number, b.serial_number as batch_serial, b.received_date as batch_date, b.available_cards as batch_available, b.total_cards as batch_total
      FROM agent_wallets aw
      JOIN users u ON u.id = aw.agent_id
      LEFT JOIN card_categories c ON c.id = aw.category_id
      LEFT JOIN batches b ON b.id = aw.batch_id
      LEFT JOIN (
        SELECT ii.wallet_id, SUM(ii.quantity) as sold_qty
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        WHERE ${ACTIVE_INVOICE_CLAUSE('i')}
        GROUP BY ii.wallet_id
      ) ws ON ws.wallet_id = aw.id
      WHERE MAX(0, aw.total_cards - COALESCE(ws.sold_qty, 0)) > 0`;
    
    const params = [];
    if (projectId) { sql += ` AND aw.project_id = ?`; params.push(projectId); }
    if (phaseId) { sql += ` AND aw.phase_id = ?`; params.push(phaseId); }
    
    sql += ` ORDER BY u.name ASC, aw.created_at DESC`;
    const r = await execSQL(sql, params);
    return r.rows._array || [];
  });
};

export const transferAgentWalletToStorage = async (walletId, qtyToReturn = null, actorId = null) => {
  // ── All DB operations inside ONE atomic transaction ──
  const result = await withTransaction(function* () {
    // 1) Read wallet with derived sold_cards
    const wR = yield {
      sql: `SELECT aw.*, COALESCE(ws.sold_qty, 0) as sold_cards_derived
       FROM agent_wallets aw
       LEFT JOIN (
         SELECT ii.wallet_id, SUM(ii.quantity) as sold_qty
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         WHERE ${ACTIVE_INVOICE_CLAUSE('i')}
         GROUP BY ii.wallet_id
       ) ws ON ws.wallet_id = aw.id
       WHERE aw.id = ?`,
      params: [walletId]
    };
    const wallet = wR.rows._array[0];
    if (!wallet) throw new Error('المحفظة غير موجودة');
    const remaining = (wallet.total_cards || 0) - (wallet.sold_cards_derived || 0);
    if (remaining <= 0) throw new Error('لا توجد أوراق متبقية للاسترجاع');
    const returnQty = qtyToReturn ? Math.min(qtyToReturn, remaining) : remaining;

    // 2) Update batch available_cards + sync_queue (inside same tx)
    if (wallet.batch_id) {
      yield {
        sql: `UPDATE batches SET available_cards = available_cards + ?, synced = 0 WHERE id = ?`,
        params: [returnQty, wallet.batch_id]
      };
      const bR = yield {
        sql: `SELECT available_cards FROM batches WHERE id = ?`,
        params: [wallet.batch_id]
      };
      if (bR.rows._array.length > 0) {
        yield {
          sql: `INSERT INTO sync_queue (table_name, operation, payload, record_id, attempts, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))`,
          params: ['batches', 'UPDATE', JSON.stringify({ available_cards: bR.rows._array[0].available_cards }), wallet.batch_id]
        };
      }
    }

    // 3) Update wallet total_cards + sync_queue (inside same tx)
    const newTotal = wallet.total_cards - returnQty;
    yield {
      sql: `UPDATE agent_wallets SET total_cards = ?, synced = 0 WHERE id = ?`,
      params: [newTotal, walletId]
    };
    yield {
      sql: `INSERT INTO sync_queue (table_name, operation, payload, record_id, attempts, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))`,
      params: ['agent_wallets', 'UPDATE', JSON.stringify({ total_cards: newTotal }), walletId]
    };

    return { returnedQty: returnQty, newTotal, wallet };
  });

  // ── Notifications fire ONLY after successful transaction commit ──
  notifyDataChanged('agent_wallets');
  notifyDataChanged('batches');
  notifyDataChanged('sync_queue');
  await backfillOperationsFromSyncQueue(50);

  try {
    const actor = await getUserBasic(actorId || result.wallet.issued_by);
    const agent = await getUserBasic(result.wallet.agent_id);
    const categoryInfo = await execSQL(`SELECT name FROM card_categories WHERE id=? LIMIT 1`, [result.wallet.category_id]);
    const catName = categoryInfo.rows._array[0]?.name || 'كروت';
    const actorName = actor?.name || 'مستخدم النظام';
    const agentName = agent?.name || 'غير محدد';
    const { triggerAppNotification } = require('./NotificationService');
    await triggerAppNotification({
      type: 'return',
      actor: actorName,
      count: result.returnedQty,
      category: catName,
      agent: agentName,
      reference_id: walletId,
      projectId: result.wallet.project_id || null,
      targetRoles: ['admin', 'agent'],
      targetUserIds: result.wallet.agent_id ? [result.wallet.agent_id] : [],
      excludeUserIds: actor?.id ? [actor.id] : [],
    });
  } catch (e) { }

  return { returnedQty: result.returnedQty, newTotal: result.newTotal };
};

export const createAgentWallet = async (data) => {
  const id = data.id || uuidv4();
  const payload = { id, agent_id: data.agent_id, batch_id: data.batch_id, category_id: data.category_id, total_cards: Number(data.total_cards || 0), sold_cards: Number(data.sold_cards || 0), issued_by: data.issued_by, notes: data.notes || '', created_at: data.created_at || new Date().toISOString(), synced: 0 };
  await execSQL(`INSERT OR REPLACE INTO agent_wallets (id, agent_id, batch_id, category_id, total_cards, sold_cards, issued_by, notes, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.agent_id, payload.batch_id, payload.category_id, payload.total_cards, payload.sold_cards, payload.issued_by, payload.notes, payload.created_at, payload.synced]);
  await addToSyncQueue('agent_wallets', 'INSERT', payload, id);
  notifyDataChanged('agent_wallets', payload);
  return payload;
};

export const getWalletsSummaryByAgent = async (projectId = null, phaseId = null) => {
  return getCached(`agent_wallets:summary:${projectId}:${phaseId}`, async () => {
    let sql = `
      SELECT
        u.id as agent_id,
        u.name as agent_name,
        SUM(aw.total_cards) as total_cards,
        SUM(COALESCE(ws.sold_qty, 0)) as sold_cards,
        SUM(MAX(0, aw.total_cards - COALESCE(ws.sold_qty, 0))) as remaining_cards,
        COUNT(aw.id) as wallet_count
      FROM agent_wallets aw
      JOIN users u ON u.id = aw.agent_id
      LEFT JOIN (
        SELECT ii.wallet_id, SUM(ii.quantity) as sold_qty
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        WHERE ${ACTIVE_INVOICE_CLAUSE('i')}
        GROUP BY ii.wallet_id
      ) ws ON ws.wallet_id = aw.id
      WHERE 1=1`;
    
    const params = [];
    if (projectId) { sql += ` AND aw.project_id = ?`; params.push(projectId); }
    if (phaseId) { sql += ` AND aw.phase_id = ?`; params.push(phaseId); }
    
    sql += ` GROUP BY u.id, u.name`;
    const r = await execSQL(sql, params);
    return r.rows._array || [];
  });
};

export const getWalletMovements = async (agentId, filters = {}) => {
  const cacheKey = `wallet_movements:${agentId}:${JSON.stringify(filters)}`;
  return getCached(cacheKey, async () => {
    let sql = `SELECT ii.*, i.invoice_number, i.invoice_date, p.name as pos_name, c.name as category_name, b.batch_number as batch_number, distributor.name as distributor_name FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id JOIN pos_customers p ON p.id = i.pos_id JOIN card_categories c ON c.id = ii.category_id LEFT JOIN batches b ON b.id = ii.batch_id LEFT JOIN agent_wallets aw ON aw.id = ii.wallet_id LEFT JOIN users distributor ON distributor.id = aw.issued_by WHERE i.agent_id = ? AND ${ACTIVE_INVOICE_CLAUSE('i')} AND ii.wallet_id IS NOT NULL`;
    const params = [agentId];
    if (filters.category_id) { sql += ` AND ii.category_id = ?`; params.push(filters.category_id); }
    if (filters.batch_id) { sql += ` AND ii.batch_id = ?`; params.push(filters.batch_id); }
    if (filters.pos_id) { sql += ` AND i.pos_id = ?`; params.push(filters.pos_id); }
    if (filters.date) { sql += ` AND i.invoice_date = ?`; params.push(filters.date); }
    if (filters.project_id) { sql += ` AND i.project_id = ?`; params.push(filters.project_id); }
    if (filters.phase_id) { sql += ` AND i.phase_id = ?`; params.push(filters.phase_id); }
    sql += ` ORDER BY i.created_at DESC`;
    const r = await execSQL(sql, params);
    return r.rows._array || [];
  });
};

export const getLocalWallets = async (agentId, projectId = null, phaseId = null) => {
  const cacheKey = `agent_wallets:agent:${agentId}:${projectId}:${phaseId}`;
  return getCached(cacheKey, async () => {
    let sql = `SELECT
      aw.id, aw.agent_id, aw.batch_id, aw.category_id, aw.total_cards, aw.issued_by, aw.notes, aw.created_at, aw.synced,
      COALESCE(ws.sold_qty, 0) as sold_cards,
      MAX(0, aw.total_cards - COALESCE(ws.sold_qty, 0)) as remaining_cards,
      u.name as user_name, c.name as category_name, b.batch_number as batch_number, b.serial_number as batch_serial
      FROM agent_wallets aw
      LEFT JOIN users u ON u.id = aw.agent_id
      LEFT JOIN card_categories c ON c.id = aw.category_id
      LEFT JOIN batches b ON b.id = aw.batch_id
      LEFT JOIN (
        SELECT ii.wallet_id, SUM(ii.quantity) as sold_qty
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        WHERE ${ACTIVE_INVOICE_CLAUSE('i')}
        GROUP BY ii.wallet_id
      ) ws ON ws.wallet_id = aw.id
      WHERE 1=1`;
    const params = [];
    if (agentId) { sql += ` AND aw.agent_id = ?`; params.push(agentId); }
    if (projectId) { sql += ` AND aw.project_id = ?`; params.push(projectId); }
    if (phaseId) { sql += ` AND aw.phase_id = ?`; params.push(phaseId); }
    sql += ` ORDER BY aw.created_at DESC`;
    const r = await execSQL(sql, params);
    return (r.rows._array || []).map(row => ({ ...row, users: { name: row.user_name }, card_categories: { name: row.category_name }, batches: { batch_number: row.batch_number, serial_number: row.batch_serial } }));
  });
};

export const getAgentWalletCategoryBalances = async (agentId, projectId = null, phaseId = null) => {
  const cacheKey = `agent_wallets:category_balances:${agentId}:${projectId}:${phaseId}`;
  return getCached(cacheKey, async () => {
    let categoryWhere = `(c.active = 1 OR c.active IS NULL)`;
    const params = [];

    if (projectId) {
      categoryWhere += ` AND c.project_id = ?`;
      params.push(projectId);
    }

    let walletWhere = `aw.agent_id = ?`;
    const walletParams = [agentId];
    if (projectId) {
      walletWhere += ` AND aw.project_id = ?`;
      walletParams.push(projectId);
    }
    if (phaseId) {
      walletWhere += ` AND aw.phase_id = ?`;
      walletParams.push(phaseId);
    }

    let walletSoldWhere = `aw.agent_id = ? AND ${ACTIVE_INVOICE_CLAUSE('i')}`;
    const soldParams = [agentId];
    if (projectId) {
      walletSoldWhere += ` AND i.project_id = ? AND aw.project_id = ?`;
      soldParams.push(projectId);
      soldParams.push(projectId);
    }
    if (phaseId) {
      walletSoldWhere += ` AND i.phase_id = ? AND aw.phase_id = ?`;
      soldParams.push(phaseId);
      soldParams.push(phaseId);
    }

    const sql = `
      SELECT
        c.id as category_id,
        c.name as category_name,
        c.price as category_price,
        COALESCE(w.assigned_cards, 0) as assigned_cards,
        COALESCE(w.sold_cards, 0) as sold_cards,
        COALESCE(w.remaining_cards, 0) as remaining_cards,
        COALESCE(w.wallet_rows, 0) as wallet_rows
      FROM card_categories c
      LEFT JOIN (
        SELECT
          x.category_id,
          SUM(x.total_cards) as assigned_cards,
          SUM(x.sold_cards) as sold_cards,
          SUM(MAX(0, x.total_cards - x.sold_cards)) as remaining_cards,
          COUNT(x.wallet_id) as wallet_rows
        FROM (
          SELECT
            aw.id as wallet_id,
            aw.category_id,
            COALESCE(aw.total_cards, 0) as total_cards,
            COALESCE(ws.sold_qty, 0) as sold_cards
          FROM agent_wallets aw
          LEFT JOIN (
            SELECT
              ii.wallet_id,
              SUM(COALESCE(ii.quantity, 0)) as sold_qty
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            JOIN agent_wallets aw ON aw.id = ii.wallet_id
            WHERE ${walletSoldWhere}
            GROUP BY ii.wallet_id
          ) ws ON ws.wallet_id = aw.id
          WHERE ${walletWhere}
        ) x
        GROUP BY x.category_id
      ) w ON w.category_id = c.id
      WHERE ${categoryWhere}
      ORDER BY c.price ASC, c.name ASC
    `;

    const r = await execSQL(sql, [...soldParams, ...walletParams, ...params]);
    const rows = r.rows._array || [];

    rows.forEach((row) => {
      const assignedCards = Number(row.assigned_cards || 0);
      const soldCards = Number(row.sold_cards || 0);
      const rawRemaining = assignedCards - soldCards;
      if (rawRemaining < 0) {
        const logKey = `${agentId}:${projectId || 'global'}:${phaseId || 'all'}:${row.category_id}:${assignedCards}:${soldCards}`;
        if (!loggedWalletBalanceWarnings.has(logKey)) {
          loggedWalletBalanceWarnings.add(logKey);
          console.debug(`[Wallet:CategoryBalance] Inconsistent wallet aggregate detected ${JSON.stringify({
            agent_id: agentId,
            project_id: projectId || null,
            phase_id: phaseId || null,
            category_id: row.category_id,
            category_name: row.category_name,
            assigned_cards: assignedCards,
            sold_cards: soldCards,
            raw_remaining: rawRemaining,
            remaining_cards: Math.max(0, Number(row.remaining_cards || 0)),
          })}`);
        }
      }
    });

    return rows.map(row => ({
      ...row,
      remaining_cards: Math.max(0, Number(row.remaining_cards || 0)),
    }));
  });
};

export const createLocalAgentWallet = async (data) => {
  const id = uuidv4();
  const payload = { id, agent_id: data.agent_id, batch_id: data.batch_id, category_id: data.category_id, total_cards: data.total_cards, sold_cards: 0, issued_by: data.issued_by, notes: data.notes || '', created_at: new Date().toISOString(), synced: 0, project_id: data.project_id, phase_id: data.phase_id };

  // ── All DB operations inside ONE atomic transaction ──
  await withTransaction(function* () {
    // 1) Insert wallet
    yield {
      sql: `INSERT INTO agent_wallets (id, agent_id, batch_id, category_id, total_cards, sold_cards, issued_by, notes, created_at, synced, project_id, phase_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [payload.id, payload.agent_id, payload.batch_id, payload.category_id, payload.total_cards, payload.sold_cards, payload.issued_by, payload.notes, payload.created_at, payload.synced, payload.project_id, payload.phase_id]
    };

    // 2) Sync queue entry for wallet (inside same tx)
    yield {
      sql: `INSERT INTO sync_queue (table_name, operation, payload, record_id, attempts, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))`,
      params: ['agent_wallets', 'INSERT', JSON.stringify(payload), id]
    };

    // 3) Deduct batch available_cards + sync_queue (inside same tx)
    const batchQuery = yield {
      sql: `SELECT available_cards FROM batches WHERE id = ?`,
      params: [payload.batch_id]
    };
    if (batchQuery.rows._array.length > 0) {
      const newAvailable = Math.max(0, batchQuery.rows._array[0].available_cards - payload.total_cards);
      yield {
        sql: `UPDATE batches SET available_cards = ?, synced = 0 WHERE id = ?`,
        params: [newAvailable, payload.batch_id]
      };
      yield {
        sql: `INSERT INTO sync_queue (table_name, operation, payload, record_id, attempts, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))`,
        params: ['batches', 'UPDATE', JSON.stringify({ available_cards: newAvailable }), payload.batch_id]
      };
    }
  });

  // ── Notifications fire ONLY after successful transaction commit ──
  notifyDataChanged('agent_wallets');
  notifyDataChanged('batches');
  notifyDataChanged('sync_queue');
  await backfillOperationsFromSyncQueue(50);

  try {
    const issuer = await getUserBasic(payload.issued_by);
    const assignee = await getUserBasic(payload.agent_id);
    const categoryInfo = await execSQL(`SELECT name FROM card_categories WHERE id=? LIMIT 1`, [payload.category_id]);
    const catName = categoryInfo.rows._array[0]?.name || 'كروت';
    const issuerName = issuer?.name || 'الإدارة';
    const { triggerAppNotification } = require('./NotificationService');
    await triggerAppNotification({
      type: 'distribution',
      actor: issuerName,
      count: payload.total_cards,
      category: catName,
      agent: assignee?.name || 'غير محدد',
      reference_id: id,
      projectId: payload.project_id || null,
      targetRoles: ['admin', 'agent'],
      targetUserIds: payload.agent_id ? [payload.agent_id] : [],
      excludeUserIds: issuer?.id ? [issuer.id] : [],
    });
  } catch (e) { }
};

export const updateLocalWalletCards = async (walletId, qtySold) => {
  // DO NOT USE – wallet updates must follow invoice_items flow.
  throw new Error('updateLocalWalletCards is deprecated and blocked. DO NOT USE – wallet updates must follow invoice_items flow.');
};

export const getBatchesByAgent = async (agentId, projectId = null, phaseId = null) => {
  const cacheKey = `batches:agent:${agentId}:${projectId}:${phaseId}`;
  return getCached(cacheKey, async () => {
    const sql = `
      SELECT
        b.id, b.batch_number, b.serial_number, c.name as category_name,
        MAX(0, aw.total_cards - COALESCE(ws.sold_qty, 0)) as available
      FROM agent_wallets aw
      JOIN batches b ON b.id = aw.batch_id
      LEFT JOIN card_categories c ON c.id = b.category_id
      LEFT JOIN (
        SELECT ii.wallet_id, SUM(ii.quantity) as sold_qty
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        WHERE ${ACTIVE_INVOICE_CLAUSE('i')}
        GROUP BY ii.wallet_id
      ) ws ON ws.wallet_id = aw.id
      WHERE aw.agent_id = ? AND MAX(0, aw.total_cards - COALESCE(ws.sold_qty, 0)) > 0
      ${projectId ? 'AND aw.project_id = ?' : ''}
      ${phaseId ? 'AND aw.phase_id = ?' : ''}
      ORDER BY b.created_at DESC
    `;
    const params = [agentId];
    if (projectId) params.push(projectId);
    if (phaseId) params.push(phaseId);
    const r = await execSQL(sql, params);
    return r.rows._array || [];
  });
};
