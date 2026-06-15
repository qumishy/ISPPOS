# CLAUDE.md

Guidance for Claude Code / AI coding agents working in ISPPOS.

## Read First
- `.agent-context.md`
- `.context/*.md`

## Golden Rules
- JavaScript only.
- SQLite-first/offline-first.
- Supabase is sync/license only.
- Minimal safe diffs.
- No unrelated refactors.
- No data repair SQL without audit + approval.
- Respect `project_id`, `phase_id`, active/soft-delete filters, permissions, and closed phases.
- Keep financial calculations exact.
- Do not assume schema. Inspect SQLite + Supabase schemas when syncing.

## Main Risk Areas
1. Invoice partial sync: headers can reach Supabase without items. Fix root cause before data repair.
2. Project isolation: no cross-project data leaks.
3. Inventory calculations: distinguish invoice sales, actual collections allocation, and distribution-report due values.
4. Operations screen: pending items must stay stable offline.
5. Payload sanitization: strip local-only fields before Supabase writes.

## Common Workflow
1. Search targeted files. Do not read huge files unnecessarily.
2. Report diagnosis and plan before edits.
3. Apply minimal diffs.
4. Run `node --check` on changed files.
5. Report files changed, logic changed, and validation result.
