import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useTheme } from '../theme';
import { getLocalInvoices, subscribeDataChanges } from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Badge, Loading, Empty, Row, ScreenHeader } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';

export default function InvoicesScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, spacing, radius, fontSize, shadow, isDark } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');

  const load = useCallback(async (quiet = false) => {
    const filters = tab !== 'all' ? { status: tab } : {};
    if (user?.role === 'agent') filters.agent_id = user.id;
    const data = await getLocalInvoices(filters);
    setInvoices(data);
    if (!quiet) setLoading(false);
    setRefreshing(false);
  }, [tab, user]);

  useEffect(() => {
    setLoading(true); load();
    const unsub = subscribeDataChanges(e => { if (['invoices', 'all', 'sync_queue'].includes(e.type)) load(true); });
    return unsub;
  }, [load]);

  const visibleInvoices = invoices.filter(inv => {
    if (user?.role === 'agent') {
      const net = inv.net_amount || inv.total_amount || 0;
      const isFullyApproved = (inv.approved_amount || 0) >= (net - 0.1) && net > 0;
      if (isFullyApproved) return false;
    }
    return true;
  });

  const filtered = visibleInvoices.filter(inv => !search || JSON.stringify(inv).toLowerCase().includes(search.toLowerCase()));
  const total = visibleInvoices.reduce((s, i) => s + (i.net_amount || i.total_amount || 0), 0);
  const paid = visibleInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.net_amount || i.total_amount || 0), 0);

  return (
    <View style={s.screen}>
      <ScreenHeader
        kpis={[
          { label: 'الإجمالي', value: formatCurrency(total), color: colors.cyan },
          { label: 'مسدد', value: formatCurrency(paid), color: colors.green },
          { label: 'العدد', value: invoices.length, color: colors.t1 },
        ]}
        tabs={[
          { k: 'all', l: 'الكل' },
          { k: 'pending', l: 'معلقة' },
          { k: 'paid', l: 'مسددة' },
          { k: 'overdue', l: 'متأخرة' },
        ]}
        activeTab={tab} onTabSelect={setTab} search={search} onSearch={setSearch}
        searchPlaceholder="بحث بالرقم أو العميل..."
        action="+ فاتورة" onAction={() => navigation.push('NewInvoice')}
      />

      {loading ? <Loading /> : filtered.length === 0
        ? <Empty icon="🧾" title="لا توجد فواتير" action="+ فاتورة جديدة" onAction={() => navigation.navigate('NewInvoice')} />
        : <FlatList
          data={filtered} keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
          renderItem={({ item: inv }) => {
            const net = inv.net_amount || inv.total_amount || 0;
            const isFullyApproved = (inv.approved_amount || 0) >= (net - 0.1) && net > 0;
            const isPaidPending = inv.status === 'paid' && !isFullyApproved;

            return (
              <TouchableOpacity style={[s.invCard, { flexDirection: 'column', alignItems: 'stretch' }]} activeOpacity={0.85} onPress={() => navigation.navigate('InvoiceDetail', { id: inv.id })}>
                <Row style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={s.invCardLeft}>
                    <View style={s.invNumRow}>
                      <Text style={s.invNum}>{inv.invoice_number}</Text>
                      {inv.synced == 0 && <View style={s.syncDot}><Text style={{ fontSize: 8, color: colors.orange }}>●</Text></View>}
                    </View>
                    <Text style={s.invPos}>{inv.pos_name || '—'}</Text>
                    <Text style={s.invMeta}>{inv.agent_name || '—'} · {formatDateShort(inv.invoice_date)}</Text>
                  </View>
                  <View style={s.invCardRight}>
                    <Text style={s.invAmt}>{formatCurrency(inv.net_amount || inv.total_amount)}</Text>
                    <Row style={{ gap: 5, marginTop: 4 }}>
                      <Badge status={inv.status} />
                      {isFullyApproved && <Badge status="approved" label="معتمدة ✅" color={colors.green} />}
                      {isPaidPending && <Badge status="pending" label="الاعتماد ⏳" color={colors.orange} />}
                    </Row>
                  </View>
                </Row>
                {inv.miniature_items && (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 9.5, color: isDark ? '#ffffff' : colors.blue, opacity: isDark ? 0.9 : 1 }}>{inv.miniature_items}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      }
    </View>
  );
}
