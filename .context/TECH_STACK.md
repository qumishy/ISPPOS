# Tech Stack

- Expo React Native, JavaScript only.
- React Navigation: stack/drawer/bottom tabs in `AppNavigator.js`.
- Local DB: `expo-sqlite`.
- Remote: Supabase client in `src/services/supabase.js`.
- Network: `@react-native-community/netinfo`.
- Notifications: `expo-notifications`.
- File/download/print/share: Expo file/print/share modules.
- Charts: `react-native-chart-kit`, `react-native-svg`.
- Theme/UI: custom `src/components/UI.js`, `src/theme`, `src/styles`.
- Updates: Expo OTA plus GitHub Releases APK update screen.

## Runtime Pattern
The app is a local-first operational tool. Supabase is used for license lookup, cloud sync, push-token storage, and remote backups. Business screens should render from SQLite.
