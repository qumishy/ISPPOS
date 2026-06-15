# Update System

## In-App APK Updates
Implemented concept:
- `src/screens/UpdatesScreen.js`
- `src/services/updateService.js`
- settings entry in `SettingsScreen.js`
- route in `AppNavigator.js`
- GitHub release config in `app.json` under `expo.extra.githubRelease`.

## Source Of Updates
Use GitHub Releases, not GitHub Actions artifacts.
Flow:
1. GitHub Actions builds APK.
2. APK is uploaded as a Release asset.
3. App calls latest release API.
4. App reads APK asset `browser_download_url`.
5. App downloads APK and opens Android installer.

Required app config:
- `owner`
- `repo`
- `assetPattern`

Do not leave `REPLACE_OWNER` / `REPLACE_REPO` placeholders in production.

## Build Fix
Do not import `expo-linking` unless installed. Use React Native Linking:
`import { Alert, Linking } from 'react-native';`

## OTA vs APK
- Expo OTA updates remain for JS/assets where compatible.
- APK update path is for full/native builds, permissions, native modules, and release installs.
