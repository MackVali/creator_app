"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getCatsForUser } from "@/lib/data/cats";
import type { CatRow } from "@/lib/types/cat";
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

const resolvePriorityOption = (
  raw: unknown,
  lookup: Record<string, string> = {},
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
  lookup: Record<string, string> = {},
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

const DEFAULT_SKILL_ICON = "✦";
const getSkillIcon = (icon?: string | null) => icon?.trim() || DEFAULT_SKILL_ICON;
const UNCATEGORIZED_GROUP_ID = "__uncategorized__";
const UNCATEGORIZED_GROUP_LABEL = "Uncategorized";

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
  const [skillOptions, setSkillOptions] = useState<Skill[]>([]);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillLoadError, setSkillLoadError] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [initialSkillId, setInitialSkillId] = useState<string | null>(null);
  const [skillSearch, setSkillSearch] = useState("");

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
    setSkillOptions([]);
    setSkillCategories([]);
    setSkillsLoading(true);
    setSkillLoadError(null);
    setSelectedSkillId(null);
    setInitialSkillId(null);
    setSkillSearch("");
  }, []);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    if (!supabase) {
      setError("Supabase client not available.");
      return;
    }
    setLoading(true);
    setGoalsLoading(true);
    setSkillsLoading(true);
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

    const [projectResponse, goalsResponse, lockedResponse] = await Promise.all([
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
    ]);

      if (projectResponse.error) throw projectResponse.error;

      const projectData = projectResponse.data;
      if (!projectData) {
        throw new Error("Project not found.");
      }

      setName(projectData.name ?? "");
      setPriority(resolvePriorityOption(projectData.priority));
      setStage(projectData.stage ?? STAGE_OPTIONS[0].value);
      const normalizedEnergy = resolveEnergyValue(projectData.energy);
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
      try {
        const [skillsData, categoriesData] = await Promise.all([
          getSkillsForUser(user.id),
          getCatsForUser(user.id, supabase),
        ]);
        setSkillOptions(skillsData);
        setSkillCategories(categoriesData);
        setSkillLoadError(null);
      } catch (skillErr) {
        console.error("Failed to load skills:", skillErr);
        setSkillOptions([]);
        setSkillCategories([]);
        setSkillLoadError("Unable to load your skills right now.");
      }

      const { data: projectSkillsData, error: projectSkillsError } = await supabase
        .from("project_skills")
        .select("skill_id")
        .eq("project_id", projectId)
        .limit(1);

      if (projectSkillsError) {
        console.error("Failed to load project skill relation:", projectSkillsError);
        setSelectedSkillId(null);
        setInitialSkillId(null);
      } else {
        const primarySkillId = projectSkillsData?.[0]?.skill_id ?? null;
        setSelectedSkillId(primarySkillId);
        setInitialSkillId(primarySkillId);
      }
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
      setSkillsLoading(false);
    }
  }, [projectId, supabase]);

  useEffect(() => {
    if (open && projectId) {
      void loadProject();
    } else if (!open) {
      resetState();
    }
  }, [open, projectId, loadProject, resetState]);

  useEffect(() => {
    setSkillSearch("");
  }, [skillOptions, skillsLoading]);

  const disableSubmit = useMemo(() => {
    if (!projectId) return true;
    if (!name.trim()) return true;
    if (saving || loading) return true;
    if (duration && Number(duration) <= 0) return true;
    return false;
  }, [projectId, name, saving, loading, duration]);

  const filteredSkills = useMemo(() => {
    const term = skillSearch.trim().toLowerCase();
    if (!term) {
      return skillOptions;
    }

    return skillOptions.filter((skill) =>
      (skill.name ?? "").toLowerCase().includes(term) ||
      (skill.icon ?? "").toLowerCase().includes(term)
    );
  }, [skillOptions, skillSearch]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    skillCategories.forEach((category) => {
      map.set(category.id, category.name?.trim() ?? "");
    });
    return map;
  }, [skillCategories]);

  type SkillGroup = {
    id: string;
    label: string;
    skills: Skill[];
  };

  const groupedSkills = useMemo(() => {
    if (filteredSkills.length === 0) {
      return [];
    }

    const groups = new Map<string, SkillGroup>();
    filteredSkills.forEach((skill) => {
      const groupId = skill.cat_id ?? UNCATEGORIZED_GROUP_ID;
      const label =
        groupId === UNCATEGORIZED_GROUP_ID
          ? UNCATEGORIZED_GROUP_LABEL
          : categoryLookup.get(groupId) ?? UNCATEGORIZED_GROUP_LABEL;
      const existing = groups.get(groupId);
      if (existing) {
        existing.skills.push(skill);
      } else {
        groups.set(groupId, { id: groupId, label, skills: [skill] });
      }
    });

    const ordered: SkillGroup[] = [];
    skillCategories.forEach((category) => {
      const group = groups.get(category.id);
      if (group) {
        group.label = category.name?.trim() || group.label;
        ordered.push(group);
        groups.delete(category.id);
      }
    });

    const uncategorizedGroup = groups.get(UNCATEGORIZED_GROUP_ID);
    if (uncategorizedGroup) {
      ordered.push(uncategorizedGroup);
      groups.delete(UNCATEGORIZED_GROUP_ID);
    }

    for (const group of groups.values()) {
      ordered.push(group);
    }

    return ordered;
  }, [filteredSkills, skillCategories, categoryLookup]);

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

    if (selectedSkillId !== initialSkillId) {
      const { error: skillDeleteError } = await supabase
        .from("project_skills")
        .delete()
        .eq("project_id", projectId);
      if (skillDeleteError) {
        throw skillDeleteError;
      }
      if (selectedSkillId) {
        const { error: skillInsertError } = await supabase
          .from("project_skills")
          .insert({ project_id: projectId, skill_id: selectedSkillId });
        if (skillInsertError) {
          throw skillInsertError;
        }
      }
      setInitialSkillId(selectedSkillId);
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
            Skill relation
          </Label>
          <Select
            value={selectedSkillId ?? "none"}
            onValueChange={(value) =>
              setSelectedSkillId(value === "none" ? null : value)
            }
            disabled={skillsLoading && skillOptions.length === 0}
          >
            <SelectTrigger className="border-white/20 bg-white/5 text-sm text-white">
              <SelectValue placeholder="Choose a linked skill" />
            </SelectTrigger>
            <SelectContent className="bg-[#05070c] text-white">
              <div className="p-2">
                <Input
                  value={skillSearch}
                  onChange={(event) => setSkillSearch(event.target.value)}
                  placeholder="Search skills..."
                  className="h-9 rounded-lg border border-white/10 bg-white/5 text-xs text-white placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
                />
              </div>
              <SelectItem value="none">No linked skill</SelectItem>
              {filteredSkills.length === 0 ? (
                <div className="px-3 py-2 text-xs text-white/60">
                  {skillsLoading ? "Loading skills…" : "No skills match your search."}
                </div>
              ) : (
                groupedSkills.map((group, index) => (
                  <Fragment key={group.id}>
                    <div
                      className={cn(
                        "px-3 pt-2",
                        index === 0 ? "pt-0" : ""
                      )}
                    >
                      <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">
                        {group.label}
                      </p>
                    </div>
                    {group.skills.map((skill) => (
                      <SelectItem
                        key={skill.id}
                        value={skill.id}
                        className="px-3 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-base leading-none">
                            {getSkillIcon(skill.icon)}
                          </span>
                          <span>{skill.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </Fragment>
                ))
              )}
            </SelectContent>
          </Select>
          {skillLoadError ? (
            <p className="text-xs text-rose-400">{skillLoadError}</p>
          ) : null}
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
