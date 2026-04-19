import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from './supabase';
import { execSQL, notifyDataChanged } from './dbCore';

const TABLE_FIELDS = {
  invoices: 'id,invoice_number,pos_id,agent_id,type,total_amount,net_amount,paid_amount,approved_amount,status,notes,invoice_date,active,created_at',
  invoice_items: 'id,invoice_id,category_id,batch_id,wallet_id,from_card,to_card,quantity,unit_price,total_price,created_at',
  collections: 'id,collection_number,agent_id,pos_id,invoice_id,amount,method,reference_number,status,approved_at,approved_by,approval_notes,rejection_reason,collection_date,notes,active,supply_id,created_at',
  supplies: 'id,supply_number,user_id,agent_id,amount,notes,type,status,approved_at,approval_notes,created_at',
  batches: 'id,batch_number,category_id,serial_number,total_cards,available_cards,received_date,status,active,created_at',
  agent_wallets: 'id,agent_id,batch_id,category_id,from_card,to_card,total_cards,sold_cards,issued_by,notes,created_at',
};

/**
 * 1. Export Transactions Backup
 */
export async function exportTransactionsBackup() {
  try {
    const tablesToExport = ['batches', 'agent_wallets', 'invoices', 'invoice_items', 'collections', 'supplies'];
    let backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: {}
    };

    for (const table of tablesToExport) {
      const result = await execSQL(`SELECT * FROM ${table}`);
      backupData.data[table] = result.rows._array || [];
    }

    const jsonString = JSON.stringify(backupData);
    const fileUri = FileSystem.documentDirectory + `isp_backup_${new Date().getTime()}.json`;

    await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'حفظ نسخة احتياطية' });
      return { success: true };
    } else {
      return { success: false, error: 'ميزة المشاركة غير متوفرة على هذا الجهاز' };
    }
  } catch (error) {
    console.error('Export Backup Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 2. Import Transactions Backup
 */
export async function importTransactionsBackup() {
  try {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    
    // React Native DocumentPicker handles cancelation via 'canceled' flag in latest SDK
    if (result.canceled || !result.assets || !result.assets[0]) {
      return { success: false, canceled: true };
    }

    const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
    const backupData = JSON.parse(fileContent);

    if (!backupData || !backupData.data || backupData.version !== '1.0') {
      return { success: false, error: 'هذا الملف لا يبدو كنسخة احتياطية صالحة لمشروع ISPCards3.' };
    }

    const tablesToRestore = ['batches', 'agent_wallets', 'invoices', 'invoice_items', 'collections', 'supplies'];

    // 2.1 Wipe local SQLite for these tables
    for (const table of tablesToRestore) {
      await execSQL(`DELETE FROM ${table}`);
    }

    // 2.2 Re-insert everything from JSON into local SQLite
    for (const table of tablesToRestore) {
      const records = backupData.data[table] || [];
      if (records.length === 0) continue;

      const validFields = TABLE_FIELDS[table] ? TABLE_FIELDS[table].split(',').map(f => f.trim()) : null;
      if (!validFields) continue;

      for (const row of records) {
        const cols = [];
        const vals = [];
        for (const key in row) {
          if (validFields.includes(key) || key === 'synced') {
            cols.push(key);
            let val = row[key];
            if (typeof val === 'boolean') val = val ? 1 : 0;
            vals.push(val);
          }
        }

        const placeholders = cols.map(() => '?').join(',');
        await execSQL(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, vals);
      }
      notifyDataChanged(table);
    }

    // 2.3 Upsert EVERYTHING back to Supabase
    // We do it sequentially respecting Foreign Keys
    const orderedPush = ['batches', 'agent_wallets', 'invoices', 'invoice_items', 'collections', 'supplies'];
    
    for (const table of orderedPush) {
      const records = backupData.data[table] || [];
      if (records.length === 0) continue;

      // Sanitize payload for Supabase
      const pushBatch = records.map(row => {
         const clean = { ...row };
         delete clean.synced;
         if (table === 'invoice_items') delete clean.total_price;
         if (table === 'collections') delete clean.notes; // Only local
         
         // Convert sqlite integers back to booleans if needed
         const boolFields = ['active', 'is_blocked', 'is_active'];
         for (const field of boolFields) {
           if (field in clean && typeof clean[field] === 'number') {
             clean[field] = clean[field] === 1;
           }
         }

         // Ensure empty IDs are null
         for (const key in clean) {
           if (key.endsWith('_id') && clean[key] === '') clean[key] = null;
         }

         return clean;
      });

      // Split into batches of 1000 for Supabase limits
      const pushSize = 1000;
      for (let i = 0; i < pushBatch.length; i += pushSize) {
        const batch = pushBatch.slice(i, i + pushSize);
        const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
        if (error) console.error(`Import Push Error [${table}]:`, error.message);
      }
    }

    notifyDataChanged('all');
    return { success: true };

  } catch (error) {
    console.error('Import Backup Error:', error);
    return { success: false, error: 'حدثت طباعة أثناء الاستيراد: ' + error.message };
  }
}

/**
 * 3. Reset All Transactions Databases (Supabase + Local SQLite)
 */
export async function wipeTransactionsData() {
  try {
    const tablesToWipe = ['invoice_items', 'collections', 'agent_wallets', 'invoices', 'supplies', 'batches']; // Order logic for FKs

    // 3.1 Delete from Supabase
    for (const table of tablesToWipe) {
      // Deleting all requires neq id null hack in standard SDK without a specific rpc endpoint
      const { error } = await supabase.from(table).delete().not('id', 'is', null);
      if (error) {
         console.error(`Supabase Wipe Error [${table}]:`, error.message);
         // Don't stop, wipe best effort
      }
    }

    // 3.2 Wipe local SQLite
    for (const table of tablesToWipe) {
      await execSQL(`DELETE FROM ${table}`);
      notifyDataChanged(table);
    }

    notifyDataChanged('all');
    return { success: true };
  } catch (error) {
    console.error('Database Wipe Error:', error);
    return { success: false, error: error.message };
  }
}
