# Organization Access Example

This optional example proves a business-neutral organization access seam without changing qitu's
single-organization starter defaults.

It includes:

1. Organization membership and entitlement records.
2. Platform membership that stays separate from customer organization membership.
3. Explicit, expiring, read-only support access grants.
4. Organization-to-organization resource grants.
5. A copyable D1 migration under `migrations/`.

The example is intentionally pure TypeScript. A cloned app should copy the migration and adapt its
own D1 queries, routes, permission registry, and audit events around the exported access rules. It
must not treat a platform role as implicit customer-organization membership. The resource helper
checks organization scope only; callers must still enforce the app-owned RBAC permission for the
requested action. Its canonical action-policy map classifies each action as read or write and
rejects unknown actions, preventing contradictory mode inputs from weakening read-only support
access.
