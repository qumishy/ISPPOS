import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabase('app.db');

let _online = false;
let _dataListeners = [];

export const setOnlineStatus = (status) => {
  _online = !!status;
};

export const isDbOnline = () => _online;

export const subscribeDataChanges = (fn) => {
  _dataListeners.push(fn);
  return () => {
    _dataListeners = _dataListeners.filter(x => x !== fn);
  };
};

export const notifyDataChanged = (type = 'all', payload = null) => {
  _dataListeners.forEach(fn => {
    try { fn({ type, payload, at: Date.now() }); } catch (e) {}
  });
};

export const execSQL = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        tx.executeSql(
          sql,
          params,
          (_, result) => {
            resolve(result);
          },
          (_, error) => {
            console.log("❌ SQL ERROR:", error);
            reject(error);
            return false;
          }
        );
      },
      (err) => {
        console.log("❌ TX ERROR:", err);
        reject(err);
      }
    );
  });

const uuidv4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });

export const addToSyncQueue = async (tableName, operation, payload, recordId = null) => {
  await execSQL(
    `INSERT INTO sync_queue (table_name, operation, payload, record_id, attempts, created_at)
     VALUES (?, ?, ?, ?, 0, datetime('now'))`,
    [tableName, operation, JSON.stringify(payload || {}), recordId]
  );
  notifyDataChanged('sync_queue');
};

export const getSyncQueueCount = async () => {
  const r = await execSQL(
    `SELECT COUNT(*) as count FROM sync_queue WHERE COALESCE(attempts,0) < 5`
  );
  return r.rows._array?.[0]?.count || 0;
};

const createTables = async () => {

  await execSQL(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    )
  `);

  await execSQL(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT,
      record_id TEXT,
      attempts INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ================= USERS =================
  await execSQL(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      username TEXT,
      role TEXT,
      phone TEXT,
      password_hash TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    )
  `);

  // ================= POS =================
  await execSQL(`
    CREATE TABLE IF NOT EXISTS pos_customers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      owner_name TEXT,
      phone TEXT,
      city TEXT,
      credit_limit REAL DEFAULT 0,
      credit_used REAL DEFAULT 0,
      is_blocked INTEGER DEFAULT 0,
      assigned_agent_id TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    )
  `);

  // ================= CATEGORIES =================
  await execSQL(`
    CREATE TABLE IF NOT EXISTS card_categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      price REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    )
  `);

  // ================= BATCHES =================
  await execSQL(`
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY NOT NULL,
      batch_number TEXT,
      category_id TEXT,
      serial_number TEXT,
      total_cards INTEGER DEFAULT 0,
      available_cards INTEGER DEFAULT 0,
      received_date TEXT,
      status TEXT DEFAULT 'active',
      active INTEGER DEFAULT 1,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    )
  `);

  // ================= INVOICES =================
  await execSQL(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY NOT NULL,
      invoice_number TEXT,
      pos_id TEXT,
      agent_id TEXT,
      type TEXT,
      total_amount REAL DEFAULT 0,
      net_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      invoice_date TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    )
  `);

  // ================= ITEMS =================
  await execSQL(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY NOT NULL,
      invoice_id TEXT,
      category_id TEXT,
      batch_id TEXT,
      wallet_id TEXT,
      from_card TEXT,
      to_card TEXT,
      quantity INTEGER DEFAULT 0,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    )
  `);

  // ================= COLLECTIONS =================
  await execSQL(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY NOT NULL,
      collection_number TEXT,
      agent_id TEXT,
      pos_id TEXT,
      invoice_id TEXT,
      amount REAL DEFAULT 0,
      method TEXT DEFAULT 'cash',
      reference_number TEXT,
      status TEXT DEFAULT 'pending',
      approved_at TEXT,
      rejection_reason TEXT,
      collection_date TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    )
  `);

  // ================= WALLET =================
  await execSQL(`
    CREATE TABLE IF NOT EXISTS agent_wallets (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT,
      batch_id TEXT,
      category_id TEXT,
      from_card TEXT,
      to_card TEXT,
      total_cards INTEGER DEFAULT 0,
      sold_cards INTEGER DEFAULT 0,
      issued_by TEXT,
      notes TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    )
  `);
};


// 🔥 First Run Reset (DEV)
const resetDatabaseOnce = async () => {
  try {
    await execSQL(`
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    const r = await execSQL(
      "SELECT value FROM app_config WHERE key='db_initialized'"
    );

    const initialized = r.rows._array[0]?.value === '1';

    if (!initialized) {
      console.log("🔥 FIRST RUN → RESET DB");

      // ❌ حذف الجداول مرة واحدة فقط
      await execSQL("DROP TABLE IF EXISTS users");
      await execSQL("DROP TABLE IF EXISTS pos_customers");
      await execSQL("DROP TABLE IF EXISTS card_categories");
      await execSQL("DROP TABLE IF EXISTS batches");
      await execSQL("DROP TABLE IF EXISTS invoices");
      await execSQL("DROP TABLE IF EXISTS invoice_items");
      await execSQL("DROP TABLE IF EXISTS collections");
      await execSQL("DROP TABLE IF EXISTS agent_wallets");
      await execSQL("DROP TABLE IF EXISTS sync_queue");
      await execSQL("DROP TABLE IF EXISTS sync_meta");

      await execSQL(
        "INSERT OR REPLACE INTO app_config (key,value) VALUES ('db_initialized','1')"
      );
    }

  } catch (e) {
    console.log("RESET ERROR:", e);
  }
};

export const initDatabase = async () => {
await resetDatabaseOnce(); // 🔥 أهم سطر
  await createTables();
  await execSQL(`INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('last_pull', '2000-01-01T00:00:00Z')`);
  await execSQL(`UPDATE sync_queue SET attempts = 0 WHERE COALESCE(attempts,0) >= 5`);
  return true;
};

export const getLocalInvoices = async (filters = {}) => {
  let sql = `
SELECT 
  i.*,
  u.name as agent_name,
  p.name as pos_name
FROM invoices i
LEFT JOIN users u ON u.id = i.agent_id
LEFT JOIN pos_customers p ON p.id = i.pos_id
WHERE 1=1
`;

  const params = [];

  if (filters.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }
  if (filters.agent_id) {
    sql += ` AND agent_id = ?`;
    params.push(filters.agent_id);
  }
  if (filters.pos_id) {
    sql += ` AND pos_id = ?`;
    params.push(filters.pos_id);
  }

  sql += ` ORDER BY created_at DESC`;

  const r = await execSQL(sql, params);
  return r.rows._array || [];
};

export const getLocalInvoiceItems = async (invoiceId) => {
  const r = await execSQL(
    `
    SELECT ii.*, c.name as category_name, b.batch_number
    FROM invoice_items ii
    LEFT JOIN card_categories c ON c.id = ii.category_id
    LEFT JOIN batches b ON b.id = ii.batch_id
    WHERE ii.invoice_id = ?
    ORDER BY ii.created_at ASC
    `,
    [invoiceId]
  );
  return r.rows._array || [];
};

export const createLocalInvoice = async (data) => {
  const id = data.id || uuidv4();
  const invoice_number =
    data.invoice_number || `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000) + 10000}`;
  const created_at = data.created_at || new Date().toISOString();
  const invoice_date = data.invoice_date || created_at;

  const payload = {
    id,
    invoice_number,
    pos_id: data.pos_id || null,
    agent_id: data.agent_id || null,
    type: data.type || 'credit',
    total_amount: Number(data.total_amount || 0),
    net_amount: Number(data.net_amount ?? data.total_amount ?? 0),
    paid_amount: Number(data.paid_amount || 0),
    status: data.status || 'pending',
    notes: data.notes || '',
    invoice_date,
    active: data.active ?? 1,
    created_at,
    synced: 0,
  };

  await execSQL(
    `INSERT OR REPLACE INTO invoices
    (id, invoice_number, pos_id, agent_id, type, total_amount, net_amount, paid_amount, status, notes, invoice_date, active, created_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id, payload.invoice_number, payload.pos_id, payload.agent_id, payload.type,
      payload.total_amount, payload.net_amount, payload.paid_amount, payload.status,
      payload.notes, payload.invoice_date, payload.active, payload.created_at, payload.synced
    ]
  );

  await addToSyncQueue('invoices', 'INSERT', payload, id);
  notifyDataChanged('invoices', payload);
  return payload;
};

export const addInvoiceItem = async (data) => {
  const id = data.id || uuidv4();
  const payload = {
    id,
    invoice_id: data.invoice_id,
    category_id: data.category_id || null,
    batch_id: data.batch_id || null,
    wallet_id: data.wallet_id || null,
    from_card: data.from_card || null,
    to_card: data.to_card || null,
    quantity: Number(data.quantity || 0),
    unit_price: Number(data.unit_price || 0),
    total_price: Number(data.total_price || 0),
    created_at: data.created_at || new Date().toISOString(),
    synced: 0,
  };

  await execSQL(
    `INSERT OR REPLACE INTO invoice_items
    (id, invoice_id, category_id, batch_id, wallet_id, from_card, to_card, quantity, unit_price, total_price, created_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id, payload.invoice_id, payload.category_id, payload.batch_id, payload.wallet_id,
      payload.from_card, payload.to_card, payload.quantity, payload.unit_price, payload.total_price,
      payload.created_at, payload.synced
    ]
  );

  await addToSyncQueue('invoice_items', 'INSERT', payload, id);
  notifyDataChanged('invoice_items', payload);
  return payload;
};

export const softDeleteInvoice = async (id) => {
  await execSQL(`UPDATE invoices SET active=0, status='deleted', synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('invoices', 'UPDATE', { active: 0, status: 'deleted' }, id);
  notifyDataChanged('invoices');
  return true;
};

export const getLocalCollections = async (filters = {}) => {
  let sql = `
SELECT 
  c.*,
  u.name as agent_name,
  p.name as pos_name,
  i.invoice_number
FROM collections c
LEFT JOIN users u ON u.id = c.agent_id
LEFT JOIN pos_customers p ON p.id = c.pos_id
LEFT JOIN invoices i ON i.id = c.invoice_id
WHERE 1=1
`;

  const params = [];

  if (filters.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }
  if (filters.agent_id) {
    sql += ` AND agent_id = ?`;
    params.push(filters.agent_id);
  }

  sql += ` ORDER BY created_at DESC`;

  const r = await execSQL(sql, params);
  return r.rows._array || [];
};

export const createLocalCollection = async (data) => {
  const id = data.id || uuidv4();
  const collection_number =
    data.collection_number || `COL-${Math.floor(Math.random() * 90000) + 10000}`;
  const payload = {
    id,
    collection_number,
    agent_id: data.agent_id || null,
    pos_id: data.pos_id || null,
    invoice_id: data.invoice_id || null,
    amount: Number(data.amount || 0),
    method: data.method || 'cash',
    reference_number: data.reference_number || '',
    status: data.status || 'pending',
    approved_at: data.approved_at || null,
    rejection_reason: data.rejection_reason || null,
    collection_date: data.collection_date || new Date().toISOString().slice(0, 10),
    active: data.active ?? 1,
    created_at: data.created_at || new Date().toISOString(),
    synced: 0,
  };

  await execSQL(
    `INSERT OR REPLACE INTO collections
    (id, collection_number, agent_id, pos_id, invoice_id, amount, method, reference_number, status, approved_at, rejection_reason, collection_date, active, created_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id, payload.collection_number, payload.agent_id, payload.pos_id, payload.invoice_id,
      payload.amount, payload.method, payload.reference_number, payload.status, payload.approved_at,
      payload.rejection_reason, payload.collection_date, payload.active, payload.created_at, payload.synced
    ]
  );

  await addToSyncQueue('collections', 'INSERT', payload, id);
  notifyDataChanged('collections', payload);
  return payload;
};

export const approveLocalCollection = async (id) => {
  const approved_at = new Date().toISOString();
  await execSQL(
    `UPDATE collections
     SET status='approved', approved_at=?, rejection_reason=NULL, synced=0
     WHERE id=?`,
    [approved_at, id]
  );
  await addToSyncQueue('collections', 'UPDATE', { status: 'approved', approved_at, rejection_reason: null }, id);
  notifyDataChanged('collections');
  return true;
};

export const rejectLocalCollection = async (id, reason = 'مرفوض') => {
  await execSQL(
    `UPDATE collections
     SET status='rejected', rejection_reason=?, synced=0
     WHERE id=?`,
    [reason, id]
  );
  await addToSyncQueue('collections', 'UPDATE', { status: 'rejected', rejection_reason: reason }, id);
  notifyDataChanged('collections');
  return true;
};

export const deleteLocalCollection = async (id) => {
  await execSQL('UPDATE collections SET active=0, synced=0 WHERE id=?', [id]);
  await addToSyncQueue('collections', 'UPDATE', { active: 0 }, id);
  notifyDataChanged('collections');
  return true;
};

export const createAgentWallet = async (data) => {
  const id = data.id || uuidv4();
  const payload = {
    id,
    agent_id: data.agent_id || null,
    batch_id: data.batch_id || null,
    category_id: data.category_id || null,
    from_card: data.from_card || null,
    to_card: data.to_card || null,
    total_cards: Number(data.total_cards || 0),
    sold_cards: Number(data.sold_cards || 0),
    issued_by: data.issued_by || null,
    notes: data.notes || '',
    created_at: data.created_at || new Date().toISOString(),
    synced: 0,
  };

  await execSQL(
    `INSERT OR REPLACE INTO agent_wallets
    (id, agent_id, batch_id, category_id, from_card, to_card, total_cards, sold_cards, issued_by, notes, created_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id, payload.agent_id, payload.batch_id, payload.category_id, payload.from_card,
      payload.to_card, payload.total_cards, payload.sold_cards, payload.issued_by,
      payload.notes, payload.created_at, payload.synced
    ]
  );

  await addToSyncQueue('agent_wallets', 'INSERT', payload, id);
  notifyDataChanged('agent_wallets', payload);
  return payload;
};

export const getLocalUsers = async () => {
  const r = await execSQL(`SELECT * FROM users ORDER BY name ASC`);
  return r.rows._array || [];
};

export const getLocalCategories = async () => {
  const r = await execSQL(`SELECT * FROM card_categories ORDER BY price ASC, name ASC`);
  return r.rows._array || [];
};

export const getLocalBatches = async () => {
  const r = await execSQL(`
    SELECT b.*, c.name as category_name
    FROM batches b
    LEFT JOIN card_categories c ON c.id = b.category_id
    ORDER BY b.created_at DESC
  `);
  return (r.rows._array || []).map(row => ({
    ...row,
    card_categories: { name: row.category_name },
  }));
};

export const getLocalPOS = async () => {
  const r = await execSQL(`SELECT * FROM pos_customers ORDER BY name ASC`);
  return r.rows._array || [];
};

export const updateCategory = async (id, data) => {
  await execSQL(
    `UPDATE card_categories
     SET name=?, price=?, is_active=?, synced=0
     WHERE id=?`,
    [data.name ?? null, Number(data.price || 0), data.is_active ?? 1, id]
  );
  await addToSyncQueue('card_categories', 'UPDATE', {
    name: data.name ?? null,
    price: Number(data.price || 0),
    is_active: data.is_active ?? 1,
  }, id);
  notifyDataChanged('card_categories');
  return true;
};

export const updateUser = async (id, data) => {
  await execSQL(
    `UPDATE users
     SET name=?, username=?, role=?, phone=?, is_active=?, password_hash=?, synced=0
     WHERE id=?`,
    [
      data.name ?? null,
      data.username ?? null,
      data.role ?? null,
      data.phone ?? null,
      data.is_active ?? 1,
      data.password_hash ?? null,
      id
    ]
  );
  await addToSyncQueue('users', 'UPDATE', {
    name: data.name ?? null,
    username: data.username ?? null,
    role: data.role ?? null,
    phone: data.phone ?? null,
    is_active: data.is_active ?? 1,
    password_hash: data.password_hash ?? null,
  }, id);
  notifyDataChanged('users');
  return true;
};

// ================= FILTERED BATCHES BY AGENT =================
export const getBatchesByAgent = async (agentId) => {
  const r = await execSQL(`
    SELECT 
      b.id,
      b.batch_number,
      b.serial_number,
      c.name as category_name,
      (aw.total_cards - aw.sold_cards) as available
    FROM agent_wallets aw
    JOIN batches b ON b.id = aw.batch_id
    LEFT JOIN card_categories c ON c.id = b.category_id
    WHERE aw.agent_id = ?
    AND (aw.total_cards - aw.sold_cards) > 0
    ORDER BY b.created_at DESC
  `, [agentId]);

  return r.rows._array || [];
};

export const isRecordInSyncQueue = async (id) => {
  const r = await execSQL(`SELECT id FROM sync_queue WHERE record_id=? LIMIT 1`, [id]);
  return (r.rows._array || []).length > 0;
};

export const getFailedSyncCount = async () => {
  try {
    const r = await execSQL(`SELECT COUNT(*) as count FROM sync_queue WHERE attempts >= 5`);
    return r.rows._array?.[0]?.count || 0;
  } catch (e) {
    return 0;
  }
};

export const resetFailedSyncItems = async () => {
  await execSQL(`UPDATE sync_queue SET attempts = 0 WHERE attempts >= 5`);
  notifyDataChanged('sync_queue');
};

export const updateLocalPOS = async (id, data) => {
  await execSQL(
    `UPDATE pos_customers SET name=?, owner_name=?, phone=?, city=?, credit_limit=?, assigned_agent_id=?, synced=0 WHERE id=?`,
    [data.name, data.owner_name, data.phone, data.city, data.credit_limit, data.assigned_agent_id, id]
  );
  await addToSyncQueue('pos_customers', 'UPDATE', data, id);
  notifyDataChanged('pos_customers');
};

export const toggleLocalPOSBlock = async (id, blocked) => {
  await execSQL(`UPDATE pos_customers SET is_blocked=?, synced=0 WHERE id=?`, [blocked ? 1 : 0, id]);
  await addToSyncQueue('pos_customers', 'UPDATE', { is_blocked: blocked }, id);
  notifyDataChanged('pos_customers');
};

export const updateLocalWalletCards = async (walletId, qtySold) => {
  await execSQL(`UPDATE agent_wallets SET sold_cards = sold_cards + ?, synced = 0 WHERE id = ?`, [qtySold, walletId]);
  const r = await execSQL(`SELECT sold_cards FROM agent_wallets WHERE id=?`, [walletId]);
  const currentSold = r.rows._array?.[0]?.sold_cards;
  await addToSyncQueue('agent_wallets', 'UPDATE', { sold_cards: currentSold }, walletId);
  notifyDataChanged('agent_wallets');
};

export const getLocalWallets = async (agentId) => {
  let sql = `
SELECT 
  aw.*,
  u.name as user_name,
  c.name as category_name,
  b.batch_number as batch_number,
  b.serial_number as batch_serial
FROM agent_wallets aw
LEFT JOIN users u ON u.id = aw.agent_id
LEFT JOIN card_categories c ON c.id = aw.category_id
LEFT JOIN batches b ON b.id = aw.batch_id
WHERE 1=1
`;
  const params = [];
  if (agentId) {
    sql += ` AND aw.agent_id = ?`;
    params.push(agentId);
  }
  sql += ` ORDER BY aw.created_at DESC`;

  const r = await execSQL(sql, params);
  
  return (r.rows._array || []).map(row => ({
    ...row,
    users: { name: row.user_name },
    card_categories: { name: row.category_name },
    batches: { batch_number: row.batch_number, serial_number: row.batch_serial }
  }));
};

export const createLocalAgentWallet = async (data) => {
  const id = uuidv4();
  const created_at = new Date().toISOString();
  
  const payload = {
    id,
    agent_id: data.agent_id,
    batch_id: data.batch_id,
    category_id: data.category_id,
    total_cards: data.total_cards,
    sold_cards: 0,
    issued_by: data.issued_by,
    notes: data.notes || '',
    created_at,
    synced: 0
  };

  await execSQL(
    `INSERT INTO agent_wallets (id, agent_id, batch_id, category_id, total_cards, sold_cards, issued_by, notes, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.agent_id, payload.batch_id, payload.category_id, payload.total_cards, payload.sold_cards, payload.issued_by, payload.notes, payload.created_at, payload.synced]
  );
  
  await addToSyncQueue('agent_wallets', 'INSERT', payload, id);
  notifyDataChanged('agent_wallets');

  const batchQuery = await execSQL(`SELECT available_cards FROM batches WHERE id = ?`, [payload.batch_id]);
  if (batchQuery.rows._array.length > 0) {
    const currentAvailable = batchQuery.rows._array[0].available_cards;
    const newAvailable = Math.max(0, currentAvailable - payload.total_cards);
    await execSQL(`UPDATE batches SET available_cards = ?, synced = 0 WHERE id = ?`, [newAvailable, payload.batch_id]);
    await addToSyncQueue('batches', 'UPDATE', { available_cards: newAvailable }, payload.batch_id);
    notifyDataChanged('batches');
  }
};

export const createLocalBatch = async (data) => {
  const id = uuidv4();
  const created_at = data.received_date || new Date().toISOString();
  
  const payload = {
    id,
    batch_number: data.batch_number,
    category_id: data.category_id,
    serial_number: data.serial_number,
    total_cards: data.total_cards,
    available_cards: data.total_cards,
    received_date: created_at,
    status: 'active',
    synced: 0
  };

  await execSQL(
    `INSERT INTO batches (id, batch_number, category_id, serial_number, total_cards, available_cards, received_date, status, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.batch_number, payload.category_id, payload.serial_number, payload.total_cards, payload.available_cards, payload.received_date, payload.status, payload.synced]
  );
  
  await addToSyncQueue('batches', 'INSERT', payload, id);
  notifyDataChanged('batches');
};

export const createLocalPOS = async (data) => {
  const id = uuidv4();
  const payload = {
    id,
    name: data.name,
    owner_name: data.owner_name,
    phone: data.phone,
    city: data.city,
    credit_limit: data.credit_limit,
    credit_used: 0,
    is_blocked: 0,
    assigned_agent_id: data.assigned_agent_id,
    active: 1,
    synced: 0
  };

  await execSQL(
    `INSERT INTO pos_customers (id, name, owner_name, phone, city, credit_limit, credit_used, is_blocked, assigned_agent_id, active, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.name, payload.owner_name, payload.phone, payload.city, payload.credit_limit, payload.credit_used, payload.is_blocked, payload.assigned_agent_id, payload.active, payload.synced]
  );
  
  await addToSyncQueue('pos_customers', 'INSERT', payload, id);
  notifyDataChanged('pos_customers');
};
