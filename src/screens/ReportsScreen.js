/**
 * ReportsScreen.js — الاستعلام الشامل
 * يستخدم SQLite المحلي (JOIN كامل) لضمان ظهور كل البيانات
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Platform,
  KeyboardAvoidingView, Linking,
} from 'react-native';
import { useTheme } from '../theme';
import { execSQL } from '../services/database';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { formatCurrency } from '../utils/helpers';

// ═══════════════════════════════════════════════════════
// الأعمدة — 20 عموداً
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
  { key: 'inv_status',        label: 'حالة الفاتورة',         w: 95  },
  { key: 'collection_number', label: 'رقم التحصيل',           w: 125 },
  { key: 'collection_date',   label: 'تاريخ التحصيل',         w: 100 },
  { key: 'col_amount',        label: 'مبلغ التحصيل',          w: 105 },
  { key: 'col_status',        label: 'حالة التحصيل',          w: 95  },
  { key: 'approver_name',     label: 'المحاسب المعتمد',       w: 120 },
  { key: 'approved_at',       label: 'تاريخ الاعتماد',        w: 100 },
  { key: 'is_supplied',       label: 'مورّد؟',               w: 70  },
  { key: 'remaining',         label: 'المتبقي',               w: 105 },
];

const STATUS_MAP = {
  paid:     { text: 'مسددة',  color: '#16a34a' },
  partial:  { text: 'جزئي',  color: '#d97706' },
  overdue:  { text: 'متأخرة', color: '#dc2626' },
  pending:  { text: 'معلق',   color: '#d97706' },
  approved: { text: 'معتمد',  color: '#16a34a' },
  rejected: { text: 'مرفوض', color: '#dc2626' },
};

// ═══════════════════════════════════════════════════════
// الاستعلام المحلي الشامل (SQLite JOIN)
// ═══════════════════════════════════════════════════════
const AUDIT_SQL = `
  SELECT
    i.id              AS inv_id,
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
    COALESCE(i.net_amount, i.total_amount, 0)  AS net_amount,
    i.status                     AS inv_status,
    c.collection_number,
    c.collection_date,
    c.amount                     AS col_amount,
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
  LEFT JOIN collections    c  ON c.invoice_id = i.id AND c.active = 1
  LEFT JOIN users          apr ON apr.id = c.approved_by
  WHERE i.active = 1
  ORDER BY i.invoice_date DESC, i.invoice_number ASC, c.collection_date ASC
`;

// احتساب المتبقي: نجلب إجمالي التحصيال المعتمدة لكل فاتورة
const REMAINING_SQL = `
  SELECT invoice_id,
         SUM(amount) AS total_paid
  FROM collections
  WHERE active = 1
  GROUP BY invoice_id
`;

// ═══════════════════════════════════════════════════════
// خلية
// ═══════════════════════════════════════════════════════
function Cell({ col, value, colors }) {
  const border = colors.border + '35';

  if (col.key === 'inv_status' || col.key === 'col_status') {
    if (!value) return <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center' }}><Text style={{ fontSize: 10, color: colors.t3 }}>—</Text></View>;
    const s = STATUS_MAP[value] || { text: value, color: colors.t3 };
    return (
      <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: s.color + '1a', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 }}>
          <Text style={{ fontSize: 9, fontWeight: 'bold', color: s.color }}>{s.text}</Text>
        </View>
      </View>
    );
  }

  if (col.key === 'is_supplied') {
    return (
      <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 11 }}>{value ? '✅' : '—'}</Text>
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
function FilterSheet({ visible, onClose, agents, filters, onApply, colors }) {
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

            {lbl('حالة الفاتورة')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {[['', 'الكل'], ['pending', 'معلقة'], ['partial', 'جزئي'], ['paid', 'مسددة'], ['overdue', 'متأخرة']].map(([v, l]) =>
                pill(v || 'all-inv', local.invStatus === v, () => set('invStatus', v), l, '#2563eb')
              )}
            </View>

            {lbl('حالة التحصيل')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 }}>
              {[['', 'الكل'], ['pending', 'معلق'], ['approved', 'معتمد'], ['rejected', 'مرفوض']].map(([v, l]) =>
                pill(v || 'all-col', local.colStatus === v, () => set('colStatus', v), l, '#7c3aed')
              )}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
            <TouchableOpacity
              onPress={() => { onApply({ dateFrom: '', dateTo: '', agentId: '', invStatus: '', colStatus: '' }); onClose(); }}
              style={{ flex: 1, padding: 13, borderRadius: 11, borderWidth: 1, borderColor: colors.border + '60', alignItems: 'center' }}>
              <Text style={{ color: colors.t3, fontWeight: '700' }}>إعادة تعيين</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { onApply(local); onClose(); }}
              style={{ flex: 2, padding: 13, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>✅ تطبيق</Text>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const agentRes = await execSQL(`
        SELECT
          COALESCE(u.name, c.agent_id, '—') AS person_name,
          u.id                              AS person_id,
          COUNT(c.id)                       AS col_count,
          SUM(c.amount)                     AS total_amount,
          MIN(c.collection_date)            AS oldest_date
        FROM collections c
        LEFT JOIN users u ON u.id = c.agent_id
        WHERE c.status='pending' AND c.active=1
        GROUP BY c.agent_id ORDER BY total_amount DESC
      `, []);

      const cashierRes = await execSQL(`
        SELECT
          COALESCE(u.name, c.approved_by, '—') AS person_name,
          u.id                                AS person_id,
          COUNT(c.id)                         AS col_count,
          SUM(c.amount)                       AS total_amount,
          MIN(c.approved_at)                  AS oldest_date
        FROM collections c
        LEFT JOIN users u ON u.id = c.approved_by
        WHERE c.status='approved' AND (c.supply_id IS NULL OR c.supply_id='') AND c.active=1
        GROUP BY c.approved_by ORDER BY total_amount DESC
      `, []);

      const agentDetail = await execSQL(`
        SELECT c.collection_number, c.collection_date, c.amount,
               COALESCE(p.name,'—') AS pos_name,
               COALESCE(i.invoice_number,'—') AS invoice_number,
               c.agent_id AS person_id
        FROM collections c
        LEFT JOIN pos_customers p ON p.id=c.pos_id
        LEFT JOIN invoices i ON i.id=c.invoice_id
        WHERE c.status='pending' AND c.active=1
        ORDER BY c.agent_id, c.collection_date DESC
      `, []);

      const cashierDetail = await execSQL(`
        SELECT c.collection_number, c.collection_date, c.amount,
               COALESCE(p.name,'—') AS pos_name,
               COALESCE(i.invoice_number,'—') AS invoice_number,
               c.approved_by AS person_id
        FROM collections c
        LEFT JOIN pos_customers p ON p.id=c.pos_id
        LEFT JOIN invoices i ON i.id=c.invoice_id
        WHERE c.status='approved' AND (c.supply_id IS NULL OR c.supply_id='') AND c.active=1
        ORDER BY c.approved_by, c.collection_date DESC
      `, []);

      setData({
        agents:         agentRes.rows._array   || [],
        cashiers:       cashierRes.rows._array || [],
        agentDetails:   agentDetail.rows._array   || [],
        cashierDetails: cashierDetail.rows._array || [],
      });
    } catch (e) { console.error('FinancialWallets Error:', e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); setSelected(null); }, [load]);
  // إعادة تعيين التحديد عند تغيير النوع
  useEffect(() => { setSelected(null); }, [walletType]);

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 }}>
      <ActivityIndicator size="large" color={colors.blue} />
      <Text style={{ color: colors.t3 }}>جاري التحميل...</Text>
    </View>
  );

  if (!data) return null;

  const people  = walletType === 'agent' ? data.agents   : data.cashiers;
  const details = walletType === 'agent' ? data.agentDetails : data.cashierDetails;
  const myDetails = selected ? details.filter(d => d.person_id === selected.person_id) : [];

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
    const msg = `📋 *محفظة ${walletType === 'agent' ? 'المندوب' : 'المحاسب'}: ${selected.person_name}*\n🔔 ${type}\n💰 *الإجمالي: ${formatCurrency(selected.total_amount)}*\n\n${lines}`;
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {
      const webUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
      Linking.openURL(webUrl).catch(() => alert('تعذر فتح واتساب'));
    });
  };

  const YELLOW = '#f59e0b';

  return (
    <View style={{ flex: 1 }}>
      {/* ── نوع المحفظة ── */}
      <View style={{ flexDirection: 'row', margin: 12, gap: 10 }}>
        {[
          { k: 'agent',   l: '👤 محفظة المندوب',    total: data.agents.reduce((s,r)=>s+(r.total_amount||0),0) },
          { k: 'cashier', l: '🧾 محفظة المحاسب',    total: data.cashiers.reduce((s,r)=>s+(r.total_amount||0),0) },
        ].map(t => (
          <TouchableOpacity key={t.k} onPress={() => setWalletType(t.k)} style={{
            flex: 1, padding: 12, borderRadius: 12, alignItems: 'center',
            backgroundColor: walletType === t.k ? YELLOW + '20' : colors.bg2,
            borderWidth: 2, borderColor: walletType === t.k ? YELLOW : colors.border + '30',
          }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: walletType === t.k ? '#92400e' : colors.t2 }}>{t.l}</Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: walletType === t.k ? YELLOW : colors.t3, marginTop: 4 }}>{formatCurrency(t.total)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>

        {/* ── قائمة الأشخاص ── */}
        {people.length === 0 ? (
          <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 30, alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
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
                    <Text style={{ fontSize: 13, fontWeight: '900', color: isSel ? '#78350f' : colors.t1, textAlign: 'center' }}>{p.person_name}</Text>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: isSel ? '#92400e' : colors.blue, marginTop: 6 }}>{formatCurrency(p.total_amount)}</Text>
                    <Text style={{ fontSize: 10, color: isSel ? '#92400e' : colors.t3, marginTop: 3 }}>{p.col_count} تحصيل</Text>
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
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#78350f' }}>{formatCurrency(selected.total_amount)}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#78350f' }}>{selected.person_name}</Text>
                <Text style={{ fontSize: 11, color: '#92400e' }}>{selected.col_count} تحصيل معلق</Text>
              </View>
            </View>

            {/* أزرار الإجراءات */}
            <View style={{ flexDirection: 'row', padding: 10, gap: 8, backgroundColor: YELLOW + '30' }}>
              <TouchableOpacity onPress={handleExportCSV} style={{
                flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
                backgroundColor: '#16a34a', padding: 10, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>📥 تصدير CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSMS} style={{
                flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
                backgroundColor: '#1d4ed8', padding: 10, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>📱 SMS</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleWhatsApp} style={{
                flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
                backgroundColor: '#16a34a', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#15803d' }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>💬 واتساب</Text>
              </TouchableOpacity>
            </View>

            {/* رأس جدول التفاصيل */}
            <View style={{ flexDirection: 'row', backgroundColor: YELLOW + '40', paddingHorizontal: 10, paddingVertical: 8 }}>
              {[['رقم التحصيل', 1.3], ['التاريخ', 1], ['نقطة البيع', 1.5], ['الفاتورة', 1], ['المبلغ', 1]].map(([h, fl]) => (
                <Text key={h} style={{ flex: fl, fontSize: 9, fontWeight: '900', color: '#78350f', textAlign: 'right' }}>{h}</Text>
              ))}
            </View>

            {/* صفوف التفاصيل */}
            {myDetails.map((d, di) => (
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

            {/* مجموع */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12,
              backgroundColor: YELLOW, borderTopWidth: 2, borderTopColor: '#d97706' }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#78350f' }}>{formatCurrency(selected.total_amount)}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400e' }}>الإجمالي</Text>
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
}



// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
export default function ReportsScreen() {
  const { colors } = useTheme();

  const [activeTab,     setActiveTab]     = useState('audit');  // 'audit' | 'wallets'
  const [loading,       setLoading]       = useState(true);
  const [allRows,       setAllRows]       = useState([]);
  const [agents,        setAgents]        = useState([]);
  const [searchText,    setSearchText]    = useState('');
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters,       setFilters]       = useState({ dateFrom: '', dateTo: '', agentId: '', invStatus: '', colStatus: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1. الاستعلام الشامل المحلي
      const result    = await execSQL(AUDIT_SQL, []);
      const rawRows   = result.rows._array || [];

      // 2. جلب إجمالي التحصيل لكل فاتورة (لحساب المتبقي)
      const remResult = await execSQL(REMAINING_SQL, []);
      const remMap    = {};
      (remResult.rows._array || []).forEach(r => { remMap[r.invoice_id] = r.total_paid || 0; });

      // 3. جلب المناديب للفلاتر
      const agR = await execSQL(`SELECT id, name FROM users WHERE role='agent' AND active=1 ORDER BY name`, []);
      setAgents(agR.rows._array || []);

      // 4. تجميع الصفوف النهائية
      const rows = rawRows.map(r => ({
        ...r,
        is_supplied: r.is_supplied_raw === 1,
        remaining:   Math.max(0, (r.net_amount || 0) - (remMap[r.inv_id] || 0)),
      }));

      setAllRows(rows);
    } catch (e) {
      console.error('ReportsScreen SQL Error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── فلترة ──
  const filtered = useMemo(() => {
    let r = allRows;
    if (filters.dateFrom) r = r.filter(row => (row.invoice_date || '') >= filters.dateFrom);
    if (filters.dateTo)   r = r.filter(row => (row.invoice_date || '') <= filters.dateTo);
    if (filters.agentId) {
      const ag = agents.find(a => a.id === filters.agentId);
      if (ag) r = r.filter(row => row.agent_name === ag.name);
    }
    if (filters.invStatus) r = r.filter(row => row.inv_status === filters.invStatus);
    if (filters.colStatus) r = r.filter(row => row.col_status === filters.colStatus);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      r = r.filter(row => COLS.some(col => String(row[col.key] ?? '').toLowerCase().includes(q)));
    }
    return r;
  }, [allRows, filters, searchText, agents]);

  // ── ملخص ──
  const summary = useMemo(() => {
    const invIds   = new Set(filtered.map(r => r.invoice_number).filter(Boolean));
    const colIds   = new Set(filtered.map(r => r.collection_number).filter(Boolean));
    const totalSales = [...invIds].reduce((s, n) => {
      const first = filtered.find(r => r.invoice_number === n);
      return s + (first?.net_amount || 0);
    }, 0);
    const totalCol = [...colIds].reduce((s, n) => {
      const first = filtered.find(r => r.collection_number === n);
      return s + (first?.col_amount || 0);
    }, 0);
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
        if (col.key === 'inv_status' || col.key === 'col_status')
          return `"${STATUS_MAP[v]?.text || v}"`;
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
          { k: 'audit',   l: '🔍 الاستعلام الشامل' },
          { k: 'wallets', l: '💰 المحافظ المالية'   },
        ].map(t => (
          <TouchableOpacity key={t.k} onPress={() => setActiveTab(t.k)}
            style={{ flex: 1, paddingVertical: 13, alignItems: 'center',
              borderBottomWidth: 2,
              borderBottomColor: activeTab === t.k ? colors.blue : 'transparent' }}>
            <Text style={{ fontSize: 13, fontWeight: activeTab === t.k ? '900' : '500',
              color: activeTab === t.k ? colors.blue : colors.t3 }}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── محتوى تاب المحافظ ── */}
      {activeTab === 'wallets' ? (
        <FinancialWalletsTab colors={colors} />
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
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>📥 CSV</Text>
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
      </View>

      {/* ── الجدول ── */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={colors.blue} />
          <Text style={{ color: colors.t3, fontSize: 13 }}>جاري تحميل البيانات...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 44 }}>📭</Text>
          <Text style={{ color: colors.t3, fontSize: 14 }}>{allRows.length === 0 ? 'لا توجد بيانات في النظام' : 'لا توجد نتائج للفلاتر المحددة'}</Text>
          {activeCount > 0 && (
            <TouchableOpacity
              onPress={() => setFilters({ dateFrom: '', dateTo: '', agentId: '', invStatus: '', colStatus: '' })}
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
              {filtered.map((row, ri) => (
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
            </ScrollView>
          </View>
        </ScrollView>
      )}

        <FilterSheet
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          agents={agents}
          filters={filters}
          onApply={setFilters}
          colors={colors}
        />
        </View>
      )}
    </View>
  );
}
