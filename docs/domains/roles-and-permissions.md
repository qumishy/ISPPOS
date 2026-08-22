# Roles And Permissions

## Authoritative Sources

- `src/services/permissionPolicy.js`
- `src/services/permissionsService.js`
- `src/services/AuthContext.js`
- service-level authorization functions
- `src/navigation/AppNavigator.js` for visibility only

Service authorization is authoritative for sensitive actions. Navigation and screen guards are defense-in-depth and must not be the only check.

## Canonical Persisted Roles

| ID | Arabic label | Core intent |
|---|---|---|
| `admin` | المدير العام | protected system administration and sensitive approvals |
| `cashier` | المحاسب | collection approval and allowed financial/supply workflows |
| `agent` | المندوب | scoped sales, collections, and agent-owned operational data |

The policy does not define `manager` or `accountant` as separate persisted IDs. Some screens and compatibility helpers accept `manager`. Treat it as noncanonical until a deliberate migration or role policy adds it.

## Permission Resolution

Default role permissions are defined in `DEFAULT_ROLE_PERMISSIONS`. Entity/user overrides are resolved through the permissions services. System-locked permissions protect critical access such as administration and general collection approval.

An enabled navigation item does not authorize a mutation. Services must verify user identity, active state, project ownership, role/permission, record status, and phase state.

## Agent Collection Self-Approval

Agents cannot self-approve by default. An individual agent may receive the user-only `AgentSelfCollectionApproval` permission.

Even with that permission, `getCollectionApprovalDecision` requires:

- canonical role `agent` and active actor;
- actor and collection in the same nonempty project;
- collection owned by that agent;
- active collection in an eligible pending status;
- no pending card return;
- no unresolved blocking discount.

The permission never grants access to approve another agent's collection or to bypass project/status rules.

## Card Returns And Discounts

`approveCardReturnRequest` verifies that the approver is an active `admin` in the same project. Discount and card-return UI may contain compatibility role checks, but the service policy remains authoritative.

## Phase Rules

All roles remain subject to project and phase scope. Closed phases are view-only. Role privilege does not override a closed-phase mutation guard unless a specifically designed phase-management operation says otherwise.
