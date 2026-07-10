import type {
  OrganizationAccessContext,
  OrganizationResourceActionPolicy,
  ResourceGrant,
} from "./types";

export function canAccessOrganizationResource(input: {
  action: string;
  actionPolicy: OrganizationResourceActionPolicy;
  context: OrganizationAccessContext;
  grants: readonly ResourceGrant[];
  now: string;
  ownerOrganizationId: string;
  resourceId: string;
  resourceType: string;
}): boolean {
  const { context } = input;
  const access = Object.hasOwn(input.actionPolicy, input.action)
    ? input.actionPolicy[input.action]
    : undefined;
  if (access !== "read" && access !== "write") return false;
  if (!context.organizationId) return false;
  if (access === "write" && context.readOnly) return false;

  if (context.organizationId === input.ownerOrganizationId) {
    return true;
  }

  const nowTimestamp = Date.parse(input.now);
  if (!Number.isFinite(nowTimestamp)) return false;

  return input.grants.some(
    (grant) =>
      grant.ownerOrganizationId === input.ownerOrganizationId &&
      grant.recipientOrganizationId === context.organizationId &&
      grant.resourceType === input.resourceType &&
      grant.resourceId === input.resourceId &&
      grant.status === "active" &&
      !grant.revokedAt &&
      (!grant.expiresAt || Date.parse(grant.expiresAt) > nowTimestamp) &&
      Array.isArray(grant.actions) &&
      grant.actions.includes(input.action),
  );
}
