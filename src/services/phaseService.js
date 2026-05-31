import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';

// ═══════════════════════════════════════════════════
// ── ثوابت ──
// ═══════════════════════════════════════════════════
const DEFAULT_PROJECT_ID = '00000000-0000-4000-a000-000000000001';
const DEFAULT_PHASE_ID   = '00000000-0000-4000-b000-000000000001';

// ═══════════════════════════════════════════════════
// ── المشروع ──
// ═══════════════════════════════════════════════════

/** إرجاع بيانات المشروع (singleton) */
export const getProjectInfo = async () => {
  const r = await execSQL(`SELECT * FROM project LIMIT 1`);
  return r.rows._array?.[0] || null;
};

/** تحديث بيانات المشروع */
export const updateProjectInfo = async (data) => {
  const existing = await getProjectInfo();
  if (!existing) {
    // إنشاء سجل المشروع إذا لم يكن موجوداً
    const id = DEFAULT_PROJECT_ID;
    const payload = {
      id,
      name: data.name || 'مشروع ISP',
      license_number: data.license_number || '',
      owner_name: data.owner_name || '',
      owner_phone: data.owner_phone || '',
      created_at: new Date().toISOString(),
      synced: 0,
    };
    await execSQL(
      `INSERT INTO project (id, name, license_number, owner_name, owner_phone, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [payload.id, payload.name, payload.license_number, payload.owner_name, payload.owner_phone, payload.created_at, 0]
    );
    await addToSyncQueue('project', 'INSERT', payload, id);
    notifyDataChanged('project');
    return payload;
  }

  const updated = {
    name: data.name ?? existing.name,
    license_number: data.license_number ?? existing.license_number,
    owner_name: data.owner_name ?? existing.owner_name,
    owner_phone: data.owner_phone ?? existing.owner_phone,
  };
  await execSQL(
    `UPDATE project SET name=?, license_number=?, owner_name=?, owner_phone=?, synced=0 WHERE id=?`,
    [updated.name, updated.license_number, updated.owner_name, updated.owner_phone, existing.id]
  );
  await addToSyncQueue('project', 'UPDATE', updated, existing.id);
  notifyDataChanged('project');
  return { ...existing, ...updated };
};

// ═══════════════════════════════════════════════════
// ── المراحل — القراءة ──
// ═══════════════════════════════════════════════════

/** إرجاع المرحلة النشطة الحالية */
export const getActivePhase = async (projectId) => {
  const where = projectId ? `AND project_id = '${projectId}'` : '';
  const r = await execSQL(`SELECT * FROM phases WHERE status = 'active' ${where} LIMIT 1`);
  return r.rows._array?.[0] || null;
};

/** إرجاع مرحلة بالمعرف */
export const getPhaseById = async (id) => {
  if (!id) return null;
  const r = await execSQL(`SELECT * FROM phases WHERE id = ? LIMIT 1`, [id]);
  return r.rows._array?.[0] || null;
};

/** إرجاع جميع المراحل مرتبة بالتاريخ */
export const getAllPhases = async (projectId) => {
  const where = projectId ? `WHERE project_id = '${projectId}'` : '';
  const r = await execSQL(`SELECT * FROM phases ${where} ORDER BY created_at DESC`);
  return r.rows._array || [];
};

/** إحصائيات المرحلة الكاملة */
export const getPhaseStats = async (phaseId) => {
  if (!phaseId) return null;

  // إجمالي المبيعات الفعلية
  const salesR = await execSQL(
    `SELECT COUNT(*) as count, COALESCE(SUM(net_amount), 0) as total
     FROM invoices WHERE phase_id = ? AND (active = 1 OR active IS NULL)`,
    [phaseId]
  );
  const sales = salesR.rows._array?.[0] || { count: 0, total: 0 };

  // الفواتير المعلقة (غير مسددة بالكامل)
  const pendingR = await execSQL(
    `SELECT COUNT(*) as count,
            COALESCE(SUM(MAX(0, COALESCE(net_amount, total_amount, 0) - COALESCE(paid_amount, 0))), 0) as total
     FROM invoices
     WHERE phase_id = ? AND (active = 1 OR active IS NULL)
       AND MAX(0, COALESCE(net_amount, total_amount, 0) - COALESCE(paid_amount, 0)) > 0.1`,
    [phaseId]
  );
  const pending = pendingR.rows._array?.[0] || { count: 0, total: 0 };

  // التحصيلات المعتمدة
  const colR = await execSQL(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
     FROM collections
     WHERE phase_id = ? AND status = 'approved' AND (active = 1 OR active IS NULL)`,
    [phaseId]
  );
  const collections = colR.rows._array?.[0] || { count: 0, total: 0 };

  // إجمالي التحصيلات (بجميع الحالات)
  const colAllR = await execSQL(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
     FROM collections
     WHERE phase_id = ? AND (active = 1 OR active IS NULL)`,
    [phaseId]
  );
  const collectionsAll = colAllR.rows._array?.[0] || { count: 0, total: 0 };

  // التوريدات
  const supR = await execSQL(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
     FROM supplies WHERE phase_id = ?`,
    [phaseId]
  );
  const supplies = supR.rows._array?.[0] || { count: 0, total: 0 };

  // نقاط البيع الجديدة خلال المرحلة (فواتير لنقاط بيع لم يسبق لها فواتير في مراحل سابقة)
  const phase = await getPhaseById(phaseId);
  let newPOSCount = 0;
  if (phase?.start_date) {
    const newPOSR = await execSQL(
      `SELECT COUNT(DISTINCT i.pos_id) as count
       FROM invoices i
       WHERE i.phase_id = ? AND (i.active = 1 OR i.active IS NULL)
         AND i.pos_id NOT IN (
           SELECT DISTINCT i2.pos_id FROM invoices i2
           WHERE i2.phase_id != ? AND i2.pos_id IS NOT NULL AND (i2.active = 1 OR i2.active IS NULL)
         )`,
      [phaseId, phaseId]
    );
    newPOSCount = newPOSR.rows._array?.[0]?.count || 0;
  }

  const collectionEfficiency = Number(sales.total) > 0
    ? Math.round((Number(collections.total) / Number(sales.total)) * 100)
    : 0;

  return {
    phase,
    sales: { count: Number(sales.count), total: Number(sales.total) },
    pending: { count: Number(pending.count), total: Number(pending.total) },
    collections: { count: Number(collections.count), total: Number(collections.total) },
    collectionsAll: { count: Number(collectionsAll.count), total: Number(collectionsAll.total) },
    supplies: { count: Number(supplies.count), total: Number(supplies.total) },
    newPOSCount,
    collectionEfficiency,
  };
};

// ═══════════════════════════════════════════════════
// ── المراحل — الكتابة (admin فقط) ──
// ═══════════════════════════════════════════════════

/** هل يمكن إنشاء مرحلة جديدة؟ */
export const canCreateNewPhase = async (projectId) => {
  const active = await getActivePhase(projectId);
  return !active; // يمكن فقط إذا لم تكن هناك مرحلة نشطة
};

/** إنشاء مرحلة جديدة */
export const createPhase = async (data, createdBy = null) => {
  const projectId = data.project_id;
  if (!projectId) throw new Error('رقم المشروع مطلوب لإنشاء مرحلة.');

  // التحقق من عدم وجود مرحلة نشطة
  const active = await getActivePhase(projectId);
  if (active) {
    throw new Error('لا يمكن إنشاء مرحلة جديدة قبل إغلاق المرحلة الحالية.');
  }

  const id = uuidv4();

  const payload = {
    id,
    project_id: projectId,
    name: data.name || 'مرحلة جديدة',
    description: data.description || '',
    start_date: data.start_date || new Date().toISOString().slice(0, 10),
    end_date: data.end_date || null,
    target_new_pos: Number(data.target_new_pos || 0),
    expected_total_sales: Number(data.expected_total_sales || 0),
    expected_total_collections: Number(data.expected_total_collections || 0),
    status: 'active',
    created_by: createdBy,
    created_at: new Date().toISOString(),
    closed_at: null,
    synced: 0,
  };

  await execSQL(
    `INSERT INTO phases (id, project_id, name, description, start_date, end_date,
      target_new_pos, expected_total_sales, expected_total_collections,
      status, created_by, created_at, closed_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id, payload.project_id, payload.name, payload.description,
      payload.start_date, payload.end_date, payload.target_new_pos,
      payload.expected_total_sales, payload.expected_total_collections,
      payload.status, payload.created_by, payload.created_at, payload.closed_at, 0,
    ]
  );

  await addToSyncQueue('phases', 'INSERT', payload, id);

  // نقل الفواتير المعلقة من المراحل المغلقة إلى المرحلة الجديدة
  await migrateOutstandingToPhase(id);

  notifyDataChanged('phases');
  console.log(`[Phase] ✅ Created new phase: ${payload.name} (${id})`);
  return payload;
};

/** إغلاق المرحلة */
export const closePhase = async (phaseId) => {
  if (!phaseId) throw new Error('معرف المرحلة مطلوب');

  const phase = await getPhaseById(phaseId);
  if (!phase) throw new Error('المرحلة غير موجودة');
  if (phase.status === 'closed') throw new Error('المرحلة مغلقة بالفعل');

  const closedAt = new Date().toISOString();
  await execSQL(
    `UPDATE phases SET status = 'closed', closed_at = ?, synced = 0 WHERE id = ?`,
    [closedAt, phaseId]
  );
  await addToSyncQueue('phases', 'UPDATE', { status: 'closed', closed_at: closedAt }, phaseId);
  notifyDataChanged('phases');
  console.log(`[Phase] 🔒 Closed phase: ${phase.name} (${phaseId})`);
  return true;
};

/** استئناف مرحلة مغلقة (إذا لم تكن هناك مرحلة أحدث منها) */
export const resumePhase = async (phaseId) => {
  if (!phaseId) throw new Error('معرف المرحلة مطلوب');

  const phase = await getPhaseById(phaseId);
  if (!phase) throw new Error('المرحلة غير موجودة');
  if (phase.status === 'active') throw new Error('المرحلة نشطة بالفعل');

  const active = await getActivePhase(phase.project_id);
  if (active) throw new Error('لا يمكن استئناف مرحلة وهناك مرحلة نشطة حالياً. قم بإغلاقها أولاً.');

  const newerR = await execSQL(
    `SELECT id FROM phases WHERE datetime(created_at) > datetime(?) AND project_id = ? LIMIT 1`,
    [phase.created_at, phase.project_id]
  );
  if ((newerR.rows._array || []).length > 0) {
    throw new Error('لا يمكن استئناف هذه المرحلة لوجود مرحلة أحدث منها.');
  }

  await execSQL(
    `UPDATE phases SET status = 'active', closed_at = NULL, synced = 0 WHERE id = ?`,
    [phaseId]
  );
  await addToSyncQueue('phases', 'UPDATE', { status: 'active', closed_at: null }, phaseId);
  notifyDataChanged('phases');
  console.log(`[Phase] 🔓 Resumed phase: ${phase.name} (${phaseId})`);
  return true;
};

/** تحديث بيانات المرحلة */
export const updatePhase = async (phaseId, data) => {
  if (!phaseId) throw new Error('معرف المرحلة مطلوب');

  const updateFields = {};
  const setClauses = [];
  const params = [];

  const allowed = [
    'name', 'description', 'start_date', 'end_date',
    'target_new_pos', 'expected_total_sales', 'expected_total_collections',
  ];

  for (const key of allowed) {
    if (key in data) {
      updateFields[key] = data[key];
      setClauses.push(`${key} = ?`);
      params.push(data[key]);
    }
  }

  if (setClauses.length === 0) return;

  setClauses.push('synced = 0');
  params.push(phaseId);

  await execSQL(`UPDATE phases SET ${setClauses.join(', ')} WHERE id = ?`, params);
  await addToSyncQueue('phases', 'UPDATE', updateFields, phaseId);
  notifyDataChanged('phases');
};

// ═══════════════════════════════════════════════════
// ── نقل الفواتير المعلقة ──
// ═══════════════════════════════════════════════════

/**
 * نقل الفواتير المعلقة وغير المسددة وتحصيلاتها إلى المرحلة الجديدة.
 * يتم نقل:
 * - الفواتير بحالة pending أو partial
 * - التحصيلات المرتبطة بها (pending أو approved غير مورّدة)
 */
export const migrateOutstandingToPhase = async (newPhaseId) => {
  console.log(`[Phase] 🔄 Migrating outstanding invoices to phase ${newPhaseId}...`);

  // 1) جلب الفواتير المعلقة من مراحل أخرى
  const outstandingR = await execSQL(
    `SELECT id FROM invoices
     WHERE (phase_id IS NULL OR phase_id != ?)
       AND (active = 1 OR active IS NULL)
       AND status IN ('pending', 'partial')`,
    [newPhaseId]
  );
  const outstanding = outstandingR.rows._array || [];

  if (outstanding.length === 0) {
    console.log(`[Phase] No outstanding invoices to migrate.`);
    return { invoicesMoved: 0, collectionsMoved: 0 };
  }

  let collectionsMoved = 0;

  for (const inv of outstanding) {
    // تحديث المرحلة للفاتورة
    await execSQL(`UPDATE invoices SET phase_id = ?, synced = 0 WHERE id = ?`, [newPhaseId, inv.id]);
    await addToSyncQueue('invoices', 'UPDATE', { phase_id: newPhaseId }, inv.id);

    // نقل التحصيلات المرتبطة بالفاتورة
    const colsR = await execSQL(
      `SELECT id FROM collections
       WHERE invoice_id = ? AND (active = 1 OR active IS NULL)
         AND (phase_id IS NULL OR phase_id != ?)`,
      [inv.id, newPhaseId]
    );
    for (const col of (colsR.rows._array || [])) {
      await execSQL(`UPDATE collections SET phase_id = ?, synced = 0 WHERE id = ?`, [newPhaseId, col.id]);
      await addToSyncQueue('collections', 'UPDATE', { phase_id: newPhaseId }, col.id);
      collectionsMoved++;
    }
  }

  notifyDataChanged('invoices');
  notifyDataChanged('collections');
  console.log(`[Phase] ✅ Migrated ${outstanding.length} invoices and ${collectionsMoved} collections to new phase.`);
  return { invoicesMoved: outstanding.length, collectionsMoved };
};

// ═══════════════════════════════════════════════════
// ── ضمان البيانات الافتراضية ──
// ═══════════════════════════════════════════════════

/** التأكد من وجود مشروع ومرحلة افتراضية — يُستدعى من initDatabase */
export const ensureDefaultProjectAndPhase = async () => {
  // المشروع
  const projR = await execSQL(`SELECT id FROM project LIMIT 1`);
  if ((projR.rows._array || []).length === 0) {
    await execSQL(
      `INSERT OR IGNORE INTO project (id, name, license_number, owner_name, owner_phone, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [DEFAULT_PROJECT_ID, 'مشروع ISP', '', '', '', new Date().toISOString(), 0]
    );
    console.log('[Phase] Seeded default project');
  }

  // المرحلة
  const phaseR = await execSQL(`SELECT id FROM phases LIMIT 1`);
  if ((phaseR.rows._array || []).length === 0) {
    await execSQL(
      `INSERT OR IGNORE INTO phases (id, project_id, name, description, start_date, status, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        DEFAULT_PHASE_ID, DEFAULT_PROJECT_ID,
        'المرحلة الأولى', 'المرحلة الافتراضية — تشمل جميع البيانات السابقة',
        new Date().toISOString().slice(0, 10), 'active', new Date().toISOString(), 0,
      ]
    );
    console.log('[Phase] Seeded default phase');
  }

  // Backfill: ربط الفواتير والتحصيلات والتوريدات الحالية بالمرحلة الافتراضية
  const activePhase = await getActivePhase(DEFAULT_PROJECT_ID);
  if (activePhase) {
    await execSQL(`UPDATE invoices SET phase_id = ? WHERE phase_id IS NULL AND project_id = ?`, [activePhase.id, DEFAULT_PROJECT_ID]);
    await execSQL(`UPDATE collections SET phase_id = ? WHERE phase_id IS NULL AND project_id = ?`, [activePhase.id, DEFAULT_PROJECT_ID]);
    await execSQL(`UPDATE supplies SET phase_id = ? WHERE phase_id IS NULL AND project_id = ?`, [activePhase.id, DEFAULT_PROJECT_ID]);
    await execSQL(`UPDATE agent_wallets SET phase_id = ? WHERE phase_id IS NULL AND project_id = ?`, [activePhase.id, DEFAULT_PROJECT_ID]);
  }
};
