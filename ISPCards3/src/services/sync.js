import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { execSQL } from './database';

/* ================= CHECK INTERNET ================= */
export const isOnline = async () => {
  const state = await NetInfo.fetch();
  return state.isConnected;
};

/* ================= SYNC COLLECTIONS ================= */
export const syncCollections = async () => {
  const online = await isOnline();

  if (!online) {
    console.log('[SYNC] offline → skip collections');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.log('[SYNC ERROR]', error);
      return;
    }

    for (const item of data) {
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
        item.amount,
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

    console.log('[SYNC] collections done');

  } catch (e) {
    console.log('[SYNC FAIL]', e);
  }
};

/* ================= MAIN SYNC ================= */
export const syncAll = async () => {
  const online = await isOnline();

  console.log('[SYNC] online:', online);

  if (!online) {
    console.log('[SYNC] offline mode → use local DB');
    return;
  }

  await syncCollections();

  console.log('[SYNC] ALL DONE');
};
