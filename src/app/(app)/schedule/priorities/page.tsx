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
  const userId = user.id;

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
      .select("id,name,emoji,priority,priority_code,status,global_rank")
      .neq("status", "COMPLETED"),
  ]);

  if (projectError) {
    console.error("Failed to load projects for priority editor", projectError);
  }
  if (goalError) {
    console.error("Failed to load goals for priority editor", goalError);
  }

  const projectRows = projectData ?? [];
  const projectEmojiById = new Map<string, string | null>();

  if (projectRows.length > 0) {
    const projectIds = projectRows.map((project) => project.id);
    const { data: projectSkillData, error: projectSkillError } = await supabase
      .from("project_skills")
      .select("project_id, skill_id")
      .in("project_id", projectIds);

    if (projectSkillError) {
      console.error(
        "Failed to load project skills for priority editor",
        projectSkillError
      );
    } else {
      const projectSkillRows =
        (projectSkillData ?? []) as { project_id: string | null; skill_id: string | null }[];
      const skillIdSet = new Set<string>();
      for (const record of projectSkillRows) {
        if (record.skill_id) {
          skillIdSet.add(record.skill_id);
        }
      }

      if (skillIdSet.size > 0) {
        const skillIds = Array.from(skillIdSet);
        const { data: skillRows, error: skillError } = await supabase
          .from("skills")
          .select("id, icon")
          .eq("user_id", userId)
          .in("id", skillIds);

        if (skillError) {
          console.error(
            "Failed to load skill icons for priority editor",
            skillError
          );
        } else {
          const skillIconById = new Map<string, string | null>();
          for (const skill of (skillRows ?? []) as { id: string; icon?: string | null }[]) {
            skillIconById.set(skill.id, skill.icon ?? null);
          }

          const projectIcons = new Map<string, (string | null)[]>();
          for (const record of projectSkillRows) {
            if (!record.project_id) continue;
            const icons = projectIcons.get(record.project_id) ?? [];
            const icon =
              record.skill_id && skillIconById.has(record.skill_id)
                ? skillIconById.get(record.skill_id) ?? null
                : null;
            icons.push(icon);
            projectIcons.set(record.project_id, icons);
          }
          for (const [projectId, icons] of projectIcons) {
            const emoji =
              icons.find(
                (value) => typeof value === "string" && value.trim().length > 0
              ) ?? null;
            projectEmojiById.set(projectId, emoji);
          }
        }
      }
    }
  }

  const normalizedProjects: PriorityProject[] = projectRows.map((row) => ({
    id: row.id,
    name: (row.name ?? "").trim() || "Untitled project",
    priority: normalizePriority(row.priority),
    stage: row.stage ?? null,
    globalRank: parseGlobalRank(row.global_rank),
    emoji: projectEmojiById.get(row.id) ?? null,
  }));

  const normalizedGoals: PriorityGoal[] = (goalData ?? []).map(
    (row) =>
      ({
        id: row.id,
        name: (row.name ?? "").trim() || "Untitled goal",
        emoji: row.emoji ?? null,
        priority: normalizePriority(row.priority ?? row.priority_code),
        stage: null,
        globalRank: parseGlobalRank(row.global_rank),
      } as PriorityGoal)
  );

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
