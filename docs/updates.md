# Update System

## Update Channels

The application supports two update paths:

- Expo OTA updates for compatible JavaScript and asset changes.
- GitHub Release APK updates for native/full builds, native modules, permissions, or installer-based releases.

## APK Release Flow

1. A push to `main` or manual workflow dispatch runs `.github/workflows/build.yml`.
2. CI installs dependencies, generates the Android project, and assembles a release APK.
3. The APK is uploaded as a short-retention workflow artifact and as a GitHub Release asset tagged with the app version.
4. `updateService.js` queries the configured repository's latest release, selects an APK asset using `assetPattern`, downloads it, and opens the Android installer.

The current configuration lives at `expo.extra.githubRelease` in `app.json` and requires `owner`, `repo`, and `assetPattern`.

## Implementation Locations

- `src/services/updateService.js`
- `src/screens/UpdatesScreen.js`
- `src/screens/SettingsScreen.js`
- `src/navigation/AppNavigator.js`
- `app.json`
- `.github/workflows/build.yml`

## Safety

- Do not publish service credentials in release configuration.
- Treat a push to `main` as release-affecting because it triggers the build/release workflow.
- Use React Native's `Linking` unless `expo-linking` is deliberately added and configured.
