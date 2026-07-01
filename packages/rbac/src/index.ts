export const roleNames = ["owner", "admin", "reviewer", "viewer"] as const;

export type RoleName = (typeof roleNames)[number];

export type Permission =
  | "ai_advisory:write"
  | "import_job:commit"
  | "import_job:process"
  | "import_job:retry"
  | "invitation:create"
  | "review:decide"
  | "source_file:upload";

export type Role = {
  id: RoleName;
  name: string;
  permissions: readonly Permission[];
};

export type Principal<R extends string = string> = {
  id: string;
  role: R;
};

export type RolePolicy<Role extends string = string> = {
  fallbackRole: Role;
  permissions: Record<Role, readonly Permission[]>;
  roles: readonly Role[];
};

export const rolePermissions = {
  owner: [
    "ai_advisory:write",
    "import_job:commit",
    "import_job:process",
    "import_job:retry",
    "invitation:create",
    "review:decide",
    "source_file:upload",
  ],
  admin: [
    "ai_advisory:write",
    "import_job:commit",
    "import_job:process",
    "import_job:retry",
    "invitation:create",
    "review:decide",
    "source_file:upload",
  ],
  reviewer: [
    "ai_advisory:write",
    "import_job:commit",
    "import_job:process",
    "import_job:retry",
    "review:decide",
    "source_file:upload",
  ],
  viewer: [],
} as const satisfies Record<RoleName, readonly Permission[]>;

export const starterRolePolicy = createRbacPolicy({
  fallbackRole: "viewer",
  permissions: rolePermissions,
  roles: roleNames,
});

export function createRbacPolicy<const Role extends string>(
  policy: RolePolicy<Role>,
): RolePolicy<Role> {
  for (const role of policy.roles) {
    if (!Object.prototype.hasOwnProperty.call(policy.permissions, role)) {
      throw new Error(`RBAC role "${role}" is missing permissions.`);
    }
  }

  if (!policy.roles.includes(policy.fallbackRole)) {
    throw new Error(`RBAC fallback role "${policy.fallbackRole}" is not in roles.`);
  }

  return policy;
}

export function isRoleName(value: string): value is RoleName {
  return isRoleInPolicy(starterRolePolicy, value);
}

export function normalizeRole(value: string | null | undefined): RoleName {
  return normalizeRoleForPolicy(starterRolePolicy, value);
}

export function isRoleInPolicy<Role extends string>(
  policy: RolePolicy<Role>,
  value: string,
): value is Role {
  return policy.roles.includes(value as Role);
}

export function normalizeRoleForPolicy<Role extends string>(
  policy: RolePolicy<Role>,
  value: string | null | undefined,
): Role {
  return value && isRoleInPolicy(policy, value) ? value : policy.fallbackRole;
}

export function can<Role extends string>(
  principal: Principal<Role>,
  permission: Permission,
  policy: RolePolicy<Role> = starterRolePolicy as unknown as RolePolicy<Role>,
): boolean {
  return (policy.permissions[principal.role] ?? []).includes(permission);
}

export function permissionsForRole<Role extends string>(
  role: Role,
  policy: RolePolicy<Role> = starterRolePolicy as unknown as RolePolicy<Role>,
): readonly Permission[] {
  return policy.permissions[role] ?? [];
}
