"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToastHelpers } from "@/components/ui/toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalById, type Goal } from "@/lib/queries/goals";
import {
  getProjectsForGoal,
  type Project,
} from "@/lib/queries/projects";

const PROJECT_STAGE_OPTIONS = [
  { value: "RESEARCH", label: "Research" },
  { value: "TEST", label: "Test" },
  { value: "BUILD", label: "Build" },
  { value: "REFINE", label: "Refine" },
  { value: "RELEASE", label: "Release" },
];

const DEFAULT_PRIORITY = "NO";
const DEFAULT_ENERGY = "NO";

interface DraftProject {
  id: string;
  name: string;
  stage: string;
  why: string;
}

function createDraftProject(): DraftProject {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return {
    id,
    name: "",
    stage: PROJECT_STAGE_OPTIONS[0].value,
    why: "",
  };
}

export default function PlanGoalPage() {
  const params = useParams<{ goalId?: string }>();
  const goalIdParam = params?.goalId;
  const goalId = Array.isArray(goalIdParam) ? goalIdParam[0] : goalIdParam;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [existingProjects, setExistingProjects] = useState<Project[]>([]);
  const [drafts, setDrafts] = useState<DraftProject[]>([createDraftProject()]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const router = useRouter();
  const toast = useToastHelpers();

  useEffect(() => {
    if (!goalId) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      setLoading(true);
      try {
        const goalData = await getGoalById(goalId);
        const projectsData = await getProjectsForGoal(goalId);

        if (!active) return;

        setGoal(goalData);
        setExistingProjects(projectsData);

        if (!goalData) {
          toast.error(
            "Goal not found",
            "We couldn't find that goal. Try creating it again."
          );
        }
      } catch (error) {
        console.error("Error loading goal planning data:", error);
        if (active) {
          toast.error(
            "Error loading goal",
            "Something went wrong while loading this goal."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [goalId, toast]);

  const title = useMemo(() => {
    if (!goal) {
      return "Plan Goal";
    }
    return `Plan “${goal.name}”`;
  }, [goal]);

  const description = useMemo(() => {
    if (!goal) {
      return "Spin up the projects that will bring this goal to life.";
    }
    return "Spin up the projects that will bring this goal to life. We'll link every project to this goal automatically.";
  }, [goal]);

  const handleDraftChange = (id: string, field: keyof DraftProject, value: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              [field]: value,
            }
          : draft
      )
    );
  };

  const handleAddDraft = () => {
    setDrafts((prev) => [...prev, createDraftProject()]);
  };

  const handleRemoveDraft = (id: string) => {
    setDrafts((prev) =>
      prev.length === 1 ? prev : prev.filter((draft) => draft.id !== id)
    );
  };

  const handleSaveProjects = async () => {
    if (!goalId) {
      toast.error(
        "Goal missing",
        "We couldn't determine which goal to connect these projects to."
      );
      return;
    }

    const projectsToSave = drafts
      .map((draft) => ({
        ...draft,
        name: draft.name.trim(),
        why: draft.why.trim(),
      }))
      .filter((draft) => draft.name.length > 0);

    if (projectsToSave.length === 0) {
      toast.warning(
        "Add a project",
        "Enter at least one project name before saving."
      );
      return;
    }

    setIsSaving(true);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        toast.error("Error", "Unable to connect to the database");
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast.error("Authentication required", "Please sign in again.");
        return;
      }

      const payload = projectsToSave.map((draft) => ({
        user_id: user.id,
        goal_id: goalId,
        name: draft.name,
        stage: draft.stage,
        why: draft.why || null,
        priority: DEFAULT_PRIORITY,
        energy: DEFAULT_ENERGY,
      }));

      const { data, error } = await supabase
        .from("projects")
        .insert(payload)
        .select(
          "id, name, goal_id, priority, energy, stage, why, created_at"
        );

      if (error) {
        console.error("Error saving projects:", error);
        toast.error("Error", "We couldn't save those projects.");
        return;
      }

      toast.success(
        "Projects saved",
        "Your projects are linked to this goal."
      );

      setDrafts([createDraftProject()]);
      setExistingProjects((prev) => [
        ...(data as Project[]),
        ...prev,
      ]);
    } catch (error) {
      console.error("Error creating projects:", error);
      toast.error("Error", "We couldn't save those projects.");
    } finally {
      setIsSaving(false);
    }
  };

  const showEmptyState = !loading && (!goal || existingProjects.length === 0);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#05080f] text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <PageHeader title={title} description={description} />

          <section className="space-y-6">
            <div className="rounded-3xl border border-white/5 bg-white/[0.03] p-5 shadow-[0_35px_80px_-40px_rgba(15,23,42,0.75)] sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Batch create projects
                  </h2>
                  <p className="text-sm text-zinc-400">
                    Capture several project ideas and save them all at once.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleAddDraft}
                  variant="outline"
                  className="border-white/10 bg-white/[0.02] text-white hover:border-white/30 hover:bg-white/10"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add another project
                </Button>
              </div>

              <div className="space-y-5">
                {drafts.map((draft, index) => (
                  <div
                    key={draft.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="flex-1 space-y-4">
                        <div className="space-y-2">
                          <Label
                            htmlFor={`project-name-${draft.id}`}
                            className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400"
                          >
                            Project {index + 1}
                          </Label>
                          <Input
                            id={`project-name-${draft.id}`}
                            value={draft.name}
                            onChange={(event) =>
                              handleDraftChange(
                                draft.id,
                                "name",
                                event.target.value
                              )
                            }
                            placeholder="Name this project"
                            className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                              Stage
                            </Label>
                            <Select
                              value={draft.stage}
                              onValueChange={(value) =>
                                handleDraftChange(draft.id, "stage", value)
                              }
                            >
                              <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                                <SelectValue placeholder="Choose a stage" />
                              </SelectTrigger>
                              <SelectContent className="bg-[#0b101b] text-sm text-white">
                                {PROJECT_STAGE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                              Notes (optional)
                            </Label>
                            <Textarea
                              value={draft.why}
                              onChange={(event) =>
                                handleDraftChange(
                                  draft.id,
                                  "why",
                                  event.target.value
                                )
                              }
                              placeholder="Capture context or success criteria"
                              className="min-h-[72px] rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                            />
                          </div>
                        </div>
                      </div>

                      {drafts.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveDraft(draft.id)}
                          className="self-start text-zinc-400 hover:text-white"
                          aria-label="Remove project"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/goals")}
                  className="h-11 rounded-xl border border-white/10 bg-white/[0.02] px-6 text-sm text-zinc-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  Back to goals
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveProjects}
                  disabled={isSaving}
                  className="h-11 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(37,99,235,0.7)] transition hover:bg-blue-500/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Saving projects...
                    </>
                  ) : (
                    "Save projects"
                  )}
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white">
              Projects already linked
            </h2>
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading projects...
              </div>
            ) : existingProjects.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {existingProjects.map((project) => (
                  <li
                    key={project.id}
                    className="rounded-2xl border border-white/5 bg-white/[0.02] p-4"
                  >
                    <p className="text-sm font-semibold text-white">
                      {project.name}
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-blue-200/70">
                      {project.stage}
                    </p>
                    {project.why ? (
                      <p className="mt-2 text-xs text-zinc-400">{project.why}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-zinc-400">
                {showEmptyState
                  ? "Once you save projects, they will appear here."
                  : "No projects to show yet."}
              </div>
            )}
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
}
