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
import { Lock, XIcon } from "lucide-react";
import {
  ScheduleMorphDialog,
  type ScheduleEditOrigin,
} from "@/components/schedule/ScheduleMorphDialog";
import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";

const toDatetimeLocalValue = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const PRIORITY_OPTIONS = [
  { value: "NO", label: "No" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "Critical", label: "Critical" },
  { value: "Ultra-Critical", label: "Ultra critical" },
];

const PRIORITY_OPTION_LOOKUP = PRIORITY_OPTIONS.reduce<Record<string, string>>(
  (map, option) => {
    map[option.value.toUpperCase()] = option.value;
    return map;
  },
  {},
);
const PRIORITY_NUMERIC_PATTERN = /^\d+$/;

const buildLookupMap = (
  rows: Array<{ id?: number | null; name?: string | null }> | null | undefined,
) => {
  const map: Record<string, string> = {};
  for (const row of rows ?? []) {
    if (row?.id == null || typeof row.name !== "string") continue;
    map[String(row.id)] = row.name.toUpperCase();
  }
  return map;
};

const resolvePriorityOption = (
  raw: unknown,
  lookup: Record<string, string>,
): string => {
  let candidate: string | null = null;
  if (typeof raw === "number") {
    candidate = lookup[String(raw)] ?? null;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      if (PRIORITY_NUMERIC_PATTERN.test(trimmed)) {
        candidate = lookup[trimmed] ?? null;
      } else {
        candidate = trimmed;
      }
    }
  }
  const normalized = (candidate ?? "NO").toUpperCase();
  return PRIORITY_OPTION_LOOKUP[normalized] ?? PRIORITY_OPTIONS[0].value;
};

const resolveEnergyValue = (
  raw: unknown,
  lookup: Record<string, string>,
): (typeof ENERGY.LIST)[number] => {
  let candidate: string | null = null;
  if (typeof raw === "number") {
    candidate = lookup[String(raw)] ?? null;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      if (PRIORITY_NUMERIC_PATTERN.test(trimmed)) {
        candidate = lookup[trimmed] ?? null;
      } else {
        candidate = trimmed;
      }
    }
  }
  const normalized = (candidate ?? "NO").toUpperCase();
  return ENERGY.LIST.includes(normalized as (typeof ENERGY.LIST)[number])
    ? (normalized as (typeof ENERGY.LIST)[number])
    : "NO";
};

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

type LookupRow = {
  id?: number | null;
  name?: string | null;
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
  const [lockedInstance, setLockedInstance] = useState<ScheduleInstance | null>(null);
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [manualScheduleError, setManualScheduleError] = useState<string | null>(null);
  const [manualScheduleSaving, setManualScheduleSaving] = useState(false);
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
    setLockedInstance(null);
    setManualStart("");
    setManualEnd("");
    setManualScheduleError(null);
    setManualScheduleSaving(false);
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

    const [
      projectResponse,
      goalsResponse,
      lockedResponse,
      priorityResponse,
      energyResponse,
    ] = await Promise.all([
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
      supabase
        .from("schedule_instances")
        .select("id, start_utc, end_utc, duration_min, locked, status")
        .eq("user_id", user.id)
        .eq("source_type", "PROJECT")
        .eq("source_id", projectId)
        .eq("locked", true)
        .order("start_utc", { ascending: true })
        .limit(1),
      supabase.from("priority").select("id, name"),
      supabase.from("energy").select("id, name"),
    ]);

      if (projectResponse.error) throw projectResponse.error;

      const projectData = projectResponse.data;
      if (!projectData) {
        throw new Error("Project not found.");
      }

      const priorityLookup = priorityResponse.error
        ? {}
        : buildLookupMap(priorityResponse.data as LookupRow[]);
      if (priorityResponse.error) {
        console.warn("Failed to load priority lookup values", priorityResponse.error);
      }
      const energyLookup = energyResponse.error
        ? {}
        : buildLookupMap(energyResponse.data as LookupRow[]);
      if (energyResponse.error) {
        console.warn("Failed to load energy lookup values", energyResponse.error);
      }

      setName(projectData.name ?? "");
      setPriority(resolvePriorityOption(projectData.priority, priorityLookup));
      setStage(projectData.stage ?? STAGE_OPTIONS[0].value);
      const normalizedEnergy = resolveEnergyValue(projectData.energy, energyLookup);
      setEnergy(normalizedEnergy);
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
      if (lockedResponse.error) {
        console.error("Failed to load locked schedule instance:", lockedResponse.error);
        setLockedInstance(null);
        setManualStart("");
        setManualEnd("");
      } else {
        const lockedRecord = (lockedResponse.data?.[0] as ScheduleInstance | undefined) ?? null;
        setLockedInstance(lockedRecord ?? null);
        if (lockedRecord) {
          setManualStart(toDatetimeLocalValue(lockedRecord.start_utc));
          setManualEnd(toDatetimeLocalValue(lockedRecord.end_utc));
        } else {
          setManualStart("");
          setManualEnd("");
        }
      }
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

  const handleUpdateLockedSchedule = async () => {
    if (!projectId || !lockedInstance) {
      return;
    }
    if (!manualStart || !manualEnd) {
      setManualScheduleError("Provide both start and end times.");
      return;
    }
    const startDate = new Date(manualStart);
    const endDate = new Date(manualEnd);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      setManualScheduleError("Enter valid start and end times.");
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setManualScheduleError("End time must be after the start time.");
      return;
    }

    setManualScheduleSaving(true);
    setManualScheduleError(null);

    try {
      if (!supabase) {
        throw new Error("Supabase client not available.");
      }
      const durationMin = Math.max(
        1,
        Math.round((endDate.getTime() - startDate.getTime()) / 60000)
      );
      const { error: updateError } = await supabase
        .from("schedule_instances")
        .update({
          start_utc: startDate.toISOString(),
          end_utc: endDate.toISOString(),
          duration_min: durationMin,
        })
        .eq("id", lockedInstance.id);

      if (updateError) {
        throw updateError;
      }

      setLockedInstance((prev) =>
        prev
          ? {
              ...prev,
              start_utc: startDate.toISOString(),
              end_utc: endDate.toISOString(),
              duration_min: durationMin,
            }
          : prev
      );
      await onSaved?.();
    } catch (err) {
      console.error("Failed to update locked schedule:", err);
      setManualScheduleError(
        err instanceof Error
          ? err.message
          : "Unable to update the manual schedule right now."
      );
    } finally {
      setManualScheduleSaving(false);
    }
  };

  const handleRemoveLockedSchedule = async () => {
    if (!lockedInstance) return;
    setManualScheduleSaving(true);
    setManualScheduleError(null);
    try {
      if (!supabase) {
        throw new Error("Supabase client not available.");
      }
      const { error: deleteError } = await supabase
        .from("schedule_instances")
        .delete()
        .eq("id", lockedInstance.id);
      if (deleteError) {
        throw deleteError;
      }
      setLockedInstance(null);
      setManualStart("");
      setManualEnd("");
      await onSaved?.();
    } catch (err) {
      console.error("Failed to remove locked schedule:", err);
      setManualScheduleError(
        err instanceof Error
          ? err.message
          : "Unable to remove the manual schedule right now."
      );
    } finally {
      setManualScheduleSaving(false);
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

          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">
                  Manual schedule
                </p>
                <p className="text-sm text-white/70">
                  Locked blocks stay fixed when you rerun the scheduler.
                </p>
              </div>
              {lockedInstance ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2 py-1 text-xs font-semibold text-white/80">
                  <Lock className="h-3.5 w-3.5" />
                  Locked
                </span>
              ) : (
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
                  Dynamic
                </span>
              )}
            </div>
            {lockedInstance ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
                      Start time
                    </Label>
                    <Input
                      type="datetime-local"
                      value={manualStart}
                      onChange={(event) => setManualStart(event.target.value)}
                      disabled={manualScheduleSaving}
                      className="border-white/20 bg-white/5 text-sm text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
                      End time
                    </Label>
                    <Input
                      type="datetime-local"
                      value={manualEnd}
                      onChange={(event) => setManualEnd(event.target.value)}
                      disabled={manualScheduleSaving}
                      className="border-white/20 bg-white/5 text-sm text-white"
                    />
                  </div>
                </div>
                {manualScheduleError ? (
                  <p className="text-sm text-red-300">{manualScheduleError}</p>
                ) : (
                  <p className="text-xs text-white/60">
                    Update the exact timing for this locked project or remove the lock to return it to the automatic scheduler.
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={handleUpdateLockedSchedule}
                    disabled={manualScheduleSaving}
                    className="flex-1 bg-white text-zinc-900 hover:bg-white/90"
                  >
                    {manualScheduleSaving ? "Saving…" : "Update times"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveLockedSchedule}
                    disabled={manualScheduleSaving}
                    className="flex-1 border-red-500/40 text-red-200 hover:bg-red-500/10"
                  >
                    Remove lock
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-white/60">
                This project is currently scheduled dynamically. To lock a project at a specific time, create it with manual times from the scheduler’s project workflow.
              </p>
            )}
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
