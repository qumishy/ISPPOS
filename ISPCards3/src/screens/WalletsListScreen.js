import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, RefreshControl, Alert, ScrollView, Modal, TextInput, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import {
  getAgentWalletsDetailed, subscribeDataChanges, transferAgentWalletToStorage
} from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, Row, ProgressBar, ScreenHeader } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';

export default function WalletsScreen({ navigation }) {
  const { user, can } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedAgent, setExpandedAgent] = useState(null);

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [returnQty, setReturnQty] = useState('');

  const load = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const data = await getAgentWalletsDetailed();
      setWallets(data || []);
    } catch (e) {
      console.log('WALLETS LOAD ERROR:', e);
    } finally {
      if (!quiet) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeDataChanges(e => {
      if (['agent_wallets', 'batches', 'all'].includes(e.type)) load(true);
    });
    return unsub;
  }, [load]);

  const grouped = {};
  wallets.forEach(w => {
    if (!grouped[w.agent_id]) {
      grouped[w.agent_id] = { agent_name: w.agent_name, agent_id: w.agent_id, items: [] };
    }
    grouped[w.agent_id].items.push(w);
  });

  const agents = Object.values(grouped).filter(
    g => !search || g.agent_name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalRemaining = wallets.reduce((sm, w) => sm + (w.remaining_cards || 0), 0);
  const totalSold = wallets.reduce((sm, w) => sm + (w.sold_cards || 0), 0);
  const totalCards = wallets.reduce((sm, w) => sm + (w.total_cards || 0), 0);

  const handleReturn = (wallet) => {
    setSelectedWallet(wallet);
    setReturnQty(String(wallet.remaining_cards || 0));
    setShowReturnModal(true);
  };

  const confirmReturn = async () => {
    if (!selectedWallet) return;
    const qty = parseInt(returnQty, 10);
    if (!qty || qty <= 0) return Alert.alert('تنبيه', 'يرجى إدخال عدد صحيح أكبر من صفر');
    if (qty > (selectedWallet.remaining_cards || 0)) return Alert.alert('تنبيه', `لا يمكن استرجاع أكثر من ${selectedWallet.remaining_cards} ورقة`);
    try {
      const result = await transferAgentWalletToStorage(selectedWallet.id, qty);
      setShowReturnModal(false);
      setSelectedWallet(null);
      Alert.alert('✅ تم', `تم استرجاع ${result.returnedQty} ورقة بنجاح`);
      load();
    } catch (e) {
      Alert.alert('خطأ', e.message || 'حدث خطأ أثناء الاسترجاع');
    }
  };

  return (
    <View style={s.screen}>
      <Modal visible={showReturnModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, padding: 24, borderRadius: radius.lg }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 6, color: colors.t1, textAlign: 'center' }}>🔙 استرجاع أوراق</Text>
            {selectedWallet && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: colors.t3, textAlign: 'center' }}>{selectedWallet.agent_name} — {selectedWallet.category_name}</Text>
                <View style={{ backgroundColor: colors.orange + '15', padding: 10, borderRadius: radius.md, marginTop: 6 }}><Text style={{ fontSize: 14, fontWeight: '800', color: colors.orange, textAlign: 'center' }}>المتبقي: {selectedWallet.remaining_cards}</Text></View>
              </View>
            )}
            <TextInput style={{ backgroundColor: colors.bg2, padding: 14, borderRadius: radius.md, fontSize: 22, fontWeight: '900', textAlign: 'center', color: colors.t1, borderWidth: 1.5, borderColor: colors.blue + '40' }} value={returnQty} onChangeText={setReturnQty} keyboardType="numeric" />
            <Row style={{ gap: 10, marginTop: 20 }}>
              <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => { setShowReturnModal(false); setSelectedWallet(null); }} />
              <Btn label="تأكيد الاسترجاع" variant="danger" style={{ flex: 1 }} onPress={confirmReturn} />
            </Row>
          </View>
        </View>
      </Modal>

      <ScreenHeader
        kpis={[{ label: 'مناديب', value: agents.length, color: colors.blue },{ label: 'إجمالي', value: totalCards, color: colors.t1 },{ label: 'مباع', value: totalSold, color: colors.orange },{ label: 'متبقي', value: totalRemaining, color: colors.green },]}
        search={search} onSearch={setSearch}
        searchPlaceholder="بحث باسم المندوب..."
        action={can('canManageWallets') ? '+ توزيع' : undefined}
        onAction={() => navigation.push('AssignWallet')}
      />

      {loading ? <Loading /> : agents.length === 0
        ? <Empty icon="👜" title="لا توجد بيانات محافظ" />
        : <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}>
          {agents.map(agent => {
            const isExpanded = expandedAgent === agent.agent_id;
            const agentTotal = agent.items.reduce((sm, w) => sm + (w.total_cards || 0), 0);
            const agentSold = agent.items.reduce((sm, w) => sm + (w.sold_cards || 0), 0);
            const agentRemaining = agent.items.reduce((sm, w) => sm + (w.remaining_cards || 0), 0);
            const agentPct = agentTotal > 0 ? (agentSold / agentTotal) * 100 : 0;

            return (
              <View key={agent.agent_id} style={[s.colCard, { marginBottom: spacing.md }]}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => setExpandedAgent(isExpanded ? null : agent.agent_id)} style={s.colCardTop}>
                  <View style={{ flex: 1 }}><Text style={[s.colNum, { fontSize: 16 }]}>👤 {agent.agent_name}</Text></View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={{ backgroundColor: colors.blue + '18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md }}><Text style={{ fontSize: 18, fontWeight: '900', color: colors.blue }}>{agentRemaining}</Text></View>
                    <Text style={{ fontSize: 16, color: colors.t3 }}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </TouchableOpacity>

                <View style={[s.walStats, { marginVertical: 10 }]}>
                  {[{ l: 'إجمالي', v: agentTotal, c: colors.t1 }, { l: 'مباع 🔥', v: agentSold, c: colors.orange }, { l: 'متبقي', v: agentRemaining, c: colors.green }].map((st, i) => (
                    <View key={i} style={{ alignItems: 'center', flex: 1 }}><Text style={{ fontSize: fontSize.xs, color: colors.t3 }}>{st.l}</Text><Text style={{ fontSize: 18, fontWeight: '900', color: st.c }}>{st.v}</Text></View>
                  ))}
                </View>
                <ProgressBar percent={agentPct} color={colors.blue} height={5} />

                <TouchableOpacity onPress={() => navigation.navigate('WalletDetail', { agentId: agent.agent_id, name: agent.agent_name })} style={{ marginTop: 10, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.blue + '12', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.blue }}>📄 عرض تفاصيل المبيعات</Text>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={{ marginTop: 12 }}>
                    <View style={s.colDivider} />
                    {agent.items.map((w, idx) => (
                      <View key={w.id} style={{ backgroundColor: colors.bg2, borderRadius: radius.md, padding: spacing.md, marginTop: 10 }}>
                        <Row style={{ gap: 8, marginBottom: 6 }}><Badge status={w.category_name} /><Text style={{ fontSize: 13, fontWeight: '800' }}>دفعة: {w.batch_number}</Text></Row>
                        <Text style={{ fontSize: 11, color: colors.t3 }}>📋 تسليم: {formatDateShort(w.created_at)}</Text>
                        <View style={[s.batchStats, { backgroundColor: colors.card, borderRadius: radius.md, overflow: 'hidden', marginTop: 10 }]}>
                          {[{ l: 'الإجمالي', v: w.total_cards, c: colors.t1, bg: colors.blue + '08' }, { l: 'المباع', v: w.sold_cards || 0, c: colors.orange, bg: colors.orange + '08' }, { l: 'المتبقي', v: w.remaining_cards, c: colors.green, bg: colors.green + '08' }].map((st, i) => (
                            <View key={i} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: st.bg }}><Text style={{ fontSize: 10, color: colors.t3 }}>{st.l}</Text><Text style={{ fontSize: 16, fontWeight: '900', color: st.c }}>{st.v}</Text></View>
                          ))}
                        </View>
                        {can('canManageWallets') && (w.remaining_cards || 0) > 0 && (
                          <Btn label={`🔙 استرجاع ${w.remaining_cards} ورقة`} variant="danger" size="lg" style={{ marginTop: 12 }} onPress={() => handleReturn(w)} />
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      }
    </View>
  );
}
