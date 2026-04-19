import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Alert, RefreshControl } from 'react-native';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import { getLocalCollections, approveLocalCollection } from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, Row, ScreenHeader } from '../components/UI';
import { makeStyles } from '../styles/cashier.styles';

export default function CashierScreen() {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const { user } = useAuth();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [tab, setTab] = useState('pending');
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    let data = await getLocalCollections();
    // Hide supplied collections from the Cashier Approval screen entirely, for all roles
    data = data.filter(c => !c.supply_id || String(c.supply_id).trim() === '');
    
    // Cashiers should not see collections approved by other cashiers/admins
    if (user?.role === 'cashier') {
      data = data.filter(c => c.status !== 'approved' || c.approved_by === user.id);
    }

    setCols(data); setLoading(false); setRefreshing(false);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const pending  = cols.filter(c => c.status === 'pending');
  const approved = cols.filter(c => c.status === 'approved');
  const rejected = cols.filter(c => c.status === 'rejected');
  const display  = tab === 'pending' ? pending : tab === 'approved' ? approved : tab === 'rejected' ? rejected : cols;

  const totalPending  = pending.reduce((s, c) => s + (c.amount || 0), 0);
  const totalApproved = approved.reduce((s, c) => s + (c.amount || 0), 0);

  const handleApprove = (id, amount) => Alert.alert(
    'اعتماد التحصيل',
    `هل أنت متأكد من الاعتماد؟\nالمبلغ: ${formatCurrency(amount)}`,
    [
      { text: 'إلغاء', style: 'cancel' },
      { text: '✅ نعم اعتماد', onPress: async () => { await approveLocalCollection(id, '', user?.id || null); load(); } },
    ]
  );
  const methodLabel = m => ({ cash: 'نقدي 💵', transfer: 'تحويل 🏦', check: 'شيك 📝' }[m] || m);

  const filtered = display.filter(col => !search || Object.values(col).some(v => String(v).toLowerCase().includes(search.toLowerCase())));

  if (loading) return <Loading />;

  return (
    <View style={s.screen}>
      <ScreenHeader
        kpis={[
          { label: 'قبوض معلقة',    value: pending.length,            color: colors.orange },
          { label: 'مبلغ المعلق',   value: formatCurrency(totalPending),  color: colors.orange },
          { label: 'إجمالي المحصّل', value: formatCurrency(totalApproved), color: colors.green  },
        ]}
        tabs={[
          { k: 'pending',  l: `معلقة (${pending.length})`  },
          { k: 'approved', l: `معتمدة (${approved.length})` },
          { k: 'rejected', l: `مرفوضة (${rejected.length})` },
          { k: 'all',      l: `الكل (${cols.length})`      },
        ]}
        activeTab={tab} onTabSelect={setTab} search={search} onSearch={setSearch}
        searchPlaceholder="بحث بالرقم أو الاسم..."
      />

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
      >
        {filtered.length === 0
          ? <Empty icon={tab === 'pending' ? '✅' : '💰'} title={tab === 'pending' ? 'لا توجد قبوض معلقة' : 'لا توجد تحصيلات'} />
          : filtered.map(col => (
            <View key={col.id} style={s.card}>
              <Row style={s.cardTop}>
                <Text style={s.num}>{col.collection_number}</Text>
                <Text style={s.date}>{formatDateShort(col.collection_date)}</Text>
                <Badge status={col.status} />
              </Row>
              <Text style={s.amount}>{formatCurrency(col.amount)}</Text>
              <View style={s.grid}>
                <View style={s.gi}><Text style={s.gl}>المندوب</Text><Text style={s.gv}>{col.agent_name || '—'}</Text></View>
                <View style={s.gi}><Text style={s.gl}>نقطة البيع</Text><Text style={s.gv}>{col.pos_name || '—'}</Text></View>
                <View style={s.gi}><Text style={s.gl}>الطريقة</Text><Text style={s.gv}>{methodLabel(col.method)}</Text></View>
                {col.invoice_number && <View style={s.gi}><Text style={s.gl}>الفاتورة</Text><Text style={[s.gv, { color: colors.blue }]}>{col.invoice_number}</Text></View>}
                {col.status === 'approved' && col.approver_name && (
                  <View style={[s.gi, { borderLeftWidth: 1, borderLeftColor: colors.orange + '30', paddingLeft: 8 }]}>
                    <Text style={[s.gl, { color: colors.orange }]}>المحاسب المعتمد</Text>
                    <Text style={[s.gv, { fontWeight: 'bold' }]}>{col.approver_name}</Text>
                    {col.approved_at && <Text style={{ fontSize: 9, color: colors.t3 }}>📅 {formatDateShort(col.approved_at)}</Text>}
                  </View>
                )}
              </View>
              {!!col.notes && <Text style={s.notes}>📝 ملاحظات: {col.notes}</Text>}
              {col.status === 'rejected' && col.rejection_reason && <Text style={s.rejection}>سبب الرفض: {col.rejection_reason}</Text>}
              {col.status === 'pending' && (
                <Row style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  <Btn label="✅ اعتماد" variant="success" size="sm" style={{ flex: 1 }} onPress={() => handleApprove(col.id, col.amount)} />
                </Row>
              )}
            </View>
          ))
        }
      </ScrollView>
    </View>
  );
}
