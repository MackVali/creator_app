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
  HABIT_ENERGY_OPTIONS,
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
import {
  DEFAULT_ENERGY,
  DEFAULT_PRIORITY,
  DEFAULT_TASK_STAGE,
  createDraftProject,
  createDraftTask,
  type DraftProject,
  type DraftTask,
} from "@/lib/drafts/projects";
import { resolveLocationContextId, isValidUuid } from "@/lib/location-metadata";
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
): Promise<{ success: boolean; goalId: string | null }> {
  let createdGoalId: string | null = null;

  try {
    const { data: goalRecord, error: goalError } = await supabase
      .from("goals")
      .insert({
        user_id: goalInput.user_id,
        name: goalInput.name,
        priority: goalInput.priority,
        energy: goalInput.energy,
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
      const { data: projectRecord, error: projectError } = await supabase
        .from("projects")
        .insert({
          user_id: goalInput.user_id,
          goal_id: createdGoalId,
          name: project.name,
          stage: project.stage,
          priority: project.priority,
          energy: project.energy,
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
              priority: task.priority,
              energy: task.energy,
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

    return { success: true, goalId: createdGoalId };
  } catch (error) {
    console.error("Fallback goal creation failed:", error);
    if (createdGoalId) {
      await cleanupGoalHierarchy(supabase, createdGoalId);
    }
    return { success: false, goalId: null };
  }
}

const PRIORITY_OPTIONS: ChoiceOption[] = [
  { value: "NO", label: "No Priority" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
  { value: "ULTRA-CRITICAL", label: "Ultra-Critical" },
];

const renderFlameIcon = (level: FlameLevel) => {
  const FlameIcon = () => (
    <FlameEmber level={level} size="sm" className="shrink-0" />
  );
  FlameIcon.displayName = `FlameIcon${level}`;
  return FlameIcon;
};

const ENERGY_OPTIONS: ChoiceOption[] = [
  {
    value: "NO",
    label: "No Energy",
    renderIcon: renderFlameIcon("NO"),
  },
  {
    value: "LOW",
    label: "Low",
    renderIcon: renderFlameIcon("LOW"),
  },
  {
    value: "MEDIUM",
    label: "Medium",
    renderIcon: renderFlameIcon("MEDIUM"),
  },
  {
    value: "HIGH",
    label: "High",
    renderIcon: renderFlameIcon("HIGH"),
  },
  {
    value: "ULTRA",
    label: "Ultra",
    renderIcon: renderFlameIcon("ULTRA"),
  },
  {
    value: "EXTREME",
    label: "Extreme",
    renderIcon: renderFlameIcon("EXTREME"),
  },
];

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
  location_context: string;
  location_context_id: string;
  daylight_preference: string;
  window_edge_preference: string;
  completion_target: string;
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
  priority: DEFAULT_PRIORITY,
  energy: DEFAULT_ENERGY,
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
  priority: "NO",
  energy: "NO",
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
  location_context: "",
  location_context_id: "",
  daylight_preference: "ALL_DAY",
  window_edge_preference: "FRONT",
  completion_target: eventType === "HABIT" ? "10" : "",
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
}

function SkillMultiSelect({
  skills,
  selectedIds,
  onToggle,
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
      cancelAnimationFrame(frame);
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
      ? "Select skills..."
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
          "flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-100 shadow-[0_0_0_1px_rgba(148,163,184,0.06)] transition focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60",
          isOpen && hasSkills && "border-blue-400/70"
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="block truncate text-left">{summaryText}</span>
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
            {filteredSkills.length > 0 ? (
              filteredSkills.map((skill) => {
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
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/5",
                      isSelected && "bg-blue-500/15 text-white"
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="text-base leading-none">
                        {getSkillIcon(skill.icon)}
                      </span>
                      <span className="truncate">{skill.name}</span>
                    </span>
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4 text-blue-400" />
                    ) : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-2 text-xs text-zinc-500">
                No skills match your search.
              </p>
            )}
          </div>
        </div>
      ) : null}
      {selectedSkills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedSkills.map((skill) => (
            <Badge
              key={skill.id}
              variant="outline"
              className="flex items-center gap-1 border-white/15 bg-white/[0.05] px-3 py-1 text-xs text-zinc-100"
            >
              <span className="text-sm leading-none">
                {getSkillIcon(skill.icon)}
              </span>
              <span>{skill.name}</span>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface SkillSearchSelectProps {
  skills: Skill[];
  selectedId: string;
  onSelect: (skillId: string) => void;
  placeholder?: string;
}

function SkillSearchSelect({
  skills,
  selectedId,
  onSelect,
  placeholder = "Select skill...",
}: SkillSearchSelectProps) {
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

  const selectedSkill = useMemo(
    () => sortedSkills.find((skill) => skill.id === selectedId) ?? null,
    [sortedSkills, selectedId]
  );

  const hasSkills = sortedSkills.length > 0;

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
          onSelect(firstMatch.id);
          setIsOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [filteredSkills, isOpen, onSelect]);

  useEffect(() => {
    if (!hasSkills) {
      setIsOpen(false);
    }
  }, [hasSkills]);

  const summaryText = hasSkills
    ? selectedSkill
      ? `${getSkillIcon(selectedSkill.icon)} ${selectedSkill.name}`
      : placeholder
    : "No skills available";

  const handleSelect = (skillId: string) => {
    onSelect(skillId);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => hasSkills && setIsOpen((prev) => !prev)}
        disabled={!hasSkills}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-100 shadow-[0_0_0_1px_rgba(148,163,184,0.06)] transition focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60",
          isOpen && hasSkills && "border-blue-400/70"
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="block truncate text-left">{summaryText}</span>
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
            {filteredSkills.length > 0 ? (
              filteredSkills.map((skill) => {
                const isSelected = skill.id === selectedId;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => handleSelect(skill.id)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/5",
                      isSelected && "bg-blue-500/15 text-white"
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="text-base leading-none">
                        {getSkillIcon(skill.icon)}
                      </span>
                      <span className="truncate">{skill.name}</span>
                    </span>
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4 text-blue-400" />
                    ) : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-2 text-xs text-zinc-500">
                No skills match your search.
              </p>
            )}
          </div>
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
}

function OptionDropdown({
  value,
  options,
  onChange,
  placeholder,
}: OptionDropdownProps) {
  return (
    <Select
      value={value}
      onValueChange={onChange}
      placeholder={placeholder}
      className="w-full"
      triggerClassName="h-12 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-950/90 via-slate-950/70 to-slate-950 px-4 text-sm font-medium text-zinc-100 shadow-[0_22px_45px_-32px_rgba(15,23,42,0.9)] transition focus:ring-blue-500/70 hover:border-blue-500/40"
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
              className={cn(
                "group relative rounded-xl border border-transparent bg-white/[0.02] px-4 py-3 text-left transition",
                "hover:border-blue-500/40 hover:bg-white/[0.05]",
                selected &&
                  "border-blue-500/60 bg-blue-500/20 shadow-[0_18px_45px_-30px_rgba(59,130,246,0.6)]"
              )}
            >
              <div className="flex items-start gap-4">
                {iconNode ? (
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.02] text-zinc-400 transition",
                      selected && "bg-blue-500/20 text-blue-300"
                    )}
                  >
                    {iconNode}
                  </span>
                ) : null}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-zinc-100">
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

  // State for dropdown data
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [routineOptions, setRoutineOptions] = useState<RoutineOption[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(false);
  const [routineLoadError, setRoutineLoadError] = useState<string | null>(
    null
  );
  const [routineId, setRoutineId] = useState<string>("none");
  const [newRoutineName, setNewRoutineName] = useState("");
  const [newRoutineDescription, setNewRoutineDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

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
        const hasAdvancedData = Boolean(draft.skillId || draft.dueDate);
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
    }
  }, [isOpen, resetGoalWizard]);

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

      if (eventType === "GOAL") {
        const monumentsData = await getMonumentsForUser(user.id);
        setMonuments(monumentsData);
        return;
      }

      if (eventType === "PROJECT" || eventType === "TASK") {
        const goalsData = await getGoalsForUser(user.id);
        setGoals(goalsData);
      }

      if (
        eventType === "PROJECT" ||
        eventType === "TASK" ||
        eventType === "HABIT"
      ) {
        setSkillsLoading(true);
        setSkillError(null);
        try {
          const skillsData = await getSkillsForUser(user.id);
          setSkills(skillsData);
        } catch (error) {
          console.error("Error loading skills:", error);
          setSkills([]);
          setSkillError("Unable to load your skills right now.");
        } finally {
          setSkillsLoading(false);
        }
      } else {
        setSkills([]);
        setSkillError(null);
        setSkillsLoading(false);
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

  const sortedSkills = useMemo(
    () =>
      [...skills].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [skills]
  );

  const habitEnergyOptions = useMemo(
    () => HABIT_ENERGY_OPTIONS,
    []
  );

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
      ...sortedSkills.map((skill) => ({
        value: skill.id,
        label: skill.name,
        icon: skill.icon ?? null,
      })),
    ];
  }, [skillsLoading, sortedSkills]);

  const handleTaskSkillSelect = (value: string) => {
    setFormData((prev) => ({ ...prev, skill_id: value }));
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

      const insertData: {
        user_id: string;
        name: string;
        priority?: string;
        energy?: string;
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
        completion_target?: number | null;
      } = {
        user_id: user.id,
        name: formatNameValue(formData.name.trim()),
      };

      insertData.energy = formData.energy;
      if (eventType !== "HABIT") {
        insertData.priority = formData.priority;
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
        if (
          normalizedRecurrence === "every x days" &&
          formData.recurrence_days.length === 0
        ) {
          toast.error(
            "Days required",
            "Select at least one day for this habit."
          );
          return;
        }

        const recurrenceDaysValue =
          normalizedRecurrence === "every x days" &&
          formData.recurrence_days.length > 0
            ? formData.recurrence_days
            : null;

        insertData.recurrence =
          normalizedRecurrence === "none" ? null : formData.recurrence;
        insertData.recurrence_days = recurrenceDaysValue;
        insertData.skill_id = formData.skill_id ? formData.skill_id : null;
        let resolvedLocationContextId = isValidUuid(formData.location_context_id)
          ? formData.location_context_id
          : null;
        if (!resolvedLocationContextId && formData.location_context) {
          try {
            resolvedLocationContextId = await resolveLocationContextId(
              supabase,
              user.id,
              formData.location_context,
            );
          } catch (maybeError) {
            console.error("Failed to resolve location context:", maybeError);
            toast.error(
              "Location error",
              "We couldn't save that location right now. Please try again later.",
            );
            return;
          }
        }
        if (formData.location_context && !resolvedLocationContextId) {
          toast.error(
            "Location error",
            "We couldn't save that location right now. Please try again later.",
          );
          return;
        }
        insertData.location_context_id = resolvedLocationContextId;
        insertData.daylight_preference =
          formData.daylight_preference &&
          formData.daylight_preference !== "ALL_DAY"
            ? formData.daylight_preference
            : null;
        insertData.window_edge_preference =
          (formData.window_edge_preference || "FRONT").toUpperCase();

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

        const sanitizedProjects = draftProjects
          .map<NormalizedProjectPayload | null>((draft) => {
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

                return {
                  name: formattedTaskName,
                  stage: task.stage || DEFAULT_TASK_STAGE,
                  priority: task.priority || DEFAULT_PRIORITY,
                  energy: task.energy || DEFAULT_ENERGY,
                  notes: trimmedNotes.length > 0 ? trimmedNotes : null,
                  skill_id: taskSkillId,
                  due_date:
                    trimmedTaskDueDate.length > 0 ? trimmedTaskDueDate : null,
                } satisfies NormalizedTaskPayload;
              })
              .filter((task): task is NormalizedTaskPayload => task !== null);

            return {
              name: formattedName,
              stage: draft.stage || PROJECT_STAGE_OPTIONS[0].value,
              priority: draft.priority || DEFAULT_PRIORITY,
              energy: draft.energy || DEFAULT_ENERGY,
              why: trimmedWhy.length > 0 ? trimmedWhy : null,
              duration_min:
                Number.isFinite(parsedDuration) && parsedDuration > 0
                  ? Math.max(1, Math.round(parsedDuration))
                  : null,
              skill_id: projectSkillId,
              due_date:
                trimmedProjectDueDate.length > 0 ? trimmedProjectDueDate : null,
              tasks,
            } satisfies NormalizedProjectPayload;
          })
          .filter(
            (project): project is NormalizedProjectPayload => project !== null
          );

        const hasProjects = sanitizedProjects.length > 0;
        const goalWhy = goalForm.why.trim();
        const trimmedGoalName = goalForm.name.trim();
        const selectedMonumentId = goalForm.monument_id.trim();
        const goalDueDate = goalForm.dueDate.trim();

        const goalInput: GoalWizardRpcInput = {
          user_id: user.id,
          name: formatNameValue(trimmedGoalName),
          priority: goalForm.priority || DEFAULT_PRIORITY,
          energy: goalForm.energy || DEFAULT_ENERGY,
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

        if (rpcError || !data) {
          if (rpcError) {
            console.error("Error creating goal with projects via RPC:", {
              message: rpcError.message,
              details: rpcError.details,
              hint: rpcError.hint,
              code: rpcError.code,
            });
          } else {
            console.error(
              "RPC returned no data when creating goal with projects."
            );
          }

          const fallbackResult = await createGoalFallback(
            supabase,
            goalInput,
            sanitizedProjects
          );

          if (!fallbackResult.success || !fallbackResult.goalId) {
            toast.error("Error", "We couldn't save that goal just yet.");
            return;
          }

          console.warn("Goal created via fallback inserts.");
          createdGoalId = fallbackResult.goalId ?? undefined;
        } else {
          const goalPayload = (data as { goal?: { id?: string } } | null) ?? null;
          createdGoalId = goalPayload?.goal?.id;
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
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6 pt-6 sm:px-8 sm:pb-8"
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
                <>
                  <FormSection title="Overview">
                    <div className="grid gap-4">
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
                    </div>
                  </FormSection>

                  <FormSection title="Relations">
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
                          placeholder={loading ? "Loading monuments..." : "Select monument..."}
                          triggerClassName="h-12"
                        >
                          <SelectContent>
                            {monuments.length === 0 ? (
                              <SelectItem value="" disabled>
                                {loading
                                  ? "Loading monuments..."
                                  : "No monuments found"}
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

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            Priority
                          </Label>
                          <OptionDropdown
                            value={goalForm.priority}
                            options={PRIORITY_OPTIONS}
                            onChange={(value) =>
                              handleGoalFormChange("priority", value)
                            }
                            placeholder="Select priority..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            Energy
                          </Label>
                          <OptionDropdown
                            value={goalForm.energy}
                            options={ENERGY_OPTIONS}
                            onChange={(value) =>
                              handleGoalFormChange("energy", value)
                            }
                            placeholder="Select energy..."
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
                  </FormSection>

                  <FormSection>
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
                        className="min-h-[120px] rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                  </FormSection>
                </>
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
                                className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                              />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                  Stage
                                </Label>
                                <OptionDropdown
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
                                  Duration (minutes)
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
                                  placeholder="e.g. 90"
                                  className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                  Priority
                                </Label>
                                <OptionDropdown
                                  value={draft.priority}
                                  options={PRIORITY_OPTIONS}
                                  onChange={(value) =>
                                    handleDraftProjectChange(
                                      draft.id,
                                      "priority",
                                      value
                                    )
                                  }
                                  placeholder="Select priority..."
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                  Energy
                                </Label>
                                <OptionDropdown
                                  value={draft.energy}
                                  options={ENERGY_OPTIONS}
                                  onChange={(value) =>
                                    handleDraftProjectChange(
                                      draft.id,
                                      "energy",
                                      value
                                    )
                                  }
                                  placeholder="Select energy..."
                                />
                              </div>
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
                                className="min-h-[88px] rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                              />
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
                                      Skill link
                                    </Label>
                                    <Select
                                      value={draft.skillId ?? ""}
                                      onValueChange={(value) =>
                                        handleDraftProjectSkillChange(
                                          draft.id,
                                          value ? value : null
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
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
                                    <div className="grid gap-3 sm:grid-cols-3">
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
                                        options={PRIORITY_OPTIONS}
                                        onChange={(value) =>
                                          handleTaskChange(
                                            draft.id,
                                            task.id,
                                            "priority",
                                            value
                                          )
                                        }
                                        placeholder="Priority"
                                      />
                                      <OptionDropdown
                                        value={task.energy}
                                        options={ENERGY_OPTIONS}
                                        onChange={(value) =>
                                          handleTaskChange(
                                            draft.id,
                                            task.id,
                                            "energy",
                                            value
                                          )
                                        }
                                        placeholder="Energy"
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
              locationContext={
                formData.location_context
                  ? formData.location_context.toUpperCase()
                  : null
              }
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
              energyOptions={habitEnergyOptions}
              skillsLoading={skillsLoading}
              skillOptions={habitSkillSelectOptions}
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
              onLocationContextChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  location_context: value ? value.toUpperCase() : "",
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
                      options={PRIORITY_OPTIONS}
                      onChange={(value) =>
                        setFormData({ ...formData, priority: value })
                      }
                      placeholder="Select priority..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Energy
                    </Label>
                    <OptionDropdown
                      value={formData.energy}
                      options={ENERGY_OPTIONS}
                      onChange={(value) =>
                        setFormData({ ...formData, energy: value })
                      }
                      placeholder="Select energy..."
                    />
                  </div>
                  {eventType === "PROJECT" ? (
                    <>
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
                          Duration (minutes)
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
                          Skills
                        </Label>
                        <SkillMultiSelect
                          skills={sortedSkills}
                          selectedIds={formData.skill_ids}
                          onToggle={toggleSkill}
                        />
                      </div>
                    </>
                  ) : null}
                  {eventType === "TASK" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                          Duration (minutes)
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
                  ) : null}
                </div>
              </FormSection>

              {eventType === "PROJECT" ? (
                <FormSection title="Context">
                  <div className="space-y-4">
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
                  </div>
                </FormSection>
              ) : null}

              {eventType === "TASK" ? (
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
                    <SkillSearchSelect
                      skills={sortedSkills}
                      selectedId={formData.skill_id}
                      onSelect={handleTaskSkillSelect}
                    />
                  </div>
                </FormSection>
              ) : null}
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
