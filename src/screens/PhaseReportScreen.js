import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { execSQL } from '../services/database';
import { useAuth } from '../services/AuthContext';
import { Loading } from '../components/UI';
import { formatCurrency, invoiceApprovalStatusMeta, invoicePaymentStatusMeta } from '../utils/helpers';
import { reconcileOutstandingInvoicesToActivePhase } from '../services/phaseService';

const ensurePhaseCarryForwardTable = async () => {
  await execSQL(`
    CREATE TABLE IF NOT EXISTS phase_invoice_carryforwards (
      id TEXT PRIMARY KEY NOT NULL,
      invoice_id TEXT NOT NULL,
      project_id TEXT,
      source_phase_id TEXT,
      target_phase_id TEXT NOT NULL,
      invoice_number TEXT,
      net_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      synced INTEGER DEFAULT 0
    )
  `);
  await execSQL(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_phase_carryforwards_invoice_target
    ON phase_invoice_carryforwards(invoice_id, target_phase_id)
  `);
  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_phase_carryforwards_source_target
    ON phase_invoice_carryforwards(source_phase_id, target_phase_id, project_id)
  `);
};

const emptySummary = {
  total_invoices: 0,
  fully_paid_invoices: 0,
  cancelled_invoices: 0,
  carried_forward_invoices: 0,
  efficiency_rate: 0,
};

const CARRY_COLS = [
  { key: 'invoice_number', label: 'رقم الفاتورة', w: 120 },
  { key: 'pos_name', label: 'نقطة البيع', w: 140 },
  { key: 'invoice_status_label', label: 'حالة الفاتورة', w: 105 },
  { key: 'approval_status_label', label: 'حالة الاعتماد', w: 110 },
  { key: 'total_amount', label: 'الإجمالي', w: 110 },
  { key: 'total_paid', label: 'المدفوع', w: 110 },
  { key: 'remaining_amount', label: 'المتبقي', w: 110 },
  { key: 'source_phase_name', label: 'من المرحلة', w: 130 },
  { key: 'destination_phase_name', label: 'إلى المرحلة', w: 130 },
  { key: 'invoice_date', label: 'تاريخ الفاتورة', w: 105 },
  { key: 'last_collection_date', label: 'آخر تحصيل', w: 105 },
  { key: 'agent_name', label: 'المندوب', w: 120 },
];

const cardStyles = (colors, border) => ({
  flex: 1,
  minWidth: 140,
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: border,
  borderRadius: 14,
  padding: 14,
});

const normalizePhaseDate = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const buildApprovalStatus = (row) => {
  const totalAmount = Number(row.total_amount || 0);
  const approvedAmount = Number(row.approved_amount || 0);
  if (row.invoice_status === 'cancelled') return 'cancelled';
  if (approvedAmount >= totalAmount - 0.1 && totalAmount > 0) return 'approved';
  if (approvedAmount > 0.1) return 'approval_partial';
  return 'unapproved';
};

export default function PhaseReportScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { allPhases, selectedPhase } = useAuth();
  const routePhaseId = route.params?.phaseId || '';
  const routePhaseName = route.params?.phaseName || '';
  const [phaseId, setPhaseId] = useState(routePhaseId || selectedPhase?.id || '');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(emptySummary);
  const [rows, setRows] = useState([]);
  const [cancelledData, setCancelledData] = useState({ invoices: [], invoicesSum: 0, collections: [], collectionsSum: 0 });
  const phaseOptions = allPhases || [];

  useEffect(() => {
    if (routePhaseId) {
      setPhaseId(routePhaseId);
      return;
    }
    if (!phaseId && selectedPhase?.id) setPhaseId(selectedPhase.id);
  }, [routePhaseId, phaseId, selectedPhase?.id]);

  const currentPhase = useMemo(() => {
    return phaseOptions.find((phase) => phase.id === phaseId) || null;
  }, [phaseOptions, phaseId]);

  useEffect(() => {
    const titleName = currentPhase?.name || routePhaseName || 'تقرير المرحلة';
    navigation.setOptions({ title: `تقرير المرحلة: ${titleName}` });
  }, [currentPhase?.name, navigation, routePhaseName]);

  const load = useCallback(async () => {
    if (!phaseId) {
      setRows([]);
      setSummary(emptySummary);
      setCancelledData({ invoices: [], invoicesSum: 0, collections: [], collectionsSum: 0 });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const scopeProjectId = currentPhase?.project_id || selectedPhase?.project_id || phaseOptions.find((phase) => phase.id === phaseId)?.project_id || null;
      if (scopeProjectId) {
        await reconcileOutstandingInvoicesToActivePhase(scopeProjectId);
      }
      await ensurePhaseCarryForwardTable();

      const phaseRow = currentPhase || phaseOptions.find((phase) => phase.id === phaseId) || null;
      const nextPhase = (phaseOptions || [])
        .filter((phase) => phase.id !== phaseId && (phase.status === 'active' || (phase.created_at || '') > (phaseRow?.created_at || '')))
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))[0] || null;

      const phaseStart = normalizePhaseDate(phaseRow?.start_date || phaseRow?.created_at);
      const phaseEnd = normalizePhaseDate(phaseRow?.closed_at || phaseRow?.end_date || nextPhase?.start_date || '');

      const retainedRes = await execSQL(
        `
          SELECT
            i.id,
            LOWER(COALESCE(i.status, 'pending')) AS invoice_status,
            CASE
              WHEN COALESCE(i.net_amount, 0) > 0.1 THEN COALESCE(i.net_amount, 0)
              ELSE COALESCE(i.total_amount, 0)
            END AS total_amount,
            COALESCE(i.paid_amount, 0) AS paid_amount
          FROM invoices i
          WHERE i.phase_id = ?
            AND (i.active = 1 OR i.active IS NULL)
        `,
        [phaseId]
      );
      const retainedRows = retainedRes.rows._array || [];

      const carryRowsRes = await execSQL(
        `
          WITH direct_carry AS (
            SELECT
              cf.invoice_id,
              cf.source_phase_id,
              cf.target_phase_id,
              cf.created_at,
              1 AS priority
            FROM phase_invoice_carryforwards cf
            WHERE cf.source_phase_id = ?
          ),
          historical_carry AS (
            SELECT
              i.id AS invoice_id,
              ? AS source_phase_id,
              i.phase_id AS target_phase_id,
              COALESCE(op.created_at, i.created_at) AS created_at,
              2 AS priority
            FROM invoices i
            LEFT JOIN operations_log op
              ON op.table_name = 'invoices'
             AND op.record_id = i.id
             AND op.new_values LIKE '%\"phase_id\"%'
             AND op.new_values LIKE '%' || i.phase_id || '%'
            WHERE NOT EXISTS (
              SELECT 1
              FROM phase_invoice_carryforwards cf2
              WHERE cf2.invoice_id = i.id
                AND cf2.source_phase_id = ?
            )
              AND i.phase_id IS NOT NULL
              AND i.phase_id != ?
              AND (i.active = 1 OR i.active IS NULL)
              AND LOWER(COALESCE(i.status, 'pending')) NOT IN ('cancelled', 'canceled')
              AND (
                CASE
                  WHEN COALESCE(i.net_amount, 0) > 0.1 THEN COALESCE(i.paid_amount, 0) < (COALESCE(i.net_amount, 0) - 0.1)
                  ELSE COALESCE(i.paid_amount, 0) < (COALESCE(i.total_amount, 0) - 0.1)
                END
              )
              ${phaseStart ? `AND COALESCE(SUBSTR(i.invoice_date, 1, 10), '') >= '${phaseStart}'` : ''}
              ${phaseEnd ? `AND COALESCE(SUBSTR(i.invoice_date, 1, 10), '') < '${phaseEnd}'` : ''}
              ${nextPhase?.id ? `AND i.phase_id = '${nextPhase.id}'` : ''}
          ),
          combined_carry AS (
            SELECT * FROM direct_carry
            UNION ALL
            SELECT * FROM historical_carry
          ),
          ranked_carry AS (
            SELECT
              cc.*,
              ROW_NUMBER() OVER (
                PARTITION BY cc.invoice_id
                ORDER BY cc.priority ASC, COALESCE(cc.created_at, '') DESC
              ) AS rn
            FROM combined_carry cc
          ),
          last_collection AS (
            SELECT
              c.invoice_id,
              MAX(c.collection_date) AS last_collection_date
            FROM collections c
            WHERE (c.active = 1 OR c.active IS NULL)
              AND LOWER(COALESCE(c.status, 'pending')) NOT IN ('rejected', 'cancelled', 'canceled', 'deleted')
            GROUP BY c.invoice_id
          )
          SELECT
            i.id,
            COALESCE(i.invoice_number, '—') AS invoice_number,
            COALESCE(pos.name, '—') AS pos_name,
            LOWER(COALESCE(i.status, 'pending')) AS invoice_status,
            COALESCE(i.approved_amount, 0) AS approved_amount,
            CASE
              WHEN COALESCE(i.net_amount, 0) > 0.1 THEN COALESCE(i.net_amount, 0)
              ELSE COALESCE(i.total_amount, 0)
            END AS total_amount,
            COALESCE(i.paid_amount, 0) AS total_paid,
            MAX(
              0,
              (CASE
                WHEN COALESCE(i.net_amount, 0) > 0.1 THEN COALESCE(i.net_amount, 0)
                ELSE COALESCE(i.total_amount, 0)
              END) - COALESCE(i.paid_amount, 0)
            ) AS remaining_amount,
            COALESCE(SUBSTR(i.invoice_date, 1, 10), '—') AS invoice_date,
            COALESCE(SUBSTR(lc.last_collection_date, 1, 10), '—') AS last_collection_date,
            COALESCE(u.name, '—') AS agent_name,
            COALESCE(source_phase.name, ?) AS source_phase_name,
            COALESCE(target_phase.name, '—') AS destination_phase_name
          FROM ranked_carry rc
          JOIN invoices i ON i.id = rc.invoice_id
          LEFT JOIN pos_customers pos ON pos.id = i.pos_id
          LEFT JOIN users u ON u.id = i.agent_id
          LEFT JOIN phases source_phase ON source_phase.id = rc.source_phase_id
          LEFT JOIN phases target_phase ON target_phase.id = rc.target_phase_id
          LEFT JOIN last_collection lc ON lc.invoice_id = i.id
          WHERE rc.rn = 1
          ORDER BY i.invoice_date DESC, i.created_at DESC
        `,
        [
          phaseId,
          phaseId,
          phaseId,
          phaseId,
          currentPhase?.name || routePhaseName || 'المرحلة المحددة',
        ]
      );

      const carryRowsRaw = carryRowsRes.rows._array || [];
      const carryRows = carryRowsRaw.map((row) => ({
        ...row,
        approval_status: buildApprovalStatus(row),
        invoice_status_label: invoicePaymentStatusMeta(row.invoice_status).label,
        approval_status_label: invoiceApprovalStatusMeta(buildApprovalStatus(row)).label,
      }));

      const carriedIds = new Set(carryRows.map((row) => row.id));
      const retainedOnlyRows = retainedRows.filter((row) => !carriedIds.has(row.id));
      const fullyPaidInvoices = retainedOnlyRows.filter((row) => row.invoice_status !== 'cancelled' && row.invoice_status !== 'canceled' && Number(row.paid_amount || 0) >= Number(row.total_amount || 0) - 0.1).length;
      const carriedForwardInvoices = carryRows.length;
      const totalInvoices = retainedOnlyRows.length + carriedForwardInvoices;

      // Fetch cancelled invoices
      const cancelledInvsRes = await execSQL(
        `SELECT i.id, i.invoice_number, i.total_amount, i.invoice_date, pos.name AS pos_name, u.name AS agent_name
         FROM invoices i
         LEFT JOIN pos_customers pos ON pos.id = i.pos_id
         LEFT JOIN users u ON u.id = i.agent_id
         WHERE i.phase_id = ? AND LOWER(COALESCE(i.status, '')) IN ('cancelled', 'canceled')
         ORDER BY i.invoice_date DESC`,
        [phaseId]
      );
      const cancelledInvoicesData = cancelledInvsRes.rows._array || [];
      const cancelledInvoicesSum = cancelledInvoicesData.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);

      // Fetch cancelled collections
      const cancelledColsRes = await execSQL(
        `SELECT c.id, c.collection_number, c.amount, c.collection_date, c.method, pos.name AS pos_name, u.name AS agent_name
         FROM collections c
         LEFT JOIN pos_customers pos ON pos.id = c.pos_id
         LEFT JOIN users u ON u.id = c.agent_id
         WHERE c.phase_id = ? AND LOWER(COALESCE(c.status, '')) IN ('cancelled', 'canceled')
         ORDER BY c.collection_date DESC`,
        [phaseId]
      );
      const cancelledCollectionsData = cancelledColsRes.rows._array || [];
      const cancelledCollectionsSum = cancelledCollectionsData.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

      setSummary({
        total_invoices: totalInvoices,
        fully_paid_invoices: fullyPaidInvoices,
        cancelled_invoices: cancelledInvoicesData.length,
        carried_forward_invoices: carriedForwardInvoices,
        efficiency_rate: totalInvoices > 0 ? Number(((fullyPaidInvoices / totalInvoices) * 100).toFixed(1)) : 0,
      });
      setCancelledData({
        invoices: cancelledInvoicesData,
        invoicesSum: cancelledInvoicesSum,
        collections: cancelledCollectionsData,
        collectionsSum: cancelledCollectionsSum
      });
      setRows(carryRows);
    } finally {
      setLoading(false);
    }
  }, [currentPhase, phaseId, phaseOptions, routePhaseName]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 56, paddingHorizontal: 12, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {phaseOptions.map((phase) => {
            const active = phaseId === phase.id;
            return (
              <TouchableOpacity
                key={phase.id}
                onPress={() => setPhaseId(phase.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: active ? colors.primary : colors.bg2,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border + '40',
                }}
              >
                <Text style={{ color: active ? '#fff' : colors.t2, fontSize: 11, fontWeight: '800' }}>{phase.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
        <Text style={{ color: colors.t1, fontSize: 16, fontWeight: '900', textAlign: 'right', marginBottom: 10 }}>ملخص المرحلة</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          <View style={cardStyles(colors, colors.blue + '35')}>
            <Text style={{ color: colors.t3, fontSize: 11, textAlign: 'right' }}>إجمالي الفواتير</Text>
            <Text style={{ color: colors.blue, fontSize: 22, fontWeight: '900', marginTop: 6 }}>{summary.total_invoices}</Text>
          </View>
          <View style={cardStyles(colors, colors.green + '35')}>
            <Text style={{ color: colors.t3, fontSize: 11, textAlign: 'right' }}>الفواتير المسددة بالكامل</Text>
            <Text style={{ color: colors.green, fontSize: 22, fontWeight: '900', marginTop: 6 }}>{summary.fully_paid_invoices}</Text>
          </View>
          <View style={cardStyles(colors, colors.danger ? colors.danger + '35' : '#dc262635')}>
            <Text style={{ color: colors.t3, fontSize: 11, textAlign: 'right' }}>الفواتير الملغاة</Text>
            <Text style={{ color: colors.danger || '#dc2626', fontSize: 22, fontWeight: '900', marginTop: 6 }}>{summary.cancelled_invoices}</Text>
          </View>
          <View style={cardStyles(colors, '#d9770635')}>
            <Text style={{ color: colors.t3, fontSize: 11, textAlign: 'right' }}>الفواتير المرحلة</Text>
            <Text style={{ color: '#d97706', fontSize: 22, fontWeight: '900', marginTop: 6 }}>{summary.carried_forward_invoices}</Text>
          </View>
          <View style={cardStyles(colors, colors.primary + '35')}>
            <Text style={{ color: colors.t3, fontSize: 11, textAlign: 'right' }}>نسبة الكفاءة</Text>
            <Text style={{ color: colors.primary, fontSize: 22, fontWeight: '900', marginTop: 6 }}>{summary.efficiency_rate}%</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ color: colors.t1, fontSize: 16, fontWeight: '900' }}>الفواتير المرحلة إلى المرحلة التالية</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="corner-up-left" size={14} color={colors.t3} />
            <Text style={{ color: colors.t3, fontSize: 11 }}>{rows.length} فاتورة</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.t3, textAlign: 'center' }}>لا توجد فواتير مرحلة من هذه المرحلة.</Text>
          </View>
        ) : (
          <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator style={{ maxHeight: 520 }}>
              <View>
                <View style={{ flexDirection: 'row', backgroundColor: '#1e3a5f' }}>
                  {CARRY_COLS.map((col) => (
                    <View
                      key={col.key}
                      style={{
                        width: col.w,
                        padding: 9,
                        borderRightWidth: 1,
                        borderRightColor: 'rgba(255,255,255,0.1)',
                        borderBottomWidth: 2,
                        borderBottomColor: '#3b82f6',
                      }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '900', color: '#e2e8f0', textAlign: 'right' }}>{col.label}</Text>
                    </View>
                  ))}
                </View>

                <ScrollView showsVerticalScrollIndicator style={{ maxHeight: 460 }}>
                  {rows.map((row, ri) => (
                    <View
                      key={row.id}
                      style={{
                        flexDirection: 'row',
                        backgroundColor: ri % 2 === 0 ? colors.card : colors.bg2,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border + '25',
                      }}
                    >
                      {CARRY_COLS.map((col) => (
                        <CarryCell key={col.key} col={col} value={row[col.key]} colors={colors} />
                      ))}
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        )}

        {/* --- الفواتير الملغية --- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 24 }}>
          <Text style={{ color: colors.danger || '#dc2626', fontSize: 16, fontWeight: '900' }}>الفواتير الملغية</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.danger || '#dc2626', fontSize: 11, fontWeight: '700' }}>
              {cancelledData.invoices.length} فاتورة ({formatCurrency(cancelledData.invoicesSum)})
            </Text>
          </View>
        </View>

        {cancelledData.invoices.length === 0 ? (
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.t3, textAlign: 'center' }}>لا توجد فواتير ملغية في هذه المرحلة.</Text>
          </View>
        ) : (
          <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator style={{ maxHeight: 300 }}>
              <View>
                <View style={{ flexDirection: 'row', backgroundColor: '#1e3a5f' }}>
                  {[{ key: 'num', l: 'رقم الفاتورة', w: 120 }, { key: 'pos', l: 'نقطة البيع', w: 140 }, { key: 'amt', l: 'الإجمالي', w: 110 }, { key: 'dt', l: 'التاريخ', w: 105 }, { key: 'agt', l: 'المندوب', w: 120 }].map((col) => (
                    <View key={col.key} style={{ width: col.w, padding: 9, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)', borderBottomWidth: 2, borderBottomColor: colors.danger || '#dc2626' }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: '#e2e8f0', textAlign: 'right' }}>{col.l}</Text>
                    </View>
                  ))}
                </View>
                <ScrollView showsVerticalScrollIndicator style={{ maxHeight: 240 }}>
                  {cancelledData.invoices.map((row, ri) => (
                    <View key={row.id} style={{ flexDirection: 'row', backgroundColor: ri % 2 === 0 ? colors.card : colors.bg2, borderBottomWidth: 1, borderBottomColor: colors.border + '25' }}>
                      <CarryCell col={{ key: 'invoice_number', w: 120 }} value={row.invoice_number} colors={colors} />
                      <CarryCell col={{ key: 'pos_name', w: 140 }} value={row.pos_name} colors={colors} />
                      <CarryCell col={{ key: 'total_amount', w: 110 }} value={row.total_amount} colors={colors} />
                      <CarryCell col={{ key: 'invoice_date', w: 105 }} value={String(row.invoice_date || '').slice(0, 10)} colors={colors} />
                      <CarryCell col={{ key: 'agent_name', w: 120 }} value={row.agent_name} colors={colors} />
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        )}

        {/* --- التحصيلات الملغية --- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 24 }}>
          <Text style={{ color: colors.danger || '#dc2626', fontSize: 16, fontWeight: '900' }}>التحصيلات الملغية</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.danger || '#dc2626', fontSize: 11, fontWeight: '700' }}>
              {cancelledData.collections.length} تحصيل ({formatCurrency(cancelledData.collectionsSum)})
            </Text>
          </View>
        </View>

        {cancelledData.collections.length === 0 ? (
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.t3, textAlign: 'center' }}>لا توجد تحصيلات ملغية في هذه المرحلة.</Text>
          </View>
        ) : (
          <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator style={{ maxHeight: 300 }}>
              <View>
                <View style={{ flexDirection: 'row', backgroundColor: '#1e3a5f' }}>
                  {[{ key: 'num', l: 'رقم التحصيل', w: 120 }, { key: 'pos', l: 'نقطة البيع', w: 140 }, { key: 'amt', l: 'المبلغ', w: 110 }, { key: 'dt', l: 'التاريخ', w: 105 }, { key: 'meth', l: 'الطريقة', w: 100 }, { key: 'agt', l: 'المندوب', w: 120 }].map((col) => (
                    <View key={col.key} style={{ width: col.w, padding: 9, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)', borderBottomWidth: 2, borderBottomColor: colors.danger || '#dc2626' }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: '#e2e8f0', textAlign: 'right' }}>{col.l}</Text>
                    </View>
                  ))}
                </View>
                <ScrollView showsVerticalScrollIndicator style={{ maxHeight: 240 }}>
                  {cancelledData.collections.map((row, ri) => (
                    <View key={row.id} style={{ flexDirection: 'row', backgroundColor: ri % 2 === 0 ? colors.card : colors.bg2, borderBottomWidth: 1, borderBottomColor: colors.border + '25' }}>
                      <CarryCell col={{ key: 'collection_number', w: 120 }} value={row.collection_number} colors={colors} />
                      <CarryCell col={{ key: 'pos_name', w: 140 }} value={row.pos_name} colors={colors} />
                      <CarryCell col={{ key: 'total_amount', w: 110 }} value={row.amount} colors={colors} />
                      <CarryCell col={{ key: 'collection_date', w: 105 }} value={String(row.collection_date || '').slice(0, 10)} colors={colors} />
                      <CarryCell col={{ key: 'method', w: 100 }} value={row.method === 'cash' ? 'نقدي' : row.method === 'transfer' ? 'تحويل' : row.method === 'check' ? 'شيك' : row.method} colors={colors} />
                      <CarryCell col={{ key: 'agent_name', w: 120 }} value={row.agent_name} colors={colors} />
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function CarryCell({ col, value, colors }) {
  const border = colors.border + '35';
  const moneyKeys = ['total_amount', 'total_paid', 'remaining_amount'];

  if (moneyKeys.includes(col.key)) {
    const n = parseFloat(value) || 0;
    const color = col.key === 'remaining_amount' && n > 0 ? '#dc2626'
      : col.key === 'total_paid' ? '#16a34a'
      : colors.t1;
    return (
      <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center', alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color }}>{formatCurrency(n)}</Text>
      </View>
    );
  }

  return (
    <View style={{ width: col.w, padding: 6, borderRightWidth: 1, borderRightColor: border, justifyContent: 'center' }}>
      <Text style={{ fontSize: 10, color: value && value !== '—' ? colors.t1 : colors.t3, textAlign: 'right' }} numberOfLines={1}>
        {value ?? '—'}
      </Text>
    </View>
  );
}
