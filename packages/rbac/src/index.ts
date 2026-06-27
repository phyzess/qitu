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

export type Principal = {
  id: string;
  role: RoleName;
};

export const rolePermissions: Record<RoleName, readonly Permission[]> = {
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
};

export function isRoleName(value: string): value is RoleName {
  return roleNames.includes(value as RoleName);
}

export function normalizeRole(value: string | null | undefined): RoleName {
  return value && isRoleName(value) ? value : "viewer";
}

export function can(principal: Principal, permission: Permission): boolean {
  return rolePermissions[principal.role].includes(permission);
}

export function permissionsForRole(role: RoleName): readonly Permission[] {
  return rolePermissions[role];
}
