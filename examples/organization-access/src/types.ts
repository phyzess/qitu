export type OrganizationMembership = {
  organizationId: string;
  role: string;
  status: "active" | "disabled";
  userId: string;
};

export type OrganizationEntitlement = {
  enabled: boolean;
  key: string;
  organizationId: string;
};

export type PlatformRole = "platform_admin" | "platform_support" | "platform_super_admin";

export type PlatformMembership = {
  role: PlatformRole;
  status: "active" | "disabled";
  userId: string;
};

export type SupportAccessGrant = {
  accessLevel: "read";
  expiresAt: string;
  grantedByUserId: string;
  id: string;
  organizationId: string;
  reason: string;
  revokedAt?: string | null | undefined;
  status: "active" | "revoked";
  userId: string;
};

export type ResourceGrant = {
  actions: readonly string[];
  expiresAt?: string | null | undefined;
  id: string;
  ownerOrganizationId: string;
  recipientOrganizationId: string;
  resourceId: string;
  resourceType: string;
  revokedAt?: string | null | undefined;
  status: "active" | "revoked";
};

export type OrganizationResourceActionPolicy = Readonly<Record<string, "read" | "write">>;

export type OrganizationAccessContext = {
  entitlements: ReadonlySet<string>;
  membership: OrganizationMembership | null;
  organizationId: string | null;
  platformMembership: PlatformMembership | null;
  readOnly: boolean;
  source: "membership" | "platform" | "support_grant";
  supportGrant: SupportAccessGrant | null;
  userId: string;
};

export type ResolveOrganizationAccessInput = {
  activeOrganizationId?: string | null | undefined;
  entitlements: readonly OrganizationEntitlement[];
  memberships: readonly OrganizationMembership[];
  now: string;
  organizations: readonly Organization[];
  platformMembership?: PlatformMembership | null | undefined;
  supportGrants: readonly SupportAccessGrant[];
  userId: string;
};

export type ResolveOrganizationAccessResult =
  | { context: OrganizationAccessContext; ok: true }
  | {
      code: "active_organization_required" | "organization_access_denied";
      ok: false;
    };
export type Organization = {
  id: string;
  status: "active" | "disabled";
};
