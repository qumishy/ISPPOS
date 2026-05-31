import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../theme';
import { Feather } from '@expo/vector-icons';
import { execSQL, subscribeDataChanges } from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Loading, ScreenHeader, Badge } from '../components/UI';
import { makeStyles } from '../styles/main.styles';

const ACTIVE_INVOICE_CLAUSE = `(COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL AND (i.active = 1 OR i.active IS NULL OR i.active = 'true') AND LOWER(COALESCE(i.status, '')) NOT IN ('deleted', 'cancelled', 'canceled', 'rejected'))`;
export default function BatchStockDetailScreen({ route, navigation }) {
  const { batchId, batchNumber } = route.params;
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [data, setData] = useState([]);
  const [batchInfo, setBatchInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ totalSold: 0, totalCollected: 0 });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      try {
        // 1. Get Batch Info
        const bR = await execSQL(`
          SELECT b.*, c.name as category_name 
          FROM batches b 
          JOIN card_categories c ON c.id = b.category_id 
          WHERE b.id = ?
        `, [batchId]);
        if (!isMounted) return;
        const batchRecord = bR.rows._array?.[0];
        setBatchInfo(batchRecord);
        const invoiceScope = [];
        const invoiceScopeParams = [];
        if (batchRecord?.project_id) {
          invoiceScope.push('i.project_id = ?');
          invoiceScopeParams.push(batchRecord.project_id);
        }
        if (batchRecord?.phase_id) {
          invoiceScope.push('i.phase_id = ?');
          invoiceScopeParams.push(batchRecord.phase_id);
        }
        const invoiceScopeSql = invoiceScope.length ? `AND ${invoiceScope.join(' AND ')}` : '';

        // 2. Get Distribution Details (Summarized by Agent)
        const res = await execSQL(`
          SELECT 
            u.name AS agent_name,
            SUM(aw.total_cards) AS assigned_qty,
            SUM(COALESCE(ws.sold_qty, 0)) AS sold_qty,
            SUM(MAX(0, aw.total_cards - COALESCE(ws.sold_qty, 0))) AS remaining_qty,
            COALESCE(SUM(ws.collection_total), 0) AS collected_amount
          FROM agent_wallets aw
          JOIN users u ON u.id = aw.agent_id
          LEFT JOIN (
            SELECT
              ii.wallet_id,
              SUM(ii.quantity) as sold_qty,
              SUM(COALESCE(cc.price, ii.unit_price, 0) * COALESCE(ii.quantity, 0)) as collection_total
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            LEFT JOIN card_categories cc ON cc.id = ii.category_id
            WHERE ii.batch_id = ? AND ${ACTIVE_INVOICE_CLAUSE}
              ${invoiceScopeSql}
            GROUP BY ii.wallet_id
          ) ws ON ws.wallet_id = aw.id
          WHERE aw.batch_id = ?
          GROUP BY u.id
          ORDER BY u.name ASC
        `, [
          batchId,
          ...invoiceScopeParams,
          batchId,
        ]);

        const rows = res.rows._array || [];
        const distributionCollectionsTotal = rows.reduce((acc, r) => acc + Number(r.collected_amount || 0), 0);
        console.log('[DistributionReportCollectionValidation]', {
          batch_id: batchId,
          calculation: 'category_price * sold_quantity',
          row_collection_total_sum: distributionCollectionsTotal,
        });
        if (!isMounted) return;
        setData(rows);

        const totalSold = rows.reduce((acc, r) => acc + (r.sold_qty || 0), 0);
        const totalCollected = distributionCollectionsTotal;
        setSummary({ totalSold, totalCollected });

      } catch (e) {
        console.error('BatchStockDetail Error:', e);
      }
      if (isMounted) setLoading(false);
    }
    load();
    const unsub = subscribeDataChanges((e) => {
      if (['batches', 'agent_wallets', 'invoice_items', 'invoices', 'collections', 'all'].includes(e?.type)) {
        load();
      }
    });
    return () => {
      isMounted = false;
      unsub?.();
    };
  }, [batchId]);

  if (loading) return <Loading />;

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={`تفصيل توزيع: ${batchNumber || batchInfo?.batch_number || '—'}`}
        kpis={[
          { label: 'إجمالي الموزع', value: (batchInfo?.total_cards - batchInfo?.available_cards) || 0, color: colors.primary },
          { label: 'الكمية المباعة', value: summary.totalSold, color: colors.orange },
          { label: 'إجمالي التحصيل', value: formatCurrency(summary.totalCollected), color: colors.success },
        ]}
      />

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}>
        {/* Batch Info Card */}
        <View style={[s.section, { padding: 16, marginBottom: spacing.md }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ color: colors.t3, fontSize: 12 }}>رقم المتسلسل: <Text style={{ color: colors.t1, fontWeight: '700' }}>{batchInfo?.serial_number}</Text></Text>
            <Badge status={batchInfo?.category_name} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.t3, fontSize: 12 }}>تاريخ الاستلام: <Text style={{ color: colors.t1 }}>{formatDateShort(batchInfo?.received_date)}</Text></Text>
            <Text style={{ color: colors.t3, fontSize: 12 }}>الحالة: <Text style={{ color: colors.success, fontWeight: '800' }}>{batchInfo?.status === 'active' ? 'نشط' : batchInfo?.status}</Text></Text>
          </View>
        </View>

        {/* Details Table */}
        <View style={[s.section, { padding: 0, overflow: 'hidden' }]}>
          <View style={[s.tableHeader, { backgroundColor: colors.primary + '10' }]}>
            <Text style={[s.thCell, { flex: 1.2 }]}>المندوب</Text>
            <Text style={[s.thCell, { flex: 0.8, textAlign: 'center' }]}>الموزع</Text>
            <Text style={[s.thCell, { flex: 0.8, textAlign: 'center' }]}>المباع</Text>
            <Text style={[s.thCell, { flex: 0.8, textAlign: 'center' }]}>المتبقي</Text>
            <Text style={[s.thCell, { flex: 1, textAlign: 'left' }]}>التحصيل</Text>
          </View>

          {data.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Feather name="info" size={24} color={colors.t3} />
              <Text style={{ color: colors.t3, marginTop: 8 }}>لم يتم توزيع أي كمية من هذه الدفعة بعد</Text>
            </View>
          ) : data.map((item, idx) => (
            <View key={idx} style={[s.tableRow, idx % 2 === 1 && { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
              <View style={{ flex: 1.2 }}><Text style={s.tdMain}>{item.agent_name}</Text></View>
              <View style={{ flex: 0.8, alignItems: 'center' }}><Text style={[s.tdMain, { fontWeight: '700' }]}>{item.assigned_qty}</Text></View>
              <View style={{ flex: 0.8, alignItems: 'center' }}><Text style={[s.tdMain, { color: colors.orange, fontWeight: '700' }]}>{item.sold_qty}</Text></View>
              <View style={{ flex: 0.8, alignItems: 'center' }}><Text style={[s.tdMain, { color: colors.primary, fontWeight: '700' }]}>{item.remaining_qty}</Text></View>
              <View style={{ flex: 1, alignItems: 'flex-start' }}><Text style={[s.tdMain, { color: colors.green, fontWeight: '800' }]}>{formatCurrency(item.collected_amount)}</Text></View>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 20, padding: 16, backgroundColor: colors.blue + '08', borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.blue + '30' }}>
          <Text style={{ fontSize: 13, color: colors.t3, lineHeight: 20, textAlign: 'center' }}>
            💡 ملاحظة: التحصيل الظاهر هو إجمالي المبالغ المعتمدة للفواتير التي تحتوي على أوراق من هذه الدفعة.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
