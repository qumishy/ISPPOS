import { execSQL, notifyDataChanged, uuidv4 } from './dbCore';

const TABLE_NAME = 'invoice_notifications_log';
const normalizeText = (value) => String(value || '');

const ensureTable = async () => true;

export const ensureInvoiceNotificationLogTable = ensureTable;

export const claimInvoiceNotificationLog = async ({
  invoiceId,
  notificationType,
  recipientUserId = null,
  recipientRole = null,
  projectId = null,
  phaseId = null,
}) => {
  if (!invoiceId || !notificationType) return { inserted: false, existing: null, id: null };
  if (!projectId) {
    console.log('[InvoiceNotificationLog] blocked claim without project_id');
    return { inserted: false, existing: null, id: null };
  }
  await ensureTable();

  const existingR = await execSQL(
    `SELECT *
     FROM invoice_notifications_log
     WHERE invoice_id = ?
       AND notification_type = ?
       AND COALESCE(project_id, '') = COALESCE(?, '')
       AND COALESCE(phase_id, '') = COALESCE(?, '')
     LIMIT 1`,
    [invoiceId, notificationType, projectId, phaseId]
  );
  const existing = existingR.rows._array?.[0] || null;
  if (existing) return { inserted: false, existing, id: existing.id };

  const id = uuidv4();
  const now = new Date().toISOString();
  try {
    await execSQL(
      `INSERT INTO invoice_notifications_log (
        id, invoice_id, notification_type, recipient_user_id, recipient_role,
        project_id, phase_id, delivery_status, error_message, sent_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        invoiceId,
        notificationType,
        normalizeText(recipientUserId),
        normalizeText(recipientRole),
        normalizeText(projectId),
        normalizeText(phaseId),
        'pending',
        null,
        null,
        now,
        now,
      ]
    );
    notifyDataChanged(TABLE_NAME);
    return { inserted: true, existing: null, id };
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      const raceR = await execSQL(
        `SELECT *
         FROM invoice_notifications_log
         WHERE invoice_id = ?
           AND notification_type = ?
           AND COALESCE(project_id, '') = COALESCE(?, '')
           AND COALESCE(phase_id, '') = COALESCE(?, '')
         LIMIT 1`,
        [invoiceId, notificationType, projectId, phaseId]
      );
      return { inserted: false, existing: raceR.rows._array?.[0] || null, id: raceR.rows._array?.[0]?.id || null };
    }
    throw e;
  }
};

export const markInvoiceNotificationLogSent = async (logId, sentAt = new Date().toISOString()) => {
  if (!logId) return;
  await ensureTable();
  await execSQL(
    `UPDATE invoice_notifications_log
     SET delivery_status = 'sent',
         error_message = NULL,
         sent_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [sentAt, sentAt, logId]
  );
  notifyDataChanged(TABLE_NAME);
};

export const markInvoiceNotificationLogFailed = async (logId, errorMessage = '') => {
  if (!logId) return;
  await ensureTable();
  const now = new Date().toISOString();
  await execSQL(
    `UPDATE invoice_notifications_log
     SET delivery_status = 'failed',
         error_message = ?,
         updated_at = ?
     WHERE id = ?`,
    [String(errorMessage || 'unknown-error'), now, logId]
  );
  notifyDataChanged(TABLE_NAME);
};

export const hasInvoiceNotificationLog = async ({
  invoiceId,
  notificationType,
  recipientUserId = null,
  recipientRole = null,
  projectId = null,
  phaseId = null,
}) => {
  if (!invoiceId || !notificationType) return false;
  if (!projectId) return false;
  await ensureTable();
  const r = await execSQL(
    `SELECT id
     FROM invoice_notifications_log
     WHERE invoice_id = ?
       AND notification_type = ?
       AND COALESCE(project_id, '') = COALESCE(?, '')
       AND COALESCE(phase_id, '') = COALESCE(?, '')
     LIMIT 1`,
    [invoiceId, notificationType, projectId, phaseId]
  );
  return (r.rows._array || []).length > 0;
};
