# Roles And Permissions

Roles are defined/enforced through `AuthContext.js`, `permissionsService.js`, and navigation filtering in `AppNavigator.js`.

## Admin
- Full operational access.
- Manages phases, users, categories, settings, permissions, reports, discount approvals.
- Can close/resume phases and perform higher-risk deletes/approvals.

## Cashier / Accountant
- Focuses on collection approval, supplies, and financial flows.
- Can approve pending collections.
- Uses cashier/dashboard collection widgets.

## Agent
- Creates invoices and collections for own scope.
- Views own wallets/inventory and assigned POS context.
- Cannot approve own collections.

## Project And Phase
- User/session is tied to `project_id`.
- UI filters most data by selected phase.
- Closed phase shows read-only banner and disables create/approve/delete actions in relevant screens.

## Permission Notes
- `ROLE_PERMISSIONS` provides default screen access.
- `app_permissions` supports local custom permission data.
- Always enforce critical business restrictions in services, not only UI.
