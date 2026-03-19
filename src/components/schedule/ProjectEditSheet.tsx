"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import * as Dialog from "@radix-ui/react-dialog";
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
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { Lock } from "lucide-react";
import {
  ScheduleMorphDialog,
  type ScheduleEditOrigin,
} from "@/components/schedule/ScheduleMorphDialog";
import {
  FAB_BUTTON_ACTION_CLASS,
  FAB_FIELD_CONTROL_CLASS,
  FAB_FIELD_HELP_TEXT_CLASS,
  FAB_FIELD_LABEL_CLASS,
  FAB_FIELD_SELECT_CLASS,
  FAB_SELECT_SEARCH_INPUT_CLASS,
  FAB_SECTION_CARD_CLASS,
  FAB_SECTION_HEADING_TEXT_CLASS,
} from "@/components/ui/fab-form-classes";
import {
  type ScheduleInstance,
  type ScheduleContext,
  updateInstanceStatus,
} from "@/lib/scheduler/instanceRepo";

const toDatetimeLocalValue = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  {}
);
const PRIORITY_NUMERIC_PATTERN = /^\d+$/;

const resolvePriorityOption = (
  raw: unknown,
  lookup: Record<string, string> = {}
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
  lookup: Record<string, string> = {}
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
const getSkillIcon = (icon?: string | null) =>
  icon?.trim() || DEFAULT_SKILL_ICON;
const UNCATEGORIZED_GROUP_ID = "__uncategorized__";
const UNCATEGORIZED_GROUP_LABEL = "Uncategorized";

console.log("[ProjectEditSheet] MODULE LOADED");

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
  instance?: ScheduleInstance | null;
  scheduleContext?: ScheduleContext | null;
  eventTitle?: string | null;
  eventTypeLabel?: string | null;
  timeRangeLabel?: string | null;
  origin?: ScheduleEditOrigin | null;
  layoutId?: string;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
  onInstanceDeleted?: () => Promise<void> | void;
};

export function ProjectEditSheet({
  open,
  projectId,
  instance,
  scheduleContext,
  eventTitle,
  eventTypeLabel,
  timeRangeLabel,
  origin,
  layoutId,
  onClose,
  onSaved,
  onInstanceDeleted,
}: ProjectEditSheetProps) {
  console.log("[ProjectEditSheet] RENDER", { open, projectId });
  const supabase = getSupabaseBrowser();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(PRIORITY_OPTIONS[0].value);
  const [stage, setStage] = useState(STAGE_OPTIONS[0].value);
  const [energy, setEnergy] = useState<(typeof ENERGY.LIST)[number]>("NO");
  const [duration, setDuration] = useState("");
  const [goalId, setGoalId] = useState<string>("none");
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [lockedInstance, setLockedInstance] = useState<ScheduleInstance | null>(
    null
  );
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [manualScheduleError, setManualScheduleError] = useState<string | null>(
    null
  );
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

  const handleClose = () => {
    resetState();
    onClose();
  };

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    if (!supabase) {
      setError("Supabase client not available.");
      return;
    }
    console.log("[ProjectEditSheet] loadProject START", projectId);
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

      const [projectResponse, goalsResponse, lockedResponse] =
        await Promise.all([
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
      setEnergy(
        scheduleContext?.energyResolved ??
          instance?.energy_resolved ??
          projectData.energy
      );

      setDuration(
        scheduleContext?.durationMin != null
          ? String(scheduleContext.durationMin)
          : instance?.duration_min
          ? String(instance.duration_min)
          : String(projectData.duration_min)
      );
      setGoalId(
        projectData.goal_id && projectData.goal_id.trim().length > 0
          ? projectData.goal_id
          : "none"
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
        })
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

      const { data: projectSkillsData, error: projectSkillsError } =
        await supabase
          .from("project_skills")
          .select("skill_id")
          .eq("project_id", projectId)
          .limit(1);

      if (projectSkillsError) {
        console.error(
          "Failed to load project skill relation:",
          projectSkillsError
        );
        setSelectedSkillId(null);
        setInitialSkillId(null);
      } else {
        const primarySkillId = projectSkillsData?.[0]?.skill_id ?? null;
        setSelectedSkillId(primarySkillId);
        setInitialSkillId(primarySkillId);
      }
      if (lockedResponse.error) {
        console.error(
          "Failed to load locked schedule instance:",
          lockedResponse.error
        );
        setLockedInstance(null);
        setManualStart("");
        setManualEnd("");
      } else {
        const lockedRecord =
          (lockedResponse.data?.[0] as ScheduleInstance | undefined) ?? null;
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
          : "Unable to load this project right now."
      );
    } finally {
      setLoading(false);
      setGoalsLoading(false);
      setSkillsLoading(false);
      console.log("[ProjectEditSheet] loadProject END", projectId);
    }
  }, [projectId, supabase]);

  useEffect(() => {
    if (open && projectId) {
      void loadProject();
    }
  }, [open, projectId, loadProject]);

  useEffect(() => {
    if (!open) {
      setDeleteConfirmOpen(false);
      setDeleteError(null);
    }
  }, [open]);

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

    return skillOptions.filter(
      (skill) =>
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
          : "Unable to update this project right now."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInstance = useCallback(async () => {
    if (!projectId) {
      setDeleteError("Project ID unavailable.");
      return;
    }
    setIsDeleting(true);
    setError(null);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/schedule/events/project/${projectId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error ?? "Unable to delete this project right now."
        );
      }
      setDeleteConfirmOpen(false);
      if (onInstanceDeleted) {
        await onInstanceDeleted();
      }
      onClose();
    } catch (err) {
      console.error("Failed to delete project:", err);
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Unable to delete this project right now."
      );
    } finally {
      setIsDeleting(false);
    }
  }, [projectId, onClose, onInstanceDeleted]);

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
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
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
    console.log("[ProjectEditSheet] NO PROJECT ID, returning null");
    return null;
  }

  console.log("[ProjectEditSheet] render state snapshot", {
    projectId,
    open,
    loading,
    error,
    disableSubmit,
    nameReady: Boolean(name),
    hasGoalOptions: goalOptions.length,
  });

  return (
    <>
      <ScheduleMorphDialog
      open={open}
      title={eventTitle ?? "Project"}
      subtitle={timeRangeLabel}
      typeLabel={eventTypeLabel ?? "Project"}
      onClose={handleClose}
      origin={origin}
      layoutId={layoutId}
      focusRef={nameInputRef}
    >
      {loading ? (
        <div className="px-1 py-4 text-sm text-white/70">Loading…</div>
      ) : (
        <>
          {console.log("[ProjectEditSheet] rendering form", {
            loading,
            error,
            disableSubmit,
            name,
            duration,
          })}
          <form
            onSubmit={handleSubmit}
            onClick={(event) => {
              const target = event.target as HTMLElement | null;
              console.log("[ProjectEditSheet] form click received", {
                tagName: target?.tagName,
                className: target?.className,
              });
            }}
            className="flex flex-col gap-3"
          >
            <div className="grid gap-3 grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-1.5 min-w-0">
                <Label className={FAB_FIELD_LABEL_CLASS}>Project name</Label>
                <Input
                  ref={nameInputRef}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Project title"
                  className={FAB_FIELD_CONTROL_CLASS}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2 min-w-0">
                <Label className={FAB_FIELD_LABEL_CLASS}>Energy</Label>
                <Select
                  value={energy}
                  onValueChange={(value) =>
                    setEnergy(value as (typeof ENERGY.LIST)[number])
                  }
                  disabled={loading}
                  triggerClassName="h-9 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white flex items-center justify-center"
                  hideChevron
                  trigger={
                    <div className="flex h-full w-full items-center justify-center">
                      {energy ? (
                        <FlameEmber
                          level={energy as FlameLevel}
                          size="md"
                          className="-translate-y-[3px]"
                        />
                      ) : (
                        <span className="text-zinc-400">Energy</span>
                      )}
                    </div>
                  }
                >
                  <SelectContent className="bg-[#05070c] text-white">
                    {ENERGY.LIST.map((value) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center justify-center py-2">
                          <FlameEmber
                            level={value as FlameLevel}
                            size="md"
                            className="shrink-0"
                          />
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2 grid-cols-5">
              <div className="space-y-2 col-span-2">
                <Label className={FAB_FIELD_LABEL_CLASS}>Priority</Label>
                <Select
                  value={priority}
                  onValueChange={setPriority}
                  disabled={loading}
                >
                  <SelectTrigger
                    className={cn(
                      FAB_FIELD_SELECT_CLASS,
                      "uppercase text-xs"
                    )}
                  >
                    <SelectValue
                      className="uppercase text-xs"
                      placeholder="Priority"
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-[#05070c] text-white">
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-xs"
                      >
                        {option.label.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className={FAB_FIELD_LABEL_CLASS}>Stage</Label>
                <Select
                  value={stage}
                  onValueChange={setStage}
                  disabled={loading}
                >
                  <SelectTrigger
                    className={cn(
                      FAB_FIELD_SELECT_CLASS,
                      "uppercase text-xs"
                    )}
                  >
                    <SelectValue
                      className="uppercase text-xs"
                      placeholder="Stage"
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-[#05070c] text-white">
                    {STAGE_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-xs"
                      >
                        {option.label.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-1">
              <Label className={FAB_FIELD_LABEL_CLASS}>DURATION</Label>
                <Input
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  placeholder="60"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={cn(FAB_FIELD_CONTROL_CLASS, "text-sm")}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={FAB_FIELD_LABEL_CLASS}>Goal</Label>
              <Select
                value={
                  goalOptions.some((option) => option.value === goalId)
                    ? goalId
                    : "none"
                }
                onValueChange={setGoalId}
                disabled={goalsLoading || loading}
              >
                <SelectTrigger className={FAB_FIELD_SELECT_CLASS}>
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

            <div className="space-y-2">
              <Label className={FAB_FIELD_LABEL_CLASS}>Skill relation</Label>
              <Select
                value={selectedSkillId ?? "none"}
                onValueChange={(value) =>
                  setSelectedSkillId(value === "none" ? null : value)
                }
                disabled={skillsLoading && skillOptions.length === 0}
              >
                <SelectTrigger className={FAB_FIELD_SELECT_CLASS}>
                  <SelectValue placeholder="Choose a linked skill" />
                </SelectTrigger>
                <SelectContent className="bg-[#05070c] text-white">
                  <div className="p-2">
                    <Input
                      value={skillSearch}
                      onChange={(event) => setSkillSearch(event.target.value)}
                      placeholder="Search skills..."
                      className={FAB_SELECT_SEARCH_INPUT_CLASS}
                    />
                  </div>
                  <SelectItem value="none">No linked skill</SelectItem>
                  {filteredSkills.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-white/60">
                      {skillsLoading
                        ? "Loading skills…"
                        : "No skills match your search."}
                    </div>
                  ) : (
                    groupedSkills.map((group, index) => (
                      <Fragment key={group.id}>
                        <div
                          className={cn("px-3 pt-2", index === 0 ? "pt-0" : "")}
                        >
                          <p className={FAB_SECTION_HEADING_TEXT_CLASS}>
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

            <div className={FAB_SECTION_CARD_CLASS}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={FAB_SECTION_HEADING_TEXT_CLASS}>
                    Manual schedule
                  </p>
                  <p className={FAB_FIELD_HELP_TEXT_CLASS}>
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
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                    <div className="space-y-0.5">
                      <Label className={FAB_FIELD_LABEL_CLASS}>Start time</Label>
                      <Input
                        type="datetime-local"
                        value={manualStart}
                        onChange={(event) => setManualStart(event.target.value)}
                        disabled={manualScheduleSaving}
                        className={FAB_FIELD_CONTROL_CLASS}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className={FAB_FIELD_LABEL_CLASS}>End time</Label>
                      <Input
                        type="datetime-local"
                        value={manualEnd}
                        onChange={(event) => setManualEnd(event.target.value)}
                        disabled={manualScheduleSaving}
                        className={FAB_FIELD_CONTROL_CLASS}
                      />
                    </div>
                  </div>
                  {manualScheduleError ? (
                    <p className="text-sm text-red-300">
                      {manualScheduleError}
                    </p>
                  ) : (
                    <p className={FAB_SECTION_HELP_TEXT_SMALL_CLASS}>
                      Update the exact timing for this locked project or remove
                      the lock to return it to the automatic scheduler.
                    </p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      onClick={handleUpdateLockedSchedule}
                      disabled={manualScheduleSaving}
                      className="flex-1 h-10 rounded-xl bg-white text-sm text-zinc-900 hover:bg-white/90"
                    >
                      {manualScheduleSaving ? "Saving…" : "Update times"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveLockedSchedule}
                      disabled={manualScheduleSaving}
                      className="flex-1 h-10 rounded-xl border-red-500/40 text-sm text-red-200 hover:bg-red-500/10"
                    >
                      Remove lock
                    </Button>
                  </div>
                </>
              ) : (
                <p className={FAB_FIELD_HELP_TEXT_CLASS}>
                  This project is currently scheduled dynamically. To lock a
                  project at a specific time, create it with manual times from
                  the scheduler’s project workflow.
                </p>
              )}
            </div>

            {error ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="space-y-2 pb-1">
              <div className="flex flex-wrap items-end justify-between gap-2 md:flex-col md:items-stretch">
                <div className="flex-1 min-w-0 md:w-full">
                  {instance ? (
                    <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                      <Button
                        type="button"
                        className="h-10 w-full rounded-xl bg-gradient-to-b from-[#7a1f2a] to-[#4b0f18] px-3 text-sm font-semibold text-white shadow-inner transition hover:from-[#8f2633] hover:to-[#5a121e]"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteConfirmOpen(true);
                        }}
                        disabled={isDeleting || saving || loading}
                      >
                        {isDeleting ? "Deleting…" : "Delete project"}
                      </Button>
                      <Button
                        type="button"
                        onClick={onClose}
                        disabled={saving || isDeleting}
                        className={cn(FAB_BUTTON_ACTION_CLASS, "w-full")}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      onClick={onClose}
                      disabled={saving || isDeleting}
                      className={cn(FAB_BUTTON_ACTION_CLASS, "w-full")}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
                <div className="flex shrink-0 justify-end gap-3 md:justify-end">
                  <Button
                    type="submit"
                    className={cn(
                      "h-10 rounded-xl bg-white px-3 text-sm text-zinc-900 hover:bg-white/90",
                      disableSubmit && "opacity-50"
                    )}
                    disabled={disableSubmit || isDeleting}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </>
      )}
    </ScheduleMorphDialog>
    <Dialog.Root
      open={deleteConfirmOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setDeleteError(null);
        }
        setDeleteConfirmOpen(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-4 bottom-6 z-[260] w-[min(90vw,440px)] max-h-[calc(100dvh-3.5rem)] max-w-[440px] rounded-3xl border border-white/10 bg-[#05070c] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.65)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            "flex min-h-0 flex-col",
            "md:inset-x-auto md:left-1/2 md:top-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2"
          )}
        >
          <div className="flex min-h-0 flex-col gap-4">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <div className="space-y-2">
                <Dialog.Title className="text-lg font-semibold text-white">
                  ARE YOU SURE?
                </Dialog.Title>
                <Dialog.Description className="text-sm text-white/70">
                  Deleting this project removes the entire project record and ALL
                  scheduled instances permanently.
                </Dialog.Description>
              </div>
              {deleteError ? (
                <p className="text-sm text-rose-400">{deleteError}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteError(null);
                }}
                className="h-10 w-full rounded-xl border-white/20 text-sm text-white/80 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDeleteInstance}
                disabled={isDeleting}
                className="h-10 w-full rounded-xl bg-gradient-to-b from-[#7a1f2a] to-[#4b0f18] px-3 text-sm font-semibold text-white shadow-inner transition hover:from-[#8f2633] hover:to-[#5a121e]"
              >
                {isDeleting ? "Deleting…" : "Delete project"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    </>
  );
}
