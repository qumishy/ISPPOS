import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  backfillOperationsFromSyncQueue,
  getPendingOfflineOperationsForUser,
  getGeneralOperationsLog,
  getRoleArabicLabel,
  subscribeDataChanges,
} from '../services/database';
import { isOnline, retryFailedSyncQueueRecord, syncNow } from '../services/SyncService';
import { formatDateShort } from '../utils/helpers';
import { Badge, Btn, Empty, Loading } from '../components/UI';
import { makeStyles } from '../styles/main.styles';

const STATUS_AR = {
  pending: 'معلقة',
  syncing: 'جاري المزامنة',
  synced: 'تمت المزامنة',
  failed: 'فشلت',
};

export default function OperationsScreen() {
  const { user, projectId, selectedPhase, canAccess } = useAuth();
  const { colors, spacing, radius, fontSize, shadow, fontFamily: ff } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [tab, setTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [pendingOps, setPendingOps] = useState([]);
  const [generalOps, setGeneralOps] = useState([]);
  const [search, setSearch] = useState('');
  const loadInFlightRef = useRef(false);
  const reloadTimerRef = useRef(null);

  const canViewGeneralLog = useMemo(() => {
    if (user?.role === 'admin' || user?.role === 'manager') return true;
    return canAccess?.('Admin') === true;
  }, [user?.role, canAccess]);

  const load = useCallback(async (opts = {}) => {
    if (loadInFlightRef.current) return;
    if (!user?.id) return;
    const soft = !!opts.soft;
    if (soft) setRefreshing(true);
    else setLoading(true);
    loadInFlightRef.current = true;
    try {
      await backfillOperationsFromSyncQueue(300);

      const mine = await getPendingOfflineOperationsForUser(user.id, { projectId });
      const mineRows = mine || [];
      
      const opsByGroup = {};
      for (const o of mineRows) {
        const gid = o.operation_group_id || o.id;
        if (!opsByGroup[gid]) opsByGroup[gid] = [];
        opsByGroup[gid].push(o);
      }

      const pendingList = [];
      for (const gid in opsByGroup) {
        const group = opsByGroup[gid];
        const allSynced = group.every(o => o.sync_status === 'synced');
        if (!allSynced) {
          pendingList.push(...group);
        }
      }

      setPendingOps(pendingList);

      if (canViewGeneralLog) {
        const all = await getGeneralOperationsLog({ projectId, phaseId: selectedPhase?.id || null, limit: 50 });
        setGeneralOps(all || []);
      }
    } catch (e) {
      console.log('OPS LOAD ERROR:', e);
    } finally {
      loadInFlightRef.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, [user?.id, projectId, selectedPhase?.id, canViewGeneralLog]);

  useEffect(() => {
    load();
    const unsub = subscribeDataChanges((e) => {
      if (['operations_log', 'sync_queue', 'all', 'phases'].includes(e.type)) {
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = setTimeout(() => load({ soft: true }), 220);
      }
    });
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      unsub?.();
    };
  }, [load]);

  const pendingCount = pendingOps.filter(o => o.sync_status === 'pending' || o.sync_status === 'syncing').length;
  const failedCount = pendingOps.filter(o => o.sync_status === 'failed').length;
  const syncedCount = generalOps.filter(o => o.sync_status === 'synced').length;

  const statusColor = (status) => {
    if (status === 'failed') return colors.danger;
    if (status === 'pending') return '#F59E0B'; // Orange
    if (status === 'syncing') return colors.primary; // Blue
    if (status === 'synced') return colors.success;
    return colors.t3;
  };

  const data = useMemo(() => {
    if (tab === 'pending') return pendingOps;
    if (!search) return generalOps;
    const lower = search.toLowerCase();
    return generalOps.filter(o => 
      (o.message_ar || '').toLowerCase().includes(lower) || 
      (o.actor_name || '').toLowerCase().includes(lower) || 
      (o.reference_text || '').toLowerCase().includes(lower)
    );
  }, [tab, pendingOps, generalOps, search]);

  const onSyncAll = useCallback(async () => {
    if (!isOnline()) return;
    if (syncingAll || retryingId) return;
    setSyncingAll(true);
    try {
      await syncNow(user);
      await load({ soft: true });
    } finally {
      setSyncingAll(false);
    }
  }, [load, retryingId, syncingAll, user]);

  const onRetryItem = useCallback(async (syncQueueId) => {
    if (!syncQueueId || syncingAll || retryingId) return;
    setRetryingId(syncQueueId);
    try {
      await retryFailedSyncQueueRecord(syncQueueId);
      await load({ soft: true });
    } catch (e) {
      console.log('OPS RETRY ERROR:', e?.message || e);
    } finally {
      setRetryingId(null);
    }
  }, [load, retryingId, syncingAll]);

  const onRetryFailedOnly = useCallback(async () => {
    if (syncingAll || retryingId || !isOnline()) return;
    const failedOps = pendingOps.filter(o => o.sync_status === 'failed');
    if (failedOps.length === 0) return;
    
    setSyncingAll(true);
    try {
      for (const op of failedOps) {
        try {
          await retryFailedSyncQueueRecord(op.sync_queue_id);
        } catch (e) {
          console.log(`Failed to retry op ${op.sync_queue_id}:`, e?.message || e);
        }
      }
      await load({ soft: true });
    } finally {
      setSyncingAll(false);
    }
  }, [pendingOps, syncingAll, retryingId, load]);

  const renderItem = useCallback(({ item }) => {
    const sc = statusColor(item.sync_status);
    const isFailed = item.sync_status === 'failed';
    const isGeneral = tab === 'general';

    if (isGeneral) {
      return (
        <View style={{
          backgroundColor: colors.card,
          borderRadius: radius.md,
          padding: spacing.sm,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: 'row-reverse',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sc }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontFamily: ff?.semiBold || undefined, color: colors.t1, textAlign: 'right' }} numberOfLines={1}>{item.message_ar}</Text>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Text style={{ fontSize: 10, fontFamily: ff?.medium || undefined, color: colors.t3 }}>{item.actor_name}</Text>
                <Text style={{ fontSize: 10, color: colors.t3 }}>•</Text>
                <Text style={{ fontSize: 10, fontFamily: ff?.medium || undefined, color: colors.t3 }}>{formatDateShort(item.created_at)}</Text>
              </View>
            </View>
          </View>
          <View style={{ alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 10, fontFamily: ff?.bold || undefined, color: sc }}>{STATUS_AR[item.sync_status] || item.sync_status}</Text>
            {!!item.reference_text && <Text style={{ fontSize: 10, color: colors.t3, marginTop: 2 }}>{item.reference_text}</Text>}
          </View>
        </View>
      );
    }

    return (
      <View style={{
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        ...shadow.sm,
      }}>
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 14, fontFamily: ff?.bold || undefined, color: colors.t1, textAlign: 'right' }}>{item.message_ar}</Text>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Feather name="activity" size={11} color={colors.t3} />
              <Text style={{ fontSize: 11, fontFamily: ff?.medium || undefined, color: colors.t3 }}>{item.entity_name || 'سجل'}</Text>
              <Text style={{ fontSize: 11, fontFamily: ff?.medium || undefined, color: colors.t3 }}>• {formatDateShort(item.created_at)}</Text>
            </View>
          </View>
          <Badge
            status={item.sync_status}
            label={STATUS_AR[item.sync_status] || item.sync_status}
            color={sc}
            style={{ paddingVertical: 4, paddingHorizontal: 10 }}
          />
        </View>

        <View style={{ height: 1, backgroundColor: colors.border + '20', marginVertical: 8 }} />

        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
            <Feather name="user" size={10} color={colors.t3} />
            <Text style={{ fontSize: 11, fontFamily: ff?.semiBold || undefined, color: colors.t2 }}>{item.actor_name || 'النظام'} ({getRoleArabicLabel(item.actor_role)})</Text>
          </View>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
            <Feather name="hash" size={10} color={colors.t3} />
            <Text style={{ fontSize: 11, fontFamily: ff?.semiBold || undefined, color: colors.t2 }}>{item.reference_text || '-'}</Text>
          </View>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
            <Feather name="cpu" size={10} color={colors.t3} />
            <Text style={{ fontSize: 11, fontFamily: ff?.semiBold || undefined, color: colors.t2 }}>{item.source === 'synced' ? 'من السيرفر' : 'محلي'}</Text>
          </View>
        </View>

        {!!item.sync_error && (
          <View style={{ marginTop: 10, backgroundColor: colors.danger + '10', padding: 8, borderRadius: radius.md, borderRightWidth: 3, borderRightColor: colors.danger }}>
            <Text style={{ fontSize: 11, fontFamily: ff?.bold || undefined, color: colors.danger, textAlign: 'right' }}>خطأ المزامنة: {item.sync_error}</Text>
          </View>
        )}

        {isFailed && tab === 'pending' && (
          <View style={{ marginTop: 10 }}>
            <Btn
              label={retryingId === item.sync_queue_id ? 'جاري إعادة المحاولة...' : 'إعادة المحاولة'}
              icon="refresh-cw"
              variant="outline"
              size="sm"
              loading={retryingId === item.sync_queue_id}
              disabled={syncingAll || retryingId !== null || !isOnline()}
              onPress={() => onRetryItem(item.sync_queue_id)}
            />
          </View>
        )}
      </View>
    );
  }, [colors, ff, onRetryItem, radius.md, retryingId, shadow.sm, spacing.md, syncingAll, tab]);

  return (
    <View style={s.screen}>
      <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row-reverse', paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 8, gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Btn
              label={!isOnline() ? 'لا يوجد اتصال بالإنترنت' : (syncingAll ? 'جاري المزامنة...' : 'مزامنة الكل')}
              icon={!isOnline() ? 'wifi-off' : 'refresh-cw'}
              variant={!isOnline() ? 'outline' : 'primary'}
              size="sm"
              disabled={!isOnline() || syncingAll || retryingId !== null}
              loading={syncingAll && !retryingId}
              onPress={onSyncAll}
            />
          </View>
          {tab === 'pending' && pendingOps.some(o => o.sync_status === 'failed') && (
            <View style={{ flex: 1 }}>
              <Btn
                label="إعادة محاولة الفاشلة"
                icon="alert-circle"
                variant="outline"
                size="sm"
                disabled={!isOnline() || syncingAll || retryingId !== null}
                onPress={onRetryFailedOnly}
                style={{ borderColor: colors.danger, backgroundColor: colors.danger + '10' }}
                textStyle={{ color: colors.danger }}
              />
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row-reverse', paddingHorizontal: spacing.md, gap: 12 }}>
          <TouchableOpacity 
            onPress={() => setTab('pending')}
            style={{ 
              flex: 1, 
              paddingVertical: 10, 
              alignItems: 'center', 
              borderBottomWidth: 3, 
              borderBottomColor: tab === 'pending' ? colors.primary : 'transparent' 
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: ff?.bold || undefined, color: tab === 'pending' ? colors.primary : colors.t3 }}>العمليات المعلقة ({pendingOps.length})</Text>
          </TouchableOpacity>
          {canViewGeneralLog && (
            <TouchableOpacity 
              onPress={() => setTab('general')}
              style={{ 
                flex: 1, 
                paddingVertical: 10, 
                alignItems: 'center', 
                borderBottomWidth: 3, 
                borderBottomColor: tab === 'general' ? colors.primary : 'transparent' 
              }}
            >
              <Text style={{ fontSize: 14, fontFamily: ff?.bold || undefined, color: tab === 'general' ? colors.primary : colors.t3 }}>السجل العام ({generalOps.length})</Text>
            </TouchableOpacity>
          )}
        </View>

        {tab === 'general' && (
          <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.sm }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.bg2, borderRadius: radius.md, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border }}>
              <Feather name="search" size={16} color={colors.t3} />
              <TextInput
                placeholder="بحث في السجل..."
                placeholderTextColor={colors.t3}
                value={search}
                onChangeText={setSearch}
                style={{ flex: 1, height: 40, color: colors.t1, fontFamily: ff?.regular || undefined, textAlign: 'right', marginRight: 8 }}
              />
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row-reverse', padding: spacing.md, gap: 10 }}>
           <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border + '50' }}>
              <Text style={{ fontSize: 10, fontFamily: ff?.medium || undefined, color: colors.t3, marginBottom: 2 }}>المعلقة</Text>
              <Text style={{ fontSize: 18, fontFamily: ff?.black || undefined, color: colors.warning }}>{pendingCount}</Text>
           </View>
           <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border + '50' }}>
              <Text style={{ fontSize: 10, fontFamily: ff?.medium || undefined, color: colors.t3, marginBottom: 2 }}>الفاشلة</Text>
              <Text style={{ fontSize: 18, fontFamily: ff?.black || undefined, color: colors.danger }}>{failedCount}</Text>
           </View>
           <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border + '50' }}>
              <Text style={{ fontSize: 10, fontFamily: ff?.medium || undefined, color: colors.t3, marginBottom: 2 }}>تمت مزامنتها</Text>
              <Text style={{ fontSize: 18, fontFamily: ff?.black || undefined, color: colors.success }}>{syncedCount}</Text>
           </View>
        </View>
      </View>

      {loading ? (
        <Loading />
      ) : tab === 'general' && !canViewGeneralLog ? (
        <Empty icon="lock" title="لا تملك صلاحية عرض السجل العام" sub="هذه الشاشة متاحة للمدير فقط أو حسب الصلاحيات الممنوحة." />
      ) : data.length === 0 ? (
        <Empty icon="activity" title={tab === 'pending' ? 'لا توجد عمليات معلّقة حالياً' : 'سجل العمليات فارغ'} sub={tab === 'pending' ? 'سيتم إدراج أي عمليات تجريها أوفلاين هنا حتى تتم مزامنتها.' : ''} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ soft: true })} tintColor={colors.primary} />}
          removeClippedSubviews
          initialNumToRender={12}
          windowSize={7}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={50}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}
