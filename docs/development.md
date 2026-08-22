# Development

## Current Stack

- Expo SDK 50, React 18.2, React Native 0.73
- JavaScript only
- React Navigation 6
- `expo-sqlite` local storage
- `@supabase/supabase-js` remote client
- NetInfo connectivity
- Expo notifications and updates
- IBM Plex Sans Arabic, custom theme/styles, Arabic RTL UI
- Chart Kit and React Native SVG

Use `package.json` and `app.json` for exact versions and application identifiers.

## Commands

```text
npm install
npm start
npm run android
npm run build
node --check path/to/file.js
npx expo export --platform android --clear
eas build -p android --profile preview
```

`npm run build` maps to the EAS Android preview build. There is no repository test script at the time of this documentation migration.

## Coding Rules

- Keep changes minimal and task-scoped.
- Keep business logic and mutation validation in services.
- Keep business reads SQLite-first.
- Preserve project/phase scope, permissions, closed-phase guards, and active/deletion filters.
- Preserve Arabic RTL layout and use theme spacing, color, radius, type, and font tokens.
- Prefer installed React Native/Expo APIs; do not add a dependency without a concrete need.
- Never reset a database or delete business data as a debugging shortcut.
- Write read-only audit queries before proposing data repair.

## Validation

- Run `node --check` for every changed JavaScript file.
- After a move/rename, search all imports and references to the old and new paths.
- For Metro/Gradle failures, inspect the earliest real Metro or native error rather than only the final Gradle wrapper message.
- For schema errors, compare `dbCore.js`, current migrations, remote schema, and `SyncService` sanitization.
- Use Android export/build validation when changes affect bundling, assets, navigation, native configuration, or imports.

## High-Risk Areas

- invoice creation, wallet deduction, and atomic synchronization;
- project isolation and phase filtering;
- inventory/report calculations;
- collection and card-return approval policy;
- startup critical-data readiness;
- operation log/queue retry behavior;
- backup/restore and update installation.

Dated past incidents and workarounds are recorded in `docs/history/troubleshooting-snapshots-2026-06.md`; they are not automatically current diagnoses.
