import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, Animated, Easing, ScrollView,
} from 'react-native';
import { useTheme } from '../theme';
import { statusLabel, statusColor } from '../utils/helpers';
import { makeStyles } from '../styles/ui.styles';

// ══════════════════════════════════════════════════════
//  BASIC COMPONENTS
// ══════════════════════════════════════════════════════

export function Card({ children, style, header, footer, title, sub }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={[s.card, style]}>
      {(header || title) && (
        <View style={s.cardHeader}>
          {header || (
            <View>
              <Text style={s.cardTitle}>{title}</Text>
              {sub && <Text style={s.cardSub}>{sub}</Text>}
            </View>
          )}
        </View>
      )}
      {children}
      {footer && <View style={s.divider}>{footer}</View>}
    </View>
  );
}

export function Badge({ status, label, color, style }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const c = color || statusColor(status);
  const l = label || statusLabel(status);
  return (
    <View style={[s.badge, { borderColor: c + '40', backgroundColor: c + '12' }, style]}>
      <View style={[s.badgeDot, { backgroundColor: c }]} />
      <Text style={[s.badgeText, { color: c }]}>{l}</Text>
    </View>
  );
}

export function Btn({ label, onPress, variant='primary', size='md', icon, style, disabled, loading }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  
  const variants = {
    primary: { bg: colors.blue,   b: colors.blueG,  t: '#fff' },
    success: { bg: colors.green,  b: colors.greenL, t: '#fff' },
    danger:  { bg: colors.red,    b: colors.redL,   t: '#fff' },
    outline: { bg: 'transparent', b: colors.border2, t: colors.t1 },
    ghost:   { bg: 'transparent', b: 'transparent',  t: colors.blue },
  };
  const v = variants[variant] || variants.primary;
  
  const sizes = {
    sm: { h: 36, p: spacing.md, f: fontSize.sm },
    md: { h: 48, p: spacing.xl, f: fontSize.lg },
    lg: { h: 56, p: spacing.xxl, f: fontSize.xl },
  };
  const sz = sizes[size] || sizes.md;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        s.btn, 
        { height: sz.h, paddingHorizontal: sz.p, backgroundColor: v.bg, borderColor: v.b },
        variant === 'primary' && shadow.blue,
        disabled && s.btnDisabled,
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.t} size="small" />
      ) : (
        <>
          {icon && <Text style={{ fontSize: sz.f + 2 }}>{icon}</Text>}
          <Text style={[s.btnText, { color: v.t, fontSize: sz.f }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function Input({ label, value, onChangeText, placeholder, icon, secureTextEntry, keyboardType, multiline, style, error }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <View style={s.inputWrap}>
      {label && <Text style={[s.label, isFocused && { color: colors.blue }]}>{label}</Text>}
      <View style={[
        s.inputContainer,
        multiline && { height: undefined, minHeight: 100 },
        isFocused && { borderColor: colors.blue, backgroundColor: colors.bg },
        error && { borderColor: colors.red },
        style
      ]}>
        <TextInput
          style={[s.input, multiline && { height: 100, textAlignVertical: 'top' }, multiline && style && { height: style.height }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.t3}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {icon && <Text style={{ fontSize: 18, marginLeft: spacing.sm }}>{icon}</Text>}
      </View>
      {error && <Text style={s.inputError}>{error}</Text>}
    </View>
  );
}

export function Picker({ label, options, value, onChange, placeholder, loading: pLoading }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const [isFocused, setIsFocused] = React.useState(false);
  const selected = options?.find(o => String(o.value) === String(value));
  const [open, setOpen] = React.useState(false);

  // Styles can be part of ui.styles or inline for simplicity if they are specific
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.t2, marginBottom: 6, textAlign: 'right' }}>{label}</Text>}
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.bg2,
          borderWidth: 1,
          borderColor: open ? colors.blue : colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          height: 50,
        }}
        onPress={() => !pLoading && setOpen(!open)}
        activeOpacity={0.8}
      >
        {pLoading ? (
          <ActivityIndicator size="small" color={colors.blue} style={{ flex: 1 }} />
        ) : (
          <Text style={{ fontSize: fontSize.md, color: selected ? colors.t1 : colors.t3, textAlign: 'right', flex: 1 }}>
            {selected ? selected.label : (placeholder || 'اختر...')}
          </Text>
        )}
        <Text style={{ color: colors.t3, marginLeft: 10 }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{
          marginTop: 4,
          backgroundColor: colors.card,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          ...shadow.md,
          overflow: 'hidden',
          zIndex: 1000,
        }}>
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
            {options.length === 0 ? (
              <Text style={{ color: colors.t3, textAlign: 'center', padding: spacing.md }}>لا توجد خيارات</Text>
            ) : (
              options.map(opt => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={{
                    padding: spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: String(value) === String(opt.value) ? colors.blue + '10' : 'transparent',
                  }}
                  onPress={() => { onChange(opt.value); setOpen(false); }}
                >
                  <Text style={{
                    fontSize: fontSize.md,
                    color: String(value) === String(opt.value) ? colors.blue : colors.t2,
                    textAlign: 'right',
                    fontWeight: String(value) === String(opt.value) ? '700' : '400',
                  }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}


export function Row({ children, style }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function Loading({ label = 'جاري التحميل...' }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={s.loading}>
      <View style={s.loadingSpinWrap}>
        <ActivityIndicator color={colors.blue} size="large" />
        <View style={s.loadingGlow} />
      </View>
      <Text style={s.loadingText}>{label}</Text>
    </View>
  );
}

export function Empty({ icon = '📂', title = 'لا توجد بيانات', sub, action, onAction }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>{icon}</Text>
      <Text style={s.emptyTitle}>{title}</Text>
      {sub && <Text style={s.emptySub}>{sub}</Text>}
      {action && <Btn label={action} variant="outline" size="sm" onPress={onAction} style={{ marginTop: 10 }} />}
    </View>
  );
}

export function SectionHeader({ title, icon, action, onAction, style }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={[s.sectionHeader, style]}>
      <View style={s.sectionTitleWrap}>
        <View style={{ width: 4, height: 20, backgroundColor: colors.blue, borderRadius: 2 }} />
        {icon && <Text style={{ fontSize: 18 }}>{icon}</Text>}
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ color: colors.blue, fontWeight: '700', fontSize: fontSize.sm }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function ProgressBar({ percent = 0, color, height = 8, showLabel = false }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const p = Math.min(Math.max(percent, 0), 100);
  const c = color || colors.blue;
  return (
    <View style={{ width: '100%', marginVertical: 4 }}>
      {showLabel && (
        <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 10, color: colors.t3, fontWeight: '700' }}>{p.toFixed(0)}%</Text>
        </Row>
      )}
      <View style={[s.progressTrack, { height, borderRadius: height / 2 }]}>
        <View style={[s.progressFill, { width: `${p}%`, height, backgroundColor: c, borderRadius: height / 2 }]} />
      </View>
    </View>
  );
}

export function KpiCard({ value, label, color, icon, style }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={[s.kpiCard, style]}>
      {icon && <Text style={{ fontSize: 20, marginBottom: 5 }}>{icon}</Text>}
      <Text style={[s.kpiValue, { color: color || colors.t1 }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40, color, style }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const bg = color || colors.blue;
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg + '15' }, style]}>
      <Text style={[s.avatarTxt, { color: bg, fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

export function ScreenHeader({ kpis, tabs, activeTab, onTabSelect, search, onSearch, searchPlaceholder = 'بحث...', action, onAction }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={s.shWrapper}>
      {kpis && kpis.length > 0 && (
        <View style={s.shKpiStrip}>
          {kpis.map((kpi, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={s.shKpiDivider} />}
              <View style={s.shKpiItem}>
                <Text style={[s.shKpiVal, { color: kpi.color || colors.t1 }]} numberOfLines={1} adjustsFontSizeToFit>{kpi.value}</Text>
                <Text style={s.shKpiLabel}>{kpi.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      )}
      {tabs && tabs.length > 0 && (
        <View style={s.shTabBar}>
          {tabs.map(tab => {
            const active = activeTab === tab.k;
            return (
              <TouchableOpacity key={tab.k} style={[s.shTab, active && s.shTabActive]} onPress={() => onTabSelect && onTabSelect(tab.k)} activeOpacity={0.75}>
                {tab.icon ? <Text style={{ fontSize: 11 }}>{tab.icon}</Text> : null}
                <Text style={[s.shTabTxt, active && s.shTabTxtActive]}>{tab.l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {(onSearch || action) && (
        <View style={s.shToolbar}>
          {onSearch && (
            <View style={s.shSearchBox}>
              <Text style={{ fontSize: 13, color: colors.t3 }}>🔍</Text>
              <TextInput style={s.shSearchInput} value={search} onChangeText={onSearch} placeholder={searchPlaceholder} placeholderTextColor={colors.t3} />
              {!!search && <TouchableOpacity onPress={() => onSearch('')}><Text style={{ color: colors.t3, fontSize: 13 }}>✕</Text></TouchableOpacity>}
            </View>
          )}
          {action && (
            <TouchableOpacity style={s.shActionBtn} onPress={onAction} activeOpacity={0.82}>
              <Text style={s.shActionTxt}>{action}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
