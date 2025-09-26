"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SkillProjectsGridProps {
  skillId: string;
}

interface ProjectRecord {
  id: string;
  name: string;
  goal_id: string | null;
  priority: string | null;
  energy: string | null;
  stage: string | null;
  due_date: string | null;
  created_at: string;
}

interface ProjectWithGoal extends ProjectRecord {
  goal_name: string;
}

type ProjectSkillRow = { project_id: string | null };
type TaskLinkRow = { project_id: string | null };
type GoalSummaryRow = { id: string; name: string | null };

const skeletonItems = Array.from({ length: 3 });

function ProjectsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {skeletonItems.map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-white/10 bg-white/5 p-4"
        >
          <Skeleton className="h-5 w-3/4 bg-white/10" />
          <Skeleton className="mt-3 h-3 w-1/2 bg-white/10" />
          <div className="mt-6 flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full bg-white/10" />
            <Skeleton className="h-6 w-20 rounded-full bg-white/10" />
            <Skeleton className="h-6 w-16 rounded-full bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkillProjectsGrid({ skillId }: SkillProjectsGridProps) {
  const supabase = getSupabaseBrowser();
  const [projects, setProjects] = useState<ProjectWithGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      if (!supabase || !skillId) {
        if (!cancelled) {
          setError("Unable to load projects");
          setProjects([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          throw new Error("User not authenticated");
        }

        const projectIds = new Set<string>();

        const { data: projectSkillData, error: projectSkillError } = await supabase
          .from<ProjectSkillRow>("project_skills")
          .select("project_id")
          .eq("skill_id", skillId);

        if (projectSkillError) {
          throw projectSkillError;
        }

        projectSkillData?.forEach((row) => {
          if (row.project_id) {
            projectIds.add(row.project_id);
          }
        });

        const { data: tasksData, error: tasksError } = await supabase
          .from<TaskLinkRow>("tasks")
          .select("project_id")
          .eq("skill_id", skillId)
          .eq("user_id", user.id);

        if (tasksError) {
          throw tasksError;
        }

        tasksData?.forEach((task) => {
          if (task.project_id) {
            projectIds.add(task.project_id);
          }
        });

        if (projectIds.size === 0) {
          if (!cancelled) {
            setProjects([]);
            setLoading(false);
          }
          return;
        }

        const projectIdsArray = Array.from(projectIds);
        const { data: projectsData, error: projectsError } = await supabase
          .from<ProjectRecord>("projects")
          .select(
            "id, name, goal_id, priority, energy, stage, due_date, created_at"
          )
          .eq("user_id", user.id)
          .in("id", projectIdsArray);

        if (projectsError) {
          throw projectsError;
        }

        if (!projectsData || projectsData.length === 0) {
          if (!cancelled) {
            setProjects([]);
            setLoading(false);
          }
          return;
        }

        const goalIds = Array.from(
          new Set(
            projectsData
              .map((project) => project.goal_id)
              .filter((goalId): goalId is string => Boolean(goalId))
          )
        );

        const goalsMap: Record<string, string> = {};
        if (goalIds.length > 0) {
          const { data: goalsData, error: goalsError } = await supabase
            .from<GoalSummaryRow>("goals")
            .select("id, name")
            .eq("user_id", user.id)
            .in("id", goalIds);

          if (goalsError) {
            throw goalsError;
          }

          goalsData?.forEach((goal) => {
            if (goal?.id) {
              goalsMap[goal.id] = goal.name ?? "Untitled goal";
            }
          });
        }

        const mappedProjects: ProjectWithGoal[] = projectsData.map((project) => {
          const goalName = project.goal_id
            ? goalsMap[project.goal_id] ?? "Untitled goal"
            : "Unassigned goal";

          return {
            ...project,
            goal_name: goalName,
          };
        });

        mappedProjects.sort((a, b) => {
          const aDue = a.due_date ? Date.parse(a.due_date) : Number.POSITIVE_INFINITY;
          const bDue = b.due_date ? Date.parse(b.due_date) : Number.POSITIVE_INFINITY;

          if (Number.isFinite(aDue) || Number.isFinite(bDue)) {
            return aDue - bDue;
          }

          const aCreated = Date.parse(a.created_at);
          const bCreated = Date.parse(b.created_at);

          if (Number.isFinite(aCreated) && Number.isFinite(bCreated)) {
            return bCreated - aCreated;
          }

          return a.name.localeCompare(b.name);
        });

        if (!cancelled) {
          setProjects(mappedProjects);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading projects for skill:", err);
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load projects";
          setError(message);
          setProjects([]);
          setLoading(false);
        }
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [skillId, supabase]);

  if (loading) {
    return <ProjectsSkeleton />;
  }

  if (error) {
    return (
      <Card className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        <p className="font-medium">Error loading projects</p>
        <p className="mt-1 text-xs text-red-100/80">{error}</p>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-sm text-[#A7B0BD]">
        No projects linked to this skill yet.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <article
          key={project.id}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5 text-white shadow-[0_24px_60px_-45px_rgba(15,23,42,0.75)] backdrop-blur transition hover:border-white/20 hover:bg-white/10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(129,140,248,0.18),_transparent_65%)] opacity-0 transition group-hover:opacity-100" />
          <div className="relative flex flex-col gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">{project.name}</h3>
              <p className="text-xs text-white/60">
                {project.goal_name ? `Folder: ${project.goal_name}` : "No goal folder yet."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="border-white/20 bg-white/5 text-white/80">
                {formatStage(project.stage)}
              </Badge>
              <Badge variant="outline" className="border-white/20 bg-white/5 text-white/80">
                {formatPriority(project.priority)} priority
              </Badge>
              <Badge variant="outline" className="border-white/20 bg-white/5 text-white/80">
                {formatEnergy(project.energy)} energy
              </Badge>
            </div>
            {project.due_date ? (
              <p className="text-xs text-white/60">
                Due {formatDate(project.due_date)}
              </p>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function formatStage(stage: string | null | undefined) {
  if (!stage) return "Stage TBD";
  return toTitleCase(stage);
}

function formatPriority(priority: string | null | undefined) {
  if (!priority) return "No";
  return toTitleCase(priority);
}

function formatEnergy(energy: string | null | undefined) {
  if (!energy) return "No";
  return toTitleCase(energy);
}

function formatDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "soon";
  }

  return new Date(parsed).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
