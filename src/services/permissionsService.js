import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';

export const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    Dashboard: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    Invoices: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    Collections: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    CashierApproval: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    Inventory: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    POS: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    Wallets: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    Supplies: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    Reports: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    Admin: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    Settings: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    About: { can_view: true, can_add: true, can_edit: true, can_delete: true },
  },
  cashier: {
    Dashboard: { can_view: true, can_add: false, can_edit: false, can_delete: false },
    Invoices: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    Collections: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    CashierApproval: { can_view: true, can_add: true, can_edit: true, can_delete: false },
    Wallets: { can_view: true, can_add: true, can_edit: true, can_delete: false },
    Supplies: { can_view: true, can_add: true, can_edit: true, can_delete: false },
    POS: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    Reports: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    Settings: { can_view: true, can_add: false, can_edit: false, can_delete: false },
    About: { can_view: true, can_add: false, can_edit: false, can_delete: false },
    Inventory: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    Admin: { can_view: false, can_add: false, can_edit: false, can_delete: false },
  },
  agent: {
    Dashboard: { can_view: true, can_add: false, can_edit: false, can_delete: false },
    Invoices: { can_view: true, can_add: true, can_edit: false, can_delete: false },
    Collections: { can_view: true, can_add: true, can_edit: false, can_delete: false },
    Settings: { can_view: true, can_add: false, can_edit: false, can_delete: false },
    About: { can_view: true, can_add: false, can_edit: false, can_delete: false },
    POS: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    Inventory: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    CashierApproval: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    Wallets: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    Supplies: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    Reports: { can_view: false, can_add: false, can_edit: false, can_delete: false },
    Admin: { can_view: false, can_add: false, can_edit: false, can_delete: false },
  }
};

export const getLocalPermissions = async (entityType = null, entityId = null) => {
  let sql = `SELECT * FROM app_permissions WHERE 1=1`;
  const params = [];
  if (entityType) {
    sql += ` AND entity_type = ?`;
    params.push(entityType);
  }
  if (entityId) {
    sql += ` AND entity_id = ?`;
    params.push(entityId);
  }
  const r = await execSQL(sql, params);
  const dbPerms = (r.rows._array || []).map(p => ({
    ...p,
    can_view: p.can_view === 1,
    can_add: p.can_add === 1,
    can_edit: p.can_edit === 1,
    can_delete: p.can_delete === 1,
  }));

  if (entityType === 'ROLE' && entityId) {
    const defaults = DEFAULT_ROLE_PERMISSIONS[entityId] || {};
    const finalPerms = [];
    const dbPermsMap = {};
    dbPerms.forEach(dp => { dbPermsMap[dp.screen_name] = dp; });

    Object.keys(defaults).forEach(screenName => {
      if (dbPermsMap[screenName]) {
        // If it's overridden in DB, use DB row
        finalPerms.push(dbPermsMap[screenName]);
      } else {
        // Fallback to default
        finalPerms.push({
          entity_type: 'ROLE',
          entity_id: entityId,
          screen_name: screenName,
          ...defaults[screenName]
        });
      }
    });
    return finalPerms;
  }

  return dbPerms;
};

export const saveLocalPermission = async (permission) => {
  // permission expected to contain: { entity_type, entity_id, screen_name, can_view, can_add, can_edit, can_delete }
  const existing = await execSQL(`SELECT id FROM app_permissions WHERE entity_type=? AND entity_id=? AND screen_name=?`, [
    permission.entity_type, permission.entity_id, permission.screen_name
  ]);

  let id;
  const now = new Date().toISOString();
  if (existing.rows._array && existing.rows._array.length > 0) {
    id = existing.rows._array[0].id;
    await execSQL(`UPDATE app_permissions SET can_view=?, can_add=?, can_edit=?, can_delete=?, updated_at=?, synced=0 WHERE id=?`, [
      permission.can_view ? 1 : 0,
      permission.can_add ? 1 : 0,
      permission.can_edit ? 1 : 0,
      permission.can_delete ? 1 : 0,
      now,
      id
    ]);
    await addToSyncQueue('app_permissions', 'UPDATE', {
      can_view: permission.can_view,
      can_add: permission.can_add,
      can_edit: permission.can_edit,
      can_delete: permission.can_delete,
      updated_at: now
    }, id);
  } else {
    id = uuidv4();
    await execSQL(`INSERT INTO app_permissions (id, entity_type, entity_id, screen_name, can_view, can_add, can_edit, can_delete, created_at, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`, [
      id,
      permission.entity_type,
      permission.entity_id,
      permission.screen_name,
      permission.can_view ? 1 : 0,
      permission.can_add ? 1 : 0,
      permission.can_edit ? 1 : 0,
      permission.can_delete ? 1 : 0,
      now,
      now
    ]);
    await addToSyncQueue('app_permissions', 'INSERT', {
      id,
      entity_type: permission.entity_type,
      entity_id: permission.entity_id,
      screen_name: permission.screen_name,
      can_view: permission.can_view,
      can_add: permission.can_add,
      can_edit: permission.can_edit,
      can_delete: permission.can_delete,
      created_at: now,
      updated_at: now
    }, id);
  }

  notifyDataChanged('app_permissions');
  return id;
};

export const deleteLocalPermission = async (id) => {
  await execSQL(`DELETE FROM app_permissions WHERE id=?`, [id]);
  await addToSyncQueue('app_permissions', 'DELETE', { id }, id);
  notifyDataChanged('app_permissions');
};

/**
 * Get effective permissions for a user given their role and their specific overrides.
 */
export const getEffectiveUserPermissions = async (userId, userRole) => {
  const rolePermissions = await getLocalPermissions('ROLE', userRole);
  const userOverrides = await getLocalPermissions('USER', userId);
  
  const effective = {};
  
  // Fill with role base permissions
  rolePermissions.forEach(rp => {
    effective[rp.screen_name] = { ...rp };
  });

  // Override with user specifics
  userOverrides.forEach(up => {
    effective[up.screen_name] = { ...up }; // Completely replace role defaults for this screen
  });

  return effective;
};

export const resetRolePermissionsToDefault = async (roleId) => {
  const existing = await execSQL(`SELECT id FROM app_permissions WHERE entity_type='ROLE' AND entity_id=?`, [roleId]);
  for (const row of existing.rows._array || []) {
    await execSQL(`DELETE FROM app_permissions WHERE id=?`, [row.id]);
    await addToSyncQueue('app_permissions', 'DELETE', { id: row.id }, row.id);
  }
  notifyDataChanged('app_permissions');
};
