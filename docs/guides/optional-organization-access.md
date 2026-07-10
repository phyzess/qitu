# Optional Organization Access

Status: optional example
Date: 2026-07-10

Qitu remains single-organization by default. Applications that need tenant-owned workspaces may copy
the executable example under `examples/organization-access` instead of extending the starter's
global role field into an accidental multi-tenant model.

## Invariants

1. Organization membership and platform membership are separate records.
2. A platform role never implies customer-organization membership.
3. An active organization is accepted only after the server verifies an active membership or an
   explicit, unexpired support-access grant.
4. A disabled organization rejects both membership and support access.
5. Support access is read-only, organization-specific, reason-bearing, revocable, and time boxed.
6. Organization entitlements are feature gates, not permission substitutes.
7. Cross-organization resource use requires a grant for the exact recipient organization, resource,
   and action.
8. App-owned queries still scope every tenant-owned row by the resolved organization id.

## Adoption

1. Copy `examples/organization-access/migrations/0001_organization_access.sql` into the app-owned
   Worker migration sequence.
2. Copy or import the access-context rules into the deployable app.
3. Define organization roles and permissions in the app-owned RBAC policy.
4. Resolve access once per request from server-side records; never trust a client-provided
   organization id without membership validation.
5. Pass the resolved organization id into every app-owned query and commit Adapter.
6. Record the events below through the app's audit store.

The example resource helper checks organization scope; it does not replace the app-owned RBAC
permission check for the requested action. Callers provide one canonical action policy that maps
each action key to `read` or `write`, so read-only support access cannot be bypassed with conflicting
mode parameters. Unclassified actions fail closed.

Required audit events:

```text
organization.created
organization.membership_created
organization.membership_updated
organization.entitlement_updated
resource_grant.created
resource_grant.revoked
support_access.granted
support_access.used
support_access.revoked
```

## Production Migration

Use `docs/templates/organization-migration-runbook.md` as the rollout record. The safe order is:

```text
export/backup
-> schema migration
-> deploy organization-aware code
-> dry-run account/data classification
-> apply classification
-> read-only post-apply checks
```

Do not remove a platform-only user from a customer organization until the deployed code can resolve
platform membership. Keep exact user identities and customer mappings in operator-only environment
variables or reviewed migration input; never commit them to the repository.

## Deliberately App-Owned

Qitu does not define customer contracts, billing plans, business resource types, data-sharing
projections, or simulation/report semantics. Those remain app-owned even when the generic access
example is adopted.
