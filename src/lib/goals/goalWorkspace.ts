import { getSupabaseBrowser } from "@/lib/supabase";
import {
  readNoteTodos,
  writeNoteTodosMetadata,
  type NoteTodo,
} from "@/lib/notes/noteTodos";
import type { Database, Json } from "@/types/supabase";

export type GoalWorkspace = {
  goalId: string;
  content: string;
  noteTodos: NoteTodo[];
  updatedAt: string | null;
};

type GoalWorkspaceRow = Database["public"]["Tables"]["goal_workspaces"]["Row"];
type GoalWorkspaceUpsert = Database["public"]["Tables"]["goal_workspaces"]["Insert"];
type GoalWorkspaceMutationQuery = {
  upsert: (
    payload: GoalWorkspaceUpsert[],
    options: { onConflict: string },
  ) => {
    select: (columns: string) => {
      single: () => Promise<{ data: GoalWorkspaceRow | null; error: unknown }>;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function rowToGoalWorkspace(row: GoalWorkspaceRow): GoalWorkspace {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  return {
    goalId: row.goal_id,
    content: row.content ?? "",
    noteTodos: readNoteTodos(metadata),
    updatedAt: row.updated_at ?? null,
  };
}

export async function loadGoalWorkspace(goalId: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase || !goalId) return null;

  const { data, error } = await supabase
    .from("goal_workspaces")
    .select("goal_id, user_id, content, metadata, created_at, updated_at")
    .eq("goal_id", goalId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load goal workspace", { goalId, error });
    return null;
  }

  return data ? rowToGoalWorkspace(data) : null;
}

export async function saveGoalWorkspace({
  goalId,
  content,
  noteTodos,
}: {
  goalId: string;
  content: string;
  noteTodos: NoteTodo[];
}) {
  const supabase = getSupabaseBrowser();
  if (!supabase || !goalId) return null;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError) {
      console.error("Failed to resolve goal workspace user", {
        goalId,
        error: userError,
      });
    }
    return null;
  }

  const payload: GoalWorkspaceUpsert = {
    goal_id: goalId,
    user_id: user.id,
    content,
    metadata: writeNoteTodosMetadata({}, noteTodos) as Json,
    updated_at: new Date().toISOString(),
  };

  const goalWorkspaceTable = supabase.from(
    "goal_workspaces",
  ) as unknown as GoalWorkspaceMutationQuery;
  const { data, error } = await goalWorkspaceTable
    .upsert([payload], { onConflict: "goal_id" })
    .select("goal_id, user_id, content, metadata, created_at, updated_at")
    .single();

  if (error || !data) {
    console.error("Failed to save goal workspace", { goalId, error });
    return null;
  }

  return rowToGoalWorkspace(data);
}
