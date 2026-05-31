import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, RefreshControl, Alert, ScrollView, Modal, TextInput, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import {
  getAgentWalletsDetailed, subscribeDataChanges, transferAgentWalletToStorage
} from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, Row, ProgressBar, ScreenHeader } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';

export default function WalletsScreen({ navigation }) {
  const { user, can, selectedPhase, projectId } = useAuth();
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
      if (!projectId) return;
      if (!quiet && wallets.length === 0) setLoading(true);

      const phaseId = selectedPhase ? selectedPhase.id : null;
      const data = await getAgentWalletsDetailed(projectId, phaseId);
      setWallets(data || []);
    } catch (e) {
      console.log('WALLETS LOAD ERROR:', e);
    } finally {
      if (!quiet) setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPhase, projectId, wallets.length]);

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

  const stats = agents.reduce((acc, a) => {
    const aTotal = a.items.reduce((sm, w) => sm + (w.total_cards || 0), 0);
    const aSold = a.items.reduce((sm, w) => sm + (w.sold_cards || 0), 0);
    const aRem = a.items.reduce((sm, w) => sm + (w.remaining_cards || 0), 0);
    acc.total += aTotal;
    acc.sold += aSold;
    acc.rem += aRem;
    return acc;
  }, { total: 0, sold: 0, rem: 0 });

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
      let remainingToReturn = qty;
      for (const orig of selectedWallet.original_wallets) {
        if (remainingToReturn <= 0) break;
        const availableInOrig = (orig.total_cards || 0) - (orig.sold_cards || 0);
        if (availableInOrig > 0) {
          const toReturnFromOrig = Math.min(availableInOrig, remainingToReturn);
          await transferAgentWalletToStorage(orig.id, toReturnFromOrig, user?.id || null);
          remainingToReturn -= toReturnFromOrig;
        }
      }
      setShowReturnModal(false);
      setSelectedWallet(null);
      Alert.alert('✅ تم', `تم استرجاع ${qty} ورقة بنجاح`);
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
            <Row style={{ alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
              <Feather name="corner-down-left" size={20} color={colors.t1} />
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.t1, textAlign: 'center' }}>استرجاع أوراق</Text>
            </Row>
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
        kpis={[
          { label: 'المناديب', value: agents.length, color: colors.blue },
          { label: 'إجمالي الأوراق', value: stats.total, color: colors.t1 },
          { label: 'المباع', value: stats.sold, color: colors.orange },
          { label: 'المتبقي', value: stats.rem, color: colors.success },
        ]}
        search={search} onSearch={setSearch}
        searchPlaceholder="بحث باسم المندوب..."
        action={selectedPhase?.status !== 'closed' && can('canManageWallets') ? '+ توزيع جديد' : undefined}
        onAction={selectedPhase?.status !== 'closed' ? () => navigation.push('AssignWallet') : undefined}
      />

      {selectedPhase?.status === 'closed' && (
        <View style={{ backgroundColor: colors.danger + '15', padding: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="lock" size={14} color={colors.danger} />
          <Text style={{ fontSize: 12, color: colors.danger, fontWeight: 'bold' }}>عرض محافظ المرحلة المغلقة: {selectedPhase.name} (قراءة فقط)</Text>
        </View>
      )}

      {loading ? <Loading /> : agents.length === 0
        ? <Empty icon="briefcase" title="لا توجد بيانات محافظ" />
        : (
          <ScrollView
            contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
          >
            {agents.map(agent => {
              const isExpanded = expandedAgent === agent.agent_id;
              const agentTotal = agent.items.reduce((sm, w) => sm + (w.total_cards || 0), 0);
              const agentSold = agent.items.reduce((sm, w) => sm + (w.sold_cards || 0), 0);
              const agentRemaining = agent.items.reduce((sm, w) => sm + (w.remaining_cards || 0), 0);
              const agentPct = agentTotal > 0 ? (agentSold / agentTotal) * 100 : 0;

              return (
                <TouchableOpacity
                  key={agent.agent_id}
                  style={[s.batchCard, { 
                    padding: spacing.md, 
                    borderRadius: radius.lg, 
                    marginBottom: spacing.md, 
                    elevation: 2,
                    borderBottomWidth: 3,
                    borderBottomColor: colors.border + '50'
                  }]}
                  activeOpacity={0.85}
                  onPress={() => setExpandedAgent(isExpanded ? null : agent.agent_id)}
                >
                  {/* ── COLLAPSED: Agent Info ── */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center' }}>
                        <Feather name="user" size={20} color={colors.primary} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.t1 }}>{agent.agent_name}</Text>
                        <Text style={{ fontSize: 11, color: colors.t3 }}>{agent.items.length} أصناف في المحفظة</Text>
                      </View>
                    </View>
                    <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.t3} />
                  </View>

                  {/* Stat strip: total / sold / remaining */}
                  <View style={{ flexDirection: 'row', backgroundColor: colors.bg2, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border + '20' }}>
                    {[
                      { l: 'الإجمالي', v: agentTotal, c: colors.t1, bg: colors.primary + '03' },
                      { l: 'المباع', v: agentSold, c: colors.orange, bg: colors.orange + '03' },
                      { l: 'المتبقي', v: agentRemaining, c: colors.success, bg: colors.success + '03' }
                    ].map((st, i) => (
                      <View key={i} style={{ flex: 1, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: st.bg, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: colors.border + '20' }}>
                        <Text style={{ fontSize: 9, color: colors.t3, fontWeight: '700' }}>{st.l}</Text>
                        <Text style={{ fontSize: 15, fontWeight: '900', color: st.c }}>{st.v}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ marginTop: 6 }}>
                    <ProgressBar percent={agentPct} color={colors.primary} height={4} />
                  </View>

                  {/* ── EXPANDED: Category details ── */}
                  {isExpanded && (
                    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border + '15', paddingTop: 12 }}>
                      <TouchableOpacity onPress={() => navigation.navigate('WalletDetail', { agentId: agent.agent_id, name: agent.agent_name })} style={{ marginBottom: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.primary + '10', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                        <Feather name="list" size={14} color={colors.primary} />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>عرض تفاصيل المبيعات للمندوب</Text>
                      </TouchableOpacity>

                      {Object.values(agent.items.reduce((acc, w) => {
                        const k = w.batch_id || w.id;
                        if (!acc[k]) acc[k] = { ...w, total_cards: 0, sold_cards: 0, remaining_cards: 0, original_wallets: [], assignments_count: 0 };
                        acc[k].total_cards += (w.total_cards || 0);
                        acc[k].sold_cards += (w.sold_cards || 0);
                        acc[k].remaining_cards += (w.remaining_cards || 0);
                        acc[k].original_wallets.push(w);
                        acc[k].assignments_count += 1;
                        return acc;
                      }, {})).map((w, idx) => {
                        const itemPct = w.total_cards > 0 ? (w.sold_cards / w.total_cards) * 100 : 0;
                        return (
                          <View key={w.id || idx} style={{ marginBottom: 12, backgroundColor: colors.bg2, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border + '10' }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Badge status={w.category_name} style={{ paddingVertical: 2 }} />
                                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.t1 }}>{w.batch_number}</Text>
                              </View>
                              {selectedPhase?.status !== 'closed' && can('canManageWallets') && (w.remaining_cards || 0) > 0 && (
                                <TouchableOpacity onPress={() => handleReturn(w)} style={{ backgroundColor: colors.danger + '10', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 10, color: colors.danger, fontWeight: 'bold' }}>استرجاع</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                              <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: 9, color: colors.t3 }}>الإجمالي</Text><Text style={{ fontSize: 13, fontWeight: '800', color: colors.t1 }}>{w.total_cards}</Text></View>
                              <View style={{ flex: 1, alignItems: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border + '20' }}><Text style={{ fontSize: 9, color: colors.t3 }}>المباع</Text><Text style={{ fontSize: 13, fontWeight: '800', color: colors.orange }}>{w.sold_cards}</Text></View>
                              <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: 9, color: colors.t3 }}>المتبقي</Text><Text style={{ fontSize: 13, fontWeight: '800', color: colors.success }}>{w.remaining_cards}</Text></View>
                            </View>
                            <ProgressBar percent={itemPct} color={colors.orange} height={2} />
                          </View>
                        );
                      })}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
    </View>
  );
}
