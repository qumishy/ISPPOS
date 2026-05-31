# Tech Stack

- React Native 0.73 / Expo SDK 50.
- Navigation: React Navigation stack, drawer, bottom tabs.
- Local DB: `expo-sqlite`.
- Remote: Supabase client in `src/services/supabase.js`.
- Notifications: `expo-notifications`.
- Printing/sharing: `expo-print`, `expo-sharing`, `expo-file-system`.
- UI: custom `src/components/UI.js`, theme in `src/theme`, styles in `src/styles`.
- Fonts: IBM Plex Sans Arabic patched globally in `App.js`.

## Notable Dependencies
- `@react-native-community/netinfo` for network state.
- `react-native-chart-kit` and `react-native-svg` for charts.
- `expo-updates` for silent update checks.

## Runtime Pattern
The app is a local-first operational tool. Supabase is used for login/license, push-token storage, and sync; it is not the source queried by business screens.
