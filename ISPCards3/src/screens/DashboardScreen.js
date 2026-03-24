import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getLocalInvoices, getLocalCollections, execSQL } from '../services/database';
import { colors, spacing, radius, fontSize } from '../theme';
import { LineChart, PieChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

export default function DashboardScreen() {

  const [stats, setStats] = useState({
    totalSales: 0,
    totalCollected: 0,
    totalPending: 0,
    invoicesCount: 0,
  });

  const [chartData, setChart] = useState([0,0,0,0,0,0,0]);
  const [pieData, setPie] = useState([]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [])
  );

  const loadDashboard = async () => {
    try {

      const invoices = await getLocalInvoices() || [];
      const collections = await getLocalCollections() || [];

      const totalSales = invoices.reduce((s, i) =>
        s + Number(i.net_amount || i.total_amount || 0), 0);

      const invoicesCount = invoices.length;

      const pending = invoices.filter(i => i.status !== 'paid');
      const totalPending = pending.reduce((s, i) =>
        s + Number(i.net_amount || i.total_amount || 0), 0);

      const approvedCollections = collections.filter(c => c.status === 'approved');
      const totalCollected = approvedCollections.reduce((s, c) =>
        s + Number(c.amount || 0), 0);

      setStats({
        totalSales,
        totalCollected,
        totalPending,
        invoicesCount,
      });

      const days = getLast7DaysFull();

      const chart = days.map(date => {
        const total = collections
          .filter(c => c.collection_date?.startsWith(date))
          .reduce((s, c) => s + Number(c.amount || 0), 0);

        return Number(total || 0);
      });

      setChart(chart);

      let usersMap = {};

      try {
        const usersRes = await execSQL("SELECT id, name FROM users");
        usersRes.rows._array.forEach(u => {
          usersMap[u.id] = u.name;
        });
      } catch (e) {}

      const byAgent = {};

      collections.forEach(c => {
        const name = usersMap[c.agent_id] || 'غير معروف';
        byAgent[name] = (byAgent[name] || 0) + Number(c.amount || 0);
      });

      const pie = Object.keys(byAgent).map((key, i) => ({
        name: formatName(key),
        amount: byAgent[key],
        color: getColor(i),
        legendFontColor: "#ccc",
        legendFontSize: 12
      }));

      setPie(pie);

    } catch (e) {
      console.log('Dashboard error', e);
    }
  };

  const formatName = (name) => {
    if (!name) return 'غير معروف';
    return name.length > 10 ? name.substring(0, 10) + '...' : name;
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
    const colorsArr = ['#4CAF50','#2196F3','#FFC107','#E91E63','#9C27B0'];
    return colorsArr[i % colorsArr.length];
  };

  const formatCurrency = (n) =>
    `${Number(n || 0).toLocaleString()} ر.ي`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{padding:spacing.lg}}>

      <View style={styles.row}>
        <Card title="إجمالي المبيعات" value={formatCurrency(stats.totalSales)} />
        <Card title="التحصيلات" value={formatCurrency(stats.totalCollected)} />
      </View>

      <View style={styles.row}>
        <Card title="المعلق" value={formatCurrency(stats.totalPending)} />
        <Card title="عدد الفواتير" value={stats.invoicesCount} />
      </View>

      <Text style={styles.title}>تحصيلات آخر 7 أيام</Text>

      <LineChart
        data={{
          labels: getLast7DaysLabels(),
          datasets: [{ data: chartData }]
        }}
        width={screenWidth - 40}
        height={220}
        chartConfig={chartConfig}
        bezier
        style={{ borderRadius: 16 }}
      />

      <Text style={styles.title}>تحصيل حسب المندوب</Text>

      {pieData.length > 0 && (
        <PieChart
          data={pieData}
          width={screenWidth - 40}
          height={220}
          chartConfig={chartConfig}
          accessor="amount"
          backgroundColor="transparent"
          paddingLeft="20"
        />
      )}

    </ScrollView>
  );
}

function Card({ title, value }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const chartConfig = {
  backgroundGradientFrom: "#0f172a",
  backgroundGradientTo: "#0f172a",
  decimalPlaces: 0,
  color: () => "#3b82f6",
  labelColor: () => "#aaa",
};

const styles = StyleSheet.create({
  screen: { flex:1, backgroundColor: colors.bg },
  row: { flexDirection:'row', gap:10, marginBottom:10 },
  card: {
    flex:1,
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth:1,
    borderColor: colors.border
  },
  cardTitle: { color: colors.t3 },
  cardValue: { color: colors.t1, fontSize: 18, fontWeight:'800', marginTop:5 },
  title: { color: colors.t1, marginTop:20, marginBottom:10 }
});
