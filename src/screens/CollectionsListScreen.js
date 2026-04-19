import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, RefreshControl, Alert, ScrollView, Linking, Platform, Modal, TextInput } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useTheme } from '../theme';
import {
  getLocalCollections, deleteLocalCollection, subscribeDataChanges,
  approveLocalCollection, cancelLocalCollectionApproval
} from '../services/database';
import { syncNow as syncCollections, setCurrentUser } from '../services/SyncService';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, Row, ScreenHeader } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';

export default function CollectionsScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  
  useEffect(() => { if (user) setCurrentUser(user); }, [user]);

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [approveNotes, setApproveNotes] = useState('');

  const load = useCallback(async (quiet = false) => {
    try {
      const filters = user?.role === 'agent' ? { agent_id: user.id } : {};
      const localData = await getLocalCollections(filters);
      setCols(localData);
      if (!quiet) {
        setLoading(true);
        syncCollections(user).catch(e => console.log('SYNC ERROR:', e));
      }
    } catch (e) {
      console.log('LOAD ERROR:', e);
    } finally {
      if (!quiet) setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    const unsub = subscribeDataChanges(e => { if (['collections', 'all', 'sync_queue'].includes(e.type)) load(true); });
    return unsub;
  }, [load]);

  const handleDelete = (id) =>
    Alert.alert('حذف السند', 'هل أنت متأكد من حذف هذا السند نهائياً؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', style: 'destructive', onPress: async () => { await deleteLocalCollection(id); load(); } },
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
      { text: 'نعم، إلغاء', style: 'destructive', onPress: async () => { await cancelLocalCollectionApproval(id); load(); } },
    ]);

  const visibleCollections = cols.filter(c => {
    return !(user?.role === 'agent' && c.status === 'approved');
  });

  const pending = visibleCollections.filter(c => c.status === 'pending');
  const approved = visibleCollections.filter(c => c.status === 'approved');
  const display = tab === 'pending' ? pending : tab === 'approved' ? approved : visibleCollections;
  const filtered = display.filter(c => !search || JSON.stringify(c).toLowerCase().includes(search.toLowerCase()));
  const totalPending = pending.reduce((s, c) => s + (c.amount || 0), 0);
  const totalApproved = approved.reduce((s, c) => s + (c.amount || 0), 0);
  const methodLabel = m => ({ cash: 'نقدي 💵', transfer: 'تحويل 🏦', check: 'شيك 📝' }[m] || m);

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
          { label: 'معلق', value: pending.length, color: colors.orange },
          { label: 'قيد الانتظار', value: formatCurrency(totalPending), color: colors.orange },
          { label: 'محصّل', value: formatCurrency(totalApproved), color: colors.green },
        ]}
        tabs={[
          { k: 'pending', l: `معلقة (${pending.length})` },
          { k: 'approved', l: `معتمدة (${approved.length})` },
          { k: 'all', l: `الكل (${cols.length})` },
        ]}
        activeTab={tab} onTabSelect={setTab} search={search} onSearch={setSearch}
        searchPlaceholder="بحث بالرقم أو الاسم..."
        action="+ سند" onAction={() => navigation.push('NewCollection')}
      />

      {loading ? <Loading /> : filtered.length === 0
        ? <Empty icon="💰" title="لا توجد تحصيلات" action="+ قبض جديد" onAction={() => navigation.push('NewCollection')} />
        : <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
        >
          {filtered.map(col => (
            <View key={col.id} style={s.colCard}>
              <View style={s.colCardTop}>
                <View>
                  <Text style={s.colNum}>{col.collection_number}</Text>
                  <Text style={s.colMethod}>{methodLabel(col.method)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge status={col.status} />
                  <Text style={s.colAmt}>{formatCurrency(col.amount)}</Text>
                </View>
              </View>
              <View style={s.colDivider} />
              <View style={s.colGrid}>
                {[
                  { label: 'المندوب', value: col.agent_name || '—' },
                  { label: 'نقطة البيع', value: col.pos_name || '—' },
                  col.invoice_number && { label: 'الفاتورة', value: col.invoice_number, color: colors.blue },
                  col.collection_date && { label: 'التاريخ', value: formatDateShort(col.collection_date) },
                  col.status === 'approved' && col.approver_name && { label: 'المحاسب المعتمد', value: col.approver_name, color: colors.orange },
                  col.approval_notes && { label: 'ملاحظات المدير', value: col.approval_notes, color: colors.green },
                ].filter(Boolean).map((item, i) => (
                  <View key={i} style={s.colGridItem}>
                    <Text style={s.colGridLabel}>{item.label}</Text>
                    <Text style={[s.colGridVal, item.color && { color: item.color }]}>{item.value}</Text>
                  </View>
                ))}
              </View>
              {!!col.notes && <Text style={s.colNotes}>📝 {col.notes}</Text>}
              <View style={[s.colActions, { paddingVertical: 10, gap: 12 }]}>
                <Row style={{ gap: 10 }}>
                  <Btn label="🖨️ طباعة السند" variant="glass" size="lg" style={{ flex: 1 }} onPress={() => handlePrint(col)} />
                  {col.status === 'pending' && (user?.role === 'admin' || user?.role === 'accountant') && (
                    <Btn label="✅ اعتماد" variant="success" size="lg" style={{ flex: 1 }} onPress={() => handleApprovePress(col.id)} />
                  )}
                  {col.status === 'approved' && user?.role === 'admin' && (
                    <Btn label="↩️ إلغاء اعتماد" variant="danger" size="lg" style={{ flex: 1 }} onPress={() => handleCancelApproval(col.id)} />
                  )}
                </Row>

                <Row style={{ gap: 10 }}>
                  <Btn label={<FontAwesome5 name="whatsapp" size={26} color="white" />} variant="success" size="lg" style={{ flex: 1 }} onPress={() => handleWhatsApp(col)} />
                  <Btn label="✉️ SMS" variant="outline" size="lg" style={{ flex: 1 }} onPress={() => handleSMS(col)} />
                  {col.status === 'pending' && user?.role === 'admin' && (
                    <Btn label="🗑️ حذف" variant="danger" size="lg" style={{ flex: 1 }} onPress={() => handleDelete(col.id)} />
                  )}
                </Row>
              </View>
            </View>
          ))}
        </ScrollView>
      }
    </View>
  );
}
