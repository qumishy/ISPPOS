import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4, getProjectId } from './dbCore';
import {
  AGENT_SELF_COLLECTION_APPROVAL_PERMISSION,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  ROLE_DEFINITIONS,
  canManagePermissions,
  getPermissionDefinition,
  getPermissionDescription,
  getPermissionLabel,
  getPermissionLockReason,
  getRoleDefinition,
  getCollectionApprovalDecision,
  canApproveCollection,
  hasUnresolvedCollectionCardReturn,
  hasUnresolvedCollectionDiscount,
  isPermissionEditable,
  isRestrictedPermission,
  isSensitivePermission,
  normalizePermissionRole,
  resolvePermissionForRole,
  validatePermissionChanges,
} from './permissionPolicy';

export {
  AGENT_SELF_COLLECTION_APPROVAL_PERMISSION,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  ROLE_DEFINITIONS,
  canManagePermissions,
  getPermissionDefinition,
  getPermissionDescription,
  getPermissionLabel,
  getPermissionLockReason,
  getRoleDefinition,
  getCollectionApprovalDecision,
  canApproveCollection,
  hasUnresolvedCollectionCardReturn,
  hasUnresolvedCollectionDiscount,
  isPermissionEditable,
  isRestrictedPermission,
  isSensitivePermission,
  normalizePermissionRole,
  resolvePermissionForRole,
  validatePermissionChanges,
};

const toBoolean = (value) => value === true || value === 1 || value === '1' || value === 'true';

const mapPermissionRow = (permission) => ({
  ...permission,
  can_view: toBoolean(permission.can_view),
  can_add: toBoolean(permission.can_add),
  can_edit: toBoolean(permission.can_edit),
  can_delete: toBoolean(permission.can_delete),
});

const resolveProjectScope = async (projectId) => projectId || await getProjectId();

const defaultRoleRows = (role) => Object.entries(DEFAULT_ROLE_PERMISSIONS[role] || {}).map(([screenName, values]) => ({
  entity_type: 'ROLE',
  entity_id: role,
  screen_name: screenName,
  ...values,
}));

export const getLocalPermissions = async (entityType = null, entityId = null, projectId = null) => {
  const scopeProjectId = await resolveProjectScope(projectId);
  const normalizedEntityType = entityType ? String(entityType).trim().toUpperCase() : null;

  // Permission rows are project-owned. Never fall back to a cross-project query.
  if (!scopeProjectId) {
    if (normalizedEntityType === 'ROLE' && entityId) {
      const role = normalizePermissionRole(entityId);
      return defaultRoleRows(role).map((row) => resolvePermissionForRole(role, row.screen_name, row));
    }
    return [];
  }

  let sql = `SELECT * FROM app_permissions WHERE project_id = ?`;
  const params = [scopeProjectId];
  if (normalizedEntityType) {
    sql += ` AND entity_type = ?`;
    params.push(normalizedEntityType);
  }
  if (entityId) {
    sql += ` AND entity_id = ?`;
    params.push(String(entityId));
  }
  sql += ` ORDER BY COALESCE(updated_at, created_at, '') ASC, id ASC`;

  const result = await execSQL(sql, params);
  const databasePermissions = (result.rows._array || []).map(mapPermissionRow);

  if (normalizedEntityType !== 'ROLE' || !entityId) return databasePermissions;

  const role = normalizePermissionRole(entityId);
  const merged = new Map();
  defaultRoleRows(role).forEach((row) => merged.set(row.screen_name, row));
  databasePermissions.forEach((row) => merged.set(row.screen_name, row));

  return Array.from(merged.values()).map((row) => resolvePermissionForRole(role, row.screen_name, row));
};

const assertPermissionAdministrator = async (currentUser, projectId) => {
  if (!projectId || !currentUser?.id || !canManagePermissions(currentUser)) {
    throw new Error('إدارة الصلاحيات متاحة للمدير العام فقط.');
  }
  if (currentUser.project_id && String(currentUser.project_id) !== String(projectId)) {
    throw new Error('لا يمكن تعديل صلاحيات مشروع آخر.');
  }

  const result = await execSQL(
    `SELECT id, role, active, project_id
     FROM users
     WHERE id = ? AND project_id = ?
     LIMIT 1`,
    [currentUser.id, projectId]
  );
  const storedUser = result.rows._array?.[0];
  const isActive = storedUser && storedUser.active !== 0 && storedUser.active !== false && storedUser.active !== 'false';
  if (!storedUser || !isActive || normalizePermissionRole(storedUser.role) !== 'admin') {
    throw new Error('تعذر التحقق من صلاحية المدير العام لتنفيذ هذا التغيير.');
  }
};

const getTargetRole = async ({ entityType, entityId, projectId }) => {
  if (entityType === 'ROLE') {
    const role = normalizePermissionRole(entityId);
    if (!getRoleDefinition(role)) throw new Error('الدور المحدد غير معروف أو غير مدعوم.');
    return role;
  }

  const result = await execSQL(
    `SELECT role, active
     FROM users
     WHERE id = ? AND project_id = ?
     LIMIT 1`,
    [entityId, projectId]
  );
  const targetUser = result.rows._array?.[0];
  const isActive = targetUser && targetUser.active !== 0 && targetUser.active !== false && targetUser.active !== 'false';
  if (!targetUser || !isActive) throw new Error('المستخدم المحدد غير موجود أو غير نشط.');

  const role = normalizePermissionRole(targetUser.role);
  if (!getRoleDefinition(role)) throw new Error('دور المستخدم غير معروف أو غير مدعوم.');
  return role;
};

const savePermissionRow = async ({ permission, projectId, operationGroupId }) => {
  const existingResult = await execSQL(
    `SELECT id
     FROM app_permissions
     WHERE project_id = ? AND entity_type = ? AND entity_id = ? AND screen_name = ?
     ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC
     LIMIT 1`,
    [projectId, permission.entity_type, permission.entity_id, permission.screen_name]
  );
  const existingId = existingResult.rows._array?.[0]?.id || null;
  const now = new Date().toISOString();
  const values = {
    can_view: !!permission.can_view,
    can_add: !!permission.can_add,
    can_edit: !!permission.can_edit,
    can_delete: !!permission.can_delete,
  };

  if (existingId) {
    await execSQL(
      `UPDATE app_permissions
       SET can_view = ?, can_add = ?, can_edit = ?, can_delete = ?, updated_at = ?, synced = 0
       WHERE id = ? AND project_id = ?`,
      [
        values.can_view ? 1 : 0,
        values.can_add ? 1 : 0,
        values.can_edit ? 1 : 0,
        values.can_delete ? 1 : 0,
        now,
        existingId,
        projectId,
      ]
    );
    await addToSyncQueue('app_permissions', 'UPDATE', {
      ...values,
      project_id: projectId,
      updated_at: now,
    }, existingId, operationGroupId);
    return existingId;
  }

  const id = uuidv4();
  await execSQL(
    `INSERT INTO app_permissions
      (id, project_id, entity_type, entity_id, screen_name, can_view, can_add, can_edit, can_delete, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      projectId,
      permission.entity_type,
      permission.entity_id,
      permission.screen_name,
      values.can_view ? 1 : 0,
      values.can_add ? 1 : 0,
      values.can_edit ? 1 : 0,
      values.can_delete ? 1 : 0,
      now,
      now,
    ]
  );
  await addToSyncQueue('app_permissions', 'INSERT', {
    id,
    project_id: projectId,
    entity_type: permission.entity_type,
    entity_id: permission.entity_id,
    screen_name: permission.screen_name,
    ...values,
    created_at: now,
    updated_at: now,
  }, id, operationGroupId);
  return id;
};

const removePermissionRow = async ({ entityType, entityId, screenName, projectId, operationGroupId }) => {
  const existingResult = await execSQL(
    `SELECT id
     FROM app_permissions
     WHERE project_id = ? AND entity_type = ? AND entity_id = ? AND screen_name = ?
     ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC`,
    [projectId, entityType, entityId, screenName]
  );
  const rows = existingResult.rows._array || [];
  for (const row of rows) {
    await execSQL(`DELETE FROM app_permissions WHERE id = ? AND project_id = ?`, [row.id, projectId]);
    await addToSyncQueue('app_permissions', 'DELETE', { id: row.id, project_id: projectId }, row.id, operationGroupId);
  }
  return rows.length;
};

/**
 * Persist a pre-validated permission draft through the existing SQLite-first
 * mutation and sync-queue flow. Only dynamic screen visibility is editable;
 * role/service action guards and protected permissions are never overwritten.
 */
export const savePermissionChanges = async ({
  entityType,
  entityId,
  changes = [],
  removals = [],
  currentUser,
  projectId,
  confirmedSensitive = false,
}) => {
  const normalizedEntityType = String(entityType || '').trim().toUpperCase();
  if (!['ROLE', 'USER'].includes(normalizedEntityType)) {
    throw new Error('نوع تخصيص الصلاحيات غير صالح.');
  }
  if (!entityId) throw new Error('لم يتم تحديد الدور أو المستخدم المطلوب.');

  const scopeProjectId = await resolveProjectScope(projectId);
  await assertPermissionAdministrator(currentUser, scopeProjectId);
  const targetRole = await getTargetRole({ entityType: normalizedEntityType, entityId, projectId: scopeProjectId });

  const uniqueChanges = new Map();
  for (const item of Array.isArray(changes) ? changes : []) {
    const screenName = String(item?.screen_name || item?.code || '');
    if (!isPermissionEditable(targetRole, screenName, currentUser, 'can_view', normalizedEntityType)) {
      throw new Error('لا يمكن تعديل هذه الصلاحية لأنها مقيدة من النظام.');
    }
    uniqueChanges.set(screenName, { ...item, screen_name: screenName });
  }

  const uniqueRemovals = Array.from(new Set(Array.isArray(removals) ? removals.map(String) : []));
  if (normalizedEntityType !== 'USER' && uniqueRemovals.length > 0) {
    throw new Error('إزالة التخصيص متاحة لصلاحيات المستخدم الفردية فقط.');
  }
  for (const screenName of uniqueRemovals) {
    if (!isPermissionEditable(targetRole, screenName, currentUser, 'can_view', normalizedEntityType)) {
      throw new Error('لا يمكن تعديل هذه الصلاحية لأنها مقيدة من النظام.');
    }
  }

  const sensitiveChanged = [...uniqueChanges.keys(), ...uniqueRemovals].some(isSensitivePermission);
  if (sensitiveChanged && !confirmedSensitive) {
    const error = new Error('يتطلب هذا التغيير الحساس تأكيداً صريحاً قبل الحفظ.');
    error.code = 'SENSITIVE_PERMISSION_CONFIRMATION_REQUIRED';
    throw error;
  }

  const currentRoleRows = await getLocalPermissions('ROLE', targetRole, scopeProjectId);
  const selected = {};
  currentRoleRows.forEach((row) => { selected[row.screen_name] = row; });
  uniqueChanges.forEach((item, screenName) => {
    selected[screenName] = resolvePermissionForRole(targetRole, screenName, {
      ...(selected[screenName] || {}),
      entity_type: normalizedEntityType,
      entity_id: String(entityId),
      screen_name: screenName,
      can_view: !!item.can_view,
    });
  });
  const validation = validatePermissionChanges(targetRole, selected, currentUser);
  if (!validation.valid) {
    throw new Error(validation.errors[0] || 'لا يمكن حفظ صلاحيات غير صالحة أو متعارضة.');
  }

  const operationGroupId = uuidv4();
  let savedCount = 0;
  let removedCount = 0;

  for (const [screenName, item] of uniqueChanges) {
    const resolved = resolvePermissionForRole(targetRole, screenName, {
      ...(selected[screenName] || {}),
      entity_type: normalizedEntityType,
      entity_id: String(entityId),
      screen_name: screenName,
      can_view: !!item.can_view,
    });
    await savePermissionRow({
      permission: {
        ...resolved,
        entity_type: normalizedEntityType,
        entity_id: String(entityId),
        screen_name: screenName,
      },
      projectId: scopeProjectId,
      operationGroupId,
    });
    savedCount += 1;
  }

  for (const screenName of uniqueRemovals) {
    removedCount += await removePermissionRow({
      entityType: normalizedEntityType,
      entityId: String(entityId),
      screenName,
      projectId: scopeProjectId,
      operationGroupId,
    });
  }

  notifyDataChanged('app_permissions', {
    project_id: scopeProjectId,
    entity_type: normalizedEntityType,
    entity_id: String(entityId),
  });
  return { savedCount, removedCount, operationGroupId };
};

/** Get protected, effective permissions after role defaults and user overrides. */
export const getEffectiveUserPermissions = async (userId, userRole, projectId = null) => {
  const scopeProjectId = await resolveProjectScope(projectId);
  const role = normalizePermissionRole(userRole);
  const [rolePermissions, userOverrides] = await Promise.all([
    getLocalPermissions('ROLE', role, scopeProjectId),
    userId ? getLocalPermissions('USER', userId, scopeProjectId) : Promise.resolve([]),
  ]);

  const effective = {};
  rolePermissions.forEach((permission) => {
    effective[permission.screen_name] = resolvePermissionForRole(role, permission.screen_name, permission);
  });
  userOverrides.forEach((permission) => {
    effective[permission.screen_name] = resolvePermissionForRole(role, permission.screen_name, permission);
  });

  // Always materialize current definitions so a missing or partial DB row cannot
  // crash navigation and cannot accidentally open an unknown feature.
  PERMISSION_DEFINITIONS.forEach((definition) => {
    if (!effective[definition.code]) {
      effective[definition.code] = resolvePermissionForRole(role, definition.code, null);
    }
  });
  return effective;
};

/** Resolve one effective permission from protected role defaults plus user overrides. */
export const hasEffectivePermission = async (actor, permissionCode, action = 'can_view') => {
  if (!actor?.id || !actor?.role || !actor?.project_id || !permissionCode) return false;
  const effective = await getEffectiveUserPermissions(actor.id, actor.role, actor.project_id);
  return !!effective?.[permissionCode]?.[action];
};
