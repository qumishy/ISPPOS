import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { execSQL, setOnlineStatus, getSyncQueueCount, notifyDataChanged, isRecordInSyncQueue } from './database';
import { sendLocalNotification } from './NotificationService';

let _isOnline = false;
let _isSyncing = false;
let _unsubscribe = null;
let _syncInterval = null;
let _listeners = [];
let _currentUser = null;
let _realtimeChannel = null;

export function setCurrentUser(user) {
  _currentUser = user;
  // عند تعيين المستخدم، أعد تشغيل الاشتراك الفوري
  if (user && _isOnline) {
    startRealtimeSubscription();
  }
}

// ── الاشتراك الفوري في Supabase Realtime ──
function startRealtimeSubscription() {
  // إلغاء الاشتراك السابق
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }

  const user = _currentUser;
  if (!user) return;

  _realtimeChannel = supabase
    .channel('db-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invoices' }, async (payload) => {
      const inv = payload.new;
      // لا تنبه على السجلات التي أنشأها المستخدم نفسه
      if (inv.agent_id === user.id) return;

      if (user.role === 'admin' || user.role === 'cashier') {
        await sendLocalNotification(
          '📄 فاتورة جديدة وردت',
          `فاتورة #${inv.invoice_number} بمبلغ ${inv.net_amount} ر.ي`
        );
      }
      // سحب فوري لتحديث الواجهة
      try { await pullRemoteChanges(user); notifyListeners(); } catch(e) {}
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collections' }, async (payload) => {
      const col = payload.new;
      if (col.agent_id === user.id) return;

      if (user.role === 'admin' || user.role === 'cashier') {
        await sendLocalNotification(
          '📥 تحصيل جديد بانتظار الاعتماد',
          `مبلغ: ${col.amount} ر.ي من المندوب`
        );
      }
      try { await pullRemoteChanges(user); notifyListeners(); } catch(e) {}
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_wallets' }, async (payload) => {
      const aw = payload.new;
      // إشعار المندوب فقط عند توزيع محفظة له
      if (user.role === 'agent' && aw.agent_id === user.id) {
        await sendLocalNotification(
          '🗂️ محفظة جديدة وصلتك',
          `تم توزيع ${aw.total_cards} ورقة على محفظتك. يمكنك الآن إضافة فواتير.`
        );
      }
      // سحب فوري لتحديث محافظ المندوب
      try { await pullRemoteChanges(user); notifyListeners(); } catch(e) {}
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agent_wallets' }, async (payload) => {
      // تحديث المحفظة (مثلاً عند الاسترداد)
      try { await pullRemoteChanges(user); notifyListeners(); } catch(e) {}
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'invoices' }, async (payload) => {
      // تحديث الفاتورة فوراً في الجهاز
      const inv = sanitizePayload('invoices', payload.new);
      const cols = Object.keys(inv).join(',');
      const ph = Object.keys(inv).map(() => '?').join(',');
      const vals = Object.values(inv).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : (v === 'true' ? 1 : v === 'false' ? 0 : v));
      try {
        await execSQL(`INSERT OR REPLACE INTO invoices (${cols},synced) VALUES (${ph},1)`, vals);
        notifyDataChanged('invoices');
      } catch(e) {}
      try { await pullRemoteChanges(user); notifyListeners(); } catch(e) {}
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'collections' }, async (payload) => {
      const col = sanitizePayload('collections', payload.new);
      const cols = Object.keys(col).join(',');
      const ph = Object.keys(col).map(() => '?').join(',');
      const vals = Object.values(col).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : (v === 'true' ? 1 : v === 'false' ? 0 : v));
      try {
        await execSQL(`INSERT OR REPLACE INTO collections (${cols},synced) VALUES (${ph},1)`, vals);
        notifyDataChanged('collections');
      } catch(e) {}

      // تنبيه المندوب عند اعتماد أو رفض تحصيله
      if (user.role === 'agent' && col.agent_id === user.id) {
        // فحص الحالة المحلية بدلاً من old (لأن Supabase لا يرسلها افتراضياً)
        try {
          const localR = await execSQL(`SELECT status FROM collections WHERE id=?`, [col.id]);
          const localStatus = localR.rows._array[0]?.status;

          if (localStatus === 'pending' && col.status === 'approved') {
            await sendLocalNotification('✅ تم اعتماد تحصيلك', `المبلغ: ${col.amount} ر.ي تم اعتماده بنجاح.`);
          } else if (localStatus === 'pending' && col.status === 'rejected') {
            await sendLocalNotification('❌ تم رفض تحصيلك', `السبب: ${col.rejection_reason || 'غير محدد'}`);
          } else if (col.status === 'approved' && localStatus !== 'approved') {
            await sendLocalNotification('✅ تم اعتماد تحصيلك', `المبلغ: ${col.amount} ر.ي تم اعتماده بنجاح.`);
          } else if (col.status === 'rejected' && localStatus !== 'rejected') {
            await sendLocalNotification('❌ تم رفض تحصيلك', `السبب: ${col.rejection_reason || 'غير محدد'}`);
          }
        } catch (e) {
          // إذا لم يوجد محلياً، نرسل التنبيه مباشرة
          if (col.status === 'approved') {
            await sendLocalNotification('✅ تم اعتماد تحصيلك', `المبلغ: ${col.amount} ر.ي تم اعتماده بنجاح.`);
          } else if (col.status === 'rejected') {
            await sendLocalNotification('❌ تم رفض تحصيلك', `السبب: ${col.rejection_reason || 'غير محدد'}`);
          }
        }
      }
      try { await pullRemoteChanges(user); notifyListeners(); } catch(e) {}
    })
    .subscribe((status) => {
      console.log('[Realtime] subscription status:', status);
    });

  console.log('[Realtime] subscribed to invoices + collections changes');
}

export const TABLE_FIELDS = {
  pos_customers: 'id,name,owner_name,phone,city,credit_limit,credit_used,is_blocked,assigned_agent_id,notes,active,created_at',
  card_categories: 'id,name,price,is_active,active,created_at',
  batches: 'id,batch_number,category_id,serial_number,total_cards,available_cards,received_date,status,active,created_at',
  users: 'id,name,username,role,phone,is_active,password_hash,created_at',
  invoices: 'id,invoice_number,pos_id,agent_id,type,total_amount,net_amount,paid_amount,approved_amount,status,notes,invoice_date,active,created_at',
  invoice_items: 'id,invoice_id,category_id,batch_id,wallet_id,from_card,to_card,quantity,unit_price,total_price,created_at',
  collections: 'id,collection_number,agent_id,pos_id,invoice_id,amount,method,reference_number,status,approved_at,approved_by,approval_notes,rejection_reason,collection_date,notes,active,supply_id,created_at',
  agent_wallets: 'id,agent_id,batch_id,category_id,from_card,to_card,total_cards,sold_cards,issued_by,notes,created_at',
  supplies: 'id,supply_number,user_id,agent_id,amount,notes,type,status,approved_at,approval_notes,created_at',
  app_permissions: 'id,entity_type,entity_id,screen_name,can_view,can_add,can_edit,can_delete,created_at,updated_at'
};

function sanitizePayload(tableName, payload) {
  const clean = { ...(payload || {}) };
  delete clean.synced;

  if (tableName === 'invoice_items') {
    delete clean.total_price;
  }

  const validFields = TABLE_FIELDS[tableName] ? TABLE_FIELDS[tableName].split(',').map(f => f.trim()) : null;
  if (validFields) {
    for (const key in clean) {
      // is_active يتم تحويله لاحقاً إلى active لذلك يجب السماح بمروره
      if (!validFields.includes(key) && key !== 'is_active') {
        delete clean[key];
      }
    }
  }

  // 🔥 إصلاح مشكلة نوع البيانات مع PostgreSQL
  // 1) SQLite يخزن البولين كـ 0 أو 1، بينما Supabase (Postgres) يتطلب true/false
  const boolFields = ['active', 'is_blocked', 'is_active'];
  for (const field of boolFields) {
    if (field in clean && typeof clean[field] === 'number') {
      clean[field] = clean[field] === 1;
    }
  }

  // 2) تحويل النصوص الفارغة في حقول المعرفات (UUID) إلى NULL لتجنب أخطاء سوبابيز
  for (const key in clean) {
    if (key.endsWith('_id') && clean[key] === '') {
      clean[key] = null;
    }
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
    await pullRemoteChanges(_currentUser);
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
      await pullRemoteChanges(_currentUser);
      notifyListeners();
    }
  }, 30000); // كل 30 ثانية (Realtime يتكفل بالباقي)

  // تشغيل الاشتراك الفوري
  if (_currentUser) {
    startRealtimeSubscription();
  }
}

export function stopNetworkMonitor() {
  _unsubscribe?.();
  _unsubscribe = null;

  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }

  // إلغاء الاشتراك الفوري
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
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
          console.log(`[Sync] 🚀 Pushing to -> ${item.table_name}`, JSON.stringify(payload));
          const { error: e } = await supabase
            .from(item.table_name)
            .upsert(payload, { onConflict: 'id' });
          if (e) {
            console.error(`[Supabase Error Detail] Table: ${item.table_name}`, {
              code: e.code,
              msg: e.message,
              hint: e.hint,
              details: e.details
            });
            // 🛡️ نظام التعافي التلقائي: إذا كان الخطأ هو فقدان الفاتورة الأم في السيرفر
            if (e.code === '23503' && (item.table_name === 'invoice_items' || item.table_name === 'collections')) {
              await tryRecoverMissingInvoice(payload.invoice_id);
            }
          }
          else console.log(`[Supabase SUCCESS] INSERT ${item.table_name} OK`);
          error = e;
        } else if (item.operation === 'UPDATE') {
          console.log(`[Supabase INFO] PUSHING UPDATE to -> ${item.table_name} [${item.record_id}]`, JSON.stringify(payload));
          const { error: e } = await supabase
            .from(item.table_name)
            .update(payload)
            .eq('id', item.record_id);
          if (e) {
            console.error(`[Supabase ERROR] UPDATE ${item.table_name} failed:`, e);
            if (e.code === '23503' && (item.table_name === 'invoice_items' || item.table_name === 'collections')) {
              await tryRecoverMissingInvoice(payload.invoice_id);
            }
          }
          else console.log(`[Supabase SUCCESS] UPDATE ${item.table_name} successful!`);
          error = e;
        } else if (item.operation === 'DELETE') {
          console.log(`[Supabase INFO] PUSHING DELETE to -> ${item.table_name} [${item.record_id}]`);
          const { error: e } = await supabase
            .from(item.table_name)
            .delete()
            .eq('id', item.record_id);
          if (e) console.error(`[Supabase ERROR] DELETE ${item.table_name} failed:`, e);
          else console.log(`[Supabase SUCCESS] DELETE ${item.table_name} successful!`);
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


export async function syncAll(user) {
  if (user) _currentUser = user;
  console.log("  SYNC START");

  try {
    // 1) دفع التغييرات المحلية
    await processSyncQueue();

    // 2) سحب التغييرات البعيدة
    await pullRemoteChanges(user);

    console.log("  SYNC DONE");

    notifyDataChanged('all');

  } catch (e) {
    console.log("  SYNC ERROR:", e);
  }
}


export const syncNow = syncAll;

// 🛡️ دالة التعافي: رفع الفاتورة الأم المفقودة في السيرفر فوراً لإصلاح خطأ Foreign Key
async function tryRecoverMissingInvoice(invoiceId) {
  if (!invoiceId) {
    console.warn(`[Sync-Recovery] ⚠️  invoiceId is null, cannot recover.`);
    return;
  }
  console.log(`[Sync-Recovery] 🚑 Found a Foreign Key error for invoice: ${invoiceId}. Starting recovery...`);
  try {
    const raw = await execSQL(`SELECT * FROM invoices WHERE id=?`, [invoiceId]);
    const inv = raw.rows._array?.[0];
    
    if (inv) {
      console.log(`[Sync-Recovery] 🟢 Local record found! Forcing push to Supabase...`, JSON.stringify(inv));
      // نقوم برفع الفاتورة فوراً بـ upsert لضمان وجودها
      const { error } = await supabase.from('invoices').upsert(inv, { onConflict: 'id' });
      
      if (error) {
        console.error(`[Sync-Recovery] ❌ Force push failed:`, error.message);
      } else {
        console.log(`[Sync-Recovery] ✅ Parent invoice RECOVERED successfully in Supabase!`);
      }
    } else {
      console.error(`[Sync-Recovery] ❌ Critical: Invoice [${invoiceId}] NOT FOUND in local DB! Cannot recover.`);
    }
  } catch (e) {
    console.error(`[Sync-Recovery] Exception during recovery:`, e.message);
  }
}

async function pullRemoteChanges(user) {
  const metaR = await execSQL("SELECT value FROM sync_meta WHERE key='last_pull'");
  const lastPull = metaR.rows._array[0]?.value || '2000-01-01T00:00:00Z';

  const tables = Object.keys(TABLE_FIELDS).map(name => ({
    name,
    fields: TABLE_FIELDS[name]
  }));

  for (const t of tables) {
    try {
      let query = supabase.from(t.name).select(t.fields).order('created_at', { ascending: false }).limit(2000);

      // لا نستخدم lastPull هنا لأنه يمنع جلب التحديثات للملفات القديمة طالما لا يوجد حقل updated_at
      
      const { data, error } = await query;

      if (error) {
        console.log(`[Sync] pull error ${t.name}: ${error.message}`);
        continue;
      }

      if (!data || data.length === 0) continue;

      for (const row of data) {
        const inQueue = await isRecordInSyncQueue(row.id);
        if (inQueue) {
          console.log(`[Sync] Skipping pull overwrite for ${row.id} as it is pending push`);
          continue;
        }

  //                                   
  const clean = { ...row };

  // =====       is_active   active =====
  if ('is_active' in clean) {
    clean.active = clean.is_active;
    delete clean.is_active;
  }

  // =====                           =====
  if (t.name === 'collections') {
    delete clean.notes; //                  SQLite
  }

  if (t.name === 'card_categories') {
    delete clean.is_active;
  }

  if (t.name === 'users') {
    delete clean.is_active;
  }

  // =====               =====
  const cols = Object.keys(clean);
    const vals = Object.values(clean).map(v => {
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v === 'true') return 1;
      if (v === 'false') return 0;
      return v;
    });
        const ph = cols.map(() => '?').join(',');

        try {
          // 🚀 إطلاق تنبيهات عند سحب بيانات جديدة
          if (t.name === 'collections') {
            const oldR = await execSQL(`SELECT status FROM collections WHERE id=?`, [row.id]);
            const oldStatus = oldR.rows._array[0]?.status;

            // أ) تنبيه المندوب عند تغيير حالة تحصيله (اعتماد/رفض)
            if (user?.role === 'agent' && row.agent_id === user.id) {
              if (oldStatus === 'pending' && row.status === 'approved') {
                await sendLocalNotification('✅ تم اعتماد تحصيلك', `المبلع: ${row.amount} ر.ي تم اعتماده بنجاح.`);
              } else if (oldStatus === 'pending' && row.status === 'rejected') {
                await sendLocalNotification('❌ تم رفض تحصيلك', `السبب: ${row.rejection_reason || 'غير محدد'}`);
              } else if (!oldStatus && row.status === 'approved') {
                 // حالة نادرة (أول سحبة)
                 await sendLocalNotification('✅ تم استلام تحصيل معتمد', `المبلغ: ${row.amount} ر.ي`);
              }
            }

            // ب) تنبيه المحاسب/المدير عند وصول تحصيل جديد ينتظر الاعتماد
            if ((user?.role === 'cashier' || user?.role === 'admin') && row.status === 'pending') {
              if (!oldStatus) { // سجل جديد تماماً
                await sendLocalNotification('📥 تحصيل جديد بانتظار الاعتماد', `مبلغ: ${row.amount} ر.ي من المندوب.`);
              }
            }
          }

          // ج) تنبيه المدير/المحاسب عند وصول فاتورة جديدة من مندوب
          if (t.name === 'invoices' && (user?.role === 'admin' || user?.role === 'cashier')) {
            const oldInv = await execSQL(`SELECT id FROM invoices WHERE id=?`, [row.id]);
            if (!oldInv.rows._array[0] && row.agent_id !== user.id) {
              await sendLocalNotification('📄 فاتورة جديدة وردت', `فاتورة #${row.invoice_number} بمبلغ ${row.net_amount} ر.ي`);
            }
          }

          // د) تنبيهات شاشة الإيرادات (التوريدات المالية)
          if (t.name === 'supplies') {
             const oldSR = await execSQL(`SELECT status FROM supplies WHERE id=?`, [row.id]);
             const oldStatus = oldSR.rows._array[0]?.status;

             // 1. وصول توريد جديد للمدير (بشرط أن المُنشئ ليس المدير نفسه)
             if (user?.role === 'admin' && row.user_id !== user?.id) {
                if (!oldStatus && row.status === 'pending') {
                   await sendLocalNotification('💰 توريد مالي جديد', `المحاسب رفع توريد بقيمة ${row.amount} ر.ي بانتظار اعتمادك.`);
                }
             }

             // 2. إشعار المحاسب عند اعتماد التوريد الخاص به (يصل لصاحب التوريد فقط)
             if (row.user_id === user?.id) {
                if (oldStatus === 'pending' && row.status === 'approved') {
                   await sendLocalNotification('✅ تم اعتماد توريدك', `قام المدير باعتماد إيرادك المالي بقيمة ${row.amount} ر.ي.`);
                } else if (oldStatus === 'pending' && row.status === 'rejected') {
                   await sendLocalNotification('❌ توريد مرفوض', `تم رفض الإيراد الذي رفعته بقيمة ${row.amount} ر.ي.`);
                }
             }
          }

          await execSQL(
            `INSERT OR REPLACE INTO ${t.name} (${cols.join(',')},synced) VALUES (${ph},?)`,
            [...vals, 1]
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
