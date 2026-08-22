# AGENTS.md — ISPPOS

This file is the canonical cross-agent engineering instruction source for this repository. Agent-specific entry points must defer to it. Detailed architecture and domain behavior live under `docs/`.

## Project Overview

ISPPOS (Smart POS Net) is an Arabic RTL, offline-first Expo React Native application for ISP card inventory, sales, collections, approvals, returns, supplies, operational phases, notifications, and reporting.

The application uses JavaScript, React Native, Expo SDK 50, local SQLite, and Supabase. `package.json` and `app.json` are authoritative for exact dependency and application versions.

## Architecture Map

Entry flow:

```text
index.js -> App.js -> ThemeProvider -> LoadingProvider -> AuthProvider -> AppNavigator
```

Runtime flow for operational data:

```text
screens -> domain services -> SQLite -> sync_queue -> SyncService -> Supabase
```

- Screens render UI and call services. Business validation, calculations, mutations, queueing, and notifications belong in services.
- SQLite is the operational source of truth. Business screens load from SQLite rather than making direct Supabase reads.
- Supabase provides project-license lookup, online user lookup with local login fallback, cloud synchronization, realtime updates, push-token persistence, remote backup/restore support, and named online-only operations.
- `notifyDataChanged` / `subscribeDataChanges` refresh local consumers after writes and synchronization.

See `docs/architecture.md` and `docs/sync.md` for the detailed flow.

## Canonical Roles And Permissions

The canonical persisted role IDs are defined by `ROLE_DEFINITIONS` and permission resolution code:

- `admin` — general administrator
- `cashier` — accountant/cashier
- `agent` — sales agent

`manager` and other names accepted by compatibility checks in some screens/services are legacy aliases, not canonical persisted roles. Do not create or persist them without an explicit schema/domain decision.

Permissions must be enforced in services for sensitive operations; navigation visibility alone is not authorization. Resolve permissions through `permissionPolicy.js`, `permissionsService.js`, and `AuthContext.js`.

Agent collection self-approval is not a default role capability. It is allowed only when the specific agent has the per-user `AgentSelfCollectionApproval` permission and all service policy checks pass, including ownership, project scope, active status, eligible collection status, and absence of blocking discount or card-return decisions.

Card-return approval is restricted by the service to an active `admin` in the same project.

See `docs/domains/roles-and-permissions.md`.

## Critical Contracts And Invariants

### Project And Phase Scope

- `project_id` is the top-level tenant scope. Never fall back to unscoped cross-project business queries.
- `phase_id` scopes operational records where supported. New invoices and collections require the active phase.
- Closed phases are view-only. Block create, update, delete, and approval operations against a closed phase.
- If a required project or active phase is missing, block the operation with a clear Arabic error; do not ask the user to type an ID.
- Preserve active/inactive, soft-delete, cancellation, and rejection filters in calculations.

### Default Offline-First Mutation Flow

Unless a named exception below applies, an operational mutation should:

1. Validate project, phase, role/permission, business rules, and closed-phase state.
2. Write SQLite promptly.
3. Add the required `sync_queue` operation with project/phase/record context.
4. Record or update `operations_log` where the domain supports it.
5. Notify local subscribers and return control to the UI.
6. Let `SyncService.js` push in the background.

Do not block a successful local mutation while waiting for ordinary background synchronization.

### Named Architectural Exceptions

- **Admin inventory mutations:** `createOnlineAdminBatch` requires connectivity and inserts the batch remotely before saving it locally. `createOnlineAdminAgentWallet` likewise requires connectivity, calls the `create_admin_wallet_distribution_atomic` Supabase RPC first, then stores the authoritative returned batch/wallet state in SQLite as synced. Do not convert these paths to queued offline mutations without a deliberate design change.
- **License and online login:** project-license and initial online user checks are remote operations, with cached local user login fallback after a successful online login.
- **Remote backup/restore and push-token persistence:** these are explicit remote service workflows, not screen-level business reads.

### Invoice Sync Integrity

- Invoice header, invoice items, and wallet updates are one logical sync bundle through `upsert_invoice_bundle_atomic`.
- Never push an invoice header without locally saved items.
- Missing dependent wallet queue state must keep the invoice operation failed/pending rather than create a partial remote invoice.
- Duplicate invoice and collection numbers are handled by the conflict-recovery/renumbering logic; do not bypass it.

### Document Numbering

Invoice and collection numbers are generated locally through `documentNumberService.js`. They are project/phase/agent scoped and monthly, using the current agent-code prefix and a four-digit sequence. Preserve conflict recovery during sync.

### Financial And Inventory Integrity

- Use the approved discounted `net_amount` when applicable; otherwise use `total_amount` as the invoice basis.
- Payment totals and approval totals are distinct. Preserve the current status-calculation rules.
- Inventory sales come from active invoice items, not collection totals.
- Allocate invoice-level collections proportionally when reporting by batch.
- Do not repair or delete financial data without a read-only audit, backup, preview, and explicit approval.

See `docs/data-model.md` and `docs/domains/inventory-and-reports.md`.

## Source Of Truth Map

- Runtime schema and SQLite migrations: `src/services/dbCore.js`
- Domain mutations and calculations: `src/services/*Service.js`
- Sync tables, sanitization, pull/push behavior: `src/services/SyncService.js`
- Canonical role/permission policy: `src/services/permissionPolicy.js`, `src/services/permissionsService.js`, `src/services/AuthContext.js`
- Navigation exposure: `src/navigation/AppNavigator.js`
- Remote SQL history: `migrations/` and `supabase/migrations/`
- Dependency and app versions: `package.json`, `app.json`
- Living architecture/domain documentation: `docs/`
- Historical evidence only: `docs/history/`
- Reusable tool-managed agent skills: `.agents/skills/` and `skills-lock.json` (do not merge into project instructions)

When documentation and implementation disagree, inspect the implementation and migrations, then update documentation as part of the task when authorized.

## Engineering Workflow

1. Read this file and the task-relevant `docs/` pages.
2. Search targeted files and trace the active service path before editing.
3. Report diagnosis and the intended minimal change before edits.
4. Keep diffs narrow; do not refactor unrelated code.
5. Preserve Arabic RTL behavior and use theme tokens from `ThemeContext`.
6. Keep user-facing application text in Arabic unless the existing surface explicitly uses another language.
7. Run proportional validation and report changed files, behavior, and results.

## Validation Commands

- JavaScript syntax: `node --check path/to/file.js`
- Install dependencies: `npm install`
- Start Expo: `npm start`
- Run Android: `npm run android`
- Android export diagnostic: `npx expo export --platform android --clear`
- Preview APK build: `npm run build` or `eas build -p android --profile preview`

Run `node --check` on every changed JavaScript file. After moving or renaming files, validate all affected imports. Use broader build diagnostics in proportion to the change and environment.

## Git And Data Safety

- Never delete or reset databases to fix defects.
- No data repair SQL without read-only audit evidence and explicit approval.
- Never commit service-role keys, database passwords, tokens, or secrets.
- Preserve unrelated user changes in a dirty worktree.
- Do not commit or push unless the user explicitly requests it.
- Pushes to `main` trigger the Android release workflow; treat that branch accordingly.

## Documentation Map

- `docs/architecture.md` — runtime layers, startup, scope, and mutation exceptions
- `docs/data-model.md` — current local data model and numbering/status contracts
- `docs/sync.md` — initial sync, outgoing queue, atomic invoice sync, and sanitization
- `docs/development.md` — stack, commands, coding, and validation guidance
- `docs/updates.md` — OTA and GitHub Release APK flow
- `docs/domains/inventory-and-reports.md` — inventory/report calculations and deletion semantics
- `docs/domains/operations.md` — operations log and retry behavior
- `docs/domains/roles-and-permissions.md` — canonical roles and permission gates
- `docs/domains/ui-behavior.md` — durable UI acceptance criteria
- `docs/history/` — dated, non-current audits, import records, and troubleshooting snapshots

Legacy `.context/` files are retained temporarily for migration review and are not canonical. `AGENT.md`, `CLAUDE.md`, and `.agent-context.md` are compatibility or agent-specific entry points that defer to this file.
