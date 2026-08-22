import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import {
  checkForApkUpdate,
  getCurrentAppVersion,
  getCurrentBuildNumber,
  isExpoGo,
  getLastUpdateCheck,
  openUpdateUrl,
  downloadReleaseApk,
  installDownloadedApk,
  cancelApkDownload,
  formatBytesAr,
  manualCheckForOtaUpdate,
} from '../services/updateService';

export default function UpdatesScreen() {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [apkUri, setApkUri] = useState('');

  const [manifest, setManifest] = useState(null);
  const [updateResult, setUpdateResult] = useState(null);
  const [error, setError] = useState('');
  const [lastCheckTs, setLastCheckTs] = useState(0);

  const currentVersion = useMemo(() => getCurrentAppVersion(), []);
  const currentBuild = useMemo(() => getCurrentBuildNumber(), []);

  const loadLatest = useCallback(async () => {
    setChecking(true);
    setError('');
    setManifest(null);
    setUpdateResult(null);
    try {
      const result = await checkForApkUpdate();
      setUpdateResult(result);
      setManifest(result.manifest);
      setLastCheckTs(result.lastCheck);
    } catch (e) {
      setError(e?.message || 'تعذر التحقق من آخر إصدار.');
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLatest();
    return () => {
      cancelApkDownload().catch(() => {});
    };
  }, [loadLatest]);

  const onDownload = async () => {
    if (!manifest?.apkUrlValid) {
      Alert.alert('خطأ', 'رابط APK غير متوفر.');
      return;
    }
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const uri = await downloadReleaseApk({
        url: manifest.apkUrl,
        filename: `update_${manifest.latestVersion || Date.now()}.apk`,
        onProgress: (pct) => setDownloadProgress(Number(pct || 0)),
      });
      setApkUri(uri);
      Alert.alert('نجاح', 'تم تنزيل التحديث بنجاح.');
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'فشل تنزيل التحديث.');
    } finally {
      setDownloading(false);
    }
  };

  const onInstall = async () => {
    try {
      await installDownloadedApk(apkUri);
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'تعذر بدء التثبيت.');
    }
  };

  const onOpenUrl = async () => {
    try {
      await openUpdateUrl(manifest?.apkUrl);
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'تعذر فتح رابط التنزيل.');
    }
  };

  const formatLastCheck = (ts) => {
    if (!ts) return 'لم يُسجَّل بعد';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return 'غير معروف';
    }
  };

  const statusColor = useMemo(() => {
    if (updateResult?.isMandatory) return colors.danger;
    if (updateResult?.hasUpdate) return colors.warning;
    if (error) return colors.danger;
    return colors.success;
  }, [updateResult, error, colors]);

  const statusText = useMemo(() => {
    if (error) return 'تعذر فحص التحديثات';
    if (updateResult?.isMandatory) return 'يتطلب تحديث إجباري';
    if (updateResult?.hasUpdate) return 'يوجد تحديث جديد';
    if (updateResult && !updateResult.hasUpdate) return 'التطبيق محدث';
    return '';
  }, [updateResult, error]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
      {/* ── Version Info Card ── */}
      <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md }}>
        <Text style={{ color: colors.t1, fontSize: fontSize.lg, fontWeight: '800', marginBottom: 10 }}>التحديثات</Text>

        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.t2 }}>الإصدار الحالي: <Text style={{ color: colors.t1, fontWeight: '700' }}>{currentVersion}</Text></Text>
          <Text style={{ color: colors.t2 }}>الرقم التسلسلي: <Text style={{ color: colors.t1, fontWeight: '700' }}>{currentBuild || '—'}</Text></Text>
          {manifest && (
            <>
              <Text style={{ color: colors.t2 }}>آخر إصدار: <Text style={{ color: colors.t1, fontWeight: '700' }}>{manifest.latestVersion}</Text></Text>
              <Text style={{ color: colors.t2 }}>الرقم التسلسلي للتحديث: <Text style={{ color: colors.t1, fontWeight: '700' }}>{manifest.latestBuildNumber}</Text></Text>
            </>
          )}
          <Text style={{ color: colors.t2 }}>آخر فحص: <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatLastCheck(lastCheckTs)}</Text></Text>
        </View>

        {isExpoGo() && (
          <View style={{ marginTop: 12, backgroundColor: colors.blue + '10', borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.blue + '20' }}>
            <Text style={{ color: colors.blue, fontSize: fontSize.xs, fontWeight: '600' }}>
              تشغيل عبر Expo Go — أرقام الإصدار من إعدادات التطبيق
            </Text>
          </View>
        )}

        {/* ── Status ── */}
        {checking ? (
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.t2 }}>جاري التحقق من آخر إصدار...</Text>
          </View>
        ) : null}

        {!!error && !checking && (
          <Text style={{ marginTop: 14, color: colors.danger, fontWeight: '700' }}>{error}</Text>
        )}

        {!loading && !checking && !error && !!statusText && (
          <Text style={{ marginTop: 14, color: statusColor, fontWeight: '800' }}>
            {statusText}
          </Text>
        )}

        {updateResult?.isMandatory && (
          <View style={{ marginTop: 12, backgroundColor: colors.danger + '15', borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.danger + '30' }}>
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: fontSize.sm }}>
              هذا التحديث إجباري. يرجى تحديث التطبيق للمتابعة.
            </Text>
          </View>
        )}
      </View>

      {/* ── Release Notes ── */}
      {manifest?.releaseNotes ? (
        <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md }}>
          <Text style={{ color: colors.t1, fontSize: fontSize.md, fontWeight: '800', marginBottom: 8 }}>ملاحظات الإصدار</Text>
          <Text style={{ color: colors.t2, lineHeight: 22 }}>{manifest.releaseNotes}</Text>
        </View>
      ) : null}

      {/* ── Download button ── */}
      {updateResult?.hasUpdate && manifest?.apkUrlValid && !apkUri && (
        <TouchableOpacity
          disabled={downloading}
          onPress={onDownload}
          style={{
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            paddingVertical: 14,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            opacity: downloading ? 0.7 : 1,
          }}
        >
          {downloading ? <ActivityIndicator color="#fff" /> : <Feather name="download-cloud" size={18} color="#fff" />}
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize.md }}>
            {downloading ? `جاري التنزيل ${downloadProgress}%` : 'تنزيل التحديث'}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Open URL button (when download not started) ── */}
      {updateResult?.hasUpdate && manifest?.apkUrlValid && !apkUri && (
        <TouchableOpacity
          onPress={onOpenUrl}
          style={{
            marginTop: spacing.sm,
            borderRadius: radius.md,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.bg2,
          }}
        >
          <Feather name="external-link" size={16} color={colors.t2} />
          <Text style={{ color: colors.t2, fontWeight: '700' }}>فتح صفحة التنزيل</Text>
        </TouchableOpacity>
      )}

      {/* ── Install button ── */}
      {!!apkUri && (
        <TouchableOpacity
          onPress={onInstall}
          style={{
            backgroundColor: colors.success,
            borderRadius: radius.md,
            paddingVertical: 14,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Feather name="package" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize.md }}>تثبيت التحديث</Text>
        </TouchableOpacity>
      )}

      {/* ── Refresh button ── */}
      <TouchableOpacity
        onPress={loadLatest}
        disabled={checking}
        style={{
          marginTop: spacing.md,
          borderRadius: radius.md,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: colors.bg2,
          opacity: checking ? 0.5 : 1,
        }}
      >
        {checking ? <ActivityIndicator size="small" color={colors.t2} /> : <Feather name="refresh-cw" size={16} color={colors.t2} />}
        <Text style={{ color: colors.t2, fontWeight: '700' }}>{checking ? 'جاري الفحص...' : 'إعادة التحقق'}</Text>
      </TouchableOpacity>

      {/* ── OTA check button (JS/assets only) ── */}
      <View style={{ marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.t3, fontSize: fontSize.xs, marginBottom: 8 }}>تحديثات JavaScript والأصول (OTA)</Text>
        <TouchableOpacity
          onPress={manualCheckForOtaUpdate}
          style={{
            borderRadius: radius.md,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: colors.primary + '40',
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.primary + '10',
          }}
        >
          <Feather name="code" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.sm }}>فحص تحديثات OTA</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
