import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, RefreshControl, Alert, ScrollView, Linking, Platform, Modal, TextInput, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useTheme } from '../theme';
import {
  getLocalCollections, deleteLocalCollection, subscribeDataChanges,
  approveLocalCollection, cancelLocalCollectionApproval
} from '../services/database';
import { syncNow as syncCollections, setCurrentUser } from '../services/SyncService';
import { formatCurrency, formatDateShort, invoicePaymentStatusMeta, invoiceApprovalStatusMeta } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, Row, ScreenHeader } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';

export default function CollectionsScreen({ navigation }) {
  const { user, selectedPhase, projectId } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [expandedColId, setExpandedColId] = useState(null);
  
  useEffect(() => { if (user) setCurrentUser(user); }, [user]);

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [approveNotes, setApproveNotes] = useState('');

  const load = useCallback(async (quiet = false) => {
    try {
      if (!projectId) return;
      const filters = user?.role === 'agent' ? { agent_id: user.id } : {};
      if (selectedPhase) filters.phase_id = selectedPhase.id;
      if (projectId) filters.project_id = projectId;

      const localData = await getLocalCollections(filters);
      setCols(localData);
      if (!quiet) {
        if (localData.length === 0) setLoading(true);
        syncCollections(user).catch(e => console.log('SYNC ERROR:', e));
      }

    } catch (e) {
      console.log('LOAD ERROR:', e);
    } finally {
      if (!quiet) setLoading(false);
      setRefreshing(false);
    }
  }, [user, selectedPhase, projectId]);

  useEffect(() => {
    if (cols.length === 0) setLoading(true);
    load();
    const unsub = subscribeDataChanges(e => { if (['collections', 'all', 'sync_queue'].includes(e.type)) load(true); });
    return unsub;
  }, [load]);


  const handleDelete = (id) =>
    Alert.alert('حذف السند', 'هل أنت متأكد من حذف هذا السند نهائياً؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', style: 'destructive', onPress: async () => { await deleteLocalCollection(id, user?.id || null); load(); } },
    ]);

  const handleApprovePress = (id) => {
    setApprovingId(id);
    setApproveNotes('');
    setShowApproveModal(true);
  };

  const confirmApprove = async () => {
    if (!approvingId) return;
    await approveLocalCollection(approvingId, approveNotes, user?.id || null);
    setShowApproveModal(false);
    setApprovingId(null);
    load();
  };

  const handleCancelApproval = (id) => 
    Alert.alert('إلغاء الاعتماد', 'عند إلغاء الاعتماد سيعود السند لحالة (معلق). هل أنت متأكد؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم، إلغاء', style: 'destructive', onPress: async () => { await cancelLocalCollectionApproval(id, user?.id || null); load(); } },
    ]);

  const visibleCollections = cols.filter(c => {
    if (user?.role === 'agent' && c.status === 'approved') {
      const net = Number(c.inv_net || 0);
      const approved = Number(c.inv_approved ?? c.inv_paid ?? 0);
      const fullyApproved = net > 0 && approved >= (net - 0.1);
      return !fullyApproved;
    }
    return true;
  });

  const pending = visibleCollections.filter(c => c.status === 'pending');
  const approved = visibleCollections.filter(c => c.status === 'approved');
  const display = tab === 'pending' ? pending : tab === 'approved' ? approved : visibleCollections;
  const filtered = display.filter(c => !search || JSON.stringify(c).toLowerCase().includes(search.toLowerCase()));
  const totalPending = pending.reduce((s, c) => s + (c.amount || 0), 0);
  const totalApproved = approved.reduce((s, c) => s + (c.amount || 0), 0);
  const methodLabel = m => ({ cash: 'نقدي', transfer: 'تحويل', check: 'شيك' }[m] || m);
  const metaChip = {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border + '80',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    minWidth: '48%',
    flex: 1,
  };
  const sectionBox = {
    backgroundColor: colors.bg2 + '90',
    borderWidth: 1,
    borderColor: colors.border + '70',
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: 6,
  };
  const boxTitle = { fontSize: 10, color: colors.t3, fontWeight: '800', textAlign: 'right' };
  const labelMini = { fontSize: 10, color: colors.t3, fontWeight: '700' };
  const valueMini = { fontSize: 12, color: colors.t1, fontWeight: '800' };
  const statusChip = {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border + '80',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 8,
  };

  const handlePrint = async (col) => {
    const html = `
      <html dir="rtl" lang="ar">
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; }
          .receipt-box { border: 2px solid #2563eb; padding: 30px; border-radius: 15px; background: #fff; }
          .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 32px; font-weight: 900; color: #2563eb; margin: 0; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 18px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px; }
          .label { color: #64748b; font-weight: 700; }
          .val { color: #1e40af; font-weight: 900; }
          .amount-box { background: #f1f5f9; padding: 20px; border-radius: 10px; text-align: center; margin-top: 30px; border: 2px solid #2563eb; }
          .footer { text-align: center; margin-top: 40px; font-size: 14px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="receipt-box">
          <div class="header">
            <div class="title">سند قبض</div>
            <div style="font-size: 16px; margin-top: 5px;">رقم السند: ${col.collection_number}</div>
          </div>
          <div class="info-row"><span class="label">تاريخ السند:</span> <span class="val">${col.collection_date}</span></div>
          <div class="info-row"><span class="label">وصلنا من السيد/ة:</span> <span class="val">${col.pos_name}</span></div>
          <div class="info-row"><span class="label">طريقة الدفع:</span> <span class="val">${methodLabel(col.method)}</span></div>
          <div class="info-row"><span class="label">المندوب المستلم:</span> <span class="val">${col.agent_name}</span></div>
          ${col.invoice_number ? `<div class="info-row"><span class="label">سداد فاتورة رقم:</span> <span class="val">${col.invoice_number}</span></div>` : ''}
          ${col.status === 'approved' && col.approver_name ? `<div class="info-row"><span class="label">المحاسب المعتمد:</span> <span class="val">${col.approver_name}</span></div>` : ''}
          <div class="amount-box">
            <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">المبلغ الواصل</div>
            <div style="font-size: 36px; font-weight: 900; color: #2563eb;">${formatCurrency(col.amount)}</div>
          </div>
          <div class="footer">
            تم تحرير هذا السند آلياً بواسطة نظام ISP Cards v3
          </div>
        </div>
      </body>
      </html>
    `;
    await Print.printAsync({ html });
  };

  const generateReceiptInfo = (col) => {
    const net = col.inv_net || 0;
    const paid = col.inv_paid || 0;
    const remaining = Math.max(0, net - paid);
    let statusLine = "";
    if (net > 0) {
      if (remaining <= 0.1) statusLine = "✅ تم استكمال سداد الفاتورة بالكامل.";
      else statusLine = `المتبقي من الفاتورة: ${formatCurrency(remaining)}`;
    }
    return statusLine;
  };

  const handleWhatsApp = (col) => {
    const phone = col.pos_phone;
    if (!phone) return Alert.alert('تنبيه', 'لا يوجد رقم هاتف مسجل لنقطة البيع');
    const statusLine = generateReceiptInfo(col);
    const invoiceLine = col.invoice_number ? `🧾 سداد فاتورة رقم: ${col.invoice_number}\n` : '';
    const msg = `🧾 *سند قبض رقم: ${col.collection_number}*\n` +
                `📅 التاريخ: ${col.collection_date}\n` +
                `🏪 العميل: ${col.pos_name}\n` +
                `💰 المبلغ المحصل: ${formatCurrency(col.amount)}\n` +
                invoiceLine +
                `👤 المندوب المستلم: ${col.agent_name || ''}\n` +
                `${statusLine ? statusLine + '\n' : ''}` +
                `------------------------------\n` +
                `شكراً لتعاملكم معنا 🙏`;
    const url = `whatsapp://send?phone=${phone.startsWith('+') ? phone : '+967' + phone}&text=${encodeURIComponent(msg)}`;
    Linking.canOpenURL(url).then(supp => {
      if (supp) Linking.openURL(url);
      else Alert.alert('خطأ', 'تطبيق واتساب غير مثبت');
    });
  };

  const handleSMS = (col) => {
    const phone = col.pos_phone;
    if (!phone) return Alert.alert('تنبيه', 'لا يوجد رقم هاتف مسجل لنقطة البيع');
    const statusLine = generateReceiptInfo(col);
    const invoiceLine = col.invoice_number ? `فاتورة رقم: ${col.invoice_number}\n` : '';
    const msg = `سند قبض ${col.collection_number}\nبمبلغ ${col.amount} ج من ${col.pos_name}\n${invoiceLine}المندوب: ${col.agent_name || ''}\n${statusLine}`;
    const url = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(msg)}`;
    Linking.openURL(url);
  };

  return (
    <View style={s.screen}>
      <Modal visible={showApproveModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, padding: 20, borderRadius: radius.lg }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: colors.t1 }}>✅ ملاحظات الاعتماد</Text>
            <TextInput 
              style={{ backgroundColor: colors.bg2, padding: 12, borderRadius: radius.md, minHeight: 80, textAlignVertical: 'top', color: colors.t1 }}
              placeholder="اكتب أي ملاحظات هنا (اختياري)..."
              value={approveNotes}
              onChangeText={setApproveNotes}
              multiline
            />
            <Row style={{ gap: 10, marginTop: 20 }}>
              <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => setShowApproveModal(false)} />
              <Btn label="تأكيد الاعتماد" variant="primary" style={{ flex: 1 }} onPress={confirmApprove} />
            </Row>
          </View>
        </View>
      </Modal>

      <ScreenHeader
        kpis={[
          { label: 'معلق', value: pending.length, color: colors.warning },
          { label: 'قيد الانتظار', value: formatCurrency(totalPending), color: colors.warning },
          { label: 'محصّل', value: formatCurrency(totalApproved), color: colors.success },
        ]}
        tabs={[
          { k: 'pending', l: `معلقة (${pending.length})` },
          { k: 'approved', l: `معتمدة (${approved.length})` },
          { k: 'all', l: `الكل (${cols.length})` },
        ]}
        activeTab={tab} onTabSelect={setTab} search={search} onSearch={setSearch}
        searchPlaceholder="بحث بالرقم أو الاسم..."
        action={selectedPhase?.status !== 'closed' ? "+ سند" : undefined}
        onAction={selectedPhase?.status !== 'closed' ? () => navigation.push('NewCollection') : undefined}
      />

      {selectedPhase?.status === 'closed' && (
        <View style={{ backgroundColor: colors.danger + '15', padding: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="lock" size={14} color={colors.danger} />
          <Text style={{ fontSize: 12, color: colors.danger, fontWeight: 'bold' }}>عرض تحصيلات المرحلة المغلقة: {selectedPhase.name} (قراءة فقط)</Text>
        </View>
      )}

      {loading ? <Loading /> : filtered.length === 0
        ? <Empty icon="dollar-sign" title="لا توجد تحصيلات" action={selectedPhase?.status !== 'closed' ? "قبض جديد" : undefined} onAction={selectedPhase?.status !== 'closed' ? () => navigation.push('NewCollection') : undefined} />
        : <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
        >
          {filtered.map(col => {
            const expanded = expandedColId === col.id;
            return (
            <TouchableOpacity 
              key={col.id} 
              style={s.colCard} 
              activeOpacity={0.85} 
              onPress={() => setExpandedColId(expanded ? null : col.id)}
              onLongPress={() => {
                const opts = [{ text: 'إلغاء', style: 'cancel' }];
                if (selectedPhase?.status !== 'closed') {
                  if (col.status === 'pending' && (user?.role === 'admin' || user?.role === 'accountant')) opts.push({ text: 'اعتماد السند', onPress: () => handleApprovePress(col.id) });
                  if (col.status === 'approved' && user?.role === 'admin') opts.push({ text: 'إلغاء اعتماد', style: 'destructive', onPress: () => handleCancelApproval(col.id) });
                }
                opts.push({ text: 'طباعة السند', onPress: () => handlePrint(col) });
                opts.push({ text: 'مشاركة واتساب', onPress: () => handleWhatsApp(col) });
                Alert.alert('إجراءات السند', `سند قبض رقم ${col.collection_number}`, opts);
              }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[s.colNum, { marginBottom: 0, textAlign: 'right', alignSelf: 'stretch' }]}>
                    {col.collection_number || col.invoice_number || '—'}
                  </Text>
                  <Text style={[s.invPos, { fontSize: fontSize.lg, lineHeight: fontSize.lg + 2 }]} numberOfLines={1}>
                    {col.pos_name || '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[s.colAmt, { fontSize: fontSize.xl, color: colors.primary }]}>
                    {formatCurrency(col.amount || 0)}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.t3, fontWeight: '700' }}>
                    {formatDateShort(col.collection_date)}
                  </Text>
                </View>
                <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.t3} />
              </View>

              <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <View style={metaChip}>
                  <Text style={labelMini}>الفاتورة</Text>
                  <Text style={valueMini}>{col.invoice_number || '-'}</Text>
                </View>
                <View style={metaChip}>
                  <Text style={labelMini}>طريقة الدفع</Text>
                  <Text style={valueMini}>{methodLabel(col.method)}</Text>
                </View>
                <View style={metaChip}>
                  <Text style={labelMini}>صافي الفاتورة</Text>
                  <Text style={valueMini}>{formatCurrency(col.inv_net || 0)}</Text>
                </View>
                <View style={metaChip}>
                  <Text style={labelMini}>المتبقي</Text>
                  <Text style={[valueMini, { color: colors.warning }]}>
                    {formatCurrency(Math.max(0, Number(col.inv_net || 0) - Number(col.inv_paid || 0)))}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 8 }}>
                <View style={[sectionBox, { flex: 1 }]}>
                  <Text style={boxTitle}>الحالات</Text>
                  <View style={statusChip}>
                    <Text style={labelMini}>الاعتماد</Text>
                    <Badge status={col.status} />
                  </View>
                  <View style={[statusChip, {
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: 4,
                    paddingVertical: 5,
                  }]}>
                    <Text style={[labelMini, { flexShrink: 1, fontSize: 9 }]} numberOfLines={1}>حالة سداد الفاتورة</Text>
                    <Badge
                      status={col.inv_payment_status}
                      label={invoicePaymentStatusMeta(col.inv_payment_status).label}
                      color={invoicePaymentStatusMeta(col.inv_payment_status).color}
                      style={{
                        paddingVertical: 2,
                        paddingHorizontal: 6,
                        maxWidth: '100%',
                        minWidth: 0,
                        flexShrink: 1,
                        alignSelf: 'flex-start',
                        minHeight: 24,
                      }}
                    />
                  </View>
                </View>

                <View style={[sectionBox, { flex: 1 }]}>
                  <Text style={boxTitle}>التتبع</Text>
                  <View style={statusChip}>
                    <Text style={labelMini}>المزامنة</Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: Number(col.synced) === 1 ? colors.success : colors.warning }}>
                      {Number(col.synced) === 1 ? 'متزامن' : 'غير متزامن'}
                    </Text>
                  </View>
                  {!!col.invoice_number && (
                    <View style={[statusChip, {
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      gap: 4,
                      paddingVertical: 5,
                    }]}>
                      <Text style={[labelMini, { flexShrink: 1, fontSize: 9 }]} numberOfLines={1}>اعتماد الفاتورة</Text>
                      <Badge
                        status={col.inv_approval_status}
                        label={invoiceApprovalStatusMeta(col.inv_approval_status).label}
                        color={invoiceApprovalStatusMeta(col.inv_approval_status).color}
                        style={{
                          paddingVertical: 2,
                          paddingHorizontal: 6,
                          maxWidth: '100%',
                          minWidth: 0,
                          flexShrink: 1,
                          alignSelf: 'flex-start',
                          minHeight: 24,
                        }}
                      />
                    </View>
                  )}
                </View>
              </View>

              {/* ── EXPANDED: Secondary details + actions ── */}
              {expanded && (
                <>
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border + '30' }}>
                    <View style={s.colGrid}>
                      {[
                        col.agent_name && { label: 'المندوب', value: col.agent_name },
                        { label: 'طريقة الدفع', value: methodLabel(col.method) },
                        col.status === 'approved' && col.approver_name && { label: 'المعتمد', value: col.approver_name, color: colors.warning },
                        col.approval_notes && { label: 'ملاحظات', value: col.approval_notes, color: colors.success },
                      ].filter(Boolean).map((item, i) => (
                        <View key={i} style={s.colGridItem}>
                          <Text style={s.colGridLabel}>{item.label}</Text>
                          <Text style={[s.colGridVal, item.color && { color: item.color }]}>{item.value}</Text>
                        </View>
                      ))}
                    </View>
                    {!!col.notes && <Text style={s.colNotes}>{col.notes}</Text>}
                  </View>

                  <View style={[s.colActions, { paddingVertical: 8, gap: 10 }]}>
                    <Row style={{ gap: 10 }}>
                      <Btn label="طباعة" icon="printer" variant="glass" size="sm" style={{ flex: 1 }} onPress={() => handlePrint(col)} />
                      {selectedPhase?.status !== 'closed' && col.status === 'pending' && (user?.role === 'admin' || user?.role === 'accountant') && (
                        <Btn label="اعتماد" icon="check-circle" variant="success" size="sm" style={{ flex: 1 }} onPress={() => handleApprovePress(col.id)} />
                      )}
                      {selectedPhase?.status !== 'closed' && col.status === 'approved' && user?.role === 'admin' && (
                        <Btn label="تراجع" icon="corner-up-left" variant="danger" size="sm" style={{ flex: 1 }} onPress={() => handleCancelApproval(col.id)} />
                      )}
                    </Row>
                    <Row style={{ gap: 10 }}>
                      <Btn label="واتساب" icon="message-circle" variant="success" size="sm" style={{ flex: 1 }} onPress={() => handleWhatsApp(col)} />
                      <Btn label="الرسائل" icon="message-square" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => handleSMS(col)} />
                      {selectedPhase?.status !== 'closed' && col.status === 'pending' && user?.role === 'admin' && (
                        <Btn label="حذف" icon="trash-2" variant="danger" size="sm" style={{ flex: 1 }} onPress={() => handleDelete(col.id)} />
                      )}
                    </Row>
                  </View>
                </>
              )}
            </TouchableOpacity>
          );
        })}
        </ScrollView>
      }
    </View>
  );
}
