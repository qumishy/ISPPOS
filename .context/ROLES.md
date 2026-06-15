# Roles And Permissions

Roles are enforced through `AuthContext.js`, `permissionsService.js`, and navigation filtering in `AppNavigator.js`. Critical restrictions must also be enforced in services.

## Admin / Manager
- Manages projects/phases, users, categories, settings, permissions, reports, discount approvals.
- Can close/resume phases under rules.
- Can perform higher-risk approvals/deletes.
- Has access to general operations log.

## Cashier / Accountant
- Handles collections approval, supplies/deposits, financial flows.
- Can approve pending collections if permission allows.
- Should not bypass project/phase restrictions.

## Agent
- Creates invoices and collections within own scope.
- Views own wallet/inventory/POS context.
- Cannot approve own collections.
- Dashboard wallet values must be scoped by `agent_id`, `project_id`, `phase_id`.

## Project + Phase
- User session is tied to `project_id`.
- All screens and service queries must respect current project.
- Selected/current phase filters most operational data.
- Closed phases are view-only.
