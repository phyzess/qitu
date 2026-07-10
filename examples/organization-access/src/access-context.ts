import type {
  OrganizationAccessContext,
  OrganizationMembership,
  PlatformRole,
  ResolveOrganizationAccessInput,
  ResolveOrganizationAccessResult,
  SupportAccessGrant,
} from "./types";

export function resolveOrganizationAccess(
  input: ResolveOrganizationAccessInput,
): ResolveOrganizationAccessResult {
  const platformMembership =
    input.platformMembership?.userId === input.userId &&
    input.platformMembership.status === "active" &&
    isPlatformRole(input.platformMembership.role)
      ? input.platformMembership
      : null;
  const organizationId = input.activeOrganizationId?.trim() || null;

  if (!organizationId) {
    if (!platformMembership) {
      return { code: "active_organization_required", ok: false };
    }

    return {
      context: createContext(input, {
        membership: null,
        organizationId: null,
        platformMembership,
        readOnly: false,
        source: "platform",
        supportGrant: null,
      }),
      ok: true,
    };
  }

  const organization = input.organizations.find(
    (candidate) => candidate.id === organizationId && candidate.status === "active",
  );
  if (!organization) {
    return { code: "organization_access_denied", ok: false };
  }

  const membership = findMembership(input, organizationId);
  if (membership) {
    return {
      context: createContext(input, {
        membership,
        organizationId,
        platformMembership,
        readOnly: false,
        source: "membership",
        supportGrant: null,
      }),
      ok: true,
    };
  }

  const supportGrant = platformMembership
    ? findSupportGrant(input, organizationId, input.now)
    : null;
  if (supportGrant) {
    return {
      context: createContext(input, {
        membership: null,
        organizationId,
        platformMembership,
        readOnly: true,
        source: "support_grant",
        supportGrant,
      }),
      ok: true,
    };
  }

  return { code: "organization_access_denied", ok: false };
}

function findMembership(
  input: ResolveOrganizationAccessInput,
  organizationId: string,
): OrganizationMembership | null {
  return (
    input.memberships.find(
      (membership) =>
        membership.userId === input.userId &&
        membership.organizationId === organizationId &&
        membership.status === "active",
    ) ?? null
  );
}

function findSupportGrant(
  input: ResolveOrganizationAccessInput,
  organizationId: string,
  now: string,
): SupportAccessGrant | null {
  const nowTimestamp = Date.parse(now);
  if (!Number.isFinite(nowTimestamp)) return null;

  return (
    input.supportGrants.find(
      (grant) =>
        grant.userId === input.userId &&
        grant.organizationId === organizationId &&
        grant.accessLevel === "read" &&
        grant.status === "active" &&
        !grant.revokedAt &&
        grant.reason.trim().length > 0 &&
        Date.parse(grant.expiresAt) > nowTimestamp,
    ) ?? null
  );
}

function createContext(
  input: ResolveOrganizationAccessInput,
  values: Omit<OrganizationAccessContext, "entitlements" | "userId">,
): OrganizationAccessContext {
  const entitlements = new Set(
    input.entitlements
      .filter(
        (entitlement) =>
          values.organizationId !== null &&
          entitlement.organizationId === values.organizationId &&
          entitlement.enabled === true,
      )
      .map((entitlement) => entitlement.key),
  );

  return {
    ...values,
    entitlements,
    userId: input.userId,
  };
}

function isPlatformRole(value: string): value is PlatformRole {
  return (
    value === "platform_admin" || value === "platform_support" || value === "platform_super_admin"
  );
}
