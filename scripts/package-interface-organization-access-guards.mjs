export function assertOrganizationAccessExample({ assert, exampleOrganizationAccess }) {
  const now = "2026-07-10T00:00:00.000Z";
  const organizations = [{ id: "org-customer", status: "active" }];
  const actionPolicy = { "record:read": "read", "record:update": "write" };
  const membershipResult = exampleOrganizationAccess.resolveOrganizationAccess({
    activeOrganizationId: "org-customer",
    entitlements: [
      { enabled: true, key: "feature:imports", organizationId: "org-customer" },
      { enabled: false, key: "feature:disabled", organizationId: "org-customer" },
    ],
    memberships: [
      {
        organizationId: "org-customer",
        role: "operator",
        status: "active",
        userId: "user-member",
      },
    ],
    now,
    organizations,
    supportGrants: [],
    userId: "user-member",
  });

  assert(
    membershipResult.ok &&
      membershipResult.context.source === "membership" &&
      !membershipResult.context.readOnly &&
      membershipResult.context.entitlements.has("feature:imports") &&
      !membershipResult.context.entitlements.has("feature:disabled"),
    "organization access example must resolve active membership and enabled entitlements.",
  );

  const platformMembership = {
    role: "platform_support",
    status: "active",
    userId: "user-support",
  };
  const platformResult = exampleOrganizationAccess.resolveOrganizationAccess({
    entitlements: [],
    memberships: [],
    now,
    organizations,
    platformMembership,
    supportGrants: [],
    userId: "user-support",
  });
  const deniedTenantResult = exampleOrganizationAccess.resolveOrganizationAccess({
    activeOrganizationId: "org-customer",
    entitlements: [],
    memberships: [],
    now,
    organizations,
    platformMembership,
    supportGrants: [],
    userId: "user-support",
  });

  assert(
    platformResult.ok &&
      platformResult.context.organizationId === null &&
      !deniedTenantResult.ok &&
      deniedTenantResult.code === "organization_access_denied",
    "platform membership must not imply customer-organization membership.",
  );
  const invalidPlatformResult = exampleOrganizationAccess.resolveOrganizationAccess({
    entitlements: [],
    memberships: [],
    now,
    organizations,
    platformMembership: {
      role: "platform_root",
      status: "active",
      userId: "user-support",
    },
    supportGrants: [],
    userId: "user-support",
  });
  assert(
    !invalidPlatformResult.ok && invalidPlatformResult.code === "active_organization_required",
    "unknown platform roles must fail closed at runtime.",
  );

  const supportGrant = {
    accessLevel: "read",
    expiresAt: "2026-07-10T01:00:00.000Z",
    grantedByUserId: "platform-admin",
    id: "support-grant-1",
    organizationId: "org-customer",
    reason: "Investigate an import failure",
    status: "active",
    userId: "user-support",
  };
  const supportResult = exampleOrganizationAccess.resolveOrganizationAccess({
    activeOrganizationId: "org-customer",
    entitlements: [],
    memberships: [],
    now,
    organizations,
    platformMembership,
    supportGrants: [supportGrant],
    userId: "user-support",
  });

  assert(
    supportResult.ok &&
      supportResult.context.source === "support_grant" &&
      supportResult.context.readOnly &&
      !exampleOrganizationAccess.canAccessOrganizationResource({
        action: "record:update",
        actionPolicy,
        context: supportResult.context,
        grants: [],
        now,
        ownerOrganizationId: "org-customer",
        resourceId: "record-1",
        resourceType: "record",
      }),
    "support access must require an explicit unexpired grant and remain read-only.",
  );

  const expiredSupportResult = exampleOrganizationAccess.resolveOrganizationAccess({
    activeOrganizationId: "org-customer",
    entitlements: [],
    memberships: [],
    now,
    organizations,
    platformMembership,
    supportGrants: [{ ...supportGrant, expiresAt: "2026-07-09T23:59:59.000Z" }],
    userId: "user-support",
  });
  assert(!expiredSupportResult.ok, "expired support grants must not create organization access.");

  const disabledMembershipResult = exampleOrganizationAccess.resolveOrganizationAccess({
    activeOrganizationId: "org-customer",
    entitlements: [],
    memberships: [
      {
        organizationId: "org-customer",
        role: "operator",
        status: "active",
        userId: "user-member",
      },
    ],
    now,
    organizations: [{ id: "org-customer", status: "disabled" }],
    supportGrants: [],
    userId: "user-member",
  });
  const disabledSupportResult = exampleOrganizationAccess.resolveOrganizationAccess({
    activeOrganizationId: "org-customer",
    entitlements: [],
    memberships: [],
    now,
    organizations: [{ id: "org-customer", status: "disabled" }],
    platformMembership,
    supportGrants: [supportGrant],
    userId: "user-support",
  });
  assert(
    !disabledMembershipResult.ok && !disabledSupportResult.ok,
    "disabled organizations reject membership and support access.",
  );

  if (!membershipResult.ok) return;
  const sharedRead = exampleOrganizationAccess.canAccessOrganizationResource({
    action: "record:read",
    actionPolicy,
    context: membershipResult.context,
    grants: [
      {
        actions: ["record:read"],
        id: "resource-grant-1",
        ownerOrganizationId: "org-provider",
        recipientOrganizationId: "org-customer",
        resourceId: "record-2",
        resourceType: "record",
        status: "active",
      },
    ],
    now,
    ownerOrganizationId: "org-provider",
    resourceId: "record-2",
    resourceType: "record",
  });
  const undeclaredWrite = exampleOrganizationAccess.canAccessOrganizationResource({
    action: "record:update",
    actionPolicy,
    context: membershipResult.context,
    grants: [
      {
        actions: ["record:read"],
        id: "resource-grant-1",
        ownerOrganizationId: "org-provider",
        recipientOrganizationId: "org-customer",
        resourceId: "record-2",
        resourceType: "record",
        status: "active",
      },
    ],
    now,
    ownerOrganizationId: "org-provider",
    resourceId: "record-2",
    resourceType: "record",
  });
  const differentResource = exampleOrganizationAccess.canAccessOrganizationResource({
    action: "record:read",
    actionPolicy,
    context: membershipResult.context,
    grants: [
      {
        actions: ["record:read"],
        id: "resource-grant-1",
        ownerOrganizationId: "org-provider",
        recipientOrganizationId: "org-customer",
        resourceId: "record-2",
        resourceType: "record",
        status: "active",
      },
    ],
    now,
    ownerOrganizationId: "org-provider",
    resourceId: "record-3",
    resourceType: "record",
  });
  const malformedGrantActions = exampleOrganizationAccess.canAccessOrganizationResource({
    action: "record:read",
    actionPolicy,
    context: membershipResult.context,
    grants: [
      {
        actions: "record:read",
        id: "resource-grant-malformed",
        ownerOrganizationId: "org-provider",
        recipientOrganizationId: "org-customer",
        resourceId: "record-2",
        resourceType: "record",
        status: "active",
      },
    ],
    now,
    ownerOrganizationId: "org-provider",
    resourceId: "record-2",
    resourceType: "record",
  });
  const unclassifiedAction = exampleOrganizationAccess.canAccessOrganizationResource({
    action: "record:unknown",
    actionPolicy,
    context: membershipResult.context,
    grants: [],
    now,
    ownerOrganizationId: "org-customer",
    resourceId: "record-4",
    resourceType: "record",
  });
  const inheritedAction = exampleOrganizationAccess.canAccessOrganizationResource({
    action: "toString",
    actionPolicy,
    context: membershipResult.context,
    grants: [],
    now,
    ownerOrganizationId: "org-customer",
    resourceId: "record-5",
    resourceType: "record",
  });
  const invalidPolicyValue = exampleOrganizationAccess.canAccessOrganizationResource({
    action: "record:invalid",
    actionPolicy: { ...actionPolicy, "record:invalid": "admin" },
    context: membershipResult.context,
    grants: [],
    now,
    ownerOrganizationId: "org-customer",
    resourceId: "record-6",
    resourceType: "record",
  });
  assert(
    sharedRead &&
      !undeclaredWrite &&
      !differentResource &&
      !malformedGrantActions &&
      !unclassifiedAction &&
      !inheritedAction &&
      !invalidPolicyValue,
    "resource access must require an own, classified action policy entry and the exact resource.",
  );
}
