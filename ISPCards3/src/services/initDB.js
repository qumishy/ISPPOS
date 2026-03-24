import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('isp.db');

export function initDB() {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {

      // invoices
      tx.executeSql(`
        CREATE TABLE IF NOT EXISTS invoices (
          id TEXT PRIMARY KEY,
          invoice_number TEXT,
          pos_id TEXT,
          agent_id TEXT,
          type TEXT,
          status TEXT,
          total_amount REAL,
          discount REAL,
          net_amount REAL,
          invoice_date TEXT,
          notes TEXT,
          synced INTEGER DEFAULT 0
        );
      `);

      // invoice_items
      tx.executeSql(`
        CREATE TABLE IF NOT EXISTS invoice_items (
          id TEXT PRIMARY KEY,
          invoice_id TEXT,
          category_id TEXT,
          wallet_id TEXT,
          batch_id TEXT,
          from_card INTEGER,
          to_card INTEGER,
          quantity INTEGER,
          unit_price REAL,
          total_price REAL,
          synced INTEGER DEFAULT 0
        );
      `);

      // collections
      tx.executeSql(`
        CREATE TABLE IF NOT EXISTS collections (
          id TEXT PRIMARY KEY,
          collection_number TEXT,
          invoice_id TEXT,
          agent_id TEXT,
          amount REAL,
          status TEXT,
          notes TEXT,
          collection_date TEXT,
          synced INTEGER DEFAULT 0
        );
      `);

      // sync queue
      tx.executeSql(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT,
          operation TEXT,
          data TEXT
        );
      `);

    }, reject, resolve);
  });
}

export default db;
