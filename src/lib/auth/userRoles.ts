import type { User } from "@supabase/supabase-js";

type RoleMetadata = {
  role?: unknown;
  roles?: unknown;
  is_admin?: unknown;
};

type UserWithRoleMetadata = Pick<User, "user_metadata" | "app_metadata"> | {
  user_metadata?: RoleMetadata | null;
  app_metadata?: RoleMetadata | null;
};

const APP_MANAGER_ROLES = new Set(["admin", "manager", "creator manager"]);

function normalizeRole(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function collectRoles(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectRoles);
  }

  return [];
}

export function userHasAppManagerAccess(user: UserWithRoleMetadata | null) {
  if (!user) {
    return false;
  }

  const userMetadata = (user.user_metadata ?? {}) as RoleMetadata;
  const appMetadata = (user.app_metadata ?? {}) as RoleMetadata;

  if (userMetadata.is_admin === true || appMetadata.is_admin === true) {
    return true;
  }

  const roles = [
    ...collectRoles(userMetadata.role),
    ...collectRoles(appMetadata.role),
    ...collectRoles(userMetadata.roles),
    ...collectRoles(appMetadata.roles),
  ];

  return roles.some((role) => APP_MANAGER_ROLES.has(normalizeRole(role)));
}

export function userIsAdmin(user: UserWithRoleMetadata | null) {
  if (!user) {
    return false;
  }

  const userMetadata = (user.user_metadata ?? {}) as RoleMetadata;
  const appMetadata = (user.app_metadata ?? {}) as RoleMetadata;

  if (userMetadata.is_admin === true || appMetadata.is_admin === true) {
    return true;
  }

  const roles = [
    ...collectRoles(userMetadata.role),
    ...collectRoles(appMetadata.role),
    ...collectRoles(userMetadata.roles),
    ...collectRoles(appMetadata.roles),
  ];

  return roles.some((role) => normalizeRole(role) === "admin");
}
