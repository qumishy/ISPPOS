import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Dimensions, Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { 
  getLocalInvoices, getLocalCollections, getLocalBatches, 
  getLocalUsers, getLocalPOS, getLocalSupplies, getLocalWallets,
  getLocalCategories, checkOverdueInvoices
} from '../services/database';
import { useTheme } from '../theme';
import { LineChart, PieChart, BarChart } from 'react-native-chart-kit';
import { ProgressBar, Btn } from '../components/UI';
import { makeStyles } from '../styles/dashboard.styles';
import { useAuth } from '../services/AuthContext';
import { syncNow } from '../services/SyncService';

const W = Dimensions.get('window').width;

// ── Animated counter value
function AnimatedNumber({ value, color, fontSize: fs = 28 }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value, duration: 1200,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    const listener = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    return () => anim.removeListener(listener);
  }, [value]);

  return (
    <Text style={{ fontSize: fs, fontWeight: '900', color, letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit>
      {display.toLocaleString()}
    </Text>
  );
}

// ── Premium Metric Card
function MetricCard({ icon, title, value, color, s }) {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.18] });

  return (
    <View style={[s.metricCard, { borderTopColor: color, borderTopWidth: 3 }]}>
      <Animated.View style={[s.metricGlow, { backgroundColor: color, opacity: glowOpacity }]} />
      <View style={[s.metricIconWrap, { backgroundColor: color + '18' }]}>
        <Text style={{ fontSize: 22 }}>{icon}</Text>
      </View>
      <Text style={s.metricTitle}>{title}</Text>
      <Text style={[s.metricValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

// ── Efficiency Gauge
function EfficiencyGauge({ percent, s, colors, spacing }) {
  const breathe = useRef(new Animated.Value(1)).current;
  const color   = percent >= 80 ? colors.green : percent >= 50 ? colors.orange : colors.red;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.06, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1,    duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={s.gaugeCard}>
      <Text style={s.gaugeSectionTitle}>🎯 مؤشر كفاءة التحصيل</Text>
      <Text style={s.gaugeSub}>نسبة التحصيلات المعتمدة من إجمالي المبيعات</Text>
      <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <View style={[s.gaugeOuter, { borderColor: color, shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 }]}>
          <Animated.View style={[{ transform: [{ scale: breathe }], alignItems: 'center', justifyContent: 'center' }]}>
            <View style={[s.gaugeInner, { backgroundColor: color + '15' }]}>
              <Text style={[s.gaugePercent, { color }]}>{percent}%</Text>
              <Text style={[s.gaugeLabel, { color }]}>كفاءة</Text>
            </View>
          </Animated.View>
        </View>
        <View style={[s.gaugeBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
          <Text style={[s.gaugeBadgeText, { color }]}>
            {percent >= 80 ? '✅ أداء ممتاز' : percent >= 50 ? '⚡ أداء جيد' : '⚠️ يحتاج تحسين'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Section title
function SectionTitle({ icon, title, s }) {
  return (
    <View style={s.secTitle}>
      <View style={s.secTitleAccent} />
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={s.secTitleText}>{title}</Text>
    </View>
  );
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, spacing, radius, fontSize, shadow, isDark } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [stats, setStats]       = useState({ totalSales: 0, totalCollected: 0, totalPending: 0, invoicesCount: 0, collectionEfficiency: 0 });
  const [posHealth, setPosHealth]   = useState({ used: 0, limit: 1 });
  const [inventory, setInventory]   = useState({ total: 0, latestBatches: [] });
  const [topAgents, setTopAgents]   = useState([]);
  const [chartData, setChart]       = useState([0, 0, 0, 0, 0, 0, 0]);
  const [pieData, setPie]           = useState([]);
  
  // خاص بالمحاسب والمندوب
  const [cashierStats, setCashierStats] = useState({ pendingCount: 0, pendingAmount: 0, todayApproved: 0 });
  const [agentWallet, setAgentWallet]   = useState([]);
  const [walletChart, setWalletChart]   = useState({ labels: [], data: [] });

  useFocusEffect(useCallback(() => { loadDashboard(); }, [user]));

  const loadDashboard = async () => {
    try {
      const role = user?.role;
      const isAdmin = role === 'admin';
      const isCashier = role === 'cashier';
      const isAgent = role === 'agent';

      // 1) جلب البيانات الأساسية مع الفلترة إذا كان مندوباً
      const invFilters = isAgent ? { agent_id: user.id } : {};
      const colFilters = isAgent ? { agent_id: user.id } : {};

      const invoices    = await getLocalInvoices(invFilters)    || [];
      const collections = await getLocalCollections(colFilters) || [];
      
      const totalSales   = invoices.reduce((s, i) => s + Number(i.net_amount || i.total_amount || 0), 0);
      const totalPending = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + Number(i.net_amount || i.total_amount || 0), 0);
      
      const approved      = collections.filter(c => c.status === 'approved');
      const totalCollected  = approved.reduce((s, c) => s + Number(c.amount || 0), 0);
      const efficiency       = totalSales > 0 ? Math.round((totalCollected / totalSales) * 100) : 0;
      
      setStats({ 
        totalSales, totalCollected, totalPending, 
        invoicesCount: invoices.length, 
        collectionEfficiency: efficiency 
      });

      // 2) إحصائيات المندوب (المحفظة)
      if (isAgent) {
        const [wallets, categoriesAll] = await Promise.all([getLocalWallets(user.id), getLocalCategories()]);
        setAgentWallet(wallets);
        
        // تجميع حسب كافة الفئات المسجلة في النظام (حتى لو الرصيد 0)
        const grouped = {};
        categoriesAll.forEach(cat => { grouped[cat.name] = 0; });

        wallets.forEach(w => {
          const catName = w.category_name || 'غير معروف';
          grouped[catName] = (grouped[catName] || 0) + (Number(w.total_cards || 0) - Number(w.sold_cards || 0));
        });

        const labels = Object.keys(grouped);
        const data   = labels.map(l => grouped[l]);
        setWalletChart({ labels, data });
      }

      // 3) إحصائيات المحاسب (التحصيلات المعلقة والتوريدات)
      if (isAdmin || isCashier) {
        const pendingCols = collections.filter(c => c.status === 'pending');
        const today = new Date().toISOString().slice(0, 10);
        const approvedToday = collections.filter(c => c.status === 'approved' && c.approved_at?.startsWith(today) && (isAdmin || c.approved_by === user.id))
                                .reduce((s, c) => s + Number(c.amount || 0), 0);
        
        const supplies = await getLocalSupplies() || [];
        const totalSupplied = supplies.filter(x => isAdmin || x.user_id === user.id).reduce((s, x) => s + Number(x.amount || 0), 0);

        setCashierStats({
          pendingCount: pendingCols.length,
          pendingAmount: pendingCols.reduce((s, c) => s + Number(c.amount || 0), 0),
          todayApproved: approvedToday,
          totalSupplied
        });
      }

      // 3) بيانات الرسوم والمناديب (للمدير والمحاسب)
      if (isAdmin || isCashier) {
        const [posAll, batchAll, usersAll] = await Promise.all([getLocalPOS(), getLocalBatches(), getLocalUsers()]);
        
        const posData = posAll.filter(p => p.active !== false);
        setPosHealth({ 
          used: posData.reduce((s, p) => s + Number(p.credit_used || 0), 0), 
          limit: posData.reduce((s, p) => s + Number(p.credit_limit || 0), 0) || 1 
        });

        const activeBatches = batchAll.filter(b => b.status === 'active');
        setInventory({ total: activeBatches.reduce((s, b) => s + Number(b.available_cards || 0), 0), latestBatches: activeBatches.slice(0, 4) });

        if (isAdmin) {
          const usersMap = {}; usersAll.filter(u => u.role === 'agent').forEach(u => { usersMap[u.id] = u.name; });
          const byAgentSales = {};
          invoices.forEach(inv => { 
            const name = usersMap[inv.agent_id] || 'غير معروف'; 
            byAgentSales[name] = (byAgentSales[name] || 0) + Number(inv.net_amount || inv.total_amount || 0); 
          });
          setTopAgents(Object.keys(byAgentSales).map(name => ({ name, amount: byAgentSales[name] })).sort((a, b) => b.amount - a.amount).slice(0, 3));

          const byAgentCol = {};
          approved.forEach(c => { 
            const name = usersMap[c.agent_id] || 'غير معروف'; 
            byAgentCol[name] = (byAgentCol[name] || 0) + Number(c.amount || 0); 
          });
          setPie(Object.keys(byAgentCol).map((key, i) => ({ 
            name: formatName(key), amount: byAgentCol[key], color: getColor(i), 
            legendFontColor: colors.t2, legendFontSize: 11 
          })));
        }
      }

      // 4) بيانات الرسم البياني (7 أيام)
      const days = getLast7Days();
      setChart(days.map(date => 
        collections.filter(c => c.status === 'approved' && (c.approved_at?.startsWith(date) || c.collection_date?.startsWith(date)))
                   .reduce((s, c) => s + Number(c.amount || 0), 0)
      ));

    } catch (e) { console.log('Dashboard error', e); }
  };

  const formatName = (name) => !name ? 'غير معروف' : name.length > 10 ? name.substring(0, 10) + '..' : name;
  const getLast7Days = () => { const a = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); a.push(d.toISOString().slice(0, 10)); } return a; };
  const getLast7Labels = () => { const a = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); a.push(d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })); } return a; };
  const getColor = (i) => [colors.blue, colors.green, colors.orange, colors.purple, colors.cyan, colors.red][i % 6];
  const fc = (n) => Number(n || 0).toLocaleString();

  const chartConfig = {
    backgroundGradientFrom: colors.card,
    backgroundGradientTo:   colors.card,
    decimalPlaces: 0,
    color:      (opacity = 1) => isDark ? `rgba(148, 163, 184, ${opacity})` : `rgba(37, 99, 235, ${opacity})`,
    labelColor: (opacity = 1) => colors.t3,
    fillShadowGradientFrom: colors.blue,
    fillShadowGradientFromOpacity: 0.5,
    fillShadowGradientTo:   colors.bg,
    fillShadowGradientToOpacity: 0,
    propsForDots: { r: '5', strokeWidth: '2', stroke: colors.blueL, fill: colors.card },
    propsForBackgroundLines: { stroke: colors.border, strokeDasharray: '4' },
  };

  const isAdmin = user?.role === 'admin';
  const isCashier = user?.role === 'cashier';
  const isAgent = user?.role === 'agent';

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{isAdmin ? 'لوحة تحكم المدير' : isCashier ? 'لوحة تحكم المحاسب' : 'لوحة تحكم المندوب'}</Text>
          <Text style={s.headerSub}>{user?.name} · {isAdmin ? 'مشرف عام' : isCashier ? 'محاسب واستلام' : 'مبيعات وتحصيل'}</Text>
        </View>
        <Btn icon="refresh" variant="ghost" size="sm" onPress={() => syncNow(user)} />
        <View style={s.headerBadge}>
          <View style={s.headerDot} />
          <Text style={s.headerBadgeTxt}>مباشر</Text>
        </View>
      </View>

      {/* ── مقاييس المدير (أرقام عامة) ── */}
      {isAdmin && (
        <View style={s.metricsGrid}>
          <MetricCard icon="📈" title="إجمالي المبيعات" value={fc(stats.totalSales)} color={colors.blue} s={s} />
          <MetricCard icon="💰" title="التحصيلات المعتمدة" value={fc(stats.totalCollected)} color={colors.green} s={s} />
          <MetricCard icon="⏳" title="مبالغ معلقة" value={fc(stats.totalPending)} color={colors.orange} s={s} />
          <MetricCard icon="🧾" title="إجمالي الفواتير" value={stats.invoicesCount} color={colors.purple} s={s} />
        </View>
      )}

      {/* ── مقاييس المندوب (رصيد الفئات - النسخة المحسنة والموزونة) ── */}
      {isAgent && (
        <View style={s.metricsGrid}>
          {walletChart.labels.length > 0 ? walletChart.labels.map((cat, idx) => {
             const count = walletChart.data[idx];
             const isZero = count === 0;
             return (
               <View key={idx} style={[s.metricCard, { borderTopColor: [colors.blue, colors.green, colors.orange, colors.purple, colors.cyan, colors.red][idx % 6], borderTopWidth: 4, height: 110, justifyContent: 'center' }]}>
                  <View style={[s.metricIconWrap, { backgroundColor: colors.bg + '50', position: 'absolute', right: 8, top: 8, height: 28, width: 28 }]}>
                     <Text style={{ fontSize: 13 }}>{isZero ? '⚠️' : '🗂️'}</Text>
                  </View>
                  
                  <Text style={{ fontSize: 13, color: colors.t3, textAlign: 'center' }}>فئة الكرت</Text>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: colors.t1, textAlign: 'center', marginVertical: 2 }}>{cat}</Text>
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
                    <Text style={{ fontSize: 11, color: colors.t3 }}>المتبقي: </Text>
                    <Text style={{ fontSize: 21, fontWeight: '900', color: isZero ? colors.red : colors.blue }}>{count}</Text>
                    <Text style={{ fontSize: 11, color: colors.t3 }}> ورقة</Text>
                  </View>
               </View>
             );
          }) : (
            <View style={{ flex: 1, padding: 20, alignItems: 'center', width: W - 32 }}>
              <Text style={s.emptyText}>لا يوجد رصيد كروت حالياً في محفظتك</Text>
            </View>
          )}
        </View>
      )}

      {/* ── مقاييس المحاسب (خاص) ── */}
      {isCashier && (
        <View style={s.metricsGrid}>
          <MetricCard icon="⏳" title="تحصيلات تنتظر الاعتماد" value={cashierStats.pendingCount} color={colors.orange} s={s} />
          <MetricCard icon="💸" title="إجمالي المعلق" value={fc(cashierStats.pendingAmount)} color={colors.orange} s={s} />
          <MetricCard icon="✅" title="تم اعتماده اليوم" value={fc(cashierStats.todayApproved)} color={colors.green} s={s} />
          <MetricCard icon="💰" title="إجمالي التوريدات للمدير" value={fc(cashierStats.totalSupplied)} color={colors.blue} s={s} />
        </View>
      )}


      {/* ── صحة الديون (للمدير والمحاسب فقط) ── */}
      {(isAdmin || isCashier) && (
        <>
          <SectionTitle icon="🏪" title="صحة ديون نقاط البيع" s={s} />
          <View style={s.sectionCard}>
            <View style={s.posHealthHeader}>
              <View>
                <Text style={s.posHealthLabel}>إجمالي الديون المستخدمة</Text>
                <Text style={[s.posHealthVal, { color: colors.orange }]}>{fc(posHealth.used)} ر.ي</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.posHealthLabel}>الحد الكلي</Text>
                <Text style={[s.posHealthVal, { color: colors.t2 }]}>{fc(posHealth.limit)} ر.ي</Text>
              </View>
            </View>
            <ProgressBar percent={(posHealth.used / posHealth.limit) * 100} color={colors.orange} height={8} />
          </View>
        </>
      )}

      <EfficiencyGauge percent={stats.collectionEfficiency} s={s} colors={colors} spacing={spacing} />

      {/* ── أعلى المناديب (للمدير فقط) ── */}
      {isAdmin && (
        <>
          <SectionTitle icon="🏆" title="أعلى المناديب مبيعاً" s={s} />
          <View style={s.sectionCard}>
            {topAgents.length === 0 ? (
              <Text style={s.emptyText}>لا توجد مبيعات بعد</Text>
            ) : topAgents.map((agent, idx) => (
              <View key={idx} style={[s.agentRow, idx < topAgents.length - 1 && s.agentBorder]}>
                <View style={s.agentLeft}>
                  <View style={[s.agentRankBadge, { backgroundColor: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#000' }}>{idx + 1}</Text>
                  </View>
                  <Text style={s.agentName}>{agent.name}</Text>
                </View>
                <Text style={s.agentAmt}>{fc(agent.amount)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <SectionTitle icon="📈" title={isAgent ? "تحصيلاتي آخر 7 أيام" : "التحصيلات العامة — آخر 7 أيام"} s={s} />
      <View style={s.chartWrap}>
        <LineChart
          data={{ labels: getLast7Labels(), datasets: [{ data: chartData.some(d => d > 0) ? chartData : [0, 0, 0, 0, 0, 0, 0] }] }}
          width={W - 32} height={200} chartConfig={chartConfig} bezier style={{ borderRadius: radius.lg }} withInnerLines={false}
        />
      </View>

      {isAdmin && pieData.length > 0 && (
        <>
          <SectionTitle icon="Pie" title="توزيع التحصيل بين المناديب" s={s} />
          <View style={[s.sectionCard, { alignItems: 'center' }]}>
            <PieChart data={pieData} width={W - 64} height={200} chartConfig={chartConfig} accessor="amount" backgroundColor="transparent" paddingLeft="10" />
          </View>
        </>
      )}

      {/* ── صحة المخزون (للمدير فقط) ── */}
      {isAdmin && (
        <>
          <SectionTitle icon="📦" title="صحة المخزون" s={s} />
          <View style={s.sectionCard}>
            <View style={s.invTotalRow}>
              <Text style={s.invLabel}>إجمالي المتاح في المخزون</Text>
              <Text style={s.invTotal}>{fc(inventory.total)}</Text>
            </View>
            {inventory.latestBatches.map((b, i) => {
              const pct = Math.round(((b.total_cards - b.available_cards) / b.total_cards) * 100) || 0;
              const col = pct >= 90 ? colors.red : pct >= 60 ? colors.orange : colors.green;
              return (
                <View key={i} style={s.batchRow}>
                   <Text style={s.batchSerial}>{b.category_name} - دفعة #{b.batch_number} ({b.available_cards} ورقة)</Text>
                   <ProgressBar percent={pct} color={col} height={6} />
                </View>
              );
            })}
          </View>
        </>
      )}

      {isCashier && (
        <Btn label="✅ الانتقال لاعتماد التحصيلات" variant="primary" style={{ marginTop: 20 }} onPress={() => navigation.navigate('CashierTab')} />
      )}
    </ScrollView>
  );
}
