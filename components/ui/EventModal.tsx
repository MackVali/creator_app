"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  CheckSquare,
  Clock,
  ChevronDown,
  FolderKanban,
  Leaf,
  PenSquare,
  Plus,
  Repeat,
  Sparkles,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import {
  HabitFormFields,
  HABIT_RECURRENCE_OPTIONS,
  HABIT_TYPE_OPTIONS,
  type HabitEnergySelectOption,
  type HabitSkillSelectOption,
  type HabitGoalSelectOption,
} from "@/components/habits/habit-form-fields";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Textarea } from "./textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Badge } from "./badge";
import { useToastHelpers } from "./toast";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalsForUser } from "@/lib/queries/goals";
import {
  getProjectsForGoal,
  getProjectsForUser,
  type Project,
} from "@/lib/queries/projects";
import {
  getMonumentsForUser,
  type Monument,
} from "@/lib/queries/monuments";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getCatsForUser } from "@/lib/data/cats";
import type { CatRow } from "@/lib/types/cat";
import {
  DEFAULT_ENERGY,
  DEFAULT_PRIORITY,
  DEFAULT_TASK_STAGE,
  createDraftProject,
  createDraftTask,
  type DraftProject,
  type DraftTask,
} from "@/lib/drafts/projects";
import { projectWeight } from "@/lib/scheduler/weight";
import { isValidUuid, resolveLocationContextId } from "@/lib/location-metadata";
import { useHabitWindows } from "@/lib/hooks/useHabitWindows";
import { resolveEveryXDaysInterval } from "@/lib/recurrence";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/supabase";

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventType: "GOAL" | "PROJECT" | "TASK" | "HABIT" | null;
}

type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  renderIcon?: (selected: boolean) => ReactNode;
  disabled?: boolean;
};

type PriorityDefinition = {
  id: string;
  name: string;
  order_index: number | null;
};

type EnergyDefinition = {
  id: string;
  name: string;
  order_index: number | null;
};

type RoutineOption = {
  id: string;
  name: string;
  description: string | null;
};

type RoutineSelectOption = {
  value: string;
  label: string;
  description?: string | null;
  disabled?: boolean;
};

const formatNameValue = (value: string) => value.toUpperCase();
const formatNameDisplay = (value?: string | null) =>
  value ? value.toUpperCase() : "";

type GoalWizardRpcInput = {
  user_id: string;
  name: string;
  priority: string;
  energy: string;
  monument_id: string;
  why: string | null;
  due_date: string | null;
};

type NormalizedTaskPayload = {
  name: string;
  stage: string;
  priority: string;
  energy: string;
  notes: string | null;
  skill_id: string | null;
  due_date: string | null;
};

type NormalizedProjectPayload = {
  name: string;
  stage: string;
  priority: string;
  energy: string;
  why: string | null;
  duration_min: number | null;
  skill_id: string | null;
  due_date: string | null;
  tasks: NormalizedTaskPayload[];
};

const normalizeLookupKey = (value?: string | null) => {
  if (!value) {
    return "";
  }
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
};

async function cleanupGoalHierarchy(
  supabase: SupabaseClient,
  goalId: string
) {
  const { error: taskCleanupError } = await supabase
    .from("tasks")
    .delete()
    .eq("goal_id", goalId);
  if (taskCleanupError) {
    console.error("Error cleaning up tasks for goal:", taskCleanupError);
  }

  const { error: projectCleanupError } = await supabase
    .from("projects")
    .delete()
    .eq("goal_id", goalId);
  if (projectCleanupError) {
    console.error("Error cleaning up projects for goal:", projectCleanupError);
  }

  const { error: goalCleanupError } = await supabase
    .from("goals")
    .delete()
    .eq("id", goalId);
  if (goalCleanupError) {
    console.error("Error cleaning up goal record:", goalCleanupError);
  }
}

async function createGoalFallback(
  supabase: SupabaseClient,
  goalInput: GoalWizardRpcInput,
  projects: NormalizedProjectPayload[]
): Promise<{ success: boolean; goalId: string | null; projectIds: string[] }> {
  let createdGoalId: string | null = null;
  const createdProjectIds: string[] = [];

  const fallbackGoalPriority =
    (goalInput.priority && String(goalInput.priority).trim()) || DEFAULT_PRIORITY;
  const fallbackGoalEnergy =
    (goalInput.energy && String(goalInput.energy).trim()) || DEFAULT_ENERGY;

  try {
    const { data: goalRecord, error: goalError } = await supabase
      .from("goals")
      .insert({
        user_id: goalInput.user_id,
        name: goalInput.name,
        priority: fallbackGoalPriority,
        energy: fallbackGoalEnergy,
        monument_id: goalInput.monument_id,
        why: goalInput.why,
        due_date: goalInput.due_date,
      })
      .select("id")
      .single();

    if (goalError || !goalRecord?.id) {
      console.error("Fallback goal insert failed:", goalError);
      return { success: false, goalId: null };
    }

    createdGoalId = goalRecord.id;

    for (const project of projects) {
      const projectPriorityCode =
        (project.priority && String(project.priority).trim()) || DEFAULT_PRIORITY;
      const projectEnergyCode =
        (project.energy && String(project.energy).trim()) || DEFAULT_ENERGY;
      const { data: projectRecord, error: projectError } = await supabase
        .from("projects")
        .insert({
          user_id: goalInput.user_id,
          goal_id: createdGoalId,
          name: project.name,
          stage: project.stage,
          priority: projectPriorityCode,
          energy: projectEnergyCode,
          why: project.why,
          duration_min: project.duration_min,
          due_date: project.due_date,
        })
        .select("id")
        .single();

      if (projectError || !projectRecord?.id) {
        console.error("Fallback project insert failed:", projectError);
        throw projectError ?? new Error("Project insert failed");
      }
      createdProjectIds.push(projectRecord.id);

      if (project.skill_id) {
        const { error: projectSkillError } = await supabase
          .from("project_skills")
          .insert({
            project_id: projectRecord.id,
            skill_id: project.skill_id,
          });

        if (projectSkillError) {
          console.error(
            "Fallback project skill link failed:",
            projectSkillError
          );
        }
      }

      if (project.tasks.length > 0) {
        const { error: taskError } = await supabase
          .from("tasks")
          .insert(
            project.tasks.map((task) => ({
              user_id: goalInput.user_id,
              goal_id: createdGoalId,
              project_id: projectRecord.id,
              name: task.name,
              stage: task.stage,
              priority:
                (task.priority && String(task.priority).trim()) || DEFAULT_PRIORITY,
              energy:
                (task.energy && String(task.energy).trim()) || DEFAULT_ENERGY,
              notes: task.notes,
              skill_id: task.skill_id,
              due_date: task.due_date,
            }))
          );

        if (taskError) {
          console.error("Fallback task insert failed:", taskError);
          throw taskError;
        }
      }
    }

    return { success: true, goalId: createdGoalId, projectIds: createdProjectIds };
  } catch (error) {
    console.error("Fallback goal creation failed:", error);
    if (createdGoalId) {
      await cleanupGoalHierarchy(supabase, createdGoalId);
    }
    return { success: false, goalId: null, projectIds: [] };
  }
}

type LockedPlacementInput = {
  projectId: string;
  startUTC: string;
  endUTC: string;
  durationMin: number;
  priority: string;
  stage: string;
  energy: string;
  dueDate?: string | null;
};

async function persistLockedProjectPlacements({
  supabase,
  userId,
  placements,
}: {
  supabase: SupabaseClient;
  userId: string;
  placements: LockedPlacementInput[];
}) {
  if (placements.length === 0) return;
  const rows = placements.map((placement) => {
    const weightSnapshot = projectWeight(
      {
        id: placement.projectId,
        priority: placement.priority,
        stage: placement.stage,
        duration_min: placement.durationMin,
        energy: placement.energy,
        due_date: placement.dueDate ?? null,
      },
      0
    );
    const energyResolved =
      placement.energy && placement.energy.trim().length > 0
        ? placement.energy.toUpperCase()
        : "NO";
    return {
      user_id: userId,
      source_type: "PROJECT",
      source_id: placement.projectId,
      window_id: null,
      start_utc: placement.startUTC,
      end_utc: placement.endUTC,
      duration_min: placement.durationMin,
      status: "scheduled" as const,
      weight_snapshot: weightSnapshot,
      energy_resolved: energyResolved,
      locked: true,
    };
  });
  const { error } = await supabase.from("schedule_instances").insert(rows);
  if (error) {
    throw error;
  }
}

const PRIORITY_META = [
  { code: "NO", label: "No Priority" },
  { code: "LOW", label: "Low Priority" },
  { code: "MEDIUM", label: "Medium Priority" },
  { code: "HIGH", label: "High Priority" },
  { code: "CRITICAL", label: "Critical Priority" },
  { code: "ULTRA-CRITICAL", label: "Ultra Critical Priority" },
] as const;

const DEFAULT_PRIORITY_DEFINITIONS: PriorityDefinition[] = PRIORITY_META.map(
  (entry, index) => ({
    id: String(index + 1),
    name: entry.label,
    order_index: index,
  })
);

const ENERGY_META = [
  { code: "NO", label: "No Energy", level: "NO" as FlameLevel },
  { code: "LOW", label: "Low Energy", level: "LOW" as FlameLevel },
  { code: "MEDIUM", label: "Medium Energy", level: "MEDIUM" as FlameLevel },
  { code: "HIGH", label: "High Energy", level: "HIGH" as FlameLevel },
  { code: "ULTRA", label: "Ultra Energy", level: "ULTRA" as FlameLevel },
  { code: "EXTREME", label: "Extreme Energy", level: "EXTREME" as FlameLevel },
] as const;

const DEFAULT_ENERGY_DEFINITIONS: EnergyDefinition[] = ENERGY_META.map(
  (entry, index) => ({
    id: String(index + 1),
    name: entry.label,
    order_index: index,
  })
);

const MAX_PRACTICE_ENERGY_CODE =
  ENERGY_META[ENERGY_META.length - 1]?.code ?? DEFAULT_ENERGY;

const renderFlameIcon = (level: FlameLevel) => {
  const FlameIcon = () => (
    <FlameEmber level={level} size="sm" className="shrink-0" />
  );
  FlameIcon.displayName = `FlameIcon${level}`;
  return FlameIcon;
};

const normalizeSelectionLabel = (value?: string | null) => {
  if (!value) return "";
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
};

const resolveSelectValue = (
  currentValue: string,
  options: ChoiceOption[],
  stripWord?: string
): string => {
  if (options.length === 0) {
    return currentValue;
  }
  const optionIds = new Set(options.map((option) => option.value));
  if (optionIds.has(currentValue)) {
    return currentValue;
  }
  const normalized = normalizeSelectionLabel(currentValue);
  if (normalized) {
    for (const option of options) {
      const normalizedLabel = normalizeSelectionLabel(option.label);
      if (normalizedLabel === normalized) {
        return option.value;
      }
      if (stripWord) {
        const stripped = normalizedLabel.replace(stripWord, "");
        if (stripped === normalized) {
          return option.value;
        }
      }
    }
  }
  return options[0]?.value ?? currentValue;
};

const matchPriorityCodeFromLabel = (label: string): string | null => {
  const normalized = normalizeSelectionLabel(label).replace("PRIORITY", "");
  for (const entry of PRIORITY_META) {
    const normalizedLabel = normalizeSelectionLabel(entry.label).replace(
      "PRIORITY",
      ""
    );
    if (normalizedLabel === normalized || entry.code === normalized) {
      return entry.code;
    }
  }
  return null;
};

const matchEnergyCodeFromLabel = (label: string): string | null => {
  const normalized = normalizeSelectionLabel(label).replace("ENERGY", "");
  for (const entry of ENERGY_META) {
    const normalizedLabel = normalizeSelectionLabel(entry.label).replace(
      "ENERGY",
      ""
    );
    if (normalizedLabel === normalized || entry.code === normalized) {
      return entry.code;
    }
  }
  return null;
};

const inferPriorityCodeFromLabel = (label: string): string =>
  matchPriorityCodeFromLabel(label) ?? DEFAULT_PRIORITY;

const inferEnergyCodeFromLabel = (label: string): string =>
  matchEnergyCodeFromLabel(label) ?? DEFAULT_ENERGY;

const priorityCodeToOptionId = (
  code: string,
  definitions: PriorityDefinition[]
): string | null => {
  const normalized = normalizeSelectionLabel(code);
  const match = definitions.find((entry) => {
    const labelNormalized = normalizeSelectionLabel(entry.name);
    return (
      labelNormalized === normalized || String(entry.id).toUpperCase() === normalized
    );
  });
  return match ? match.id : null;
};

const energyCodeToOptionId = (
  code: string,
  definitions: EnergyDefinition[]
): string | null => {
  const normalized = normalizeSelectionLabel(code);
  const match = definitions.find((entry) => {
    const labelNormalized = normalizeSelectionLabel(entry.name);
    return (
      labelNormalized === normalized || String(entry.id).toUpperCase() === normalized
    );
  });
  return match ? match.id : null;
};

const legacyPriorityCodeFromSelection = (
  value: string,
  options: ChoiceOption[]
): string => {
  const option = options.find((entry) => entry.value === value);
  if (!option) {
    return DEFAULT_PRIORITY;
  }
  return inferPriorityCodeFromLabel(option.label);
};

const legacyEnergyCodeFromSelection = (
  value: string,
  options: ChoiceOption[]
): string => {
  const option = options.find((entry) => entry.value === value);
  if (!option) {
    return DEFAULT_ENERGY;
  }
  return inferEnergyCodeFromLabel(option.label);
};

const PROJECT_STAGE_OPTIONS: ChoiceOption[] = [
  { value: "RESEARCH", label: "Research", description: "Gather insight and define the edges." },
  { value: "TEST", label: "Test", description: "Experiment and validate assumptions." },
  { value: "BUILD", label: "Build", description: "Execute the core of the work." },
  { value: "REFINE", label: "Refine", description: "Polish and iterate based on feedback." },
  { value: "RELEASE", label: "Release", description: "Launch, share, or deliver the outcome." },
];

const TASK_STAGE_OPTIONS: ChoiceOption[] = [
  { value: "PREPARE", label: "Prepare", description: "Set up or gather what you need." },
  { value: "PRODUCE", label: "Produce", description: "Do the focused work." },
  { value: "PERFECT", label: "Perfect", description: "Review, tidy, and ship it." },
];

const DEFAULT_SKILL_ICON = "✦";
const getSkillIcon = (icon?: string | null) => icon?.trim() || DEFAULT_SKILL_ICON;
const UNCATEGORIZED_GROUP_ID = "__uncategorized__";
const UNCATEGORIZED_GROUP_LABEL = "Uncategorized";

interface FormState {
  name: string;
  description: string;
  priority: string;
  energy: string;
  goal_id: string;
  project_id: string;
  monument_id: string;
  skill_id: string;
  skill_ids: string[];
  duration_min: string;
  stage: string;
  type: string;
  recurrence: string;
  recurrence_days: number[];
  location_context_id: string;
  daylight_preference: string;
  window_edge_preference: string;
  window_id: string;
  completion_target: string;
  manual_start: string;
  manual_end: string;
}

type GoalWizardStep = "GOAL" | "PROJECTS" | "TASKS";

interface GoalWizardFormState {
  name: string;
  priority: string;
  energy: string;
  monument_id: string;
  why: string;
  dueDate: string;
}

const createInitialGoalWizardForm = (): GoalWizardFormState => ({
  name: "",
  priority: "",
  energy: "",
  monument_id: "",
  why: "",
  dueDate: "",
});

const GOAL_WIZARD_STEPS: { key: GoalWizardStep; label: string }[] = [
  { key: "GOAL", label: "Goal" },
  { key: "PROJECTS", label: "Projects" },
  { key: "TASKS", label: "Tasks" },
];

const createInitialFormState = (
  eventType: NonNullable<EventModalProps["eventType"]>
): FormState => ({
  name: "",
  description: "",
  priority: "",
  energy: "",
  goal_id: "",
  project_id: "",
  monument_id: "",
  skill_id: "",
  skill_ids: [],
  duration_min: eventType === "HABIT" ? "15" : "",
  stage:
    eventType === "PROJECT"
      ? PROJECT_STAGE_OPTIONS[0].value
      : eventType === "TASK"
      ? TASK_STAGE_OPTIONS[0].value
      : "",
  type: eventType === "HABIT" ? HABIT_TYPE_OPTIONS[0].value : "",
  recurrence:
    eventType === "HABIT" ? HABIT_RECURRENCE_OPTIONS[0].value : "",
  recurrence_days: [],
  location_context_id: "",
  daylight_preference: "ALL_DAY",
  window_edge_preference: "FRONT",
  window_id: "",
  completion_target: eventType === "HABIT" ? "10" : "",
  manual_start: "",
  manual_end: "",
});

type EventMeta = {
  title: string;
  badge: string;
  eyebrow: string;
  accent: string;
  iconBg: string;
  icon: LucideIcon;
};

interface FormSectionProps {
  title?: string;
  children: ReactNode;
}

function FormSection({ title, children }: FormSectionProps) {
  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.8)] sm:p-5">
      {title ? (
        <>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
              {title}
            </p>
          </div>
          <div className="mt-4 space-y-4">{children}</div>
        </>
      ) : (
        <div className="space-y-4">{children}</div>
      )}
    </section>
  );
}

interface SkillMultiSelectProps {
  skills: Skill[];
  selectedIds: string[];
  onToggle: (skillId: string) => void;
  buttonClassName?: string;
  categories?: CatRow[];
  placeholder?: string;
}

function SkillMultiSelect({
  skills,
  selectedIds,
  onToggle,
  buttonClassName,
  categories = [],
  placeholder = "Select skills...",
}: SkillMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sortedSkills = useMemo(
    () =>
      [...skills].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [skills]
  );

  const filteredSkills = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return sortedSkills;
    }

    return sortedSkills.filter((skill) =>
      skill.name.toLowerCase().includes(query)
    );
  }, [sortedSkills, searchTerm]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, CatRow>();
    categories.forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [categories]);

  type CategoryGroup = {
    id: string;
    label: string;
    skills: Skill[];
  };

  const groupedSkills = useMemo(() => {
    const groups = new Map<string, CategoryGroup>();
    filteredSkills.forEach((skill) => {
      const groupId = skill.cat_id ?? UNCATEGORIZED_GROUP_ID;
      const label =
        groupId === UNCATEGORIZED_GROUP_ID
          ? UNCATEGORIZED_GROUP_LABEL
          : categoryLookup.get(groupId)?.name?.trim() ||
            UNCATEGORIZED_GROUP_LABEL;
      let group = groups.get(groupId);
      if (!group) {
        group = { id: groupId, label, skills: [] };
        groups.set(groupId, group);
      }
      group.skills.push(skill);
    });

    if (groups.size === 0) {
      return [];
    }

    const ordered: CategoryGroup[] = [];
    const seen = new Set<string>();

    categories.forEach((category) => {
      const group = groups.get(category.id);
      if (group) {
        group.label = category.name?.trim() || group.label;
        ordered.push(group);
        seen.add(category.id);
      }
    });

    const uncategorizedGroup = groups.get(UNCATEGORIZED_GROUP_ID);
    if (uncategorizedGroup) {
      ordered.push(uncategorizedGroup);
      seen.add(UNCATEGORIZED_GROUP_ID);
    }

    for (const [groupId, group] of groups) {
      if (!seen.has(groupId)) {
        ordered.push(group);
        seen.add(groupId);
      }
    }

    return ordered;
  }, [filteredSkills, categories, categoryLookup]);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      return;
    }

    const frame = requestAnimationFrame(() => {
      const input = searchInputRef.current;
      input?.focus();
      input?.select();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const [firstMatch] = filteredSkills;
        if (firstMatch) {
          onToggle(firstMatch.id);
          setSearchTerm("");
          requestAnimationFrame(() => {
            const input = searchInputRef.current;
            input?.focus();
          });
        }
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [filteredSkills, isOpen, onToggle]);

  const selectedSkills = useMemo(
    () => sortedSkills.filter((skill) => selectedIds.includes(skill.id)),
    [sortedSkills, selectedIds]
  );

  const hasSkills = sortedSkills.length > 0;

  useEffect(() => {
    if (!hasSkills) {
      setIsOpen(false);
    }
  }, [hasSkills]);

  const summaryText = hasSkills
    ? selectedSkills.length === 0
      ? placeholder
      : selectedSkills.length <= 2
      ? selectedSkills
          .map((skill) => `${getSkillIcon(skill.icon)} ${skill.name}`)
          .join(", ")
      : `${selectedSkills.length} skills selected`
    : "No skills available";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => hasSkills && setIsOpen((prev) => !prev)}
        disabled={!hasSkills}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-100 shadow-[0_0_0_1px_rgba(148,163,184,0.06)] transition focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60",
          isOpen && hasSkills && "border-blue-400/70",
          buttonClassName
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="flex-1 min-w-0 break-words text-left text-sm leading-tight text-zinc-100">
          {summaryText}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 opacity-50 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>
      {isOpen && hasSkills ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0f172a] shadow-xl shadow-black/40">
          <div className="p-2">
            <Input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search skills..."
              className="h-9 border-white/10 bg-white/[0.02] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus:outline-none focus:ring-0"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {groupedSkills.length > 0 ? (
              groupedSkills.map((group) => (
                <div key={group.id} className="space-y-2 px-2 pb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                    {group.label}
                  </p>
                  <div className="grid gap-2">
                    {group.skills.map((skill) => {
                      const isSelected = selectedIds.includes(skill.id);
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => {
                            onToggle(skill.id);
                            setSearchTerm("");
                            requestAnimationFrame(() => {
                              const input = searchInputRef.current;
                              input?.focus();
                            });
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg border border-transparent px-2 py-1 text-[10px] text-zinc-200 transition hover:border-white/20 hover:bg-white/5",
                            isSelected && "border-blue-500/40 bg-blue-500/10 text-white"
                          )}
                        >
                          <span className="flex items-center gap-1 truncate">
                            <span className="text-xs leading-none">
                              {getSkillIcon(skill.icon)}
                            </span>
                            <span className="truncate text-[11px]">{skill.name}</span>
                          </span>
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-blue-400" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-zinc-500">
                No skills match your search.
              </p>
            )}
          </div>
        </div>
      ) : null}
      {selectedSkills.length > 0 ? (
        <div className="mt-3 flex w-full flex-wrap gap-2">
          {selectedSkills.map((skill) => (
            <Badge
              key={skill.id}
              variant="outline"
              className="flex flex-wrap items-center gap-1 border-white/15 bg-white/[0.05] px-3 py-1 text-[10px] leading-tight text-zinc-100 !whitespace-normal !shrink max-w-[220px] break-words min-w-0"
            >
              <span className="text-sm leading-none">
                {getSkillIcon(skill.icon)}
              </span>
              <span className="break-words text-left">{skill.name}</span>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface OptionDropdownProps {
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: "default" | "black";
  itemSize?: "default" | "compact";
}

function OptionDropdown({
  value,
  options,
  onChange,
  placeholder,
  variant = "default",
  itemSize = "default",
}: OptionDropdownProps) {
  const triggerClassName =
    variant === "black"
      ? "h-12 rounded-2xl border border-white/10 bg-black/80 px-4 text-sm font-medium text-white shadow-[0_22px_45px_-32px_rgba(15,23,42,0.9)] transition focus:ring-blue-500/70 hover:border-blue-500/40"
      : "h-12 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-950/90 via-slate-950/70 to-slate-950 px-4 text-sm font-medium text-zinc-100 shadow-[0_22px_45px_-32px_rgba(15,23,42,0.9)] transition focus:ring-blue-500/70 hover:border-blue-500/40";
  const itemBaseClass =
    itemSize === "compact"
      ? "group relative rounded-lg border border-transparent bg-white/[0.01] px-3 py-2 text-left text-xs"
      : "group relative rounded-xl border border-transparent bg-white/[0.02] px-4 py-3 text-left";
  const iconWrapperClass =
    itemSize === "compact"
      ? "flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.01] text-[11px] text-zinc-400 transition"
      : "flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.02] text-zinc-400 transition";
  return (
    <Select
      value={value}
      onValueChange={onChange}
      placeholder={placeholder}
      className="w-full"
      triggerClassName={triggerClassName}
      contentWrapperClassName="rounded-2xl border border-white/10 bg-[#020617]/95 backdrop-blur-xl shadow-[0_35px_60px_-40px_rgba(15,23,42,0.95)]"
    >
      <SelectContent className="max-h-72 space-y-1 p-2">
        {options.map((option) => {
          const selected = option.value === value;
          const IconComponent = option.icon;
          const iconNode = option.renderIcon
            ? option.renderIcon(selected)
            : IconComponent
            ? (
                <IconComponent
                  className={cn(
                    "h-4 w-4",
                    option.iconClassName ??
                      (selected ? "text-blue-400" : "text-zinc-400")
                  )}
                />
              )
            : null;

          return (
            <SelectItem
              key={option.value}
              value={option.value}
              label={option.label}
              disabled={option.disabled}
              className={cn(
                itemBaseClass,
                "transition hover:border-blue-500/40 hover:bg-white/[0.05]",
                selected &&
                  "border-blue-500/60 bg-blue-500/20 shadow-[0_18px_45px_-30px_rgba(59,130,246,0.6)]"
              )}
            >
              <div
                className={cn(
                  "flex items-start",
                  itemSize === "compact" ? "gap-3" : "gap-4"
                )}
              >
                {iconNode ? (
                  <span
                    className={cn(iconWrapperClass, selected && "bg-blue-500/20 text-blue-300")}
                  >
                    {iconNode}
                  </span>
                ) : null}
                <div className="flex flex-col">
                  <span
                    className={cn(
                      "font-semibold text-zinc-100",
                      itemSize === "compact" ? "text-xs" : "text-sm"
                    )}
                  >
                    {option.label}
                  </span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export function EventModal({ isOpen, onClose, eventType }: EventModalProps) {
  const [mounted, setMounted] = useState(false);
  const toast = useToastHelpers();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const resolvedType = eventType ?? "GOAL";
  const [formData, setFormData] = useState<FormState>(() =>
    createInitialFormState(resolvedType)
  );
  const [goalWizardStep, setGoalWizardStep] = useState<GoalWizardStep>("GOAL");
  const [goalForm, setGoalForm] = useState<GoalWizardFormState>(
    createInitialGoalWizardForm
  );
  const [draftProjects, setDraftProjects] = useState<DraftProject[]>(() => [
    createDraftProject(),
  ]);
  const [showGoalAdvanced, setShowGoalAdvanced] = useState(false);
  const [projectAdvanced, setProjectAdvanced] = useState<Record<string, boolean>>({});
  const [taskAdvanced, setTaskAdvanced] = useState<Record<string, boolean>>({});
  const [showProjectAdvancedOptions, setShowProjectAdvancedOptions] = useState(false);

  // State for dropdown data
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [routineOptions, setRoutineOptions] = useState<RoutineOption[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(false);
  const [routineLoadError, setRoutineLoadError] = useState<string | null>(null);
  const priorityDefinitions: PriorityDefinition[] = DEFAULT_PRIORITY_DEFINITIONS;
  const energyDefinitions: EnergyDefinition[] = DEFAULT_ENERGY_DEFINITIONS;
  const priorityOptionsLoading = false;
  const priorityOptionsError: string | null = null;
  const energyOptionsLoading = false;
  const energyOptionsError: string | null = null;
  const [routineId, setRoutineId] = useState<string>("none");
  const [newRoutineName, setNewRoutineName] = useState("");
  const [newRoutineDescription, setNewRoutineDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const sortedSkills = useMemo(
    () =>
      [...skills].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [skills]
  );

  const priorityChoiceOptions = useMemo<ChoiceOption[]>(() => {
    if (priorityDefinitions.length === 0) {
      return [];
    }
    return priorityDefinitions.map((priority) => {
      const rawLabel = priority.name?.trim() || String(priority.id);
      const matchedCode = matchPriorityCodeFromLabel(rawLabel);
      const displayLabel =
        matchedCode ?? rawLabel.toUpperCase().replace(/\s+/g, " ");
      return {
        value: priority.id,
        label: displayLabel,
      } satisfies ChoiceOption;
    });
  }, [priorityDefinitions]);

  const energyChoiceOptions = useMemo<ChoiceOption[]>(() => {
    if (energyDefinitions.length === 0) {
      return [];
    }
    return energyDefinitions.map((energy) => {
      const rawLabel = energy.name?.trim() || String(energy.id);
      const matchedCode = matchEnergyCodeFromLabel(rawLabel);
      const displayLabel =
        matchedCode ?? rawLabel.toUpperCase().replace(/\s+/g, " ");
      const level =
        ENERGY_META.find(
          (entry) => entry.code === (matchedCode ?? inferEnergyCodeFromLabel(rawLabel))
        )?.level ?? "LOW";
      return {
        value: energy.id,
        label: displayLabel,
        renderIcon: renderFlameIcon(level),
      } satisfies ChoiceOption;
    });
  }, [energyDefinitions]);

  const habitEnergySelectOptions = useMemo<HabitEnergySelectOption[]>(() => {
    if (energyChoiceOptions.length === 0) {
      return [];
    }
    return energyChoiceOptions.map((option) => ({
      value: option.value,
      label: option.label,
    }));
  }, [energyChoiceOptions]);

  const resolvePriorityPayloadValue = useCallback(
    (value: string) => resolveSelectValue(value, priorityChoiceOptions, "PRIORITY"),
    [priorityChoiceOptions]
  );

  const resolveEnergyPayloadValue = useCallback(
    (value: string) => resolveSelectValue(value, energyChoiceOptions, "ENERGY"),
    [energyChoiceOptions]
  );

  const resetGoalWizard = useCallback(() => {
    const initialProject = createDraftProject();
    setGoalWizardStep("GOAL");
    setGoalForm(createInitialGoalWizardForm());
    setDraftProjects([initialProject]);
    setShowGoalAdvanced(false);
    setProjectAdvanced({ [initialProject.id]: false });
    const initialTaskState: Record<string, boolean> = {};
    initialProject.tasks.forEach((task) => {
      initialTaskState[task.id] = false;
    });
    setTaskAdvanced(initialTaskState);
  }, []);

  useEffect(() => {
    if (goalForm.dueDate && !showGoalAdvanced) {
      setShowGoalAdvanced(true);
    }
  }, [goalForm.dueDate, showGoalAdvanced]);

  useEffect(() => {
    setProjectAdvanced((prev) => {
      const next = { ...prev };
      let changed = false;
      const currentIds = new Set<string>();
      draftProjects.forEach((draft) => {
        currentIds.add(draft.id);
        const hasAdvancedData = Boolean(
          draft.skillId || draft.dueDate || draft.manualStart || draft.manualEnd
        );
        if (!(draft.id in next)) {
          next[draft.id] = hasAdvancedData;
          changed = true;
        } else if (hasAdvancedData && !next[draft.id]) {
          next[draft.id] = true;
          changed = true;
        }
      });
      Object.keys(next).forEach((id) => {
        if (!currentIds.has(id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setTaskAdvanced((prev) => {
      const next = { ...prev };
      let changed = false;
      const taskIds = new Set<string>();
      draftProjects.forEach((draft) => {
        draft.tasks.forEach((task) => {
          taskIds.add(task.id);
          const hasAdvancedData = Boolean(task.skillId || task.dueDate);
          if (!(task.id in next)) {
            next[task.id] = hasAdvancedData;
            changed = true;
          } else if (hasAdvancedData && !next[task.id]) {
            next[task.id] = true;
            changed = true;
          }
        });
      });
      Object.keys(next).forEach((id) => {
        if (!taskIds.has(id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [draftProjects]);

  useEffect(() => {
    if (!eventType) return;

    if (eventType === "GOAL") {
      resetGoalWizard();
    } else if (isOpen) {
      setFormData(createInitialFormState(eventType));
      setShowProjectAdvancedOptions(false);
    }
  }, [eventType, isOpen, resetGoalWizard]);

  useEffect(() => {
    if (!isOpen) {
      resetGoalWizard();
      setRoutineOptions([]);
      setRoutineLoadError(null);
      setRoutinesLoading(false);
      setRoutineId("none");
      setNewRoutineName("");
      setNewRoutineDescription("");
      setShowProjectAdvancedOptions(false);
    }
  }, [isOpen, resetGoalWizard]);

  useEffect(() => {
    if (
      eventType === "HABIT" &&
      formData.type.toUpperCase() === "PRACTICE" &&
      formData.recurrence.toLowerCase() !== "none"
    ) {
      setFormData((prev) => ({
        ...prev,
        recurrence: "none",
        recurrence_days: [],
      }));
    }
  }, [eventType, formData.recurrence, formData.type]);

  useEffect(() => {
    if (eventType !== "PROJECT") return;
    if (
      (formData.manual_start.trim().length > 0 ||
        formData.manual_end.trim().length > 0) &&
      !showProjectAdvancedOptions
    ) {
      setShowProjectAdvancedOptions(true);
    }
  }, [
    eventType,
    formData.manual_start,
    formData.manual_end,
    showProjectAdvancedOptions,
  ]);

  const loadFormData = useCallback(async () => {
    if (!eventType) return;

    setLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (eventType === "GOAL" || eventType === "HABIT") {
        const monumentsData = await getMonumentsForUser(user.id);
        setMonuments(monumentsData);
      } else {
        setMonuments([]);
      }

      if (eventType === "PROJECT" || eventType === "TASK") {
        const goalsData = await getGoalsForUser(user.id);
        setGoals(goalsData);
      }

      if (
        eventType === "GOAL" ||
        eventType === "PROJECT" ||
        eventType === "TASK" ||
        eventType === "HABIT"
      ) {
        setSkillsLoading(true);
        setSkillError(null);
        try {
          const [skillsData, categoriesData] = await Promise.all([
            getSkillsForUser(user.id),
            getCatsForUser(user.id),
          ]);
          setSkills(skillsData);
          setSkillCategories(categoriesData);
        } catch (error) {
          console.error("Error loading skills:", error);
          setSkills([]);
          setSkillCategories([]);
          setSkillError("Unable to load your skills right now.");
        } finally {
          setSkillsLoading(false);
        }
      } else {
        setSkills([]);
        setSkillError(null);
        setSkillsLoading(false);
        setSkillCategories([]);
      }

      if (eventType === "TASK") {
        const projectsData = await getProjectsForUser(user.id);
        setProjects(projectsData);
      }

      if (eventType === "HABIT") {
        setRoutinesLoading(true);
        setRoutineLoadError(null);
        try {
          const goalsData = await getGoalsForUser(user.id);
          setGoals(goalsData);

          const { data, error: routinesError } = await supabase
            .from("habit_routines")
            .select("id, name, description")
            .eq("user_id", user.id)
            .order("name", { ascending: true });

          if (routinesError) {
            throw routinesError;
          }

          const safeRoutines: RoutineOption[] = data ?? [];
          setRoutineOptions(safeRoutines);
          setRoutineLoadError(null);
          setRoutineId((current) => {
            if (current === "none" || current === "__create__") {
              return current;
            }

            return safeRoutines.some((option) => option.id === current)
              ? current
              : "none";
          });
        } catch (error) {
          console.error("Error loading habit routines:", error);
          setRoutineOptions([]);
          setRoutineLoadError("Unable to load your routines right now.");
        } finally {
          setRoutinesLoading(false);
        }
      }
    } catch (error) {
      console.error("Error loading form data:", error);
    } finally {
      setLoading(false);
    }
  }, [eventType]);

  useEffect(() => {
    if (isOpen && mounted && eventType) {
      loadFormData();
    }
  }, [isOpen, mounted, eventType, loadFormData]);

  useEffect(() => {
    if (eventType !== "HABIT") {
      setRoutineOptions([]);
      setRoutineLoadError(null);
      setRoutinesLoading(false);
      setRoutineId("none");
      setNewRoutineName("");
      setNewRoutineDescription("");
    }
  }, [eventType]);

  const priorityDropdownOptions = priorityChoiceOptions.length
    ? priorityChoiceOptions
    : [
        {
          value: "__priority_loading__",
          label:
            priorityOptionsError ??
            (priorityOptionsLoading ? "Loading priority options…" : "No priority options available"),
          disabled: true,
        },
      ];

  const energyDropdownOptions = energyChoiceOptions.length
    ? energyChoiceOptions
    : [
        {
          value: "__energy_loading__",
          label:
            energyOptionsError ??
            (energyOptionsLoading ? "Loading energy options…" : "No energy options available"),
          disabled: true,
        },
      ];

  const habitEnergyOptions = habitEnergySelectOptions.length
    ? habitEnergySelectOptions
    : [
        {
          value: "__habit_energy_loading__",
          label:
            energyOptionsError ??
            (energyOptionsLoading ? "Loading energy options…" : "No energy options available"),
          disabled: true,
        },
      ];

  const habitGoalSelectOptions = useMemo<HabitGoalSelectOption[]>(() => {
    if (loading && eventType === "HABIT") {
      return [
        {
          value: "none",
          label: "Loading goals…",
          disabled: true,
        },
      ];
    }

    if (goals.length === 0) {
      return [
        {
          value: "none",
          label: "Create a goal to link this temp habit",
          disabled: true,
        },
      ];
    }

    return [
      {
        value: "none",
        label: "Select a goal",
      },
      ...goals.map((goal) => ({
        value: goal.id,
        label: goal.name,
        description: goal.why ?? null,
      })),
    ];
  }, [eventType, goals, loading]);

  const routineSelectOptions = useMemo<RoutineSelectOption[]>(() => {
    if (routinesLoading) {
      return [
        {
          value: "none",
          label: "Loading routines…",
          disabled: true,
        },
      ];
    }

    const baseOptions = routineOptions.map((routine) => ({
      value: routine.id,
      label: routine.name,
      description: routine.description,
    }));

    return [
      {
        value: "none",
        label: "No routine",
      },
      ...baseOptions,
      {
        value: "__create__",
        label: "Create a new routine",
      },
    ];
  }, [routineOptions, routinesLoading]);

  const monumentLookup = useMemo(() => {
    const map = new Map<string, Monument>();
    monuments.forEach((monument) => {
      if (monument.id) {
        map.set(monument.id, monument);
      }
    });
    return map;
  }, [monuments]);

  const habitSkillSelectOptions = useMemo<HabitSkillSelectOption[]>(() => {
    if (skillsLoading) {
      return [
        {
          value: "none",
          label: "Loading skills…",
          disabled: true,
        },
      ];
    }

    if (sortedSkills.length === 0) {
      return [
        {
          value: "none",
          label: "No skill focus",
        },
      ];
    }

    return [
      {
        value: "none",
        label: "No skill focus",
      },
      ...sortedSkills.map((skill) => {
        const monumentId = skill.monument_id ?? null;
        const monumentDetails = monumentId
          ? monumentLookup.get(monumentId) ?? null
          : null;
        return {
          value: skill.id,
          label: skill.name,
          icon: skill.icon ?? null,
          catId: skill.cat_id ?? null,
          monumentId,
          monumentLabel: monumentDetails?.title ?? null,
          monumentEmoji: monumentDetails?.emoji ?? null,
        };
      }),
    ];
  }, [monumentLookup, skillsLoading, sortedSkills]);

  const {
    windowOptions: habitWindowOptions,
    windowsLoading: habitWindowsLoading,
    windowError: habitWindowError,
  } = useHabitWindows();

  useEffect(() => {
    if (priorityChoiceOptions.length === 0) {
      return;
    }

    setFormData((prev) => {
      const resolved = resolveSelectValue(prev.priority, priorityChoiceOptions, "PRIORITY");
      return resolved === prev.priority ? prev : { ...prev, priority: resolved };
    });

    setGoalForm((prev) => {
      const resolved = resolveSelectValue(prev.priority, priorityChoiceOptions, "PRIORITY");
      return resolved === prev.priority ? prev : { ...prev, priority: resolved };
    });

    setDraftProjects((prev) => {
      let changedAny = false;
      const nextProjects = prev.map((draft) => {
        const nextPriority = resolveSelectValue(draft.priority, priorityChoiceOptions, "PRIORITY");
        let changed = nextPriority !== draft.priority;
        const nextTasks = draft.tasks.map((task) => {
          const nextTaskPriority = resolveSelectValue(
            task.priority,
            priorityChoiceOptions,
            "PRIORITY"
          );
          if (nextTaskPriority !== task.priority) {
            changed = true;
            return { ...task, priority: nextTaskPriority };
          }
          return task;
        });
        if (changed) {
          changedAny = true;
          return { ...draft, priority: nextPriority, tasks: nextTasks };
        }
        return draft;
      });
      return changedAny ? nextProjects : prev;
    });
  }, [priorityChoiceOptions]);

  useEffect(() => {
    if (energyChoiceOptions.length === 0) {
      return;
    }

    setFormData((prev) => {
      const resolved = resolveSelectValue(prev.energy, energyChoiceOptions, "ENERGY");
      return resolved === prev.energy ? prev : { ...prev, energy: resolved };
    });

    setGoalForm((prev) => {
      const resolved = resolveSelectValue(prev.energy, energyChoiceOptions, "ENERGY");
      return resolved === prev.energy ? prev : { ...prev, energy: resolved };
    });

    setDraftProjects((prev) => {
      let changedAny = false;
      const nextProjects = prev.map((draft) => {
        const nextEnergy = resolveSelectValue(draft.energy, energyChoiceOptions, "ENERGY");
        let changed = nextEnergy !== draft.energy;
        const nextTasks = draft.tasks.map((task) => {
          const nextTaskEnergy = resolveSelectValue(
            task.energy,
            energyChoiceOptions,
            "ENERGY"
          );
          if (nextTaskEnergy !== task.energy) {
            changed = true;
            return { ...task, energy: nextTaskEnergy };
          }
          return task;
        });
        if (changed) {
          changedAny = true;
          return { ...draft, energy: nextEnergy, tasks: nextTasks };
        }
        return draft;
      });
      return changedAny ? nextProjects : prev;
    });
  }, [energyChoiceOptions]);

  const handleTaskSkillToggle = (skillId: string) => {
    setFormData((prev) => ({
      ...prev,
      skill_id: prev.skill_id === skillId ? "" : skillId,
    }));
  };

  const handleGoalChange = useCallback(
    async (goalId: string) => {
      setFormData((prev) => ({ ...prev, goal_id: goalId, project_id: "" }));

      if (eventType === "TASK" && goalId) {
        try {
          const projectsData = await getProjectsForGoal(goalId);
          setProjects(projectsData);
        } catch (error) {
          console.error("Error loading projects for goal:", error);
        }
      }
    },
    [eventType]
  );

  const toggleSkill = (skillId: string) => {
    setFormData((prev) => {
      const exists = prev.skill_ids.includes(skillId);
      return {
        ...prev,
        skill_ids: exists
          ? prev.skill_ids.filter((id) => id !== skillId)
          : [...prev.skill_ids, skillId],
      };
    });
  };

  function handleGoalFormChange<K extends keyof GoalWizardFormState>(
    key: K,
    value: GoalWizardFormState[K]
  ) {
    setGoalForm((prev) => ({
      ...prev,
      [key]: (key === "name"
        ? formatNameValue(value as string)
        : value) as GoalWizardFormState[K],
    }));
  }

  const handleDraftProjectChange = (
    projectId: string,
    field: keyof Omit<DraftProject, "id" | "tasks">,
    value: string
  ) => {
    const nextValue = field === "name" ? formatNameValue(value) : value;
    setDraftProjects((prev) =>
      prev.map((draft) =>
        draft.id === projectId ? { ...draft, [field]: nextValue } : draft
      )
    );
  };

  const handleAddDraftProject = () => {
    const nextProject = createDraftProject();
    setDraftProjects((prev) => [...prev, nextProject]);
    setProjectAdvanced((prev) => ({ ...prev, [nextProject.id]: false }));
    setTaskAdvanced((prev) => {
      const next = { ...prev };
      nextProject.tasks.forEach((task) => {
        next[task.id] = false;
      });
      return next;
    });
  };

  const handleRemoveDraftProject = (projectId: string) => {
    if (draftProjects.length === 1) {
      return;
    }

    const projectToRemove = draftProjects.find((draft) => draft.id === projectId);
    setDraftProjects((prev) => prev.filter((draft) => draft.id !== projectId));
    setProjectAdvanced((prev) => {
      if (!(projectId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[projectId];
      return next;
    });

    if (projectToRemove) {
      setTaskAdvanced((prev) => {
        const next = { ...prev };
        projectToRemove.tasks.forEach((task) => {
          delete next[task.id];
        });
        return next;
      });
    }
  };

  const handleAddTaskToDraft = (projectId: string) => {
    const newTask = createDraftTask();
    setDraftProjects((prev) =>
      prev.map((draft) =>
        draft.id === projectId
          ? { ...draft, tasks: [...draft.tasks, newTask] }
          : draft
      )
    );
    setTaskAdvanced((prev) => ({ ...prev, [newTask.id]: false }));
  };

  const handleTaskChange = (
    projectId: string,
    taskId: string,
    field: keyof Omit<DraftTask, "id">,
    value: string
  ) => {
    const nextValue = field === "name" ? formatNameValue(value) : value;
    setDraftProjects((prev) =>
      prev.map((draft) =>
        draft.id === projectId
          ? {
              ...draft,
              tasks: draft.tasks.map((task) =>
                task.id === taskId ? { ...task, [field]: nextValue } : task
              ),
            }
          : draft
      )
    );
  };

  const handleDraftProjectSkillChange = (
    projectId: string,
    skillId: string | null
  ) => {
    setDraftProjects((prev) =>
      prev.map((draft) =>
        draft.id === projectId ? { ...draft, skillId } : draft
      )
    );
  };

  const handleDraftProjectDueDateChange = (
    projectId: string,
    dueDate: string
  ) => {
    setDraftProjects((prev) =>
      prev.map((draft) =>
        draft.id === projectId ? { ...draft, dueDate } : draft
      )
    );
  };

  const handleDraftTaskSkillChange = (
    projectId: string,
    taskId: string,
    skillId: string | null
  ) => {
    setDraftProjects((prev) =>
      prev.map((draft) =>
        draft.id === projectId
          ? {
              ...draft,
              tasks: draft.tasks.map((task) =>
                task.id === taskId ? { ...task, skillId } : task
              ),
            }
          : draft
      )
    );
  };

  const handleDraftTaskDueDateChange = (
    projectId: string,
    taskId: string,
    dueDate: string
  ) => {
    setDraftProjects((prev) =>
      prev.map((draft) =>
        draft.id === projectId
          ? {
              ...draft,
              tasks: draft.tasks.map((task) =>
                task.id === taskId ? { ...task, dueDate } : task
              ),
            }
          : draft
      )
    );
  };

  const handleRemoveTaskFromDraft = (projectId: string, taskId: string) => {
    setDraftProjects((prev) =>
      prev.map((draft) =>
        draft.id === projectId
          ? {
              ...draft,
              tasks: draft.tasks.filter((task) => task.id !== taskId),
            }
          : draft
      )
    );
    setTaskAdvanced((prev) => {
      if (!(taskId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const getInsertErrorMessage = (error: unknown, fallback: string) => {
    if (!error) {
      return fallback;
    }

    if (error instanceof Error) {
      return `${fallback}: ${error.message}`;
    }

    if (typeof error === "object" && error !== null && "message" in error) {
      const messageValue = (error as { message?: unknown }).message;
      if (typeof messageValue === "string" && messageValue.trim()) {
        return `${fallback}: ${messageValue}`;
      }
    }

    return fallback;
  };

  const handleStandardSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!eventType) {
      return;
    }

    if (!formData.name.trim()) {
      toast.error(
        "Name required",
        `Give your ${eventType.toLowerCase()} a descriptive name.`
      );
      return;
    }

    let duration: number | undefined;
    if (
      eventType === "PROJECT" ||
      eventType === "TASK" ||
      eventType === "HABIT"
    ) {
      duration = parseInt(formData.duration_min, 10);
      if (!duration || duration <= 0) {
        toast.error("Invalid Duration", "Duration must be greater than 0");
        return;
      }
    }

    let pendingManualPlacement: {
      startUTC: string;
      endUTC: string;
      durationMin: number;
    } | null = null;

    if (eventType === "PROJECT") {
      const manualStartValue = formData.manual_start.trim();
      const manualEndValue = formData.manual_end.trim();
      if ((manualStartValue && !manualEndValue) || (!manualStartValue && manualEndValue)) {
        toast.error(
          "Manual schedule incomplete",
          "Provide both start and end times to lock this project."
        );
        return;
      }
      if (manualStartValue && manualEndValue) {
        const startDate = new Date(manualStartValue);
        const endDate = new Date(manualEndValue);
        if (
          Number.isNaN(startDate.getTime()) ||
          Number.isNaN(endDate.getTime())
        ) {
          toast.error(
            "Manual schedule invalid",
            "Enter valid start and end times."
          );
          return;
        }
        if (endDate.getTime() <= startDate.getTime()) {
          toast.error(
            "Manual schedule invalid",
            "End time must be after the start time."
          );
          return;
        }
        pendingManualPlacement = {
          startUTC: startDate.toISOString(),
          endUTC: endDate.toISOString(),
          durationMin: Math.max(
            1,
            Math.round((endDate.getTime() - startDate.getTime()) / 60000)
          ),
        };
      }
    }

    try {
      setIsSaving(true);
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
        toast.error("Authentication Required", "Please sign in to continue.");
        return;
      }

      if (energyChoiceOptions.length === 0) {
        toast.error(
          "Loading",
          "Energy options are still loading. Please try again in a moment."
        );
        return;
      }

      if (eventType !== "HABIT" && priorityChoiceOptions.length === 0) {
        toast.error(
          "Loading",
          "Priority options are still loading. Please try again in a moment."
        );
        return;
      }

      const resolvedPriorityValue =
        eventType !== "HABIT"
          ? resolvePriorityPayloadValue(formData.priority)
          : "";
      const resolvedEnergyValue = resolveEnergyPayloadValue(formData.energy);
      const resolvedPriorityCode =
        eventType !== "HABIT"
          ? legacyPriorityCodeFromSelection(
              resolvedPriorityValue,
              priorityChoiceOptions
            )
          : DEFAULT_PRIORITY;
      const resolvedEnergyCode = legacyEnergyCodeFromSelection(
        resolvedEnergyValue,
        energyChoiceOptions
      );

      const insertData: {
        user_id: string;
        name: string;
        priority?: string | number;
        energy?: string | number;
        description?: string;
        goal_id?: string;
        project_id?: string;
        stage?: string;
        habit_type?: string;
        type?: string;
        recurrence?: string;
        recurrence_days?: number[] | null;
        duration_min?: number;
        duration_minutes?: number;
        monument_id?: string;
        skill_id?: string | null;
        routine_id?: string | null;
        location_context_id?: string | null;
        daylight_preference?: string | null;
        window_edge_preference?: string | null;
        window_id?: string | null;
        completion_target?: number | null;
      } = {
        user_id: user.id,
        name: formatNameValue(formData.name.trim()),
      };

      insertData.energy = resolvedEnergyCode;
      if (eventType !== "HABIT") {
        insertData.priority = resolvedPriorityCode;
      }

      if (
        eventType !== "PROJECT" &&
        eventType !== "TASK" &&
        formData.description.trim()
      ) {
        insertData.description = formData.description.trim();
      }

      if (eventType === "PROJECT") {
        if (!formData.goal_id) {
          toast.error(
            "Goal required",
            "Select the goal this project will support."
          );
          return;
        }
        insertData.goal_id = formData.goal_id;
        insertData.stage = formData.stage;
      } else if (eventType === "TASK") {
        if (!formData.project_id) {
          toast.error(
            "Project required",
            "Choose the project this task belongs to."
          );
          return;
        }
        if (!formData.skill_id) {
          toast.error(
            "Skill Required",
            "Choose the skill this task will advance."
          );
          return;
        }
        insertData.project_id = formData.project_id;
        insertData.stage = formData.stage;
        insertData.skill_id = formData.skill_id;
      } else if (eventType === "HABIT") {
        insertData.type = formData.type;
        insertData.habit_type = formData.type;
        const normalizedHabitType = (formData.type ?? "").toUpperCase();
        const isPracticeHabit = normalizedHabitType === "PRACTICE";
        const selectedGoalId =
          formData.goal_id && formData.goal_id.trim().length > 0
            ? formData.goal_id
            : null;

        if (normalizedHabitType === "TEMP") {
          if (!selectedGoalId) {
            toast.error(
              "Goal required",
              "Temp habits need a goal to stay aligned with your plan."
            );
            return;
          }

          const completionValue = Number(formData.completion_target);
          if (
            !Number.isFinite(completionValue) ||
            completionValue <= 0 ||
            !Number.isInteger(completionValue)
          ) {
            toast.error(
              "Completions required",
              "Use a whole number greater than zero for the completion target."
            );
            return;
          }

          insertData.goal_id = selectedGoalId;
          insertData.completion_target = completionValue;
        } else {
          insertData.goal_id = null;
          insertData.completion_target = null;
        }
        const normalizedRecurrence = formData.recurrence.toLowerCase().trim();
        const everyXDaysInterval =
          normalizedRecurrence === "every x days"
            ? resolveEveryXDaysInterval(
                formData.recurrence,
                formData.recurrence_days
              )
            : null;
        if (
          !isPracticeHabit &&
          normalizedRecurrence === "every x days" &&
          !everyXDaysInterval
        ) {
          toast.error(
            "Interval required",
            "Set how many days should pass between completions."
          );
          return;
        }

        const recurrenceDaysValue =
          !isPracticeHabit &&
          normalizedRecurrence === "every x days" &&
          everyXDaysInterval
            ? [everyXDaysInterval]
            : null;

        insertData.recurrence = isPracticeHabit
          ? "none"
          : normalizedRecurrence === "none"
            ? null
            : formData.recurrence;
        insertData.recurrence_days = isPracticeHabit ? null : recurrenceDaysValue;
        insertData.skill_id = formData.skill_id ? formData.skill_id : null;

        let resolvedLocationContextId: string | null = null;
        if (formData.location_context_id) {
          if (isValidUuid(formData.location_context_id)) {
            resolvedLocationContextId = formData.location_context_id;
          } else {
            resolvedLocationContextId = await resolveLocationContextId(
              supabase,
              user.id,
              formData.location_context_id,
            );

            if (!resolvedLocationContextId) {
              toast.error(
                "Location unavailable",
                "We couldn’t save that location right now. Please try again.",
              );
              return;
            }
          }
        }

        insertData.location_context_id = resolvedLocationContextId;
        insertData.daylight_preference =
          formData.daylight_preference &&
          formData.daylight_preference !== "ALL_DAY"
            ? formData.daylight_preference
            : null;
        insertData.window_edge_preference =
          (formData.window_edge_preference || "FRONT").toUpperCase();
        insertData.window_id =
          formData.window_id && formData.window_id.length > 0
            ? formData.window_id
            : null;

        if (formData.type?.toUpperCase() === "MEMO" && !insertData.skill_id) {
          toast.error(
            "Skill required",
            "Memo habits need a skill so their notes have somewhere to land."
          );
          return;
        }

        let routineIdToUse: string | null = null;
        if (routineId === "__create__") {
          const routineName = newRoutineName.trim();
          if (!routineName) {
            toast.error(
              "Routine name required",
              "Please give your new routine a name."
            );
            return;
          }

          const routineDescription = newRoutineDescription.trim();
          const { data: routineData, error: routineInsertError } = await supabase
            .from("habit_routines")
            .insert({
              user_id: user.id,
              name: routineName,
              description: routineDescription ? routineDescription : null,
            })
            .select("id")
            .single();

          if (routineInsertError) {
            throw routineInsertError;
          }

          if (!routineData?.id) {
            throw new Error("Routine creation did not return an id.");
          }

          routineIdToUse = routineData.id;
        } else if (routineId !== "none") {
          routineIdToUse = routineId;
        }

        insertData.routine_id = routineIdToUse;
        insertData.energy = isPracticeHabit
          ? MAX_PRACTICE_ENERGY_CODE
          : resolvedEnergyCode;
      }

      if (duration !== undefined) {
        if (eventType === "HABIT") {
          insertData.duration_minutes = duration;
        } else {
          insertData.duration_min = duration;
        }
      }

      const { data, error } = await supabase
        .from(eventType.toLowerCase() + "s")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        const fallbackMessage = "Failed to create " + eventType.toLowerCase();
        console.error("Error creating " + eventType.toLowerCase() + ":", error);
        toast.error("Error", getInsertErrorMessage(error, fallbackMessage));
        return;
      }

      if (eventType === "PROJECT" && formData.skill_ids.length > 0) {
        const projectId = data?.id;
        if (projectId) {
          const inserts = formData.skill_ids.map((skillId) => ({
            project_id: projectId,
            skill_id: skillId,
          }));
          const { error: psError } = await supabase
            .from("project_skills")
            .insert(inserts);
          if (psError) {
            console.error("Error linking skills to project:", psError);
          }
        }
      }

      if (
        eventType === "PROJECT" &&
        pendingManualPlacement &&
        data?.id
      ) {
        try {
          await persistLockedProjectPlacements({
            supabase,
            userId: user.id,
            placements: [
              {
                projectId: data.id,
                startUTC: pendingManualPlacement.startUTC,
                endUTC: pendingManualPlacement.endUTC,
                durationMin: pendingManualPlacement.durationMin,
                priority: resolvedPriorityCode,
                stage: insertData.stage ?? PROJECT_STAGE_OPTIONS[0].value,
                energy: resolvedEnergyCode,
              },
            ],
          });
        } catch (lockError) {
          console.error("Failed to persist locked project schedule:", lockError);
          toast.error(
            "Manual lock failed",
            "Project saved, but its manual schedule could not be applied."
          );
        }
      }

      toast.success("Saved", eventType + " created successfully");
      router.refresh();
      onClose();
    } catch (error) {
      const fallbackMessage = "Failed to create " + (eventType?.toLowerCase() ?? "event");
      console.error(
        "Error creating " + (eventType?.toLowerCase() ?? "event") + ":",
        error
      );
      toast.error("Error", getInsertErrorMessage(error, fallbackMessage));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteGoalWizard = useCallback(
    async (options: { redirectToPlan?: boolean } | undefined) => {
      const redirectToPlan = options?.redirectToPlan ?? false;
      if (!goalForm.name.trim()) {
        toast.error("Name required", "Give your goal a descriptive name.");
        return;
      }

      if (!goalForm.monument_id.trim()) {
        toast.error(
          "Monument required",
          "Select a monument to ground this goal."
        );
        return;
      }

      try {
        setIsSaving(true);
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
          toast.error(
            "Authentication Required",
            "Please sign in to continue."
          );
          return;
        }

        if (priorityChoiceOptions.length === 0 || energyChoiceOptions.length === 0) {
          toast.error(
            "Loading",
            "Priority and energy options are still loading. Please try again in a moment."
          );
          return;
        }

        for (const draft of draftProjects) {
          const hasStart = draft.manualStart.trim().length > 0;
          const hasEnd = draft.manualEnd.trim().length > 0;
          if (hasStart !== hasEnd) {
            toast.error(
              "Manual schedule incomplete",
              "Provide both start and end times to lock a project."
            );
            setIsSaving(false);
            return;
          }
          if (hasStart && hasEnd) {
            const start = new Date(draft.manualStart);
            const end = new Date(draft.manualEnd);
            if (
              Number.isNaN(start.getTime()) ||
              Number.isNaN(end.getTime())
            ) {
              toast.error(
                "Manual schedule invalid",
                "Enter valid start and end times."
              );
              setIsSaving(false);
              return;
            }
            if (end.getTime() <= start.getTime()) {
              toast.error(
                "Manual schedule invalid",
                "End time must be after the start time."
              );
              setIsSaving(false);
              return;
            }
          }
        }

        const sanitizedProjectTuples = draftProjects
          .map<
            | {
                draftId: string;
                payload: NormalizedProjectPayload;
                priorityCode: string;
                energyCode: string;
                manualSchedule?:
                  | {
                      startUTC: string;
                      endUTC: string;
                      durationMin: number;
                    }
                  | undefined;
              }
            | null
          >((draft) => {
            const rawName = draft.name.trim();
            const formattedName = formatNameValue(rawName);
            if (!formattedName) {
              return null;
            }

            const trimmedWhy = draft.why.trim();
            const parsedDuration = Number.parseFloat(draft.duration.trim());
            const trimmedProjectDueDate = draft.dueDate.trim();
            const projectSkillId = draft.skillId ? draft.skillId : null;

            const tasks = draft.tasks
              .map<NormalizedTaskPayload | null>((task) => {
                const rawTaskName = task.name.trim();
                const formattedTaskName = formatNameValue(rawTaskName);
                if (!formattedTaskName) {
                  return null;
                }

                const trimmedNotes = task.notes.trim();
                const trimmedTaskDueDate = task.dueDate.trim();
                const taskSkillId = task.skillId ? task.skillId : null;
                const taskPriorityValue = resolvePriorityPayloadValue(task.priority);
                const taskEnergyValue = resolveEnergyPayloadValue(task.energy);

                return {
                  name: formattedTaskName,
                  stage: task.stage || DEFAULT_TASK_STAGE,
                  priority: taskPriorityValue,
                  energy: taskEnergyValue,
                  notes: trimmedNotes.length > 0 ? trimmedNotes : null,
                  skill_id: taskSkillId,
                  due_date:
                    trimmedTaskDueDate.length > 0 ? trimmedTaskDueDate : null,
                } satisfies NormalizedTaskPayload;
              })
              .filter((task): task is NormalizedTaskPayload => task !== null);

            let manualSchedule:
              | {
                  startUTC: string;
                  endUTC: string;
                  durationMin: number;
                }
              | undefined;
            if (draft.manualStart && draft.manualEnd) {
              const startDate = new Date(draft.manualStart);
              const endDate = new Date(draft.manualEnd);
              if (
                Number.isFinite(startDate.getTime()) &&
                Number.isFinite(endDate.getTime()) &&
                endDate.getTime() > startDate.getTime()
              ) {
                manualSchedule = {
                  startUTC: startDate.toISOString(),
                  endUTC: endDate.toISOString(),
                  durationMin: Math.max(
                    1,
                    Math.round(
                      (endDate.getTime() - startDate.getTime()) / 60000
                    )
                  ),
                };
              }
            }

            const projectPriorityValue = resolvePriorityPayloadValue(draft.priority);
            const projectEnergyValue = resolveEnergyPayloadValue(draft.energy);
            const projectPriorityCode = legacyPriorityCodeFromSelection(
              projectPriorityValue,
              priorityChoiceOptions
            );
            const projectEnergyCode = legacyEnergyCodeFromSelection(
              projectEnergyValue,
              energyChoiceOptions
            );

            return {
              draftId: draft.id,
              payload: {
                name: formattedName,
                stage: draft.stage || PROJECT_STAGE_OPTIONS[0].value,
                priority: projectPriorityValue,
                energy: projectEnergyValue,
                why: trimmedWhy.length > 0 ? trimmedWhy : null,
                duration_min:
                  Number.isFinite(parsedDuration) && parsedDuration > 0
                    ? Math.max(1, Math.round(parsedDuration))
                    : null,
                skill_id: projectSkillId,
                due_date:
                  trimmedProjectDueDate.length > 0 ? trimmedProjectDueDate : null,
                tasks,
              } satisfies NormalizedProjectPayload,
              priorityCode: projectPriorityCode,
              energyCode: projectEnergyCode,
              manualSchedule,
            };
          })
          .filter(
            (
              project
            ): project is {
              draftId: string;
              payload: NormalizedProjectPayload;
              priorityCode: string;
              energyCode: string;
              manualSchedule?:
                | {
                    startUTC: string;
                    endUTC: string;
                    durationMin: number;
                  }
                | undefined;
            } => project !== null
          );

        const sanitizedProjects = sanitizedProjectTuples.map(
          (tuple) => tuple.payload
        );

        const hasProjects = sanitizedProjects.length > 0;
        const goalWhy = goalForm.why.trim();
        const trimmedGoalName = goalForm.name.trim();
        const selectedMonumentId = goalForm.monument_id.trim();
        const goalDueDate = goalForm.dueDate.trim();

        const goalPriorityValue = resolvePriorityPayloadValue(goalForm.priority);
        const goalEnergyValue = resolveEnergyPayloadValue(goalForm.energy);
        const goalPriorityCode = legacyPriorityCodeFromSelection(
          goalPriorityValue,
          priorityChoiceOptions
        );
        const goalEnergyCode = legacyEnergyCodeFromSelection(
          goalEnergyValue,
          energyChoiceOptions
        );

        const goalInput: GoalWizardRpcInput = {
          user_id: user.id,
          name: formatNameValue(trimmedGoalName),
          priority: goalPriorityValue,
          energy: goalEnergyValue,
          monument_id: selectedMonumentId,
          why: goalWhy ? goalWhy : null,
          due_date: goalDueDate ? goalDueDate : null,
        };

        const { data, error: rpcError } = await supabase.rpc(
          "create_goal_with_projects_and_tasks",
          {
            goal_input: goalInput as unknown as Json,
            project_inputs: hasProjects
              ? (sanitizedProjects as unknown as Json)
              : ([] as unknown as Json),
          }
        );

        let createdGoalId: string | undefined;
        let createdProjectIds: string[] = [];

        if (rpcError || !data) {
          // Log everything we know to help diagnose local dev issues
          console.error("Error creating goal with projects via RPC:", {
            rpcError,
            data,
            goalInput,
            hasProjects,
            projectCount: sanitizedProjects.length,
          });
          const missingFn =
            (rpcError?.code === "42883") ||
            /create_goal_with_projects_and_tasks/.test(rpcError?.message || "");
          if (missingFn) {
            toast.error("Database not ready", "Please run migrations so the goal wizard function exists.");
          } else if (rpcError) {
            const label = rpcError.code ? `Error ${rpcError.code}` : "Error";
            const details = rpcError.message || rpcError.details || "We couldn't save that goal just yet.";
            toast.error(label, details);
          } else {
            toast.error("Error", "RPC returned no data. Ensure the function returns JSON and migrations are applied.");
          }
          return;
        } else {
          const rpcPayload =
            (data as { goal?: { id?: string }; projects?: unknown } | null) ?? null;
          createdGoalId = rpcPayload?.goal?.id;
          if (Array.isArray(rpcPayload?.projects)) {
            createdProjectIds = (rpcPayload?.projects as Array<{ id?: string }>).map(
              (project) => (typeof project?.id === "string" ? project.id : null)
            ).filter((id): id is string => Boolean(id));
          } else {
            createdProjectIds = [];
          }
        }

        const lockedPlacements = sanitizedProjectTuples
          .map<LockedPlacementInput | null>((tuple, index) => {
            if (!tuple.manualSchedule) return null;
            const projectId = createdProjectIds[index];
            if (!projectId) return null;
            return {
              projectId,
              startUTC: tuple.manualSchedule.startUTC,
              endUTC: tuple.manualSchedule.endUTC,
              durationMin: tuple.manualSchedule.durationMin,
              priority: tuple.priorityCode || DEFAULT_PRIORITY,
              stage: tuple.payload.stage || PROJECT_STAGE_OPTIONS[0].value,
              energy: tuple.energyCode || DEFAULT_ENERGY,
              dueDate: tuple.payload.due_date ?? null,
            };
          })
          .filter((entry): entry is LockedPlacementInput => entry !== null);

        if (lockedPlacements.length > 0) {
          try {
            await persistLockedProjectPlacements({
              supabase,
              userId: user.id,
              placements: lockedPlacements,
            });
          } catch (error) {
            console.error("Failed to lock manual project schedules:", error);
            toast.error(
              "Manual lock failed",
              "Projects were saved, but their manual times could not be applied."
            );
          }
        }

        toast.success(
          "Saved",
          hasProjects
            ? "Goal, projects, and tasks created successfully"
            : "Goal created successfully"
        );

        resetGoalWizard();
        onClose();

        if (redirectToPlan && createdGoalId) {
          router.push(`/goals/${createdGoalId}/plan`);
          return;
        }

        router.refresh();
      } catch (error) {
        console.error("Error creating goal with projects:", error);
        toast.error("Error", "We couldn't save that goal just yet.");
      } finally {
        setIsSaving(false);
      }
    },
    [draftProjects, goalForm, onClose, resetGoalWizard, router, toast]
  );

  const handleGoalFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    if (goalWizardStep === "GOAL") {
      if (!goalForm.name.trim()) {
        toast.error("Name required", "Give your goal a descriptive name.");
        return;
      }

      if (!goalForm.monument_id.trim()) {
        toast.error(
          "Monument required",
          "Select a monument to ground this goal."
        );
        return;
      }

      setGoalWizardStep("PROJECTS");
      return;
    }

    if (goalWizardStep === "PROJECTS") {
      setGoalWizardStep("TASKS");
      return;
    }

    await handleCompleteGoalWizard();
  };

  const handleSaveGoalWizard = useCallback(async () => {
    if (isSaving) {
      return;
    }
    await handleCompleteGoalWizard();
  }, [handleCompleteGoalWizard, isSaving]);

  const handlePlanGoal = async () => {
    if (isSaving) {
      return;
    }
    await handleCompleteGoalWizard({ redirectToPlan: true });
  };

  const handleWizardBack = () => {
    setGoalWizardStep((prev) => {
      if (prev === "TASKS") {
        return "PROJECTS";
      }
      if (prev === "PROJECTS") {
        return "GOAL";
      }
      return prev;
    });
  };

  const handleModalClose = () => {
    if (isSaving) {
      return;
    }
    resetGoalWizard();
    onClose();
  };

  const eventMeta: EventMeta = useMemo(() => {
    const base: Record<NonNullable<EventModalProps["eventType"]>, EventMeta> = {
      GOAL: {
        title: "Create New Goal",
        badge: "Goal",
        eyebrow: "North Star",
        accent: "from-sky-500/25 via-sky-500/10 to-transparent",
        iconBg: "border-sky-500/40 bg-sky-500/10 text-sky-100",
        icon: Target,
      },
      PROJECT: {
        title: "Create New Project",
        badge: "Project",
        eyebrow: "Initiative",
        accent: "from-purple-500/30 via-purple-500/10 to-transparent",
        iconBg: "border-purple-500/40 bg-purple-500/10 text-purple-100",
        icon: FolderKanban,
      },
      TASK: {
        title: "Create New Task",
        badge: "Task",
        eyebrow: "Next Action",
        accent: "from-emerald-500/25 via-emerald-500/10 to-transparent",
        iconBg: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
        icon: CheckSquare,
      },
      HABIT: {
        title: "Create New Habit",
        badge: "Habit",
        eyebrow: "Rhythm",
        accent: "from-blue-500/25 via-blue-500/10 to-transparent",
        iconBg: "border-blue-500/40 bg-blue-500/10 text-blue-100",
        icon: Repeat,
      },
    };

    if (!eventType) {
      return base.GOAL;
    }

    if (eventType === "HABIT") {
      if (formData.type === "CHORE") {
        return {
          title: "Create New Chore",
          badge: "Chore",
          eyebrow: "Upkeep",
          accent: "from-amber-500/30 via-amber-500/10 to-transparent",
          iconBg: "border-amber-500/40 bg-amber-500/10 text-amber-100",
          icon: Sparkles,
        };
      }

      if (formData.type === "ASYNC") {
        return {
          title: "Create New Sync Habit",
          badge: "Sync Habit",
          eyebrow: "On Your Time",
          accent: "from-cyan-500/25 via-cyan-500/10 to-transparent",
          iconBg: "border-cyan-500/40 bg-cyan-500/10 text-cyan-100",
          icon: Clock,
        };
      }

      if (formData.type === "RELAXER") {
        return {
          title: "Create New Relaxer",
          badge: "Relaxer",
          eyebrow: "Reset",
          accent: "from-emerald-500/30 via-emerald-500/10 to-transparent",
          iconBg: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
          icon: Leaf,
        };
      }

      if (formData.type === "PRACTICE") {
        return {
          title: "Create New Practice",
          badge: "Practice",
          eyebrow: "Reps",
          accent: "from-pink-500/30 via-pink-500/10 to-transparent",
          iconBg: "border-pink-500/40 bg-pink-500/10 text-pink-100",
          icon: PenSquare,
        };
      }
    }

    return base[eventType];
  }, [eventType, formData.type]);

  const submitLabel = loading || isSaving
    ? "Creating..."
    : `Create ${eventMeta.badge}`;

  const isGoalWizard = resolvedType === "GOAL";
  const EventIcon = eventMeta.icon;
  const activeWizardIndex = Math.max(
    0,
    GOAL_WIZARD_STEPS.findIndex((step) => step.key === goalWizardStep)
  );
  const wizardPrimaryDisabled =
    isSaving ||
    (goalWizardStep === "GOAL" &&
      (loading ||
        !goalForm.name.trim() ||
        !goalForm.monument_id.trim()));
  const canSaveGoalWizard =
    !loading &&
    !isSaving &&
    goalForm.name.trim().length > 0 &&
    goalForm.monument_id.trim().length > 0;
  const saveButtonLabel = isSaving ? "Saving..." : "Save goal";

  if (!isOpen || !mounted || !eventType) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-6 backdrop-blur-sm sm:py-10">
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0B1016]/95 shadow-[0_45px_90px_-40px_rgba(15,23,42,0.8)] max-h-[calc(100dvh-2rem)] sm:max-h-[85vh]">
          <div className="relative flex-none overflow-hidden">
            <div
              className={cn(
                "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90",
                eventMeta.accent
              )}
            />
            <div className="relative flex flex-col gap-2.5 px-4 pb-3 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-4 sm:pt-3.5">
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-2xl border text-white shadow-inner",
                        eventMeta.iconBg
                      )}
                    >
                      <EventIcon className="h-5 w-5" />
                    </span>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge
                        variant="outline"
                        className="border-white/20 bg-white/10 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-200"
                      >
                        {eventMeta.eyebrow}
                      </Badge>
                      <Badge className="bg-white/15 text-[11px] font-semibold text-white">
                        {eventMeta.badge}
                      </Badge>
                    </div>
                    <h2 className="text-lg font-semibold leading-snug text-white sm:text-xl">
                      {eventMeta.title}
                    </h2>
                  </div>
                </div>
              </div>
              <button
                onClick={handleModalClose}
                className="self-start rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

        <form
          onSubmit={isGoalWizard ? handleGoalFormSubmit : handleStandardSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden touch-pan-y overscroll-x-none px-4 pb-5 pt-5 sm:gap-6 sm:px-8 sm:pb-8 sm:pt-6"
        >
          {isGoalWizard ? (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 sm:px-5">
                {GOAL_WIZARD_STEPS.map((step, index) => {
                  const isActive = step.key === goalWizardStep;
                  const isComplete = index < activeWizardIndex;
                  const isLast = index === GOAL_WIZARD_STEPS.length - 1;
                  return (
                    <div
                      key={step.key}
                      className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500"
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition",
                          isActive
                            ? "border-blue-500/70 bg-blue-500/20 text-white"
                            : isComplete
                            ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-200"
                            : "border-white/10 bg-white/[0.04] text-zinc-400"
                        )}
                      >
                        {index + 1}
                      </span>
                      <span
                        className={cn(
                          "tracking-[0.2em]",
                          isActive ? "text-white" : "text-zinc-500"
                        )}
                      >
                        {step.label}
                      </span>
                      {!isLast ? (
                        <span className="hidden h-px w-8 bg-white/10 sm:block" />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {goalWizardStep === "GOAL" ? (
                <FormSection title="Goal details">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        Name
                      </Label>
                      <Input
                        value={goalForm.name}
                        onChange={(event) =>
                          handleGoalFormChange("name", event.target.value)
                        }
                        placeholder="Name this goal"
                        className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                          Monument
                        </Label>
                        <Select
                          value={goalForm.monument_id}
                          onValueChange={(value) =>
                            handleGoalFormChange("monument_id", value)
                          }
                          placeholder={
                            loading ? "Loading monuments..." : "Select monument..."
                          }
                          triggerClassName="h-12"
                        >
                          <SelectContent>
                            {monuments.length === 0 ? (
                              <SelectItem value="" disabled>
                                {loading ? "Loading monuments..." : "No monuments found"}
                              </SelectItem>
                            ) : (
                              monuments.map((monument) => (
                                <SelectItem key={monument.id} value={monument.id}>
                                  {monument.title}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            Priority
                          </Label>
                    <OptionDropdown
                      value={goalForm.priority}
                      options={priorityDropdownOptions}
                      onChange={(value) =>
                        handleGoalFormChange("priority", value)
                      }
                      placeholder="Select priority..."
                      itemSize="compact"
                    />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            Energy
                          </Label>
                    <OptionDropdown
                      value={goalForm.energy}
                      options={energyDropdownOptions}
                      onChange={(value) =>
                        handleGoalFormChange("energy", value)
                      }
                      placeholder="Select energy..."
                      itemSize="compact"
                    />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            Advanced options
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setShowGoalAdvanced((prev) => !prev)
                            }
                            className="h-8 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400 hover:border-white/30 hover:text-white"
                          >
                            {showGoalAdvanced ? "Hide" : "Show"}
                          </Button>
                        </div>
                        {showGoalAdvanced ? (
                          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                            <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                              Due date
                            </Label>
                            <Input
                              type="date"
                              value={goalForm.dueDate}
                              onChange={(event) =>
                                handleGoalFormChange(
                                  "dueDate",
                                  event.target.value
                                )
                              }
                              className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white focus:border-blue-400/60 focus-visible:ring-0"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        Why?
                      </Label>
                      <Textarea
                        value={goalForm.why}
                        onChange={(event) =>
                          handleGoalFormChange("why", event.target.value)
                        }
                        placeholder="Capture the motivation or vision for this goal"
                        className="min-h-[110px] rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                  </div>
                </FormSection>
              ) : null}

              {goalWizardStep === "PROJECTS" ? (
                <FormSection title="Projects">
                  <div className="space-y-4">
                    {draftProjects.map((draft, index) => (
                      <div
                        key={draft.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1 space-y-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                Project {index + 1}
                              </Label>
                              <Input
                                value={draft.name}
                                onChange={(event) =>
                                  handleDraftProjectChange(
                                    draft.id,
                                    "name",
                                    event.target.value
                                  )
                                }
                                placeholder="Name this project"
                                className="h-11 rounded-xl border border-white/10 bg-black/70 text-sm text-white placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                  Stage
                                </Label>
                                <OptionDropdown
                                  variant="black"
                                  value={draft.stage}
                                  options={PROJECT_STAGE_OPTIONS}
                                  onChange={(value) =>
                                    handleDraftProjectChange(
                                      draft.id,
                                      "stage",
                                      value
                                    )
                                  }
                                  placeholder="Select stage..."
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                  Duration
                                </Label>
                                <Input
                                  value={draft.duration}
                                  onChange={(event) =>
                                    handleDraftProjectChange(
                                      draft.id,
                                      "duration",
                                      event.target.value
                                    )
                                  }
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  placeholder="x minutes"
                                  className="h-11 rounded-xl border border-white/10 bg-black/70 text-sm text-white placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                  Priority
                                </Label>
                                  <OptionDropdown
                                    variant="black"
                                    value={draft.priority}
                                    options={priorityDropdownOptions}
                                    onChange={(value) =>
                                      handleDraftProjectChange(
                                        draft.id,
                                        "priority",
                                        value
                                      )
                                    }
                                    placeholder="Select priority..."
                                    itemSize="compact"
                                  />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                  Energy
                                </Label>
                                  <OptionDropdown
                                    variant="black"
                                    value={draft.energy}
                                    options={energyDropdownOptions}
                                    onChange={(value) =>
                                      handleDraftProjectChange(
                                        draft.id,
                                        "energy",
                                        value
                                      )
                                    }
                                    placeholder="Select energy..."
                                    itemSize="compact"
                                  />
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                    Skill
                                  </Label>
                                  {draft.skillId ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDraftProjectSkillChange(
                                          draft.id,
                                          null
                                        )
                                      }
                                      className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50 transition hover:text-white"
                                    >
                                      Clear
                                    </button>
                                  ) : null}
                                </div>
                                <SkillMultiSelect
                                  skills={sortedSkills}
                                  selectedIds={draft.skillId ? [draft.skillId] : []}
                                  onToggle={(skillId) =>
                                    handleDraftProjectSkillChange(
                                      draft.id,
                                      skillId === draft.skillId ? null : skillId
                                    )
                                  }
                                  placeholder="Assign a skill"
                                  buttonClassName="rounded-full border border-white/10 bg-black/70 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 hover:border-white/40"
                                  categories={skillCategories}
                                />
                                </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                  Why?
                                </Label>
                                <Textarea
                                  value={draft.why}
                                  onChange={(event) =>
                                    handleDraftProjectChange(
                                      draft.id,
                                      "why",
                                      event.target.value
                                    )
                                  }
                                  placeholder="Outline the intent or outcome for this project"
                                  className="min-h-[88px] rounded-xl border border-white/10 bg-black/70 text-sm text-white placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                  Advanced options
                                </Label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setProjectAdvanced((prev) => ({
                                      ...prev,
                                      [draft.id]: !prev[draft.id],
                                    }))
                                  }
                                  className="h-7 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400 hover:border-white/30 hover:text-white"
                                >
                                  {projectAdvanced[draft.id] ? "Hide" : "Show"}
                                </Button>
                              </div>
                              {projectAdvanced[draft.id] ? (
                                <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                      Due date
                                    </Label>
                                    <Input
                                      type="date"
                                      value={draft.dueDate}
                                      onChange={(event) =>
                                        handleDraftProjectDueDateChange(
                                          draft.id,
                                          event.target.value
                                        )
                                      }
                                      className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white focus:border-blue-400/60 focus-visible:ring-0"
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                        Manual start time
                                      </Label>
                                      <Input
                                        type="datetime-local"
                                        value={draft.manualStart}
                                        onChange={(event) =>
                                          handleDraftProjectChange(
                                            draft.id,
                                            "manualStart",
                                            event.target.value
                                          )
                                        }
                                        className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white focus:border-blue-400/60 focus-visible:ring-0"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                        Manual end time
                                      </Label>
                                      <Input
                                        type="datetime-local"
                                        value={draft.manualEnd}
                                        onChange={(event) =>
                                          handleDraftProjectChange(
                                            draft.id,
                                            "manualEnd",
                                            event.target.value
                                          )
                                        }
                                        className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white focus:border-blue-400/60 focus-visible:ring-0"
                                      />
                                    </div>
                                  </div>
                                  <p className="text-[11px] text-zinc-500">
                                    Provide both a start and end time to lock this project at an exact slot.
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          {draftProjects.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => handleRemoveDraftProject(draft.id)}
                              className="h-10 w-10 shrink-0 rounded-full text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      onClick={handleAddDraftProject}
                      variant="outline"
                      disabled={isSaving}
                      className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.02] text-sm text-white hover:border-white/20 hover:bg-white/10"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add another project
                    </Button>
                  </div>
                </FormSection>
              ) : null}

              {goalWizardStep === "TASKS" ? (
                <FormSection title="Tasks">
                  <div className="space-y-4">
                    {draftProjects.map((draft) => (
                      <div
                        key={draft.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {draft.name ? draft.name : "Untitled project"}
                            </p>
                            <p className="text-xs text-zinc-400">
                              Outline the actions that will move this forward.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleAddTaskToDraft(draft.id)}
                            className="h-9 rounded-lg border border-white/10 bg-white/[0.03] text-xs font-medium text-white hover:border-white/20 hover:bg-white/10"
                          >
                            <Plus className="mr-2 h-4 w-4" /> Add task
                          </Button>
                        </div>
                        {draft.tasks.length > 0 ? (
                          <div className="mt-4 space-y-3">
                            {draft.tasks.map((task, index) => (
                              <div
                                key={task.id}
                                className="rounded-xl border border-white/10 bg-white/[0.04] p-3 sm:p-4"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="flex-1 space-y-3">
                                    <div className="space-y-2">
                                      <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                        Task {index + 1}
                                      </Label>
                                      <Input
                                        value={task.name}
                                        onChange={(event) =>
                                          handleTaskChange(
                                            draft.id,
                                            task.id,
                                            "name",
                                            event.target.value
                                          )
                                        }
                                        placeholder="Name this task"
                                        className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                                      />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                      <OptionDropdown
                                        value={task.stage}
                                        options={PROJECT_STAGE_OPTIONS}
                                        onChange={(value) =>
                                          handleTaskChange(
                                            draft.id,
                                            task.id,
                                            "stage",
                                            value
                                          )
                                        }
                                        placeholder="Stage"
                                      />
                                      <OptionDropdown
                                        value={task.priority}
                                        options={priorityDropdownOptions}
                                        onChange={(value) =>
                                          handleTaskChange(
                                            draft.id,
                                            task.id,
                                            "priority",
                                            value
                                          )
                                        }
                                        placeholder="Priority"
                                        itemSize="compact"
                                      />
                                      <OptionDropdown
                                        value={task.energy}
                                        options={energyDropdownOptions}
                                        onChange={(value) =>
                                          handleTaskChange(
                                            draft.id,
                                            task.id,
                                            "energy",
                                            value
                                          )
                                        }
                                        placeholder="Energy"
                                        itemSize="compact"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                        Notes (optional)
                                      </Label>
                                      <Textarea
                                        value={task.notes}
                                        onChange={(event) =>
                                          handleTaskChange(
                                            draft.id,
                                            task.id,
                                            "notes",
                                            event.target.value
                                          )
                                        }
                                        placeholder="Add context, links, or success criteria"
                                        className="min-h-[72px] rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                          Advanced options
                                        </Label>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            setTaskAdvanced((prev) => ({
                                              ...prev,
                                              [task.id]: !prev[task.id],
                                            }))
                                          }
                                          className="h-7 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400 hover:border-white/30 hover:text-white"
                                        >
                                          {taskAdvanced[task.id] ? "Hide" : "Show"}
                                        </Button>
                                      </div>
                                      {taskAdvanced[task.id] ? (
                                        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                          <div className="space-y-1">
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                              Skill link
                                            </Label>
                                            <Select
                                              value={task.skillId ?? ""}
                                              onValueChange={(value) =>
                                                handleDraftTaskSkillChange(
                                                  draft.id,
                                                  task.id,
                                                  value ? value : null
                                                )
                                              }
                                            >
                                              <SelectTrigger className="h-9 rounded-lg border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                                                <SelectValue placeholder="Not linked" />
                                              </SelectTrigger>
                                              <SelectContent className="bg-[#0b101b] text-sm text-white">
                                                <SelectItem value="">
                                                  <span className="text-zinc-400">Not linked</span>
                                                </SelectItem>
                                                {sortedSkills.map((skill) => (
                                                  <SelectItem key={skill.id} value={skill.id}>
                                                    {skill.name}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          <div className="space-y-1">
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                              Due date
                                            </Label>
                                            <Input
                                              type="date"
                                              value={task.dueDate}
                                              onChange={(event) =>
                                                handleDraftTaskDueDateChange(
                                                  draft.id,
                                                  task.id,
                                                  event.target.value
                                                )
                                              }
                                              className="h-9 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white focus:border-blue-400/60 focus-visible:ring-0"
                                            />
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                      handleRemoveTaskFromDraft(draft.id, task.id)
                                    }
                                    disabled={draft.tasks.length === 1}
                                    className="h-9 w-9 shrink-0 rounded-full text-zinc-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-4 text-xs text-zinc-500">
                            No tasks yet. Add at least one to outline the next moves.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </FormSection>
              ) : null}
            </>
        ) : eventType === "HABIT" ? (
          <FormSection>
            <HabitFormFields
              name={formData.name}
              description={formData.description}
              habitType={formData.type}
              recurrence={formData.recurrence}
              recurrenceDays={formData.recurrence_days}
              duration={formData.duration_min}
              energy={formData.energy}
              skillId={formData.skill_id || "none"}
              locationContextId={
                formData.location_context_id
                  ? formData.location_context_id
                  : null
              }
              daylightPreference={
                formData.daylight_preference || "ALL_DAY"
              }
              windowEdgePreference={
                formData.window_edge_preference || "FRONT"
              }
              windowId={formData.window_id && formData.window_id.length > 0 ? formData.window_id : "none"}
              windowOptions={habitWindowOptions}
              windowsLoading={habitWindowsLoading}
              windowError={habitWindowError}
              energyOptions={habitEnergyOptions}
              skillsLoading={skillsLoading}
              skillOptions={habitSkillSelectOptions}
              skillCategories={skillCategories}
              skillError={skillError}
              goalId={formData.goal_id || "none"}
              goalOptions={habitGoalSelectOptions}
              onGoalChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  goal_id: value === "none" ? "" : value,
                }))
              }
              completionTarget={formData.completion_target}
              onCompletionTargetChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  completion_target: value,
                }))
              }
              showDescriptionField={false}
              onNameChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  name: formatNameValue(value),
                }))
                }
                onDescriptionChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: value,
                  }))
                }
              onHabitTypeChange={(value) =>
                setFormData((prev) => ({ ...prev, type: value }))
              }
              onRecurrenceChange={(value) =>
                setFormData((prev) => ({ ...prev, recurrence: value }))
              }
              onRecurrenceDaysChange={(days) =>
                setFormData((prev) => ({ ...prev, recurrence_days: days }))
              }
              onEnergyChange={(value) =>
                setFormData((prev) => ({ ...prev, energy: value }))
              }
              onDurationChange={(value) =>
                setFormData((prev) => ({ ...prev, duration_min: value }))
              }
              onSkillChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  skill_id: value === "none" ? "" : value,
                }))
              }
              onLocationContextIdChange={(id) =>
                setFormData((prev) => ({
                  ...prev,
                  location_context_id: id ?? "",
                }))
              }
              onDaylightPreferenceChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  daylight_preference: value.toUpperCase(),
                }))
              }
              onWindowEdgePreferenceChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  window_edge_preference: value.toUpperCase(),
                }))
              }
              onWindowChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  window_id: value === "none" ? "" : value,
                }))
              }
              footerSlot={
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                      Routine
                    </Label>
                    <Select
                      value={routineId}
                      onValueChange={(value) => {
                        setRoutineId(value);
                        if (value !== "__create__") {
                          setNewRoutineName("");
                          setNewRoutineDescription("");
                        }
                      }}
                      disabled={routinesLoading}
                    >
                      <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                        <SelectValue placeholder="Choose a routine" />
                      </SelectTrigger>
                    <SelectContent className="bg-[#0b101b] text-sm text-white">
                      {routineSelectOptions.map((option) => (
                        <SelectItem
                          key={`${option.value}-${option.label}`}
                          value={option.value}
                            disabled={option.disabled}
                          >
                            <div className="flex flex-col">
                              <span>{option.label}</span>
                              {option.description ? (
                                <span className="text-xs text-white/60">
                                  {option.description}
                                </span>
                              ) : null}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {routineLoadError ? (
                    <p className="text-xs text-red-300">{routineLoadError}</p>
                  ) : null}
                </div>

                  {routineId === "__create__" ? (
                    <div className="space-y-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
                      <div className="space-y-3">
                        <Label
                          htmlFor="new-routine-name"
                          className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
                        >
                          Routine name
                        </Label>
                        <Input
                          id="new-routine-name"
                          value={newRoutineName}
                          onChange={(event) => setNewRoutineName(event.target.value)}
                          placeholder="e.g. Morning kickoff"
                          className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
                        />
                      </div>

                      <div className="space-y-3">
                        <Label
                          htmlFor="new-routine-description"
                          className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
                        >
                          Description (optional)
                        </Label>
                        <Textarea
                          id="new-routine-description"
                          value={newRoutineDescription}
                          onChange={(event) =>
                            setNewRoutineDescription(event.target.value)
                          }
                          placeholder="Give your routine a purpose so future habits stay aligned."
                          className="min-h-[120px] rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              }
            />
          </FormSection>
        ) : eventType === "PROJECT" ? (
        <FormSection title="Project details">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Name
              </Label>
              <Input
                value={formData.name}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    name: formatNameValue(event.target.value),
                  }))
                }
                placeholder={`Enter ${eventMeta.badge.toLowerCase()} name`}
                className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Priority
                </Label>
                  <OptionDropdown
                    value={formData.priority}
                    options={priorityDropdownOptions}
                    onChange={(value) =>
                      setFormData({ ...formData, priority: value })
                    }
                    placeholder="Select priority..."
                    itemSize="compact"
                  />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Energy
                </Label>
                  <OptionDropdown
                    value={formData.energy}
                    options={energyDropdownOptions}
                    onChange={(value) =>
                      setFormData({ ...formData, energy: value })
                    }
                    placeholder="Select energy..."
                    itemSize="compact"
                  />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                Stage
              </p>
              <Select
                value={formData.stage}
                onValueChange={(value) =>
                  setFormData({ ...formData, stage: value })
                }
                triggerClassName="h-12 px-4 text-left"
                contentWrapperClassName="bg-[#0b1222]"
              >
                <SelectContent className="space-y-1">
                  {PROJECT_STAGE_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      label={option.label}
                      className="px-4 py-3"
                    >
                      <span className="text-sm font-medium text-white">
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Duration
              </Label>
              <Input
                type="number"
                min={1}
                value={formData.duration_min}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    duration_min: event.target.value,
                  })
                }
                className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Skills
                </Label>
                <SkillMultiSelect
                  skills={sortedSkills}
                  selectedIds={formData.skill_ids}
                  onToggle={toggleSkill}
                  categories={skillCategories}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Goal
                </Label>
                <Select
                  value={formData.goal_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, goal_id: value })
                  }
                >
                  <SelectContent>
                    <SelectItem value="">Select goal...</SelectItem>
                    {goals.map((goal) => (
                      <SelectItem key={goal.id} value={goal.id}>
                        {formatNameDisplay(goal.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Why?
              </Label>
              <Textarea
                value={formData.description}
                onChange={(event) =>
                  setFormData({ ...formData, description: event.target.value })
                }
                placeholder="Capture context or success criteria"
                className="min-h-[96px] rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
              />
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-400">
                  Advanced scheduling
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setShowProjectAdvancedOptions((prev) => !prev)
                  }
                  className="h-7 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400 hover:border-white/30 hover:text-white"
                >
                  {showProjectAdvancedOptions ? "Hide" : "Show"}
                </Button>
              </div>
              {showProjectAdvancedOptions ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                        Manual start time
                      </Label>
                      <Input
                        type="datetime-local"
                        value={formData.manual_start}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            manual_start: event.target.value,
                          })
                        }
                        className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white focus:border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                        Manual end time
                      </Label>
                      <Input
                        type="datetime-local"
                        value={formData.manual_end}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            manual_end: event.target.value,
                          })
                        }
                        className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white focus:border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Provide both a start and end time to create a locked block that the scheduler will keep in place. Clear both fields to return this project to dynamic scheduling.
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-zinc-500">
                  Lock this project into a fixed window by setting a manual start and end time.
                </p>
              )}
            </div>
          </div>
        </FormSection>
        ) : eventType === "TASK" ? (
            <FormSection title="Task details">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Name
                  </Label>
                  <Input
                    value={formData.name}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        name: formatNameValue(event.target.value),
                      }))
                    }
                    placeholder={`Enter ${eventMeta.badge.toLowerCase()} name`}
                    className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Priority
                    </Label>
                  <OptionDropdown
                    value={formData.priority}
                    options={priorityDropdownOptions}
                    onChange={(value) =>
                      setFormData({ ...formData, priority: value })
                    }
                    placeholder="Select priority..."
                    itemSize="compact"
                  />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Energy
                    </Label>
                  <OptionDropdown
                    value={formData.energy}
                    options={energyDropdownOptions}
                    onChange={(value) =>
                      setFormData({ ...formData, energy: value })
                    }
                    placeholder="Select energy..."
                    itemSize="compact"
                  />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Duration
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.duration_min}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          duration_min: event.target.value,
                        })
                      }
                      className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Stage
                    </Label>
                    <Select
                      value={formData.stage}
                      onValueChange={(value) =>
                        setFormData({ ...formData, stage: value })
                      }
                      triggerClassName="h-12 px-4 text-left"
                      contentWrapperClassName="bg-[#0b1222]"
                    >
                      <SelectContent className="space-y-1">
                        {TASK_STAGE_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            label={option.label}
                            className="px-4 py-3"
                          >
                            <span className="text-sm font-medium text-white">
                              {option.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Goal
                    </Label>
                    <Select
                      value={formData.goal_id}
                      onValueChange={handleGoalChange}
                      placeholder="Select goal..."
                    >
                      <SelectContent>
                        <SelectItem value="">Select goal...</SelectItem>
                        {goals.map((goal) => (
                          <SelectItem key={goal.id} value={goal.id}>
                            {formatNameDisplay(goal.name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Project
                    </Label>
                    <Select
                      value={formData.project_id}
                      onValueChange={(value) =>
                        setFormData({ ...formData, project_id: value })
                      }
                    >
                      <SelectContent>
                        <SelectItem value="">Select project...</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {formatNameDisplay(project.name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Skill
                    </Label>
                    <SkillMultiSelect
                      skills={sortedSkills}
                      selectedIds={formData.skill_id ? [formData.skill_id] : []}
                      onToggle={handleTaskSkillToggle}
                      placeholder="Select skill..."
                      buttonClassName="rounded-full border border-white/10 bg-white/[0.04] text-sm text-white/80"
                      categories={skillCategories}
                    />
                  </div>
              </div>
            </FormSection>
        ) : (
            <>
              <FormSection title="Overview">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Name
                    </Label>
                    <Input
                      value={formData.name}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          name: formatNameValue(event.target.value),
                        }))
                      }
                      placeholder={`Enter ${eventMeta.badge.toLowerCase()} name`}
                      className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                      required
                    />
                  </div>
                  {eventType !== "PROJECT" && eventType !== "TASK" ? (
                    <div className="space-y-2">
                      <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        Description
                      </Label>
                      <Textarea
                        value={formData.description}
                        onChange={(event) =>
                          setFormData({ ...formData, description: event.target.value })
                        }
                        placeholder={`Describe your ${eventMeta.badge.toLowerCase()}`}
                        className="min-h-[96px] rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                  ) : null}
                </div>
              </FormSection>

              <FormSection title="Intensity">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Priority
                    </Label>
                      <OptionDropdown
                        value={formData.priority}
                        options={priorityDropdownOptions}
                        onChange={(value) =>
                          setFormData({ ...formData, priority: value })
                        }
                        placeholder="Select priority..."
                        itemSize="compact"
                      />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Energy
                    </Label>
                      <OptionDropdown
                        value={formData.energy}
                        options={energyDropdownOptions}
                        onChange={(value) =>
                          setFormData({ ...formData, energy: value })
                        }
                        placeholder="Select energy..."
                        itemSize="compact"
                      />
                  </div>

                </div>
              </FormSection>





              {eventType === "TASK" ? null : (
                <FormSection title="Context">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        Goal
                      </Label>
                      <Select
                        value={formData.goal_id}
                        onValueChange={handleGoalChange}
                        placeholder="Select goal..."
                      >
                        <SelectContent>
                          <SelectItem value="">Select goal...</SelectItem>
                          {goals.map((goal) => (
                            <SelectItem key={goal.id} value={goal.id}>
                              {formatNameDisplay(goal.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        Project
                      </Label>
                      <Select
                        value={formData.project_id}
                        onValueChange={(value) =>
                          setFormData({ ...formData, project_id: value })
                        }
                      >
                        <SelectContent>
                          <SelectItem value="">Select project...</SelectItem>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {formatNameDisplay(project.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Skill
                    </Label>
                    <SkillMultiSelect
                      skills={sortedSkills}
                      selectedIds={formData.skill_id ? [formData.skill_id] : []}
                      onToggle={handleTaskSkillToggle}
                      placeholder="Select skill..."
                      buttonClassName="rounded-full border border-white/10 bg-white/[0.04] text-sm text-white/80"
                      categories={skillCategories}
                    />
                  </div>
                </FormSection>
              )}
            </>
          )}

          <div className="flex flex-col gap-3 border-t border-white/5 pt-6">
            {isGoalWizard ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {goalWizardStep === "GOAL" ? (
                  <Button
                    type="button"
                    onClick={handlePlanGoal}
                    disabled={
                      loading ||
                      isSaving ||
                      !goalForm.name.trim() ||
                      !goalForm.monument_id.trim()
                    }
                    variant="secondary"
                    className="h-11 rounded-xl bg-white/[0.08] px-5 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgba(59,130,246,0.45)] transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Plan goal in workspace
                  </Button>
                ) : (
                  <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                    Step {activeWizardIndex + 1} of {GOAL_WIZARD_STEPS.length}
                  </span>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleModalClose}
                    disabled={isSaving}
                    className="h-11 rounded-xl border border-white/10 bg-white/[0.03] px-6 text-sm text-zinc-300 hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </Button>
                  {goalWizardStep !== "GOAL" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleWizardBack}
                      disabled={isSaving}
                      className="h-11 rounded-xl border border-transparent px-6 text-sm font-semibold text-zinc-200 hover:border-white/10 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Back
                    </Button>
                  ) : null}
                  {goalWizardStep !== "TASKS" ? (
                    <Button
                      type="button"
                      onClick={handleSaveGoalWizard}
                      disabled={!canSaveGoalWizard}
                      className="h-11 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgba(37,99,235,0.65)] transition hover:bg-blue-500/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saveButtonLabel}
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={wizardPrimaryDisabled}
                    className="h-11 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgba(37,99,235,0.65)] transition hover:bg-blue-500/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving && goalWizardStep === "TASKS"
                      ? "Saving..."
                      : goalWizardStep === "TASKS"
                      ? "Save goal & launch"
                      : goalWizardStep === "PROJECTS"
                      ? "Continue to tasks"
                      : "Continue to projects"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleModalClose}
                  className="h-11 rounded-xl border border-white/10 bg-white/[0.03] px-6 text-sm text-zinc-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    loading ||
                    isSaving ||
                    !formData.name.trim() ||
                    (eventType === "PROJECT" && !formData.goal_id) ||
                    (eventType === "TASK" && !formData.project_id)
                  }
                  className="h-11 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgba(37,99,235,0.65)] transition hover:bg-blue-500/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitLabel}
                </Button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  </div>,
    document.body
  );
}
