import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { execSQL, getSetting, isDbReady, waitForDbReady } from './dbCore';
import {
  claimInvoiceNotificationLog,
  markInvoiceNotificationLogSent,
  markInvoiceNotificationLogFailed,
} from './invoiceNotificationLogService';

let _overdueScanInFlight = false;
const _lastOverdueScanAtByUser = new Map();
const OVERDUE_SCAN_DEBOUNCE_MS = 2 * 60 * 1000;

// ── إعدادات كيفية ظهور التنبيهات ──
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * إعداد مستمع للأحداث عند ورود تنبيه أو الضغط عليه
 */
export function setupNotificationListeners(navigationRef) {
  // عند استلام تنبيه والتطبيق مفتوح
  const notificationListener = Notifications.addNotificationReceivedListener(notification => {
    console.log('[NotificationService] Received:', notification);
    const data = notification.request.content.data;
    saveNotificationHistory(
      notification.request.content.title,
      notification.request.content.body,
      data,
      notification.request.identifier
    );
  });

  // عند الضغط على التنبيه (سواء كان التطبيق في الخلفية أو مغلقاً)
  const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    saveNotificationHistory(
      response.notification.request.content.title,
      response.notification.request.content.body,
      data,
      response.notification.request.identifier
    );
    console.log('[NotificationService] Response Data:', data);

    if (data?.route && navigationRef.current) {
        // الانتقال للشاشة المحددة في بيانات التنبيه
        navigationRef.current.navigate(data.route, data.params || {});
    }
  });

  return () => {
    notificationListener.remove();
    responseListener.remove();
  };
}

/**
 * طلب تصريح التنبيهات من جهاز المستخدم
 */
export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }
    
    try {
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: '646d2fcc-0ecb-472b-abdb-2011179d1af0',
        })
      ).data;
      console.log('[NotificationService] Expo Push Token:', token);
    } catch (error) {
      console.error('Error getting push token', error);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export async function saveNotificationHistory(title, body, data = {}, notificationId = null) {
  try {
    if (!isDbReady()) {
      await waitForDbReady();
      if (!isDbReady()) {
        console.log('[Notifications] skipped save before DB ready');
        return;
      }
    }
    const { saveLocalNotificationBox } = require('./dbNotificationService');
    const projectId = data?.project_id || data?.projectId || data?.project_id_context || null;
    const stableEventKey =
      data?.event_key ||
      data?.eventKey ||
      (
        projectId &&
        (data?.reference_id || data?.referenceId || data?.type)
          ? [
              'biz',
              projectId,
              data?.user_id || data?.recipient_id || '',
              data?.type || '',
              data?.reference_id || data?.referenceId || '',
              data?.route || '',
            ].join(':')
          : null
      ) ||
      (notificationId ? `notification:${notificationId}` : null);
    await saveLocalNotificationBox({
      id: notificationId || data?.id,
      project_id: projectId,
      user_id: data?.user_id || data?.recipient_id || null,
      title,
      body,
      type: data?.type || '',
      reference_id: data?.reference_id || '',
      event_key: stableEventKey,
      route: data?.route || '',
      params: JSON.stringify(data?.params || {}),
      is_read: 0
    });
  } catch (e) {
    console.error('Error saving notification history:', e);
  }
}

const _recentTriggers = new Map();
const TRIGGER_DEBOUNCE_MS = 5 * 60 * 1000;

export async function triggerAppNotification({
  type, actor, count, category, agent, amount, pos_name,
  reference_id, targetRoles = [], targetUserIds = [], excludeUserIds = [], projectId = null
}) {
  if (!projectId) {
    console.log('[Notifications] blocked trigger without project_id');
    return;
  }
  
  const debounceKey = ['biz', projectId, type || 'general', reference_id || ''].join(':');
  const now = Date.now();
  if (_recentTriggers.has(debounceKey)) {
    if (now - _recentTriggers.get(debounceKey) < TRIGGER_DEBOUNCE_MS) {
      console.log(`[Notifications] skipped duplicate trigger for event_key: ${debounceKey}`);
      return;
    }
  }
  _recentTriggers.set(debounceKey, now);
  let title = '';
  let body = '';
  let route = '';
  
  if (type === 'distribution') {
    title = 'توزيع مخزون جديد';
    body = `قام المحاسب ${actor} بتوزيع ${count} أوراق فئة ${category} للمندوب ${agent}`;
    route = 'WalletsTab';
  } else if (type === 'return') {
    title = 'استرجاع مخزون';
    body = `تم استرجاع ${count} أوراق فئة ${category} من المندوب ${agent} إلى المخزون`;
    route = 'WalletsTab';
  } else if (type === 'collection_approval') {
    title = 'اعتماد تحصيل';
    body = `قام المحاسب ${actor} باعتماد تحصيل بمبلغ ${amount} من ${pos_name}`;
    route = 'CollectionsTab';
  } else if (type === 'supply') {
    title = 'توريد جديد';
    body = `قام المحاسب ${actor} بتوريد مبلغ ${amount}`;
    route = 'SuppliesTab';
  }

  const event_key = ['biz', projectId, type || 'general', reference_id || '', route || ''].join(':');
  const data = { type, reference_id, event_key, route, params: { reference_id }, project_id: projectId };

  const { uuidv4 } = require('./dbCore');
  const notifId = uuidv4();
  await saveNotificationHistory(title, body, data, notifId);

  await sendRoleBasedPush({
    title, body, data, targetRoles, targetUserIds, excludeUserIds
  });
}

/**
 * إرسال تنبيه محلي فوري
 * @param {string} title العنوان
 * @param {string} body نص التنبيه
 * @param {object} data بيانات إضافية
 */
export async function sendLocalNotification(title, body, data = {}) {
  try {
    if (!data?.project_id && !data?.projectId) {
      console.log('[Notifications] blocked local send without project_id');
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger: null, // null يعني فوراً
    });
    
    await saveNotificationHistory(title, body, data);
  } catch (e) {
    console.error('Error sending local notification:', e);
  }
}

export async function checkAndSendOverdueInvoiceNotifications(user) {
  const scanKey = user?.project_id && user?.id ? `${user.project_id}:${user.id}:${user.role}` : '';
  let didStartScan = false;
  try {
    if (_overdueScanInFlight) {
      console.log('[OverdueNotifications] skipped: scan already running');
      return 0;
    }
    if (scanKey) {
      const lastScanAt = _lastOverdueScanAtByUser.get(scanKey) || 0;
      if (Date.now() - lastScanAt < OVERDUE_SCAN_DEBOUNCE_MS) {
        console.log('[OverdueNotifications] skipped: debounced');
        return 0;
      }
    }
    if (!isDbReady()) {
      await waitForDbReady();
      if (!isDbReady()) return 0;
    }
    if (!user?.id || !['admin', 'agent'].includes(user.role)) return 0;
    if (!user.project_id) {
      console.log('[OverdueNotifications] blocked without project_id');
      return 0;
    }
    _overdueScanInFlight = true;
    didStartScan = true;
    if (scanKey) _lastOverdueScanAtByUser.set(scanKey, Date.now());
    console.log(`[OverdueNotifications] scan project_id=${user.project_id} user_id=${user.id} role=${user.role}`);

    const overdueDays = Number(await getSetting('overdue_days', '20')) || 20;
    const dueDateExpr = `date(COALESCE(i.due_date, date(COALESCE(i.invoice_date, i.created_at), '+' || ? || ' days')))`;
    const delayDaysExpr = `CAST(julianday(date('now','localtime')) - julianday(${dueDateExpr}) AS INTEGER)`;
    const paidCollectionsExpr = `(SELECT COALESCE(SUM(c.amount), 0)
                                  FROM collections c
                                  WHERE c.invoice_id = i.id
                                    AND c.project_id = i.project_id
                                    AND (c.active = 1 OR c.active = 'true' OR c.active IS NULL)
                                    AND LOWER(COALESCE(c.status, 'pending')) NOT IN ('rejected', 'cancelled', 'canceled', 'deleted'))`;
    const invoiceAmountExpr = `MAX(0, CASE WHEN COALESCE(i.discount_status, 'none') IN ('approved', 'auto_approved')
      THEN COALESCE(NULLIF(i.net_amount, 0), COALESCE(i.total_amount, 0) - COALESCE(i.discount_applied_value, 0))
      ELSE COALESCE(i.total_amount, 0)
    END)`;
    const remainingExpr = `MAX(0, ${invoiceAmountExpr} - (${paidCollectionsExpr}))`;

    let sql = `
      SELECT
        i.id,
        i.invoice_number,
        i.project_id,
        i.phase_id,
        i.agent_id,
        p.name as pos_name,
        u.name as agent_name,
        ${remainingExpr} as remaining_amount,
        ${delayDaysExpr} as delay_days
      FROM invoices i
      JOIN pos_customers p ON p.id = i.pos_id
      LEFT JOIN users u ON u.id = i.agent_id
      WHERE COALESCE(i.is_deleted, 0) = 0
        AND i.deleted_at IS NULL
        AND i.project_id = ?
        AND (i.active = 1 OR i.active = 'true' OR i.active IS NULL)
        AND ${remainingExpr} > 0.1
    `;
    const params = [overdueDays, user.project_id];

    if (user.role === 'agent') {
      sql += ` AND i.agent_id = ?`;
      params.push(user.id);
    }

    const r = await execSQL(sql, params);
    let sentCount = 0;

    for (const inv of r.rows._array || []) {
      if (Number(inv.delay_days) <= 0) continue;

      const claim = await claimInvoiceNotificationLog({
        invoiceId: inv.id,
        notificationType: 'overdue',
        recipientUserId: user.id,
        recipientRole: user.role,
        projectId: inv.project_id || null,
        phaseId: inv.phase_id || null,
      });
      if (!claim.inserted) continue;

      const remaining = Number(inv.remaining_amount || 0);
      try {
        if (user.role === 'agent' && inv.agent_id === user.id) {
          await sendLocalNotification(
            '⚠️ فاتورة متأخرة',
            `عميلك (${inv.pos_name}) أصبح في حالة تأخير. المتبقي ${remaining} ر.ي.`,
            { route: 'Invoices', invoiceId: inv.id, notification_type: 'overdue', project_id: user.project_id }
          );
        } else if (user.role === 'admin') {
          await sendLocalNotification(
            '⚠️ فاتورة متأخرة',
            `عميل (${inv.pos_name}) للمندوب ${inv.agent_name || 'غير محدد'} أصبح في حالة تأخير. المتبقي ${remaining} ر.ي.`,
            { route: 'Invoices', invoiceId: inv.id, notification_type: 'overdue', project_id: user.project_id }
          );
        }

        await markInvoiceNotificationLogSent(claim.id);
        await execSQL(`UPDATE invoices SET notified_overdue = 1 WHERE id = ? AND project_id = ?`, [inv.id, user.project_id]);
        sentCount += 1;
      } catch (e) {
        await markInvoiceNotificationLogFailed(claim.id, e?.message || 'send-overdue-notification-failed');
      }
    }

    return sentCount;
  } catch (e) {
    return 0;
  } finally {
    if (didStartScan) _overdueScanInFlight = false;
  }
}

const isValidExpoPushToken = (token) => {
  if (!token || typeof token !== 'string') return false;
  return /^ExponentPushToken\[.+\]$/.test(token) || /^ExpoPushToken\[.+\]$/.test(token);
};

async function sendExpoPushMessages(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return { sent: 0, channel: 'push' };
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      return { sent: 0, channel: 'push', error: `push-http-${res.status}` };
    }
    return { sent: messages.length, channel: 'push' };
  } catch (e) {
    return { sent: 0, channel: 'push', error: e?.message || 'push-send-failed' };
  }
}

export async function sendRoleBasedPush({
  title,
  body,
  data = {},
  targetRoles = [],
  targetUserIds = [],
  excludeUserIds = [],
}) {
  try {
    const projectId = data?.project_id || data?.projectId || null;
    if (!projectId) {
      console.log('[Notifications] blocked role push without project_id');
      return { sent: 0, channel: 'push', error: 'missing-project-id' };
    }
    const { supabase } = require('./supabase');
    const { data: users, error } = await supabase
      .from('users')
      .select('id,name,role,is_active,push_token,project_id')
      .eq('project_id', projectId);

    if (error) return { sent: 0, channel: 'push', error: error.message };

    const roleSet = new Set((targetRoles || []).filter(Boolean));
    const idSet = new Set((targetUserIds || []).filter(Boolean));
    const excludeSet = new Set((excludeUserIds || []).filter(Boolean));

    const recipients = (users || []).filter((u) => {
      if (!u?.id || excludeSet.has(u.id)) return false;
      if (u.is_active === false) return false;
      if (!isValidExpoPushToken(u.push_token)) return false;
      if (idSet.size === 0 && roleSet.size === 0) return false;
      if (idSet.has(u.id)) return true;
      return roleSet.has(u.role);
    });

    if (recipients.length === 0) return { sent: 0, channel: 'push', recipients: [] };

    const msgs = recipients.map((u) => ({
      to: u.push_token,
      sound: 'default',
      title,
      body,
      data: {
        ...data,
        recipient_id: u.id,
        recipient_role: u.role,
        delivery_channel: 'push',
      },
    }));

    const sent = await sendExpoPushMessages(msgs);
    return {
      ...sent,
      recipients: recipients.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    };
  } catch (e) {
    return { sent: 0, channel: 'push', error: e?.message || 'role-push-failed' };
  }
}
