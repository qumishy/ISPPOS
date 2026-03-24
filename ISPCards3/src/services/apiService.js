import { db } from './database';
import { addToSyncQueue } from './database';
import { supabase } from './supabase';

// إضافة مستخدم
export const addUser = async (user) => {

  // حفظ محلي
  db.transaction(tx => {
    tx.executeSql(
      `INSERT INTO users (name, email) VALUES (?, ?)`,
      [user.name, user.email]
    );
  });

  // محاولة رفع
  try {
    await supabase.from('users').insert(user);
  } catch (e) {
    console.log('Offline, saved to queue');
    addToSyncQueue('users', 'insert', user);
  }
};

// تعديل مستخدم
export const updateUser = async (user) => {

  db.transaction(tx => {
    tx.executeSql(
      `UPDATE users SET name = ?, email = ? WHERE id = ?`,
      [user.name, user.email, user.id]
    );
  });

  try {
    await supabase.from('users')
      .update(user)
      .eq('id', user.id);
  } catch (e) {
    addToSyncQueue('users', 'update', user);
  }
};

// حذف مستخدم
export const deleteUser = async (id) => {

  db.transaction(tx => {
    tx.executeSql(`DELETE FROM users WHERE id = ?`, [id]);
  });

  try {
    await supabase.from('users')
      .delete()
      .eq('id', id);
  } catch (e) {
    addToSyncQueue('users', 'delete', { id });
  }
};
