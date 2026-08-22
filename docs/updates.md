# Update System

## Overview

The application supports two independent update channels:

1. **OTA (Expo Updates)** — JavaScript and asset updates only. Cannot update native Android code, permissions, or native modules.
2. **APK (Native)** — Full application update via Supabase manifest. For native changes, versionCode bumps, and full rebuilds.

## Remote Manifest — `app_updates` Table

The APK update flow reads metadata from the Supabase `app_updates` table. This is the **single source of truth** for native update information.

### Schema

| Column | Type | Description |
|--------|------|-------------|
| `platform` | text | Target platform (`android`) |
| `latest_version` | text | Display version (e.g., `2.0.2`) |
| `latest_build_number` | integer | Android `versionCode` for reliable numeric comparison |
| `apk_url` | text | Direct APK download URL (empty = no update available) |
| `release_notes` | text | Arabic release notes |
| `force_update` | boolean | If true AND `latest_build_number > current`, block app usage |
| `minimum_supported_build` | integer | Oldest build that can still operate |
| `published_at` | timestamptz | When this record was published |
| `active` | boolean | Only the active record is served to clients |

### Query

The app queries:
```sql
SELECT * FROM app_updates
WHERE platform = 'android' AND active = true
ORDER BY latest_build_number DESC
LIMIT 1;
```

## Version / Build Comparison

Primary comparison uses **Android versionCode** (`latest_build_number` vs. installed `versionCode`):

- If `remote.latest_build_number > localBuildNumber` → update available.
- Semantic version string is used only as a secondary/display comparison.

Installed version/build is read via:
- `expo-application`: `nativeApplicationVersion` (version name) and `nativeBuildVersion` (version code)
- Fallback: `Constants.expoConfig.version` and `Constants.expoConfig.android.versionCode`

## Mandatory Update Rule

The app blocks usage **only when all conditions are true**:

1. `force_update === true`
2. `remote.latest_build_number > currentBuildNumber`
3. `apk_url` is valid (non-empty, starts with `http://` or `https://`)

If any condition fails, the app continues normally.

## Startup Behavior

On app startup (after DB init):

1. **OTA check** — `checkAndApplyOtaUpdateSilently()` runs silently. Downloads JS update in background, prompts restart.
2. **APK check** — `checkForApkUpdate()` queries Supabase.
   - If mandatory update is required → renders a blocking update screen.
   - If optional update → does nothing (user checks from Settings).
   - If offline or error → continues normally. Checks cached mandatory state from AsyncStorage.

## Settings Screen — "تحديثات التطبيق" Section

Displays:
- Current version and build number
- Update status: `التطبيق محدث` / `يوجد تحديث جديد` / `يتطلب تحديث إجباري` / `تعذر فحص التحديثات`
- Last check timestamp
- Latest version/build (when checked)
- Release notes (when available)
- **فحص التديث** button — calls `checkForApkUpdate()`
- **تحديث الآن** button — opens APK URL via `Linking` (only shown when valid update URL exists)

## Updates Screen

Dedicated screen with:
- Full version/build info
- Update status
- Release notes
- Download button (downloads APK in-app with progress)
- Open URL button (opens browser/download page)
- Install button (triggers Android APK installer)
- OTA check button (separate JS/assets check)

## OTA Updates (Expo)

Expo Updates is configured with:
- `updates.url`: `https://u.expo.dev/646d2fcc-0ecb-472b-abdb-2011179d1af0`
- `checkAutomatically`: `ON_LOAD`
- `runtimeVersion.policy`: `appVersion`

OTA updates handle JS bundle and asset changes only. They do not affect native APK updates.

## Publishing a New Update

### For APK updates (native changes):

1. Build APK: `eas build -p android --profile production`
2. Upload APK to a stable hosting location (GitHub Releases, Supabase Storage, etc.)
3. Update the `app_updates` table in Supabase:
   - Set previous record: `active = false`
   - Insert new record with:
     - `latest_version` — new version string
     - `latest_build_number` — new versionCode
     - `apk_url` — direct download URL
     - `release_notes` — Arabic release notes
     - `force_update` — true if mandatory
     - `minimum_supported_build` — oldest allowed build (0 = no minimum)
     - `active = true`
4. Users open the app → Settings → "تحديث الآن" to download and install.

### For OTA updates (JS/assets changes only):

1. Run `eas update` to publish to Expo Updates.
2. Users receive the update automatically on next app load.

## Implementation Locations

- `src/services/updateService.js` — core update service
- `src/screens/UpdatesScreen.js` — dedicated updates screen
- `src/screens/SettingsScreen.js` — settings with update section
- `src/screens/LoginScreen.js` — version display
- `src/navigation/AppNavigator.js` — screen registration
- `App.js` — startup update checks
- `app.json` — Expo and OTA config
- `package.json` — version (must match app.json)
- `supabase/migrations/20260822000000_app_updates_manifest.sql` — table migration

## Safety

- No business data (invoices, collections, wallets, sync_queue) is modified by update logic.
- User data is never deleted or reset.
- Offline mode continues normally (no crash, no block for optional updates).
- Mandatory updates only block when all conditions (force_update + build comparison + valid URL) are met.
- Service credentials are not published in release configuration.
