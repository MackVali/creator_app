import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getSupabaseServer } from "@/lib/supabase";
import PriorityEditorClient from "./PriorityEditorClient";
import {
  normalizePriority,
  parseGlobalRank,
  PriorityProject,
  PriorityGoal,
} from "./utils";

export const runtime = "nodejs";

export default async function PriorityEditorPage() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);

  if (!supabase) {
    redirect("/auth");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth");
  }

  const [
    { data: projectData, error: projectError },
    { data: goalData, error: goalError },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,priority,global_rank,stage")
      .is("completed_at", null),
    supabase
      .from("goals")
      .select("id,name,priority,priority_code,status")
      .neq("status", "COMPLETED"),
  ]);

  if (projectError) {
    console.error("Failed to load projects for priority editor", projectError);
  }
  if (goalError) {
    console.error("Failed to load goals for priority editor", goalError);
  }

  const normalizedProjects: PriorityProject[] = (projectData ?? []).map((row) => ({
    id: row.id,
    name: (row.name ?? "").trim() || "Untitled project",
    priority: normalizePriority(row.priority),
    stage: row.stage ?? null,
    globalRank: parseGlobalRank(row.global_rank),
  }));

  const normalizedGoals: PriorityGoal[] = (goalData ?? []).map((row) => ({
    id: row.id,
    name: (row.name ?? "").trim() || "Untitled goal",
    priority: normalizePriority(row.priority ?? row.priority_code),
    stage: null,
  }));

  const fetchErrorMessages = [];
  if (projectError) {
    fetchErrorMessages.push(
      `projects select error: ${projectError.message || "Unable to load projects."}`
    );
  }
  if (goalError) {
    fetchErrorMessages.push(
      `goals select error: ${goalError.message || "Unable to load goals."}`
    );
  }
  const fetchError = fetchErrorMessages.length ? fetchErrorMessages.join(" ") : null;

  return (
    <ProtectedRoute>
      <PriorityEditorClient
        initialProjects={normalizedProjects}
        initialGoals={normalizedGoals}
        initialError={fetchError}
      />
    </ProtectedRoute>
  );
}
