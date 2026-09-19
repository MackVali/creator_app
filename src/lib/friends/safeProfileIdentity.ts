import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const SAFE_PROFILE_IDENTITY_COLUMNS =
  "user_id, username, name, avatar_url";

export type SafeProfileIdentity = {
  userId: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
};

type SafeProfileIdentityRow = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

function mapIdentity(
  row: SafeProfileIdentityRow | null,
): SafeProfileIdentity | null {
  if (!row || !row.user_id) {
    return null;
  }

  return {
    userId: row.user_id,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatar_url,
  };
}

function requireAdminClient() {
  const admin = createAdminClient();

  if (!admin) {
    throw new Error(
      "Supabase admin client is unavailable",
    );
  }

  return admin;
}

export async function getSafeProfileIdentityByUserId(
  userId: string,
): Promise<SafeProfileIdentity | null> {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return null;
  }

  const admin = requireAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select(SAFE_PROFILE_IDENTITY_COLUMNS)
    .eq("user_id", normalizedUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapIdentity(
    data as SafeProfileIdentityRow | null,
  );
}

export async function getSafeProfileIdentityByUsername(
  username: string,
): Promise<SafeProfileIdentity | null> {
  const normalizedUsername =
    username.trim().toLowerCase();

  if (!normalizedUsername) {
    return null;
  }

  const admin = requireAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select(SAFE_PROFILE_IDENTITY_COLUMNS)
    .ilike("username", normalizedUsername)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapIdentity(
    data as SafeProfileIdentityRow | null,
  );
}

export async function getSafeProfileIdentitiesByUserIds(
  userIds: string[],
): Promise<SafeProfileIdentity[]> {
  const normalizedUserIds = Array.from(
    new Set(
      userIds
        .map((userId) => userId.trim())
        .filter(Boolean),
    ),
  );

  if (normalizedUserIds.length === 0) {
    return [];
  }

  const admin = requireAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select(SAFE_PROFILE_IDENTITY_COLUMNS)
    .in("user_id", normalizedUserIds);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row) =>
      mapIdentity(
        row as SafeProfileIdentityRow,
      ),
    )
    .filter(
      (
        identity,
      ): identity is SafeProfileIdentity =>
        identity !== null,
    );
}
