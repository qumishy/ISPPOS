import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { execSQL, setOnlineStatus, getSyncQueueCount, notifyDataChanged } from './database';

let _isOnline = false;
let _isSyncing = false;
let _unsubscribe = null;
let _syncInterval = null;
let _listeners = [];

function sanitizePayload(tableName, payload) {
  const clean = { ...(payload || {}) };
  delete clean.synced;

  if (tableName === 'invoice_items') {
    delete clean.total_price;
  }

  return clean;
}

async function syncQueueTableExists() {
  try {
    const r = await execSQL(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_queue'"
    );
    return (r.rows._array || []).length > 0;
  } catch (e) {
    return false;
  }
}

async function updateOnlineState(online, source = 'unknown') {
  const changed = online !== _isOnline;
  _isOnline = !!online;
  setOnlineStatus(_isOnline);

  console.log(`[Sync] online=${_isOnline} source=${source}`);

  if (changed && _isOnline) {
    const exists = await syncQueueTableExists();
    if (!exists) return;
    await processSyncQueue();
    await pullRemoteChanges();
    notifyListeners();
  }
}

export async function startNetworkMonitor(onStatusChange) {
  try {
    const initial = await NetInfo.fetch();
    const initialOnline = !!(initial.isConnected && initial.isInternetReachable !== false);
    await updateOnlineState(initialOnline, 'initial-fetch');
    onStatusChange?.(initialOnline);
  } catch (e) {}

  _unsubscribe = NetInfo.addEventListener(async state => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);
    const prev = _isOnline;
    await updateOnlineState(online, 'listener');
    if (online !== prev) onStatusChange?.(online);
  });

  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(async () => {
    if (_isOnline) {
      const exists = await syncQueueTableExists();
      if (!exists) return;
      await processSyncQueue();
      await pullRemoteChanges();
      notifyListeners();
    }
  }, 15000);
}

export function stopNetworkMonitor() {
  _unsubscribe?.();
  _unsubscribe = null;

  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
}

export const isOnline = () => _isOnline;

export function addSyncListener(fn) {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter(l => l !== fn);
  };
}

function notifyListeners() {
  _listeners.forEach(fn => {
    try { fn(); } catch (e) {}
  });
}

export async function processSyncQueue() {
  if (_isSyncing || !_isOnline) return;

  const exists = await syncQueueTableExists();
  if (!exists) return;

  _isSyncing = true;

  try {
    const count = await getSyncQueueCount();
    console.log(`[Sync] queue count before processing: ${count}`);

    const r = await execSQL(
      'SELECT * FROM sync_queue WHERE attempts < 5 ORDER BY id ASC LIMIT 30'
    );
    const queued = r.rows._array || [];

    for (const item of queued) {
      try {
        const rawPayload = JSON.parse(item.payload || '{}');
        const payload = sanitizePayload(item.table_name, rawPayload);
        let error = null;

        console.log(`[Sync] processing item id=${item.id} table=${item.table_name} op=${item.operation}`);

        if (item.operation === 'INSERT') {
          const { error: e } = await supabase
            .from(item.table_name)
            .upsert(payload, { onConflict: 'id' });
          error = e;
        } else if (item.operation === 'UPDATE') {
          const { error: e } = await supabase
            .from(item.table_name)
            .update(payload)
            .eq('id', item.record_id);
          error = e;
        } else if (item.operation === 'DELETE') {
          const { error: e } = await supabase
            .from(item.table_name)
            .delete()
            .eq('id', item.record_id);
          error = e;
        } else {
          error = new Error(`Unknown operation: ${item.operation}`);
        }

        if (!error) {
          await execSQL('DELETE FROM sync_queue WHERE id=?', [item.id]);
          try {
            await execSQL(`UPDATE ${item.table_name} SET synced=1 WHERE id=?`, [item.record_id]);
          } catch (e) {}
          notifyDataChanged(item.table_name, payload);
          console.log(`[Sync] success item id=${item.id}`);
        } else {
          await execSQL('UPDATE sync_queue SET attempts=attempts+1 WHERE id=?', [item.id]);
          console.log(`[Sync] failed item id=${item.id}: ${error.message}`);
        }
      } catch (e) {
        await execSQL('UPDATE sync_queue SET attempts=attempts+1 WHERE id=?', [item.id]);
        console.log('[Sync] queue item exception:', e.message);
      }
    }

    const after = await getSyncQueueCount();
    console.log(`[Sync] queue count after processing: ${after}`);
    notifyDataChanged('sync_queue');
  } catch (e) {
    console.log('[Sync] processSyncQueue error:', e.message);
  } finally {
    _isSyncing = false;
    notifyListeners();
  }
}

export async function syncAll() {
  console.log(" SYNC START");

  try {

    // ===== USERS =====
    const { data: users } = await supabase
      .from('users')
      .select('id, name');

    console.log(" users from server:", users?.length);

    if (users) {
      for (const u of users) {
        await execSQL(`
          INSERT OR REPLACE INTO users (id, name)
          VALUES (?, ?)
        `, [u.id, u.name]);
      }
    }

    // ===== invoices =====
    // =====   =====
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*');

    console.log(" invoices from server:", invoices?.length);

    if (invoices) {
      for (const item of invoices) {
        await execSQL(`
          INSERT OR REPLACE INTO invoices
          (id, invoice_number, pos_id, agent_id, type, total_amount, net_amount, paid_amount, status, notes, invoice_date, active, created_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.id,
          item.invoice_number,
          item.pos_id,
          item.agent_id,
          item.type,
          Number(item.total_amount || 0),
          Number(item.net_amount || 0),
          Number(item.paid_amount || 0),
          item.status,
          item.notes || '',
          item.invoice_date,
          item.active ?? 1,
          item.created_at,
          1
        ]);
      }
    }

    // =====   =====
    const { data: collections } = await supabase
      .from('collections')
      .select('*');

    console.log(" collections from server:", collections?.length);

    if (collections) {
      for (const item of collections) {
        await execSQL(`
          INSERT OR REPLACE INTO collections
          (id, collection_number, agent_id, pos_id, invoice_id, amount, method, reference_number, status, approved_at, rejection_reason, collection_date, active, created_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.id,
          item.collection_number,
          item.agent_id,
          item.pos_id,
          item.invoice_id,
          Number(item.amount || 0),
          item.method,
          item.reference_number,
          item.status,
          item.approved_at,
          item.rejection_reason,
          item.collection_date,
          item.active ?? 1,
          item.created_at,
          1
        ]);
      }
    }

    console.log(" SYNC DONE");
notifyDataChanged('all');

  } catch (e) {
    console.log(" SYNC ERROR:", e);
  }
}

export const syncNow = syncAll;

async function pullRemoteChanges() {
  const metaR = await execSQL("SELECT value FROM sync_meta WHERE key='last_pull'");
  const lastPull = metaR.rows._array[0]?.value || '2000-01-01T00:00:00Z';

  const tables = [
    { name: 'pos_customers', fields: 'id,name,owner_name,phone,city,credit_limit,credit_used,is_blocked,assigned_agent_id,notes,active,created_at' },
    { name: 'card_categories', fields: 'id,name,price,is_active,active,created_at' },
    { name: 'batches', fields: 'id,batch_number,category_id,serial_number,total_cards,available_cards,received_date,status,active,created_at' },
    { name: 'users', fields: 'id,name,username,role,phone,is_active,password_hash,created_at' },
    { name: 'invoices', fields: 'id,invoice_number,pos_id,agent_id,type,total_amount,net_amount,paid_amount,status,notes,invoice_date,active,created_at' },
    { name: 'invoice_items', fields: 'id,invoice_id,category_id,batch_id,wallet_id,from_card,to_card,quantity,unit_price,total_price,created_at' },
    { name: 'collections', fields: 'id,collection_number,agent_id,pos_id,invoice_id,amount,method,reference_number,status,approved_at,rejection_reason,collection_date,notes,active,created_at' },
    { name: 'agent_wallets', fields: 'id,agent_id,batch_id,category_id,from_card,to_card,total_cards,sold_cards,issued_by,notes,created_at' },
  ];

  for (const t of tables) {
    try {
      const { data, error } = await supabase
        .from(t.name)
        .select(t.fields)
        // 🔥 مؤقتاً نلغي الفلترة
// .gte('created_at', lastPull)
        .limit(500);

      if (error) {
        console.log(`[Sync] pull error ${t.name}: ${error.message}`);
        continue;
      }

      if (!data || data.length === 0) continue;

      for (const row of data) {
        const cols = Object.keys(row);
        const vals = Object.values(row).map(v =>
          typeof v === 'boolean' ? (v ? 1 : 0) : v
        );
        const ph = cols.map(() => '?').join(',');

        try {
          await execSQL(
            `INSERT OR REPLACE INTO ${t.name} (${cols.join(',')},synced) VALUES (${ph},1)`,
            vals
          );
        } catch (e) {
          console.log(`[Sync] local insert error ${t.name}: ${e.message}`);
        }
      }

      notifyDataChanged(t.name);
    } catch (e) {
      console.log(`[Sync] pull exception ${t.name}: ${e.message}`);
    }
  }

  await execSQL(
    "INSERT OR REPLACE INTO sync_meta (key,value) VALUES ('last_pull',?)",
    [new Date().toISOString()]
  );

  console.log('[Sync] pullRemoteChanges completed');
}

export async function initialSync() {
  if (!_isOnline) return;
  try {
    await execSQL(
      "INSERT OR REPLACE INTO sync_meta (key,value) VALUES ('last_pull','2000-01-01T00:00:00Z')"
    );
    await pullRemoteChanges();
    notifyListeners();
  } catch (e) {}
}
