# Historical Troubleshooting Snapshots — 2026-06

> **Historical snapshot. These incidents and workarounds do not establish the cause of a current failure unless explicitly revalidated.**

The former development context recorded these past issues:

- A missing `expo-linking` dependency was avoided by using `Linking` from `react-native`.
- Supabase PGRST204 unknown-column errors on invoice payloads were addressed through schema comparison and payload sanitization.
- Local `users.push_token` support required a SQLite column/migration.
- An invoice-save loading freeze was associated with awaiting noncritical operation-log work and incomplete loading cleanup; save paths should clear loading in `finally`.

For a new incident, inspect current source, current dependency versions, the first relevant Metro/native error, and current SQLite/remote schemas before applying any historical workaround.
