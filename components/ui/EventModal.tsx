"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckSquare,
  FolderKanban,
  Repeat,
  Sparkles,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Textarea } from "./textarea";
import { Select, SelectContent, SelectItem } from "./select";
import { Badge } from "./badge";
import { useToastHelpers } from "./toast";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalsForUser, type Goal } from "@/lib/queries/goals";
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

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventType: "GOAL" | "PROJECT" | "TASK" | "HABIT" | null;
}

type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
};

const PRIORITY_OPTIONS: ChoiceOption[] = [
  { value: "NO", label: "No Priority", description: "Backlog or nice-to-have." },
  { value: "LOW", label: "Low", description: "Good to do when time allows." },
  { value: "MEDIUM", label: "Medium", description: "Important, but not urgent." },
  { value: "HIGH", label: "High", description: "Time-sensitive and meaningful." },
  { value: "CRITICAL", label: "Critical", description: "Blocks progress elsewhere." },
  { value: "ULTRA-CRITICAL", label: "Ultra-Critical", description: "Drop everything else." },
];

const ENERGY_OPTIONS: ChoiceOption[] = [
  { value: "NO", label: "No Energy", description: "Light lift or admin work." },
  { value: "LOW", label: "Low", description: "Can handle even on slow days." },
  { value: "MEDIUM", label: "Medium", description: "Requires steady focus." },
  { value: "HIGH", label: "High", description: "Deep work or complex effort." },
  { value: "ULTRA", label: "Ultra", description: "Demanding, plan carefully." },
  { value: "EXTREME", label: "Extreme", description: "Only when you are fully charged." },
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

const HABIT_TYPE_OPTIONS: ChoiceOption[] = [
  { value: "HABIT", label: "Habit", description: "Momentum-building routines." },
  { value: "CHORE", label: "Chore", description: "Maintenance that keeps life running." },
];

const RECURRENCE_OPTIONS: ChoiceOption[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "bi-weekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "bi-monthly", label: "Bi-monthly" },
  { value: "yearly", label: "Yearly" },
];

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
  effective_duration_min: number;
  stage: string;
  type: string;
  recurrence: string;
}

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
  duration_min: "",
  effective_duration_min: 0,
  stage:
    eventType === "PROJECT"
      ? PROJECT_STAGE_OPTIONS[0].value
      : eventType === "TASK"
      ? TASK_STAGE_OPTIONS[0].value
      : "",
  type: eventType === "HABIT" ? HABIT_TYPE_OPTIONS[0].value : "",
  recurrence: eventType === "HABIT" ? RECURRENCE_OPTIONS[0].value : "",
});

type EventMeta = {
  title: string;
  badge: string;
  eyebrow: string;
  description: string;
  highlight: string;
  accent: string;
  iconBg: string;
  icon: LucideIcon;
};

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.8)] sm:p-5">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
          {title}
        </p>
        {description ? (
          <p className="text-sm text-zinc-300">{description}</p>
        ) : null}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

interface OptionGridProps {
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  className?: string;
  columnsClassName?: string;
}

function OptionGrid({
  value,
  options,
  onChange,
  className,
  columnsClassName,
}: OptionGridProps) {
  const computedColumns = columnsClassName
    ? columnsClassName
    : options.length > 4
    ? "grid-cols-2 sm:grid-cols-3"
    : "grid-cols-2 sm:grid-cols-2";

  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className={cn("space-y-2", className)}>
      <div className={cn("grid gap-2 sm:gap-3", computedColumns)}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0",
                selected
                  ? "border-blue-500/70 bg-blue-500/15 text-white shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:text-white"
              )}
            >
              <span className="block text-[13px] font-semibold leading-tight">
                {option.label}
              </span>
              {option.description ? (
                <span className="mt-1 hidden text-[11px] leading-snug text-zinc-400 sm:block">
                  {option.description}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {selectedOption?.description ? (
        <p className="text-[11px] leading-snug text-zinc-400 sm:hidden">
          {selectedOption.description}
        </p>
      ) : null}
    </div>
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

  // State for dropdown data
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !eventType) return;
    setFormData(createInitialFormState(eventType));
  }, [eventType, isOpen]);

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

      const goalsData = await getGoalsForUser(user.id);
      setGoals(goalsData);

      if (eventType === "GOAL") {
        const monumentsData = await getMonumentsForUser(user.id);
        setMonuments(monumentsData);
      }

      if (eventType === "PROJECT" || eventType === "TASK") {
        const skillsData = await getSkillsForUser(user.id);
        setSkills(skillsData);
      }

      if (eventType === "TASK") {
        const projectsData = await getProjectsForUser(user.id);
        setProjects(projectsData);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Please enter a name for your " + eventType.toLowerCase());
      return;
    }

    let duration: number | undefined;
    if (eventType === "PROJECT" || eventType === "TASK") {
      duration = parseInt(formData.duration_min, 10);
      if (!duration || duration <= 0) {
        toast.error("Invalid Duration", "Duration must be greater than 0");
        return;
      }
    }

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        console.error("Supabase client not available");
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("User not authenticated:", userError);
        return;
      }

      const insertData: {
        user_id: string;
        name: string;
        priority: string;
        energy: string;
        description?: string;
        why?: string;
        goal_id?: string;
        project_id?: string;
        stage?: string;
        type?: string;
        recurrence?: string;
        duration_min?: number;
        monument_id?: string;
        skill_id?: string;
      } = {
        user_id: user.id,
        name: formData.name.trim(),
        priority: formData.priority,
        energy: formData.energy,
      };

      if (formData.description.trim()) {
        if (eventType === "GOAL") {
          insertData.why = formData.description.trim();
        } else {
          insertData.description = formData.description.trim();
        }
      }

      if (eventType === "PROJECT") {
        if (!formData.goal_id) {
          alert("Please select a goal for your project");
          return;
        }
        insertData.goal_id = formData.goal_id;
        insertData.stage = formData.stage;
      } else if (eventType === "TASK") {
        if (!formData.project_id) {
          alert("Please select a project for your task");
          return;
        }
        insertData.project_id = formData.project_id;
        insertData.stage = formData.stage;
        if (formData.skill_id) {
          insertData.skill_id = formData.skill_id;
        }
      } else if (eventType === "HABIT") {
        insertData.type = formData.type;
        insertData.recurrence = formData.recurrence;
      } else if (eventType === "GOAL" && formData.monument_id) {
        insertData.monument_id = formData.monument_id;
      }

      if (duration !== undefined) {
        insertData.duration_min = duration;
      }

      const { data, error } = await supabase
        .from(eventType.toLowerCase() + "s")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error("Error creating " + eventType.toLowerCase() + ":", error);
        toast.error("Error", "Failed to create " + eventType.toLowerCase());
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

      toast.success("Saved", `${eventType} created successfully`);
      onClose();
      window.location.reload();
    } catch (error) {
      console.error("Error creating " + eventType.toLowerCase() + ":", error);
      toast.error("Error", "Failed to create " + eventType.toLowerCase());
    }
  };

  const eventMeta: EventMeta = useMemo(() => {
    const base: Record<NonNullable<EventModalProps["eventType"]>, EventMeta> = {
      GOAL: {
        title: "Create New Goal",
        badge: "Goal",
        eyebrow: "North Star",
        description: "Define the outcome you want to drive.",
        highlight: "Clear goals make it easier to align projects and tasks.",
        accent: "from-sky-500/25 via-sky-500/10 to-transparent",
        iconBg: "border-sky-500/40 bg-sky-500/10 text-sky-100",
        icon: Target,
      },
      PROJECT: {
        title: "Create New Project",
        badge: "Project",
        eyebrow: "Initiative",
        description: "Outline the initiative that advances a goal.",
        highlight: "Link a goal so work ladders up to your strategy.",
        accent: "from-purple-500/30 via-purple-500/10 to-transparent",
        iconBg: "border-purple-500/40 bg-purple-500/10 text-purple-100",
        icon: FolderKanban,
      },
      TASK: {
        title: "Create New Task",
        badge: "Task",
        eyebrow: "Next Action",
        description: "Break the project into a focused piece of work.",
        highlight: "Make it small enough to schedule in a single sitting.",
        accent: "from-emerald-500/25 via-emerald-500/10 to-transparent",
        iconBg: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
        icon: CheckSquare,
      },
      HABIT: {
        title: "Create New Habit",
        badge: "Habit",
        eyebrow: "Rhythm",
        description: "Design the routine that compounds progress.",
        highlight: "Consistency beats intensity—keep it small and trackable.",
        accent: "from-blue-500/25 via-blue-500/10 to-transparent",
        iconBg: "border-blue-500/40 bg-blue-500/10 text-blue-100",
        icon: Repeat,
      },
    };

    if (!eventType) {
      return base.GOAL;
    }

    if (eventType === "HABIT" && formData.type === "CHORE") {
      return {
        title: "Create New Chore",
        badge: "Chore",
        eyebrow: "Upkeep",
        description: "Capture recurring maintenance so nothing slips.",
        highlight: "Chores clear mental clutter—schedule them before they stack.",
        accent: "from-amber-500/30 via-amber-500/10 to-transparent",
        iconBg: "border-amber-500/40 bg-amber-500/10 text-amber-100",
        icon: Sparkles,
      };
    }

    return base[eventType];
  }, [eventType, formData.type]);

  const overviewDescription = useMemo(() => {
    switch (eventType) {
      case "GOAL":
        return "Give your goal a name and explain why it matters.";
      case "PROJECT":
        return "Summarise what you’re building and the impact you expect.";
      case "TASK":
        return "Describe the specific piece of work you\'ll complete.";
      case "HABIT":
        return formData.type === "CHORE"
          ? "Clarify the recurring upkeep so it’s easier to delegate or schedule."
          : "Spell out the routine you want to reinforce.";
      default:
        return "";
    }
  }, [eventType, formData.type]);

  const intensityDescription = useMemo(() => {
    switch (eventType) {
      case "GOAL":
        return "Prioritise the goal and capture the energy it will demand.";
      case "PROJECT":
        return "Help future-you schedule this project realistically.";
      case "TASK":
        return "Set expectations so the task lands in the right time slot.";
      case "HABIT":
        return formData.type === "CHORE"
          ? "How heavy is this chore when it shows up?"
          : "Gauge the effort required to stay consistent.";
      default:
        return "";
    }
  }, [eventType, formData.type]);

  const submitLabel = loading
    ? "Creating..."
    : `Create ${eventMeta.badge}`;

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
          <div className="relative flex flex-col gap-6 px-8 pb-8 pt-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-1 flex-col gap-4">
              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl border text-white shadow-inner",
                    eventMeta.iconBg
                  )}
                >
                  <eventMeta.icon className="h-6 w-6" />
                </span>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-white/20 bg-white/10 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-200"
                    >
                      {eventMeta.eyebrow}
                    </Badge>
                    <Badge className="bg-white/15 text-xs font-semibold text-white">
                      {eventMeta.badge}
                    </Badge>
                  </div>
                  <h2 className="text-2xl font-semibold text-white">
                    {eventMeta.title}
                  </h2>
                  <p className="text-sm text-zinc-200">
                    {eventMeta.description}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="self-start rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="border-t border-white/10 px-8 py-3 text-xs text-zinc-400">
            {eventMeta.highlight}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6 pt-6 sm:px-8 sm:pb-8"
        >
          <FormSection title="Overview" description={overviewDescription}>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Name
                </Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={`Enter ${eventMeta.badge.toLowerCase()} name`}
                  className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  {eventType === "GOAL" ? "Why this matters" : "Description"}
                </Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={
                    eventType === "GOAL"
                      ? "Capture the motivation or vision for this goal"
                      : `Describe your ${eventMeta.badge.toLowerCase()}`
                  }
                  className="min-h-[96px] rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                />
                <p className="text-xs text-zinc-500">Optional, but recommended.</p>
              </div>
            </div>
          </FormSection>

          <FormSection title="Intensity" description={intensityDescription}>
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                  Priority
                </p>
                <OptionGrid
                  value={formData.priority}
                  options={PRIORITY_OPTIONS}
                  onChange={(value) =>
                    setFormData({ ...formData, priority: value })
                  }
                />
              </div>
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                  Energy
                </p>
                <OptionGrid
                  value={formData.energy}
                  options={ENERGY_OPTIONS}
                  onChange={(value) =>
                    setFormData({ ...formData, energy: value })
                  }
                />
              </div>
            </div>
          </FormSection>

          {eventType === "GOAL" ? (
            <FormSection
              title="Connections"
              description="Link this goal to a monument to celebrate progress."
            >
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Monument (optional)
                </Label>
                <Select
                  value={formData.monument_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, monument_id: value })
                  }
                >
                  <SelectContent>
                    <SelectItem value="">No monument</SelectItem>
                    {monuments.map((monument) => (
                      <SelectItem key={monument.id} value={monument.id}>
                        {monument.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {monuments.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    You can connect goals to monuments once you’ve created
                    them.
                  </p>
                ) : null}
              </div>
            </FormSection>
          ) : null}

          {eventType === "PROJECT" ? (
            <>
              <FormSection
                title="Context"
                description="Anchor this project to a goal and spotlight the skills involved."
              >
                <div className="grid gap-4 md:grid-cols-2">
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
                            {goal.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {goals.length === 0 ? (
                      <p className="text-xs text-zinc-500">
                        Create a goal first to keep projects aligned.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Skills involved
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {skills.length > 0 ? (
                        skills.map((skill) => {
                          const selected = formData.skill_ids.includes(
                            skill.id
                          );
                          return (
                            <button
                              key={skill.id}
                              type="button"
                              onClick={() => toggleSkill(skill.id)}
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
                                selected
                                  ? "border-blue-400/80 bg-blue-500/15 text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:text-white"
                              )}
                              aria-pressed={selected}
                            >
                              {skill.name}
                            </button>
                          );
                        })
                      ) : (
                        <p className="text-xs text-zinc-500">
                          Skills will appear here once you’ve added them to
                          your workspace.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection
                title="Workflow"
                description="Capture the time commitment and where this work sits in your pipeline."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Duration (minutes)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.duration_min}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          duration_min: e.target.value,
                        })
                      }
                      className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Effective duration
                    </Label>
                    <Input
                      value={formData.effective_duration_min}
                      readOnly
                      className="h-11 cursor-not-allowed rounded-xl border border-white/5 bg-white/[0.02] text-sm text-zinc-500"
                    />
                    <p className="text-xs text-zinc-500">
                      Calculated automatically as the project evolves.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                    Stage
                  </p>
                  <OptionGrid
                    value={formData.stage}
                    options={PROJECT_STAGE_OPTIONS}
                    onChange={(value) =>
                      setFormData({ ...formData, stage: value })
                    }
                  />
                </div>
              </FormSection>
            </>
          ) : null}

          {eventType === "TASK" ? (
            <>
              <FormSection
                title="Context"
                description="Filter by goal and pick the project this task pushes forward."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Goal filter
                    </Label>
                    <Select
                      value={formData.goal_id}
                      onValueChange={handleGoalChange}
                    >
                      <SelectContent>
                        <SelectItem value="">All goals</SelectItem>
                        {goals.map((goal) => (
                          <SelectItem key={goal.id} value={goal.id}>
                            {goal.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-zinc-500">
                      Selecting a goal narrows the project list.
                    </p>
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
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {projects.length === 0 ? (
                      <p className="text-xs text-zinc-500">
                        {formData.goal_id
                          ? "No projects under this goal yet."
                          : "Choose a goal to see its projects."}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Skill (optional)
                  </Label>
                  <Select
                    value={formData.skill_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, skill_id: value })
                    }
                  >
                    <SelectContent>
                      <SelectItem value="">No specific skill</SelectItem>
                      {skills.map((skill) => (
                        <SelectItem key={skill.id} value={skill.id}>
                          {skill.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </FormSection>

              <FormSection
                title="Workflow"
                description="Estimate the effort and mark the stage this task belongs to."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Duration (minutes)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.duration_min}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          duration_min: e.target.value,
                        })
                      }
                      className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                    Stage
                  </p>
                  <OptionGrid
                    value={formData.stage}
                    options={TASK_STAGE_OPTIONS}
                    onChange={(value) =>
                      setFormData({ ...formData, stage: value })
                    }
                    columnsClassName="grid-cols-3"
                  />
                </div>
              </FormSection>
            </>
          ) : null}

          {eventType === "HABIT" ? (
            <FormSection
              title="Rhythm"
              description="Decide whether this is a habit or chore and how often it repeats."
            >
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                    Type
                  </p>
                  <OptionGrid
                    value={formData.type}
                    options={HABIT_TYPE_OPTIONS}
                    onChange={(value) =>
                      setFormData({ ...formData, type: value })
                    }
                  />
                </div>
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                    Recurrence
                  </p>
                  <OptionGrid
                    value={formData.recurrence}
                    options={RECURRENCE_OPTIONS}
                    onChange={(value) =>
                      setFormData({ ...formData, recurrence: value })
                    }
                  />
                </div>
              </div>
            </FormSection>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-white/5 pt-6 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-11 rounded-xl border border-white/10 bg-white/[0.03] px-6 text-sm text-zinc-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                !formData.name.trim() ||
                (eventType === "PROJECT" && !formData.goal_id) ||
                (eventType === "TASK" && !formData.project_id)
              }
              className="h-11 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgba(37,99,235,0.65)] transition hover:bg-blue-500/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>,
    document.body
  );
}
