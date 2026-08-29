import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, RefreshControl, Alert, Linking, Platform, Modal, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useTheme } from '../theme';
import {
  getLocalCollections, deleteLocalCollection, subscribeDataChanges,
  approveLocalCollection, cancelLocalCollectionApproval,
  AGENT_SELF_COLLECTION_APPROVAL_PERMISSION,
  getCollectionApprovalDecision,
  shouldHideCollectionFromAgentList,
} from '../services/database';
import { setCurrentUser } from '../services/SyncService';
import { formatCurrency, formatDateShort, invoicePaymentStatusMeta, invoiceApprovalStatusMeta } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, Row, ScreenHeader } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';
import AdvancedFiltersModal from '../components/AdvancedFiltersModal';

export default function CollectionsScreen({ navigation }) {
  const { user, selectedPhase, projectId, hasEffectivePermission } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const normalizedUserRole = String(user?.role || '').trim().toLowerCase();
  const isAdminUser = normalizedUserRole === 'admin';
  const isAgentUser = ['agent', 'مندوب'].includes(normalizedUserRole);
  const hasAgentSelfApprovalPermission = isAgentUser
    && hasEffectivePermission(user, AGENT_SELF_COLLECTION_APPROVAL_PERMISSION);

  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [expandedColId, setExpandedColId] = useState(null);
  const [advancedFilters, setAdvancedFilters] = useState({});
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const hasDisplayedLocalDataRef = useRef(false);
  
  useEffect(() => { if (user) setCurrentUser(user); }, [user]);

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [approveNotes, setApproveNotes] = useState('');

  const load = useCallback(async (quiet = false) => {
    try {
      if (!projectId) return;
      const filters = isAgentUser ? { agent_id: user.id } : {};
      if (selectedPhase) filters.phase_id = selectedPhase.id;
      if (projectId) filters.project_id = projectId;

      // Merge advanced filters
      Object.assign(filters, advancedFilters);

      const shouldShowInitialLoader = !quiet && !hasDisplayedLocalDataRef.current;
      if (shouldShowInitialLoader) setLoading(true);
      else if (!quiet) setRefreshing(true);
      const localData = await getLocalCollections(filters);
      setCols(localData);
      hasDisplayedLocalDataRef.current = true;

    } catch (e) {
      console.log('LOAD ERROR:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, selectedPhase, projectId, advancedFilters]);

  useEffect(() => {
    load();
    const unsub = subscribeDataChanges(e => { if (['collections', 'invoice_card_returns', 'invoices', 'all'].includes(e.type)) load(true); });
    return unsub;
  }, [load]);


  const handleDelete = (id) =>
    Alert.alert('إلغاء التحصيل', 'هل أنت متأكد من إلغاء هذا التحصيل؟ سيتم تعليمه كملغي ولن يُحذف.', [
      { text: 'لا', style: 'cancel' },
      { text: 'تأكيد الإلغاء', style: 'destructive', onPress: async () => { await deleteLocalCollection(id, user?.id || null); load(); } },
    ]);

  const handleApprovePress = (id) => {
    setApprovingId(id);
    setApproveNotes('');
    setShowApproveModal(true);
  };

  const confirmApprove = async () => {
    if (!approvingId) return;
    try {
      await approveLocalCollection(approvingId, approveNotes, user?.id || null);
      setShowApproveModal(false);
      setApprovingId(null);
      setApproveNotes('');
      await load(true);
      Alert.alert('تم الاعتماد', 'تم اعتماد التحصيل بنجاح.');
    } catch (error) {
      Alert.alert('تعذر الاعتماد', error?.message || 'تعذر اعتماد التحصيل.');
    }
  };

  const handleCancelApproval = (id) => 
    Alert.alert('إلغاء الاعتماد', 'عند إلغاء الاعتماد سيعود السند لحالة (معلق). هل أنت متأكد؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم، إلغاء', style: 'destructive', onPress: async () => { await cancelLocalCollectionApproval(id, user?.id || null); load(); } },
    ]);

  const normalizeStatus = (value) => String(value || 'pending').toLowerCase();
  const isFalseLike = (value) => (
    value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false'
  );
  const isCancelledCollectionStatus = (status) => (
    ['cancelled', 'canceled', 'deleted', 'rejected', 'inactive'].includes(normalizeStatus(status))
  );
  const isActiveCollectionRow = (collection) => (
    !isFalseLike(collection?.active) && !isCancelledCollectionStatus(collection?.status)
  );
  const isApprovedCollectionRow = (collection) => (
    isActiveCollectionRow(collection) && normalizeStatus(collection?.status) === 'approved'
  );
  const isPendingCollectionRow = (collection) => (
    isActiveCollectionRow(collection) && !isApprovedCollectionRow(collection)
  );
  const canCurrentUserApproveCollection = useCallback((collection) => (
    getCollectionApprovalDecision({
      actor: {
        id: user?.id,
        role: user?.role,
        active: user?.active,
        project_id: projectId,
      },
      collection,
      hasAgentSelfApprovalPermission,
    }).allowed
  ), [user?.id, user?.role, user?.active, projectId, hasAgentSelfApprovalPermission]);

  const visibleCollections = useMemo(
    () => (Array.isArray(cols) ? cols : [])
      .filter(isActiveCollectionRow)
      .filter(collection => !shouldHideCollectionFromAgentList(collection, user?.role)),
    [cols, user?.role]
  );

  const pending = useMemo(
    () => visibleCollections.filter(isPendingCollectionRow),
    [visibleCollections]
  );
  const approved = useMemo(
    () => visibleCollections.filter(isApprovedCollectionRow),
    [visibleCollections]
  );
  const display = tab === 'pending' ? pending : tab === 'approved' ? approved : visibleCollections;
  const filtered = useMemo(
    () => display.filter(c => !search || JSON.stringify(c).toLowerCase().includes(search.toLowerCase())),
    [display, search]
  );
  const totalPending = useMemo(() => pending.reduce((sum, c) => sum + (c.amount || 0), 0), [pending]);
  const totalApproved = useMemo(() => approved.reduce((sum, c) => sum + (c.amount || 0), 0), [approved]);
  const keyExtractor = useCallback((item) => String(item.id), []);
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

  const invoiceApprovalDisplayMeta = (status) => {
    const meta = invoiceApprovalStatusMeta(status);
    const normalized = normalizeStatus(status);
    if ([
      'pending',
      'pending_collection_approval',
      'pending_card_return_approval',
      'unapproved',
      'not_approved',
    ].includes(normalized)) {
      return { ...meta, label: 'غير معتمدة' };
    }
    return meta;
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
          ${isApprovedCollectionRow(col) && col.approver_name ? `<div class="info-row"><span class="label">المحاسب المعتمد:</span> <span class="val">${col.approver_name}</span></div>` : ''}
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
    const paid = Number(col.inv_effective_paid_amount ?? col.inv_approved ?? col.inv_paid ?? 0);
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
          { k: 'all', l: `الكل (${visibleCollections.length})` },
        ]}
        activeTab={tab} onTabSelect={setTab} search={search} onSearch={setSearch}
        searchPlaceholder="بحث بالرقم أو الاسم..."
        action={selectedPhase?.status !== 'closed' ? "+ سند" : undefined}
        onAction={selectedPhase?.status !== 'closed' ? () => navigation.push('NewCollection') : undefined}
        onFilter={() => setShowFiltersModal(true)}
      />

      <AdvancedFiltersModal
        visible={showFiltersModal}
        onClose={() => setShowFiltersModal(false)}
        currentFilters={advancedFilters}
        onApply={(f) => setAdvancedFilters(f)}
        type="collections"
      />

      {selectedPhase?.status === 'closed' && (
        <View style={{ backgroundColor: colors.danger + '15', padding: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="lock" size={14} color={colors.danger} />
          <Text style={{ fontSize: 12, color: colors.danger, fontWeight: 'bold' }}>عرض تحصيلات المرحلة المغلقة: {selectedPhase.name} (قراءة فقط)</Text>
        </View>
      )}

      {!loading && refreshing && (
        <View style={{ position: 'absolute', top: 8, left: 12, zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card + 'E6', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ fontSize: 11, color: colors.t2, fontWeight: '700' }}>تحديث...</Text>
        </View>
      )}

      {loading && !hasDisplayedLocalDataRef.current ? <Loading /> : filtered.length === 0
        ? <Empty icon="dollar-sign" title="لا توجد تحصيلات" action={selectedPhase?.status !== 'closed' ? "قبض جديد" : undefined} onAction={selectedPhase?.status !== 'closed' ? () => navigation.push('NewCollection') : undefined} />
        : <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item: col }) => {
            const expanded = expandedColId === col.id;
            const linkedReturnAmount = Number(col.inv_collection_linked_returns_total || 0);
            const linkedApprovedReturnAmount = Number(col.inv_collection_linked_approved_returns_total || 0);
            const collectionAmount = Number(col.inv_collection_amount ?? (col.amount || 0));
            const effectiveCoveredAmount = Number(col.inv_collection_coverage_amount ?? (collectionAmount + linkedReturnAmount));
            const invoiceNet = Number(col.inv_net || 0);
            const combinedCoverageComplete = Number(col.inv_collection_remaining_after_request || 0) <= 0.1;
            const pendingCoverageComplete = combinedCoverageComplete && String(col.inv_approval_status || '').toLowerCase() !== 'approved';
            const canApproveCollectionRow = canCurrentUserApproveCollection(col);
            return (
            <TouchableOpacity
              style={[s.invCard, { flexDirection: 'column', alignItems: 'stretch' }]}
              activeOpacity={0.85}
              onLongPress={() => {
                const opts = [{ text: 'إلغاء', style: 'cancel' }];
                if (selectedPhase?.status !== 'closed') {
                  if (canApproveCollectionRow) opts.push({ text: 'اعتماد السند', onPress: () => handleApprovePress(col.id) });
                  if (isPendingCollectionRow(col) && user?.role === 'admin') opts.push({ text: 'إلغاء التحصيل', style: 'destructive', onPress: () => handleDelete(col.id) });
                  if (isApprovedCollectionRow(col) && user?.role === 'admin') opts.push({ text: 'إلغاء اعتماد', style: 'destructive', onPress: () => handleCancelApproval(col.id) });
                }
                opts.push({ text: 'طباعة السند', onPress: () => handlePrint(col) });
                opts.push({ text: 'مشاركة واتساب', onPress: () => handleWhatsApp(col) });
                Alert.alert('إجراءات السند', `سند قبض رقم ${col.collection_number}`, opts);
              }}
            >
    <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={[s.invPos, { fontSize: fontSize.lg, lineHeight: fontSize.lg + 2 }]} numberOfLines={1}>
          {col.pos_name || '—'}
        </Text>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Text style={[s.colNum, { marginBottom: 0, fontSize: 11, color: colors.t3 }]}>
            {col.collection_number || col.invoice_number || '—'}
          </Text>
          {Number(col.synced) === 0 && <Text style={{ fontSize: 10, color: colors.orange, fontWeight: '900' }}>●</Text>}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={[s.colAmt, { fontSize: fontSize.xxl || (fontSize.xl + 4), color: colors.primary, fontWeight: '900' }]}>
          {formatCurrency(collectionAmount)}
        </Text>
        <Text style={{ fontSize: 10, color: colors.t3, fontWeight: '700' }}>
          {formatDateShort(col.collection_date || col.created_at)}
        </Text>
      </View>
    </View>

    {isAdminUser && isApprovedCollectionRow(col) && !!col.approver_name && (
                <View style={{ marginTop: 8, backgroundColor: colors.success + '10', borderWidth: 1, borderColor: colors.success + '35', borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7 }}>
                  <Text style={{ color: colors.success, fontSize: 12, fontWeight: '900', textAlign: 'right' }}>
                    تم الاعتماد بواسطة: {col.approver_name}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <View style={metaChip}>
                  <Text style={labelMini}>مبلغ التحصيل</Text>
                  <Text style={valueMini}>{formatCurrency(collectionAmount)}</Text>
                </View>
                <View style={metaChip}>
                  <Text style={labelMini}>مرتجع الكروت</Text>
                  <Text style={valueMini}>{formatCurrency(linkedReturnAmount)}</Text>
                </View>
                <View style={metaChip}>
                  <Text style={labelMini}>الفاتورة</Text>
                  <Text style={valueMini}>{col.invoice_number || '-'}</Text>
                </View>
                <View style={metaChip}>
                  <Text style={labelMini}>طريقة الدفع</Text>
                  <Text style={valueMini}>{methodLabel(col.method)}</Text>
                </View>
                <View style={metaChip}>
                  <Text style={labelMini}>الإجمالي المغطي</Text>
                  <Text style={[valueMini, { color: colors.blue }]}>{formatCurrency(effectiveCoveredAmount)}</Text>
                </View>
                <View style={metaChip}>
                  <Text style={labelMini}>المتبقي</Text>
                  <Text style={[valueMini, { color: colors.warning }]}>
                    {formatCurrency(Number(col.inv_collection_remaining_after_request ?? Math.max(0, invoiceNet - effectiveCoveredAmount)))}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 8 }}>
                <View style={[sectionBox, { flex: 1 }]}>
                  <Text style={boxTitle}>الحالات</Text>
                  <View style={statusChip}>
                    <Text style={labelMini}>الاعتماد</Text>
                    <Badge
                      status={col.inv_approval_status}
                      label={invoiceApprovalDisplayMeta(col.inv_approval_status).label}
                      color={invoiceApprovalDisplayMeta(col.inv_approval_status).color}
                    />
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
                        label={invoiceApprovalDisplayMeta(col.inv_approval_status).label}
                        color={invoiceApprovalDisplayMeta(col.inv_approval_status).color}
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

    <TouchableOpacity
      style={{
        marginTop: 8,
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.bg2,
        borderWidth: 1,
        borderColor: colors.border + '80',
        borderRadius: radius.md,
        paddingHorizontal: spacing.sm,
        paddingVertical: 8,
      }}
      onPress={() => setExpandedColId(expanded ? null : col.id)}
      activeOpacity={0.85}
    >
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '800' }}>
          {expanded ? 'إخفاء التفاصيل' : 'عرض مزيد من التفاصيل'}
        </Text>
      </View>
      <Text style={{ fontSize: 10, color: colors.t3, fontWeight: '700' }}>
        تفاصيل التحصيل والإجراءات
      </Text>
    </TouchableOpacity>

    {/* ── EXPANDED: Secondary details + actions ── */}
    {expanded && (
                <>
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border + '70' }}>
                    <View style={s.colGrid}>
                      {[
                        col.agent_name && { label: 'المندوب', value: col.agent_name },
                        { label: 'طريقة الدفع', value: methodLabel(col.method) },
                        isAdminUser && isApprovedCollectionRow(col) && col.approver_name && { label: 'المعتمد', value: col.approver_name, color: colors.warning },
                        linkedApprovedReturnAmount > 0 && { label: 'مرتجع معتمد', value: formatCurrency(linkedApprovedReturnAmount), color: colors.success },
                        effectiveCoveredAmount > 0 && { label: 'الإجمالي المغطى', value: formatCurrency(effectiveCoveredAmount), color: colors.blue },
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

                  {combinedCoverageComplete && (
                    <View style={{ marginTop: 8, backgroundColor: colors.success + '12', borderWidth: 1, borderColor: colors.success + '40', borderRadius: radius.md, padding: spacing.sm }}>
                      <Text style={{ color: colors.success, fontSize: 12, fontWeight: '900', textAlign: 'right' }}>
                        {String(col.status || '').toLowerCase() === 'approved' ? 'تم استيفاء الفاتورة من التحصيل ومرتجع الكروت' : 'مستوفي بانتظار الاعتماد'}
                      </Text>
                      <Text style={{ color: colors.t2, fontSize: 11, marginTop: 4, textAlign: 'right' }}>
                        مبلغ التحصيل: {formatCurrency(collectionAmount)} • مرتجع الكروت: {formatCurrency(linkedReturnAmount)}
                      </Text>
                    </View>
                  )}

                  {normalizeStatus(col.status) === 'pending_card_return_approval' && linkedReturnAmount > 0 && (
                    <View style={{ marginTop: 8, backgroundColor: colors.warning + '12', borderWidth: 1, borderColor: colors.warning + '40', borderRadius: radius.md, padding: spacing.sm }}>
                      <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '900', textAlign: 'right' }}>بانتظار اعتماد مرتجع الكروت</Text>
                      <Text style={{ color: colors.t2, fontSize: 11, marginTop: 4, textAlign: 'right' }}>ستصبح الفاتورة مسددة بعد اعتماد المرتجع إذا غطى المتبقي.</Text>
                    </View>
                  )}

                  <View style={[s.colActions, { paddingVertical: 8, gap: 10 }]}>
                    <Row style={{ gap: 10 }}>
                      <Btn label="طباعة" icon="printer" variant="glass" size="sm" style={{ flex: 1 }} onPress={() => handlePrint(col)} />
                      {selectedPhase?.status !== 'closed' && canApproveCollectionRow && (
                        <Btn label="اعتماد" icon="check-circle" variant="success" size="sm" style={{ flex: 1 }} onPress={() => handleApprovePress(col.id)} />
                      )}
                      {selectedPhase?.status !== 'closed' && isApprovedCollectionRow(col) && user?.role === 'admin' && (
                        <Btn label="إلغاء التحصيل" icon="x-circle" variant="danger" size="sm" style={{ flex: 1 }} onPress={() => handleCancelApproval(col.id)} />
                      )}
                    </Row>
                    <Row style={{ gap: 10 }}>
                      <Btn label="واتساب" icon="message-circle" variant="success" size="sm" style={{ flex: 1 }} onPress={() => handleWhatsApp(col)} />
                      <Btn label="الرسائل" icon="message-square" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => handleSMS(col)} />
                      {selectedPhase?.status !== 'closed' && isPendingCollectionRow(col) && user?.role === 'admin' && (
                        <Btn label="إلغاء" icon="x-circle" variant="danger" size="sm" style={{ flex: 1 }} onPress={() => handleDelete(col.id)} />
                      )}
                    </Row>
                  </View>
                </>
              )}
            </TouchableOpacity>
          );
        }}
        />
      }
    </View>
  );
}