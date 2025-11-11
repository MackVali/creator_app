"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSupabaseBrowser } from "@/lib/supabase";
import { ENERGY } from "@/lib/scheduler/config";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import {
  ScheduleMorphDialog,
  type ScheduleEditOrigin,
} from "@/components/schedule/ScheduleMorphDialog";

const PRIORITY_OPTIONS = [
  { value: "NO", label: "No priority" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "Critical", label: "Critical" },
  { value: "Ultra-Critical", label: "Ultra critical" },
];

const STAGE_OPTIONS = [
  { value: "RESEARCH", label: "Research" },
  { value: "TEST", label: "Test" },
  { value: "BUILD", label: "Build" },
  { value: "REFINE", label: "Refine" },
  { value: "RELEASE", label: "Release" },
];

type GoalOption = {
  value: string;
  label: string;
};

type ProjectEditSheetProps = {
  open: boolean;
  projectId: string | null;
  eventTitle?: string | null;
  eventTypeLabel?: string | null;
  timeRangeLabel?: string | null;
  origin?: ScheduleEditOrigin | null;
  layoutId?: string;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
};

export function ProjectEditSheet({
  open,
  projectId,
  eventTitle,
  eventTypeLabel,
  timeRangeLabel,
  origin,
  layoutId,
  onClose,
  onSaved,
}: ProjectEditSheetProps) {
  const supabase = getSupabaseBrowser();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(PRIORITY_OPTIONS[0].value);
  const [stage, setStage] = useState(STAGE_OPTIONS[0].value);
  const [energy, setEnergy] = useState<(typeof ENERGY.LIST)[number]>("NO");
  const [duration, setDuration] = useState("");
  const [goalId, setGoalId] = useState<string>("none");
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const resetState = useCallback(() => {
    setName("");
    setPriority(PRIORITY_OPTIONS[0].value);
    setStage(STAGE_OPTIONS[0].value);
    setEnergy("NO");
    setDuration("");
    setGoalId("none");
    setGoalOptions([]);
    setError(null);
    setLoading(false);
    setGoalsLoading(false);
  }, []);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    if (!supabase) {
      setError("Supabase client not available.");
      return;
    }
    setLoading(true);
    setGoalsLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        throw new Error("You must be signed in to edit a project.");
      }

      const [projectResponse, goalsResponse] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, priority, stage, energy, duration_min, goal_id")
          .eq("id", projectId)
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("goals")
          .select("id, name")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
      ]);

      if (projectResponse.error) throw projectResponse.error;

      const projectData = projectResponse.data;
      if (!projectData) {
        throw new Error("Project not found.");
      }

      setName(projectData.name ?? "");
      setPriority(projectData.priority ?? PRIORITY_OPTIONS[0].value);
      setStage(projectData.stage ?? STAGE_OPTIONS[0].value);
      const normalizedEnergy = (projectData.energy ?? "NO")
        .toString()
        .toUpperCase() as (typeof ENERGY.LIST)[number];
      setEnergy(
        ENERGY.LIST.includes(normalizedEnergy) ? normalizedEnergy : "NO",
      );
      setDuration(
        typeof projectData.duration_min === "number"
          ? String(projectData.duration_min)
          : "",
      );
      setGoalId(
        projectData.goal_id && projectData.goal_id.trim().length > 0
          ? projectData.goal_id
          : "none",
      );

      setGoalOptions(
        [
          { value: "none", label: "No goal" },
          ...((goalsResponse.data ?? []).map((goal) => ({
            value: goal.id,
            label: goal.name ?? "Untitled goal",
          })) as GoalOption[]),
        ].filter((option, index, self) => {
          return self.findIndex((o) => o.value === option.value) === index;
        }),
      );
      setGoalsLoading(false);
    } catch (err) {
      console.error("Failed to load project details:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load this project right now.",
      );
    } finally {
      setLoading(false);
      setGoalsLoading(false);
    }
  }, [projectId, supabase]);

  useEffect(() => {
    if (open && projectId) {
      void loadProject();
    } else if (!open) {
      resetState();
    }
  }, [open, projectId, loadProject, resetState]);

  const disableSubmit = useMemo(() => {
    if (!projectId) return true;
    if (!name.trim()) return true;
    if (saving || loading) return true;
    if (duration && Number(duration) <= 0) return true;
    return false;
  }, [projectId, name, saving, loading, duration]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !projectId || disableSubmit) return;
    setSaving(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        throw new Error("You must be signed in to edit a project.");
      }

      const durationValue = duration.trim();
      const parsedDuration = durationValue
        ? Math.max(0, Number(durationValue))
        : null;

      const payload = {
        name: name.trim(),
        priority,
        stage,
        energy,
        duration_min:
          parsedDuration && Number.isFinite(parsedDuration)
            ? parsedDuration
            : null,
        goal_id: goalId === "none" ? null : goalId,
      };

      const { error: updateError } = await supabase
        .from("projects")
        .update(payload)
        .eq("id", projectId)
        .eq("user_id", user.id);

      if (updateError) {
        throw updateError;
      }

      if (onSaved) {
        await onSaved();
      }
      onClose();
    } catch (err) {
      console.error("Failed to update project:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update this project right now.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!projectId) {
    return null;
  }

  return (
    <ScheduleMorphDialog
      open={open}
      title={eventTitle ?? "Project"}
      subtitle={timeRangeLabel}
      typeLabel={eventTypeLabel ?? "Project"}
      onClose={onClose}
      origin={origin}
      layoutId={layoutId}
      focusRef={nameInputRef}
    >
      {loading ? (
        <div className="px-1 py-4 text-sm text-white/70">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative pb-2">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-0 top-0 rounded-full border border-white/10 bg-white/10 p-1 text-white transition hover:bg-white/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <XIcon className="size-4" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
            <div className="pr-10">
              <h2 className="text-lg font-semibold text-white">Edit project</h2>
              <p className="mt-1 text-sm text-white/70">
                Update the underlying project details. Changes here apply everywhere this project appears.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.2em] text-white/60">
              Project name
            </Label>
            <Input
              ref={nameInputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Project title"
              className="border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
              required
              disabled={loading}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.2em] text-white/60">
                Priority
              </Label>
              <Select value={priority} onValueChange={setPriority} disabled={loading}>
                <SelectTrigger className="border-white/20 bg-white/5 text-sm text-white">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent className="bg-[#05070c] text-white">
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.2em] text-white/60">
                Stage
              </Label>
              <Select value={stage} onValueChange={setStage} disabled={loading}>
                <SelectTrigger className="border-white/20 bg-white/5 text-sm text-white">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent className="bg-[#05070c] text-white">
                  {STAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.2em] text-white/60">
                Energy
              </Label>
              <Select
                value={energy}
                onValueChange={(value) =>
                  setEnergy(value as (typeof ENERGY.LIST)[number])
                }
                disabled={loading}
              >
                <SelectTrigger className="border-white/20 bg-white/5 text-sm text-white">
                  <SelectValue placeholder="Energy" />
                </SelectTrigger>
                <SelectContent className="bg-[#05070c] text-white">
                  {ENERGY.LIST.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.charAt(0) + value.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.2em] text-white/60">
                Estimated duration (minutes)
              </Label>
              <Input
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                placeholder="60"
                inputMode="numeric"
                pattern="[0-9]*"
                className="border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.2em] text-white/60">
              Goal
            </Label>
            <Select
              value={
                goalOptions.some((option) => option.value === goalId)
                  ? goalId
                  : "none"
              }
              onValueChange={setGoalId}
              disabled={goalsLoading || loading}
            >
              <SelectTrigger className="border-white/20 bg-white/5 text-sm text-white">
                <SelectValue placeholder="No goal linked" />
              </SelectTrigger>
              <SelectContent className="bg-[#05070c] text-white">
                {(goalOptions.length === 0
                  ? [{ value: "none", label: "No goal linked" }]
                  : goalOptions
                ).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className={cn(
                "bg-white text-zinc-900 hover:bg-white/90",
                disableSubmit && "opacity-50",
              )}
              disabled={disableSubmit}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      )}
    </ScheduleMorphDialog>
  );
}
