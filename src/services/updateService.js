import * as Updates from 'expo-updates';
import { Alert, Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';

const LAST_UPDATE_CHECK_KEY = 'isp_last_update_check';
const CACHED_MANDATORY_UPDATE_KEY = 'isp_cached_mandatory_update';

// ─── OTA (Expo Updates) — JS/assets only ───────────────────────────

let hasCheckedOtaThisSession = false;
let isOtaUpdateDownloaded = false;

export const checkForOtaUpdate = async () => {
  try {
    if (!Updates.isEnabled || __DEV__) {
      return { isAvailable: false, message: 'OTA updates disabled in this environment' };
    }
    const update = await Updates.checkForUpdateAsync();
    return { isAvailable: update.isAvailable };
  } catch (error) {
    console.log('OTA check error:', error);
    return { isAvailable: false, error };
  }
};

export const fetchOtaUpdate = async () => {
  try {
    const result = await Updates.fetchUpdateAsync();
    if (result.isNew) {
      isOtaUpdateDownloaded = true;
      return true;
    }
    return false;
  } catch (error) {
    console.log('OTA fetch error:', error);
    return false;
  }
};

export const reloadApp = async () => {
  try {
    await Updates.reloadAsync();
  } catch (error) {
    console.log('Reload error:', error);
  }
};

export const checkAndApplyOtaUpdateSilently = async () => {
  if (hasCheckedOtaThisSession || isOtaUpdateDownloaded) return;
  hasCheckedOtaThisSession = true;

  try {
    if (!Updates.isEnabled || __DEV__) return;

    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        isOtaUpdateDownloaded = true;
        Alert.alert(
          'تحديث جديد متاح',
          'تم تنزيل تحديث جديد للتطبيق في الخلفية. هل تريد إعادة تشغيل التطبيق لتطبيقه الآن؟',
          [
            { text: 'لاحقاً', style: 'cancel' },
            { text: 'إعادة التشغيل', onPress: () => reloadApp() },
          ]
        );
      }
    }
  } catch (error) {
    console.log('Silent OTA update error:', error);
  }
};

export const manualCheckForOtaUpdate = async () => {
  try {
    if (!Updates.isEnabled || __DEV__) {
      Alert.alert('تنبيه', 'التحديثات غير مفعلة في هذه البيئة (بيئة التطوير).');
      return;
    }

    if (isOtaUpdateDownloaded) {
      Alert.alert(
        'التحديث جاهز',
        'تم تنزيل التحديث مسبقاً. هل تريد إعادة التشغيل الآن لتطبيقه؟',
        [
          { text: 'لاحقاً', style: 'cancel' },
          { text: 'إعادة التشغيل', onPress: () => reloadApp() },
        ]
      );
      return;
    }

    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        isOtaUpdateDownloaded = true;
        Alert.alert(
          'تم تنزيل التحديث',
          'تم تنزيل التحديث بنجاح. هل تريد إعادة تشغيل التطبيق لتطبيقه الآن؟',
          [
            { text: 'لاحقاً', style: 'cancel' },
            { text: 'إعادة التشغيل', onPress: () => reloadApp() },
          ]
        );
      } else {
        Alert.alert('تنبيه', 'أنت تستخدم أحدث إصدار متاح.');
      }
    } else {
      Alert.alert('تنبيه', 'لا يوجد تحديث جديد. أنت تستخدم أحدث إصدار.');
    }
  } catch (error) {
    console.log('Manual OTA update error:', error);
    Alert.alert('خطأ', 'حدث خطأ أثناء التحقق من التحديثات. قد لا يوجد اتصال بالإنترنت.');
  }
};

// ─── Backward-compatible aliases (kept for existing callers) ───────

export const checkForUpdate = checkForOtaUpdate;
export const fetchUpdate = fetchOtaUpdate;
export const checkAndApplyUpdateSilently = checkAndApplyOtaUpdateSilently;
export const manualCheckForUpdate = manualCheckForOtaUpdate;

// ─── Runtime environment detection ─────────────────────────────────

export const isExpoGo = () => {
  try {
    if (Constants?.appOwnership === 'expo') return true;
    const execEnv = Constants?.executionEnvironment;
    if (execEnv === 'storeClient' || execEnv === 'expoGo') return true;
    return false;
  } catch (_) {
    return false;
  }
};

export const isStandalone = () => !isExpoGo();

// ─── App version / build number ────────────────────────────────────

const getConfigVersion = () => String(
  Constants?.expoConfig?.version ||
  Constants?.manifest2?.extra?.expoClient?.version ||
  Constants?.manifest?.version ||
  '0.0.0'
);

const getConfigBuildNumber = () => Number(
  Constants?.expoConfig?.android?.versionCode ||
  Constants?.manifest2?.extra?.expoClient?.android?.versionCode ||
  Constants?.manifest?.android?.versionCode ||
  0
);

export const getCurrentAppVersion = () => {
  if (isExpoGo()) return getConfigVersion();
  try {
    const native = Application?.nativeApplicationVersion;
    if (native) return String(native);
  } catch (_) {}
  return getConfigVersion();
};

export const getCurrentBuildNumber = () => {
  if (isExpoGo()) return getConfigBuildNumber();
  try {
    const native = Application?.nativeBuildVersion;
    if (native) return Number(native) || 0;
  } catch (_) {}
  return getConfigBuildNumber();
};

// ─── Supabase APK update manifest ─────────────────────────────────

const isValidApkUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.length > 5 && (trimmed.startsWith('http://') || trimmed.startsWith('https://'));
};

export const fetchLatestSupabaseUpdate = async () => {
  const { supabase } = require('./supabase');

  const { data, error } = await supabase
    .from('app_updates')
    .select('platform, latest_version, latest_build_number, apk_url, release_notes, force_update, minimum_supported_build, published_at')
    .eq('platform', 'android')
    .eq('active', true)
    .order('latest_build_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('لم يتم العثور على سجل تحديث.');

  return {
    platform: data.platform || 'android',
    latestVersion: data.latest_version || '0.0.0',
    latestBuildNumber: Number(data.latest_build_number) || 0,
    apkUrl: data.apk_url || '',
    releaseNotes: data.release_notes || '',
    forceUpdate: !!data.force_update,
    minimumSupportedBuild: Number(data.minimum_supported_build) || 0,
    publishedAt: data.published_at || '',
    apkUrlValid: isValidApkUrl(data.apk_url),
  };
};

// ─── Build-number comparison ───────────────────────────────────────

export const isBuildNewer = (remoteBuild, localBuild) => {
  return Number(remoteBuild) > Number(localBuild);
};

const parseSemver = (v) => String(v || '0.0.0').replace(/^v/i, '').split('.').map(x => Number(x || 0));

export const isVersionNewer = (latest, current) => {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
};

// ─── Last update check persistence ─────────────────────────────────

export const getLastUpdateCheck = async () => {
  try {
    const raw = await AsyncStorage.getItem(LAST_UPDATE_CHECK_KEY);
    return raw ? Number(raw) : 0;
  } catch (_) {
    return 0;
  }
};

const saveLastUpdateCheck = async () => {
  try {
    await AsyncStorage.setItem(LAST_UPDATE_CHECK_KEY, String(Date.now()));
  } catch (_) {}
};

// ─── Cached mandatory update state ─────────────────────────────────

export const getCachedMandatoryUpdate = async () => {
  try {
    const raw = await AsyncStorage.getItem(CACHED_MANDATORY_UPDATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

const cacheMandatoryUpdate = async (manifest) => {
  try {
    await AsyncStorage.setItem(CACHED_MANDATORY_UPDATE_KEY, JSON.stringify(manifest));
  } catch (_) {}
};

const clearCachedMandatoryUpdate = async () => {
  try {
    await AsyncStorage.removeItem(CACHED_MANDATORY_UPDATE_KEY);
  } catch (_) {}
};

// ─── Unified APK update check ──────────────────────────────────────

export const checkForApkUpdate = async () => {
  let manifest;
  try {
    manifest = await fetchLatestSupabaseUpdate();
    await saveLastUpdateCheck();
  } catch (error) {
    const runtime = isExpoGo() ? 'Expo Go' : 'standalone';
    console.log(`[UpdateService] APK check failed (${runtime}):`, error?.message || error);
    throw new Error('تعذر فحص التحديثات. تأكد من اتصال الإنترنت ثم حاول مرة أخرى.');
  }

  const currentBuild = getCurrentBuildNumber();
  const currentVersion = getCurrentAppVersion();
  const runtime = isExpoGo() ? 'Expo Go' : 'standalone';

  console.log(`[UpdateService] Runtime: ${runtime}, local: v${currentVersion} build ${currentBuild}, remote: v${manifest.latestVersion} build ${manifest.latestBuildNumber}`);

  const hasUpdate = manifest.latestBuildNumber > currentBuild ||
    (manifest.latestBuildNumber === currentBuild && isVersionNewer(manifest.latestVersion, currentVersion));

  const isMandatory = manifest.forceUpdate &&
    manifest.latestBuildNumber > currentBuild &&
    manifest.apkUrlValid;

  const belowMinimum = manifest.minimumSupportedBuild > 0 &&
    currentBuild < manifest.minimumSupportedBuild;

  const result = {
    hasUpdate,
    isMandatory: isMandatory || belowMinimum,
    manifest,
    currentVersion,
    currentBuild,
    lastCheck: Date.now(),
    isExpoGo: isExpoGo(),
  };

  if (result.isMandatory && manifest.apkUrlValid) {
    await cacheMandatoryUpdate(manifest);
  } else {
    await clearCachedMandatoryUpdate();
  }

  return result;
};

// ─── Open update URL ───────────────────────────────────────────────

export const openUpdateUrl = async (apkUrl) => {
  if (!isValidApkUrl(apkUrl)) {
    throw new Error('رابط التحديث غير صالح.');
  }
  try {
    const supported = await Linking.canOpenURL(apkUrl);
    if (supported) {
      await Linking.openURL(apkUrl);
    } else {
      throw new Error('لا يمكن فتح رابط التنزيل.');
    }
  } catch (error) {
    throw new Error('تعذر فتح رابط التنزيل. تأكد من اتصال الإنترنت.');
  }
};

// ─── APK download (retained for in-app download flow) ──────────────

export const formatBytesAr = (bytes) => {
  const n = Number(bytes || 0);
  if (!n) return 'غير معروف';
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} ج.ب`;
};

let _downloadTask = null;

export const downloadReleaseApk = async ({ url, filename, onProgress }) => {
  if (!url) throw new Error('رابط التنزيل غير صالح.');
  const safeFileName = filename || `update_${Date.now()}.apk`;
  const targetUri = `${FileSystem.cacheDirectory}${safeFileName}`;

  _downloadTask = FileSystem.createDownloadResumable(
    url,
    targetUri,
    {},
    (progress) => {
      try {
        const total = Number(progress?.totalBytesExpectedToWrite || 0);
        const written = Number(progress?.totalBytesWritten || 0);
        const pct = total > 0 ? Math.round((written / total) * 100) : 0;
        if (typeof onProgress === 'function') onProgress(pct, written, total);
      } catch (e) {}
    }
  );

  const result = await _downloadTask.downloadAsync();
  _downloadTask = null;
  if (!result?.uri) throw new Error('فشل تنزيل ملف التحديث.');
  return result.uri;
};

export const cancelApkDownload = async () => {
  try {
    if (_downloadTask) {
      await _downloadTask.pauseAsync();
      _downloadTask = null;
    }
  } catch (e) {}
};

export const installDownloadedApk = async (apkUri) => {
  if (!apkUri) throw new Error('ملف التحديث غير موجود.');
  try {
    const contentUri = await FileSystem.getContentUriAsync(apkUri);
    const opened = await Linking.openURL(contentUri);
    if (!opened) {
      throw new Error('تعذر فتح مثبت التطبيق.');
    }
    return true;
  } catch (e) {
    try {
      await Linking.openSettings();
    } catch (_) {}
    throw new Error('تعذر فتح مثبت APK. تأكد من السماح بتثبيت التطبيقات من هذا المصدر.');
  }
};
