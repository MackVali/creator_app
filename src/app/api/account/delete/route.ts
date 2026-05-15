import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CleanupError = {
  code?: string;
  message?: string;
};

type CleanupClient = {
  auth: {
    admin: {
      deleteUser: (userId: string) => Promise<{ error: CleanupError | null }>;
    };
  };
  from: (table: string) => {
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: CleanupError | null }>;
    };
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { avatar_url?: string | null } | null;
          error: CleanupError | null;
        }>;
      };
    };
  };
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<{ error: CleanupError | null }>;
    };
  };
};

type DeleteTarget = {
  table: string;
  column?: string;
};

const OWNED_ROW_TARGETS: DeleteTarget[] = [
  { table: "friend_messages", column: "sender_id" },
  { table: "friend_messages", column: "recipient_id" },
  { table: "friend_requests", column: "requester_id" },
  { table: "friend_requests", column: "target_id" },
  { table: "event_tags" },
  { table: "tags" },
  { table: "habit_completion_days" },
  { table: "daily_schedule_analytics_observed_instances" },
  { table: "schedule_sync_pairings" },
  { table: "schedule_instances" },
  { table: "day_type_time_block_allowed_habit_types" },
  { table: "day_type_time_block_allowed_skills" },
  { table: "day_type_time_block_allowed_monuments" },
  { table: "day_type_assignments" },
  { table: "day_type_time_blocks" },
  { table: "day_types" },
  { table: "time_blocks" },
  { table: "windows" },
  { table: "notes" },
  { table: "source_oauth_states" },
  { table: "source_listings" },
  { table: "source_integrations" },
  { table: "linked_accounts" },
  { table: "profile_availability_windows" },
  { table: "profile_business_info" },
  { table: "profile_testimonials" },
  { table: "profile_offers" },
  { table: "profile_cta_buttons" },
  { table: "profile_theme_settings" },
  { table: "friend_connections" },
  { table: "friend_contact_imports" },
  { table: "friend_invites" },
  { table: "ai_applied_actions" },
  { table: "ai_monthly_usage" },
  { table: "user_legal_acceptances" },
  { table: "skill_badges" },
  { table: "user_badges" },
  { table: "dark_xp_events" },
  { table: "xp_events" },
  { table: "skill_progress" },
  { table: "user_progress" },
  { table: "monument_skills" },
  { table: "habits" },
  { table: "tasks" },
  { table: "projects" },
  { table: "campaign_goals" },
  { table: "roadmap_items" },
  { table: "campaigns" },
  { table: "roadmaps" },
  { table: "goals" },
  { table: "skills" },
  { table: "monuments" },
  { table: "location_contexts" },
  { table: "profiles" },
];

function avatarStoragePath(avatarUrl: string | null | undefined) {
  if (!avatarUrl) {
    return null;
  }

  try {
    const url = new URL(avatarUrl);
    const marker = "/avatars/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    const parts = avatarUrl.split("/avatars/");
    return parts.length === 2 ? parts[1] : null;
  }
}

function isMissingSchemaError(error: CleanupError | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  );
}

async function deleteOwnedRows(admin: CleanupClient, userId: string) {
  const cleanupWarnings: string[] = [];

  for (const target of OWNED_ROW_TARGETS) {
    const column = target.column ?? "user_id";
    const { error } = await admin.from(target.table).delete().eq(column, userId);

    if (error && !isMissingSchemaError(error)) {
      cleanupWarnings.push(`${target.table}.${column}: ${error.message ?? "delete failed"}`);
    }
  }

  return cleanupWarnings;
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.confirmation !== "DELETE") {
      return NextResponse.json(
        { success: false, error: "Confirmation is required." },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Authentication is not configured." },
        { status: 500 },
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "You must be signed in to delete your account." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: "Account deletion is not configured." },
        { status: 500 },
      );
    }

    const cleanupAdmin = admin as unknown as CleanupClient;
    const { data: profile } = await cleanupAdmin
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();
    const avatarPath = avatarStoragePath(profile?.avatar_url);

    const { error: deleteUserError } = await cleanupAdmin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      console.error("Failed to delete auth user", deleteUserError);
      return NextResponse.json(
        { success: false, error: "We couldn't delete your account. Please try again." },
        { status: 500 },
      );
    }

    const cleanupWarnings = await deleteOwnedRows(cleanupAdmin, user.id);

    if (avatarPath) {
      const { error: avatarError } = await cleanupAdmin.storage
        .from("avatars")
        .remove([avatarPath]);
      if (avatarError && !isMissingSchemaError(avatarError)) {
        cleanupWarnings.push(`avatars.${avatarPath}: ${avatarError.message ?? "delete failed"}`);
      }
    }

    if (cleanupWarnings.length > 0) {
      console.warn("Account deleted with cleanup warnings", {
        userId: user.id,
        cleanupWarnings,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected account deletion error", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
