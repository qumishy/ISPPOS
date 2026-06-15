import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, Platform, Linking
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  getLocalInvoices, getLocalInvoiceItems, getLocalCollections, 
  softDeleteInvoice, getSetting
} from '../services/database';
import { formatCurrency, invoicePaymentStatusMeta, invoiceApprovalStatusMeta } from '../utils/helpers';
import { Btn, Loading, Row, Badge } from '../components/UI';
import { makeStyles } from '../styles/form.styles';
import { useLoading } from '../services/LoadingContext';

export default function InvoiceDetailScreen({ route, navigation }) {
  const invoiceId = route.params?.id || route.params?.invoice_id || route.params?.invoiceId || '';
  const refreshAt = route.params?.refresh_at || route.params?.refreshAt || null;
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const { can, user, projectId } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const activePayments = payments.filter(p =>
    (p.active === 1 || p.active === 'true' || p.active == null) &&
    !['rejected', 'cancelled', 'canceled', 'deleted'].includes(String(p.status || 'pending').toLowerCase())
  );
  const displayedPayments = invoice?.status === 'cancelled' ? payments : activePayments;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        if (!invoiceId) throw new Error('رقم الفاتورة غير صالح');
        if (!projectId) throw new Error('سياق المشروع غير جاهز');

        const [invs, itms, pms] = await Promise.all([
          getLocalInvoices({ id: invoiceId, project_id: projectId, includeInactive: true }),
          getLocalInvoiceItems(invoiceId),
          getLocalCollections({ invoice_id: invoiceId, project_id: projectId, includeInactive: true })
        ]);

        if (cancelled) return;

        if (invs.length > 0) {
          setInvoice(invs[0]);
          setItems(itms || []);
          setPayments(pms || []);
        } else {
          setInvoice(null);
          setItems([]);
          setPayments([]);
          setLoadError('تعذر تحميل الفاتورة من قاعدة البيانات المحلية.');
        }
      } catch (e) {
        if (cancelled) return;
        setInvoice(null);
        setItems([]);
        setPayments([]);
        setLoadError(e?.message || 'تعذر تحميل تفاصيل الفاتورة');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [invoiceId, refreshAt, projectId]);

  const handlePrint = async () => {
    const totalPaid = activePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const balance = Math.max(0, (invoice.net_amount || invoice.total_amount) - totalPaid);

    const collectionsHtml = activePayments.length > 0 ? `
      <div class="section-title">سجل المدفوعات</div>
      <table class="table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>طريقة الدفع</th>
            <th style="text-align: left;">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${activePayments.map(p => `
            <tr>
              <td>${p.collection_date}</td>
              <td>${p.method === 'cash' ? 'نقدي' : 'تحويل'}</td>
              <td style="text-align: left; font-weight: bold;">${formatCurrency(p.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    const networkName = await getSetting('network_name', '');
    const networkOwner = await getSetting('network_owner', '');
    const networkPhone1 = await getSetting('network_phone1', '');
    const networkPhone2 = await getSetting('network_phone2', '');
    const networkLogo = await getSetting('network_logo', '');
    const phones = [networkPhone1, networkPhone2].filter(Boolean).join(' | ');

    const html = `
      <html dir="rtl" lang="ar">
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
          .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
          .brand-logo { width: 50px; height: 50px; border-radius: 50%; margin: 0 auto 8px; }
          .brand-name { font-size: 18px; font-weight: 900; color: #1e3a5f; margin-bottom: 2px; }
          .brand-info { font-size: 11px; color: #64748b; }
          .title { font-size: 28px; font-weight: 900; color: #2563eb; margin: 10px 0 0; }
          .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
          .section-title { font-size: 18px; font-weight: 700; margin: 25px 0 10px; color: #1e40af; border-right: 4px solid #2563eb; padding-right: 10px; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .table th { background: #f1f5f9; padding: 12px; text-align: right; border-bottom: 2px solid #e2e8f0; font-size: 13px; }
          .table td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
          .summary { background: #f8fafc; padding: 20px; border-radius: 12px; margin-top: 30px; border: 1px solid #e2e8f0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 15px; }
          .total { font-size: 20px; font-weight: 900; color: #1e40af; border-top: 2px dashed #cbd5e1; padding-top: 10px; margin-top: 10px; }
          .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          ${networkLogo ? `<img src="${networkLogo}" class="brand-logo" />` : ''}
          ${networkName ? `<div class="brand-name">${networkName}</div>` : ''}
          ${networkOwner ? `<div class="brand-info">مالك: ${networkOwner}</div>` : ''}
          ${phones ? `<div class="brand-info">${phones}</div>` : ''}
          <div class="title">فاتورة مبيعات</div>
          <div style="font-size: 16px; margin-top: 5px; color: #64748b;">${invoice.invoice_number}</div>
        </div>
        
        <div class="meta">
          <div><strong>العميل:</strong> ${invoice.pos_name}</div>
          <div><strong>التاريخ:</strong> ${invoice.invoice_date}</div>
        </div>
        <div class="meta" style="margin-top: -10px;">
          <div><strong>المندوب المُصدر:</strong> ${invoice.agent_name || ''}</div>
        </div>

        <div class="section-title">تفاصيل الأصناف</div>
        <table class="table">
          <thead>
            <tr>
              <th style="width: 50%;">الفئة</th>
              <th style="text-align: center;">الكمية</th>
              <th style="text-align: left;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(it => `
              <tr>
                <td>${it.category_name}</td>
                <td style="text-align: center;">${it.quantity}</td>
                <td style="text-align: left; font-weight: bold;">${formatCurrency(it.total_price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${collectionsHtml}

        <div class="summary">
          <div class="row"><span>إجمالي الفاتورة:</span> <span>${formatCurrency(invoice.net_amount || invoice.total_amount)}</span></div>
          <div class="row"><span>المبلغ المدفوع (الواصل):</span> <span style="color: #059669; font-weight: bold;">${formatCurrency(totalPaid)}</span></div>
          <div class="row total"><span>المبلغ المتبقي:</span> <span>${formatCurrency(balance)}</span></div>
        </div>

        <div class="footer">
          شكراً لتعاملكم معنا · ISP Cards System v3
        </div>
      </body>
      </html>
    `;
    await Print.printAsync({ html });
  };
 
  const handleCancelInvoice = () => {
    if (deleting) return;
    Alert.alert('إلغاء الفاتورة', 'هل أنت متأكد من إلغاء هذه الفاتورة؟ سيتم إلغاء البنود والتحصيلات التابعة لها واستعادة الكروت للمخزن.', [
      { text: 'تراجع', style: 'cancel' },
      { text: 'تأكيد الإلغاء', style: 'destructive', onPress: async () => {
        try {
          if (deleting) return;
          setDeleting(true);
          showLoading('جاري إلغاء الفاتورة...');
          await softDeleteInvoice(invoiceId);
          navigation.navigate('InvoicesMain', { refresh_at: Date.now(), cancelled_invoice_id: invoiceId });
        } catch(e) {
          Alert.alert('خطأ', e.message);
        } finally {
          setDeleting(false);
          hideLoading();
        }
      }}
    ]);
  };

  const generateMsg = () => {
    let m = `🧾 *فاتورة مبيعات رقم: ${invoice.invoice_number}*\n`;
    m += `📅 التاريخ: ${invoice.invoice_date}\n`;
    m += `🏪 العميل: ${invoice.pos_name}\n`;
    m += `👤 المندوب: ${invoice.agent_name || ''}\n`;
    m += `------------------------------\n`;
    m += `📋 *الأصناف والبنود:*\n`;
    items.forEach(it => {
      m += `• ${it.category_name}: ${it.quantity} (ج:${formatCurrency(it.total_price)})\n`;
    });
    m += `------------------------------\n`;
    m += `💰 *الإجمالي النهائي: ${formatCurrency(invoice.net_amount || invoice.total_amount)}*\n\n`;
    m += `شكراً لتعاملكم معنا 🙏`;
    return m;
  };

  const handleWhatsApp = () => {
    const phone = invoice.pos_phone;
    if (!phone) return Alert.alert('تنبيه', 'لا يوجد رقم هاتف مسجل لنقطة البيع');
    const msg = generateMsg();
    const url = `whatsapp://send?phone=${phone.startsWith('+') ? phone : '+967' + phone}&text=${encodeURIComponent(msg)}`;
    Linking.canOpenURL(url).then(supp => {
      if (supp) Linking.openURL(url);
      else Alert.alert('خطأ', 'تطبيق واتساب غير مثبت على هذا الجهاز');
    });
  };

  const handleSMS = () => {
    const phone = invoice.pos_phone;
    if (!phone) return Alert.alert('تنبيه', 'لا يوجد رقم هاتف مسجل لنقطة البيع');
    let itemsStr = items.map(it => `${it.category_name}:${it.quantity} (ج:${formatCurrency(it.total_price)})`).join(' / ');
    const msg = `فاتورة ${invoice.invoice_number} ج:${invoice.net_amount || invoice.total_amount}\nالمندوب: ${invoice.agent_name || ''}\n${itemsStr}`;
    const url = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(msg)}`;
    Linking.openURL(url);
  };

  if (loading) return <Loading />;
  if (loadError || !invoice) {
    return (
      <View style={[s.screen, { justifyContent: 'center', padding: spacing.md }]}>
        <View style={[s.section, { alignItems: 'center', gap: spacing.sm }]}>
          <Feather name="alert-circle" size={28} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: '800', textAlign: 'center' }}>
            {loadError || 'تعذر تحميل الفاتورة'}
          </Text>
          <Btn label="العودة" variant="outline" onPress={() => navigation.goBack()} style={{ width: '100%' }} />
        </View>
      </View>
    );
  }
  const paymentStatus = invoice.payment_status || invoice.status;
  const approvalStatus = invoice.approval_status;
  const paymentMeta = invoicePaymentStatusMeta(paymentStatus);
  const approvalMeta = invoiceApprovalStatusMeta(approvalStatus);
  const discountRequested = Number(invoice.discount_requested_value || 0);
  const discountApplied = Number(invoice.discount_applied_value || 0);
  const hasDiscount = discountRequested > 0;
  const discountState = String(invoice.discount_status || '').trim();
  const discountLabel = !hasDiscount
    ? 'لا يوجد'
    : (discountState === 'approved' || discountState === 'auto_approved')
      ? 'معتمد'
      : discountState === 'rejected'
        ? 'مرفوض'
        : 'معلق';
  const discountColor = !hasDiscount
    ? colors.t3
    : (discountState === 'approved' || discountState === 'auto_approved')
      ? colors.green
      : discountState === 'rejected'
        ? colors.red
        : colors.orange;
  const paymentRemaining = Math.max(0, Number(invoice.payment_remaining_amount ?? invoice.remaining_amount ?? (invoice.net_amount || invoice.total_amount || 0) - (invoice.paid_amount || 0)));
  const approvalRemaining = Math.max(0, Number(invoice.approval_remaining_amount ?? invoice.remaining_unpaid_amount ?? (invoice.net_amount || invoice.total_amount || 0) - (invoice.approved_amount || 0)));
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.md }}>
      <View style={s.section}>
        <Text style={[s.sectionTitle, { marginBottom: spacing.sm }]}>ملخص الفاتورة</Text>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text style={{ color: colors.t3 }}>رقم الفاتورة</Text>
          <Text style={{ color: colors.t1, fontWeight: '900' }}>{invoice.invoice_number}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text style={{ color: colors.t3 }}>نقطة البيع</Text>
          <Text style={{ color: colors.t1, fontWeight: '700' }}>{invoice.pos_name}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text style={{ color: colors.t3 }}>المندوب/المستخدم</Text>
          <Text style={{ color: colors.t1, fontWeight: '700' }}>{invoice.agent_name || '-'}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text style={{ color: colors.t3 }}>التاريخ</Text>
          <Text style={{ color: colors.t1 }}>{invoice.invoice_date}</Text>
        </Row>
        <View style={{ marginTop: 8, gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
            <Badge status={paymentStatus} label={paymentMeta.label} color={paymentMeta.color} />
            <Text style={{ color: colors.t3, fontSize: 11, fontWeight: '700' }}>حالة السداد</Text>
          </View>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
            <Badge status={approvalStatus} label={approvalMeta.label} color={approvalMeta.color} />
            <Text style={{ color: colors.t3, fontSize: 11, fontWeight: '700' }}>حالة الاعتماد</Text>
          </View>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
            <Badge status={discountState || 'none'} label={discountLabel} color={discountColor} />
            <Text style={{ color: colors.t3, fontSize: 11, fontWeight: '700' }}>حالة الخصم</Text>
          </View>
        </View>
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>البنود (الأصناف)</Text>
        <View style={{ gap: spacing.sm, marginTop: 10 }}>
          {items.map(it => (
            <View key={it.id} style={{ backgroundColor: colors.bg2, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: spacing.xs }}>
                <Text style={{ color: colors.t1, fontSize: fontSize.md, fontWeight: '800', flexShrink: 1 }}>{it.category_name}</Text>
                <Text style={{ color: colors.green, fontWeight: '900', fontSize: fontSize.lg }}>{formatCurrency(it.total_price)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>الباتش: <Text style={{ color: colors.t1, fontWeight: '700' }}>{it.batch_name || it.batch_number || '-'}</Text></Text>
                <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>الكمية: <Text style={{ color: colors.t1, fontWeight: '700' }}>{it.quantity}</Text></Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>سعر الوحدة: <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatCurrency(it.total_price / (it.quantity || 1))}</Text></Text>
                <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>الإجمالي: <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatCurrency(it.total_price)}</Text></Text>
              </Row>
            </View>
          ))}
        </View>
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>الملخص المالي</Text>
        <View style={{ marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border }}>
          <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ color: colors.t3 }}>إجمالي الفاتورة</Text>
            <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatCurrency(invoice.total_amount || 0)}</Text>
          </Row>
          <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ color: colors.t3 }}>الخصم</Text>
            <Text style={{ color: discountColor, fontWeight: '700' }}>{formatCurrency(discountApplied || discountRequested || 0)}</Text>
          </Row>
          <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ color: colors.t3 }}>صافي الفاتورة</Text>
            <Text style={{ color: colors.blue, fontWeight: '900' }}>{formatCurrency(invoice.net_amount || invoice.total_amount)}</Text>
          </Row>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border + '50', marginVertical: 8 }} />
          <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ color: colors.t3 }}>المبلغ المدفوع</Text>
            <Text style={{ color: colors.green, fontWeight: '800' }}>{formatCurrency(invoice.paid_amount || 0)}</Text>
          </Row>
          <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ color: colors.t3 }}>المبلغ المتبقي</Text>
            <Text style={{ color: colors.red, fontWeight: '900' }}>{formatCurrency(paymentRemaining)}</Text>
          </Row>
        </View>
        {hasDiscount && (() => {
          const ds = String(invoice.discount_status || '').trim();
          const isPending   = !['approved','auto_approved','rejected','none',''].includes(ds);
          const isApproved  = ds === 'approved' || ds === 'auto_approved';
          const isRejected  = ds === 'rejected';
          const bannerColor = isPending ? colors.danger : isApproved ? colors.green : colors.danger;
          const bannerBg    = bannerColor + '15';
          const statusLabel = isPending ? '⚠️ بانتظار اعتماد المدير (خصم معلق)' : isApproved ? '✅ خصم معتمد' : '❌ خصم مرفوض';
          return (
            <View style={{ marginTop: 12, borderRadius: 12, borderWidth: 1.5, borderColor: bannerColor + '60', backgroundColor: bannerBg, overflow: 'hidden' }}>
              <View style={{ backgroundColor: bannerColor + '25', paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="percent" size={16} color={bannerColor} />
                <Text style={{ fontWeight: '900', fontSize: 14, color: bannerColor }}>{statusLabel}</Text>
              </View>
              <View style={{ padding: 14, gap: 8 }}>
                {[
                  { l: 'الخصم المطلوب', v: formatCurrency(Number(invoice.discount_requested_value || 0)), c: colors.orange },
                  invoice.discount_requested_reason && { l: 'سبب الخصم', v: invoice.discount_requested_reason, c: colors.t1 },
                  isApproved && { l: 'الخصم المعتمد', v: formatCurrency(Number(invoice.discount_applied_value || 0)), c: colors.green },
                  isApproved && { l: 'الصافي بعد الخصم', v: formatCurrency(Number(invoice.net_amount || invoice.total_amount || 0)), c: colors.blue },
                  isRejected && { l: 'يُطبق الإجمالي الكامل', v: formatCurrency(Number(invoice.total_amount || 0)), c: colors.t1 },
                  isPending && { l: 'التحصيل محظور', v: 'حتى يعتمد المدير أو يرفض الخصم', c: colors.orange },
                ].filter(Boolean).map((row, i) => (
                  <Row key={i} style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.t3, fontSize: 13 }}>{row.l}</Text>
                    <Text style={{ color: row.c, fontWeight: '700', fontSize: 13, flexShrink: 1, textAlign: 'right', marginLeft: 8 }}>{row.v}</Text>
                  </Row>
                ))}
              </View>
            </View>
          );
        })()}
      </View>

      {user?.role === 'admin' && invoice?.status !== 'cancelled' && (
        <View style={[s.section, { borderTopWidth: 1, borderTopColor: colors.red + '30', marginTop: 10 }]}>
          <Btn label="إلغاء الفاتورة" icon="x-circle" variant="danger" onPress={handleCancelInvoice} loading={deleting} disabled={deleting} />
        </View>
      )}

      <View style={s.section}>
        <Text style={s.sectionTitle}>سجل التحصيلات (المدفوعات)</Text>
        {displayedPayments.length === 0 ? (
          <Text style={{ textAlign: 'center', color: colors.t3, paddingVertical: 10 }}>لا توجد دفعات مسجلة بعد</Text>
        ) : (
          <>
            <View style={{ gap: spacing.sm, marginTop: 10 }}>
              {displayedPayments.map(pm => (
                <View key={pm.id} style={{ backgroundColor: colors.bg2, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ backgroundColor: pm.status === 'approved' ? colors.green + '15' : pm.status === 'cancelled' ? colors.red + '15' : colors.orange + '15', width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={pm.status === 'approved' ? "check-circle" : pm.status === 'cancelled' ? "x-circle" : "clock"} size={18} color={pm.status === 'approved' ? colors.green : pm.status === 'cancelled' ? colors.red : colors.orange} />
                    </View>
                    <View>
                      <Text style={{ color: colors.t1, fontSize: fontSize.md, fontWeight: '800' }}>{formatCurrency(pm.amount)}</Text>
                      <Text style={{ color: colors.t3, fontSize: fontSize.xs, marginTop: 2 }}>{pm.collection_date}</Text>
                    </View>
                  </View>
                  <Badge 
                    status={pm.status} 
                    label={pm.status === 'approved' ? 'معتمد' : pm.status === 'cancelled' ? 'ملغية' : 'معلق'} 
                    size="sm" 
                    color={pm.status === 'approved' ? colors.green : pm.status === 'cancelled' ? colors.red : colors.orange}
                  />
                </View>
              ))}
            </View>
            <View style={{ marginTop: 10, padding: 10, backgroundColor: colors.bg2, borderRadius: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.t3 }}>إجمالي المحصل:</Text>
                <Text style={{ fontWeight: 'bold', color: colors.green }}>{formatCurrency(invoice.paid_amount || 0)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 5 }}>
                <Text style={{ color: colors.t3 }}>المعتمد محاسبياً:</Text>
                <Text style={{ fontWeight: 'bold', color: colors.blue }}>{formatCurrency(invoice.approved_amount || 0)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 5, borderTopWidth: 1, borderTopColor: colors.border + '30', paddingTop: 5 }}>
                <Text style={{ color: colors.t3 }}>المتبقي (فعلي):</Text>
                <Text style={{ fontWeight: 'bold', color: colors.red }}>{formatCurrency(paymentRemaining)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 5 }}>
                <Text style={{ color: colors.t3 }}>المتبقي للاعتماد:</Text>
                <Text style={{ fontWeight: 'bold', color: colors.warning }}>{formatCurrency(approvalRemaining)}</Text>
              </Row>
            </View>
          </>
        )}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>الإجراءات</Text>
        <Row style={{ gap: 8, marginTop: 10 }}>
          <Btn label={<Feather name="message-circle" size={24} color="white" />} variant="success" size="sm" style={{ flex: 1 }} onPress={handleWhatsApp} />
          <Btn label=" رسالة SMS" icon="message-square" variant="outline" size="sm" style={{ flex: 1 }} onPress={handleSMS} />
        </Row>
        <Row style={{ gap: 10, marginTop: 10 }}>
          <Btn label="طباعة" icon="printer" style={{ flex: 1 }} onPress={handlePrint} />
          <Btn label="عودة" icon="arrow-right" variant="outline" onPress={() => navigation.goBack()} />
        </Row>
      </View>
    </ScrollView>
  );
}
