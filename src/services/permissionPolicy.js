const ACTION_FIELDS = ['can_view', 'can_add', 'can_edit', 'can_delete'];

export const AGENT_SELF_COLLECTION_APPROVAL_PERMISSION = 'AgentSelfCollectionApproval';

const noActions = (canView = false) => ({
  can_view: canView,
  can_add: false,
  can_edit: false,
  can_delete: false,
});

export const ROLE_DEFINITIONS = [
  {
    id: 'admin',
    label: 'المدير العام',
    description: 'صلاحيات النظام والإدارة الحساسة محمية لهذا الدور.',
    icon: 'shield',
    color: '#7C3AED',
  },
  {
    id: 'cashier',
    label: 'المحاسب',
    description: 'متابعة واعتماد التحصيلات والتوريدات المسموح بها.',
    icon: 'briefcase',
    color: '#2563EB',
  },
  {
    id: 'agent',
    label: 'المندوب',
    description: 'المبيعات والتحصيلات والبيانات المرتبطة بعمل المندوب.',
    icon: 'users',
    color: '#059669',
  },
];

export const PERMISSION_GROUPS = [
  { id: 'core', label: 'أساسيات التطبيق', icon: 'grid' },
  { id: 'sales', label: 'المبيعات ونقاط البيع', icon: 'shopping-bag' },
  { id: 'finance', label: 'التحصيلات والعمليات المالية', icon: 'dollar-sign' },
  { id: 'inventory', label: 'المخزون والتوزيع', icon: 'package' },
  { id: 'management', label: 'التقارير والإدارة', icon: 'shield' },
  { id: 'app', label: 'التطبيق والمساعدة', icon: 'settings' },
  { id: 'other', label: 'صلاحيات أخرى', icon: 'help-circle' },
];

export const PERMISSION_DEFINITIONS = [
  {
    code: 'Dashboard',
    label: 'الصفحة الرئيسية',
    description: 'عرض ملخص العمل والمؤشرات المناسبة لدور المستخدم.',
    group: 'core',
    icon: 'home',
    systemLocked: true,
    lockReason: 'هذه الصلاحية أساسية لتشغيل واجهة المستخدم ولا يمكن تعطيلها.',
  },
  {
    code: 'Invoices',
    label: 'الفواتير',
    description: 'عرض شاشة الفواتير. تظل عمليات الإنشاء والإلغاء خاضعة لحواجز الدور والخدمة.',
    group: 'sales',
    icon: 'file-text',
  },
  {
    code: 'POS',
    label: 'نقاط البيع',
    description: 'عرض بيانات نقاط البيع والعملاء المتاحة للمستخدم.',
    group: 'sales',
    icon: 'shopping-bag',
  },
  {
    code: 'Collections',
    label: 'التحصيلات',
    description: 'عرض التحصيلات ضمن نطاق المشروع والمستخدم.',
    group: 'finance',
    icon: 'pie-chart',
    sensitive: true,
  },
  {
    code: 'CashierApproval',
    label: 'اعتماد التحصيلات',
    description: 'اعتماد التحصيلات المالية من شاشة الاعتماد العامة للمدير العام والمحاسب فقط.',
    group: 'finance',
    icon: 'check-circle',
    sensitive: true,
    systemLocked: true,
    lockReason: 'اعتماد التحصيلات العام صلاحية مالية محمية ومحصورة بالمدير العام والمحاسب.',
  },
  {
    code: AGENT_SELF_COLLECTION_APPROVAL_PERMISSION,
    label: 'اعتماد تحصيلاته فقط',
    description: 'يسمح للمندوب المحدد باعتماد تحصيلاته المؤهلة فقط، ولا يمنحه شاشة اعتماد المحاسب.',
    group: 'finance',
    icon: 'user-check',
    sensitive: true,
    userOnly: true,
    allowedUserRoles: ['agent'],
    lockReason: 'هذه الصلاحية لا تضاف إلى الدور الأساسي؛ يمنحها المدير لمندوب محدد من تخصيص المستخدمين فقط.',
  },
  {
    code: 'Supplies',
    label: 'التوريدات المالية',
    description: 'عرض سجلات التوريد والإيداع التي يسمح بها دور المستخدم.',
    group: 'finance',
    icon: 'credit-card',
    sensitive: true,
  },
  {
    code: 'approve_card_returns',
    label: 'اعتماد مرتجع الكروت',
    description: 'اعتماد الأثر المالي لمرتجعات الكروت المرتبطة بالفواتير.',
    group: 'finance',
    icon: 'corner-up-left',
    sensitive: true,
    systemLocked: true,
    lockReason: 'اعتماد مرتجع الكروت صلاحية مالية محمية ومحصورة بالمدير العام.',
  },
  {
    code: 'Inventory',
    label: 'المخزون',
    description: 'عرض الدفعات وحركة المخزون. الإضافات والحذف تبقى محكومة بدور المستخدم.',
    group: 'inventory',
    icon: 'package',
  },
  {
    code: 'Wallets',
    label: 'المحافظ',
    description: 'عرض المحافظ والتوزيعات المسموح بها للمستخدم.',
    group: 'inventory',
    icon: 'briefcase',
  },
  {
    code: 'Reports',
    label: 'التقارير والاستعلامات',
    description: 'عرض التقارير المالية والتشغيلية حسب نطاق المشروع.',
    group: 'management',
    icon: 'trending-up',
    sensitive: true,
  },
  {
    code: 'Admin',
    label: 'إدارة النظام',
    description: 'إدارة المستخدمين والمراحل والإعدادات والبيانات الحساسة.',
    group: 'management',
    icon: 'shield',
    sensitive: true,
    systemLocked: true,
    lockReason: 'إدارة النظام والمستخدمين والصلاحيات محمية ومحصورة بالمدير العام.',
  },
  {
    code: 'Settings',
    label: 'الإعدادات العامة',
    description: 'عرض إعدادات التطبيق المتاحة للمستخدم.',
    group: 'app',
    icon: 'settings',
  },
  {
    code: 'About',
    label: 'حول التطبيق والتواصل',
    description: 'عرض معلومات التطبيق ووسائل التواصل.',
    group: 'app',
    icon: 'info',
  },
];

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
    approve_card_returns: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    Settings: { can_view: true, can_add: true, can_edit: true, can_delete: true },
    About: { can_view: true, can_add: true, can_edit: true, can_delete: true },
  },
  cashier: {
    Dashboard: noActions(true),
    Invoices: noActions(false),
    Collections: noActions(false),
    CashierApproval: { can_view: true, can_add: true, can_edit: true, can_delete: false },
    Wallets: { can_view: true, can_add: true, can_edit: true, can_delete: false },
    Supplies: { can_view: true, can_add: true, can_edit: true, can_delete: false },
    POS: noActions(false),
    Reports: noActions(false),
    Settings: noActions(true),
    About: noActions(true),
    Inventory: noActions(false),
    Admin: noActions(false),
    approve_card_returns: noActions(false),
  },
  agent: {
    Dashboard: noActions(true),
    Invoices: { can_view: true, can_add: true, can_edit: false, can_delete: false },
    Collections: { can_view: true, can_add: true, can_edit: false, can_delete: false },
    Settings: noActions(true),
    About: noActions(true),
    POS: noActions(false),
    Inventory: noActions(false),
    CashierApproval: noActions(false),
    Wallets: noActions(false),
    Supplies: noActions(false),
    Reports: noActions(false),
    Admin: noActions(false),
    approve_card_returns: noActions(false),
  },
};

const definitionByCode = new Map(PERMISSION_DEFINITIONS.map((item) => [item.code, item]));
const roleById = new Map(ROLE_DEFINITIONS.map((item) => [item.id, item]));

const toBoolean = (value) => value === true || value === 1 || value === '1' || value === 'true';

export const normalizePermissionRole = (role) => String(role || '').trim().toLowerCase();

const normalizeCollectionStatus = (status) => String(status || 'pending').trim().toLowerCase();

const isExplicitlyInactive = (value) => (
  value === false || value === 0 || value === '0' || String(value).trim().toLowerCase() === 'false'
);

const COLLECTION_APPROVAL_STATUSES = new Set(['pending', 'pending_collection_approval']);
const BLOCKED_COLLECTION_STATUSES = new Set(['cancelled', 'canceled', 'deleted', 'rejected', 'inactive']);

export const hasUnresolvedCollectionDiscount = (collection = {}) => {
  const requestedValue = Number(
    collection.discount_requested_value
      ?? collection.inv_discount_requested_value
      ?? 0
  );
  const status = String(
    collection.discount_status
      ?? collection.inv_discount_status
      ?? ''
  ).trim().toLowerCase();
  return requestedValue > 0 && !['approved', 'auto_approved', 'rejected', 'none', ''].includes(status);
};

export const hasUnresolvedCollectionCardReturn = (collection = {}) => (
  normalizeCollectionStatus(collection.status) === 'pending_card_return_approval'
  || Number(
    collection.pending_card_returns_count
      ?? collection.inv_collection_pending_card_returns_count
      ?? 0
  ) > 0
);

/**
 * Protected collection-approval rule shared by UI and service code.
 * The service must call this only after loading actor/collection data from SQLite.
 */
export const getCollectionApprovalDecision = ({
  actor,
  collection,
  hasAgentSelfApprovalPermission = false,
  hasPendingCardReturn,
  hasBlockingDiscount,
} = {}) => {
  const role = normalizePermissionRole(actor?.role);
  const status = normalizeCollectionStatus(collection?.status);
  const actorId = String(actor?.id || '');
  const ownerId = String(collection?.agent_id || '');
  const actorProjectId = String(actor?.project_id || '');
  const collectionProjectId = String(collection?.project_id || '');

  if (!actorId || !collection?.id || !['admin', 'cashier', 'agent'].includes(role) || isExplicitlyInactive(actor?.active)) {
    return { allowed: false, code: 'FORBIDDEN', message: 'ليس لديك صلاحية اعتماد التحصيلات.' };
  }
  if (!actorProjectId || !collectionProjectId || actorProjectId !== collectionProjectId) {
    return { allowed: false, code: 'PROJECT_MISMATCH', message: 'لا يمكن اعتماد تحصيل تابع لمشروع آخر.' };
  }

  if (role === 'agent' && !hasAgentSelfApprovalPermission) {
    return { allowed: false, code: 'AGENT_SELF_APPROVAL_PERMISSION_REQUIRED', message: 'ليست لديك صلاحية اعتماد تحصيلاتك.' };
  }
  // Ownership is checked before exposing any details about the other agent's record.
  if (role === 'agent' && (!ownerId || ownerId !== actorId)) {
    return { allowed: false, code: 'AGENT_NOT_OWNER', message: 'لا يمكنك اعتماد تحصيل تابع لمندوب آخر.' };
  }
  if (isExplicitlyInactive(collection?.active) || BLOCKED_COLLECTION_STATUSES.has(status)) {
    return { allowed: false, code: 'COLLECTION_INACTIVE', message: 'لا يمكن اعتماد تحصيل ملغي أو مرفوض أو غير نشط.' };
  }
  if (hasPendingCardReturn ?? hasUnresolvedCollectionCardReturn(collection)) {
    return { allowed: false, code: 'CARD_RETURN_PENDING', message: 'لا يمكن اعتماد التحصيل قبل اعتماد مرتجع الكروت.' };
  }
  if (hasBlockingDiscount ?? hasUnresolvedCollectionDiscount(collection)) {
    return { allowed: false, code: 'DISCOUNT_PENDING', message: 'لا يمكن اعتماد التحصيل قبل اعتماد الخصم من المدير.' };
  }
  if (!COLLECTION_APPROVAL_STATUSES.has(status)) {
    return { allowed: false, code: 'INVALID_STATUS', message: 'لا يمكن اعتماد التحصيل في حالته الحالية.' };
  }

  return {
    allowed: true,
    code: role === 'agent' ? 'AGENT_SELF_APPROVAL' : 'ROLE_APPROVAL',
    message: '',
  };
};

export const canApproveCollection = (context) => getCollectionApprovalDecision(context).allowed;

export const getRoleDefinition = (role) => roleById.get(normalizePermissionRole(role)) || null;

export const getPermissionDefinition = (permissionCode) => definitionByCode.get(String(permissionCode || '')) || {
  code: String(permissionCode || ''),
  label: 'صلاحية غير معروفة',
  description: 'تعريف قديم أو غير مدعوم في هذا الإصدار؛ تم إبقاؤه للقراءة فقط.',
  group: 'other',
  icon: 'help-circle',
  systemLocked: true,
  lockReason: 'لا يمكن تعديل صلاحية غير معروفة أو غير مدعومة بأمان.',
};

export const getPermissionLabel = (permissionCode) => getPermissionDefinition(permissionCode).label;

export const getPermissionDescription = (permissionCode) => getPermissionDefinition(permissionCode).description;

export const isRestrictedPermission = (permissionCode) => !!getPermissionDefinition(permissionCode).systemLocked;

export const isSensitivePermission = (permissionCode) => !!getPermissionDefinition(permissionCode).sensitive;

export const canManagePermissions = (currentUser) => normalizePermissionRole(currentUser?.role) === 'admin';

export const isPermissionEditable = (targetRole, permissionCode, currentUser, action = 'can_view', entityType = 'ROLE') => {
  const role = normalizePermissionRole(targetRole);
  const definition = definitionByCode.get(String(permissionCode || ''));
  const normalizedEntityType = String(entityType || 'ROLE').trim().toUpperCase();
  if (!canManagePermissions(currentUser) || !roleById.has(role) || !definition) return false;
  if (role === 'admin' || definition.systemLocked) return false;
  if (definition.userOnly) {
    return normalizedEntityType === 'USER'
      && (definition.allowedUserRoles || []).includes(role)
      && action === 'can_view';
  }
  return action === 'can_view';
};

export const getPermissionLockReason = (targetRole, permissionCode, entityType = 'ROLE') => {
  const role = normalizePermissionRole(targetRole);
  const definition = getPermissionDefinition(permissionCode);
  const normalizedEntityType = String(entityType || 'ROLE').trim().toUpperCase();
  if (!roleById.has(role)) return 'هذا الدور غير معروف للنظام ولا يمكن تعديل صلاحياته.';
  if (role === 'admin') return 'صلاحيات المدير العام محمية لضمان بقاء إدارة النظام متاحة.';
  if (definition.systemLocked) return definition.lockReason;
  if (definition.userOnly && normalizedEntityType !== 'USER') return definition.lockReason;
  if (definition.userOnly && !(definition.allowedUserRoles || []).includes(role)) return 'هذه الصلاحية مخصصة لحسابات المندوبين فقط.';
  return 'عمليات الإضافة والتعديل والحذف محكومة بحواجز الدور والخدمات ولا تعدّل من هذه الشاشة.';
};

export const resolvePermissionForRole = (roleValue, permissionCode, rawPermission = null) => {
  const role = normalizePermissionRole(roleValue);
  const definition = definitionByCode.get(String(permissionCode || ''));
  const defaults = DEFAULT_ROLE_PERMISSIONS[role]?.[permissionCode] || noActions(false);
  const raw = rawPermission || defaults;

  if (!definition || !roleById.has(role)) {
    return { ...raw, ...noActions(false) };
  }

  if (definition.userOnly) {
    const isAllowedUserOverride = role === 'agent'
      && String(rawPermission?.entity_type || '').trim().toUpperCase() === 'USER';
    return {
      ...raw,
      ...noActions(isAllowedUserOverride ? toBoolean(rawPermission?.can_view) : false),
    };
  }

  if (role === 'admin' || definition.systemLocked) {
    return { ...raw, ...defaults };
  }

  const canView = rawPermission && Object.prototype.hasOwnProperty.call(rawPermission, 'can_view')
    ? toBoolean(rawPermission.can_view)
    : !!defaults.can_view;
  const resolved = { ...raw, can_view: canView };

  // CRUD/approval actions are role/service decisions in the current app. They are
  // deliberately not made dynamically assignable by this screen.
  for (const action of ACTION_FIELDS.slice(1)) {
    resolved[action] = canView ? !!defaults[action] : false;
  }
  return resolved;
};

export const validatePermissionChanges = (targetRoleValue, selectedPermissions = {}, currentUser = null) => {
  const targetRole = normalizePermissionRole(targetRoleValue);
  const errors = [];
  const normalized = {};

  if (!canManagePermissions(currentUser)) {
    errors.push('إدارة الصلاحيات متاحة للمدير العام فقط.');
  }
  if (!roleById.has(targetRole)) {
    errors.push('الدور المحدد غير معروف أو غير مدعوم.');
  }

  for (const definition of PERMISSION_DEFINITIONS) {
    const raw = selectedPermissions[definition.code] || DEFAULT_ROLE_PERMISSIONS[targetRole]?.[definition.code];
    const resolved = resolvePermissionForRole(targetRole, definition.code, raw);
    normalized[definition.code] = resolved;

    if (!resolved.can_view && (resolved.can_add || resolved.can_edit || resolved.can_delete)) {
      errors.push(`لا يمكن منح عمليات داخل ${definition.label} دون السماح بعرضها.`);
    }

    if ((definition.systemLocked || targetRole === 'admin') && raw) {
      const defaults = DEFAULT_ROLE_PERMISSIONS[targetRole]?.[definition.code] || noActions(false);
      const conflictsWithProtectedValue = ACTION_FIELDS.some((field) => toBoolean(raw[field]) !== !!defaults[field]);
      if (conflictsWithProtectedValue) {
        errors.push(`لا يمكن تعديل ${definition.label} لأنها مقيدة من النظام.`);
      }
    }
  }

  if (normalized.Dashboard?.can_view !== true) {
    errors.push('لا يمكن إزالة صلاحية الصفحة الرئيسية الأساسية.');
  }
  if (targetRole === 'admin' && normalized.Admin?.can_view !== true) {
    errors.push('لا يمكن إزالة آخر صلاحية لإدارة النظام من المدير العام.');
  }

  return { valid: errors.length === 0, errors: Array.from(new Set(errors)), permissions: normalized };
};
