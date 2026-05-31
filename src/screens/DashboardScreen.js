import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Dimensions, Animated, Easing, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getLocalInvoices, getLocalCollections, getLocalUsers,
  getLocalSupplies, getAgentWalletCategoryBalances,
  getInventoryCategoryHealth, getInventoryGlobalTotals, subscribeDataChanges
} from '../services/database';
import { useTheme } from '../theme';
import { LineChart } from 'react-native-chart-kit';
import { Btn } from '../components/UI';
import { makeStyles } from '../styles/dashboard.styles';
import { useAuth } from '../services/AuthContext';

import { Feather } from '@expo/vector-icons';

const W = Dimensions.get('window').width;

// ── Animated count-up number 
function AnimatedNumber({ value, color, fontSize: fs = 28, fontFamily }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    Animated.timing(anim, { toValue: value, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const listener = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    return () => anim.removeListener(listener);
  }, [value]);
  return (
    <Text style={{ fontSize: fs, fontFamily: fontFamily || 'IBMPlexSansArabic-Black', color, letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit>
      {display.toLocaleString()}
    </Text>
  );
}

// ── Tap-enabled Premium Metric Card  
function MetricCard({ icon, title, value, color, s, ff, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ])).start();
  }, []);
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.18] });
  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} disabled={!onPress}>
      <Animated.View style={[s.metricCard, { borderTopColor: color, borderTopWidth: 3, transform: [{ scale: scaleAnim }] }]}>
        <Animated.View style={[s.metricGlow, { backgroundColor: color, opacity: glowOpacity }]} />
        <View style={[s.metricIconWrap, { backgroundColor: color + '15' }]}>
          <Feather name={icon} size={22} color={color} />
        </View>
        <Text style={[s.metricTitle, { fontFamily: ff?.semiBold }]}>{title}</Text>
        <Text style={[s.metricValue, { color, fontFamily: ff?.black }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Efficiency Gauge
function EfficiencyGauge({ percent, s, colors, spacing, ff }) {
  const breathe = useRef(new Animated.Value(1)).current;
  const color = percent >= 80 ? colors.success : percent >= 50 ? colors.warning : colors.danger;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1.06, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);
  const gaugeIcon = percent >= 80 ? 'check-circle' : percent >= 50 ? 'activity' : 'alert-triangle';
  return (
    <View style={s.gaugeCard}>
      <Text style={[s.gaugeSectionTitle, { fontFamily: ff?.black }]}>مؤشر كفاءة التحصيل</Text>
      <Text style={[s.gaugeSub, { fontFamily: ff?.regular }]}>نسبة التحصيلات المعتمدة من إجمالي المبيعات</Text>
      <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <View style={[s.gaugeOuter, { borderColor: color, shadowColor: color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 8 }]}>
          <Animated.View style={{ transform: [{ scale: breathe }], alignItems: 'center', justifyContent: 'center' }}>
            <View style={[s.gaugeInner, { backgroundColor: color + '15' }]}>
              <Text style={[s.gaugePercent, { color, fontFamily: ff?.black }]}>{percent}%</Text>
              <Text style={[s.gaugeLabel, { color, fontFamily: ff?.bold }]}>كفاءة</Text>
            </View>
          </Animated.View>
        </View>
        <View style={[s.gaugeBadge, { backgroundColor: color + '15', borderColor: color + '40', flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Feather name={gaugeIcon} size={18} color={color} />
          <Text style={[s.gaugeBadgeText, { color, fontFamily: ff?.bold }]}>
            {percent >= 80 ? 'أداء ممتاز' : percent >= 50 ? 'أداء جيد' : 'يحتاج تحسين'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── NEW: Supply Efficiency Gauge (Cashier)
function SupplyEfficiencyGauge({ percent, s, colors, spacing, ff }) {
  const breathe = useRef(new Animated.Value(1)).current;
  const color = percent >= 90 ? colors.success : percent >= 60 ? colors.warning : colors.danger;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1.06, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);
  const gaugeIcon = percent >= 90 ? 'check-circle' : percent >= 60 ? 'activity' : 'alert-triangle';
  return (
    <View style={s.gaugeCard}>
      <Text style={[s.gaugeSectionTitle, { fontFamily: ff?.black }]}>مؤشر كفاءة التوريد</Text>
      <Text style={[s.gaugeSub, { fontFamily: ff?.regular }]}>نسبة توريدات اليوم من التحصيلات المعتمدة اليوم</Text>
      <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <View style={[s.gaugeOuter, { borderColor: color, shadowColor: color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 8 }]}>
          <Animated.View style={{ transform: [{ scale: breathe }], alignItems: 'center', justifyContent: 'center' }}>
            <View style={[s.gaugeInner, { backgroundColor: color + '15' }]}>
              <Text style={[s.gaugePercent, { color, fontFamily: ff?.black }]}>{percent}%</Text>
              <Text style={[s.gaugeLabel, { color, fontFamily: ff?.bold }]}>كفاءة</Text>
            </View>
          </Animated.View>
        </View>
        <View style={[s.gaugeBadge, { backgroundColor: color + '15', borderColor: color + '40', flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Feather name={gaugeIcon} size={18} color={color} />
          <Text style={[s.gaugeBadgeText, { color, fontFamily: ff?.bold }]}>
            {percent >= 90 ? 'أداء ممتاز' : percent >= 60 ? 'أداء جيد' : 'يحتاج تحسين'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── NEW: Last 3 Days Collections Widget
function Last3DaysCollectionsWidget({ collections, colors, spacing, radius, ff }) {
  const getDays = () => { const a = []; for (let i = 0; i < 3; i++) { const d = new Date(); d.setDate(d.getDate() - i); a.push(d.toISOString().slice(0, 10)); } return a; };
  const days = getDays();
  const fc = n => Number(n || 0).toLocaleString();
  const getArabicDay = (dateStr) => {
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return dayNames[new Date(dateStr).getDay()];
  };

  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.lg }}>
        <View style={{ width: 5, height: 22, backgroundColor: colors.success, borderRadius: 3 }} />
        <Feather name="calendar" size={18} color={colors.success} />
        <Text style={{ fontSize: 19, fontFamily: ff?.extraBold, color: colors.t1, flex: 1 }}>تحصيلات آخر 3 أيام</Text>
      </View>
      {days.map((date, i) => {
        const amount = collections.filter(c => c.status === 'approved' && (c.approved_at?.startsWith(date) || c.collection_date?.startsWith(date))).reduce((s, c) => s + Number(c.amount || 0), 0);
        return (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: i < days.length - 1 ? 1 : 0, borderBottomColor: colors.border + '60' }}>
            <View>
              <Text style={{ fontSize: 16, fontFamily: ff?.semiBold, color: colors.t1 }}>{getArabicDay(date)}</Text>
              <Text style={{ fontSize: 13, fontFamily: ff?.regular, color: colors.t3 }}>{date}</Text>
            </View>
            <Text style={{ fontSize: 19, fontFamily: ff?.black, color: colors.success }}>{fc(amount)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Section title
function SectionTitle({ icon, title, s, colors, ff }) {
  return (
    <View style={s.secTitle}>
      <View style={s.secTitleAccent} />
      <Feather name={icon} size={20} color={colors.t2} style={{ marginRight: 4 }} />
      <Text style={[s.secTitleText, { fontFamily: ff?.extraBold }]}>{title}</Text>
    </View>
  );
}

function InventoryHealthWidget({ inventory, colors, spacing, ff, s, navigation }) {
  const items = Array.isArray(inventory.health) ? inventory.health : [];
  const maxRemaining = items.reduce((max, item) => Math.max(max, Number(item.remaining || 0)), 0);
  const palette = [colors.primary, colors.success, colors.warning, colors.cyan, colors.danger, colors.purple];

  return (
    <>
      <SectionTitle icon="box" title="صحة المخزون" s={s} colors={colors} ff={ff} />
      <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('InventoryTab')} style={s.sectionCard}>
        <View style={s.invTotalRow}>
          <Text style={[s.invLabel, { fontFamily: ff?.bold }]}>إجمالي المتاح في النظام</Text>
          <Text style={[s.invTotal, { fontFamily: ff?.black }]}>{Number(inventory.total || 0).toLocaleString()}</Text>
        </View>

        {items.length === 0 ? (
          <View style={s.inventoryEmptyState}>
            <Feather name="inbox" size={18} color={colors.t3} />
            <Text style={[s.emptyText, { fontFamily: ff?.regular, paddingVertical: spacing.md }]}>لا توجد بيانات مخزون حالياً</Text>
          </View>
        ) : (
          items.map((item, index) => {
            const value = Number(item.remaining || 0);
            const color = palette[index % palette.length];
            const widthPct = maxRemaining > 0 ? Math.max(value > 0 ? 8 : 0, Math.round((value / maxRemaining) * 100)) : 0;

            return (
              <View key={item.id || `${item.name}-${index}`} style={[s.inventoryChartRow, index < items.length - 1 && s.inventoryChartBorder]}>
                <View style={s.inventoryChartHead}>
                  <Text style={[s.inventoryChartLabel, { fontFamily: ff?.bold }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[s.inventoryChartValue, { fontFamily: ff?.black, color }]}>
                    {value.toLocaleString()}
                  </Text>
                </View>
                <View style={s.inventoryChartTrack}>
                  <View style={[s.inventoryChartFill, { width: `${widthPct}%`, backgroundColor: color }]} />
                </View>
              </View>
            );
          })
        )}
      </TouchableOpacity>
    </>
  );
}

// ── Daily agent collections widget (admin + cashier)
function DailyAgentCollections({ collections, usersMap, colors, spacing, radius, ff, navigation }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayCols = collections.filter(c => (c.collection_date?.startsWith(today) || c.created_at?.startsWith(today)));
  const byAgent = {};
  todayCols.forEach(c => {
    const name = usersMap[c.agent_id] || c.agent_name || 'غير محدد';
    if (!byAgent[name]) byAgent[name] = { count: 0, total: 0, approved: 0 };
    byAgent[name].count++;
    byAgent[name].total += Number(c.amount || 0);
    if (c.status === 'approved') byAgent[name].approved += Number(c.amount || 0);
  });
  const agents = Object.entries(byAgent).sort((a, b) => b[1].total - a[1].total);
  const fc = n => Number(n || 0).toLocaleString();

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('CollectionsTab')} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.lg }}>
        <View style={{ width: 5, height: 22, backgroundColor: colors.success, borderRadius: 3 }} />
        <Feather name="users" size={18} color={colors.success} />
        <Text style={{ fontSize: 19, fontFamily: ff?.extraBold, color: colors.t1, flex: 1 }}>التحصيلات اليومية لكل مندوب</Text>
        <Feather name="chevron-left" size={18} color={colors.t3} />
      </View>
      {agents.length === 0 ? (
        <Text style={{ color: colors.t3, textAlign: 'center', fontFamily: ff?.regular, paddingVertical: spacing.lg }}>لا توجد تحصيلات اليوم</Text>
      ) : agents.map(([name, data], i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: i < agents.length - 1 ? 1 : 0, borderBottomColor: colors.border + '60' }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md }}>
            <Feather name="user" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontFamily: ff?.bold, color: colors.t1 }}>{name}</Text>
            <Text style={{ fontSize: 14, fontFamily: ff?.regular, color: colors.t3 }}>{data.count} سند</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 19, fontFamily: ff?.black, color: colors.success }}>{fc(data.total)}</Text>
            {data.approved > 0 && <Text style={{ fontSize: 13, fontFamily: ff?.semiBold, color: colors.primary }}>معتمد: {fc(data.approved)}</Text>}
          </View>
        </View>
      ))}
    </TouchableOpacity>
  );
}

// ── Daily cashier supplies widget (admin only)
function DailyCashierSupplies({ supplies, usersMap, colors, spacing, radius, ff, navigation }) {
  const today = new Date().toISOString().slice(0, 10);
  const todaySupp = supplies.filter(x => x.created_at?.startsWith(today));
  const byCashier = {};
  todaySupp.forEach(x => {
    const name = usersMap[x.user_id] || x.user_name || 'غير محدد';
    if (!byCashier[name]) byCashier[name] = { count: 0, total: 0 };
    byCashier[name].count++;
    byCashier[name].total += Number(x.amount || 0);
  });
  const cashiers = Object.entries(byCashier).sort((a, b) => b[1].total - a[1].total);
  const fc = n => Number(n || 0).toLocaleString();

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('SuppliesTab')} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.lg }}>
        <View style={{ width: 5, height: 22, backgroundColor: colors.cyan, borderRadius: 3 }} />
        <Feather name="briefcase" size={18} color={colors.cyan} />
        <Text style={{ fontSize: 19, fontFamily: ff?.extraBold, color: colors.t1, flex: 1 }}>التوريدات اليومية لكل محاسب</Text>
        <Feather name="chevron-left" size={18} color={colors.t3} />
      </View>
      {cashiers.length === 0 ? (
        <Text style={{ color: colors.t3, textAlign: 'center', fontFamily: ff?.regular, paddingVertical: spacing.lg }}>لا توجد توريدات اليوم</Text>
      ) : cashiers.map(([name, data], i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: i < cashiers.length - 1 ? 1 : 0, borderBottomColor: colors.border + '60' }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cyan + '15', alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md }}>
            <Feather name="briefcase" size={16} color={colors.cyan} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontFamily: ff?.bold, color: colors.t1 }}>{name}</Text>
            <Text style={{ fontSize: 14, fontFamily: ff?.regular, color: colors.t3 }}>{data.count} توريد</Text>
          </View>
          <Text style={{ fontSize: 19, fontFamily: ff?.black, color: colors.cyan }}>{fc(data.total)}</Text>
        </View>
      ))}
    </TouchableOpacity>
  );
}

// ── NEW Widget 1: Overdue Invoices Alert 
function OverdueInvoicesWidget({ invoices, colors, spacing, radius, ff, navigation }) {
  const overdueInvs = invoices
    .filter(inv => Number(inv.delay_days || 0) > 0 && Number(inv.payment_remaining_amount ?? inv.remaining_amount ?? 0) > 0.1)
    .sort((a, b) => b.delay_days - a.delay_days)
    .slice(0, 5);
  const totalOverdue = overdueInvs.reduce((s, i) => s + Number(i.payment_remaining_amount ?? i.remaining_amount ?? 0), 0);
  const fc = n => Number(n || 0).toLocaleString();

  if (overdueInvs.length === 0) return null;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('InvoicesTab')} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger + '30', borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderRightWidth: 4, borderRightColor: colors.danger }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.lg }}>
        <Feather name="alert-triangle" size={20} color={colors.danger} />
        <Text style={{ fontSize: 17, fontFamily: ff?.extraBold, color: colors.danger, flex: 1 }}>فواتير متأخرة السداد</Text>
        <View style={{ backgroundColor: colors.danger + '15', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }}>
          <Text style={{ fontFamily: ff?.black, color: colors.danger, fontSize: 13 }}>{overdueInvs.length}</Text>
        </View>
      </View>
      <View style={{ backgroundColor: colors.danger + '08', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: ff?.semiBold, color: colors.t2, fontSize: 14 }}>إجمالي المتأخر</Text>
        <Text style={{ fontFamily: ff?.black, color: colors.danger, fontSize: 20 }}>{fc(totalOverdue)} ر.ي</Text>
      </View>
      {overdueInvs.map((inv, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: i < overdueInvs.length - 1 ? 1 : 0, borderBottomColor: colors.border + '40' }}>
          <Feather name="file-text" size={14} color={colors.t3} style={{ marginLeft: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: ff?.bold, color: colors.t1, fontSize: 13 }}>{inv.pos_name || inv.invoice_number}</Text>
          </View>
          <View style={{ backgroundColor: colors.danger + '12', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
            <Text style={{ fontFamily: ff?.bold, color: colors.danger, fontSize: 11 }}>{inv.delay_days} يوم</Text>
          </View>
        </View>
      ))}
    </TouchableOpacity>
  );
}

// ── Widget: Sales vs Collections weekly comparison
function WeeklyComparisonWidget({ trend, colors, spacing, radius, ff, navigation }) {
  const fc = n => Number(n || 0).toLocaleString();
  const { thisWeekSales, lastWeekSales, thisWeekCol, lastWeekCol } = trend;
  const salesDiff = thisWeekSales - lastWeekSales;
  const salesPct = lastWeekSales > 0 ? Math.round((salesDiff / lastWeekSales) * 100) : (thisWeekSales > 0 ? 100 : 0);
  const colDiff = thisWeekCol - lastWeekCol;
  const colPct = lastWeekCol > 0 ? Math.round((colDiff / lastWeekCol) * 100) : (thisWeekCol > 0 ? 100 : 0);
  const salesUp = salesDiff >= 0;
  const colUp = colDiff >= 0;

  function TrendRow({ label, icon, thisVal, lastVal, pct, isUp, accentColor }) {
    const tColor = isUp ? colors.success : colors.danger;
    return (
      <View style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: accentColor + '15', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={icon} size={14} color={accentColor} />
          </View>
          <Text style={{ fontFamily: ff?.bold, color: colors.t1, fontSize: 13, flex: 1 }}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: tColor + '12', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
            <Feather name={isUp ? 'arrow-up-right' : 'arrow-down-right'} size={12} color={tColor} />
            <Text style={{ fontFamily: ff?.bold, color: tColor, fontSize: 11 }}>{isUp ? '+' : ''}{pct}%</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1, backgroundColor: accentColor + '08', borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: accentColor + '20' }}>
            <Text style={{ fontFamily: ff?.regular, color: colors.t3, fontSize: 11 }}>هذا الأسبوع</Text>
            <Text style={{ fontFamily: ff?.bold, color: accentColor, fontSize: 18 }}>{fc(thisVal)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.bg2, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: spacing.sm, alignItems: 'center' }}>
            <Text style={{ fontFamily: ff?.regular, color: colors.t3, fontSize: 11 }}>الأسبوع الماضي</Text>
            <Text style={{ fontFamily: ff?.bold, color: colors.t2, fontSize: 18 }}>{fc(lastVal)}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('InvoicesTab')} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.lg }}>
        <View style={{ width: 5, height: 22, backgroundColor: colors.primary, borderRadius: 3 }} />
        <Feather name="activity" size={18} color={colors.primary} />
        <Text style={{ fontSize: 15, fontFamily: ff?.extraBold, color: colors.t1, flex: 1 }}>المقارنة الأسبوعية</Text>
        <Feather name="chevron-left" size={18} color={colors.t3} />
      </View>
      <TrendRow label="المبيعات" icon="trending-up" thisVal={thisWeekSales} lastVal={lastWeekSales} pct={salesPct} isUp={salesUp} accentColor={colors.primary} />
      <View style={{ height: 1, backgroundColor: colors.border + '40', marginVertical: spacing.sm }} />
      <TrendRow label="التحصيلات" icon="dollar-sign" thisVal={thisWeekCol} lastVal={lastWeekCol} pct={colPct} isUp={colUp} accentColor={colors.success} />
    </TouchableOpacity>
  );
}

// ── Widget: Premium animated agent distribution chart
function AgentDistributionChart({ data, colors, spacing, radius, ff }) {
  const fc = n => Number(n || 0).toLocaleString();
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => Math.max(d.sales || 0, d.collections || 0)), 1);

  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.lg }}>
        <View style={{ width: 5, height: 22, backgroundColor: colors.purple, borderRadius: 3 }} />
        <Feather name="users" size={18} color={colors.purple} />
        <Text style={{ fontSize: 15, fontFamily: ff?.extraBold, color: colors.t1, flex: 1 }}>أداء المناديب</Text>
      </View>
      {/* Legend */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.primary }} />
          <Text style={{ fontSize: 12, fontFamily: ff?.semiBold, color: colors.t3 }}>مبيعات</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.success }} />
          <Text style={{ fontSize: 12, fontFamily: ff?.semiBold, color: colors.t3 }}>تحصيلات</Text>
        </View>
      </View>
      {data.map((agent, idx) => {
        const salesPct = Math.max(Math.round(((agent.sales || 0) / maxVal) * 100), 2);
        const colPct = Math.max(Math.round(((agent.collections || 0) / maxVal) * 100), 2);
        const colRate = (agent.sales || 0) > 0 ? Math.round(((agent.collections || 0) / (agent.sales || 1)) * 100) : 0;
        const rateColor = colRate >= 80 ? colors.success : colRate >= 50 ? colors.warning : colors.danger;
        return (
          <View key={idx} style={{ marginBottom: idx < data.length - 1 ? spacing.lg : 0 }}>
            {/* Agent header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: agent.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: ff?.bold, color: agent.color }}>{idx + 1}</Text>
              </View>
              <Text style={{ fontFamily: ff?.bold, color: colors.t1, fontSize: 16, flex: 1 }}>{agent.name}</Text>
              <View style={{ backgroundColor: rateColor + '12', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
                <Text style={{ fontSize: 13, fontFamily: ff?.bold, color: rateColor }}>{colRate}%</Text>
              </View>
            </View>
            {/* Sales bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <View style={{ flex: 1, height: 8, backgroundColor: colors.bg2, borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ width: `${salesPct}%`, height: 8, backgroundColor: colors.primary, borderRadius: 4 }} />
              </View>
              <Text style={{ fontSize: 12, fontFamily: ff?.semiBold, color: colors.primary, width: 60, textAlign: 'left' }}>{fc(agent.sales)}</Text>
            </View>
            {/* Collections bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ flex: 1, height: 8, backgroundColor: colors.bg2, borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ width: `${colPct}%`, height: 8, backgroundColor: colors.success, borderRadius: 4 }} />
              </View>
              <Text style={{ fontSize: 12, fontFamily: ff?.semiBold, color: colors.success, width: 60, textAlign: 'left' }}>{fc(agent.collections)}</Text>
            </View>
            {idx < data.length - 1 && <View style={{ height: 1, backgroundColor: colors.border + '30', marginTop: spacing.md }} />}
          </View>
        );
      })}
    </View>
  );
}


export default function DashboardScreen({ navigation }) {
  const { user, selectedPhase, projectId } = useAuth();
  const { colors, spacing, radius, fontSize, shadow, isDark, scale, fontFamily: ff } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow, scale, ff);

  const [stats, setStats] = useState({ totalSales: 0, totalCollected: 0, totalPending: 0, invoicesCount: 0, collectionEfficiency: 0 });
  const [inventory, setInventory] = useState({ total: 0, health: [] });
  const [topAgents, setTopAgents] = useState([]);
  const [chartData, setChart] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [pieData, setPie] = useState([]);
  const [allCollections, setAllCollections] = useState([]);
  const [allSupplies, setAllSupplies] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [weeklyTrend, setWeeklyTrend] = useState({ thisWeekSales: 0, lastWeekSales: 0, thisWeekCol: 0, lastWeekCol: 0 });



  const [cashierStats, setCashierStats] = useState({ pendingCount: 0, pendingAmount: 0, todayApproved: 0, totalSupplied: 0, todaySupplied: 0 });
  const [walletChart, setWalletChart] = useState({ items: [] });

  const loadDashboard = useCallback(async () => {
    try {
      const role = user?.role;
      const isAdmin = role === 'admin';
      const isCashier = role === 'cashier';
      const isAgent = role === 'agent';



      const invFilters = isAgent ? { agent_id: user.id, project_id: projectId } : { project_id: projectId };
      const colFilters = isAgent ? { agent_id: user.id, project_id: projectId } : { project_id: projectId };
      if (selectedPhase) {
        invFilters.phase_id = selectedPhase.id;
        colFilters.phase_id = selectedPhase.id;
      }

      const invoices = await getLocalInvoices(invFilters) || [];
      const collections = await getLocalCollections(colFilters) || [];
      setAllInvoices(invoices);
      setAllCollections(collections);

      const totalSales = invoices.reduce((s, i) => s + Number(i.net_amount || i.total_amount || 0), 0);
      const totalPending = invoices.reduce((s, i) => s + Number(i.payment_remaining_amount ?? i.remaining_amount ?? 0), 0);
      const approved = collections.filter(c => c.status === 'approved');
      const totalCollected = approved.reduce((s, c) => s + Number(c.amount || 0), 0);
      const efficiency = totalSales > 0 ? Math.round((totalCollected / totalSales) * 100) : 0;

      console.log(`[Dashboard] role=${role || 'unknown'} invoices=${invoices.length} collections=${collections.length} totalSales=${totalSales} totalPending=${totalPending} totalCollected=${totalCollected}`);

      setStats({ totalSales, totalCollected, totalPending, invoicesCount: invoices.length, collectionEfficiency: efficiency });

      // Weekly trend — sales vs collections
      const now = new Date();
      const startOfThisWeek = new Date(now); startOfThisWeek.setDate(now.getDate() - now.getDay());
      const startOfLastWeek = new Date(startOfThisWeek); startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);
      const thisWeekStr = startOfThisWeek.toISOString().slice(0, 10);
      const lastWeekStr = startOfLastWeek.toISOString().slice(0, 10);
      const thisWeekCol = approved.filter(c => (c.approved_at || c.collection_date || '') >= thisWeekStr).reduce((s, c) => s + Number(c.amount || 0), 0);
      const lastWeekCol = approved.filter(c => { const d = c.approved_at || c.collection_date || ''; return d >= lastWeekStr && d < thisWeekStr; }).reduce((s, c) => s + Number(c.amount || 0), 0);
      const thisWeekSales = invoices.filter(i => (i.invoice_date || i.created_at || '') >= thisWeekStr).reduce((s, i) => s + Number(i.net_amount || i.total_amount || 0), 0);
      const lastWeekSales = invoices.filter(i => { const d = i.invoice_date || i.created_at || ''; return d >= lastWeekStr && d < thisWeekStr; }).reduce((s, i) => s + Number(i.net_amount || i.total_amount || 0), 0);
      setWeeklyTrend({ thisWeekSales, lastWeekSales, thisWeekCol, lastWeekCol });

      if (isAgent) {
        const walletItems = await getAgentWalletCategoryBalances(user.id, projectId, selectedPhase?.id);
        console.log(`[Dashboard:Wallet] agent_id=${user.id} categories=${walletItems.length}`);
        setWalletChart({
          items: (walletItems || []).map(item => ({
            category_id: item.category_id,
            category_name: item.category_name || 'غير معروف',
            remaining_cards: Math.max(0, Number(item.remaining_cards || 0)),
          })),
        });
      }

      if (isAdmin || isCashier) {
        const pendingCols = collections.filter(c => c.status === 'pending');
        const today = new Date().toISOString().slice(0, 10);
        const approvedToday = collections.filter(c => c.status === 'approved' && c.approved_at?.startsWith(today) && (isAdmin || c.approved_by === user.id))
          .reduce((s, c) => s + Number(c.amount || 0), 0);
        const supplies = await getLocalSupplies({ project_id: projectId }) || [];
        setAllSupplies(supplies);
        const totalSupplied = supplies.filter(x => isAdmin || x.user_id === user.id).reduce((s, x) => s + Number(x.amount || 0), 0);
        const todaySupplied = supplies.filter(x => x.created_at?.startsWith(today) && (isAdmin || x.user_id === user.id)).reduce((s, x) => s + Number(x.amount || 0), 0);
        setCashierStats({ pendingCount: pendingCols.length, pendingAmount: pendingCols.reduce((s, c) => s + Number(c.amount || 0), 0), todayApproved: approvedToday, totalSupplied, todaySupplied });

        const [gT, cHealth, usersAll] = await Promise.all([
          getInventoryGlobalTotals(invFilters),
          getInventoryCategoryHealth(invFilters),
          getLocalUsers(projectId)
        ]);
        console.log(`[Dashboard:Inventory] categories=${cHealth.length} totalRemaining=${Number(gT?.remaining || 0)}`);
        console.log(`[Dashboard:Inventory] category totals=${JSON.stringify((cHealth || []).map(item => ({ name: item.name, remaining: Number(item.remaining || 0) })))}`);
        const uMap = {};
        usersAll.forEach(u => { uMap[u.id] = u.name; });
        setUsersMap(uMap);

        setInventory({ total: Number(gT?.remaining || 0), health: cHealth });

        if (isAdmin) {
          const agentUsers = usersAll.filter(u => u.role === 'agent');
          const byAgentSales = {};
          invoices.forEach(inv => {
            const name = uMap[inv.agent_id] || 'غير معروف';
            byAgentSales[name] = (byAgentSales[name] || 0) + Number(inv.net_amount || inv.total_amount || 0);
          });
          setTopAgents(Object.keys(byAgentSales).map(name => ({ name, amount: byAgentSales[name] })).sort((a, b) => b.amount - a.amount).slice(0, 3));

          const byAgentCol = {};
          approved.forEach(c => {
            const name = uMap[c.agent_id] || 'غير معروف';
            byAgentCol[name] = (byAgentCol[name] || 0) + Number(c.amount || 0);
          });
          // Build dual data: sales + collections per agent
          const allAgentNames = [...new Set([...Object.keys(byAgentSales), ...Object.keys(byAgentCol)])];
          setPie(allAgentNames.map((key, i) => ({
            name: formatName(key), collections: byAgentCol[key] || 0, sales: byAgentSales[key] || 0, color: getColor(i),
          })));
        }
      }

      const days = getLast7Days();
      setChart(days.map(date =>
        collections.filter(c => c.status === 'approved' && (c.approved_at?.startsWith(date) || c.collection_date?.startsWith(date)))
          .reduce((s, c) => s + Number(c.amount || 0), 0)
      ));
    } catch (e) { console.log('Dashboard error', e); }
  }, [projectId, selectedPhase?.id, user]);

  useFocusEffect(useCallback(() => { loadDashboard(); }, [loadDashboard]));

  // ── Live data subscription: refresh dashboard on any local data change ──
  useEffect(() => {
    const unsub = subscribeDataChanges((event) => {
      const relevant = ['invoices', 'invoice_items', 'agent_wallets', 'collections', 'batches', 'card_categories', 'all'];
      if (relevant.includes(event.type)) {
        loadDashboard();
      }
    });
    return () => unsub && unsub();
  }, [loadDashboard]);

  const formatName = (name) => !name ? 'غير معروف' : name.length > 10 ? name.substring(0, 10) + '..' : name;
  const getLast7Days = () => { const a = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); a.push(d.toISOString().slice(0, 10)); } return a; };
  const getLast7Labels = () => { const a = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); a.push(d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })); } return a; };
  const getColor = (i) => [colors.primary, colors.success, colors.warning, colors.purple, colors.cyan, colors.danger][i % 6];
  const fc = (n) => Number(n || 0).toLocaleString();

  const chartConfig = {
    backgroundGradientFrom: colors.card, backgroundGradientTo: colors.card, decimalPlaces: 0,
    color: (opacity = 1) => isDark ? `rgba(148, 163, 184, ${opacity})` : `rgba(29, 78, 216, ${opacity})`,
    labelColor: () => colors.t3,
    fillShadowGradientFrom: colors.primary, fillShadowGradientFromOpacity: 0.5,
    fillShadowGradientTo: colors.bg, fillShadowGradientToOpacity: 0,
    propsForDots: { r: '4', strokeWidth: '2', stroke: colors.blueL, fill: colors.card },
    propsForBackgroundLines: { stroke: colors.border, strokeDasharray: '4' },
  };

  const isAdmin = user?.role === 'admin';
  const isCashier = user?.role === 'cashier';
  const isAgent = user?.role === 'agent';

  const cashierSupplyEfficiency = cashierStats.todayApproved > 0 ? Math.round((cashierStats.todaySupplied / cashierStats.todayApproved) * 100) : (cashierStats.todaySupplied > 0 ? 100 : 0);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* ── Compact Phase Label ── */}
      {selectedPhase && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md, alignSelf: 'flex-start', backgroundColor: colors.primary + '10', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
          <Feather name={selectedPhase.status === 'closed' ? "lock" : "layers"} size={14} color={colors.primary} />
          <Text style={{ fontSize: 13, fontFamily: ff?.bold, color: colors.primary }}>{selectedPhase.name}</Text>
          {selectedPhase.status === 'closed' && (
            <Text style={{ fontSize: 10, fontFamily: ff?.regular, color: colors.danger, marginLeft: 4 }}>(مغلقة)</Text>
          )}
        </View>
      )}


      {/* ── Admin Metrics ── */}
      {isAdmin && (
        <View style={s.metricsGrid}>
          <MetricCard icon="trending-up" title="إجمالي المبيعات" value={fc(stats.totalSales)} color={colors.primary} s={s} ff={ff} onPress={() => navigation.navigate('InvoicesTab')} />
          <MetricCard icon="dollar-sign" title="التحصيلات المعتمدة" value={fc(stats.totalCollected)} color={colors.success} s={s} ff={ff} onPress={() => navigation.navigate('CollectionsTab')} />
          <MetricCard icon="clock" title="مبالغ معلقة" value={fc(stats.totalPending)} color={colors.warning} s={s} ff={ff} onPress={() => navigation.navigate('InvoicesTab')} />
          <MetricCard icon="file-text" title="إجمالي الفواتير" value={stats.invoicesCount} color={colors.t2} s={s} ff={ff} onPress={() => navigation.navigate('InvoicesTab')} />
        </View>
      )}

      {/* ── Agent wallet – 3 columns (compact) ── */}
      {isAgent && (
        <View style={[s.metricsGrid, { justifyContent: 'flex-start' }]}>
          {walletChart.items.length > 0 ? walletChart.items.map((item, idx) => {
            const count = Math.max(0, Number(item.remaining_cards || 0));
            const isZero = count === 0;
            const catColor = [colors.primary, colors.success, colors.warning, colors.purple, colors.cyan, colors.danger][idx % 6];
            return (
              <TouchableOpacity key={item.category_id || idx} activeOpacity={0.85} onPress={() => navigation.navigate('WalletsTab')}
                style={[s.walletCard3Col, { borderTopColor: catColor, borderTopWidth: 3 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4, gap: 4 }}>
                  <Feather name={isZero ? 'alert-circle' : 'layers'} size={11} color={catColor} />
                  <Text style={{ fontSize: 10, fontFamily: ff?.semiBold, color: colors.t3 }} numberOfLines={1} ellipsizeMode="tail">{item.category_name}</Text>
                </View>
                <Text style={{ fontSize: 24, fontFamily: ff?.bold, color: isZero ? colors.danger : colors.primary, textAlign: 'center', lineHeight: 28 }}>{count}</Text>
                <Text style={{ fontSize: 9, fontFamily: ff?.regular, color: colors.t3, textAlign: 'center' }}>ورقة متوفرة</Text>
              </TouchableOpacity>
            );
          }) : (
            <View style={{ flex: 1, padding: 20, alignItems: 'center', width: W - 32 }}>
              <Text style={[s.emptyText, { fontFamily: ff?.regular }]}>لا يوجد رصيد كروت حالياً</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Cashier Metrics ── */}
      {isCashier && (
        <View style={s.metricsGrid}>
          <MetricCard icon="loader" title="تنتظر الاعتماد" value={cashierStats.pendingCount} color={colors.warning} s={s} ff={ff} onPress={() => navigation.navigate('CashierTab')} />
          <MetricCard icon="credit-card" title="إجمالي المعلق" value={fc(cashierStats.pendingAmount)} color={colors.warning} s={s} ff={ff} onPress={() => navigation.navigate('CashierTab')} />
          <MetricCard icon="check-circle" title="تم اعتماده اليوم" value={fc(cashierStats.todayApproved)} color={colors.success} s={s} ff={ff} onPress={() => navigation.navigate('CollectionsTab')} />
          <MetricCard icon="arrow-up-right" title="توريدات اليوم" value={fc(cashierStats.todaySupplied)} color={colors.primary} s={s} ff={ff} onPress={() => navigation.navigate('SuppliesTab')} />
        </View>
      )}

      {/* ── Daily agent collections (admin+cashier) ── */}
      {(isAdmin || isCashier) && (
        <DailyAgentCollections collections={allCollections} usersMap={usersMap} colors={colors} spacing={spacing} radius={radius} ff={ff} navigation={navigation} />
      )}

      {/* ── NEW: Last 3 Days Collections (Cashier only) ── */}
      {isCashier && (
        <Last3DaysCollectionsWidget collections={allCollections} colors={colors} spacing={spacing} radius={radius} ff={ff} />
      )}

      {/* ── Daily cashier supplies (admin only) ── */}
      {isAdmin && (
        <DailyCashierSupplies supplies={allSupplies} usersMap={usersMap} colors={colors} spacing={spacing} radius={radius} ff={ff} navigation={navigation} />
      )}

      {/* ── Efficiency Gauge (below supplies, role-aware) ── */}
      {!isCashier && <EfficiencyGauge percent={stats.collectionEfficiency} s={s} colors={colors} spacing={spacing} ff={ff} />}
      {isCashier && <SupplyEfficiencyGauge percent={cashierSupplyEfficiency} s={s} colors={colors} spacing={spacing} ff={ff} />}

      {/* ── NEW: Overdue invoices alert widget (admin+cashier) ── */}
      {(isAdmin || isCashier) && (
        <OverdueInvoicesWidget invoices={allInvoices} colors={colors} spacing={spacing} radius={radius} ff={ff} navigation={navigation} />
      )}

      {/* ── Top Agents (admin only) ── */}
      {isAdmin && (
        <>
          <SectionTitle icon="award" title="أعلى المناديب مبيعاً" s={s} colors={colors} ff={ff} />
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('InvoicesTab')} style={s.sectionCard}>
            {topAgents.length === 0 ? (
              <Text style={[s.emptyText, { fontFamily: ff?.regular }]}>لا توجد مبيعات بعد</Text>
            ) : topAgents.map((agent, idx) => (
              <View key={idx} style={[s.agentRow, idx < topAgents.length - 1 && s.agentBorder]}>
                <View style={s.agentLeft}>
                  <View style={[s.agentRankBadge, { backgroundColor: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32' }]}>
                    <Text style={{ fontSize: 13, fontFamily: ff?.black, color: colors.bg }}>{idx + 1}</Text>
                  </View>
                  <Text style={[s.agentName, { fontFamily: ff?.bold }]}>{agent.name}</Text>
                </View>
                <Text style={[s.agentAmt, { fontFamily: ff?.black }]}>{fc(agent.amount)}</Text>
              </View>
            ))}
          </TouchableOpacity>
        </>
      )}

      {/* ── Collections Chart (7 days) ── */}
      <SectionTitle icon="bar-chart-2" title={isAgent ? "تحصيلاتي آخر 7 أيام" : "التحصيلات — آخر 7 أيام"} s={s} colors={colors} ff={ff} />
      <View style={s.chartWrap}>
        <LineChart
          data={{ labels: getLast7Labels(), datasets: [{ data: chartData.some(d => d > 0) ? chartData : [0, 0, 0, 0, 0, 0, 0] }] }}
          width={W - spacing.xl * 2} height={220} chartConfig={chartConfig} bezier style={{ borderRadius: radius.xl }} withInnerLines={false}
        />
      </View>

      {/* ── Weekly Comparison: Sales vs Collections ── */}
      {isAdmin && (
        <WeeklyComparisonWidget trend={weeklyTrend} colors={colors} spacing={spacing} radius={radius} ff={ff} navigation={navigation} />
      )}

      {/* ── Agent Distribution: Sales vs Collections (admin) ── */}
      {isAdmin && pieData.length > 0 && (
        <AgentDistributionChart data={pieData} colors={colors} spacing={spacing} radius={radius} ff={ff} />
      )}

      {isAdmin && <InventoryHealthWidget inventory={inventory} colors={colors} spacing={spacing} ff={ff} s={s} navigation={navigation} />}

      {isCashier && (
        <Btn label="الانتقال لاعتماد التحصيلات" icon="check-square" variant="primary" style={{ marginTop: 20 }} onPress={() => navigation.navigate('CashierTab')} />
      )}
    </ScrollView>
  );
}
