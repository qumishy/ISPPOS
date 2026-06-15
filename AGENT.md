# Agent Entry Point

Before making any code changes, read these files in order:

1. .agent-context.md
2. .context/ARCHITECTURE.md
3. .context/DATABASE.md
4. .context/SYNC_PROCESS.md
5. .context/DATA_INTEGRITY.md
6. .context/INVENTORY_AND_REPORTS.md
7. .context/OPERATIONS.md
8. .context/UI_BEHAVIOR.md
9. .context/UPDATE_SYSTEM.md
10. .context/DEVELOPMENT.md

Project rules:
- React Native + Expo.
- JavaScript only.
- SQLite First / Offline First.
- Supabase is sync/cloud only.
- Multi-project and multi-phase system.
- Always respect project_id and phase_id.
- Do not modify Supabase data before auditing sync_queue and operation logs.
- Use minimal safe diffs.
- Do not refactor unrelated code.