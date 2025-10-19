import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";

const DEFAULT_THEME = {
  theme_color: "#3B82F6",
  font_family: "Inter",
  accent_color: "#8B5CF6",
};

type EnsureProfilePayload = {
  name?: string | null;
  username?: string | null;
  bio?: string | null;
  dob?: string | null;
  city?: string | null;
  theme_color?: string | null;
  font_family?: string | null;
  accent_color?: string | null;
};

function sanitizeUsernameCandidate(candidate?: string | null) {
  if (!candidate) {
    return null;
  }

  const sanitized = candidate
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);

  return sanitized.length >= 3 ? sanitized : null;
}

function trimOrNull(value?: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Supabase client not configured" },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  const overrides: EnsureProfilePayload = await (async () => {
    try {
      const body = await request.json();
      return body ?? {};
    } catch (error) {
      return {};
    }
  })();

  const serviceClient = getSupabaseServiceRoleClient();

  if (!serviceClient) {
    return NextResponse.json(
      { success: false, error: "Service role client not available" },
      { status: 500 },
    );
  }

  const { data: existingProfile, error: existingError } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") {
    console.error("Failed to check existing profile", existingError);
    return NextResponse.json(
      { success: false, error: "Failed to resolve profile" },
      { status: 500 },
    );
  }

  if (existingProfile) {
    return NextResponse.json({ success: true, profile: existingProfile });
  }

  const metadataName = trimOrNull(user.user_metadata?.full_name);
  const emailLocalPart = trimOrNull(user.email ? user.email.split("@")[0] : null);
  const overrideName = trimOrNull(overrides.name ?? null);
  const derivedName = overrideName ?? metadataName ?? emailLocalPart ?? "New User";

  const fallbackUsername = `user_${user.id.slice(0, 8)}`;
  const usernameCandidates = [
    sanitizeUsernameCandidate(overrides.username ?? null),
    sanitizeUsernameCandidate(metadataName),
    sanitizeUsernameCandidate(emailLocalPart),
    fallbackUsername,
  ];
  const preferredUsername = usernameCandidates.find(Boolean) ?? fallbackUsername;

  const basePayload = {
    user_id: user.id,
    name: derivedName,
    username: preferredUsername,
    bio: trimOrNull(overrides.bio ?? null),
    dob: trimOrNull(overrides.dob ?? null),
    city: trimOrNull(overrides.city ?? null),
    avatar_url: null,
    banner_url: null,
    verified: false,
    theme_color: overrides.theme_color ?? DEFAULT_THEME.theme_color,
    font_family: overrides.font_family ?? DEFAULT_THEME.font_family,
    accent_color: overrides.accent_color ?? DEFAULT_THEME.accent_color,
  };

  const attemptInsert = async (username: string) => {
    return serviceClient
      .from("profiles")
      .insert({ ...basePayload, username })
      .select()
      .single();
  };

  let { data: createdProfile, error: createError } = await attemptInsert(preferredUsername);

  if (createError && createError.code === "23505" && preferredUsername !== fallbackUsername) {
    ({ data: createdProfile, error: createError } = await attemptInsert(fallbackUsername));
  }

  if (createError) {
    console.error("Failed to create profile", createError);
    return NextResponse.json(
      { success: false, error: "Unable to create profile" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, profile: createdProfile });
}
