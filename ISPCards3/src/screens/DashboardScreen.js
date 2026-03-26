import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getLocalInvoices, getLocalCollections } from '../services/database';
import { supabase } from '../services/supabase';
import { colors, spacing, radius, fontSize } from '../theme';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { ProgressBar } from '../components/UI';

const screenWidth = Dimensions.get('window').width;

// ── المكون المتحرك لكفاءة التحصيل (Collection Efficiency) ──
function AnimatedEfficiency({ percent }) {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(spinValue, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(spinValue, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
      ])
    ).start();
  }, [spinValue]);

  const scale = spinValue.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.05] });
  const opacity = spinValue.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  // تحديد اللون حسب الكفاءة
  const color = percent >= 80 ? colors.green : percent >= 50 ? colors.orange : colors.red;

  return (
    <View style={[styles.sectionCard, { alignItems: 'center', paddingVertical: spacing.xxl, marginBottom: spacing.md }]}>
      <Text style={styles.sectionTitle}>مؤشر كفاءة التحصيل 🎯</Text>
      <Text style={{ color: colors.t3, fontSize: fontSize.xs, marginBottom: spacing.xl, textAlign:'center' }}>
        النسبة تتنفس: تمثل حجم التحصيلات المعتمدة مقابل المبيعات الكلية
      </Text>
      
      <Animated.View style={{
        transform: [{ scale }],
        opacity,
        width: 150, height: 150,
        borderRadius: 75,
        borderWidth: 10,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 20,
        elevation: 15,
        backgroundColor: colors.card2
      }}>
        <Text style={{ fontSize: 34, fontWeight: '900', color: colors.t1 }}>{percent}%</Text>
        <Text style={{ color: color, fontWeight: '800', fontSize: fontSize.sm }}>كفاءة</Text>
      </Animated.View>
    </View>
  );
}


export default function DashboardScreen({ navigation }) {

  const [stats, setStats] = useState({
    totalSales: 0,
    totalCollected: 0,
    totalPending: 0,
    invoicesCount: 0,
    collectionEfficiency: 0
  });

  const [posHealth, setPosHealth] = useState({ used: 0, limit: 1 });
  const [inventory, setInventory] = useState({ total: 0, latestBatches: [] });
  const [topAgents, setTopAgents] = useState([]);

  const [chartData, setChart] = useState([0,0,0,0,0,0,0]);
  const [pieData, setPie] = useState([]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [])
  );

  const loadDashboard = async () => {
    try {
      // 1. Invoices & Collections (Local)
      const invoices = await getLocalInvoices() || [];
      const collections = await getLocalCollections() || [];

      const totalSales = invoices.reduce((s, i) => s + Number(i.net_amount || i.total_amount || 0), 0);
      const invoicesCount = invoices.length;

      const pending = invoices.filter(i => i.status !== 'paid');
      const totalPending = pending.reduce((s, i) => s + Number(i.net_amount || i.total_amount || 0), 0);

      const approvedCollections = collections.filter(c => c.status === 'approved');
      const totalCollected = approvedCollections.reduce((s, c) => s + Number(c.amount || 0), 0);

      const efficiency = totalSales > 0 ? Math.round((totalCollected / totalSales) * 100) : 0;

      setStats({ totalSales, totalCollected, totalPending, invoicesCount, collectionEfficiency: efficiency });

      // 2. Load extra metrics from Supabase
      const [posRes, batchRes, usersRes] = await Promise.all([
        supabase.from('pos_customers').select('credit_used, credit_limit').eq('active', true),
        supabase.from('batches').select('serial_number, total_cards, available_cards').eq('status', 'active').order('created_at', { ascending: false }),
        supabase.from('users').select('id, name').eq('role', 'agent')
      ]);

      // POS Health
      const posData = posRes.data || [];
      const totalColUsed = posData.reduce((s,p) => s + Number(p.credit_used||0), 0);
      const totalColLimit = posData.reduce((s,p) => s + Number(p.credit_limit||0), 0);
      setPosHealth({ used: totalColUsed, limit: totalColLimit || 1 });

      // Inventory Alerts (Last 3 batches)
      const batchData = batchRes.data || [];
      const totalInv = batchData.reduce((s,b) => s + Number(b.available_cards||0), 0);
      const latestBatches = batchData.slice(0, 3);
      setInventory({ total: totalInv, latestBatches });

      // 3. User mapping for charts & Top Agents
      let usersMap = {};
      (usersRes.data || []).forEach(u => { usersMap[u.id] = u.name; });

      const byAgentSales = {};
      invoices.forEach(inv => {
        const name = usersMap[inv.agent_id] || 'غير معروف';
        byAgentSales[name] = (byAgentSales[name] || 0) + Number(inv.net_amount || inv.total_amount || 0);
      });

      // Sort Top Agents by Sales
      const sortedAgents = Object.keys(byAgentSales)
        .map(name => ({ name, amount: byAgentSales[name] }))
        .sort((a,b) => b.amount - a.amount)
        .slice(0, 3);
      setTopAgents(sortedAgents);

      // Arrays for Line Chart (Collections last 7 days)
      const days = getLast7DaysFull();
      const chart = days.map(date => {
        return collections
          .filter(c => c.status === 'approved' && c.collection_date?.startsWith(date))
          .reduce((s, c) => s + Number(c.amount || 0), 0);
      });
      setChart(chart);

      // Arrays for Pie Chart (Collections by Agent)
      const byAgentCol = {};
      approvedCollections.forEach(c => {
        const name = usersMap[c.agent_id] || 'غير معروف';
        byAgentCol[name] = (byAgentCol[name] || 0) + Number(c.amount || 0);
      });

      const pie = Object.keys(byAgentCol).map((key, i) => ({
        name: formatName(key),
        amount: byAgentCol[key],
        color: getColor(i),
        legendFontColor: colors.t2,
        legendFontSize: 12
      }));
      setPie(pie);

    } catch (e) {
      console.log('Dashboard error', e);
    }
  };

  const formatName = (name) => {
    if (!name) return 'غير معروف';
    return name.length > 12 ? name.substring(0, 12) + '...' : name;
  };

  const getLast7DaysFull = () => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      arr.push(d.toISOString().slice(0, 10));
    }
    return arr;
  };

  const getLast7DaysLabels = () => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      arr.push(d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' }));
    }
    return arr;
  };

  const getColor = (i) => {
    const colorsArr = [colors.blue, colors.green, colors.orange, colors.purple, colors.cyan, colors.red];
    return colorsArr[i % colorsArr.length];
  };

  const formatCurrency = (n) => `${Number(n || 0).toLocaleString()}`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{padding:spacing.lg, paddingBottom: 100}}>
      
      <Text style={[styles.title, {marginTop: 0}]}>📊 نظرة عامة</Text>
      
      <View style={styles.row}>
        <RichCard icon="📈" title="إجمالي المبيعات" value={formatCurrency(stats.totalSales)} color={colors.blue} />
        <RichCard icon="💰" title="التحصيلات المعتمدة" value={formatCurrency(stats.totalCollected)} color={colors.green} />
      </View>

      <View style={styles.row}>
        <RichCard icon="⏳" title="مبالغ معلقة" value={formatCurrency(stats.totalPending)} color={colors.orange} />
        <RichCard icon="🧾" title="إجمالي الفواتير" value={stats.invoicesCount.toString()} color={colors.purple} />
      </View>

      {/* POS Health */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>مؤشر ديون نقاط البيع (السوق)</Text>
        <Text style={{color: colors.t2, fontSize: fontSize.xs, marginBottom: spacing.sm}}>إجمالي حجم الديون المستخدمة مقابل السقوف الممنوحة</Text>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs}}>
          <Text style={{color: colors.orange, fontWeight: '700'}}>{formatCurrency(posHealth.used)} مباع آجل</Text>
          <Text style={{color: colors.t3}}>{formatCurrency(posHealth.limit)} سقف كلي</Text>
        </View>
        <ProgressBar percent={(posHealth.used / posHealth.limit) * 100} color={colors.orange} />
      </View>

      {/* Animated KPI */}
      <AnimatedEfficiency percent={stats.collectionEfficiency} />

      <Text style={styles.title}>🏆 أعلى المناديب في المبيعات</Text>
      <View style={styles.sectionCard}>
        {topAgents.length === 0 ? (
          <Text style={{color: colors.t3, textAlign: 'center', paddingVertical: spacing.md}}>لا توجد مبيعات بعد</Text>
        ) : topAgents.map((agent, index) => (
          <View key={index} style={[styles.agentRow, index < topAgents.length - 1 && styles.borderBottom]}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: spacing.sm}}>
              <Text style={{fontSize: 20}}>{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</Text>
              <Text style={{fontSize: fontSize.md, fontWeight: '700', color: colors.t1}}>{agent.name}</Text>
            </View>
            <Text style={{fontSize: fontSize.md, fontWeight: '800', color: colors.green}}>{formatCurrency(agent.amount)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.title}>📈 التحصيل (آخر 7 أيام)</Text>
      <LineChart
        data={{
          labels: getLast7DaysLabels(),
          datasets: [{ data: chartData.length && chartData.some(d => d > 0) ? chartData : [0,0,0,0,0,0,0] }]
        }}
        width={screenWidth - 40}
        height={220}
        chartConfig={chartConfig}
        bezier
        style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}
      />

      {pieData.length > 0 && (
        <>
          <Text style={styles.title}>النسبة من إجمالي التحصيل المعتمد</Text>
          <View style={[styles.sectionCard, {alignItems: 'center', paddingVertical: spacing.lg}]}>
            <PieChart
              data={pieData}
              width={screenWidth - 60}
              height={200}
              chartConfig={chartConfig}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="15"
              absolute
            />
          </View>
        </>
      )}

      {/* Inventory & Batches Health Moved To Bottom */}
      <Text style={styles.title}>📦 استهلاك الدفعات في المخزون (صحة المخزون)</Text>
      <View style={styles.sectionCard}>
        <Text style={{color: colors.cyan, fontWeight: '800', fontSize: 22, textAlign: 'center', marginBottom: spacing.md}}>
          المتاح كلياً: {formatCurrency(inventory.total)} ورقة
        </Text>
        
        {inventory.latestBatches.length > 0 ? inventory.latestBatches.map((b, i) => {
          const pct = Math.round(((b.total_cards - b.available_cards) / b.total_cards) * 100) || 0;
          return (
            <View key={i} style={{marginBottom: spacing.md}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs}}>
                <Text style={{color: colors.t1, fontWeight: '700'}}>دفعة #{b.serial_number}</Text>
                <Text style={{color: colors.t2}}>{pct}% مباع</Text>
              </View>
              <ProgressBar percent={pct} color={pct >= 90 ? colors.red : pct >= 50 ? colors.orange : colors.green} />
              <Text style={{color: colors.t3, fontSize: 10, marginTop: 4, textAlign: 'right'}}>
                متبقي {b.available_cards} من أصل {b.total_cards}
              </Text>
            </View>
          );
        }) : (
          <Text style={{color: colors.t3, textAlign: 'center'}}>لا توجد دفعات حالية</Text>
        )}
      </View>

    </ScrollView>
  );
}

function RichCard({ icon, title, value, color }) {
  return (
    <View style={styles.richCard}>
      <View style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs}}>
        <Text style={{fontSize: 16}}>{icon}</Text>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={[styles.cardValue, {color: color, textAlign: 'center'}]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const chartConfig = {
  backgroundGradientFrom: colors.card,
  backgroundGradientTo: colors.card,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(160, 160, 160, ${opacity})`,
  fillShadowGradientFrom: colors.blue,
  fillShadowGradientTo: colors.bg,
  propsForDots: {
    r: "4",
    strokeWidth: "2",
    stroke: colors.blue
  }
};

const styles = StyleSheet.create({
  screen: { flex:1, backgroundColor: colors.bg },
  row: { flexDirection:'row', gap:spacing.sm, marginBottom:spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.t1, marginTop: spacing.xl, marginBottom: spacing.md },
  
  richCard: {
    flex:1,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
    justifyContent: 'center'
  },
  cardTitle: { color: colors.t2, fontSize: fontSize.xs, fontWeight: '600' },
  cardValue: { fontSize: 24, fontWeight:'900', marginTop: spacing.sm },
  
  sectionCard: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.t1, marginBottom: spacing.xs },
  
  agentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: colors.border }
});
