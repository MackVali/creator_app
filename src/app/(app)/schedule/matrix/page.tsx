"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { CalendarDays, Grid2X2, Sparkles } from "lucide-react";
import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import type { Goal, Project } from "@/app/(app)/goals/types";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/lib/hooks/useProfile";
import { getMonumentsForUser, type Monument } from "@/lib/queries/monuments";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import {
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
  normalizeTimeZone,
  startOfDayInTimeZone,
} from "@/lib/scheduler/timezone";
import { cn } from "@/lib/utils";

type ScheduleInstance =
  Database["public"]["Tables"]["schedule_instances"]["Row"];
type ProjectRow = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  | "id"
  | "name"
  | "goal_id"
  | "stage"
  | "completed_at"
  | "duration_min"
  | "created_at"
  | "due_date"
  | "priority"
  | "energy"
> & {
  tasks?: {
    id: string;
    project_id: string | null;
    stage: string;
    name: string;
    skill_id: string | null;
    priority: string | null;
  }[];
  project_skills?: {
    skill_id: string | null;
  }[];
};
type GoalRow = Pick<
  Database["public"]["Tables"]["goals"]["Row"],
  "id" | "name" | "monument_id"
>;
type SkillRow = Pick<
  Database["public"]["Tables"]["skills"]["Row"],
  "id" | "monument_id" | "icon"
>;
type HabitRow = Pick<
  Database["public"]["Tables"]["habits"]["Row"],
  | "id"
  | "name"
  | "created_at"
  | "updated_at"
  | "last_completed_at"
  | "current_streak_days"
  | "longest_streak_days"
  | "habit_type"
  | "duration_minutes"
  | "energy"
  | "recurrence"
  | "recurrence_days"
  | "recurrence_mode"
  | "anchor_type"
  | "anchor_value"
  | "anchor_start_date"
  | "skill_id"
  | "goal_id"
  | "completion_target"
  | "location_context_id"
  | "daylight_preference"
  | "window_edge_preference"
  | "next_due_override"
>;

type MatrixEvent = {
  instance: ScheduleInstance;
  title: string;
  monumentId: string | null;
  glyph: string;
  goal: Goal | null;
  habit: MatrixHabit | null;
};

type MatrixHabit = HabitRow & {
  monumentId: string | null;
  glyph: string;
};

type MonumentGroup<T> = {
  key: string;
  title: string;
  emoji: string | null;
  items: T[];
};

type MatrixMonumentGroup = {
  key: string;
  title: string;
  emoji: string | null;
  scheduledItems: MatrixEvent[];
  unscheduledDueHabits: MatrixHabit[];
};

type MatrixPanel = "scheduled" | "unscheduled";
type MatrixPanelSwipeAxis = "horizontal" | "vertical" | null;

type MatrixState = {
  loading: boolean;
  error: string | null;
  eventGroups: MonumentGroup<MatrixEvent>[];
  unscheduledDueHabitGroups: MonumentGroup<MatrixHabit>[];
  dayLabel: string;
};

const initialState: MatrixState = {
  loading: true,
  error: null,
  eventGroups: [],
  unscheduledDueHabitGroups: [],
  dayLabel: "",
};

const UNLINKED_GROUP_KEY = "__unlinked__";
const MATRIX_LIBRARY_GRID_CLASS =
  "-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const MATRIX_LIBRARY_CARD_CLASS =
  "goal-card group relative flex aspect-[5/6] min-h-[96px] w-full transform-gpu flex-col rounded-2xl border border-zinc-300/20 bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.09),transparent_55%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(17,17,20,0.96)_54%,rgba(31,32,36,0.72)_100%)] p-3 text-white shadow-[0_18px_38px_-30px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 select-none hover:-translate-y-px hover:border-zinc-100/30 sm:p-4";

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatEventTime(
  startUtc: string | null,
  endUtc: string | null,
  timeZone: string
) {
  if (!startUtc || !endUtc) return "Unscheduled time";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(startUtc))} - ${formatter.format(new Date(endUtc))}`;
}

function formatDayLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getHabitFallbackGlyph(habitType?: string | null) {
  return habitType?.trim().toUpperCase() === "CHORE" ? "◆" : "✦";
}

function normalizeRelatedHabitType(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() || "HABIT";
  return normalized === "ASYNC" ? "SYNC" : normalized;
}

function getHabitCardTypeClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") {
    return "!bg-[radial-gradient(circle_at_10%_-25%,rgba(159,18,57,0.32),transparent_58%),linear-gradient(135deg,rgba(31,9,12,0.98)_0%,rgba(76,18,27,0.94)_48%,rgba(111,26,39,0.76)_100%)]";
  }
  if (normalized === "SYNC") {
    return "!bg-[radial-gradient(circle_at_12%_-20%,rgba(113,113,122,0.22),transparent_58%),linear-gradient(135deg,rgba(16,18,22,0.98)_0%,rgba(39,43,51,0.94)_48%,rgba(70,77,89,0.68)_100%)]";
  }
  if (normalized === "PRACTICE") {
    return "!bg-[radial-gradient(circle_at_6%_-14%,rgba(79,70,229,0.22),transparent_60%),linear-gradient(142deg,rgba(8,9,20,0.98)_0%,rgba(24,27,51,0.95)_46%,rgba(50,55,92,0.68)_100%)]";
  }
  return "!bg-[radial-gradient(circle_at_18%_-24%,rgba(255,255,255,0.055),transparent_54%),linear-gradient(145deg,rgba(10,11,14,0.98)_0%,rgba(17,18,22,0.96)_58%,rgba(24,26,31,0.88)_100%)]";
}

function getHabitCardBorderClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") return "border-rose-200/45";
  if (normalized === "SYNC") return "border-zinc-300/35";
  if (normalized === "PRACTICE") return "border-slate-500/50";
  return "border-white/10 shadow-[0_16px_34px_-28px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.055)]";
}

function mapPriority(priority: string | null | undefined): Goal["priority"] {
  const normalized = priority?.trim().toUpperCase();
  switch (normalized) {
    case "NO":
      return "No";
    case "ULTRA-CRITICAL":
      return "Ultra";
    case "CRITICAL":
      return "Critical";
    case "HIGH":
      return "High";
    case "MEDIUM":
      return "Medium";
    case "LOW":
      return "Low";
    default:
      return "Low";
  }
}

function mapEnergy(energy: string | null | undefined): Goal["energy"] {
  const normalized = energy?.trim().toUpperCase();
  switch (normalized) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    case "ULTRA":
      return "Ultra";
    case "EXTREME":
      return "Extreme";
    default:
      return "No";
  }
}

function normalizePriorityCode(value?: string | null): string {
  const upper = typeof value === "string" ? value.toUpperCase() : "NO";
  return ["NO", "LOW", "MEDIUM", "HIGH", "CRITICAL", "ULTRA-CRITICAL"].includes(
    upper
  )
    ? upper
    : "NO";
}

function normalizeEnergyCode(value?: string | null): string {
  const upper = typeof value === "string" ? value.toUpperCase() : "NO";
  return ["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"].includes(upper)
    ? upper
    : "NO";
}

function toScheduleHabit(habit: HabitRow): HabitScheduleItem {
  return {
    id: habit.id,
    name: habit.name,
    durationMinutes: habit.duration_minutes,
    createdAt: habit.created_at,
    updatedAt: habit.updated_at,
    lastCompletedAt: habit.last_completed_at,
    currentStreakDays: habit.current_streak_days,
    longestStreakDays: habit.longest_streak_days,
    habitType: habit.habit_type,
    windowId: null,
    energy: habit.energy,
    recurrence: habit.recurrence,
    recurrenceDays: habit.recurrence_days,
    recurrenceMode: habit.recurrence_mode,
    anchorType: habit.anchor_type,
    anchorValue: habit.anchor_value,
    anchorStartDate: habit.anchor_start_date,
    skillId: habit.skill_id,
    goalId: habit.goal_id,
    completionTarget: habit.completion_target,
    locationContextId: habit.location_context_id,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: habit.daylight_preference,
    windowEdgePreference: habit.window_edge_preference,
    nextDueOverride: habit.next_due_override,
    window: null,
  };
}

function isHabitDueToday(habit: HabitRow, date: Date, timeZone: string) {
  return evaluateHabitDueOnDate({
    habit: toScheduleHabit(habit),
    date,
    timeZone,
    nextDueOverride: parseOptionalDate(habit.next_due_override),
  }).isDue;
}

function resolveHabitMonumentId({
  habit,
  goals,
  skillIdToMonumentId,
}: {
  habit: HabitRow | null | undefined;
  goals: Map<string, GoalRow>;
  skillIdToMonumentId: Map<string, string>;
}) {
  if (!habit) return null;

  const goal = habit.goal_id ? goals.get(habit.goal_id) : null;
  if (goal?.monument_id) return goal.monument_id;

  return habit.skill_id
    ? (skillIdToMonumentId.get(habit.skill_id) ?? null)
    : null;
}

function buildProjectGoal({
  project,
  goal,
  skillIdToIcon,
  monumentIdToEmoji,
}: {
  project: ProjectRow;
  goal: GoalRow | null;
  skillIdToIcon: Map<string, string>;
  monumentIdToEmoji: Map<string, string>;
}): Goal {
  const tasks = (project.tasks ?? []).map((task) => ({
    id: task.id,
    name: task.name,
    stage: task.stage,
    skillId: task.skill_id ?? null,
    priorityCode: task.priority ?? null,
    isNew: false,
  }));
  const projectSkillIds = (project.project_skills ?? [])
    .map((record) => record.skill_id)
    .filter((skillId): skillId is string => Boolean(skillId));
  const taskSkillIds = tasks
    .map((task) => task.skillId)
    .filter((skillId): skillId is string => Boolean(skillId));
  const projectEmoji =
    projectSkillIds
      .map((skillId) => skillIdToIcon.get(skillId) ?? null)
      .find((icon): icon is string => Boolean(icon)) ??
    taskSkillIds
      .map((skillId) => skillIdToIcon.get(skillId) ?? null)
      .find((icon): icon is string => Boolean(icon)) ??
    null;
  const completedAt =
    typeof project.completed_at === "string" &&
    project.completed_at.trim().length > 0
      ? project.completed_at
      : null;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.stage === "PERFECT").length;
  const progress = completedAt
    ? 100
    : totalTasks
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;
  const energyCode = normalizeEnergyCode(project.energy);
  const priorityCode = normalizePriorityCode(project.priority);
  const stage = project.stage ?? "BUILD";
  const mappedProject: Project = {
    id: project.id,
    name: project.name,
    status: completedAt ? "Done" : "In-Progress",
    progress,
    energy: mapEnergy(energyCode),
    energyCode,
    dueDate: project.due_date ?? undefined,
    durationMinutes:
      typeof project.duration_min === "number" &&
      Number.isFinite(project.duration_min)
        ? project.duration_min
        : null,
    skillIds: projectSkillIds,
    emoji: projectEmoji,
    stage,
    priorityCode,
    isNew: false,
    tasks,
  };
  const createdAt = project.created_at ?? new Date().toISOString();
  const monumentId = goal?.monument_id ?? null;

  return {
    id: project.id,
    parentGoalId: goal?.id ?? project.goal_id ?? null,
    title: project.name,
    emoji: projectEmoji ?? undefined,
    priority: mapPriority(priorityCode),
    energy: mapEnergy(energyCode),
    progress,
    status: completedAt ? "COMPLETED" : "ACTIVE",
    active: !completedAt,
    createdAt,
    updatedAt: createdAt,
    dueDate: project.due_date ?? undefined,
    projects: [mappedProject],
    monumentId,
    monumentEmoji: monumentId ? (monumentIdToEmoji.get(monumentId) ?? null) : null,
    priorityCode,
    energyCode,
    skills: Array.from(new Set([...projectSkillIds, ...taskSkillIds])),
    weightBoost: 0,
  };
}

function buildMatrixEvents({
  instances,
  projects,
  habits,
  goals,
  skillIdToMonumentId,
  skillIdToIcon,
  monumentIdToEmoji,
}: {
  instances: ScheduleInstance[];
  projects: Map<string, ProjectRow>;
  habits: Map<string, HabitRow>;
  goals: Map<string, GoalRow>;
  skillIdToMonumentId: Map<string, string>;
  skillIdToIcon: Map<string, string>;
  monumentIdToEmoji: Map<string, string>;
}): MatrixEvent[] {
  return instances.flatMap((instance) => {
    if (instance.source_type === "PROJECT") {
      const project = projects.get(instance.source_id);
      const goal = project?.goal_id ? goals.get(project.goal_id) : null;
      const monumentId = goal?.monument_id ?? null;
      const projectGoal = project
        ? buildProjectGoal({
            project,
            goal,
            skillIdToIcon,
            monumentIdToEmoji,
          })
        : null;
      return [
        {
          instance,
          title: instance.event_name ?? project?.name ?? "Untitled project",
          monumentId,
          glyph: monumentId
            ? (monumentIdToEmoji.get(monumentId) ?? "◇")
            : "◇",
          goal: projectGoal,
          habit: null,
        },
      ];
    }

    if (instance.source_type !== "HABIT") return [];

    const habit = habits.get(instance.source_id);
    const habitGlyph =
      habit?.skill_id ? skillIdToIcon.get(habit.skill_id) : null;
    return [
      {
        instance,
        title: instance.event_name ?? habit?.name ?? "Untitled habit",
        monumentId: resolveHabitMonumentId({
          habit,
          goals,
          skillIdToMonumentId,
        }),
        glyph: habitGlyph ?? getHabitFallbackGlyph(habit?.habit_type),
        goal: null,
        habit: habit
          ? {
              ...habit,
              monumentId: resolveHabitMonumentId({
                habit,
                goals,
                skillIdToMonumentId,
              }),
              glyph: habitGlyph ?? getHabitFallbackGlyph(habit.habit_type),
            }
          : null,
      },
    ];
  });
}

function groupByMonument<T extends { monumentId: string | null }>({
  items,
  monuments,
}: {
  items: T[];
  monuments: Monument[];
}): MonumentGroup<T>[] {
  const monumentLookup = new Map(
    monuments.map((monument) => [monument.id, monument])
  );
  const groupLookup = new Map<string, MonumentGroup<T>>();

  for (const item of items) {
    const monument = item.monumentId ? monumentLookup.get(item.monumentId) : null;
    const key = monument?.id ?? UNLINKED_GROUP_KEY;
    const existing = groupLookup.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groupLookup.set(key, {
      key,
      title: monument?.title ?? "Unlinked",
      emoji: monument?.emoji ?? null,
      items: [item],
    });
  }

  return Array.from(groupLookup.values()).sort((a, b) => {
    if (a.key === UNLINKED_GROUP_KEY) return 1;
    if (b.key === UNLINKED_GROUP_KEY) return -1;
    return a.title.localeCompare(b.title);
  });
}

function mergeMatrixMonumentGroups({
  scheduledGroups,
  unscheduledDueHabitGroups,
}: {
  scheduledGroups: MonumentGroup<MatrixEvent>[];
  unscheduledDueHabitGroups: MonumentGroup<MatrixHabit>[];
}): MatrixMonumentGroup[] {
  const groupLookup = new Map<string, MatrixMonumentGroup>();

  for (const group of scheduledGroups) {
    groupLookup.set(group.key, {
      key: group.key,
      title: group.title,
      emoji: group.emoji,
      scheduledItems: group.items,
      unscheduledDueHabits: [],
    });
  }

  for (const group of unscheduledDueHabitGroups) {
    const existing = groupLookup.get(group.key);
    if (existing) {
      existing.unscheduledDueHabits = group.items;
      continue;
    }

    groupLookup.set(group.key, {
      key: group.key,
      title: group.title,
      emoji: group.emoji,
      scheduledItems: [],
      unscheduledDueHabits: group.items,
    });
  }

  return Array.from(groupLookup.values()).sort((a, b) => {
    if (a.key === UNLINKED_GROUP_KEY) return 1;
    if (b.key === UNLINKED_GROUP_KEY) return -1;
    return a.title.localeCompare(b.title);
  });
}

function MatrixCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] shadow-[0_24px_60px_-45px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.035)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function MatrixHabitCard({
  glyph,
  title,
  pill,
  habitType,
  due,
  status,
}: {
  glyph: string;
  title: string;
  pill: string;
  habitType: string | null | undefined;
  due: boolean;
  status?: string | null;
}) {
  const pillClass = due
    ? "border-rose-200/20 bg-rose-950/35 text-rose-100/85"
    : "border-white/10 bg-white/[0.06] text-white/65";

  return (
    <div
      className={cn(
        MATRIX_LIBRARY_CARD_CLASS,
        getHabitCardTypeClass(habitType),
        getHabitCardBorderClass(habitType),
        due ? "related-habit-due-border" : null
      )}
    >
      {status ? (
        <span className="pointer-events-none absolute right-2.5 top-2.5 max-w-[58%] truncate rounded-full border border-white/8 bg-black/20 px-1.5 py-[3px] text-[7px] font-semibold uppercase leading-none tracking-[0.06em] text-white/42">
          {status}
        </span>
      ) : null}
      <div className="relative z-[2] flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 text-center">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.055] text-xs font-semibold leading-none text-white/82 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)] sm:h-7 sm:w-7">
          {glyph}
        </span>
        <div className="flex min-h-0 w-full min-w-0 items-center justify-center">
          <span
            className="line-clamp-3 w-full min-w-0 break-words px-0.5 text-center text-[9px] font-semibold leading-[1.05] text-white/92 whitespace-normal sm:text-[10px]"
            style={{ hyphens: "auto" }}
          >
            {title}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-center">
          <span
            className={cn(
              "w-fit max-w-none whitespace-nowrap rounded-full border px-2 py-[3px] text-[8px] font-semibold uppercase leading-none tracking-[0.06em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
              pillClass
            )}
          >
            {pill}
          </span>
        </div>
      </div>
    </div>
  );
}

function ScheduledEventCard({
  event,
  timeZone,
  open,
  onOpenChange,
}: {
  event: MatrixEvent;
  timeZone: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const cleanStatus =
    event.instance.status && event.instance.status !== "scheduled"
      ? event.instance.status.replaceAll("_", " ")
      : null;

  if (event.goal) {
    return (
      <GoalCard
        goal={event.goal}
        showWeight={false}
        showCreatedAt={false}
        showEmojiPrefix={false}
        variant="compact"
        completionTheme="border"
        projectDropdownMode="tasks-only"
        open={open}
        onOpenChange={onOpenChange}
      />
    );
  }

  if (!event.habit) return null;

  return (
    <MatrixHabitCard
      glyph={event.glyph}
      title={event.title}
      pill="DUE"
      habitType={event.habit.habit_type}
      due={false}
      status={cleanStatus}
    />
  );
}

function DueHabitCard({ habit }: { habit: MatrixHabit }) {
  const dueLabel = habit.duration_minutes ? "DUE" : "DUE TODAY";

  return (
    <MatrixHabitCard
      glyph={habit.glyph}
      title={habit.name}
      pill={dueLabel}
      habitType={habit.habit_type}
      due
    />
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-[96px] items-center rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3">
      <p className="text-sm text-white/50">{label}</p>
    </div>
  );
}

function MatrixMonumentCarousel({
  group,
  timeZone,
}: {
  group: MatrixMonumentGroup;
  timeZone: string;
}) {
  const [matrixPanel, setMatrixPanel] = useState<MatrixPanel>("scheduled");
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [matrixPanelHeight, setMatrixPanelHeight] = useState<number | null>(
    null
  );
  const [matrixPanelDragOffset, setMatrixPanelDragOffset] = useState(0);
  const [matrixPanelViewportWidth, setMatrixPanelViewportWidth] = useState(0);
  const [matrixPanelTransitionEnabled, setMatrixPanelTransitionEnabled] =
    useState(false);
  const matrixPanelViewportRef = useRef<HTMLDivElement | null>(null);
  const scheduledPanelRef = useRef<HTMLDivElement | null>(null);
  const unscheduledPanelRef = useRef<HTMLDivElement | null>(null);
  const matrixPanelWheelLockedRef = useRef(false);
  const matrixPanelWheelCooldownRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const matrixPanelDragStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const matrixPanelTouchRef = useRef<{
    startX: number;
    startY: number;
    deltaX: number;
    deltaY: number;
    axis: MatrixPanelSwipeAxis;
    width: number;
  } | null>(null);
  const activeMatrixPanelIndex = matrixPanel === "unscheduled" ? 1 : 0;
  const matrixPanelBaseTransform =
    matrixPanelViewportWidth > 0
      ? -activeMatrixPanelIndex * matrixPanelViewportWidth
      : 0;
  const matrixPanelTrackTransform = Math.max(
    -matrixPanelViewportWidth,
    Math.min(0, matrixPanelBaseTransform + matrixPanelDragOffset)
  );
  const activeMatrixPanelCount =
    matrixPanel === "scheduled"
      ? group.scheduledItems.length
      : group.unscheduledDueHabits.length;

  const getMatrixPanelElement = useCallback((panel: MatrixPanel) => {
    return panel === "unscheduled"
      ? unscheduledPanelRef.current
      : scheduledPanelRef.current;
  }, []);

  const getMatrixPanelHeight = useCallback(
    (panel: MatrixPanel) => {
      const panelElement = getMatrixPanelElement(panel);
      return panelElement ? Math.ceil(panelElement.scrollHeight) : null;
    },
    [getMatrixPanelElement]
  );

  const handleMatrixPanelChange = useCallback(
    (panel: MatrixPanel) => {
      const nextHeight = getMatrixPanelHeight(panel);
      if (nextHeight) {
        setMatrixPanelHeight(nextHeight);
      }
      setMatrixPanelDragOffset(0);
      setMatrixPanel(panel);
    },
    [getMatrixPanelHeight]
  );

  const measureActiveMatrixPanel = useCallback(() => {
    const nextHeight = getMatrixPanelHeight(matrixPanel);
    if (!nextHeight) return;

    setMatrixPanelHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight
    );
  }, [getMatrixPanelHeight, matrixPanel]);

  useLayoutEffect(() => {
    const viewportElement = matrixPanelViewportRef.current;
    if (!viewportElement) return;

    const measureViewportWidth = () => {
      setMatrixPanelViewportWidth(viewportElement.clientWidth);
    };

    measureViewportWidth();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureViewportWidth);
    resizeObserver?.observe(viewportElement);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", measureViewportWidth);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureViewportWidth);
    };
  }, []);

  useEffect(() => {
    setMatrixPanelDragOffset(0);
    setMatrixPanelTransitionEnabled(true);
  }, []);

  useLayoutEffect(() => {
    measureActiveMatrixPanel();
  }, [
    group.scheduledItems,
    group.unscheduledDueHabits,
    measureActiveMatrixPanel,
    openGoalId,
  ]);

  useEffect(() => {
    const activePanel =
      matrixPanel === "unscheduled"
        ? unscheduledPanelRef.current
        : scheduledPanelRef.current;

    if (!activePanel) return;

    measureActiveMatrixPanel();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            measureActiveMatrixPanel();
          });
    resizeObserver?.observe(activePanel);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", measureActiveMatrixPanel);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureActiveMatrixPanel);
    };
  }, [matrixPanel, measureActiveMatrixPanel]);

  useEffect(() => {
    return () => {
      if (matrixPanelWheelCooldownRef.current) {
        clearTimeout(matrixPanelWheelCooldownRef.current);
      }
    };
  }, []);

  const handleMatrixPanelPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "pen" && event.pointerType !== "mouse") {
        return;
      }
      matrixPanelDragStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
    },
    []
  );

  const handleMatrixPanelPointerEnd = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = matrixPanelDragStartRef.current;
      if (!start || start.pointerId !== event.pointerId) return;
      matrixPanelDragStartRef.current = null;

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const horizontalDistance = Math.abs(deltaX);

      if (
        horizontalDistance < 48 ||
        horizontalDistance < Math.abs(deltaY) * 1.35
      ) {
        return;
      }

      handleMatrixPanelChange(deltaX < 0 ? "unscheduled" : "scheduled");
    },
    [handleMatrixPanelChange]
  );

  const resetMatrixPanelTouch = useCallback(() => {
    matrixPanelTouchRef.current = null;
    setMatrixPanelDragOffset(0);
  }, []);

  const handleMatrixPanelTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (event.touches.length !== 1) {
        resetMatrixPanelTouch();
        return;
      }

      const touch = event.touches[0];
      matrixPanelTouchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        deltaX: 0,
        deltaY: 0,
        axis: null,
        width: event.currentTarget.clientWidth,
      };
      setMatrixPanelDragOffset(0);
    },
    [resetMatrixPanelTouch]
  );

  const handleMatrixPanelTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const gesture = matrixPanelTouchRef.current;
      if (!gesture || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      gesture.deltaX = deltaX;
      gesture.deltaY = deltaY;

      if (!gesture.axis) {
        if (absX > 12 && absX > absY * 1.15) {
          gesture.axis = "horizontal";
        } else if (absY > 12 && absY > absX * 1.15) {
          gesture.axis = "vertical";
        } else {
          return;
        }
      }

      if (gesture.axis !== "horizontal") return;

      if (event.cancelable) {
        event.preventDefault();
      }

      const width = gesture.width || event.currentTarget.clientWidth || 1;
      const baseTransform = -activeMatrixPanelIndex * width;
      const nextTransform = Math.max(
        -width,
        Math.min(0, baseTransform + deltaX)
      );
      setMatrixPanelDragOffset(nextTransform - baseTransform);
    },
    [activeMatrixPanelIndex]
  );

  const handleMatrixPanelTouchEnd = useCallback(() => {
    const gesture = matrixPanelTouchRef.current;
    if (!gesture) return;

    matrixPanelTouchRef.current = null;
    setMatrixPanelDragOffset(0);

    if (gesture.axis !== "horizontal") return;

    const horizontalDistance = Math.abs(gesture.deltaX);
    const releaseThreshold = Math.min(45, Math.max(28, gesture.width * 0.2));
    if (
      horizontalDistance < releaseThreshold ||
      horizontalDistance < Math.abs(gesture.deltaY) * 1.15
    ) {
      return;
    }

    if (matrixPanel === "scheduled" && gesture.deltaX < -releaseThreshold) {
      handleMatrixPanelChange("unscheduled");
      return;
    }

    if (matrixPanel === "unscheduled" && gesture.deltaX > releaseThreshold) {
      handleMatrixPanelChange("scheduled");
    }
  }, [handleMatrixPanelChange, matrixPanel]);

  const handleMatrixPanelWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const horizontalDistance = Math.abs(event.deltaX);
      if (
        horizontalDistance < 28 ||
        horizontalDistance <= Math.abs(event.deltaY)
      ) {
        return;
      }

      const nextPanel = event.deltaX < 0 ? "unscheduled" : "scheduled";
      if (nextPanel === matrixPanel || matrixPanelWheelLockedRef.current) {
        return;
      }

      event.preventDefault();
      matrixPanelWheelLockedRef.current = true;
      handleMatrixPanelChange(nextPanel);

      if (matrixPanelWheelCooldownRef.current) {
        clearTimeout(matrixPanelWheelCooldownRef.current);
      }
      matrixPanelWheelCooldownRef.current = setTimeout(() => {
        matrixPanelWheelLockedRef.current = false;
        matrixPanelWheelCooldownRef.current = null;
      }, 650);
    },
    [handleMatrixPanelChange, matrixPanel]
  );

  return (
    <MatrixCard className="p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-0 sm:px-1">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.055] text-base">
            {group.emoji ?? "◇"}
          </span>
          <h3 className="truncate text-[13px] font-semibold text-white/88">
            {group.title}
          </h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[10px] font-semibold leading-none text-white/70">
          {activeMatrixPanelCount}
        </span>
      </div>
      <div
        className="relative w-full overflow-hidden touch-pan-y transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={matrixPanelHeight ? { height: matrixPanelHeight } : undefined}
        onPointerDown={handleMatrixPanelPointerDown}
        onPointerUp={handleMatrixPanelPointerEnd}
        onTouchStart={handleMatrixPanelTouchStart}
        onTouchMove={handleMatrixPanelTouchMove}
        onTouchEnd={handleMatrixPanelTouchEnd}
        onTouchCancel={resetMatrixPanelTouch}
        onWheel={handleMatrixPanelWheel}
        onPointerCancel={() => {
          matrixPanelDragStartRef.current = null;
        }}
      >
        <div ref={matrixPanelViewportRef} className="absolute inset-0">
          <div
            className="flex h-full w-[200%] transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              transform: `translate3d(${matrixPanelTrackTransform}px, 0, 0)`,
              transitionDuration:
                !matrixPanelTransitionEnabled || matrixPanelDragOffset
                  ? "0ms"
                  : undefined,
            }}
          >
            <div className="h-full w-1/2 shrink-0 overflow-hidden">
              <div ref={scheduledPanelRef}>
                {group.scheduledItems.length ? (
                  <div className={MATRIX_LIBRARY_GRID_CLASS}>
                    {group.scheduledItems.map((event) => (
                      <ScheduledEventCard
                        key={event.instance.id}
                        event={event}
                        timeZone={timeZone}
                        open={
                          Boolean(event.goal?.id) &&
                          openGoalId === event.goal?.id
                        }
                        onOpenChange={(nextOpen) =>
                          setOpenGoalId(
                            nextOpen && event.goal?.id ? event.goal.id : null
                          )
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyPanel label="No scheduled Events for this Monument." />
                )}
              </div>
            </div>
            <div className="h-full w-1/2 shrink-0 overflow-hidden">
              <div ref={unscheduledPanelRef}>
                {group.unscheduledDueHabits.length ? (
                  <div className={MATRIX_LIBRARY_GRID_CLASS}>
                    {group.unscheduledDueHabits.map((habit) => (
                      <DueHabitCard key={habit.id} habit={habit} />
                    ))}
                  </div>
                ) : (
                  <EmptyPanel label="No unscheduled due habits for this Monument." />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {(["scheduled", "unscheduled"] as const).map((panel) => {
          const isActive = matrixPanel === panel;
          return (
            <button
              key={panel}
              type="button"
              aria-label={
                panel === "scheduled"
                  ? "Show scheduled Events"
                  : "Show unscheduled due habits"
              }
              aria-current={isActive ? "true" : undefined}
              onClick={() => handleMatrixPanelChange(panel)}
              className={`h-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isActive
                  ? "w-4 bg-white/85"
                  : "w-1 bg-white/28 hover:bg-white/45"
              }`}
            />
          );
        })}
      </div>
    </MatrixCard>
  );
}

function MatrixContent() {
  const { user } = useAuth();
  const { localTimeZone } = useProfile();
  const timeZone = useMemo(
    () => normalizeTimeZone(localTimeZone ?? getBrowserTimeZone()),
    [localTimeZone]
  );
  const [state, setState] = useState<MatrixState>(initialState);

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;
    let cancelled = false;

    async function loadMatrix() {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setState({
          ...initialState,
          loading: false,
          error: "Supabase client is not available.",
        });
        return;
      }

      const today = new Date();
      const dayStart = startOfDayInTimeZone(today, timeZone);
      const dayEnd = addDaysInTimeZone(dayStart, 1, timeZone);

      try {
        setState((current) => ({ ...current, loading: true, error: null }));

        const { data: instanceData, error: instanceError } = await supabase
          .from("schedule_instances")
          .select(
            "id, source_id, source_type, start_utc, end_utc, status, weight_snapshot, event_name"
          )
          .eq("user_id", userId)
          .in("source_type", ["PROJECT", "HABIT"])
          .in("status", ["scheduled", "in_progress"])
          .lt("start_utc", dayEnd.toISOString())
          .gt("end_utc", dayStart.toISOString())
          .order("start_utc", { ascending: true });

        if (instanceError) throw instanceError;

        const instances = (instanceData ?? []) as ScheduleInstance[];
        const projectIds = instances
          .filter((item) => item.source_type === "PROJECT")
          .map((item) => item.source_id);
        const scheduledHabitIds = new Set(
          instances
            .filter((item) => item.source_type === "HABIT")
            .map((item) => item.source_id)
        );

        const monumentsPromise = getMonumentsForUser(userId).catch((error) => {
          console.error("Failed to load Matrix monuments", error);
          return [] as Monument[];
        });

        const [
          habitResult,
          allHabitsResult,
          goalResult,
          skillResult,
          monuments,
        ] =
          await Promise.all([
            scheduledHabitIds.size
              ? supabase
                  .from("habits")
                  .select(
                    "id, name, created_at, updated_at, last_completed_at, current_streak_days, longest_streak_days, habit_type, duration_minutes, energy, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, skill_id, goal_id, completion_target, location_context_id, daylight_preference, window_edge_preference, next_due_override"
                  )
                  .eq("user_id", userId)
                  .in("id", Array.from(scheduledHabitIds))
              : Promise.resolve({ data: [], error: null }),
            supabase
              .from("habits")
              .select(
                "id, name, created_at, updated_at, last_completed_at, current_streak_days, longest_streak_days, habit_type, duration_minutes, energy, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, skill_id, goal_id, completion_target, location_context_id, daylight_preference, window_edge_preference, next_due_override"
              )
              .eq("user_id", userId),
            supabase
              .from("goals")
              .select("id, name, monument_id")
              .eq("user_id", userId),
            supabase
              .from("skills")
              .select("id, monument_id, icon")
              .eq("user_id", userId),
            monumentsPromise,
          ]);

        if (habitResult.error) throw habitResult.error;
        if (allHabitsResult.error) throw allHabitsResult.error;
        if (goalResult.error) throw goalResult.error;
        if (skillResult.error) throw skillResult.error;

        const allProjectIds = Array.from(new Set(projectIds));

        const projectResult = allProjectIds.length
          ? await supabase
              .from("projects")
              .select(
                `
                  id, name, goal_id, stage, completed_at, duration_min, created_at, due_date,
                  priority,
                  energy,
                  tasks (
                    id, project_id, stage, name, skill_id, priority
                  ),
                  project_skills (
                    skill_id
                  )
                `
              )
              .eq("user_id", userId)
              .in("id", allProjectIds)
          : { data: [], error: null };

        if (projectResult.error) throw projectResult.error;

        const skillIdToMonumentId = new Map<string, string>();
        const skillIdToIcon = new Map<string, string>();
        for (const skill of (skillResult.data ?? []) as SkillRow[]) {
          if (skill.id && skill.monument_id) {
            skillIdToMonumentId.set(skill.id, skill.monument_id);
          }
          if (skill.id && skill.icon) {
            skillIdToIcon.set(skill.id, skill.icon);
          }
        }
        const monumentIdToEmoji = new Map(
          monuments
            .filter((monument) => monument.emoji)
            .map((monument) => [monument.id, monument.emoji as string])
        );

        const projectMap = new Map(
          ((projectResult.data ?? []) as ProjectRow[]).map((project) => [
            project.id,
            project,
          ])
        );
        const habitMap = new Map(
          ((habitResult.data ?? []) as HabitRow[]).map((habit) => [
            habit.id,
            habit,
          ])
        );
        const goalMap = new Map(
          ((goalResult.data ?? []) as GoalRow[]).map((goal) => [goal.id, goal])
        );

        const events = buildMatrixEvents({
          instances,
          projects: projectMap,
          habits: habitMap,
          goals: goalMap,
          skillIdToMonumentId,
          skillIdToIcon,
          monumentIdToEmoji,
        });
        const unscheduledDueHabits = ((allHabitsResult.data ?? []) as HabitRow[])
          .filter((habit) => !scheduledHabitIds.has(habit.id))
          .filter((habit) => isHabitDueToday(habit, today, timeZone))
          .map((habit) => ({
            ...habit,
            monumentId: resolveHabitMonumentId({
              habit,
              goals: goalMap,
              skillIdToMonumentId,
            }),
            glyph: habit.skill_id
              ? (skillIdToIcon.get(habit.skill_id) ??
                getHabitFallbackGlyph(habit.habit_type))
              : getHabitFallbackGlyph(habit.habit_type),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            eventGroups: groupByMonument({ items: events, monuments }),
            unscheduledDueHabitGroups: groupByMonument({
              items: unscheduledDueHabits,
              monuments,
            }),
            dayLabel: formatDayLabel(today, timeZone),
          });
        }
      } catch (error) {
        console.error("Failed to load Matrix", error);
        if (!cancelled) {
          setState({
            ...initialState,
            loading: false,
            error:
                error instanceof Error
                  ? error.message
                  : typeof error === "object" && error !== null && "message" in error
                    ? String((error as { message?: unknown }).message)
                    : "Failed to load Matrix.",
          });
        }
      }
    }

    loadMatrix();

    return () => {
      cancelled = true;
    };
  }, [timeZone, user?.id]);

  const todayKey = useMemo(
    () => formatDateKeyInTimeZone(new Date(), timeZone),
    [timeZone]
  );
  const matrixMonumentGroups = useMemo(
    () =>
      mergeMatrixMonumentGroups({
        scheduledGroups: state.eventGroups,
        unscheduledDueHabitGroups: state.unscheduledDueHabitGroups,
      }),
    [state.eventGroups, state.unscheduledDueHabitGroups]
  );

  return (
    <main className="min-h-screen bg-[#030406] px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-[calc(1rem+env(safe-area-inset-top,0px))] text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(145deg,#06070A_0%,#08090B_56%,#0D0E11_100%)] p-5 shadow-[0_35px_120px_-45px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/55">
                <Grid2X2 className="h-4 w-4" aria-hidden="true" />
                CREATOR
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Matrix
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                Today&apos;s scheduled Events and due habits, separated for a focused view.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-semibold text-white/70">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {state.dayLabel || todayKey}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-semibold text-white/70">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {timeZone}
              </span>
            </div>
          </div>
        </section>

        {state.error ? (
          <MatrixCard className="p-4">
            <p className="text-sm text-red-200">{state.error}</p>
          </MatrixCard>
        ) : null}

        <section>
          {state.loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <MatrixCard key={index} className="p-3 sm:p-4">
                  <div className="mb-3 flex items-center gap-3 px-0 sm:px-1">
                    <div className="h-8 w-8 rounded-xl bg-white/[0.055]" />
                    <div className="h-4 w-36 rounded-lg bg-white/[0.055]" />
                  </div>
                  <div className={MATRIX_LIBRARY_GRID_CLASS}>
                    <div className="aspect-[5/6] min-h-[96px] rounded-2xl bg-white/[0.055]" />
                    <div className="aspect-[5/6] min-h-[96px] rounded-2xl bg-white/[0.055]" />
                    <div className="aspect-[5/6] min-h-[96px] rounded-2xl bg-white/[0.055]" />
                  </div>
                </MatrixCard>
              ))}
            </div>
          ) : matrixMonumentGroups.length ? (
            <div className="space-y-3">
              {matrixMonumentGroups.map((group) => (
                <MatrixMonumentCarousel
                  key={group.key}
                  group={group}
                  timeZone={timeZone}
                />
              ))}
            </div>
          ) : (
            <MatrixCard className="p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <EmptyPanel label="No scheduled Events found for today." />
                <EmptyPanel label="No due habits are waiting outside scheduled Events." />
              </div>
            </MatrixCard>
          )}
        </section>
      </div>
    </main>
  );
}

export default function MatrixPage() {
  return (
    <ProtectedRoute>
      <MatrixContent />
    </ProtectedRoute>
  );
}
