import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CleanupError = {
  code?: string;
  message?: string;
};

type CleanupRow = {
  avatar_url?: string | null;
  banner_url?: string | null;
  [key: string]: unknown;
};

type CleanupFilter = {
  limit: (count: number) => Promise<{
    data: CleanupRow[] | null;
    error: CleanupError | null;
  }>;
  maybeSingle: () => Promise<{
    data: CleanupRow | null;
    error: CleanupError | null;
  }>;
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
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: CleanupError | null }>;
    };
    select: (columns: string) => {
      eq: (column: string, value: string) => CleanupFilter;
    };
  };
  storage: {
    from: (bucket: string) => {
      list: (
        path?: string,
        options?: { limit?: number; offset?: number; search?: string },
      ) => Promise<{
        data: Array<{ name: string }> | null;
        error: CleanupError | null;
      }>;
      remove: (paths: string[]) => Promise<{ error: CleanupError | null }>;
    };
  };
};

type CleanupTarget = {
  table: string;
  column: string;
};

type BlockingTarget = CleanupTarget & {
  reason: string;
};

const DELETE_TARGETS: CleanupTarget[] = [
  { table: "friend_messages", column: "sender_id" },
  { table: "friend_messages", column: "recipient_id" },
  { table: "friend_requests", column: "requester_id" },
  { table: "friend_requests", column: "target_id" },
  { table: "friend_connections", column: "user_id" },
  { table: "friend_connections", column: "friend_user_id" },
  { table: "offers", column: "offered_by_user_id" },
  { table: "offers", column: "recipient_user_id" },
  { table: "command_block_rules", column: "user_id" },
  { table: "command_blocks", column: "user_id" },
  { table: "circle_members", column: "user_id" },
  { table: "site_builder_inquiries", column: "site_user_id" },
  { table: "source_oauth_states", column: "user_id" },
  { table: "push_notification_deliveries", column: "user_id" },
  { table: "push_tokens", column: "user_id" },
  { table: "event_tags", column: "user_id" },
  { table: "habit_completion_days", column: "user_id" },
  { table: "daily_schedule_analytics_observed_instances", column: "user_id" },
  { table: "schedule_sync_pairings", column: "user_id" },
  { table: "completion_events", column: "user_id" },
  { table: "overlay_window_allowed_instance_types", column: "user_id" },
  { table: "overlay_window_allowed_monuments", column: "user_id" },
  { table: "overlay_window_allowed_skills", column: "user_id" },
  { table: "overlay_window_items", column: "user_id" },
  { table: "day_type_time_block_allowed_habit_types", column: "user_id" },
  { table: "day_type_time_block_allowed_skills", column: "user_id" },
  { table: "day_type_time_block_allowed_areas", column: "user_id" },
  { table: "day_type_time_block_allowed_monuments", column: "user_id" },
  { table: "day_type_assignments", column: "user_id" },
  { table: "campaign_goals", column: "user_id" },
  { table: "roadmap_items", column: "user_id" },
  { table: "goal_workspaces", column: "user_id" },
  { table: "skill_badges", column: "user_id" },
  { table: "user_badges", column: "user_id" },
  { table: "monument_activity", column: "user_id" },
  { table: "monument_milestones", column: "user_id" },
  { table: "monument_notes", column: "user_id" },
  { table: "monument_skills", column: "user_id" },
  { table: "area_skills", column: "user_id" },
  { table: "item_dependencies", column: "user_id" },
  { table: "todos", column: "user_id" },
  { table: "money_recurring_items", column: "user_id" },
  { table: "money_budgets", column: "user_id" },
  { table: "money_transactions", column: "user_id" },
  { table: "course_enrollments", column: "user_id" },
  { table: "meal_plan_days", column: "user_id" },
  { table: "meal_templates", column: "user_id" },
  { table: "meals", column: "user_id" },
  { table: "daily_nutrition_targets", column: "user_id" },
  { table: "food_resources", column: "user_id" },
  { table: "source_listings", column: "user_id" },
  { table: "products", column: "user_id" },
  { table: "services", column: "user_id" },
  { table: "social_links", column: "user_id" },
  { table: "schedule_instances", column: "user_id" },
  { table: "tasks", column: "user_id" },
  { table: "projects", column: "user_id" },
  { table: "campaigns", column: "user_id" },
  { table: "roadmaps", column: "user_id" },
  { table: "goals", column: "user_id" },
  { table: "habits", column: "user_id" },
  { table: "habit_routines", column: "user_id" },
  { table: "notes", column: "user_id" },
  { table: "skill_progress", column: "user_id" },
  { table: "skills", column: "user_id" },
  { table: "monuments", column: "user_id" },
  { table: "cats", column: "user_id" },
  { table: "overlay_windows", column: "user_id" },
  { table: "day_type_time_blocks", column: "user_id" },
  { table: "time_blocks", column: "user_id" },
  { table: "day_types", column: "user_id" },
  { table: "windows", column: "user_id" },
  { table: "location_contexts", column: "user_id" },
  { table: "recipes", column: "user_id" },
  { table: "nutrition_goal_versions", column: "user_id" },
  { table: "nutrition_profiles", column: "user_id" },
  { table: "money_accounts", column: "user_id" },
  { table: "money_categories", column: "user_id" },
  { table: "my_list_items", column: "user_id" },
  { table: "my_list_lists", column: "user_id" },
  { table: "site_builder_public_sites", column: "user_id" },
  { table: "site_builder_sites", column: "user_id" },
  { table: "source_integrations", column: "user_id" },
  { table: "linked_accounts", column: "user_id" },
  { table: "focus_pomo_runs", column: "user_id" },
  { table: "focus_gate_settings", column: "user_id" },
  { table: "events", column: "user_id" },
  { table: "scheduler_user_state", column: "user_id" },
  { table: "content_cards", column: "user_id" },
  { table: "ai_monthly_usage", column: "user_id" },
  { table: "daily_app_activity", column: "user_id" },
  { table: "usage_counters", column: "user_id" },
  { table: "user_entitlements", column: "user_id" },
  { table: "user_legal_acceptances", column: "user_id" },
  { table: "dark_xp_events", column: "user_id" },
  { table: "xp_events", column: "user_id" },
  { table: "user_progress", column: "user_id" },
  { table: "api_rate_limits", column: "user_id" },
  { table: "profiles", column: "user_id" },
];

const NULLIFY_TARGETS: CleanupTarget[] = [
  { table: "circle_members", column: "invited_by_user_id" },
  { table: "foods", column: "created_by_user_id" },
  { table: "product_checkouts", column: "buyer_user_id" },
];

const BLOCKING_TARGETS: BlockingTarget[] = [
  {
    table: "circles",
    column: "owner_user_id",
    reason: "owned Circles must be transferred or removed before account deletion",
  },
  {
    table: "courses",
    column: "owner_user_id",
    reason: "owned courses must be transferred or removed before account deletion",
  },
  {
    table: "product_checkouts",
    column: "seller_user_id",
    reason: "seller checkout records require a retention decision before account deletion",
  },
];

const STORAGE_BUCKETS = ["avatars", "banners", "site-media"] as const;
const STORAGE_PAGE_SIZE = 1000;

async function targetExists(
  admin: CleanupClient,
  target: CleanupTarget,
  userId: string,
) {
  const { data, error } = await admin
    .from(target.table)
    .select(target.column)
    .eq(target.column, userId)
    .limit(1);

  if (error) {
    throw new Error(
      "Account deletion preflight failed for " +
        target.table +
        "." +
        target.column +
        ": " +
        (error.message ?? "query failed"),
    );
  }

  return Boolean(data?.length);
}

async function findBlockingReference(admin: CleanupClient, userId: string) {
  for (const target of BLOCKING_TARGETS) {
    if (await targetExists(admin, target, userId)) {
      return target;
    }
  }

  return null;
}

async function preflightCleanupTargets(admin: CleanupClient, userId: string) {
  for (const target of [...NULLIFY_TARGETS, ...DELETE_TARGETS]) {
    await targetExists(admin, target, userId);
  }
}

async function nullifySharedReferences(admin: CleanupClient, userId: string) {
  for (const target of NULLIFY_TARGETS) {
    const { error } = await admin
      .from(target.table)
      .update({ [target.column]: null })
      .eq(target.column, userId);

    if (error) {
      throw new Error(
        "Account deletion failed while anonymizing " +
          target.table +
          "." +
          target.column +
          ": " +
          (error.message ?? "update failed"),
      );
    }
  }
}

async function deleteOwnedRows(admin: CleanupClient, userId: string) {
  for (const target of DELETE_TARGETS) {
    const { error } = await admin
      .from(target.table)
      .delete()
      .eq(target.column, userId);

    if (error) {
      throw new Error(
        "Account deletion failed while deleting " +
          target.table +
          "." +
          target.column +
          ": " +
          (error.message ?? "delete failed"),
      );
    }
  }
}

async function verifyCleanup(admin: CleanupClient, userId: string) {
  for (const target of [...NULLIFY_TARGETS, ...DELETE_TARGETS]) {
    if (await targetExists(admin, target, userId)) {
      throw new Error(
        "Account deletion verification found remaining rows in " +
          target.table +
          "." +
          target.column,
      );
    }
  }
}

function storagePathFromPublicUrl(
  rawUrl: string | null | undefined,
  bucket: string,
) {
  if (!rawUrl) return null;

  const marker = "/" + bucket + "/";

  try {
    const parsed = new URL(rawUrl);
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    const parts = rawUrl.split(marker);
    return parts.length === 2 ? decodeURIComponent(parts[1]) : null;
  }
}

async function listOwnedStoragePaths(
  admin: CleanupClient,
  bucket: string,
  userId: string,
) {
  const bucketClient = admin.storage.from(bucket);
  const paths = new Set<string>();

  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const { data, error } = await bucketClient.list("", {
      limit: STORAGE_PAGE_SIZE,
      offset,
      search: userId,
    });

    if (error) {
      throw new Error(
        "Account deletion storage preflight failed for " +
          bucket +
          ": " +
          (error.message ?? "list failed"),
      );
    }

    const rows = data ?? [];
    for (const row of rows) {
      if (
        row.name === userId ||
        row.name.startsWith(userId + "-") ||
        row.name.startsWith(userId + "/")
      ) {
        paths.add(row.name);
      }
    }

    if (rows.length < STORAGE_PAGE_SIZE) break;
  }

  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const { data, error } = await bucketClient.list(userId, {
      limit: STORAGE_PAGE_SIZE,
      offset,
    });

    if (error) {
      throw new Error(
        "Account deletion storage preflight failed for " +
          bucket +
          "/" +
          userId +
          ": " +
          (error.message ?? "list failed"),
      );
    }

    const rows = data ?? [];
    for (const row of rows) {
      paths.add(userId + "/" + row.name);
    }

    if (rows.length < STORAGE_PAGE_SIZE) break;
  }

  return paths;
}

async function prepareStorageCleanup(
  admin: CleanupClient,
  userId: string,
  avatarUrl: string | null | undefined,
  bannerUrl: string | null | undefined,
) {
  const plan = new Map<string, Set<string>>();

  for (const bucket of STORAGE_BUCKETS) {
    plan.set(bucket, await listOwnedStoragePaths(admin, bucket, userId));
  }

  const avatarPath = storagePathFromPublicUrl(avatarUrl, "avatars");
  if (avatarPath) plan.get("avatars")?.add(avatarPath);

  const bannerPath = storagePathFromPublicUrl(bannerUrl, "banners");
  if (bannerPath) plan.get("banners")?.add(bannerPath);

  return plan;
}

async function removeOwnedStorage(
  admin: CleanupClient,
  plan: Map<string, Set<string>>,
) {
  for (const [bucket, paths] of plan) {
    const items = Array.from(paths);
    if (items.length === 0) continue;

    const { error } = await admin.storage.from(bucket).remove(items);
    if (error) {
      throw new Error(
        "Account deletion failed while removing " +
          bucket +
          " storage: " +
          (error.message ?? "remove failed"),
      );
    }
  }
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

    const blocker = await findBlockingReference(cleanupAdmin, user.id);
    if (blocker) {
      console.warn("Account deletion blocked by shared data", {
        userId: user.id,
        table: blocker.table,
        column: blocker.column,
        reason: blocker.reason,
      });

      return NextResponse.json(
        {
          success: false,
          error:
            "This account still owns shared or retained data that must be resolved before deletion.",
        },
        { status: 409 },
      );
    }

    await preflightCleanupTargets(cleanupAdmin, user.id);

    const { data: profile, error: profileError } = await cleanupAdmin
      .from("profiles")
      .select("avatar_url, banner_url")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(
        "Account deletion profile preflight failed: " +
          (profileError.message ?? "profile query failed"),
      );
    }

    const storagePlan = await prepareStorageCleanup(
      cleanupAdmin,
      user.id,
      profile?.avatar_url as string | null | undefined,
      profile?.banner_url as string | null | undefined,
    );

    await nullifySharedReferences(cleanupAdmin, user.id);
    await deleteOwnedRows(cleanupAdmin, user.id);
    await verifyCleanup(cleanupAdmin, user.id);
    await removeOwnedStorage(cleanupAdmin, storagePlan);

    const { error: deleteUserError } =
      await cleanupAdmin.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      console.error("Creator data was removed but Auth user deletion failed", {
        userId: user.id,
        error: deleteUserError,
      });

      return NextResponse.json(
        {
          success: false,
          error:
            "Your CREATOR data was cleaned up, but the login account could not be removed. Please try again.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account deletion stopped before Auth deletion", error);
    return NextResponse.json(
      {
        success: false,
        error:
          "Account deletion could not be completed safely. Your login account was not deleted.",
      },
      { status: 500 },
    );
  }
}
