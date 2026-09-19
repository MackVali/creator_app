import { makeDateInTimeZone } from "@/lib/scheduler/timezone";
import {
  resolveCreatorDay,
  resolveCreatorDayForDate,
  type CreatorDay,
} from "@/lib/creatorDay";
import { fetchInstancesForRange, type ScheduleInstance } from "@/lib/scheduler/instanceRepo";
import { fetchHabitsForSchedule, type HabitScheduleItem } from "@/lib/scheduler/habits";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import type { IlavCheckInType } from "@/lib/ai/ilavCheckInSchedule";
import { getAreaById } from "@/config/areas";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type CheckInClient = SupabaseClient<Database>;

export type IlavCheckInItem = {
  id: string;
  scheduleInstanceId: string;
  title: string;
  sourceType: string | null;
  sourceId: string | null;
  itemType: "scheduled_instance";
  representsDueHabit: false;
  isCompleted: boolean;
  canComplete: boolean;
  startUtc: string | null;
  endUtc: string | null;
  startLabel: string | null;
  endLabel: string | null;
  timeRange: string | null;
  status: string | null;
  completedAt: string | null;
  glyph: string | null;
};

export type IlavCheckInHabit = {
  id: string;
  sourceType: "HABIT";
  sourceId: string;
  scheduleInstanceId: string | null;
  itemType: "due_habit";
  representsDueHabit: true;
  isCompleted: boolean;
  canComplete: boolean;
  title: string;
  habitType: string | null;
  skillId: string | null;
  goalId: string | null;
  glyph: string | null;
};

export type IlavCheckIn = {
  type: IlavCheckInType;
  creatorDayDate: string;
  generatedAt: string;
  timeZone: string;
  scheduled: IlavCheckInItem[];
  completed: IlavCheckInItem[];
  missed: IlavCheckInItem[];
  upcoming: IlavCheckInItem[];
  dueUnscheduledHabits: IlavCheckInHabit[];
  counts: {
    scheduled: number;
    completed: number;
    missed: number;
    upcoming: number;
    dueUnscheduledHabits: number;
  };
};

export type BuildIlavCheckInPayloadArgs = {
  type: IlavCheckInType;
  creatorDay: Pick<CreatorDay, "creatorDayDate" | "startsAt" | "endsAt">;
  timeZone: string;
  generatedAt: Date;
  instances: ScheduleInstance[];
  habits: HabitScheduleItem[];
  completedHabitIds: Set<string>;
  displayGlyphs?: {
    scheduleInstanceGlyphById: Map<string, string>;
    habitGlyphById: Map<string, string>;
  };
};

function parseDayKey(dayKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) throw new Error("Invalid Creator-day date.");
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function isCanceledStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  return normalized === "canceled" || normalized === "cancelled";
}

function isCompletedInstance(instance: ScheduleInstance) {
  return instance.status === "completed" || Boolean(instance.completed_at);
}

function isMissedOrElapsed(instance: ScheduleInstance, nowMs: number) {
  if (isCompletedInstance(instance)) return false;
  if (isCanceledStatus(instance.status)) return false;
  if (instance.status === "missed") return true;
  const endMs = instance.end_utc ? Date.parse(instance.end_utc) : Number.NaN;
  return Number.isFinite(endMs) && endMs <= nowMs;
}

function isUpcomingInstance(instance: ScheduleInstance, nowMs: number) {
  if (isCompletedInstance(instance)) return false;
  if (isCanceledStatus(instance.status)) return false;
  const endMs = instance.end_utc ? Date.parse(instance.end_utc) : Number.NaN;
  return Number.isFinite(endMs) && endMs > nowMs;
}

function isSameInstant(left: string | null | undefined, right: string) {
  if (!left) return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function isDaySpanHabitInstance(
  instance: ScheduleInstance,
  creatorDay: Pick<CreatorDay, "startsAt" | "endsAt">
) {
  return (
    instance.source_type === "HABIT" &&
    isSameInstant(instance.start_utc, creatorDay.startsAt) &&
    isSameInstant(instance.end_utc, creatorDay.endsAt)
  );
}

function isPracticeHabit(habit: Pick<HabitScheduleItem, "habitType"> | null | undefined) {
  return habit?.habitType?.trim().toUpperCase() === "PRACTICE";
}

function formatLocalTime(iso: string | null, timeZone: string) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function instanceTitle(instance: ScheduleInstance) {
  const projectName =
    (instance as { project_name?: string | null }).project_name?.trim() ?? "";
  return (
    instance.event_name?.trim() ||
    projectName ||
    instance.source_type?.trim() ||
    "Scheduled item"
  );
}

function mapInstance(
  instance: ScheduleInstance,
  timeZone: string,
  glyph: string | null = null
): IlavCheckInItem {
  const startLabel = formatLocalTime(instance.start_utc, timeZone);
  const endLabel = formatLocalTime(instance.end_utc, timeZone);
  return {
    id: instance.id,
    scheduleInstanceId: instance.id,
    title: instanceTitle(instance),
    sourceType: instance.source_type ?? null,
    sourceId: instance.source_id ?? null,
    itemType: "scheduled_instance",
    representsDueHabit: false,
    isCompleted: isCompletedInstance(instance),
    canComplete: !isCompletedInstance(instance) && !isCanceledStatus(instance.status),
    startUtc: instance.start_utc ?? null,
    endUtc: instance.end_utc ?? null,
    startLabel,
    endLabel,
    timeRange: startLabel && endLabel ? `${startLabel} - ${endLabel}` : startLabel,
    status: instance.status ?? null,
    completedAt: instance.completed_at ?? null,
    glyph,
  };
}

function sortInstances(a: ScheduleInstance, b: ScheduleInstance) {
  const aStart = a.start_utc ? Date.parse(a.start_utc) : Number.POSITIVE_INFINITY;
  const bStart = b.start_utc ? Date.parse(b.start_utc) : Number.POSITIVE_INFINITY;
  return aStart - bStart;
}

function dueDateForCreatorDay(creatorDayDate: string, timeZone: string) {
  return makeDateInTimeZone(
    { ...parseDayKey(creatorDayDate), hour: 12, minute: 0 },
    timeZone
  );
}

export function buildIlavCheckInPayload({
  type,
  creatorDay,
  timeZone,
  generatedAt,
  instances,
  habits,
  completedHabitIds,
  displayGlyphs,
}: BuildIlavCheckInPayloadArgs): IlavCheckIn {
  const nowMs = generatedAt.getTime();
  const visibleInstances = instances
    .filter((instance) => !isCanceledStatus(instance.status))
    .sort(sortInstances);
  const daySpanHabitInstances = visibleInstances.filter((instance) =>
    isDaySpanHabitInstance(instance, creatorDay)
  );
  const visibleTimedInstances = visibleInstances.filter(
    (instance) => !isDaySpanHabitInstance(instance, creatorDay)
  );
  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const scheduledHabitIds = new Set(
    visibleTimedInstances
      .filter((instance) => instance.source_type === "HABIT")
      .map((instance) => instance.source_id)
      .filter((id): id is string => Boolean(id))
  );
  const dueDate = dueDateForCreatorDay(creatorDay.creatorDayDate, timeZone);

  const dueUnscheduledHabitsById = new Map<string, IlavCheckInHabit>();
  const addDueHabit = (habit: HabitScheduleItem) => {
    if (isPracticeHabit(habit)) return;
    if (completedHabitIds.has(habit.id)) return;
    dueUnscheduledHabitsById.set(habit.id, {
      id: habit.id,
      sourceType: "HABIT",
      sourceId: habit.id,
      scheduleInstanceId: null,
      itemType: "due_habit",
      representsDueHabit: true,
      isCompleted: false,
      canComplete: true,
      title: habit.name,
      habitType: habit.habitType ?? null,
      skillId: habit.skillId ?? null,
      goalId: habit.goalId ?? null,
      glyph: displayGlyphs?.habitGlyphById.get(habit.id) ?? null,
    });
  };

  habits
    .filter((habit) => {
      const evaluation = evaluateHabitDueOnDate({
        habit,
        date: dueDate,
        timeZone,
        windowDays: habit.window?.days ?? null,
        nextDueOverride: habit.nextDueOverride
          ? new Date(habit.nextDueOverride)
          : null,
      });
      return (
        evaluation.isDue &&
        !completedHabitIds.has(habit.id) &&
        !scheduledHabitIds.has(habit.id) &&
        !isPracticeHabit(habit)
      );
    })
    .forEach(addDueHabit);

  for (const instance of daySpanHabitInstances) {
    const sourceId = instance.source_id?.trim();
    if (!sourceId || completedHabitIds.has(sourceId)) continue;
    const habit = habitById.get(sourceId);
    if (isPracticeHabit(habit)) continue;
    dueUnscheduledHabitsById.set(sourceId, {
      id: sourceId,
      sourceType: "HABIT",
      sourceId,
      scheduleInstanceId: instance.id,
      itemType: "due_habit",
      representsDueHabit: true,
      isCompleted: false,
      canComplete: true,
      title: habit?.name ?? instanceTitle(instance),
      habitType: habit?.habitType ?? null,
      skillId: habit?.skillId ?? null,
      goalId: habit?.goalId ?? null,
      glyph: displayGlyphs?.habitGlyphById.get(sourceId) ?? null,
    });
  }

  const dueUnscheduledHabits = Array.from(dueUnscheduledHabitsById.values());
  const completed = visibleTimedInstances.filter(isCompletedInstance);
  const missed = visibleTimedInstances.filter((instance) =>
    isMissedOrElapsed(instance, nowMs)
  );
  const upcoming = visibleTimedInstances.filter((instance) =>
    isUpcomingInstance(instance, nowMs)
  );

  return {
    type,
    creatorDayDate: creatorDay.creatorDayDate,
    generatedAt: generatedAt.toISOString(),
    timeZone,
    scheduled: visibleTimedInstances.map((instance) =>
      mapInstance(
        instance,
        timeZone,
        displayGlyphs?.scheduleInstanceGlyphById.get(instance.id) ?? null
      )
    ),
    completed: completed.map((instance) =>
      mapInstance(
        instance,
        timeZone,
        displayGlyphs?.scheduleInstanceGlyphById.get(instance.id) ?? null
      )
    ),
    missed: missed.map((instance) =>
      mapInstance(
        instance,
        timeZone,
        displayGlyphs?.scheduleInstanceGlyphById.get(instance.id) ?? null
      )
    ),
    upcoming: upcoming.map((instance) =>
      mapInstance(
        instance,
        timeZone,
        displayGlyphs?.scheduleInstanceGlyphById.get(instance.id) ?? null
      )
    ),
    dueUnscheduledHabits,
    counts: {
      scheduled: visibleTimedInstances.length,
      completed: completed.length,
      missed: missed.length,
      upcoming: upcoming.length,
      dueUnscheduledHabits: dueUnscheduledHabits.length,
    },
  };
}

async function fetchCompletedHabitIdsForCreatorDay({
  supabase,
  userId,
  creatorDayDate,
}: {
  supabase: CheckInClient;
  userId: string;
  creatorDayDate: string;
}) {
  const { data, error } = await (supabase as unknown as {
    from: (table: "habit_completion_days") => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string
        ) => {
          eq: (
            column: string,
            value: string
          ) => {
            limit: (count: number) => Promise<{
              data: Array<{ habit_id: string | null }> | null;
              error: unknown;
            }>;
          };
        };
      };
    };
  })
    .from("habit_completion_days")
    .select("habit_id")
    .eq("user_id", userId)
    .eq("completion_day", creatorDayDate)
    .limit(500);

  if (error) throw error;

  return new Set(
    (data ?? [])
      .map((row) => row.habit_id)
      .filter((id): id is string => Boolean(id))
  );
}


type IlavDisplaySkillRow = {
  id: string;
  icon: string | null;
  monument_id: string | null;
};

type IlavDisplayMonumentRow = {
  id: string;
  emoji: string | null;
  area_id: string | null;
};

type IlavDisplayTaskRow = {
  id: string;
  skill_id: string | null;
  project_id: string | null;
  goal_id: string | null;
};

type IlavDisplayProjectRow = {
  id: string;
  goal_id: string | null;
};

type IlavDisplayGoalRow = {
  id: string;
  monument_id: string | null;
  area_id: string | null;
};

function cleanGlyph(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getInstanceMetadataGlyph(instance: ScheduleInstance) {
  const metadata = readMetadataRecord(instance.metadata);
  if (!metadata) return null;

  return (
    cleanGlyph(metadata.skillIcon) ??
    cleanGlyph(metadata.skill_icon) ??
    cleanGlyph(metadata.icon) ??
    cleanGlyph(metadata.emoji) ??
    null
  );
}

async function resolveIlavDisplayGlyphs({
  supabase,
  userId,
  instances,
  habits,
}: {
  supabase: CheckInClient;
  userId: string;
  instances: ScheduleInstance[];
  habits: HabitScheduleItem[];
}) {
  const client = supabase;

  const habitSkillIds = habits
    .map((habit) => habit.skillId)
    .filter((id): id is string => Boolean(id));

  const taskIds = instances
    .filter((instance) => instance.source_type === "TASK")
    .map((instance) => instance.source_id)
    .filter((id): id is string => Boolean(id));

  const projectIds = instances
    .filter((instance) => instance.source_type === "PROJECT")
    .map((instance) => instance.source_id)
    .filter((id): id is string => Boolean(id));

  const eventSkillIds = instances
    .filter((instance) => instance.source_type === "EVENT")
    .flatMap((instance) => {
      const metadata = readMetadataRecord(instance.metadata);
      if (!metadata) return [];

      const values = [
        metadata.skillId,
        metadata.skill_id,
        ...(Array.isArray(metadata.skillIds) ? metadata.skillIds : []),
        ...(Array.isArray(metadata.skill_ids) ? metadata.skill_ids : []),
      ];

      return values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      );
    });

  const [taskResult, projectSkillResult] = await Promise.all([
    taskIds.length
      ? client
          .from("tasks")
          .select("id, skill_id, project_id, goal_id")
          .eq("user_id", userId)
          .in("id", taskIds)
      : Promise.resolve({ data: [], error: null }),

    projectIds.length
      ? client
          .from("project_skills")
          .select("project_id, skill_id")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (taskResult.error) throw taskResult.error;
  if (projectSkillResult.error) throw projectSkillResult.error;

  const tasks = (taskResult.data ?? []) as IlavDisplayTaskRow[];
  const projectSkillRows = (projectSkillResult.data ?? []) as Array<{
    project_id: string;
    skill_id: string;
  }>;

  const allProjectIds = Array.from(
    new Set([
      ...projectIds,
      ...tasks
        .map((task) => task.project_id)
        .filter((id): id is string => Boolean(id)),
    ])
  );

  const projectsResult = allProjectIds.length
    ? await client
        .from("projects")
        .select("id, goal_id")
        .eq("user_id", userId)
        .in("id", allProjectIds)
    : { data: [], error: null };

  if (projectsResult.error) throw projectsResult.error;

  const projects = (projectsResult.data ?? []) as IlavDisplayProjectRow[];

  const goalIds = Array.from(
    new Set([
      ...habits
        .map((habit) => habit.goalId)
        .filter((id): id is string => Boolean(id)),
      ...tasks
        .map((task) => task.goal_id)
        .filter((id): id is string => Boolean(id)),
      ...projects
        .map((project) => project.goal_id)
        .filter((id): id is string => Boolean(id)),
    ])
  );

  const goalsResult = goalIds.length
    ? await client
        .from("goals")
        .select("id, monument_id, area_id")
        .eq("user_id", userId)
        .in("id", goalIds)
    : { data: [], error: null };

  if (goalsResult.error) throw goalsResult.error;

  const goals = (goalsResult.data ?? []) as IlavDisplayGoalRow[];

  const taskSkillIds = tasks
    .map((task) => task.skill_id)
    .filter((id): id is string => Boolean(id));

  const projectSkillIds = projectSkillRows
    .map((row) => row.skill_id)
    .filter(Boolean);

  const allSkillIds = Array.from(
    new Set([
      ...habitSkillIds,
      ...taskSkillIds,
      ...projectSkillIds,
      ...eventSkillIds,
    ])
  );

  const skillsResult = allSkillIds.length
    ? await client
        .from("skills")
        .select("id, icon, monument_id")
        .eq("user_id", userId)
        .in("id", allSkillIds)
    : { data: [], error: null };

  if (skillsResult.error) throw skillsResult.error;

  const skills = (skillsResult.data ?? []) as IlavDisplaySkillRow[];

  const monumentIds = Array.from(
    new Set([
      ...skills
        .map((skill) => skill.monument_id)
        .filter((id): id is string => Boolean(id)),
      ...goals
        .map((goal) => goal.monument_id)
        .filter((id): id is string => Boolean(id)),
    ])
  );

  const monumentsResult = monumentIds.length
    ? await client
        .from("monuments")
        .select("id, emoji, area_id")
        .eq("user_id", userId)
        .in("id", monumentIds)
    : { data: [], error: null };

  if (monumentsResult.error) throw monumentsResult.error;

  const monuments = (monumentsResult.data ?? []) as IlavDisplayMonumentRow[];

  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const monumentById = new Map(
    monuments.map((monument) => [monument.id, monument])
  );
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const projectById = new Map(
    projects.map((project) => [project.id, project])
  );
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  const projectSkillIdByProjectId = new Map<string, string>();
  for (const row of projectSkillRows) {
    if (!projectSkillIdByProjectId.has(row.project_id)) {
      projectSkillIdByProjectId.set(row.project_id, row.skill_id);
    }
  }

  const resolveAreaGlyph = (areaId: string | null | undefined) =>
    areaId ? getAreaById(areaId)?.emoji ?? null : null;

  const resolveMonumentGlyph = (monumentId: string | null | undefined) => {
    if (!monumentId) return null;
    const monument = monumentById.get(monumentId);
    return (
      cleanGlyph(monument?.emoji) ??
      resolveAreaGlyph(monument?.area_id) ??
      null
    );
  };

  const resolveSkillGlyph = (skillId: string | null | undefined) => {
    if (!skillId) return null;
    const skill = skillById.get(skillId);
    return (
      cleanGlyph(skill?.icon) ??
      resolveMonumentGlyph(skill?.monument_id) ??
      null
    );
  };

  const resolveGoalGlyph = (goalId: string | null | undefined) => {
    if (!goalId) return null;
    const goal = goalById.get(goalId);
    return (
      resolveMonumentGlyph(goal?.monument_id) ??
      resolveAreaGlyph(goal?.area_id) ??
      null
    );
  };

  const resolveProjectGlyph = (projectId: string | null | undefined) => {
    if (!projectId) return null;

    const skillId = projectSkillIdByProjectId.get(projectId);
    const project = projectById.get(projectId);

    return (
      resolveSkillGlyph(skillId) ??
      resolveGoalGlyph(project?.goal_id) ??
      null
    );
  };

  const habitGlyphById = new Map<string, string>();

  for (const habit of habits) {
    const glyph =
      resolveSkillGlyph(habit.skillId) ??
      resolveGoalGlyph(habit.goalId) ??
      null;

    if (glyph) habitGlyphById.set(habit.id, glyph);
  }

  const scheduleInstanceGlyphById = new Map<string, string>();

  for (const instance of instances) {
    const metadataGlyph = getInstanceMetadataGlyph(instance);

    if (metadataGlyph) {
      scheduleInstanceGlyphById.set(instance.id, metadataGlyph);
      continue;
    }

    const sourceId = instance.source_id?.trim() ?? "";
    let glyph: string | null = null;

    if (instance.source_type === "HABIT") {
      glyph = habitGlyphById.get(sourceId) ?? null;
    } else if (instance.source_type === "TASK") {
      const task = taskById.get(sourceId);

      glyph =
        resolveSkillGlyph(task?.skill_id) ??
        resolveProjectGlyph(task?.project_id) ??
        resolveGoalGlyph(task?.goal_id) ??
        null;
    } else if (instance.source_type === "PROJECT") {
      glyph = resolveProjectGlyph(sourceId);
    } else if (instance.source_type === "EVENT") {
      const metadata = readMetadataRecord(instance.metadata);
      const skillId =
        typeof metadata?.skillId === "string"
          ? metadata.skillId
          : typeof metadata?.skill_id === "string"
            ? metadata.skill_id
            : null;

      glyph = resolveSkillGlyph(skillId);
    }

    if (glyph) {
      scheduleInstanceGlyphById.set(instance.id, glyph);
    }
  }

  return {
    scheduleInstanceGlyphById,
    habitGlyphById,
  };
}

export async function buildIlavCheckInForUser({
  supabase,
  userId,
  type,
  profileTimezone,
  deviceTimezone,
  creatorDayDate,
  now = new Date(),
}: {
  supabase: CheckInClient;
  userId: string;
  type: IlavCheckInType;
  profileTimezone?: string | null;
  deviceTimezone?: string | null;
  creatorDayDate?: string | null;
  now?: Date;
}) {
  const currentCreatorDay = creatorDayDate
    ? resolveCreatorDayForDate(
        creatorDayDate,
        resolveCreatorDay({ instant: now, profileTimezone, deviceTimezone }).timezone,
        resolveCreatorDay({ instant: now, profileTimezone, deviceTimezone })
          .timezoneSource
      )
    : resolveCreatorDay({ instant: now, profileTimezone, deviceTimezone });
  const [instancesResponse, habits, completedHabitIds] = await Promise.all([
    fetchInstancesForRange(
      userId,
      currentCreatorDay.startsAt,
      currentCreatorDay.endsAt,
      supabase as Parameters<typeof fetchInstancesForRange>[3]
    ),
    fetchHabitsForSchedule(
      userId,
      supabase as Parameters<typeof fetchHabitsForSchedule>[1]
    ),
    fetchCompletedHabitIdsForCreatorDay({
      supabase,
      userId,
      creatorDayDate: currentCreatorDay.creatorDayDate,
    }),
  ]);

  if (instancesResponse.error) throw instancesResponse.error;

  const displayGlyphs = await resolveIlavDisplayGlyphs({
    supabase,
    userId,
    instances: instancesResponse.data ?? [],
    habits,
  });

  return buildIlavCheckInPayload({
    type,
    creatorDay: currentCreatorDay,
    timeZone: currentCreatorDay.timezone,
    generatedAt: now,
    instances: instancesResponse.data ?? [],
    habits,
    completedHabitIds,
    displayGlyphs,
  });
}

export function formatIlavCheckInThreadContext(checkIn: IlavCheckIn) {
  const list = (label: string, items: IlavCheckInItem[]) =>
    items.length
      ? `${label}: ${items
          .slice(0, 8)
          .map((item) => `${item.timeRange ? `${item.timeRange} ` : ""}${item.title}`)
          .join("; ")}`
      : `${label}: none`;
  const habits = checkIn.dueUnscheduledHabits.length
    ? `Due unscheduled habits: ${checkIn.dueUnscheduledHabits
        .slice(0, 8)
        .map((habit) => habit.title)
        .join("; ")}`
    : "Due unscheduled habits: none";

  if (checkIn.type === "morning") {
    return [
      `ILAV deterministic morning check-in for Creator day ${checkIn.creatorDayDate}.`,
      list("Scheduled", checkIn.scheduled),
      habits.replace("Due unscheduled habits", "Due today"),
    ].join("\n");
  }

  return [
    `ILAV deterministic ${checkIn.type} check-in for Creator day ${checkIn.creatorDayDate}.`,
    list("Done", checkIn.completed),
    list("Missed", checkIn.missed),
    ...(checkIn.type === "midday" ? [list("Up next", checkIn.upcoming)] : []),
    habits.replace("Due unscheduled habits", "Still due"),
  ].join("\n");
}
