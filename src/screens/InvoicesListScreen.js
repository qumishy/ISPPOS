import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { getLocalInvoices, subscribeDataChanges, getInvoiceCountdownMeta } from '../services/database';
import { formatCurrency, formatDateShort, invoicePaymentStatusMeta, invoiceApprovalStatusMeta } from '../utils/helpers';
import { Badge, Loading, Empty, Row, ScreenHeader } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';

export default function InvoicesScreen({ navigation, route }) {
  const { user, selectedPhase, projectId } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [expandedInvId, setExpandedInvId] = useState(null);

  const load = useCallback(async (quiet = false) => {
    if (!projectId) return;
    const filters = tab !== 'all' ? { status: tab } : {};
    if (user?.role !== 'agent' && tab === 'all') {
      filters.includeInactive = true;
    }
    if (user?.role === 'agent') filters.agent_id = user.id;
    if (selectedPhase) filters.phase_id = selectedPhase.id;
    if (projectId) filters.project_id = projectId;

    if (!quiet && invoices.length === 0) setLoading(true);
    const data = await getLocalInvoices(filters);
    setInvoices(data);
    setLoading(false);
    setRefreshing(false);
  }, [tab, user, selectedPhase, projectId, invoices.length]);

  useEffect(() => {
    load();
    const unsub = subscribeDataChanges(e => {
      if (['invoices', 'collections', 'all', 'sync_queue'].includes(e.type)) load(true);
    });
    return unsub;
  }, [load]);

  useEffect(() => {
    if (route?.params?.refresh_at) load(true);
  }, [route?.params?.refresh_at, load]);


  const visibleInvoices = invoices;
  const filtered = visibleInvoices.filter(inv => !search || JSON.stringify(inv).toLowerCase().includes(search.toLowerCase()));
  const activeInvoices = visibleInvoices.filter(i => (i.payment_status || i.status) !== 'cancelled');
  const total = activeInvoices.reduce((s, i) => s + (i.net_amount || i.total_amount || 0), 0);
  const paid = activeInvoices.filter(i => (i.payment_status || i.status) === 'paid').reduce((s, i) => s + (i.net_amount || i.total_amount || 0), 0);
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
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border + '80',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 8,
  };
  const countdownToneStyles = {
    success: { bg: colors.success + '12', border: colors.success + '45', text: colors.success },
    warning: { bg: colors.warning + '14', border: colors.warning + '45', text: colors.warning },
    danger: { bg: colors.danger + '12', border: colors.danger + '45', text: colors.danger },
    muted: { bg: colors.bg2, border: colors.border + '70', text: colors.t3 },
  };

  return (
    <View style={s.screen}>
      <ScreenHeader
        kpis={[
          { label: 'الإجمالي', value: formatCurrency(total), color: colors.primary },
          { label: 'مسدد', value: formatCurrency(paid), color: colors.success },
          { label: 'العدد', value: invoices.length, color: colors.t1 },
        ]}
        tabs={[
          { k: 'all', l: 'الكل' },
          { k: 'pending', l: 'معلقة' },
          { k: 'due_soon', l: 'فواتير يجب سدادها' },
          ...(user?.role !== 'agent' ? [{ k: 'paid', l: 'مسددة' }] : []),
          { k: 'overdue', l: 'متأخرة' },
        ]}
        activeTab={tab} onTabSelect={setTab} search={search} onSearch={setSearch}
        searchPlaceholder="بحث بالرقم أو العميل..."
        action={selectedPhase?.status !== 'closed' ? "+ فاتورة" : undefined}
        onAction={selectedPhase?.status !== 'closed' ? () => navigation.push('NewInvoice') : undefined}
      />

      {selectedPhase?.status === 'closed' && (
        <View style={{ backgroundColor: colors.danger + '15', padding: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="lock" size={14} color={colors.danger} />
          <Text style={{ fontSize: 12, color: colors.danger, fontWeight: 'bold' }}>عرض فواتير المرحلة المغلقة: {selectedPhase.name} (قراءة فقط)</Text>
        </View>
      )}

      {loading ? <Loading /> : filtered.length === 0
        ? <Empty icon="file-text" title="لا توجد فواتير" action={selectedPhase?.status !== 'closed' ? "فاتورة جديدة" : undefined} onAction={selectedPhase?.status !== 'closed' ? () => navigation.navigate('NewInvoice') : undefined} />
        : <FlatList
          data={filtered} keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
          renderItem={({ item: inv }) => {
            const net = inv.net_amount || inv.total_amount || 0;
            const totalAmount = Number(inv.total_amount ?? net ?? 0);
            const paymentStatus = inv.payment_status || inv.status;
            const approvalStatus = inv.approval_status;
            const paymentMeta = invoicePaymentStatusMeta(paymentStatus);
            const approvalMeta = invoiceApprovalStatusMeta(approvalStatus);
            const paidAmount = Number(inv.paid_amount ?? inv.paid_sum ?? 0);
            const approvedPaid = Number(inv.approved_amount ?? inv.approved_sum ?? inv.partially_paid_amount ?? 0);
            const paymentRemaining = Math.max(0, Number(inv.payment_remaining_amount ?? inv.remaining_amount ?? (net - paidAmount)));
            const approvalRemaining = Math.max(0, Number(inv.approval_remaining_amount ?? inv.remaining_unpaid_amount ?? (net - approvedPaid)));
            const delayDays = Number(inv.delay_days || 0);
            const isOverdue = delayDays > 0;
            const delayLabel = isOverdue
              ? `متأخرة ${delayDays} أيام`
              : `متبقي ${Math.abs(delayDays)} أيام على دخول الفاتورة في التأخير`;

            const expanded = expandedInvId === inv.id;
            const hasDiscount = Number(inv.discount_requested_value || 0) > 0;
            const discountResolved = ['approved', 'auto_approved', 'rejected', 'none'].includes(
              String(inv.discount_status || 'none').trim()
            );
            const discountPending = hasDiscount && !discountResolved;
            const discountApproved = hasDiscount && ['approved', 'auto_approved'].includes(String(inv.discount_status || ''));
            const discountRejected = hasDiscount && inv.discount_status === 'rejected';
            const countdownMeta = getInvoiceCountdownMeta(inv);
            const countdownStyle = countdownToneStyles[countdownMeta.tone] || countdownToneStyles.muted;
            
            return (
              <TouchableOpacity 
                style={[s.invCard, { flexDirection: 'column', alignItems: 'stretch' }]} 
                activeOpacity={0.85} 
                onLongPress={() => {
                  Alert.alert('إجراءات الفاتورة', `فاتورة رقم ${inv.invoice_number}`, [
                    { text: 'إلغاء', style: 'cancel' },
                    { text: 'التفاصيل', onPress: () => navigation.navigate('InvoiceDetail', { id: inv.id }) }
                  ]);
                }}
              >
                <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={[s.invPos, { fontSize: fontSize.lg, lineHeight: fontSize.lg + 2 }]} numberOfLines={1}>
                      {inv.pos_name || '—'}
                    </Text>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                      <Text style={[s.invNum, { marginBottom: 0, fontSize: 11, color: colors.t3 }]}>{inv.invoice_number}</Text>
                      {inv.synced == 0 && <Text style={{ fontSize: 10, color: colors.orange, fontWeight: '900' }}>●</Text>}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={[s.invAmt, { fontSize: fontSize.xxl || (fontSize.xl + 4), color: colors.primary, fontWeight: '900' }]}>
                      {formatCurrency(totalAmount)}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.t3, fontWeight: '700' }}>
                      {formatDateShort(inv.invoice_date || inv.created_at)}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  <View style={[metaChip, { minWidth: undefined, flex: 1.15 }]}>
                    <Text style={labelMini}>المتبقي</Text>
                    <Text style={[valueMini, { color: colors.red, fontSize: 13 }]}>{formatCurrency(paymentRemaining)}</Text>
                  </View>
                  <View style={[metaChip, { justifyContent: 'center', gap: 6, minWidth: undefined, flex: 1.85, flexDirection: 'row-reverse' }]}>
                    <Badge status={paymentStatus} label={paymentMeta.label} color={paymentMeta.color} />
                    <Badge status={approvalStatus} label={approvalMeta.label} color={approvalMeta.color} />
                  </View>
                  {hasDiscount && (
                    <View style={metaChip}>
                      <Text style={labelMini}>الخصم</Text>
                      {discountPending ? (
                        <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '900' }}>معلق</Text>
                      ) : discountApproved ? (
                        <Text style={{ fontSize: 11, color: colors.green, fontWeight: '900' }}>معتمد</Text>
                      ) : discountRejected ? (
                        <Text style={{ fontSize: 11, color: colors.red, fontWeight: '900' }}>مرفوض</Text>
                      ) : (
                        <Text style={{ fontSize: 11, color: colors.t3, fontWeight: '800' }}>لا يوجد</Text>
                      )}
                    </View>
                  )}
                </View>

                {expanded && (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: colors.border + '70' }}>
                    <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 8 }}>
                      <View style={[sectionBox, { flex: 1 }]}>
                        <Text style={boxTitle}>الحالات</Text>
                        <View style={statusChip}>
                          <Text style={labelMini}>السداد</Text>
                          <Badge status={paymentStatus} label={paymentMeta.label} color={paymentMeta.color} />
                        </View>
                        <View style={statusChip}>
                          <Text style={labelMini}>الاعتماد</Text>
                          <Badge status={approvalStatus} label={approvalMeta.label} color={approvalMeta.color} />
                        </View>
                      </View>

                      <View style={[sectionBox, { flex: 1 }]}>
                        <Text style={boxTitle}>مؤشرات</Text>
                        <View style={statusChip}>
                          <Text style={labelMini}>الخصم</Text>
                          {discountPending ? (
                            <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '900' }}>معلق</Text>
                          ) : discountApproved ? (
                            <Text style={{ fontSize: 11, color: colors.green, fontWeight: '900' }}>معتمد</Text>
                          ) : discountRejected ? (
                            <Text style={{ fontSize: 11, color: colors.red, fontWeight: '900' }}>مرفوض</Text>
                          ) : (
                            <Text style={{ fontSize: 11, color: colors.t3, fontWeight: '800' }}>لا يوجد</Text>
                          )}
                        </View>
                        <View style={statusChip}>
                          <Text style={labelMini}>العد</Text>
                          <Text style={{ fontSize: 11, color: countdownStyle.text, fontWeight: '900' }}>
                            {countdownMeta.label}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {[
                      paymentStatus !== 'paid' && { l: 'حالة التأخير', v: delayLabel, c: isOverdue ? colors.danger : colors.success },
                      { l: 'المدفوع', v: formatCurrency(paidAmount), c: colors.green },
                      { l: 'المعتمد محاسبياً', v: formatCurrency(approvedPaid), c: colors.primary },
                      inv.agent_name && { l: 'المندوب', v: inv.agent_name, c: colors.t2 },
                      hasDiscount && { l: 'الخصم المطلوب', v: formatCurrency(Number(inv.discount_requested_value || 0)), c: colors.orange },
                      hasDiscount && inv.discount_applied_value > 0 && { l: 'الخصم المعتمد', v: formatCurrency(Number(inv.discount_applied_value || 0)), c: colors.green },
                    ].filter(Boolean).map((row, i) => (
                      <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 5 }}>
                        <Text style={{ fontSize: 11, color: colors.t3, fontWeight: '700' }}>{row.l}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: row.c }}>{row.v}</Text>
                      </View>
                    ))}
                    {inv.miniature_items && (
                      <Text style={{ fontSize: 11, color: colors.t2, marginTop: 4 }}>{inv.miniature_items}</Text>
                    )}
                  </View>
                )}

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
                  onPress={() => setExpandedInvId(expanded ? null : inv.id)}
                  activeOpacity={0.85}
                >
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                    <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '800' }}>
                      {expanded ? 'إخفاء التفاصيل' : 'عرض مزيد من التفاصيل'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: colors.t3, fontWeight: '700' }}>
                    {countdownMeta.active ? 'العد التنازلي للتأخير' : 'تفاصيل إضافية'}
                  </Text>
                </TouchableOpacity>
                
                {/* Detail shortcut */}
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border + '50', flexDirection: 'row' }}>
                  <TouchableOpacity 
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, backgroundColor: colors.primary + '12', borderRadius: 6, flexDirection: 'row', gap: 6 }}
                    onPress={() => navigation.navigate('InvoiceDetail', { id: inv.id })}
                  >
                    <Feather name="file-text" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>التفاصيل</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      }
    </View>
  );
}
