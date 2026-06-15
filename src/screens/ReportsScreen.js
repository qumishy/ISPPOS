/**
 * ReportsScreen.js — الاستعلام الشامل
 * يستخدم SQLite المحلي (JOIN كامل) لضمان ظهور كل البيانات
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Platform, InteractionManager,
  KeyboardAvoidingView, Linking,
} from 'react-native';
import { useTheme } from '../theme';
import { execSQL, getAllPhases, decorateInvoiceStatusFields } from '../services/database';
import { getInventoryTracking } from '../services/inventoryService';
import { subscribeDataChanges } from '../services/dbCore';
import { getCached } from '../services/cacheService';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
import { formatCurrency, invoicePaymentStatusMeta, invoiceApprovalStatusMeta } from '../utils/helpers';
import { useAuth } from '../services/AuthContext';

// ═══════════════════════════════════════════════════════
// الأعمدة
// ═══════════════════════════════════════════════════════
const COLS = [
  { key: 'invoice_number',    label: 'رقم الفاتورة',         w: 125 },
  { key: 'invoice_date',      label: 'تاريخ الفاتورة',       w: 100 },
  { key: 'agent_name',        label: 'المندوب',               w: 110 },
  { key: 'pos_name',          label: 'نقطة البيع',            w: 130 },
  { key: 'pos_owner',         label: 'مالك نقطة البيع',      w: 120 },
  { key: 'pos_city',          label: 'المنطقة',               w: 90  },
  { key: 'category_name',     label: 'الفئة',                 w: 110 },
  { key: 'batch_number',      label: 'رقم الدفعة',            w: 115 },
  { key: 'quantity',          label: 'الكمية',                w: 70  },
  { key: 'unit_price',        label: 'سعر الورقة',            w: 95  },
  { key: 'net_amount',        label: 'صافي الفاتورة',         w: 105 },
  { key: 'payment_status',    label: 'حالة السداد',           w: 105 },
  { key: 'approval_status',   label: 'حالة الاعتماد',         w: 105 },
  { key: 'collection_number', label: 'رقم التحصيل',           w: 125 },
  { key: 'collection_date',   label: 'تاريخ التحصيل',         w: 100 },
  { key: 'col_amount',        label: 'مبلغ التحصيل',          w: 105 },
  { key: 'col_status',        label: 'حالة التحصيل',          w: 95  },
  { key: 'approver_name',     label: 'المحاسب المعتمد',       w: 120 },
  { key: 'approved_at',       label: 'تاريخ الاعتماد',        w: 100 },
  { key: 'is_supplied',       label: 'مورّد؟',               w: 70  },
  { key: 'remaining',         label: 'المتبقي',               w: 105 },
];

const COLLECTION_STATUS_MAP = {
  pending:  { text: 'معلق',   color: '#d97706' },
  approved: { text: 'معتمد',  color: '#16a34a' },
  rejected: { text: 'مرفوض', color: '#dc2626' },
  cancelled: { text: 'ملغية', color: '#ef4444' },
};

const INITIAL_REPORT_ROWS = 150;
const REPORT_ROWS_STEP = 150;
const INITIAL_WALLET_ROWS = 60;
const WALLET_ROWS_STEP = 60;
const REPORT_CACHE_TTL_MS = 20000;

const waitForInteractionsOrTimeout = (timeoutMs = 250) =>
  new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    try {
      InteractionManager.runAfterInteractions(() => {
        clearTimeout(timer);
        finish();
      });
    } catch (e) {
      clearTimeout(timer);
      finish();
    }
  });

// ═══════════════════════════════════════════════════════
// الاستعلام المحلي الشامل (SQLite JOIN)
// ═══════════════════════════════════════════════════════
const AUDIT_SQL = `
  SELECT
    i.id              AS inv_id,
    i.phase_id,
    i.invoice_number,
    i.invoice_date,
    COALESCE(ag.name, '—')       AS agent_name,
    COALESCE(p.name,  '—')       AS pos_name,
    COALESCE(p.owner_name, '—')  AS pos_owner,
    COALESCE(p.city,  '—')       AS pos_city,
    COALESCE(cc.name, '—')       AS category_name,
    COALESCE(b.batch_number, b.serial_number, '—')  AS batch_number,
    COALESCE(ii.quantity, '—')   AS quantity,
    ii.unit_price,
    i.total_amount,
    i.discount_applied_value,
    i.discount_status,
    CASE WHEN COALESCE(i.discount_status, 'none') IN ('approved', 'auto_approved')
      THEN MAX(0, COALESCE(NULLIF(i.net_amount, 0), COALESCE(i.total_amount, 0) - COALESCE(i.discount_applied_value, 0)))
      ELSE COALESCE(i.total_amount, 0)
    END AS net_amount,
    i.status                     AS stored_payment_status,
    (SELECT COALESCE(SUM(pc.amount), 0)
     FROM collections pc
     WHERE pc.invoice_id = i.id
       AND (pc.active = 1 OR pc.active IS NULL OR pc.active = 'true')
       AND LOWER(COALESCE(pc.status, 'pending')) NOT IN ('deleted', 'cancelled', 'canceled', 'rejected')) AS paid_amount,
    (SELECT COALESCE(SUM(ac.amount), 0)
     FROM collections ac
     WHERE ac.invoice_id = i.id
       AND (ac.active = 1 OR ac.active IS NULL OR ac.active = 'true')
       AND ac.status = 'approved') AS approved_amount,
    c.collection_number,
    c.collection_date,
    COALESCE(cc.price, ii.unit_price, 0) * COALESCE(ii.quantity, 0) AS col_amount,
    c.status                     AS col_status,
    COALESCE(apr.name, c.approved_by, '—') AS approver_name,
    SUBSTR(c.approved_at, 1, 10) AS approved_at,
    CASE WHEN (c.supply_id IS NOT NULL AND c.supply_id != '') THEN 1 ELSE 0 END AS is_supplied_raw
  FROM invoices i
  LEFT JOIN users        ag  ON ag.id  = i.agent_id
  LEFT JOIN pos_customers p  ON p.id   = i.pos_id
  LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
  LEFT JOIN card_categories cc ON cc.id = ii.category_id
  LEFT JOIN batches        b  ON b.id  = ii.batch_id
  LEFT JOIN collections    c  ON c.invoice_id = i.id
                              AND LOWER(COALESCE(c.status, '')) NOT IN ('deleted')
  LEFT JOIN users          apr ON apr.id = c.approved_by
  WHERE COALESCE(i.is_deleted, 0) = 0
    AND i.deleted_at IS NULL
    AND LOWER(COALESCE(i.status, '')) NOT IN ('deleted')
    AND i.project_id = ?
  ORDER BY i.invoice_date DESC, i.invoice_number ASC, c.collection_date ASC
`;

// احتساب المتبقي: نجلب إجمالي التحصيال المعتمدة لكل فاتورة
const REMAINING_SQL = `
  SELECT invoice_id,
         SUM(amount) AS total_paid
  FROM collections
  WHERE (active = 1 OR active IS NULL OR active = 'true')
    AND project_id = ?
    AND LOWER(COALESCE(status, '')) NOT IN ('deleted', 'cancelled', 'canceled', 'rejected')
  GROUP BY invoice_id
`;

// ═══════════════════════════════════════════════════════
// خلية
// ═══════════════════════════════════════════════════════
function Cell({ col, value, colors }) {
  const border = colors.border + '35';

  if (col.key === 'payment_status' || col.key === 'approval_status' || col.key === 'col_status') {
    if (!value) return <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center' }}><Text style={{ fontSize: 10, color: colors.t3 }}>—</Text></View>;
    const s = col.key === 'payment_status'
      ? invoicePaymentStatusMeta(value)
      : col.key === 'approval_status'
        ? invoiceApprovalStatusMeta(value)
        : (COLLECTION_STATUS_MAP[value] || { text: value, color: colors.t3 });
    return (
      <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: s.color + '1a', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 }}>
          <Text style={{ fontSize: 9, fontWeight: 'bold', color: s.color }}>{s.text || s.label}</Text>
        </View>
      </View>
    );
  }

  if (col.key === 'is_supplied') {
    return (
      <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center', alignItems: 'center' }}>
        {value ? <Feather name="check" size={12} color="#16a34a" /> : <Text style={{ fontSize: 11 }}>—</Text>}
      </View>
    );
  }

  const moneyKeys = ['net_amount', 'col_amount', 'unit_price', 'remaining'];
  if (moneyKeys.includes(col.key)) {
    const n = parseFloat(value) || 0;
    const color = col.key === 'remaining' && n > 0 ? '#dc2626'
                : col.key === 'col_amount' ? '#16a34a'
                : colors.t1;
    return (
      <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center', alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color }}>
          {value != null ? formatCurrency(n) : '—'}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center' }}>
      <Text style={{ fontSize: 10, color: value && value !== '—' ? colors.t1 : colors.t3 }} numberOfLines={1}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════
// شيت الفلاتر
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
function FilterSheet({ visible, onClose, agents, phases, filters, onApply, colors, defaultPhaseId }) {
  const [local, setLocal] = useState(filters);
  const set = (k, v) => setLocal(p => ({ ...p, [k]: v }));
  useEffect(() => { if (visible) setLocal(filters); }, [visible, filters]);

  const pill = (key, active, onPress, label, activeColor) => (
    <TouchableOpacity key={key} onPress={onPress} style={{
      paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, marginLeft: 7, marginBottom: 7,
      backgroundColor: active ? (activeColor || colors.blue) : colors.bg2,
      borderWidth: 1, borderColor: active ? (activeColor || colors.blue) : colors.border + '50',
    }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : colors.t2 }}>{label}</Text>
    </TouchableOpacity>
  );

  const lbl = (t) => <Text style={{ fontSize: 12, color: colors.t3, marginBottom: 6, textAlign: 'right', fontWeight: '700' }}>{t}</Text>;
  const inp = { backgroundColor: colors.bg2, padding: 11, borderRadius: 9, color: colors.t1, textAlign: 'right', borderWidth: 1, borderColor: colors.border + '55', fontSize: 13, marginBottom: 16 };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} activeOpacity={1} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: '82%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ color: colors.t3, fontSize: 20, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.t1 }}>تصفية النتائج</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {lbl('من تاريخ')}
            <TextInput style={inp} value={local.dateFrom} onChangeText={v => set('dateFrom', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.t3} />

            {lbl('إلى تاريخ')}
            <TextInput style={inp} value={local.dateTo} onChangeText={v => set('dateTo', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.t3} />

            {lbl('المندوب')}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {pill('all', local.agentId === '', () => set('agentId', ''), 'الكل')}
              {agents.map(a => pill(a.id, local.agentId === a.id, () => set('agentId', a.id), a.name))}
            </ScrollView>

            {lbl('المرحلة')}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {pill('all-phase', local.phaseId === '', () => set('phaseId', ''), 'الكل')}
              {phases.map(p => pill(p.id, local.phaseId === p.id, () => set('phaseId', p.id), p.name))}
            </ScrollView>

            {lbl('حالة السداد')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {[['', 'الكل'], ['pending', 'معلقة'], ['partial', 'مسددة جزئياً'], ['paid', 'مسددة'], ['cancelled', 'ملغية']].map(([v, l]) =>
                pill(v || 'all-pay', local.paymentStatus === v, () => set('paymentStatus', v), l, '#2563eb')
              )}
            </View>

            {lbl('حالة الاعتماد')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {[['', 'الكل'], ['unapproved', 'غير معتمدة'], ['approval_partial', 'معتمد جزئي'], ['approved', 'معتمدة']].map(([v, l]) =>
                pill(v || 'all-approval', local.approvalStatus === v, () => set('approvalStatus', v), l, '#0f766e')
              )}
            </View>

            {lbl('حالة التحصيل')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 }}>
              {[['', 'الكل'], ['pending', 'معلق'], ['approved', 'معتمد'], ['rejected', 'مرفوض'], ['cancelled', 'ملغية']].map(([v, l]) =>
                pill(v || 'all-col', local.colStatus === v, () => set('colStatus', v), l, '#7c3aed')
              )}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
            <TouchableOpacity
              onPress={() => { onApply({ dateFrom: '', dateTo: '', agentId: '', phaseId: defaultPhaseId || '', paymentStatus: '', approvalStatus: '', colStatus: '' }); onClose(); }}
              style={{ flex: 1, padding: 13, borderRadius: 11, borderWidth: 1, borderColor: colors.border + '60', alignItems: 'center' }}>
              <Text style={{ color: colors.t3, fontWeight: '700' }}>إعادة تعيين</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { onApply(local); onClose(); }}
              style={{ flex: 2, padding: 13, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Feather name="check" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900' }}>تطبيق</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// تاب: المحافظ المالية المعلقة
// ═══════════════════════════════════════════════════════
function FinancialWalletsTab({ colors }) {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  // نوع المحفظة: 'agent' | 'cashier'
  const [walletType, setWalletType] = useState('agent');
  // الشخص المحدد
  const [selected,  setSelected]  = useState(null); // { person_id, person_name, total_amount, col_count }
  const [detailVisibleCount, setDetailVisibleCount] = useState(INITIAL_WALLET_ROWS);
  const requestIdRef = useRef(0);

  const { projectId } = useAuth();
  const load = useCallback(async () => {
    if (!projectId) return;
    const thisRequest = ++requestIdRef.current;
    // Only show full loading spinner on very first load (no data yet)
    if (!data) setLoading(true);
    try {
      console.log(`[Reports:wallets] load start request=${thisRequest} project=${projectId}`);
      const cached = await getCached(`reports:wallets:${projectId}`, async () => {
      console.log(`[Reports:wallets] query start request=${thisRequest}`);
      const agentRes = await execSQL(`
        SELECT
          COALESCE(u.name, c.agent_id, '—') AS person_name,
          u.id                              AS person_id,
          COUNT(c.id)                       AS col_count,
          SUM(c.amount)                     AS total_amount,
          MIN(c.collection_date)            AS oldest_date
        FROM collections c
        LEFT JOIN users u ON u.id = c.agent_id
        WHERE c.status='pending' AND c.active=1 AND c.project_id = ?
        GROUP BY c.agent_id ORDER BY total_amount DESC
      `, [projectId]);
      const cashierRes = await execSQL(`
        SELECT
          COALESCE(u.name, c.approved_by, '—') AS person_name,
          u.id                                AS person_id,
          COUNT(c.id)                         AS col_count,
          SUM(c.amount)                       AS total_amount,
          MIN(c.approved_at)                  AS oldest_date
        FROM collections c
        LEFT JOIN users u ON u.id = c.approved_by
        WHERE c.status='approved' AND (c.supply_id IS NULL OR c.supply_id='') AND c.active=1 AND c.project_id = ?
        GROUP BY c.approved_by ORDER BY total_amount DESC
      `, [projectId]);
      const agentDetail = await execSQL(`
        SELECT c.collection_number, c.collection_date, c.amount,
               COALESCE(p.name,'—') AS pos_name,
               COALESCE(i.invoice_number,'—') AS invoice_number,
               c.agent_id AS person_id
        FROM collections c
        LEFT JOIN pos_customers p ON p.id=c.pos_id
        LEFT JOIN invoices i ON i.id=c.invoice_id
        WHERE c.status='pending' AND c.active=1 AND c.project_id = ?
        ORDER BY c.agent_id, c.collection_date DESC
      `, [projectId]);
      const cashierDetail = await execSQL(`
        SELECT c.collection_number, c.collection_date, c.amount,
               COALESCE(p.name,'—') AS pos_name,
               COALESCE(i.invoice_number,'—') AS invoice_number,
               c.approved_by AS person_id
        FROM collections c
        LEFT JOIN pos_customers p ON p.id=c.pos_id
        LEFT JOIN invoices i ON i.id=c.invoice_id
        WHERE c.status='approved' AND (c.supply_id IS NULL OR c.supply_id='') AND c.active=1 AND c.project_id = ?
        ORDER BY c.approved_by, c.collection_date DESC
      `, [projectId]);
      return {
        agents:         agentRes.rows._array   || [],
        cashiers:       cashierRes.rows._array || [],
        agentDetails:   agentDetail.rows._array   || [],
        cashierDetails: cashierDetail.rows._array || [],
      };
      }, REPORT_CACHE_TTL_MS);
      if (thisRequest !== requestIdRef.current) return;
      setData(cached);
      console.log(`[Reports:wallets] load success request=${thisRequest} agents=${cached?.agents?.length || 0} cashiers=${cached?.cashiers?.length || 0}`);
    } catch (e) { console.error('FinancialWallets Error:', e); }
    finally {
      if (thisRequest === requestIdRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); setSelected(null); }, [load]);
  // إعادة تعيين التحديد عند تغيير النوع
  useEffect(() => { setSelected(null); }, [walletType]);
  useEffect(() => { setDetailVisibleCount(INITIAL_WALLET_ROWS); }, [selected?.person_id, walletType]);

  // Stale-while-revalidate: only show full spinner on truly first load
  if (loading && !data) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 }}>
      <ActivityIndicator size="large" color={colors.blue} />
      <Text style={{ color: colors.t3 }}>جاري التحميل...</Text>
    </View>
  );

  if (!data) return null;

  const people  = walletType === 'agent' ? data.agents   : data.cashiers;
  const details = walletType === 'agent' ? data.agentDetails : data.cashierDetails;
  const myDetails = selected ? details.filter(d => d.person_id === selected.person_id) : [];
  const visibleDetails = myDetails.slice(0, detailVisibleCount);

  const totalAll = people.reduce((s, r) => s + (r.total_amount || 0), 0);

  // ── تصدير CSV للشخص المحدد ──
  const handleExportCSV = async () => {
    if (!selected) return;
    const BOM    = '\uFEFF';
    const header = '"رقم التحصيل","التاريخ","نقطة البيع","رقم الفاتورة","المبلغ"';
    const body   = myDetails.map(d =>
      `"${d.collection_number}","${d.collection_date?.substring(0,10)}","${d.pos_name}","${d.invoice_number}","${d.amount}"`
    ).join('\n');
    const footer = `\n"","","","\u0625\u062c\u0645\u0627\u0644\u064a","${selected.total_amount}"`;
    const csv    = BOM + header + '\n' + body + footer;

    try {
      const filename = `wallet_${selected.person_name.replace(/\s/g,'_')}.csv`;
      const uri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
      } else { alert('مشاركة الملف غير مدعومة'); }
    } catch (e) { alert('خطأ: ' + e.message); }
  };

  // ── إرسال SMS ──
  const handleSMS = () => {
    if (!selected) return;
    const type = walletType === 'agent' ? 'تحصيلات معلقة لديك' : 'تحصيلات معتمدة لم تُورَّد';
    const lines = myDetails.map((d, i) =>
      `${i+1}. ${d.collection_number} | ${d.pos_name} | ${d.amount} ر.س`
    ).join('\n');
    const msg = `محفظة ${walletType === 'agent' ? 'المندوب' : 'المحاسب'}: ${selected.person_name}\n${type}\nالإجمالي: ${selected.total_amount} ر.س\n\nالتفاصيل:\n${lines}`;
    const url = `sms:?body=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => alert('تعذر فتح تطبيق الرسائل'));
  };

  // ── إرسال WhatsApp ──
  const handleWhatsApp = () => {
    if (!selected) return;
    const type = walletType === 'agent' ? 'تحصيلات معلقة لديك' : 'تحصيلات معتمدة لم تُورَّد';
    const lines = myDetails.map((d, i) =>
      `${i+1}. *${d.collection_number}* | ${d.pos_name} | *${formatCurrency(d.amount)}*`
    ).join('\n');
    const msg = `محفظة ${walletType === 'agent' ? 'المندوب' : 'المحاسب'}: ${selected.person_name}\n${type}\nالإجمالي: ${formatCurrency(selected.total_amount)}\n\n${lines}`;
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {
      const webUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
      Linking.openURL(webUrl).catch(() => alert('تعذر فتح واتساب'));
    });
  };

  const YELLOW = colors.warning;

  return (
    <View style={{ flex: 1 }}>
      {/* ── نوع المحفظة ── */}
      <View style={{ flexDirection: 'row', margin: 12, gap: 10 }}>
        {[
          { k: 'agent',   l: 'محفظة المندوب', icon: 'user',   total: data.agents.reduce((s,r)=>s+(r.total_amount||0),0) },
          { k: 'cashier', l: 'محفظة المحاسب', icon: 'file-text', total: data.cashiers.reduce((s,r)=>s+(r.total_amount||0),0) },
        ].map(t => (
          <TouchableOpacity key={t.k} onPress={() => setWalletType(t.k)} style={{
            flex: 1, padding: 12, borderRadius: 12, alignItems: 'center',
            backgroundColor: walletType === t.k ? YELLOW + '20' : colors.bg2,
            borderWidth: 2, borderColor: walletType === t.k ? YELLOW : colors.border + '30',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name={t.icon} size={14} color={walletType === t.k ? colors.warning : colors.t2} />
              <Text style={{ fontSize: 13, fontWeight: '900', color: walletType === t.k ? colors.warning : colors.t2 }}>{t.l}</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: walletType === t.k ? YELLOW : colors.t3, marginTop: 4 }}>{formatCurrency(t.total)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>

        {/* ── قائمة الأشخاص ── */}
        {people.length === 0 ? (
          <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 30, alignItems: 'center', marginBottom: 16 }}>
            <Feather name="check-circle" size={32} color={colors.t3} style={{ marginBottom: 8 }} />
            <Text style={{ color: colors.t3, fontWeight: '600' }}>لا توجد مبالغ معلقة</Text>
          </View>
        ) : (
          <>
            <Text style={{ fontSize: 12, color: colors.t3, textAlign: 'right', marginBottom: 8 }}>
              اختر {walletType === 'agent' ? 'مندوباً' : 'محاسباً'} لعرض محفظته:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {people.map((p, pi) => {
                const isSel = selected?.person_id === p.person_id;
                return (
                  <TouchableOpacity key={pi} onPress={() => setSelected(isSel ? null : p)} style={{
                    marginLeft: 10, padding: 14, borderRadius: 14, minWidth: 130, alignItems: 'center',
                    backgroundColor: isSel ? YELLOW : colors.card,
                    borderWidth: 2, borderColor: isSel ? YELLOW : colors.border + '40',
                    elevation: isSel ? 4 : 1,
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: isSel ? '#fff' : colors.t1, textAlign: 'center' }}>{p.person_name}</Text>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: isSel ? '#fff' : colors.primary, marginTop: 6 }}>{formatCurrency(p.total_amount)}</Text>
                    <Text style={{ fontSize: 10, color: isSel ? '#fff' : colors.t3, marginTop: 3 }}>{p.col_count} تحصيل</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* ── تفاصيل المحفظة المحددة ── */}
        {selected && (
          <View style={{ backgroundColor: YELLOW + '10', borderRadius: 14, borderWidth: 2, borderColor: YELLOW, overflow: 'hidden' }}>
            {/* رأس المحفظة */}
            <View style={{ backgroundColor: YELLOW, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff' }}>{formatCurrency(selected.total_amount)}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>{selected.person_name}</Text>
                <Text style={{ fontSize: 11, color: '#fff' }}>{selected.col_count} تحصيل معلق</Text>
              </View>
            </View>

            {/* أزرار الإجراءات */}
            <View style={{ flexDirection: 'row', padding: 10, gap: 8, backgroundColor: YELLOW + '30' }}>
              <TouchableOpacity onPress={handleExportCSV} style={{
                flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
                backgroundColor: '#16a34a', padding: 10, borderRadius: 10 }}>
                <Feather name="download-cloud" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>تصدير CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSMS} style={{
                flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
                backgroundColor: '#1d4ed8', padding: 10, borderRadius: 10 }}>
                <Feather name="message-square" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>SMS</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleWhatsApp} style={{
                flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
                backgroundColor: '#16a34a', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#15803d' }}>
                <Feather name="message-circle" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>واتساب</Text>
              </TouchableOpacity>
            </View>

            {/* رأس جدول التفاصيل */}
            <View style={{ flexDirection: 'row', backgroundColor: YELLOW + '40', paddingHorizontal: 10, paddingVertical: 8 }}>
              {[['رقم التحصيل', 1.3], ['التاريخ', 1], ['نقطة البيع', 1.5], ['الفاتورة', 1], ['المبلغ', 1]].map(([h, fl]) => (
                <Text key={h} style={{ flex: fl, fontSize: 9, fontWeight: '900', color: colors.t1, textAlign: 'right' }}>{h}</Text>
              ))}
            </View>

            {/* صفوف التفاصيل */}
            {visibleDetails.map((d, di) => (
              <View key={di} style={{
                flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9,
                backgroundColor: di % 2 === 0 ? '#fffbeb' : '#fef3c7',
                borderTopWidth: 1, borderTopColor: YELLOW + '50',
              }}>
                <Text style={{ flex: 1.3, fontSize: 10, color: '#1e293b', textAlign: 'right' }} numberOfLines={1}>{d.collection_number}</Text>
                <Text style={{ flex: 1,   fontSize: 10, color: '#475569', textAlign: 'right' }}>{d.collection_date?.substring(0,10)}</Text>
                <Text style={{ flex: 1.5, fontSize: 10, color: '#1e293b', textAlign: 'right' }} numberOfLines={1}>{d.pos_name}</Text>
                <Text style={{ flex: 1,   fontSize: 10, color: '#1d4ed8', textAlign: 'right' }} numberOfLines={1}>{d.invoice_number}</Text>
                <Text style={{ flex: 1,   fontSize: 10, fontWeight: '900', color: '#92400e', textAlign: 'right' }}>{formatCurrency(d.amount)}</Text>
              </View>
            ))}
            {detailVisibleCount < myDetails.length && (
              <TouchableOpacity
                onPress={() => setDetailVisibleCount(v => Math.min(v + WALLET_ROWS_STEP, myDetails.length))}
                style={{ padding: 12, alignItems: 'center', backgroundColor: colors.card }}
              >
                <Text style={{ color: colors.blue, fontWeight: '800', fontSize: 12 }}>
                  تحميل المزيد ({myDetails.length - detailVisibleCount})
                </Text>
              </TouchableOpacity>
            )}

            {/* مجموع */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12,
              backgroundColor: YELLOW, borderTopWidth: 2, borderTopColor: colors.warning + '80' }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>{formatCurrency(selected.total_amount)}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>الإجمالي</Text>
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
}



// ═══════════════════════════════════════════════════════
// تاب: تتبع المخزون / الكروت
// ═══════════════════════════════════════════════════════
const INV_COLS = [
  { key: 'batch_number',    label: 'رقم الدفعة',        w: 120 },
  { key: 'card_index',      label: 'رقم الورقة',         w: 90  },
  { key: 'category_name',   label: 'الفئة',              w: 110 },
  { key: 'received_date',   label: 'تاريخ الاستلام',     w: 110 },
  { key: 'distributor_name',label: 'الموزِّع',           w: 120 },
  { key: 'agent_name',      label: 'المندوب',             w: 120 },
  { key: 'invoice_number',  label: 'رقم الفاتورة',        w: 125 },
  { key: 'pos_name',        label: 'نقطة البيع',          w: 130 },
  { key: 'sale_date',       label: 'تاريخ البيع',         w: 100 },
  { key: 'tracking_status', label: 'الحالة',              w: 100 },
];

const INV_STATUS = {
  undistributed: { label: 'غير موزَّع',  color: '#64748b' },
  distributed:   { label: 'موزَّع',      color: '#d97706' },
  sold:          { label: 'مباع',         color: '#16a34a' },
};

function InvCell({ col, value, colors }) {
  const border = colors.border + '35';

  if (col.key === 'tracking_status') {
    const s = INV_STATUS[value] || { label: value, color: colors.t3 };
    return (
      <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: s.color + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 9, fontWeight: 'bold', color: s.color }}>{s.label}</Text>
        </View>
      </View>
    );
  }

  if (col.key === 'card_index') {
    const n = parseInt(value, 10) || 0;
    return (
      <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center', alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.t3 }}>{n}</Text>
      </View>
    );
  }

  const isPlaceholder = !value || value === '—';
  return (
    <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center' }}>
      <Text style={{ fontSize: 10, color: isPlaceholder ? colors.t3 : colors.t1 }} numberOfLines={1}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

function InventoryTrackingTab({ colors }) {
  const [rows,         setRows]         = useState([]);
  const [batches,      setBatches]      = useState([]); // [{id, label}] for batch picker
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');  // '' | 'undistributed' | 'distributed' | 'sold'
  const [batchFilter,  setBatchFilter]  = useState('');  // '' = all | batch_id string
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchSearch,    setBatchSearch]    = useState(''); // search inside batch modal
  const [visibleCount, setVisibleCount]     = useState(INITIAL_REPORT_ROWS);
  const requestIdRef = useRef(0);
  const hasLoadedOnce = useRef(false);

  const { projectId, selectedPhase, allPhases } = useAuth();
  const [phaseFilterId, setPhaseFilterId] = useState(selectedPhase?.id || '');

  useEffect(() => {
    setPhaseFilterId(selectedPhase?.id || '');
  }, [selectedPhase?.id]);

  const load = useCallback(async () => {
    if (!projectId) return;
    const thisRequest = ++requestIdRef.current;
    // Only show full loading spinner on very first load (no data yet)
    if (!hasLoadedOnce.current) setLoading(true);
    try {
      console.log(`[Reports:inventory] load start request=${thisRequest} project=${projectId} phase=${phaseFilterId || 'all'}`);
      const data = await getInventoryTracking(projectId, phaseFilterId || null);
      // Guard: discard result if a newer request was started
      if (thisRequest !== requestIdRef.current) return;
      setRows(data);
      hasLoadedOnce.current = true;

      // Build unique batch list for the picker (order preserved from service)
      const seen = new Set();
      const batchList = [];
      for (const row of data) {
        if (!seen.has(row.batch_id)) {
          seen.add(row.batch_id);
          batchList.push({ id: row.batch_id, label: row.batch_number });
        }
      }
      setBatches(batchList);
      console.log(`[Reports:inventory] load success request=${thisRequest} rows=${data?.length || 0}`);
    } catch (e) {
      console.error('InventoryTrackingTab error:', e);
    } finally {
      if (thisRequest === requestIdRef.current) setLoading(false);
    }
  }, [projectId, phaseFilterId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let t = null;
    const watched = new Set(['invoice_items', 'agent_wallets', 'batches', 'invoices', 'all']);
    const unsub = subscribeDataChanges((e) => {
      if (!watched.has(e?.type)) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        load();
      }, 800);
    });
    return () => {
      if (t) clearTimeout(t);
      unsub?.();
    };
  }, [load]);

  // ── Derived: filtered rows ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = rows;
    if (batchFilter)  r = r.filter(row => row.batch_id === batchFilter);
    if (statusFilter) r = r.filter(row => row.tracking_status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(row => INV_COLS.some(col => String(row[col.key] ?? '').toLowerCase().includes(q)));
    }
    return r;
  }, [rows, batchFilter, statusFilter, search]);
  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  // ── Derived: status counts on full rows (for pill labels) ────────────────
  const counts = useMemo(() => ({
    all:           rows.length,
    undistributed: rows.filter(r => r.tracking_status === 'undistributed').length,
    distributed:   rows.filter(r => r.tracking_status === 'distributed').length,
    sold:          rows.filter(r => r.tracking_status === 'sold').length,
  }), [rows]);

  // ── Derived: totals on FILTERED rows (dynamic) ───────────────────────────
  const totals = useMemo(() => {
    const total        = filtered.length;
    const sold         = filtered.filter(r => r.tracking_status === 'sold').length;
    const distributed  = filtered.filter(r => r.tracking_status === 'distributed').length;
    const undistributed= filtered.filter(r => r.tracking_status === 'undistributed').length;
    const unsold       = distributed + undistributed; // not yet sold
    return { total, sold, unsold, distributed, undistributed };
  }, [filtered]);

  const oversellAnomalies = useMemo(() => {
    const byBatch = {};
    for (const row of rows) {
      const excess = Number(row.oversell_excess || 0);
      if (excess > 0 && !byBatch[row.batch_id]) {
        byBatch[row.batch_id] = { batch_number: row.batch_number, excess };
      }
    }
    return Object.values(byBatch);
  }, [rows]);

  // ── Batch picker: filtered list inside modal ──────────────────────────────
  const selectedBatchLabel = batchFilter
    ? (batches.find(b => b.id === batchFilter)?.label || '—')
    : 'الكل';

  const batchModalList = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    const all = [{ id: '', label: 'الكل' }, ...batches];
    return q ? all.filter(b => b.label.toLowerCase().includes(q)) : all;
  }, [batches, batchSearch]);
  useEffect(() => { setVisibleCount(INITIAL_REPORT_ROWS); }, [search, statusFilter, batchFilter, rows.length]);

  // Stale-while-revalidate: only show full spinner on truly first load
  if (loading && rows.length === 0) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 }}>
      <ActivityIndicator size="large" color={colors.blue} />
      <Text style={{ color: colors.t3 }}>جاري تحميل المخزون...</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>

      {/* ── Batch searchable dropdown Modal ── */}
      <Modal
        visible={batchModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBatchModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
            activeOpacity={1}
            onPress={() => setBatchModalOpen(false)}
          />
          <View style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            padding: 20, maxHeight: '70%',
          }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <TouchableOpacity onPress={() => setBatchModalOpen(false)} style={{ padding: 4 }}>
                <Text style={{ color: colors.t3, fontSize: 20, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '900', color: colors.t1 }}>اختر الدفعة</Text>
            </View>

            {/* Search inside modal */}
            <TextInput
              style={{
                backgroundColor: colors.bg2, paddingHorizontal: 12, paddingVertical: 10,
                borderRadius: 10, color: colors.t1, fontSize: 13, textAlign: 'right',
                borderWidth: 1, borderColor: colors.border + '55', marginBottom: 12,
              }}
              placeholder="🔍 ابحث برقم الدفعة..."
              placeholderTextColor={colors.t3}
              value={batchSearch}
              onChangeText={setBatchSearch}
              autoFocus
            />

            {/* Batch list */}
            <ScrollView showsVerticalScrollIndicator={false}>
              {batchModalList.map(b => {
                const active = batchFilter === b.id;
                return (
                  <TouchableOpacity
                    key={b.id || '__all_batch'}
                    onPress={() => {
                      setBatchFilter(b.id);
                      setBatchSearch('');
                      setBatchModalOpen(false);
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 13, paddingHorizontal: 14,
                      backgroundColor: active ? colors.blue + '15' : 'transparent',
                      borderRadius: 10, marginBottom: 4,
                      borderWidth: active ? 1 : 0, borderColor: colors.blue + '40',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {active && <Feather name="check" size={14} color={colors.blue} />}
                    </View>
                    <Text style={{
                      fontSize: 14, fontWeight: active ? '900' : '500',
                      color: active ? colors.blue : colors.t1, textAlign: 'right',
                    }}>
                      {b.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {batchModalList.length === 0 && (
                <Text style={{ color: colors.t3, textAlign: 'center', paddingVertical: 20 }}>
                  لا توجد دفعات مطابقة
                </Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── شريط المرحلة ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 54, paddingHorizontal: 12, paddingTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {(allPhases || []).map((phase) => {
            const active = phaseFilterId === phase.id;
            return (
              <TouchableOpacity
                key={phase.id}
                onPress={() => setPhaseFilterId(phase.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: active ? colors.blue : colors.bg2,
                  borderWidth: 1,
                  borderColor: active ? colors.blue : colors.border + '40',
                }}
              >
                <Text style={{ color: active ? '#fff' : colors.t2, fontSize: 11, fontWeight: '800' }}>
                  {phase.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* ── شريط الفلاتر ── */}
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 8 }}>
        {oversellAnomalies.length > 0 && (
          <View style={{
            backgroundColor: '#dc262615',
            borderColor: '#dc262655',
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}>
            <Text style={{ color: '#dc2626', fontSize: 11, fontWeight: '800', textAlign: 'right' }}>
              تحذير: تم اكتشاف بيع يتجاوز إجمالي الدفعة في {oversellAnomalies.length} دفعة.
            </Text>
          </View>
        )}

        {/* صف 1: زر اختيار الدفعة + بحث حر */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>

          {/* زر فتح dropdown الدفعة */}
          <TouchableOpacity
            onPress={() => setBatchModalOpen(true)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: batchFilter ? colors.blue : colors.bg2,
              borderWidth: 1, borderColor: batchFilter ? colors.blue : colors.border + '50',
              borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9,
              minWidth: 120,
            }}
          >
            <Feather name="layers" size={13} color={batchFilter ? '#fff' : colors.t2} />
            <Text
              style={{ flex: 1, fontSize: 11, fontWeight: '700', color: batchFilter ? '#fff' : colors.t2 }}
              numberOfLines={1}
            >
              {selectedBatchLabel}
            </Text>
            <Feather name="chevron-down" size={12} color={batchFilter ? '#fff' : colors.t3} />
          </TouchableOpacity>

          {/* بحث حر */}
          <TextInput
            style={{
              flex: 1, backgroundColor: colors.bg2, paddingHorizontal: 12, paddingVertical: 9,
              borderRadius: 10, color: colors.t1, fontSize: 12, textAlign: 'right',
              borderWidth: 1, borderColor: colors.border + '50',
            }}
            placeholder="🔍 بحث في المخزون..."
            placeholderTextColor={colors.t3}
            value={search}
            onChangeText={setSearch}
          />

          {/* زر مسح الدفعة (يظهر فقط عند الاختيار) */}
          {batchFilter ? (
            <TouchableOpacity
              onPress={() => setBatchFilter('')}
              style={{
                width: 36, height: 36, borderRadius: 9, justifyContent: 'center', alignItems: 'center',
                backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border + '50',
              }}
            >
              <Feather name="x" size={14} color={colors.t3} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* فلتر الحالة */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { k: '',              l: `الكل (${counts.all})`,                  c: colors.blue },
            { k: 'undistributed', l: `غير موزَّع (${counts.undistributed})`, c: '#64748b'  },
            { k: 'distributed',   l: `موزَّع (${counts.distributed})`,       c: '#d97706'  },
            { k: 'sold',          l: `مباع (${counts.sold})`,                 c: '#16a34a'  },
          ].map(t => {
            const active = statusFilter === t.k;
            return (
              <TouchableOpacity
                key={t.k || '__all_status'}
                onPress={() => setStatusFilter(t.k)}
                style={{
                  paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
                  marginLeft: 7, marginBottom: 4,
                  backgroundColor: active ? t.c : colors.bg2,
                  borderWidth: 1, borderColor: active ? t.c : colors.border + '50',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#fff' : colors.t2 }}>{t.l}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── إجماليات ديناميكية ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { l: 'الإجمالي',    v: totals.total,         c: colors.blue   },
            { l: 'مباع',        v: totals.sold,           c: '#16a34a'     },
            { l: 'غير مباع',    v: totals.unsold,         c: '#d97706'     },
            { l: 'موزَّع',      v: totals.distributed,   c: colors.purple  },
            { l: 'غير موزَّع',  v: totals.undistributed, c: '#64748b'     },
          ].map((it, i) => (
            <View
              key={i}
              style={{
                backgroundColor: it.c + '18', borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 5,
                marginLeft: 6, flexDirection: 'row', alignItems: 'center', gap: 4,
              }}
            >
              <Text style={{ fontSize: 10, color: colors.t3 }}>{it.l}:</Text>
              <Text style={{ fontSize: 11, fontWeight: '900', color: it.c }}>{it.v}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 10, color: colors.t3, fontStyle: 'italic' }}>← مرّر الجدول يساراً لرؤية كافة الأعمدة</Text>
          <Text style={{ fontSize: 10, color: colors.t3 }}>{filtered.length} ورقة</Text>
        </View>
      </View>

      {/* ── الجدول ── */}
      {filtered.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <Feather name="inbox" size={44} color={colors.t3} style={{ marginBottom: 4 }} />
          <Text style={{ color: colors.t3, fontSize: 14 }}>
            {rows.length === 0 ? 'لا توجد دفعات في المخزون' : 'لا توجد نتائج للفلاتر المحددة'}
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
          <View>
            {/* رأس الجدول */}
            <View style={{ flexDirection: 'row', backgroundColor: '#1e3a5f' }}>
              {INV_COLS.map(col => (
                <View key={col.key} style={{
                  width: col.w, padding: 9,
                  borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)',
                  borderBottomWidth: 2, borderBottomColor: '#3b82f6',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: '#e2e8f0', textAlign: 'right' }}>{col.label}</Text>
                </View>
              ))}
            </View>

            {/* صفوف البيانات */}
            <ScrollView showsVerticalScrollIndicator>
              {visibleRows.map((row, ri) => (
                <View key={`${row.batch_id}-${row.card_index}`} style={{
                  flexDirection: 'row',
                  backgroundColor: ri % 2 === 0 ? colors.card : colors.bg2,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border + '25',
                }}>
                  {INV_COLS.map(col => (
                    <InvCell key={col.key} col={col} value={row[col.key]} colors={colors} />
                  ))}
                </View>
              ))}
              {visibleCount < filtered.length && (
                <TouchableOpacity
                  onPress={() => setVisibleCount(v => Math.min(v + REPORT_ROWS_STEP, filtered.length))}
                  style={{ padding: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.blue, fontWeight: '800', fontSize: 12 }}>
                    تحميل المزيد ({filtered.length - visibleCount})
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </ScrollView>
      )}
    </View>
  );
}



// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
export default function ReportsScreen({ navigation }) {
  const { colors } = useTheme();
  const { user, projectId, selectedPhase } = useAuth();

  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'wallets' | 'inventory'
  const [loading, setLoading] = useState(true);
  const [allRows, setAllRows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [phases, setPhases] = useState([]);
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', agentId: '', phaseId: '', paymentStatus: '', approvalStatus: '', colStatus: '' });
  const [searchText, setSearchText] = useState('');
  const [loadingText, setLoadingText] = useState('جاري تحميل البيانات...');
  const [visibleRowCount, setVisibleRowCount] = useState(INITIAL_REPORT_ROWS);
  const [loadError, setLoadError] = useState('');

  const hasLoadedOnce = useRef(false);
  const requestIdRef = useRef(0);
  const load = useCallback(async () => {
    if (!projectId) return;
    const thisRequest = ++requestIdRef.current;
    // Only show full loading spinner on very first load (no data yet)
    if (!hasLoadedOnce.current) setLoading(true);
    setLoadError('');
    try {
      setLoadingText('جاري تحميل التقارير المحلية...');
      console.log(`[Reports] load start request=${thisRequest} project=${projectId}`);
      const cached = await getCached(`reports:audit:${projectId}`, async () => {
      console.log(`[Reports] audit query start request=${thisRequest}`);
      // 1. الاستعلام الشامل المحلي
      const result    = await execSQL(AUDIT_SQL, [projectId]);
      const rawRows   = result.rows._array || [];
      console.log(`[Reports] audit query done request=${thisRequest} rows=${rawRows.length}`);

      // 2. جلب إجمالي التحصيل لكل فاتورة (لحساب المتبقي)
      console.log(`[Reports] remaining query start request=${thisRequest}`);
      const remResult = await execSQL(REMAINING_SQL, [projectId]);
      const remMap    = {};
      (remResult.rows._array || []).forEach(r => { remMap[r.invoice_id] = r.total_paid || 0; });
      console.log(`[Reports] remaining query done request=${thisRequest} rows=${remResult.rows._array?.length || 0}`);

      // 3. جلب المناديب والمراحل للفلاتر
      console.log(`[Reports] filters query start request=${thisRequest}`);
      const agR = await execSQL(`SELECT id, name FROM users WHERE role='agent' AND active=1 AND project_id = ? ORDER BY name`, [projectId]);
      const phR = await getAllPhases(projectId);
      console.log(`[Reports] filters query done request=${thisRequest} agents=${agR.rows._array?.length || 0} phases=${phR?.length || 0}`);

      // 4. تجميع الصفوف النهائية
      const rows = rawRows.map(r => {
        const invoiceFields = decorateInvoiceStatusFields(r);
        return {
          ...r,
          ...invoiceFields,
          is_supplied: r.is_supplied_raw === 1,
          remaining: Number(invoiceFields.payment_remaining_amount ?? Math.max(0, (r.net_amount || 0) - (remMap[r.inv_id] || 0))),
        };
      });
      return { rows, agents: agR.rows._array || [], phases: phR || [] };
      }, REPORT_CACHE_TTL_MS);
      console.log(`[Reports] cache/data ready request=${thisRequest} rows=${cached?.rows?.length || 0}`);
      if (thisRequest !== requestIdRef.current) return;
      setLoadingText('جاري تجهيز النتائج...');
      await waitForInteractionsOrTimeout(250);
      if (thisRequest !== requestIdRef.current) return;
      setAgents(cached.agents);
      setPhases(cached.phases);
      setAllRows(cached.rows);
      hasLoadedOnce.current = true;
      console.log(`[Reports] load success request=${thisRequest} visibleRows=${cached?.rows?.length || 0}`);
    } catch (e) {
      console.error('ReportsScreen SQL Error:', e);
      setLoadError(e?.message || 'تعذر تحميل التقارير المحلية');
      setLoadingText('تعذر تجهيز النتائج');
    } finally {
      if (thisRequest === requestIdRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setFilters(prev => {
      const nextPhaseId = selectedPhase?.id || '';
      if (prev.phaseId === nextPhaseId) return prev;
      return { ...prev, phaseId: nextPhaseId };
    });
  }, [selectedPhase?.id]);

  useEffect(() => {
    let t = null;
    const watched = new Set(['invoices', 'invoice_items', 'collections', 'agent_wallets', 'batches', 'all', 'reports_ready']);
    const unsub = subscribeDataChanges((e) => {
      if (!watched.has(e?.type)) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        load();
      }, 800);
    });
    return () => {
      if (t) clearTimeout(t);
      unsub?.();
    };
  }, [load]);

  // ── فلترة ──
  const filtered = useMemo(() => {
    let r = allRows;
    if (filters.dateFrom) r = r.filter(row => (row.invoice_date || '') >= filters.dateFrom);
    if (filters.dateTo)   r = r.filter(row => (row.invoice_date || '') <= filters.dateTo);
    if (filters.agentId) {
      const ag = agents.find(a => a.id === filters.agentId);
      if (ag) r = r.filter(row => row.agent_name === ag.name);
    }
    if (filters.phaseId) {
      r = r.filter(row => row.phase_id === filters.phaseId);
    }
    if (filters.paymentStatus) r = r.filter(row => row.payment_status === filters.paymentStatus);
    if (filters.approvalStatus) r = r.filter(row => row.approval_status === filters.approvalStatus);
    if (filters.colStatus) r = r.filter(row => row.col_status === filters.colStatus);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      r = r.filter(row => COLS.some(col => String(row[col.key] ?? '').toLowerCase().includes(q)));
    }
    return r;
  }, [allRows, filters, searchText, agents]);
  const visibleRows = useMemo(() => filtered.slice(0, visibleRowCount), [filtered, visibleRowCount]);
  useEffect(() => { setVisibleRowCount(INITIAL_REPORT_ROWS); }, [activeTab, filters, searchText, allRows.length]);

  // ── ملخص ──
  const summary = useMemo(() => {
    const invIds = new Set();
    const colIds = new Set();
    let totalSales = 0;
    let totalCol = 0;

    for (const row of filtered) {
      if (row.invoice_number && !invIds.has(row.invoice_number)) {
        invIds.add(row.invoice_number);
        totalSales += Number(row.net_amount || 0);
      }
      if (row.collection_number && !colIds.has(row.collection_number)) {
        colIds.add(row.collection_number);
      }
      totalCol += Number(row.col_amount || 0);
    }

    return { rows: filtered.length, invoices: invIds.size, collections: colIds.size, totalSales, totalCol };
  }, [filtered]);

  // ── تصدير CSV ──
  const handleExport = async () => {
    const BOM    = '\uFEFF';
    const header = COLS.map(c => `"${c.label}"`).join(',');
    const body   = filtered.map(row =>
      COLS.map(col => {
        const v = row[col.key];
        if (v === null || v === undefined) return '""';
        if (col.key === 'is_supplied')  return v ? '"نعم"' : '"لا"';
        if (col.key === 'payment_status') return `"${invoicePaymentStatusMeta(v).label}"`;
        if (col.key === 'approval_status') return `"${invoiceApprovalStatusMeta(v).label}"`;
        if (col.key === 'col_status') return `"${COLLECTION_STATUS_MAP[v]?.text || v}"`;
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\n');

    const csv = BOM + header + '\n' + body;
    try {
      const uri = FileSystem.documentDirectory + 'comprehensive_report.csv';
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
      } else {
        alert('مشاركة الملف غير مدعومة');
      }
    } catch (e) { alert('خطأ في التصدير: ' + e.message); }
  };

  const activeCount = Object.values(filters).filter(Boolean).length;

  // ══════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>

      {/* ── تبديل التابات ── */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.card,
        borderBottomWidth: 1, borderBottomColor: colors.border + '30' }}>
        {[
          { k: 'audit',     l: 'الاستعلام الشامل', icon: 'search'   },
          { k: 'wallets',   l: 'المحافظ المالية',   icon: 'pie-chart' },
          { k: 'inventory', l: 'تتبع المخزون',      icon: 'layers'   },
        ].map(t => (
          <TouchableOpacity key={t.k} onPress={() => setActiveTab(t.k)}
            style={{ flex: 1, paddingVertical: 13, alignItems: 'center',
              borderBottomWidth: 2,
              borderBottomColor: activeTab === t.k ? colors.blue : 'transparent' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name={t.icon} size={13} color={activeTab === t.k ? colors.blue : colors.t3} />
              <Text style={{ fontSize: 11, fontWeight: activeTab === t.k ? '900' : '500',
                color: activeTab === t.k ? colors.blue : colors.t3 }}>{t.l}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── محتوى التابات ── */}
      {activeTab === 'wallets' ? (
        <FinancialWalletsTab colors={colors} />
      ) : activeTab === 'inventory' ? (
        <InventoryTrackingTab colors={colors} />
      ) : (
        <View style={{ flex: 1 }}>

        {/* ── شريط الأدوات ── */}
        <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 8 }}>

        {/* بحث + فلتر + تصدير */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            style={{ flex: 1, backgroundColor: colors.bg2, paddingHorizontal: 12, paddingVertical: 9,
              borderRadius: 10, color: colors.t1, fontSize: 12, textAlign: 'right',
              borderWidth: 1, borderColor: colors.border + '50' }}
            placeholder="🔍 بحث في الجدول..."
            placeholderTextColor={colors.t3}
            value={searchText}
            onChangeText={setSearchText}
          />

          {/* زر الفلترة — مثلث مقلوب = رمز الفلتر المتعارف عليه */}
          <TouchableOpacity
            onPress={() => setFilterVisible(true)}
            style={{
              width: 42, height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
              backgroundColor: activeCount > 0 ? colors.blue : colors.bg2,
              borderWidth: 1, borderColor: activeCount > 0 ? colors.blue : colors.border + '50',
            }}
          >
            {/* رمز الفلتر يدوياً بخطوط CSS-like */}
            <View style={{ alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <View style={{ width: 18, height: 2, backgroundColor: activeCount > 0 ? '#fff' : colors.t2, borderRadius: 1 }} />
              <View style={{ width: 13, height: 2, backgroundColor: activeCount > 0 ? '#fff' : colors.t2, borderRadius: 1 }} />
              <View style={{ width:  8, height: 2, backgroundColor: activeCount > 0 ? '#fff' : colors.t2, borderRadius: 1 }} />
            </View>
            {activeCount > 0 && (
              <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: '#ef4444', borderRadius: 6, width: 14, height: 14, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>{activeCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* تصدير */}
          <TouchableOpacity
            onPress={handleExport}
            style={{ height: 42, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#16a34a', justifyContent: 'center', alignItems: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="download" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>CSV</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ملخص النتائج */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { l: 'صفوف',       v: summary.rows,                          c: colors.blue   },
            { l: 'فواتير',     v: summary.invoices,                       c: colors.cyan   },
            { l: 'تحصيلات',    v: summary.collections,                    c: colors.purple },
            { l: 'مبيعات',     v: formatCurrency(summary.totalSales),     c: colors.orange },
            { l: 'تحصيل',      v: formatCurrency(summary.totalCol),       c: colors.green  },
          ].map((it, i) => (
            <View key={i} style={{ backgroundColor: it.c + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 10, color: colors.t3 }}>{it.l}:</Text>
              <Text style={{ fontSize: 11, fontWeight: '900', color: it.c }}>{it.v}</Text>
            </View>
          ))}
        </ScrollView>

        {/* تلميح */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 10, color: colors.t3, fontStyle: 'italic' }}>← مرّر الجدول يساراً لرؤية كافة الأعمدة</Text>
          <Text style={{ fontSize: 10, color: colors.t3 }}>{COLS.length} عمود</Text>
        </View>
        {!!loadError && (
          <View style={{ marginTop: 8, backgroundColor: colors.danger + '12', borderColor: colors.danger + '35', borderWidth: 1, borderRadius: 10, padding: 10 }}>
            <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '800', textAlign: 'right' }}>
              {loadError}
            </Text>
          </View>
        )}
      </View>

      {/* ── الجدول ── */}
      {/* Stale-while-revalidate: only show full spinner on truly first load */}
      {loading && allRows.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={colors.blue} />
          <Text style={{ color: colors.t3, fontSize: 13 }}>{loadingText}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <Feather name="inbox" size={44} color={colors.t3} style={{ marginBottom: 4 }} />
          <Text style={{ color: colors.t3, fontSize: 14 }}>{allRows.length === 0 ? 'لا توجد بيانات في النظام' : 'لا توجد نتائج للفلاتر المحددة'}</Text>
          {activeCount > 0 && (
            <TouchableOpacity
              onPress={() => setFilters({ dateFrom: '', dateTo: '', agentId: '', phaseId: selectedPhase?.id || '', paymentStatus: '', approvalStatus: '', colStatus: '' })}
              style={{ backgroundColor: colors.blue + '20', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 }}>
              <Text style={{ color: colors.blue, fontWeight: '700' }}>مسح الفلاتر</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* الجدول: تمرير أفقي للأعمدة + عمودي للصفوف */
        <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
          <View>
            {/* رأس الجدول الثابت */}
            <View style={{ flexDirection: 'row', backgroundColor: '#1e3a5f' }}>
              {COLS.map((col, ci) => (
                <View key={col.key} style={{
                  width: col.w, padding: 9,
                  borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)',
                  borderBottomWidth: 2, borderBottomColor: '#3b82f6',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: '#e2e8f0', textAlign: 'right' }}>{col.label}</Text>
                </View>
              ))}
            </View>

            {/* صفوف البيانات */}
            <ScrollView showsVerticalScrollIndicator>
              {visibleRows.map((row, ri) => (
                <View key={ri} style={{
                  flexDirection: 'row',
                  backgroundColor: ri % 2 === 0 ? colors.card : colors.bg2,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border + '25',
                }}>
                  {COLS.map(col => (
                    <Cell key={col.key} col={col} value={row[col.key]} colors={colors} />
                  ))}
                </View>
              ))}
              {visibleRowCount < filtered.length && (
                <TouchableOpacity
                  onPress={() => setVisibleRowCount(v => Math.min(v + REPORT_ROWS_STEP, filtered.length))}
                  style={{ padding: 12, alignItems: 'center', backgroundColor: colors.card }}
                >
                  <Text style={{ color: colors.blue, fontWeight: '800', fontSize: 12 }}>
                    تحميل المزيد ({filtered.length - visibleRowCount})
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </ScrollView>
      )}

        {/* ── مودال الفلاتر ── */}
        <FilterSheet
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          agents={agents}
          phases={phases}
          filters={filters}
          onApply={setFilters}
          colors={colors}
          defaultPhaseId={selectedPhase?.id || ''}
        />
        </View>
      )}
    </View>
  );
}
