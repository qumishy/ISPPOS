import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, Platform, Linking
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  getLocalInvoices, getLocalInvoiceItems, getLocalCollections, 
  softDeleteInvoice, getSetting
} from '../services/database';
import { formatCurrency } from '../utils/helpers';
import { Btn, Loading, Row, Badge } from '../components/UI';
import { makeStyles } from '../styles/form.styles';

export default function InvoiceDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const { can, user } = useAuth();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [invs, itms, pms] = await Promise.all([
          getLocalInvoices({ id }),
          getLocalInvoiceItems(id),
          getLocalCollections({ invoice_id: id })
        ]);
        if (invs.length > 0) setInvoice(invs[0]);
        setItems(itms || []);
        setPayments(pms || []);
      } catch (e) { }
      setLoading(false);
    }
    load();
  }, [id]);

  const handlePrint = async () => {
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const balance = Math.max(0, (invoice.net_amount || invoice.total_amount) - totalPaid);

    const collectionsHtml = payments.length > 0 ? `
      <div class="section-title">📦 سجل المدفوعات</div>
      <table class="table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>طريقة الدفع</th>
            <th style="text-align: left;">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map(p => `
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

        <div class="section-title">📋 تفاصيل الأصناف</div>
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
 
  const handleDelete = () => {
    Alert.alert('حذف الفاتورة', 'هل أنت متأكد من حذف هذه الفاتورة نهائياً؟ سيتم استعادة الكروت للمخزن.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد الحذف', style: 'destructive', onPress: async () => {
        try {
          await softDeleteInvoice(id);
          Alert.alert('✅ تم', 'تم حذف الفاتورة بنجاح');
          navigation.goBack();
        } catch(e) { Alert.alert('خطأ', e.message); }
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

  if (loading || !invoice) return <Loading />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.md }}>
      <View style={s.invoiceHeader}><Text style={s.invoiceTitle}>{invoice.invoice_number}</Text><Badge status={invoice.status} /></View>
      <View style={s.section}>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 10 }}><Text style={{ color: colors.t3 }}>نقطة البيع</Text><Text style={{ color: colors.t1, fontWeight: '700' }}>{invoice.pos_name}</Text></Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 10 }}><Text style={{ color: colors.t3 }}>التاريخ</Text><Text style={{ color: colors.t1 }}>{invoice.invoice_date}</Text></Row>
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>📋 البنود (الأصناف)</Text>
        <View style={s.tableHeader}>
          <Text style={[s.thCell, { flex: 2 }]}>الفئة</Text>
          <Text style={[s.thCell, { flex: 1 }]}>الكمية</Text>
          <Text style={[s.thCell, { flex: 1.5 }]}>الإجمالي</Text>
        </View>
        {items.map(it => (
          <Row key={it.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ flex: 2, color: colors.t1, fontSize: 13 }}>{it.category_name}</Text>
            <Text style={{ flex: 1, textAlign: 'center', color: colors.t1 }}>{it.quantity}</Text>
            <Text style={{ flex: 1.5, textAlign: 'right', fontWeight: 'bold', color: colors.green }}>{formatCurrency(it.total_price)}</Text>
          </Row>
        ))}
        <View style={s.totalsBox}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.t2 }}>صافي الفاتورة:</Text>
            <Text style={{ fontSize: 22, color: colors.blue, fontWeight: '900' }}>{formatCurrency(invoice.net_amount || invoice.total_amount)}</Text>
          </Row>
        </View>

        <Row style={{ gap: 8, marginTop: 15 }}>
          <Btn label={<FontAwesome5 name="whatsapp" size={24} color="white" />} variant="success" size="sm" style={{ flex: 1 }} onPress={handleWhatsApp} />
          <Btn label="✉️ رسالة SMS" variant="outline" size="sm" style={{ flex: 1 }} onPress={handleSMS} />
        </Row>
      </View>

      {user?.role === 'admin' && (
        <View style={[s.section, { borderTopWidth: 1, borderTopColor: colors.red + '30', marginTop: 10 }]}>
          <Btn label="🗑️ حذف الفاتورة" variant="danger" onPress={handleDelete} />
        </View>
      )}

      <View style={s.section}>
        <Text style={s.sectionTitle}>💰 سجل التحصيلات (المدفوعات)</Text>
        {payments.length === 0 ? (
          <Text style={{ textAlign: 'center', color: colors.t3, paddingVertical: 10 }}>لا توجد دفعات مسجلة بعد</Text>
        ) : (
          <>
            <View style={s.tableHeader}>
              <Text style={[s.thCell, { flex: 1.2 }]}>التاريخ</Text>
              <Text style={[s.thCell, { flex: 1 }]}>المبلغ</Text>
              <Text style={[s.thCell, { flex: 1 }]}>الحالة</Text>
            </View>
            {payments.map(pm => (
              <View key={pm.id} style={s.tableRow}>
                <Text style={[s.tdCell, { flex: 1.2, fontSize: 11 }]}>{pm.collection_date}</Text>
                <Text style={[s.tdCell, { flex: 1, fontWeight: 'bold', color: colors.green }]}>{formatCurrency(pm.amount)}</Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Badge 
                    status={pm.status} 
                    label={pm.status === 'approved' ? 'معتمد' : 'معلق'} 
                    size="xs" 
                    color={pm.status === 'approved' ? colors.green : colors.orange}
                  />
                </View>
              </View>
            ))}
            <View style={{ marginTop: 10, padding: 10, backgroundColor: colors.bg2, borderRadius: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.t3 }}>إجمالي المسدد:</Text>
                <Text style={{ fontWeight: 'bold', color: colors.green }}>{formatCurrency(invoice.paid_amount || 0)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 5 }}>
                <Text style={{ color: colors.t3 }}>المعتمد محاسبياً:</Text>
                <Text style={{ fontWeight: 'bold', color: colors.blue }}>{formatCurrency(invoice.approved_amount || 0)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 5, borderTopWidth: 1, borderTopColor: colors.border + '30', paddingTop: 5 }}>
                <Text style={{ color: colors.t3 }}>المتبقي (فعلي):</Text>
                <Text style={{ fontWeight: 'bold', color: colors.red }}>{formatCurrency(Math.max(0, (invoice.net_amount || invoice.total_amount) - (invoice.paid_amount || 0)))}</Text>
              </Row>
            </View>
          </>
        )}
      </View>

      <Row style={{ gap: 10, marginTop: 10 }}><Btn label="🖨️ طباعة" style={{ flex: 1 }} onPress={handlePrint} /><Btn label="⬅️ عودة" variant="outline" onPress={() => navigation.goBack()} /></Row>
    </ScrollView>
  );
}
