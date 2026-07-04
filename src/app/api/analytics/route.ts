import { NextRequest, NextResponse } from "next/server";
import type { PostgrestError, PostgrestResponse } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { upsertObservedScheduleInstances } from "@/lib/analytics/observedScheduleInstances";
import {
  buildWindowsForDateFromDayTypeBlocks,
  windowsForDateFromSnapshot,
  type WindowLite,
} from "@/lib/scheduler/repo";
import {
  formatDateKeyInTimeZone,
  getDateTimeParts,
  makeZonedDate,
  normalizeTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
} from "@/lib/scheduler/timezone";
import { requirePlus } from "@/lib/entitlements/requirePlus";
import type { Database } from "@/types/supabase";
import type {
  AnalyticsActivityEvent,
  AnalyticsHabitPerformance,
  AnalyticsHabitRoutine,
  AnalyticsHabitSummary,
  AnalyticsHabitStreakPoint,
  AnalyticsHabitWeeklyReflection,
  AnalyticsKpi,
  AnalyticsKpiId,
  AnalyticsMonument,
  AnalyticsOverviewComparison,
  AnalyticsOverviewComparisonMetric,
  AnalyticsOverviewComparisonTrend,
  AnalyticsOverviewDailyPoint,
  AnalyticsOverviewEfficiencyDebug,
  AnalyticsOverviewEfficiencyCompletedDebug,
  AnalyticsOverviewEfficiencyCompletedDebugRow,
  AnalyticsOverviewEfficiencyDebugDay,
  AnalyticsOverviewEfficiencyDebugExcludedSource,
  AnalyticsOverviewEfficiencyDebugSource,
  AnalyticsProject,
  AnalyticsRange,
  AnalyticsResponse,
  AnalyticsScheduleSummary,
  AnalyticsSkill,
  AnalyticsSkillCategoryContribution,
  AnalyticsSkillXpTrendBucket,
  AnalyticsTimeBlockPerformance,
  AnalyticsTodaySummary,
  AnalyticsUnscheduledPressure,
  AnalyticsWindowsSummary,
  AnalyticsScheduleCompletion,
} from "@/types/analytics";

export const runtime = "nodejs";

const RANGE_TO_DAYS: Record<AnalyticsRange, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const PRODUCTIVITY_DAY_START_HOUR = 4;

type RawTaskRow = {
  id: string;
  created_at: string | null;
  project_id: string | null;
  stage?: string | null;
  name?: string | null;
  stage_id?: number | null;
  title?: string | null;
};

type RawProjectRow = {
  id: string;
  created_at: string | null;
  updated_at?: string | null;
  name?: string | null;
  title?: string | null;
};

type RawMonumentRow = {
  id: string;
  created_at: string | null;
  updated_at?: string | null;
  title?: string | null;
  name?: string | null;
};

type RawSkillRow = {
  id: string;
  name?: string | null;
  title?: string | null;
  icon?: string | null;
  cat_id?: string | null;
  monument_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type RawCatRow = {
  id: string;
  name?: string | null;
  icon?: string | null;
};

type RawXpEventRow = {
  id: string;
  created_at: string | null;
  amount?: number | null;
  kind?: string | null;
  skill_id?: string | null;
  completion_event_id?: string | null;
};

type RawCompletionEventRow = {
  id: string;
  source_type: string | null;
  source_id: string | null;
  completed_at: string | null;
  schedule_instance_id: string | null;
  was_scheduled: boolean | null;
  duration_min: number | null;
  productivity_day_key: string | null;
  revoked_at: string | null;
};

type RawHabitRow = {
  id: string;
  created_at: string | null;
  name?: string | null;
  routine_id?: string | null;
};

type RawHabitCompletionRow = {
  habit_id: string | null;
  completion_day: string | null;
  completed_at: string | null;
};

type RawHabitRoutineRow = {
  id: string;
  name?: string | null;
};

type RawDailyAppActivityRow = {
  activity_date: string | null;
};

type NormalizedTaskRow = {
  id: string;
  created_at: string | null;
  project_id: string | null;
  stage: string | null;
  name: string | null;
};

type NormalizedProjectRow = {
  id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
};

type NormalizedMonumentRow = {
  id: string;
  name: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
};

type NormalizedSkillRow = {
  id: string;
  name: string;
  icon: string | null;
  cat_id: string | null;
  monument_id: string | null;
  updated_at: string | null;
};

type NormalizedCatRow = {
  id: string;
  name: string;
  icon: string | null;
};

type NormalizedHabitRow = {
  id: string;
  name: string;
  created_at: string | null;
  routine_id: string | null;
};

type NormalizedHabitRoutineRow = {
  id: string;
  name: string;
};

type NormalizedHabitCompletionRow = {
  habit_id: string;
  completion_day: string;
  completed_at: string | null;
};

type NormalizedCompletionEventRow = {
  id: string;
  sourceId: string;
  sourceType: OverviewCompletionSummaryType;
  completedAt: string;
  scheduleInstanceId: string | null;
  wasScheduled: boolean;
  durationMinutes: number | null;
  productivityDayKey: string | null;
};

type RawScheduleInstanceRow = {
  id: string;
  user_id?: string | null;
  source_id: string | null;
  source_type: string | null;
  status?: string | null;
  window_id?: string | null;
  day_type_time_block_id?: string | null;
  time_block_id?: string | null;
  start_utc: string | null;
  end_utc: string | null;
  duration_min: number | null;
  energy_resolved?: string | null;
  completed_at: string | null;
};

type RawObservedScheduleAnalyticsRow = Pick<
  Database["public"]["Tables"]["daily_schedule_analytics_observed_instances"]["Row"],
  | "id"
  | "schedule_instance_id"
  | "source_id"
  | "source_type"
  | "observed_status"
  | "scheduled_start_utc"
  | "scheduled_end_utc"
  | "day_start_utc"
  | "day_end_utc"
  | "duration_min"
  | "time_block_id"
  | "day_type_time_block_id"
  | "window_id"
>;

type NormalizedScheduleInstanceRow = {
  id: string;
  sourceId: string;
  sourceType: ScheduleSummaryType;
  scheduleSourceType: ScheduleSourceType | null;
  status: ScheduleInstanceStatus | null;
  windowId: string | null;
  dayTypeTimeBlockId: string | null;
  timeBlockId: string | null;
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
  energy: string | null;
  completedAt: string | null;
};

type NormalizedObservedScheduleAnalyticsRow = {
  id: string;
  sourceId: string;
  sourceType: ScheduleSummaryType;
  status: "scheduled" | "completed" | null;
  dayStartUtc: string | null;
  windowId: string | null;
  dayTypeTimeBlockId: string | null;
  timeBlockId: string | null;
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
};

type TimeBlockLabelRow = {
  id: string;
  label?: string | null;
  start_local?: string | null;
  end_local?: string | null;
};

type WindowLabelRow = {
  id: string;
  label?: string | null;
};

type RawOverviewWindowRow = {
  id: string;
  created_at: string | null;
  label?: string | null;
  start_local?: string | null;
  end_local?: string | null;
  days?: number[] | null;
  energy?: string | null;
  window_kind?: string | null;
  day_type_time_block_id?: string | null;
};

type RawDayTypeAssignmentRow = {
  date_key?: string | null;
  day_type_id?: string | null;
};

type RawDayTypeRow = {
  id: string;
  name?: string | null;
  days?: number[] | null;
  is_default?: boolean | null;
  created_at?: string | null;
  is_temporary?: boolean | null;
  temporary_date_key?: string | null;
  temporary_expires_at?: string | null;
};

type RawDayTypeTimeBlockSnapshotRow = {
  id: string;
  day_type_id?: string | null;
  energy?: string | null;
  block_type?: string | null;
  time_block_id?: string | null;
  time_blocks?: {
    id?: string | null;
    label?: string | null;
    start_local?: string | null;
    end_local?: string | null;
    days?: number[] | null;
  } | null;
};

type DayTypeTimeBlockLabelRow = {
  id: string;
  time_block_id?: string | null;
  time_blocks?: {
    label?: string | null;
    start_local?: string | null;
    end_local?: string | null;
  } | null;
};

type ScheduleSourceType = "PROJECT" | "TASK" | "HABIT" | "EVENT";
type ScheduleSummaryType = AnalyticsScheduleSummary["byType"][number]["type"];
type OverviewCompletionSummaryType = ScheduleSummaryType | "goal";
type TodaySummaryType = AnalyticsTodaySummary["byType"][number]["type"];
type ScheduleInstanceStatus =
  | "scheduled"
  | "completed"
  | "missed"
  | "canceled";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type OverviewUsableScheduleSource = {
  generalWindows: OverviewUsableWindowMeta[];
  breakWindowIds: Set<string>;
  breakDayTypeTimeBlockIds: Set<string>;
  dayTypeAssignmentsByDateKey: Map<string, string>;
  dayTypesById: Map<
    string,
    {
      id: string;
      days: number[] | null;
      createdAt: string | null;
      isDefault: boolean;
      isTemporary: boolean;
      temporaryDateKey: string | null;
      temporaryExpiresAt: string | null;
    }
  >;
  defaultDayTypes: Array<{
    id: string;
    days: number[] | null;
    createdAt: string | null;
  }>;
  dayTypeWindowsByDayTypeId: Map<string, OverviewUsableWindowMeta[]>;
};

type OverviewCapacitySource =
  AnalyticsOverviewEfficiencyDebugDay["capacitySource"];

type OverviewResolvedDayType = {
  resolvedDayTypeId: string | null;
  assignedDayTypeId: string | null;
  capacitySource: OverviewCapacitySource;
};

type OverviewUsableWindowDebugDayInternal = Omit<
  AnalyticsOverviewEfficiencyDebugDay,
  "completedMinutes"
> & {
  dayStartDate: Date;
  dayEndDateExclusive: Date;
};

type OverviewUsableWindowMinutesResult = {
  minutesByPoint: Map<string, number>;
  perDay: OverviewUsableWindowDebugDayInternal[];
};

type OverviewDailySeriesCompletedDebug =
  AnalyticsOverviewEfficiencyCompletedDebug;

export async function GET(request: NextRequest) {
  const gate = await requirePlus();
  if (gate) {
    return gate;
  }

  const url = new URL(request.url);
  const requestedRange = url.searchParams.get("range");
  const range: AnalyticsRange = isAnalyticsRange(requestedRange)
    ? requestedRange
    : "30d";

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const profileTimeZone = await resolveProfileTimeZone(supabase, user.id);
  const timeZone = profileTimeZone
    ? normalizeTimeZone(profileTimeZone)
    : "America/Chicago"; // Temporary fallback until this route gets a guaranteed app/user timezone source.
  const { start: todayStart, end: todayEnd } =
    computeProductivityDayWindow(timeZone);
  const analyticsNow = new Date();
  const todayCalendarDateKey = formatDateKeyInTimeZone(analyticsNow, timeZone);
  const todayCalendarActivityRes = await supabase
    .from("daily_app_activity")
    .upsert(
      {
        user_id: user.id,
        activity_date: todayCalendarDateKey,
        timezone: timeZone,
        last_seen_at: analyticsNow.toISOString(),
      },
      { onConflict: "user_id,activity_date" }
    );

  if (todayCalendarActivityRes.error) {
    return NextResponse.json(
      { error: todayCalendarActivityRes.error.message },
      { status: 500 }
    );
  }

  const { start, end, previousStart, previousEnd } = computeAnalyticsWindows({
    range,
    productivityDayStart: todayStart,
    productivityDayEnd: todayEnd,
    timeZone,
  });
  const combinedStartIso = previousStart.toISOString();
  const rangeEndExclusiveIso = new Date(end.getTime() + 1).toISOString();
  const todayDayKey = formatProductivityDayKey(todayStart, timeZone);

  const habitHistoryStart = startOfDay(addDays(end, -365));
  const habitCompletionStart = habitHistoryStart.toISOString().slice(0, 10);
  const overviewStartDateKey = formatProductivityDayKey(previousStart, timeZone);
  const overviewEndDateKey = formatProductivityDayKey(end, timeZone);
  const appActivityDateKeys = buildLastCalendarDateKeys(7, timeZone);
  const appActivityStartDateKey = appActivityDateKeys[0] ?? todayCalendarDateKey;
  const appActivityEndDateKey =
    appActivityDateKeys[appActivityDateKeys.length - 1] ?? todayCalendarDateKey;

  const [
    xpEventsRes,
    completionEventsRes,
    tasksRes,
    projectsRes,
    habitsRes,
    monumentsRes,
    windowsRes,
    dayTypeAssignmentsRes,
    defaultDayTypesRes,
    dayTypeTimeBlocksRes,
    skillsRes,
    catsRes,
    skillProgressRes,
    goalsRes,
    habitHistoryRes,
    habitRoutinesRes,
    habitCompletionRes,
    scheduleSummaryInstancesRes,
    scheduleSummaryObservedRes,
    todayScheduleInstancesRes,
    todaySummaryObservedRes,
    recentScheduleInstancesRes,
    appActivityRes,
  ] = await Promise.all([
    supabase
      .from("xp_events")
      .select("id, created_at, amount, kind, skill_id, completion_event_id")
      .eq("user_id", user.id)
      .gte("created_at", combinedStartIso)
      .order("created_at", { ascending: false }),
    supabase
      .from("completion_events")
      .select(
        "id, source_type, source_id, completed_at, schedule_instance_id, was_scheduled, duration_min, productivity_day_key, revoked_at"
      )
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .gte("completed_at", previousStart.toISOString())
      .lte("completed_at", end.toISOString())
      .order("completed_at", { ascending: false }),
    queryWithFallback(
      () =>
        supabase
          .from("tasks")
          .select("id, created_at, project_id, stage, name")
          .eq("user_id", user.id)
          .gte("created_at", combinedStartIso)
          .order("created_at", { ascending: false }),
      () =>
        supabase
          .from("tasks")
          .select("id, created_at, project_id, stage_id, name")
          .eq("user_id", user.id)
          .gte("created_at", combinedStartIso)
          .order("created_at", { ascending: false })
    ),
    queryWithFallback(
      () =>
        supabase
          .from("projects")
          .select("id, created_at, updated_at, name")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
      () =>
        supabase
          .from("projects")
          .select("id, created_at, name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
    ),
    queryWithFallback(
      () =>
        supabase
          .from("habits")
          .select("id, created_at, name, routine_id")
          .eq("user_id", user.id)
          .is("circle_id", null)
          .order("created_at", { ascending: false }),
      () =>
        supabase
          .from("habits")
          .select("id, created_at, name")
          .eq("user_id", user.id)
          .is("circle_id", null)
          .order("created_at", { ascending: false })
    ),
    queryWithFallback(
      () =>
        supabase
          .from("monuments")
          .select("id, created_at, updated_at, title")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
      () =>
        supabase
          .from("monuments")
          .select("id, created_at, title")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
    ),
    supabase
      .from("windows")
      .select(
        "id, created_at, label, start_local, end_local, days, energy, window_kind"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("day_type_assignments")
      .select("date_key, day_type_id")
      .eq("user_id", user.id)
      .gte("date_key", overviewStartDateKey)
      .lte("date_key", overviewEndDateKey),
    supabase
      .from("day_types")
      .select(
        "id, days, is_default, created_at, is_temporary, temporary_date_key, temporary_expires_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("day_type_time_blocks")
      .select(
        "id, day_type_id, energy, block_type, time_block_id, time_blocks(label, start_local, end_local)"
      )
      .eq("user_id", user.id),
    queryWithFallback(
      () =>
        supabase
          .from("skills")
          .select("id, name, icon, cat_id, monument_id, updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
      () =>
        supabase
          .from("skills")
          .select("id, title, cat_id, monument_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
    ),
    queryWithFallback(
      () =>
        supabase
          .from("cats")
          .select("id, name, icon")
          .eq("user_id", user.id),
      () =>
        supabase
          .from("cats")
          .select("id, name")
          .eq("user_id", user.id)
    ),
    supabase
      .from("skill_progress")
      .select("skill_id, level, prestige, xp_into_level, total_xp, updated_at")
      .eq("user_id", user.id),
    supabase
      .from("goals")
      .select("id, created_at, monument_id, name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("xp_events")
      .select("created_at")
      .eq("user_id", user.id)
      .eq("kind", "habit")
      .gte("created_at", habitHistoryStart.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("habit_routines")
      .select("id, name")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("habit_completion_days")
      .select("habit_id, completion_day, completed_at")
      .eq("user_id", user.id)
      .gte("completion_day", habitCompletionStart)
      .order("completion_day", { ascending: true }),
    supabase
      .from("schedule_instances")
      .select(
        "id, source_type, status, window_id, day_type_time_block_id, time_block_id, start_utc, end_utc, duration_min, completed_at"
      )
      .eq("user_id", user.id)
      .gt("end_utc", previousStart.toISOString())
      .lt("start_utc", rangeEndExclusiveIso)
      .order("start_utc", { ascending: false }),
    supabase
      .from("daily_schedule_analytics_observed_instances")
      .select(
        "id, schedule_instance_id, source_id, source_type, observed_status, scheduled_start_utc, scheduled_end_utc, day_start_utc, day_end_utc, duration_min, time_block_id, day_type_time_block_id, window_id"
      )
      .eq("user_id", user.id)
      .gte("day_start_utc", previousStart.toISOString())
      .lte("day_start_utc", end.toISOString())
      .order("scheduled_start_utc", { ascending: false }),
    supabase
      .from("schedule_instances")
      .select(
        "id, user_id, source_id, source_type, status, start_utc, end_utc, duration_min, time_block_id, day_type_time_block_id, window_id, completed_at"
      )
      .eq("user_id", user.id)
      .in("status", ["scheduled", "completed", "missed", "canceled"])
      .gte("start_utc", todayStart.toISOString())
      .lt("start_utc", todayEnd.toISOString())
      .order("start_utc", { ascending: true }),
    supabase
      .from("daily_schedule_analytics_observed_instances")
      .select(
        "id, schedule_instance_id, source_id, source_type, observed_status, scheduled_start_utc, scheduled_end_utc, day_start_utc, day_end_utc, duration_min, time_block_id, day_type_time_block_id, window_id"
      )
      .eq("user_id", user.id)
      .eq("day_key", todayDayKey)
      .order("scheduled_start_utc", { ascending: true }),
    supabase
      .from("schedule_instances")
      .select(
        "id, source_id, source_type, start_utc, end_utc, duration_min, energy_resolved, completed_at"
      )
      .eq("user_id", user.id)
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .gte("completed_at", start.toISOString())
      .lte("completed_at", end.toISOString())
      .order("completed_at", { ascending: false })
      .limit(12),
    supabase
      .from("daily_app_activity")
      .select("activity_date")
      .eq("user_id", user.id)
      .gte("activity_date", appActivityStartDateKey)
      .lte("activity_date", appActivityEndDateKey),
  ]);

  const queryError =
    xpEventsRes.error ||
    (completionEventsRes.error &&
    !shouldFallbackToLegacySchema(completionEventsRes.error)
      ? completionEventsRes.error
      : null) ||
    tasksRes.error ||
    projectsRes.error ||
    habitsRes.error ||
    monumentsRes.error ||
    windowsRes.error ||
    skillsRes.error ||
    catsRes.error ||
    skillProgressRes.error ||
    goalsRes.error ||
    habitHistoryRes.error ||
    habitRoutinesRes.error ||
    habitCompletionRes.error ||
    scheduleSummaryInstancesRes.error ||
    scheduleSummaryObservedRes.error ||
    todayScheduleInstancesRes.error ||
    todaySummaryObservedRes.error ||
    recentScheduleInstancesRes.error ||
    appActivityRes.error;

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const xpEvents = (xpEventsRes.data ?? []) as RawXpEventRow[];
  const completionEvents = normalizeCompletionEventRows(
    completionEventsRes.error == null
      ? ((completionEventsRes.data ?? []) as RawCompletionEventRow[])
      : []
  );
  let completionXpEvents: RawXpEventRow[] = [];
  if (completionEvents.length > 0) {
    const { data, error } = await supabase
      .from("xp_events")
      .select("id, created_at, amount, kind, skill_id, completion_event_id")
      .eq("user_id", user.id)
      .in(
        "completion_event_id",
        completionEvents.map((completion) => completion.id)
      );
    if (error && !shouldFallbackToLegacySchema(error)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    completionXpEvents = (data ?? []) as RawXpEventRow[];
  }
  const tasks = normalizeTaskRows(tasksRes.data ?? []);
  const projects = normalizeProjectRows(projectsRes.data ?? []);
  const habits = normalizeHabitRows(habitsRes.data ?? []);
  const monuments = normalizeMonumentRows(monumentsRes.data ?? []);
  const windows = (windowsRes.data ?? []) as RawOverviewWindowRow[];
  const dayTypeAssignments =
    dayTypeAssignmentsRes.error == null
      ? ((dayTypeAssignmentsRes.data ?? []) as RawDayTypeAssignmentRow[])
      : [];
  const defaultDayTypes =
    defaultDayTypesRes.error == null
      ? ((defaultDayTypesRes.data ?? []) as RawDayTypeRow[])
      : [];
  const dayTypeTimeBlocks =
    dayTypeTimeBlocksRes.error == null
      ? ((dayTypeTimeBlocksRes.data ?? []) as RawDayTypeTimeBlockSnapshotRow[])
      : [];
  const skills = normalizeSkillRows(skillsRes.data ?? []);
  const cats = normalizeCatRows(catsRes.data ?? []);
  const skillProgress = skillProgressRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const habitHistory = habitHistoryRes.data ?? [];
  const habitRoutines = normalizeHabitRoutineRows(habitRoutinesRes.data ?? []);
  const habitCompletions = normalizeHabitCompletionRows(
    habitCompletionRes.data ?? []
  );
  const appActivity = buildAppActivitySummary({
    dateKeys: appActivityDateKeys,
    rows: (appActivityRes.data ?? []) as RawDailyAppActivityRow[],
    timeZone,
  });
  const overviewScheduleInstances = normalizeScheduleInstanceRows(
    (scheduleSummaryInstancesRes.data ?? []) as RawScheduleInstanceRow[]
  );
  const scheduleSummaryInstances = filterScheduleInstancesForRange(
    overviewScheduleInstances,
    start,
    end
  );
  let overviewObservedInstances = normalizeObservedScheduleAnalyticsRows(
    (scheduleSummaryObservedRes.data ?? []) as RawObservedScheduleAnalyticsRow[]
  );
  let currentOverviewObservedInstances = filterObservedInstancesForRange(
    overviewObservedInstances,
    start,
    end
  );
  let scheduleSummaryObservedInstances = filterObservedInstancesByDayStartForRange(
    overviewObservedInstances,
    start,
    end
  );
  let todayObservedInstances = normalizeObservedScheduleAnalyticsRows(
    (todaySummaryObservedRes.data ?? []) as RawObservedScheduleAnalyticsRow[]
  );
  if (
    dayTypeAssignmentsRes.error ||
    defaultDayTypesRes.error ||
    dayTypeTimeBlocksRes.error
  ) {
    console.warn(
      "[analytics:overview-efficiency] capacity lookup failed",
      dayTypeAssignmentsRes.error ??
        defaultDayTypesRes.error ??
        dayTypeTimeBlocksRes.error
    );
  }
  const observedTodayScheduleRows = (todayScheduleInstancesRes.data ?? []).filter(
    (
      row
    ): row is Required<
      Pick<
        RawScheduleInstanceRow,
        | "id"
        | "source_id"
        | "source_type"
        | "status"
        | "start_utc"
        | "end_utc"
        | "duration_min"
      >
    > &
      Pick<
        RawScheduleInstanceRow,
        "time_block_id" | "day_type_time_block_id" | "window_id"
      > & { user_id: string } => {
      const hasPlacement =
        (typeof row?.time_block_id === "string" && row.time_block_id.length > 0) ||
        (typeof row?.day_type_time_block_id === "string" &&
          row.day_type_time_block_id.length > 0) ||
        (typeof row?.window_id === "string" && row.window_id.length > 0);

      // Observation analytics only records placed events; loose due/missed rows without a Time Block/window are handled by unscheduled analytics later.
      return (
        typeof row?.id === "string" &&
        typeof row?.user_id === "string" &&
        row.user_id === user.id &&
        typeof row?.source_id === "string" &&
        typeof row?.source_type === "string" &&
        typeof row?.status === "string" &&
        typeof row?.start_utc === "string" &&
        typeof row?.end_utc === "string" &&
        typeof row?.duration_min === "number" &&
        hasPlacement
      );
    }
  );
  const recentScheduleInstances = normalizeScheduleInstanceRows(
    (recentScheduleInstancesRes.data ?? []) as RawScheduleInstanceRow[]
  );
  if (observedTodayScheduleRows.length > 0) {
    try {
      await upsertObservedScheduleInstances({
        userId: user.id,
        timezone: timeZone,
        dayKey: todayDayKey,
        dayStartUtc: todayStart,
        dayEndUtc: todayEnd,
        scheduleInstances: observedTodayScheduleRows,
      });
    } catch (error) {
      console.warn("[analytics] failed to stamp observed schedule instances", {
        userId: user.id,
        dayKey: todayDayKey,
        attemptedRows: observedTodayScheduleRows.length,
        error,
      });
    }
  }
  if (observedTodayScheduleRows.length > 0) {
    const [
      refreshedScheduleSummaryObservedRes,
      refreshedTodaySummaryObservedRes,
    ] = await Promise.all([
      supabase
        .from("daily_schedule_analytics_observed_instances")
        .select(
          "id, schedule_instance_id, source_id, source_type, observed_status, scheduled_start_utc, scheduled_end_utc, day_start_utc, day_end_utc, duration_min, time_block_id, day_type_time_block_id, window_id"
        )
        .eq("user_id", user.id)
        .gte("day_start_utc", previousStart.toISOString())
        .lte("day_start_utc", end.toISOString())
        .order("scheduled_start_utc", { ascending: false }),
      supabase
        .from("daily_schedule_analytics_observed_instances")
        .select(
          "id, schedule_instance_id, source_id, source_type, observed_status, scheduled_start_utc, scheduled_end_utc, day_start_utc, day_end_utc, duration_min, time_block_id, day_type_time_block_id, window_id"
        )
        .eq("user_id", user.id)
        .eq("day_key", todayDayKey)
        .order("scheduled_start_utc", { ascending: true }),
    ]);

    if (!refreshedScheduleSummaryObservedRes.error) {
      overviewObservedInstances = normalizeObservedScheduleAnalyticsRows(
        (refreshedScheduleSummaryObservedRes.data ?? []) as RawObservedScheduleAnalyticsRow[]
      );
      currentOverviewObservedInstances = filterObservedInstancesForRange(
        overviewObservedInstances,
        start,
        end
      );
      scheduleSummaryObservedInstances = filterObservedInstancesByDayStartForRange(
        overviewObservedInstances,
        start,
        end
      );
    }

    if (!refreshedTodaySummaryObservedRes.error) {
      todayObservedInstances = normalizeObservedScheduleAnalyticsRows(
        (refreshedTodaySummaryObservedRes.data ?? []) as RawObservedScheduleAnalyticsRow[]
      );
    }
  }
  const scheduleSummary = buildScheduleSummary(
    scheduleSummaryObservedInstances,
    analyticsNow
  );
  const unscheduledPressure = buildUnscheduledPressure(
    scheduleSummaryInstances,
    habits,
    analyticsNow
  );
  const todaySummary = buildTodaySummary(
    todayObservedInstances,
    analyticsNow,
    todayStart,
    todayEnd
  );
  const timeBlockPerformance = await buildTimeBlockPerformanceSummary({
    client: supabase,
    userId: user.id,
    instances: scheduleSummaryObservedInstances,
    now: analyticsNow,
  });
  const overviewUsableScheduleSource = buildOverviewUsableScheduleSource({
    windows,
    dayTypeAssignments,
    defaultDayTypes,
    dayTypeTimeBlocks,
  });

  const xpSplit = splitByPeriod(
    xpEvents,
    start,
    end,
    previousStart,
    previousEnd,
    (event) => parseDate(event.created_at)
  );
  const completionSplit = splitByPeriod(
    completionEvents,
    start,
    end,
    previousStart,
    previousEnd,
    (completion) => parseDate(completion.completedAt)
  );
  const currentCompletionIds = new Set(
    completionSplit.current.map((completion) => completion.id)
  );
  const previousCompletionIds = new Set(
    completionSplit.previous.map((completion) => completion.id)
  );
  const currentCompletionXpEvents = completionXpEvents.filter(
    (event) =>
      typeof event.completion_event_id === "string" &&
      currentCompletionIds.has(event.completion_event_id)
  );
  const previousCompletionXpEvents = completionXpEvents.filter(
    (event) =>
      typeof event.completion_event_id === "string" &&
      previousCompletionIds.has(event.completion_event_id)
  );
  const previousOverviewObservedInstances = filterObservedInstancesForRange(
    overviewObservedInstances,
    previousStart,
    previousEnd
  );
  const previousOverviewScheduleInstances = filterScheduleInstancesForRange(
    overviewScheduleInstances,
    previousStart,
    previousEnd
  );
  const currentTotalXp = calculateCurrentTotalXp(skillProgress);
  const overviewDailyResult = await buildOverviewDailySeries({
    xpEvents: xpSplit.current,
    completionEvents: completionSplit.current,
    completionXpEvents: currentCompletionXpEvents,
    totalXpEvents: xpEvents,
    observedInstances: currentOverviewObservedInstances,
    scheduleInstances: scheduleSummaryInstances,
    start,
    end,
    now: analyticsNow,
    range,
    timeZone,
    usableScheduleSource: overviewUsableScheduleSource,
    currentTotalXp,
  });
  const overviewDaily = overviewDailyResult.overviewDaily;
  const previousOverviewDailyResult = await buildOverviewDailySeries({
    xpEvents: xpSplit.previous,
    completionEvents: completionSplit.previous,
    completionXpEvents: previousCompletionXpEvents,
    totalXpEvents: xpEvents,
    observedInstances: previousOverviewObservedInstances,
    scheduleInstances: previousOverviewScheduleInstances,
    start: previousStart,
    end: previousEnd,
    now: analyticsNow,
    range,
    timeZone,
    usableScheduleSource: overviewUsableScheduleSource,
    currentTotalXp,
  });
  const overviewComparison = buildOverviewComparison({
    current: overviewDaily,
    previous: previousOverviewDailyResult.overviewDaily,
    range,
  });

  const periodSkillXp = buildPeriodSkillXp(xpSplit.current);
  const previousPeriodSkillXp = buildPeriodSkillXp(xpSplit.previous);
  const skillCategoryContributionMeta = buildSkillCategoryContributionMeta({
    skills,
    cats,
    periodSkillXp,
    previousPeriodSkillXp,
  });
  const skillXpTrend = buildSkillXpTrend({
    xpEvents: xpSplit.current,
    start,
    end,
    range,
    timeZone,
  });
  const skillXpTrendBySkill = buildSkillXpTrendBySkill({
    xpEvents: xpSplit.current,
    start,
    end,
    range,
    timeZone,
  });
  const skillCategoryContribution = buildSkillCategoryContribution({
    skills,
    cats,
    periodSkillXp,
    previousPeriodSkillXp,
    skillXpTrendBySkill,
  });

  const taskSplit = splitByPeriod(
    tasks,
    start,
    end,
    previousStart,
    previousEnd,
    (task) => parseDate(task.created_at)
  );

  const projectSplit = splitByPeriod(
    projects,
    start,
    end,
    previousStart,
    previousEnd,
    (project) => parseDate(project.created_at)
  );

  const monumentSplit = splitByPeriod(
    monuments,
    start,
    end,
    previousStart,
    previousEnd,
    (monument) => parseDate(monument.created_at)
  );

  const windowSplit = splitByPeriod(
    windows,
    start,
    end,
    previousStart,
    previousEnd,
    (window) => parseDate(window.created_at)
  );

  const habitSplit = splitByPeriod(
    habits,
    start,
    end,
    previousStart,
    previousEnd,
    (habit) => parseDate(habit.created_at)
  );

  const habitXpSplit = splitByPeriod(
    xpEvents.filter((event) => event.kind === "habit"),
    start,
    end,
    previousStart,
    previousEnd,
    (event) => parseDate(event.created_at)
  );

  const currentXp = xpSplit.current.reduce(
    (sum, event) => sum + (event.amount ?? 0),
    0
  );
  const previousXp = xpSplit.previous.reduce(
    (sum, event) => sum + (event.amount ?? 0),
    0
  );

  const kpis: AnalyticsKpi[] = [
    makeKpi("skill_xp", "Skill XP", currentXp, previousXp),
    makeKpi(
      "tasks",
      "Tasks",
      taskSplit.current.length,
      taskSplit.previous.length
    ),
    makeKpi(
      "projects",
      "Projects",
      projectSplit.current.length,
      projectSplit.previous.length
    ),
    makeKpi(
      "monuments",
      "Monuments",
      monumentSplit.current.length,
      monumentSplit.previous.length
    ),
    makeKpi(
      "windows",
      "Windows",
      windowSplit.current.length,
      windowSplit.previous.length
    ),
    makeKpi(
      "habits",
      "Habit logs",
      habitXpSplit.current.length,
      habitXpSplit.previous.length
    ),
  ];

  const skillProgressMap = new Map(
    skillProgress.map((row) => [row.skill_id, row])
  );

  const rankedSkills: AnalyticsSkill[] = skills
    .map((skill) => {
      const periodXpGained = periodSkillXp.get(skill.id) ?? 0;
      const progress = skillProgressMap.get(skill.id);
      if (!progress) {
        return {
          id: skill.id,
          name: skill.name,
          icon: skill.icon,
          level: 1,
          progress: 0,
          updatedAt: skill.updated_at ?? null,
          xpGained: periodXpGained,
          periodXpGained,
          totalXp: null,
          xpIntoLevel: null,
          xpForNextLevel: null,
        } satisfies AnalyticsSkill;
      }

      const cost = skillCost(progress.level ?? 1, progress.prestige ?? 0);
      const percent =
        cost === 0
          ? 0
          : Math.round(((progress.xp_into_level ?? 0) / cost) * 100);

      return {
        id: skill.id,
        name: skill.name,
        icon: skill.icon,
        level: progress.level ?? 1,
        progress: clampPercent(percent),
        updatedAt: progress.updated_at ?? skill.updated_at ?? null,
        xpGained: periodXpGained,
        periodXpGained,
        totalXp: progress.total_xp ?? null,
        xpIntoLevel: progress.xp_into_level ?? null,
        xpForNextLevel: cost,
      } satisfies AnalyticsSkill;
    })
    .sort((a, b) => {
      if (a.periodXpGained !== b.periodXpGained) {
        return b.periodXpGained - a.periodXpGained;
      }
      return a.name.localeCompare(b.name);
    });

  const projectIds = projects.map((project) => project.id);
  const projectTasksRes: PostgrestResponse<RawTaskRow> = projectIds.length
    ? await queryWithFallback(
        () =>
          supabase
            .from("tasks")
            .select("id, project_id, stage")
            .eq("user_id", user.id)
            .in("project_id", projectIds),
        () =>
          supabase
            .from("tasks")
            .select("id, project_id, stage_id")
            .eq("user_id", user.id)
            .in("project_id", projectIds)
      )
    : ({
        data: [],
        error: null,
        status: 200,
        statusText: "OK",
      } as PostgrestResponse<RawTaskRow>);

  if (projectTasksRes.error) {
    return NextResponse.json(
      { error: projectTasksRes.error.message },
      { status: 500 }
    );
  }

  const tasksByProject = new Map<string, { total: number; done: number }>();
  const projectTaskRows = normalizeTaskRows(projectTasksRes.data ?? []);
  for (const task of projectTaskRows) {
    if (!task.project_id) continue;
    const bucket = tasksByProject.get(task.project_id) ?? { total: 0, done: 0 };
    bucket.total += 1;
    if (task.stage === "PERFECT") {
      bucket.done += 1;
    }
    tasksByProject.set(task.project_id, bucket);
  }

  const rankedProjects: AnalyticsProject[] = projects
    .map((project) => {
      const stats = tasksByProject.get(project.id) ?? { total: 0, done: 0 };
      const progress =
        stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);
      return {
        id: project.id,
        title: project.name,
        progress,
        tasksDone: stats.done,
        tasksTotal: stats.total,
        updatedAt: project.updated_at ?? project.created_at ?? null,
      } satisfies AnalyticsProject;
    })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, 4);

  const totalSkills = skills.length || 1;
  const skillsPerMonument = new Map<string, number>();
  for (const skill of skills) {
    if (!skill.monument_id) continue;
    skillsPerMonument.set(
      skill.monument_id,
      (skillsPerMonument.get(skill.monument_id) ?? 0) + 1
    );
  }

  const goalsPerMonument = new Map<string, number>();
  for (const goal of goals) {
    if (!goal.monument_id) continue;
    goalsPerMonument.set(
      goal.monument_id,
      (goalsPerMonument.get(goal.monument_id) ?? 0) + 1
    );
  }

  const rankedMonuments: AnalyticsMonument[] = monuments
    .map((monument) => {
      const title = monument.title ?? monument.name ?? "Untitled";
      const linkedSkills = skillsPerMonument.get(monument.id) ?? 0;
      const progress = Math.round((linkedSkills / totalSkills) * 100);
      return {
        id: monument.id,
        title,
        progress: clampPercent(progress),
        goalCount: goalsPerMonument.get(monument.id) ?? 0,
      } satisfies AnalyticsMonument;
    })
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 4);

  let recentScheduleShowcase: AnalyticsScheduleCompletion[] = [];
  if (recentScheduleInstances.length > 0) {
    const instanceIds = recentScheduleInstances.map((instance) => instance.id);
    let cancelledInstanceIds = new Set<string>();
    if (instanceIds.length > 0) {
      const { data: scheduleXpRows, error: scheduleXpError } = await supabase
        .from("xp_events")
        .select("schedule_instance_id, amount")
        .eq("user_id", user.id)
        .in("schedule_instance_id", instanceIds);

      if (scheduleXpError) {
        return NextResponse.json(
          { error: scheduleXpError.message },
          { status: 500 }
        );
      }

      cancelledInstanceIds = collectCancelledScheduleInstances(
        scheduleXpRows ?? []
      );
    }

    const activeInstances = recentScheduleInstances.filter(
      (instance) => !cancelledInstanceIds.has(instance.id)
    );

    if (activeInstances.length > 0) {
      const projectIds = Array.from(
        new Set(
          activeInstances
            .filter((instance) => instance.scheduleSourceType === "PROJECT")
            .map((instance) => instance.sourceId)
        )
      );
      const taskIds = Array.from(
        new Set(
          activeInstances
            .filter((instance) => instance.scheduleSourceType === "TASK")
            .map((instance) => instance.sourceId)
        )
      );
      const habitIds = Array.from(
        new Set(
          activeInstances
            .filter((instance) => instance.scheduleSourceType === "HABIT")
            .map((instance) => instance.sourceId)
        )
      );

      const projectLookupRes =
        projectIds.length > 0
          ? await queryWithFallback(
              () =>
                supabase
                  .from("projects")
                  .select("id, name")
                  .eq("user_id", user.id)
                  .in("id", projectIds),
              () =>
                supabase
                  .from("projects")
                  .select("id, name")
                  .eq("user_id", user.id)
                  .in("id", projectIds)
            )
          : null;

      const taskLookupRes =
        taskIds.length > 0
          ? await queryWithFallback(
              () =>
                supabase
                  .from("tasks")
                  .select("id, name")
                  .eq("user_id", user.id)
                  .in("id", taskIds),
              () =>
                supabase
                  .from("tasks")
                  .select("id, name")
                  .eq("user_id", user.id)
                  .in("id", taskIds)
            )
          : null;

      const habitLookupRes =
        habitIds.length > 0
          ? await supabase
              .from("habits")
              .select("id, name")
              .eq("user_id", user.id)
              .is("circle_id", null)
              .in("id", habitIds)
          : null;

      const scheduleLookupError =
        projectLookupRes?.error ||
        taskLookupRes?.error ||
        habitLookupRes?.error;

      if (scheduleLookupError) {
        return NextResponse.json(
          { error: scheduleLookupError.message },
          { status: 500 }
        );
      }

      const projectNameById = new Map<string, string>();
      for (const record of (projectLookupRes?.data ?? []) as RawProjectRow[]) {
        projectNameById.set(
          record.id,
          normalizeText(record.name, record.title) ?? "Untitled project"
        );
      }

      const taskNameById = new Map<string, string>();
      for (const record of (taskLookupRes?.data ?? []) as RawTaskRow[]) {
        taskNameById.set(
          record.id,
          normalizeText(record.name, record.title) ?? "Untitled task"
        );
      }

      const habitNameById = new Map<string, string>();
      for (const record of (habitLookupRes?.data ?? []) as RawHabitRow[]) {
        habitNameById.set(
          record.id,
          normalizeText(record.name) ?? "Habit session"
        );
      }

      const trimmedInstances = activeInstances.slice(0, 6);
      recentScheduleShowcase = trimmedInstances.map((instance) => {
        let resolvedTitle: string | null = null;
        if (instance.scheduleSourceType === "PROJECT") {
          resolvedTitle = projectNameById.get(instance.sourceId) ?? null;
        } else if (instance.scheduleSourceType === "TASK") {
          resolvedTitle = taskNameById.get(instance.sourceId) ?? null;
        } else if (instance.scheduleSourceType === "HABIT") {
          resolvedTitle = habitNameById.get(instance.sourceId) ?? null;
        }

        const scheduleType = instance.scheduleSourceType ?? "HABIT";

        return {
          id: instance.id,
          title: resolvedTitle ?? fallbackScheduleLabel(scheduleType),
          type: SCHEDULE_SOURCE_TYPE_MAP[scheduleType],
          completedAt: instance.completedAt ?? instance.endUtc,
          startUtc: instance.startUtc,
          endUtc: instance.endUtc,
          durationMinutes: instance.durationMinutes,
          energy: instance.energy,
        } satisfies AnalyticsScheduleCompletion;
      });
    }
  }

  const windowSummary: AnalyticsWindowsSummary = {
    heatmap: buildWindowHeatmap(windows),
    energy: buildEnergyBreakdown(windows),
  };

  const activityEvents = buildActivityFeed({
    xpEvents: xpSplit.current,
    tasks: taskSplit.current,
    projects: projectSplit.current,
    habits: habitSplit.current,
    monuments: monumentSplit.current,
    windows: windowSplit.current,
    goals: goals.filter((goal) =>
      isWithinRange(parseDate(goal.created_at), start, end)
    ),
  });

  const habitSummary = buildHabitSummary({
    completions: habitCompletions,
    habits,
    routines: habitRoutines,
    end,
    fallbackDates: habitHistory
      .map((entry) => entry.created_at)
      .filter(Boolean) as string[],
  });

  const projectVelocity = buildProjectDeliverySeries(
    xpEvents.filter((event) => event.kind === "project"),
    end
  );

  const response: AnalyticsResponse = {
    range,
    generatedAt: new Date().toISOString(),
    kpis,
    skills: rankedSkills,
    skillXpTrend,
    skillCategoryContribution,
    skillCategoryContributionMeta,
    projects: rankedProjects,
    monuments: rankedMonuments,
    recentSchedules: recentScheduleShowcase,
    scheduleSummary,
    timeBlockPerformance,
    unscheduledPressure,
    todaySummary,
    overviewDaily,
    overviewComparison,
    windows: windowSummary,
    activity: activityEvents,
    appActivity,
    habit: habitSummary,
    projectVelocity,
  };

  if (process.env.NODE_ENV !== "production") {
    const totalCompletedMinutes = overviewDaily.reduce(
      (sum, point) => sum + point.completedMinutes,
      0
    );
    const totalUsableWindowMinutes = overviewDaily.reduce(
      (sum, point) => sum + point.usableWindowMinutes,
      0
    );
    const rangeEfficiencyRate =
      totalUsableWindowMinutes > 0
        ? clampPercent(
            Math.round(
              (totalCompletedMinutes / totalUsableWindowMinutes) * 100
            )
          )
        : 0;

    response.overviewEfficiencyDebug = buildOverviewEfficiencyDebug({
      range,
      start,
      end,
      overviewDaily: overviewDailyResult,
      timeZone,
      totalCompletedMinutes,
      totalUsableWindowMinutes,
      rangeEfficiencyRate,
    });
  }

  return NextResponse.json(response);
}

function isAnalyticsRange(value: string | null): value is AnalyticsRange {
  return value === "1d" || value === "7d" || value === "30d" || value === "90d";
}

function computeAnalyticsWindows({
  range,
  productivityDayStart,
  productivityDayEnd,
  timeZone,
}: {
  range: AnalyticsRange;
  productivityDayStart: Date;
  productivityDayEnd: Date;
  timeZone: string;
}) {
  if (range === "1d") {
    const start = productivityDayStart;
    const end = new Date(productivityDayEnd.getTime() - 1);
    const previousStart = new Date(start.getTime() - MS_PER_DAY);
    const previousEnd = new Date(productivityDayEnd.getTime() - 1 - MS_PER_DAY);

    return { start, end, previousStart, previousEnd };
  }

  const days = RANGE_TO_DAYS[range];
  return computeProductivityDateWindows({
    days,
    productivityDayStart,
    timeZone,
  });
}

function computeProductivityDateWindows({
  days,
  productivityDayStart,
  timeZone,
}: {
  days: number;
  productivityDayStart: Date;
  timeZone: string;
}) {
  const start = getProductivityDayStartForDate(
    addDays(productivityDayStart, -(days - 1)),
    timeZone
  );
  const endExclusive = addProductivityDay(productivityDayStart, timeZone);
  const end = new Date(endExclusive.getTime() - 1);
  const previousStart = getProductivityDayStartForDate(addDays(start, -days), timeZone);
  const previousEnd = new Date(start.getTime() - 1);
  return { start, end, previousStart, previousEnd };
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function startOfDay(date: Date) {
  return startOfDayInTimeZone(date, "UTC");
}

function buildLastCalendarDateKeys(count: number, timeZone: string) {
  const todayParts = getDateTimeParts(new Date(), timeZone);
  const todayUtc = Date.UTC(
    todayParts.year,
    todayParts.month - 1,
    todayParts.day,
    12,
    0,
    0,
    0
  );

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(todayUtc - (count - 1 - index) * MS_PER_DAY);
    return formatDateKeyInTimeZone(date, "UTC");
  });
}

function buildAppActivitySummary({
  dateKeys,
  rows,
  timeZone,
}: {
  dateKeys: string[];
  rows: RawDailyAppActivityRow[];
  timeZone: string;
}) {
  const activeDates = new Set(
    rows
      .map((row) =>
        typeof row.activity_date === "string" ? row.activity_date : null
      )
      .filter((date): date is string => date !== null)
  );

  return {
    timezone: timeZone,
    days: dateKeys.map((date) => ({
      date,
      active: activeDates.has(date),
    })),
  };
}

async function resolveProfileTimeZone(
  client: SupabaseClient<Database>,
  userId: string
) {
  try {
    const { data, error } = await client
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      return null;
    }
    return typeof data?.timezone === "string" ? data.timezone.trim() : null;
  } catch {
    return null;
  }
}

function computeProductivityDayWindow(timeZone: string) {
  const now = new Date();
  const parts = getDateTimeParts(now, timeZone);
  const start = makeZonedDate(
    {
      year: parts.year,
      month: parts.month,
      day:
        parts.hour >= PRODUCTIVITY_DAY_START_HOUR ? parts.day : parts.day - 1,
      hour: PRODUCTIVITY_DAY_START_HOUR,
      minute: 0,
      second: 0,
    },
    timeZone
  );
  const startParts = getDateTimeParts(start, timeZone);
  const end = makeZonedDate(
    {
      year: startParts.year,
      month: startParts.month,
      day: startParts.day + 1,
      hour: PRODUCTIVITY_DAY_START_HOUR,
      minute: 0,
      second: 0,
    },
    timeZone
  );
  return { start, end };
}

function formatProductivityDayKey(date: Date, timeZone: string) {
  const dayStart = getProductivityDayStartForDate(date, timeZone);
  const parts = getDateTimeParts(dayStart, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeIsoString(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (!value) continue;
    if (parseDate(value)) {
      return value;
    }
  }
  return null;
}

function normalizeText(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function legacyTaskStageToEnum(stageId?: number | null) {
  if (stageId === null || stageId === undefined) return null;
  switch (stageId) {
    case 3:
    case 4:
      return "PERFECT";
    case 2:
      return "PRODUCE";
    case 1:
      return "PREPARE";
    default:
      return null;
  }
}

function normalizeTaskRows(rows: unknown[]): NormalizedTaskRow[] {
  return rows.map((row) => {
    const record = row as RawTaskRow;
    return {
      id: record.id,
      created_at: record.created_at ?? null,
      project_id: record.project_id ?? null,
      stage:
        typeof record.stage === "string"
          ? record.stage
          : legacyTaskStageToEnum(record.stage_id),
      name: normalizeText(record.name, record.title),
    } satisfies NormalizedTaskRow;
  });
}

function normalizeProjectRows(rows: unknown[]): NormalizedProjectRow[] {
  return rows.map((row) => {
    const record = row as RawProjectRow;
    return {
      id: record.id,
      name: normalizeText(record.name, record.title) ?? "Untitled project",
      created_at: record.created_at ?? null,
      updated_at: normalizeIsoString(record.updated_at, record.created_at),
    } satisfies NormalizedProjectRow;
  });
}

function normalizeMonumentRows(rows: unknown[]): NormalizedMonumentRow[] {
  return rows.map((row) => {
    const record = row as RawMonumentRow;
    const primary = normalizeText(record.name, record.title) ?? "Untitled";
    const secondary = normalizeText(record.title, record.name) ?? primary;
    return {
      id: record.id,
      name: primary,
      title: secondary,
      created_at: record.created_at ?? null,
      updated_at: normalizeIsoString(record.updated_at, record.created_at),
    } satisfies NormalizedMonumentRow;
  });
}

function normalizeSkillRows(rows: unknown[]): NormalizedSkillRow[] {
  return rows.map((row) => {
    const record = row as RawSkillRow;
    return {
      id: record.id,
      name: normalizeText(record.name, record.title) ?? "Untitled skill",
      icon: normalizeText(record.icon) ?? null,
      cat_id: record.cat_id ?? null,
      monument_id: record.monument_id ?? null,
      updated_at: normalizeIsoString(record.updated_at, record.created_at),
    } satisfies NormalizedSkillRow;
  });
}

function normalizeCatRows(rows: unknown[]): NormalizedCatRow[] {
  return rows.map((row) => {
    const record = row as RawCatRow;
    return {
      id: record.id,
      name: normalizeText(record.name) ?? "Untitled category",
      icon: normalizeText(record.icon) ?? null,
    } satisfies NormalizedCatRow;
  });
}

function normalizeHabitRows(rows: unknown[]): NormalizedHabitRow[] {
  return rows.map((row) => {
    const record = row as RawHabitRow;
    return {
      id: record.id,
      name: normalizeText(record.name) ?? "Untitled habit",
      created_at: record.created_at ?? null,
      routine_id: record.routine_id ?? null,
    } satisfies NormalizedHabitRow;
  });
}

function normalizeHabitRoutineRows(
  rows: unknown[]
): NormalizedHabitRoutineRow[] {
  return rows.map((row) => {
    const record = row as RawHabitRoutineRow;
    return {
      id: record.id,
      name: normalizeText(record.name) ?? "Routine",
    } satisfies NormalizedHabitRoutineRow;
  });
}

function normalizeHabitCompletionRows(
  rows: unknown[]
): NormalizedHabitCompletionRow[] {
  return rows
    .map((row) => {
      const record = row as RawHabitCompletionRow;
      if (!record.habit_id || !record.completion_day) {
        return null;
      }
      return {
        habit_id: record.habit_id,
        completion_day: record.completion_day,
        completed_at: record.completed_at ?? null,
      } satisfies NormalizedHabitCompletionRow;
    })
    .filter(
      (row): row is NormalizedHabitCompletionRow =>
        row !== null && typeof row.habit_id === "string"
    );
}

function normalizeCompletionEventRows(
  rows: RawCompletionEventRow[]
): NormalizedCompletionEventRow[] {
  return rows
    .map((row) => {
      const sourceType = normalizeCompletionSummaryType(row.source_type);
      const completedAt = normalizeIsoString(row.completed_at);
      if (!row.id || !sourceType || !row.source_id || !completedAt || row.revoked_at) {
        return null;
      }
      const duration =
        typeof row.duration_min === "number" &&
        Number.isFinite(row.duration_min) &&
        row.duration_min >= 0
          ? Math.round(row.duration_min)
          : null;
      return {
        id: row.id,
        sourceId: row.source_id,
        sourceType,
        completedAt,
        scheduleInstanceId:
          typeof row.schedule_instance_id === "string" &&
          row.schedule_instance_id.length > 0
            ? row.schedule_instance_id
            : null,
        wasScheduled: row.was_scheduled === true,
        durationMinutes: duration,
        productivityDayKey:
          typeof row.productivity_day_key === "string" &&
          row.productivity_day_key.length > 0
            ? row.productivity_day_key
            : null,
      } satisfies NormalizedCompletionEventRow;
    })
    .filter((row): row is NormalizedCompletionEventRow => row !== null);
}

const SCHEDULE_SOURCE_TYPE_MAP: Record<
  ScheduleSourceType,
  AnalyticsScheduleCompletion["type"]
> = {
  PROJECT: "project",
  TASK: "task",
  HABIT: "habit",
  EVENT: "event",
};

function normalizeScheduleInstanceRows(
  rows: RawScheduleInstanceRow[]
): NormalizedScheduleInstanceRow[] {
  return rows
    .map((row) => {
      if (typeof row.id !== "string") {
        return null;
      }
      const sourceId = typeof row.source_id === "string" ? row.source_id : "";
      const scheduleSourceType = normalizeScheduleSourceType(row.source_type);
      const sourceType = normalizeScheduleSummaryType(row.source_type);
      const status = normalizeScheduleStatus(row.status);
      const windowId =
        typeof row.window_id === "string" && row.window_id.length > 0
          ? row.window_id
          : null;
      const dayTypeTimeBlockId =
        typeof row.day_type_time_block_id === "string" &&
        row.day_type_time_block_id.length > 0
          ? row.day_type_time_block_id
          : null;
      const timeBlockId =
        typeof row.time_block_id === "string" && row.time_block_id.length > 0
          ? row.time_block_id
          : null;
      const startUtc = normalizeIsoString(row.start_utc);
      const endUtc = normalizeIsoString(row.end_utc);
      const completedAt = normalizeIsoString(row.completed_at);
      if (!sourceType || !startUtc || !endUtc) {
        return null;
      }
      const durationMinutes = deriveDurationMinutes(
        row.duration_min,
        startUtc,
        endUtc
      );
      return {
        id: row.id,
        sourceId,
        sourceType,
        scheduleSourceType,
        status,
        windowId,
        dayTypeTimeBlockId,
        timeBlockId,
        startUtc,
        endUtc,
        durationMinutes,
        energy:
          typeof row.energy_resolved === "string" ? row.energy_resolved : null,
        completedAt,
      } satisfies NormalizedScheduleInstanceRow;
    })
    .filter((row): row is NormalizedScheduleInstanceRow => row !== null);
}

function normalizeObservedScheduleAnalyticsRows(
  rows: RawObservedScheduleAnalyticsRow[]
): NormalizedObservedScheduleAnalyticsRow[] {
  return rows
    .map((row) => {
      const sourceType = normalizeScheduleSummaryType(row.source_type);
      const startUtc = normalizeIsoString(row.scheduled_start_utc ?? row.day_start_utc);
      const endUtc = normalizeIsoString(
        row.scheduled_end_utc ??
          row.scheduled_start_utc ??
          row.day_end_utc ??
          row.day_start_utc
      );
      if (!sourceType || !startUtc || !endUtc) {
        return null;
      }

      return {
        id:
          typeof row.schedule_instance_id === "string" &&
          row.schedule_instance_id.length > 0
            ? row.schedule_instance_id
            : row.id,
        sourceId: typeof row.source_id === "string" ? row.source_id : "",
        sourceType,
        status: normalizeObservedScheduleStatus(row.observed_status),
        dayStartUtc: normalizeIsoString(row.day_start_utc),
        windowId:
          typeof row.window_id === "string" && row.window_id.length > 0
            ? row.window_id
            : null,
        dayTypeTimeBlockId:
          typeof row.day_type_time_block_id === "string" &&
          row.day_type_time_block_id.length > 0
            ? row.day_type_time_block_id
            : null,
        timeBlockId:
          typeof row.time_block_id === "string" && row.time_block_id.length > 0
            ? row.time_block_id
            : null,
        startUtc,
        endUtc,
        durationMinutes: deriveDurationMinutes(row.duration_min, startUtc, endUtc),
      } satisfies NormalizedObservedScheduleAnalyticsRow;
    })
    .filter((row): row is NormalizedObservedScheduleAnalyticsRow => row !== null);
}

async function buildOverviewDailySeries({
  xpEvents,
  completionEvents,
  completionXpEvents,
  totalXpEvents,
  observedInstances,
  scheduleInstances,
  usableScheduleSource,
  start,
  end,
  now,
  range,
  timeZone,
  currentTotalXp,
}: {
  xpEvents: RawXpEventRow[];
  completionEvents: NormalizedCompletionEventRow[];
  completionXpEvents: RawXpEventRow[];
  totalXpEvents: RawXpEventRow[];
  observedInstances: NormalizedObservedScheduleAnalyticsRow[];
  scheduleInstances: NormalizedScheduleInstanceRow[];
  usableScheduleSource: OverviewUsableScheduleSource;
  start: Date;
  end: Date;
  now: Date;
  range: AnalyticsRange;
  timeZone: string;
  currentTotalXp: number;
}): Promise<{
  overviewDaily: AnalyticsOverviewDailyPoint[];
  overviewEfficiencyDebugPerDay: OverviewUsableWindowDebugDayInternal[];
  overviewEfficiencyCompletedDebug: OverviewDailySeriesCompletedDebug;
}> {
  const points = new Map<string, AnalyticsOverviewDailyPoint>();

  if (range === "1d") {
    for (
      let cursor = new Date(start);
      cursor.getTime() <= end.getTime();
      cursor = new Date(cursor.getTime() + 60 * 60 * 1000)
    ) {
      const date = cursor.toISOString();
      points.set(date, {
        date,
        xpGained: 0,
        totalXp: 0,
        projectXp: 0,
        habitXp: 0,
        taskXp: 0,
        completedEvents: 0,
        completedGoals: 0,
        completedProjects: 0,
        completedHabits: 0,
        completedTasks: 0,
        scheduledEvents: 0,
        missedEvents: 0,
        usableWindowMinutes: 0,
        completedMinutes: 0,
        efficiencyRate: 0,
      });
    }
  } else {
    for (
      let cursor = getProductivityDayStartForDate(start, timeZone);
      cursor.getTime() <= end.getTime();
      cursor = addProductivityDay(cursor, timeZone)
    ) {
      const date = formatProductivityDayKey(cursor, timeZone);
      points.set(date, {
        date,
        xpGained: 0,
        totalXp: 0,
        projectXp: 0,
        habitXp: 0,
        taskXp: 0,
        completedEvents: 0,
        completedGoals: 0,
        completedProjects: 0,
        completedHabits: 0,
        completedTasks: 0,
        scheduledEvents: 0,
        missedEvents: 0,
        usableWindowMinutes: 0,
        completedMinutes: 0,
        efficiencyRate: 0,
      });
    }
  }

  const completionById = new Map(
    completionEvents.map((completion) => [completion.id, completion])
  );

  for (const event of completionXpEvents) {
    const completionId =
      typeof event.completion_event_id === "string"
        ? event.completion_event_id
        : null;
    if (!completionId) {
      continue;
    }
    const completion = completionById.get(completionId);
    if (!completion) {
      continue;
    }
    const completedAt = parseDate(completion.completedAt);
    if (!isWithinRange(completedAt, start, end) || !completedAt) {
      continue;
    }

    const amount = Number(event.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const date =
      range === "1d"
        ? formatHourBucketKey(completedAt)
        : completion.productivityDayKey ??
          formatProductivityDayKey(completedAt, timeZone);
    const point = points.get(date);
    if (!point) {
      continue;
    }

    point.xpGained += amount;

    if (event.kind === "project") {
      point.projectXp += amount;
    } else if (event.kind === "habit") {
      point.habitXp += amount;
    } else if (event.kind === "task") {
      point.taskXp += amount;
    }
  }

  for (const event of xpEvents) {
    if (event.completion_event_id) {
      continue;
    }
    const eventDate = parseDate(event.created_at);
    if (!isWithinRange(eventDate, start, end) || !eventDate) {
      continue;
    }

    const amount = Number(event.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const date =
      range === "1d"
        ? formatHourBucketKey(eventDate)
        : formatProductivityDayKey(eventDate, timeZone);
    const point = points.get(date);
    if (!point) {
      continue;
    }

    point.xpGained += amount;

    if (event.kind === "project") {
      point.projectXp += amount;
    } else if (event.kind === "habit") {
      point.habitXp += amount;
    } else if (event.kind === "task") {
      point.taskXp += amount;
    }
  }

  for (const instance of observedInstances) {
    const effectiveStatus = getEffectiveObservedSummaryStatus(instance, now);
    if (!effectiveStatus) {
      continue;
    }

    const bucketAnchor = parseDate(
      range === "1d" ? instance.startUtc : instance.dayStartUtc ?? instance.startUtc
    );
    if (!isWithinRange(bucketAnchor, start, end) || !bucketAnchor) {
      continue;
    }

    const date =
      range === "1d"
        ? formatHourBucketKey(bucketAnchor)
        : formatProductivityDayKey(bucketAnchor, timeZone);
    const point = points.get(date);
    if (!point) {
      continue;
    }

    if (effectiveStatus === "completed") {
      continue;
    }

    if (effectiveStatus === "scheduled") {
      point.scheduledEvents += 1;
      continue;
    }

    if (effectiveStatus === "missed") {
      point.missedEvents += 1;
    }
  }

  const completedDebug = addOverviewCompletedMinutes({
    points,
    completionEvents,
    observedInstances,
    scheduleInstances,
    usableScheduleSource,
    start,
    end,
    range,
    timeZone,
    now,
  });

  let usableWindowMinutesByPoint = new Map<string, number>();
  let overviewEfficiencyDebugPerDay: OverviewUsableWindowDebugDayInternal[] = [];
  try {
    const usableWindowMinutes = await buildOverviewUsableWindowMinutes({
      usableScheduleSource,
      start,
      end,
      range,
      timeZone,
    });
    usableWindowMinutesByPoint = usableWindowMinutes.minutesByPoint;
    overviewEfficiencyDebugPerDay = usableWindowMinutes.perDay;
  } catch (error) {
    console.warn("[analytics:overview-efficiency] capacity lookup failed", error);
  }

  for (const [date, minutes] of usableWindowMinutesByPoint) {
    const point = points.get(date);
    if (!point) {
      continue;
    }
    point.usableWindowMinutes = minutes;
    point.efficiencyRate =
      minutes > 0
        ? clampPercent(
            Math.round((point.completedMinutes / minutes) * 100)
          )
        : 0;
  }

  addOverviewTotalXp({
    points,
    xpEvents: totalXpEvents,
    start,
    range,
    timeZone,
    currentTotalXp,
  });

  return {
    overviewDaily: Array.from(points.values()),
    overviewEfficiencyDebugPerDay,
    overviewEfficiencyCompletedDebug: completedDebug,
  };
}

function calculateCurrentTotalXp(
  skillProgress: Array<{ total_xp?: number | null }>
) {
  return skillProgress.reduce((sum, progress) => {
    const totalXp = Number(progress.total_xp ?? 0);
    return Number.isFinite(totalXp) ? sum + totalXp : sum;
  }, 0);
}

function addOverviewTotalXp({
  points,
  xpEvents,
  start,
  range,
  timeZone,
  currentTotalXp,
}: {
  points: Map<string, AnalyticsOverviewDailyPoint>;
  xpEvents: RawXpEventRow[];
  start: Date;
  range: AnalyticsRange;
  timeZone: string;
  currentTotalXp: number;
}) {
  const xpDeltaByPoint = new Map<string, number>();
  let xpDeltaSinceStart = 0;

  for (const event of xpEvents) {
    if (!event.skill_id) {
      continue;
    }

    const eventDate = parseDate(event.created_at);
    if (!eventDate || eventDate.getTime() < start.getTime()) {
      continue;
    }

    const amount = Number(event.amount ?? 0);
    if (!Number.isFinite(amount) || amount === 0) {
      continue;
    }

    xpDeltaSinceStart += amount;

    const date =
      range === "1d"
        ? formatHourBucketKey(eventDate)
        : formatProductivityDayKey(eventDate, timeZone);
    if (!points.has(date)) {
      continue;
    }

    xpDeltaByPoint.set(date, (xpDeltaByPoint.get(date) ?? 0) + amount);
  }

  let runningTotalXp = Math.max(0, currentTotalXp - xpDeltaSinceStart);
  for (const point of points.values()) {
    runningTotalXp = Math.max(
      0,
      runningTotalXp + (xpDeltaByPoint.get(point.date) ?? 0)
    );
    point.totalXp = runningTotalXp;
  }
}

type OverviewComparisonSummary = {
  xp: number;
  avgPerPoint: number;
  completed: number;
  efficiency: number;
};

function filterObservedInstancesForRange(
  instances: NormalizedObservedScheduleAnalyticsRow[],
  start: Date,
  end: Date
) {
  const endExclusive = new Date(end.getTime() + 1);

  return instances.filter((instance) => {
    const anchor = parseDate(instance.dayStartUtc ?? instance.startUtc);
    if (isWithinRange(anchor, start, end)) {
      return true;
    }

    const intervalStart = parseDate(instance.startUtc);
    const intervalEnd = parseDate(instance.endUtc);
    return (
      !!intervalStart &&
      !!intervalEnd &&
      intervalEnd.getTime() > start.getTime() &&
      intervalStart.getTime() < endExclusive.getTime()
    );
  });
}

function filterObservedInstancesByDayStartForRange(
  instances: NormalizedObservedScheduleAnalyticsRow[],
  start: Date,
  end: Date
) {
  return instances.filter((instance) =>
    isWithinRange(parseDate(instance.dayStartUtc), start, end)
  );
}

function filterScheduleInstancesForRange(
  instances: NormalizedScheduleInstanceRow[],
  start: Date,
  end: Date
) {
  const endExclusive = new Date(end.getTime() + 1);

  return instances.filter((instance) => {
    const intervalStart = parseDate(instance.startUtc);
    const intervalEnd = parseDate(instance.endUtc);
    return (
      !!intervalStart &&
      !!intervalEnd &&
      intervalEnd.getTime() > start.getTime() &&
      intervalStart.getTime() < endExclusive.getTime()
    );
  });
}

function buildOverviewComparison({
  current,
  previous,
}: {
  current: AnalyticsOverviewDailyPoint[];
  previous: AnalyticsOverviewDailyPoint[];
  range: AnalyticsRange;
}): AnalyticsOverviewComparison {
  const currentSummary = summarizeOverviewComparisonPoints(current);
  const previousSummary = summarizeOverviewComparisonPoints(previous);

  return {
    xp: makeOverviewComparisonMetric(
      currentSummary.xp,
      previousSummary.xp
    ),
    avgPerDay: makeOverviewComparisonMetric(
      currentSummary.avgPerPoint,
      previousSummary.avgPerPoint
    ),
    completed: makeOverviewComparisonMetric(
      currentSummary.completed,
      previousSummary.completed
    ),
    efficiency: makeOverviewComparisonMetric(
      currentSummary.efficiency,
      previousSummary.efficiency
    ),
  };
}

function summarizeOverviewComparisonPoints(
  points: AnalyticsOverviewDailyPoint[]
): OverviewComparisonSummary {
  const xp = points.reduce((sum, point) => sum + point.xpGained, 0);
  const completed = points.reduce(
    (sum, point) => sum + point.completedEvents,
    0
  );
  const completedMinutes = points.reduce(
    (sum, point) => sum + point.completedMinutes,
    0
  );
  const usableWindowMinutes = points.reduce(
    (sum, point) => sum + point.usableWindowMinutes,
    0
  );
  const efficiency =
    usableWindowMinutes > 0
      ? clampPercent(
          Math.round((completedMinutes / usableWindowMinutes) * 100)
        )
      : 0;

  return {
    xp,
    avgPerPoint: points.length > 0 ? xp / points.length : 0,
    completed,
    efficiency,
  };
}

function makeOverviewComparisonMetric(
  current: number,
  previous: number
): AnalyticsOverviewComparisonMetric {
  const { percentChange, trend } = calculateOverviewComparisonChange(
    current,
    previous
  );

  return {
    current: normalizeComparisonValue(current),
    previous: normalizeComparisonValue(previous),
    percentChange,
    trend,
  };
}

function calculateOverviewComparisonChange(
  current: number,
  previous: number
): {
  percentChange: number | null;
  trend: AnalyticsOverviewComparisonTrend;
} {
  if (previous === 0 && current === 0) {
    return { percentChange: 0, trend: "flat" };
  }

  if (previous === 0 && current > 0) {
    return { percentChange: null, trend: "new" };
  }

  if (previous > 0 && current === 0) {
    return { percentChange: -100, trend: "down" };
  }

  const percentChange = Math.round(((current - previous) / previous) * 100);
  if (percentChange === 0) {
    return { percentChange, trend: "flat" };
  }

  return {
    percentChange,
    trend: percentChange > 0 ? "up" : "down",
  };
}

function normalizeComparisonValue(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function addOverviewCompletedMinutes({
  points,
  completionEvents,
  observedInstances,
  scheduleInstances,
  usableScheduleSource,
  start,
  end,
  range,
  timeZone,
}: {
  points: Map<string, AnalyticsOverviewDailyPoint>;
  completionEvents: NormalizedCompletionEventRow[];
  observedInstances: NormalizedObservedScheduleAnalyticsRow[];
  scheduleInstances: NormalizedScheduleInstanceRow[];
  usableScheduleSource: OverviewUsableScheduleSource;
  start: Date;
  end: Date;
  range: AnalyticsRange;
  timeZone: string;
  now: Date;
}): OverviewDailySeriesCompletedDebug {
  const rangeEndExclusive = new Date(end.getTime() + 1);
  const includedRows: AnalyticsOverviewEfficiencyCompletedDebugRow[] = [];
  const excludedRows: AnalyticsOverviewEfficiencyCompletedDebugRow[] = [];
  const completionScheduleInstanceIds = new Set<string>();
  const completionSourceDayKeys = new Set<string>();
  const observedCompletedIds = new Set<string>();
  let completionRowsIncluded = 0;
  let observedRowsIncluded = 0;
  let scheduleInstanceRowsIncluded = 0;

  const recordExcluded = (
    row: AnalyticsOverviewEfficiencyCompletedDebugRow
  ) => {
    if (excludedRows.length < 40) {
      excludedRows.push(row);
    }
  };

  const recordIncluded = (
    row: AnalyticsOverviewEfficiencyCompletedDebugRow
  ) => {
    if (includedRows.length < 40) {
      includedRows.push(row);
    }
  };

  const applyCompletedInterval = ({
    source,
    id,
    status,
    sourceType,
    startUtc,
    endUtc,
  }: {
    source: AnalyticsOverviewEfficiencyCompletedDebugRow["source"];
    id: string;
    status: string | null;
    sourceType: ScheduleSummaryType;
    startUtc: string;
    endUtc: string;
  }) => {
    const intervalStart = parseDate(startUtc);
    const intervalEnd = parseDate(endUtc);
    if (!intervalStart || !intervalEnd || intervalEnd.getTime() <= intervalStart.getTime()) {
      recordExcluded({
        source,
        id,
        status,
        startUtc,
        endUtc,
        minutesAfterClipping: 0,
        reason: "invalid_interval",
      });
      return false;
    }

    const overlapsRange =
      intervalEnd.getTime() > start.getTime() &&
      intervalStart.getTime() < rangeEndExclusive.getTime();
    if (!overlapsRange) {
      recordExcluded({
        source,
        id,
        status,
        startUtc,
        endUtc,
        minutesAfterClipping: 0,
        reason: "outside_selected_range",
      });
      return false;
    }

    const clippedStart = new Date(
      Math.max(intervalStart.getTime(), start.getTime())
    );
    const clippedEnd = new Date(
      Math.min(intervalEnd.getTime(), rangeEndExclusive.getTime())
    );
    const minutesAfterClipping = Math.max(
      0,
      Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 60000)
    );
    if (minutesAfterClipping <= 0) {
      recordExcluded({
        source,
        id,
        status,
        startUtc,
        endUtc,
        minutesAfterClipping: 0,
        reason: "outside_selected_range",
      });
      return false;
    }

    if (range === "1d") {
      addIntervalMinutesToHourlyPointField(
        points,
        clippedStart,
        clippedEnd,
        start,
        end,
        "completedMinutes"
      );
    } else {
      addIntervalMinutesToDailyPointField(
        points,
        clippedStart,
        clippedEnd,
        timeZone,
        "completedMinutes"
      );
    }

    const eventPointKey =
      range === "1d"
        ? formatHourBucketKey(clippedStart)
        : formatProductivityDayKey(clippedStart, timeZone);
    const eventPoint = points.get(eventPointKey);
    if (eventPoint) {
      eventPoint.completedEvents += 1;
      if (sourceType === "project") {
        eventPoint.completedProjects += 1;
      } else if (sourceType === "habit") {
        eventPoint.completedHabits += 1;
      } else if (sourceType === "task") {
        eventPoint.completedTasks += 1;
      }
    }

    recordIncluded({
      source,
      id,
      status,
      startUtc,
      endUtc,
      minutesAfterClipping,
    });
    return true;
  };

  const applyCompletionEvent = (completion: NormalizedCompletionEventRow) => {
    const completedAt = parseDate(completion.completedAt);
    if (!completedAt || !isWithinRange(completedAt, start, end)) {
      recordExcluded({
        source: "completion_events",
        id: completion.id,
        status: null,
        startUtc: completion.completedAt,
        endUtc: completion.completedAt,
        minutesAfterClipping: 0,
        reason: "outside_selected_range",
      });
      return false;
    }

    const pointKey =
      range === "1d"
        ? formatHourBucketKey(completedAt)
        : completion.productivityDayKey ??
          formatProductivityDayKey(completedAt, timeZone);
    const point = points.get(pointKey);
    if (!point) {
      recordExcluded({
        source: "completion_events",
        id: completion.id,
        status: null,
        startUtc: completion.completedAt,
        endUtc: completion.completedAt,
        minutesAfterClipping: 0,
        reason: "missing_point",
      });
      return false;
    }

    const durationMinutes = completion.durationMinutes ?? 0;
    point.completedMinutes += durationMinutes;
    point.completedEvents += 1;
    if (completion.sourceType === "project") {
      point.completedProjects += 1;
    } else if (completion.sourceType === "goal") {
      point.completedGoals += 1;
    } else if (completion.sourceType === "habit") {
      point.completedHabits += 1;
    } else if (completion.sourceType === "task") {
      point.completedTasks += 1;
    }

    if (completion.scheduleInstanceId) {
      completionScheduleInstanceIds.add(completion.scheduleInstanceId);
    }
    completionSourceDayKeys.add(
      buildCompletionFallbackDedupeKey({
        sourceType: completion.sourceType,
        sourceId: completion.sourceId,
        date: completedAt,
        timeZone,
      })
    );

    recordIncluded({
      source: "completion_events",
      id: completion.id,
      status: null,
      startUtc: completion.completedAt,
      endUtc: completion.completedAt,
      minutesAfterClipping: durationMinutes,
    });
    return true;
  };

  const completionRowsConsidered = completionEvents.length;
  for (const completion of completionEvents) {
    if (applyCompletionEvent(completion)) {
      completionRowsIncluded += 1;
    }
  }

  const observedRowsConsidered = observedInstances.length;
  for (const instance of observedInstances) {
    const observedAnchor = parseDate(instance.dayStartUtc ?? instance.startUtc);
    if (
      completionScheduleInstanceIds.has(instance.id) ||
      (observedAnchor &&
        completionSourceDayKeys.has(
          buildCompletionFallbackDedupeKey({
            sourceType: instance.sourceType,
            sourceId: instance.sourceId,
            date: observedAnchor,
            timeZone,
          })
        ))
    ) {
      recordExcluded({
        source: "observed",
        id: instance.id,
        status: instance.status,
        startUtc: instance.startUtc,
        endUtc: instance.endUtc,
        minutesAfterClipping: 0,
        reason: "covered_by_completion_event",
      });
      continue;
    }
    if (instance.status !== "completed") {
      recordExcluded({
        source: "observed",
        id: instance.id,
        status: instance.status,
        startUtc: instance.startUtc,
        endUtc: instance.endUtc,
        minutesAfterClipping: 0,
        reason: "not_completed",
      });
      continue;
    }
    if (isOverviewCompletedBreak(instance, usableScheduleSource)) {
      recordExcluded({
        source: "observed",
        id: instance.id,
        status: instance.status,
        startUtc: instance.startUtc,
        endUtc: instance.endUtc,
        minutesAfterClipping: 0,
        reason: "window_kind_break",
      });
      continue;
    }

    observedCompletedIds.add(instance.id);
    const included = applyCompletedInterval({
      source: "observed",
      id: instance.id,
      status: instance.status,
      sourceType: instance.sourceType,
      startUtc: instance.startUtc,
      endUtc: instance.endUtc,
    });
    if (included) {
      observedRowsIncluded += 1;
    }
  }

  const fallbackScheduleInstances = scheduleInstances.filter(
    (instance) =>
      instance.status === "completed" &&
      !observedCompletedIds.has(instance.id) &&
      !completionScheduleInstanceIds.has(instance.id)
  );
  const scheduleInstanceRowsConsidered = fallbackScheduleInstances.length;
  for (const instance of fallbackScheduleInstances) {
    const scheduleAnchor = parseDate(instance.completedAt ?? instance.startUtc);
    if (
      scheduleAnchor &&
      completionSourceDayKeys.has(
        buildCompletionFallbackDedupeKey({
          sourceType: instance.sourceType,
          sourceId: instance.sourceId,
          date: scheduleAnchor,
          timeZone,
        })
      )
    ) {
      recordExcluded({
        source: "schedule_instances",
        id: instance.id,
        status: instance.status,
        startUtc: instance.startUtc,
        endUtc: instance.endUtc,
        minutesAfterClipping: 0,
        reason: "covered_by_completion_event",
      });
      continue;
    }
    if (isOverviewCompletedBreak(instance, usableScheduleSource)) {
      recordExcluded({
        source: "schedule_instances",
        id: instance.id,
        status: instance.status,
        startUtc: instance.startUtc,
        endUtc: instance.endUtc,
        minutesAfterClipping: 0,
        reason: "window_kind_break",
      });
      continue;
    }

    const included = applyCompletedInterval({
      source: "schedule_instances",
      id: instance.id,
      status: instance.status,
      sourceType: instance.sourceType,
      startUtc: instance.startUtc,
      endUtc: instance.endUtc,
    });
    if (included) {
      scheduleInstanceRowsIncluded += 1;
    }
  }

  const rowsIncluded =
    completionRowsIncluded + observedRowsIncluded + scheduleInstanceRowsIncluded;
  const rowsConsidered =
    completionRowsConsidered +
    observedRowsConsidered +
    scheduleInstanceRowsConsidered;
  const fallbackUsed = scheduleInstanceRowsIncluded > 0;
  let source: OverviewDailySeriesCompletedDebug["source"] = "none";
  if (completionRowsIncluded > 0 && observedRowsIncluded > 0 && fallbackUsed) {
    source = "completion_events_plus_observed_plus_schedule_instances_fallback";
  } else if (completionRowsIncluded > 0 && observedRowsIncluded > 0) {
    source = "completion_events_plus_observed";
  } else if (completionRowsIncluded > 0 && fallbackUsed) {
    source = "completion_events_plus_schedule_instances_fallback";
  } else if (completionRowsIncluded > 0) {
    source = "completion_events";
  } else if (observedRowsIncluded > 0 && fallbackUsed) {
    source = "observed_plus_schedule_instances_fallback";
  } else if (observedRowsIncluded > 0) {
    source = "observed";
  } else if (fallbackUsed) {
    source = "schedule_instances_fallback";
  }

  return {
    source,
    rowsConsidered,
    observedRowsConsidered,
    scheduleInstanceRowsConsidered,
    rowsIncluded,
    observedRowsIncluded,
    scheduleInstanceRowsIncluded,
    rowsExcluded: Math.max(0, rowsConsidered - rowsIncluded),
    fallbackUsed,
    includedRows,
    excludedRows,
  };
}

function formatHourBucketKey(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      0,
      0,
      0
    )
  ).toISOString();
}

function buildCompletionFallbackDedupeKey({
  sourceType,
  sourceId,
  date,
  timeZone,
}: {
  sourceType: OverviewCompletionSummaryType;
  sourceId: string;
  date: Date;
  timeZone: string;
}) {
  return `${sourceType}:${sourceId}:${formatProductivityDayKey(date, timeZone)}`;
}

function buildSkillXpTrend({
  xpEvents,
  start,
  end,
  range,
  timeZone,
}: {
  xpEvents: RawXpEventRow[];
  start: Date;
  end: Date;
  range: AnalyticsRange;
  timeZone: string;
}): AnalyticsSkillXpTrendBucket[] {
  const buckets = new Map<string, AnalyticsSkillXpTrendBucket>();

  if (range === "1d") {
    for (
      let cursor = new Date(start);
      cursor.getTime() <= end.getTime();
      cursor = new Date(cursor.getTime() + 60 * 60 * 1000)
    ) {
      const bucketKey = formatHourBucketKey(cursor);
      buckets.set(bucketKey, {
        bucketKey,
        label: formatSkillXpHourLabel(cursor, timeZone),
        skills: [],
        totalXp: 0,
      });
    }
  } else {
    for (
      let cursor = getProductivityDayStartForDate(start, timeZone);
      cursor.getTime() <= end.getTime();
      cursor = addProductivityDay(cursor, timeZone)
    ) {
      const bucketKey = formatProductivityDayKey(cursor, timeZone);
      buckets.set(bucketKey, {
        bucketKey,
        label: formatSkillXpDayLabel(cursor, timeZone),
        skills: [],
        totalXp: 0,
      });
    }
  }

  const skillXpByBucket = new Map<string, Map<string, number>>();

  for (const event of xpEvents) {
    const eventDate = parseDate(event.created_at);
    if (!isWithinRange(eventDate, start, end) || !eventDate || !event.skill_id) {
      continue;
    }

    const amount = Number(event.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const bucketKey =
      range === "1d"
        ? formatHourBucketKey(eventDate)
        : formatProductivityDayKey(eventDate, timeZone);
    const bucket = buckets.get(bucketKey);
    if (!bucket) {
      continue;
    }

    const skillXp = skillXpByBucket.get(bucketKey) ?? new Map<string, number>();
    skillXp.set(event.skill_id, (skillXp.get(event.skill_id) ?? 0) + amount);
    skillXpByBucket.set(bucketKey, skillXp);
    bucket.totalXp += amount;
  }

  return Array.from(buckets.values()).map((bucket) => {
    const skillXp = skillXpByBucket.get(bucket.bucketKey);
    if (!skillXp) {
      return bucket;
    }

    return {
      ...bucket,
      skills: Array.from(skillXp.entries())
        .map(([skillId, xp]) => ({ skillId, xp }))
        .sort((a, b) => b.xp - a.xp),
    };
  });
}

type SkillContributionXpTrendPoint = {
  label: string;
  xp: number;
};

type SkillContributionXpTrendBucket = SkillContributionXpTrendPoint & {
  bucketKey: string;
  start: Date;
  endExclusive: Date;
};

function buildSkillXpTrendBySkill({
  xpEvents,
  start,
  end,
  range,
  timeZone,
}: {
  xpEvents: RawXpEventRow[];
  start: Date;
  end: Date;
  range: AnalyticsRange;
  timeZone: string;
}) {
  const buckets = buildSkillContributionTrendBuckets({
    start,
    end,
    range,
    timeZone,
  });
  const emptyTrend = buckets.map(({ label }) => ({ label, xp: 0 }));
  const xpBySkillAndBucket = new Map<string, Map<string, number>>();

  for (const event of xpEvents) {
    const eventDate = parseDate(event.created_at);
    if (!eventDate || !event.skill_id || !isWithinRange(eventDate, start, end)) {
      continue;
    }

    const amount = Number(event.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const bucket = buckets.find(
      (item) =>
        eventDate.getTime() >= item.start.getTime() &&
        eventDate.getTime() < item.endExclusive.getTime()
    );
    if (!bucket) {
      continue;
    }

    const bucketXp = xpBySkillAndBucket.get(event.skill_id) ?? new Map<string, number>();
    bucketXp.set(bucket.bucketKey, (bucketXp.get(bucket.bucketKey) ?? 0) + amount);
    xpBySkillAndBucket.set(event.skill_id, bucketXp);
  }

  const bySkill = new Map<string, SkillContributionXpTrendPoint[]>();
  for (const [skillId, bucketXp] of xpBySkillAndBucket.entries()) {
    bySkill.set(
      skillId,
      buckets.map((bucket) => ({
        label: bucket.label,
        xp: bucketXp.get(bucket.bucketKey) ?? 0,
      }))
    );
  }

  return { bySkill, emptyTrend };
}

function buildSkillContributionTrendBuckets({
  start,
  end,
  range,
  timeZone,
}: {
  start: Date;
  end: Date;
  range: AnalyticsRange;
  timeZone: string;
}): SkillContributionXpTrendBucket[] {
  const buckets: SkillContributionXpTrendBucket[] = [];

  if (range === "1d") {
    for (
      let cursor = new Date(start);
      cursor.getTime() <= end.getTime();
      cursor = new Date(cursor.getTime() + 60 * 60 * 1000)
    ) {
      const endExclusive = new Date(cursor.getTime() + 60 * 60 * 1000);
      buckets.push({
        bucketKey: formatHourBucketKey(cursor),
        label: formatSkillXpHourLabel(cursor, timeZone),
        xp: 0,
        start: cursor,
        endExclusive,
      });
    }
    return buckets;
  }

  const bucketDays = range === "90d" ? 7 : 1;
  for (
    let cursor = getProductivityDayStartForDate(start, timeZone);
    cursor.getTime() <= end.getTime();
    cursor = addProductivityDays(cursor, bucketDays, timeZone)
  ) {
    const endExclusive = addProductivityDays(cursor, bucketDays, timeZone);
    buckets.push({
      bucketKey: `${formatProductivityDayKey(cursor, timeZone)}:${bucketDays}`,
      label: formatSkillXpDayLabel(cursor, timeZone),
      xp: 0,
      start: cursor,
      endExclusive,
    });
  }

  return buckets;
}

function addProductivityDays(anchor: Date, amount: number, timeZone: string) {
  let cursor = new Date(anchor);
  for (let index = 0; index < amount; index += 1) {
    cursor = addProductivityDay(cursor, timeZone);
  }
  return cursor;
}

function formatSkillXpHourLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone,
  }).format(date);
}

function formatSkillXpDayLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
}

function buildPeriodSkillXp(
  xpEvents: Array<{ amount?: number | null; skill_id?: string | null }>
) {
  const periodSkillXp = new Map<string, number>();

  for (const event of xpEvents) {
    if (!event.skill_id) {
      continue;
    }

    const amount = Number(event.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    periodSkillXp.set(
      event.skill_id,
      (periodSkillXp.get(event.skill_id) ?? 0) + amount
    );
  }

  return periodSkillXp;
}

function buildSkillCategoryContributionMeta({
  skills,
  cats,
  periodSkillXp,
  previousPeriodSkillXp,
}: {
  skills: NormalizedSkillRow[];
  cats: NormalizedCatRow[];
  periodSkillXp: Map<string, number>;
  previousPeriodSkillXp: Map<string, number>;
}) {
  const totalXpGained = sumCategorizedSkillXp(periodSkillXp, skills, cats);
  const previousTotalXpGained = sumCategorizedSkillXp(
    previousPeriodSkillXp,
    skills,
    cats
  );
  const totalXpPercentChange =
    previousTotalXpGained > 0
      ? ((totalXpGained - previousTotalXpGained) / previousTotalXpGained) * 100
      : null;

  return {
    totalXpGained,
    previousTotalXpGained,
    totalXpPercentChange,
  };
}

function sumCategorizedSkillXp(
  periodSkillXp: Map<string, number>,
  skills: NormalizedSkillRow[],
  cats: NormalizedCatRow[]
) {
  const categoryIds = new Set(cats.map((cat) => cat.id));

  return skills.reduce((sum, skill) => {
    if (!skill.cat_id || !categoryIds.has(skill.cat_id)) {
      return sum;
    }

    return sum + (periodSkillXp.get(skill.id) ?? 0);
  }, 0);
}

function buildSkillCategoryContribution({
  skills,
  cats,
  periodSkillXp,
  previousPeriodSkillXp,
  skillXpTrendBySkill,
}: {
  skills: NormalizedSkillRow[];
  cats: NormalizedCatRow[];
  periodSkillXp: Map<string, number>;
  previousPeriodSkillXp: Map<string, number>;
  skillXpTrendBySkill: {
    bySkill: Map<string, SkillContributionXpTrendPoint[]>;
    emptyTrend: SkillContributionXpTrendPoint[];
  };
}): AnalyticsSkillCategoryContribution[] {
  const catsById = new Map(cats.map((cat) => [cat.id, cat]));
  const categories = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      categoryIcon: string | null;
      xpGained: number;
      skills: AnalyticsSkillCategoryContribution["skills"];
    }
  >();

  for (const skill of skills) {
    const xpGained = periodSkillXp.get(skill.id) ?? 0;
    const previousXpGained = previousPeriodSkillXp.get(skill.id) ?? 0;
    if (!skill.cat_id) {
      continue;
    }

    const cat = catsById.get(skill.cat_id);
    if (!cat) {
      continue;
    }

    const category = categories.get(cat.id) ?? {
      categoryId: cat.id,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      xpGained: 0,
      skills: [],
    };

    category.xpGained += xpGained;
    category.skills.push({
      skillId: skill.id,
      skillName: skill.name,
      skillIcon: skill.icon,
      xpGained,
      previousXpGained,
      xpPercentChange: calculateXpPercentChange(xpGained, previousXpGained),
      trendLabel: formatSkillTrendLabel(xpGained, previousXpGained),
      xpTrend: skillXpTrendBySkill.bySkill.get(skill.id) ?? skillXpTrendBySkill.emptyTrend,
      percentOfCategory: 0,
      percentOfTotal: 0,
      isActiveInRange: xpGained > 0,
    });
    categories.set(cat.id, category);
  }

  const totalXp = Array.from(categories.values()).reduce(
    (sum, category) => sum + category.xpGained,
    0
  );

  if (totalXp <= 0) {
    return [];
  }

  return Array.from(categories.values())
    .map((category) => ({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      categoryIcon: category.categoryIcon,
      xpGained: category.xpGained,
      percentOfTotal: clampPercent((category.xpGained / totalXp) * 100),
      skills: category.skills
        .map((skill) => ({
          ...skill,
          percentOfCategory:
            category.xpGained > 0
              ? clampPercent((skill.xpGained / category.xpGained) * 100)
              : 0,
          percentOfTotal: clampPercent((skill.xpGained / totalXp) * 100),
        }))
        .sort((a, b) => {
          if (a.xpGained !== b.xpGained) {
            return b.xpGained - a.xpGained;
          }
          return a.skillName.localeCompare(b.skillName);
        }),
    }))
    .filter((category) => category.xpGained > 0)
    .sort((a, b) => {
      if (a.xpGained !== b.xpGained) {
        return b.xpGained - a.xpGained;
      }
      return a.categoryName.localeCompare(b.categoryName);
    });
}

function calculateXpPercentChange(currentXp: number, previousXp: number) {
  if (previousXp <= 0) {
    return currentXp <= 0 ? 0 : null;
  }

  return ((currentXp - previousXp) / previousXp) * 100;
}

function formatSkillTrendLabel(currentXp: number, previousXp: number) {
  if (previousXp <= 0) {
    return currentXp > 0 ? "new" : "flat";
  }

  const percentChange = calculateXpPercentChange(currentXp, previousXp);
  if (percentChange == null) {
    return "new";
  }

  const roundedPercent = Math.round(percentChange);
  if (roundedPercent === 0) {
    return "flat";
  }

  return roundedPercent > 0 ? `+${roundedPercent}%` : `${roundedPercent}%`;
}

type OverviewUsableWindowMeta = WindowLite & {
  sourceKey: string;
  sourceKind: "window" | "time_block" | "day_type_time_block";
};

function normalizeOverviewWindowKind(
  value?: string | null
): OverviewUsableWindowMeta["window_kind"] {
  if (!value) {
    return "DEFAULT";
  }
  const normalized = value.toUpperCase().trim();
  if (normalized === "BREAK" || normalized === "MEAL" || normalized === "PRACTICE") {
    return normalized;
  }
  return "DEFAULT";
}

function isUsableOverviewWindow(window: Pick<WindowLite, "window_kind">) {
  // Preserve existing behavior for unknown kinds by treating them as usable.
  return window.window_kind !== "BREAK" && window.window_kind !== "MEAL";
}

function isOverviewCompletedBreak(
  instance: Pick<
    NormalizedObservedScheduleAnalyticsRow | NormalizedScheduleInstanceRow,
    "windowId" | "dayTypeTimeBlockId"
  >,
  source: OverviewUsableScheduleSource
) {
  return Boolean(
    (instance.windowId && source.breakWindowIds.has(instance.windowId)) ||
      (instance.dayTypeTimeBlockId &&
        source.breakDayTypeTimeBlockIds.has(instance.dayTypeTimeBlockId))
  );
}

function dedupeOverviewWindows(windows: OverviewUsableWindowMeta[]) {
  const deduped = new Map<string, OverviewUsableWindowMeta>();
  for (const window of windows) {
    if (!deduped.has(window.sourceKey)) {
      deduped.set(window.sourceKey, window);
    }
  }
  return Array.from(deduped.values()).sort((a, b) => {
    const startCompare = a.start_local.localeCompare(b.start_local);
    if (startCompare !== 0) {
      return startCompare;
    }
    return a.sourceKey.localeCompare(b.sourceKey);
  });
}

function isOverviewDayTypeActiveForDate(
  dayType: {
    isTemporary: boolean;
    temporaryDateKey: string | null;
    temporaryExpiresAt: string | null;
  },
  dateKey: string
) {
  if (!dayType.isTemporary) {
    return true;
  }
  if (dayType.temporaryDateKey && dayType.temporaryDateKey !== dateKey) {
    return false;
  }
  if (
    dayType.temporaryExpiresAt &&
    dayType.temporaryExpiresAt.length > 0 &&
    dayType.temporaryExpiresAt < dateKey
  ) {
    return false;
  }
  return true;
}

function buildOverviewUsableScheduleSource({
  windows,
  dayTypeAssignments,
  defaultDayTypes,
  dayTypeTimeBlocks,
}: {
  windows: RawOverviewWindowRow[];
  dayTypeAssignments: RawDayTypeAssignmentRow[];
  defaultDayTypes: RawDayTypeRow[];
  dayTypeTimeBlocks: RawDayTypeTimeBlockSnapshotRow[];
}): OverviewUsableScheduleSource {
  const generalWindows = dedupeOverviewWindows(
    windows
      .filter((row) => row.id && row.start_local && row.end_local)
      .map(
        (row) =>
          ({
            sourceKey: `window:${row.id}`,
            sourceKind: "window",
            id: row.id,
            label: normalizeText(row.label) ?? "Window",
            energy: row.energy ?? "neutral",
            start_local: row.start_local!,
            end_local: row.end_local!,
            days: Array.isArray(row.days) ? row.days : null,
            location_context_id: null,
            location_context_value: null,
            location_context_name: null,
            window_kind: normalizeOverviewWindowKind(row.window_kind),
          }) satisfies OverviewUsableWindowMeta
      )
  );
  const breakWindowIds = new Set(
    generalWindows
      .filter((window) => !isUsableOverviewWindow(window))
      .map((window) => window.id)
  );

  const dayTypeAssignmentsByDateKey = new Map<string, string>();
  for (const row of dayTypeAssignments) {
    if (
      typeof row.date_key === "string" &&
      row.date_key.length > 0 &&
      typeof row.day_type_id === "string" &&
      row.day_type_id.length > 0
    ) {
      dayTypeAssignmentsByDateKey.set(row.date_key, row.day_type_id);
    }
  }

  const normalizedDayTypes = defaultDayTypes
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id,
      days: Array.isArray(row.days) ? row.days : null,
      createdAt: row.created_at ?? null,
      isDefault: row.is_default === true,
      isTemporary: row.is_temporary === true,
      temporaryDateKey:
        typeof row.temporary_date_key === "string" &&
        row.temporary_date_key.length > 0
          ? row.temporary_date_key
          : null,
      temporaryExpiresAt:
        typeof row.temporary_expires_at === "string" &&
        row.temporary_expires_at.length > 0
          ? row.temporary_expires_at
          : null,
    }))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const dayTypesById = new Map(normalizedDayTypes.map((row) => [row.id, row]));
  const normalizedDefaultDayTypes = normalizedDayTypes
    .filter((row) => row.isDefault && !row.isTemporary)
    .map((row) => ({
      id: row.id,
      days: row.days,
      createdAt: row.createdAt,
    }));

  const dayTypeWindowsByDayTypeId = new Map<string, OverviewUsableWindowMeta[]>();
  const breakDayTypeTimeBlockIds = new Set<string>();
  for (const row of dayTypeTimeBlocks) {
    if (
      !row.id ||
      !row.day_type_id ||
      !row.time_blocks?.start_local ||
      !row.time_blocks?.end_local
    ) {
      continue;
    }

    const nextWindow = {
      sourceKey: `day_type_time_block:${row.id}`,
      sourceKind: "day_type_time_block",
      id: row.id,
      label: normalizeText(row.time_blocks.label) ?? "Time Block",
      energy: row.energy ?? "neutral",
      start_local: row.time_blocks.start_local,
      end_local: row.time_blocks.end_local,
      // Day type selection determines applicability for the day.
      days: null,
      location_context_id: null,
      location_context_value: null,
      location_context_name: null,
      window_kind: normalizeOverviewWindowKind(row.block_type),
      dayTypeTimeBlockId: row.id,
    } satisfies OverviewUsableWindowMeta;

    if (!isUsableOverviewWindow(nextWindow)) {
      breakDayTypeTimeBlockIds.add(row.id);
    }

    const existing = dayTypeWindowsByDayTypeId.get(row.day_type_id) ?? [];
    existing.push(nextWindow);
    dayTypeWindowsByDayTypeId.set(row.day_type_id, existing);
  }

  for (const [dayTypeId, entries] of dayTypeWindowsByDayTypeId) {
    dayTypeWindowsByDayTypeId.set(dayTypeId, dedupeOverviewWindows(entries));
  }

  return {
    generalWindows,
    breakWindowIds,
    breakDayTypeTimeBlockIds,
    dayTypeAssignmentsByDateKey,
    dayTypesById,
    defaultDayTypes: normalizedDefaultDayTypes,
    dayTypeWindowsByDayTypeId,
  };
}

function resolveOverviewDayTypeForDate({
  source,
  anchor,
  timeZone,
}: {
  source: OverviewUsableScheduleSource;
  anchor: Date;
  timeZone: string;
}): OverviewResolvedDayType {
  const dateKey = formatProductivityDayKey(anchor, timeZone);
  const assigned = source.dayTypeAssignmentsByDateKey.get(dateKey);
  const assignedDayType = assigned ? source.dayTypesById.get(assigned) ?? null : null;
  if (
    assigned &&
    assignedDayType &&
    isOverviewDayTypeActiveForDate(assignedDayType, dateKey)
  ) {
    return {
      resolvedDayTypeId: assigned,
      assignedDayTypeId: assigned,
      capacitySource: "assigned_day_type",
    };
  }

  const weekday = weekdayInTimeZone(anchor, timeZone);
  const weekdayMatch = source.defaultDayTypes.find((row) =>
    Array.isArray(row.days) ? row.days.includes(weekday) : false
  );
  if (weekdayMatch) {
    return {
      resolvedDayTypeId: weekdayMatch.id,
      assignedDayTypeId: assigned ?? null,
      capacitySource: "default_day_type",
    };
  }

  const fallbackDayTypeId = source.defaultDayTypes[0]?.id ?? null;
  return {
    resolvedDayTypeId: fallbackDayTypeId,
    assignedDayTypeId: assigned ?? null,
    capacitySource: fallbackDayTypeId ? "fallback" : "general_windows",
  };
}

function getProductivityDayStartForDate(date: Date, timeZone: string) {
  const parts = getDateTimeParts(date, timeZone);
  return makeZonedDate(
    {
      year: parts.year,
      month: parts.month,
      day:
        parts.hour >= PRODUCTIVITY_DAY_START_HOUR ? parts.day : parts.day - 1,
      hour: PRODUCTIVITY_DAY_START_HOUR,
      minute: 0,
      second: 0,
    },
    timeZone
  );
}

function addProductivityDay(anchor: Date, timeZone: string) {
  const parts = getDateTimeParts(anchor, timeZone);
  return makeZonedDate(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day + 1,
      hour: PRODUCTIVITY_DAY_START_HOUR,
      minute: 0,
      second: 0,
    },
    timeZone
  );
}

function clipIntervalToBounds(
  interval: { start: Date; end: Date },
  start: Date,
  end: Date
) {
  const clippedStart = new Date(Math.max(interval.start.getTime(), start.getTime()));
  const clippedEnd = new Date(Math.min(interval.end.getTime(), end.getTime()));
  if (clippedEnd.getTime() <= clippedStart.getTime()) {
    return null;
  }
  return { start: clippedStart, end: clippedEnd };
}

async function buildOverviewUsableWindowMinutes({
  usableScheduleSource,
  start,
  end,
  range,
  timeZone,
}: {
  usableScheduleSource: OverviewUsableScheduleSource;
  start: Date;
  end: Date;
  range: AnalyticsRange;
  timeZone: string;
}): Promise<OverviewUsableWindowMinutesResult> {
  const points = new Map<string, number>();
  const rangeStart = new Date(start);
  const rangeEndExclusive = new Date(end.getTime() + 1);
  const dayStart =
    range === "1d"
      ? new Date(start)
      : getProductivityDayStartForDate(start, timeZone);
  const dayEnd =
    range === "1d"
      ? new Date(start)
      : getProductivityDayStartForDate(end, timeZone);
  const hasDayTypeCapacity = usableScheduleSource.dayTypeWindowsByDayTypeId.size > 0;
  const debugDays: OverviewUsableWindowDebugDayInternal[] = [];
  let datesGenerated = 0;

  for (
    let anchor = dayStart;
    anchor.getTime() <= dayEnd.getTime();
    anchor = addProductivityDay(anchor, timeZone)
  ) {
    datesGenerated += 1;
    const dateKey = formatProductivityDayKey(anchor, timeZone);
    const resolvedDayType = resolveOverviewDayTypeForDate({
      source: usableScheduleSource,
      anchor,
      timeZone,
    });
    const dayTypeId = resolvedDayType.resolvedDayTypeId;
    const dayTypeWindows =
      typeof dayTypeId === "string"
        ? usableScheduleSource.dayTypeWindowsByDayTypeId.get(dayTypeId) ?? []
        : [];
    const dayWindowEnd = addProductivityDay(anchor, timeZone);
    const rawSourceWindows =
      dayTypeWindows.length > 0
        ? dayTypeWindows
        : !hasDayTypeCapacity
          ? usableScheduleSource.generalWindows
          : [];
    const usableSourceWindows = rawSourceWindows.filter(isUsableOverviewWindow);
    const capacitySource =
      dayTypeWindows.length > 0
        ? resolvedDayType.capacitySource
        : usableSourceWindows.length > 0
          ? "general_windows"
          : resolvedDayType.capacitySource === "general_windows"
            ? "general_windows"
            : "fallback";
    const excludedSources: AnalyticsOverviewEfficiencyDebugExcludedSource[] =
      rawSourceWindows
        .filter((window) => !isUsableOverviewWindow(window))
        .map((window) => ({
          sourceKind: window.sourceKind,
          sourceId: window.id,
          label: window.label ?? "Window",
          reason: "window_kind_break",
        }));

    if (usableSourceWindows.length === 0) {
      debugDays.push({
        dayKey: dateKey,
        dayStartUtc: anchor.toISOString(),
        dayEndUtc: new Date(dayWindowEnd.getTime() - 1).toISOString(),
        dayStartDate: new Date(anchor),
        dayEndDateExclusive: dayWindowEnd,
        assignedDayTypeId: resolvedDayType.assignedDayTypeId,
        capacitySource,
        completedMinutes: 0,
        usableWindowMinutes: 0,
        mergedIntervalCount: 0,
        intervalsBeforeMergeCount: 0,
        includedSources: [],
        excludedSources,
      });
      continue;
    }

    const instantiated =
      dayTypeWindows.length > 0
        ? buildWindowsForDateFromDayTypeBlocks(
            usableSourceWindows,
            anchor,
            timeZone
          )
        : windowsForDateFromSnapshot(usableSourceWindows, anchor, timeZone);

    // Merge overlapping usable intervals so adjacent or overlapping containers do not inflate capacity.
    const clippedInstantiated = instantiated
      .map((window) => {
        const startMs = window.dayTypeStartUtcMs ?? null;
        const endMs = window.dayTypeEndUtcMs ?? null;
        if (
          !Number.isFinite(startMs) ||
          !Number.isFinite(endMs) ||
          startMs == null ||
          endMs == null ||
          endMs <= startMs
        ) {
          excludedSources.push({
            sourceKind: inferOverviewDebugSourceKind(window),
            sourceId: window.dayTypeTimeBlockId ?? window.id,
            label: window.label ?? "Window",
            reason: "invalid_interval",
          });
          return null;
        }
        const interval = { start: new Date(startMs), end: new Date(endMs) };
        const overlapsProductivityDay =
          interval.end.getTime() > anchor.getTime() &&
          interval.start.getTime() < dayWindowEnd.getTime();
        if (!overlapsProductivityDay) {
          excludedSources.push({
            sourceKind: inferOverviewDebugSourceKind(window),
            sourceId: window.dayTypeTimeBlockId ?? window.id,
            label: window.label ?? "Window",
            reason: "outside_productivity_day",
          });
          return null;
        }
        const clippedToDay = clipIntervalToBounds(
          interval,
          anchor,
          dayWindowEnd
        );
        if (!clippedToDay) {
          excludedSources.push({
            sourceKind: inferOverviewDebugSourceKind(window),
            sourceId: window.dayTypeTimeBlockId ?? window.id,
            label: window.label ?? "Window",
            reason: "outside_productivity_day",
          });
          return null;
        }
        const overlapsSelectedRange =
          clippedToDay.end.getTime() > rangeStart.getTime() &&
          clippedToDay.start.getTime() < rangeEndExclusive.getTime();
        if (!overlapsSelectedRange) {
          excludedSources.push({
            sourceKind: inferOverviewDebugSourceKind(window),
            sourceId: window.dayTypeTimeBlockId ?? window.id,
            label: window.label ?? "Window",
            reason: "outside_selected_range",
          });
          return null;
        }
        const clippedToRange = clipIntervalToBounds(
          clippedToDay,
          rangeStart,
          rangeEndExclusive
        );
        const minutesAfterClipping = clippedToRange
          ? Math.max(
              0,
              Math.round(
                (clippedToRange.end.getTime() - clippedToRange.start.getTime()) /
                  60000
              )
            )
          : 0;
        if (clippedToRange == null || minutesAfterClipping <= 0) {
          excludedSources.push({
            sourceKind: inferOverviewDebugSourceKind(window),
            sourceId: window.dayTypeTimeBlockId ?? window.id,
            label: window.label ?? "Window",
            reason: "outside_selected_range",
          });
          return null;
        }
        return {
          id: `${dateKey}:${window.dayTypeTimeBlockId ?? window.id}`,
          sourceKind: inferOverviewDebugSourceKind(window),
          sourceId: window.dayTypeTimeBlockId ?? window.id,
          label: window.label ?? "Window",
          startLocal: window.start_local,
          endLocal: window.end_local,
          minutesAfterClipping,
          start: clippedToRange.start,
          end: clippedToRange.end,
        };
      })
      .filter(
        (
          interval
        ): interval is {
          id: string;
          sourceKind: AnalyticsOverviewEfficiencyDebugSource["sourceKind"];
          sourceId: string;
          label: string;
          startLocal: string | null;
          endLocal: string | null;
          minutesAfterClipping: number;
          start: Date;
          end: Date;
        } => interval !== null
      )
      .map((interval, index) => ({
        id: `${dateKey}:${index}`,
        sourceKind: interval.sourceKind,
        sourceId: interval.sourceId,
        startLocal: interval.startLocal,
        endLocal: interval.endLocal,
        minutesAfterClipping: interval.minutesAfterClipping,
        start_local: interval.startLocal ?? "",
        end_local: interval.endLocal ?? "",
        label: interval.label,
        energy: null,
        days: null,
        location_context_id: null,
        location_context_value: null,
        location_context_name: null,
        window_kind: "DEFAULT" as const,
        dayTypeStartUtcMs: interval.start.getTime(),
        dayTypeEndUtcMs: interval.end.getTime(),
      }));
    const intervals = mergeWindowIntervals(clippedInstantiated);
    let mergedMinutes = intervals.reduce(
      (sum, interval) =>
        sum +
        Math.max(
          0,
          Math.round((interval.end.getTime() - interval.start.getTime()) / 60000)
        ),
      0
    );
    if (mergedMinutes > 1440) {
      console.warn("[analytics:overview-efficiency] day capacity exceeded 1440m", {
        date: dateKey,
        mergedMinutes,
        dayTypeId,
        source: capacitySource,
      });
      mergedMinutes = 1440;
    }
    debugDays.push({
      dayKey: dateKey,
      dayStartUtc: anchor.toISOString(),
      dayEndUtc: new Date(dayWindowEnd.getTime() - 1).toISOString(),
      dayStartDate: new Date(anchor),
      dayEndDateExclusive: dayWindowEnd,
      assignedDayTypeId: resolvedDayType.assignedDayTypeId,
      capacitySource,
      completedMinutes: 0,
      usableWindowMinutes: mergedMinutes,
      mergedIntervalCount: intervals.length,
      intervalsBeforeMergeCount: clippedInstantiated.length,
      includedSources: clippedInstantiated.map((interval) => ({
        sourceKind: interval.sourceKind,
        sourceId: interval.sourceId,
        label: interval.label,
        startLocal: interval.startLocal,
        endLocal: interval.endLocal,
        minutesAfterClipping: interval.minutesAfterClipping,
      })),
      excludedSources,
    });

    if (range === "1d") {
      let remainingMinutes = mergedMinutes;
      for (const interval of intervals) {
        if (remainingMinutes <= 0) {
          break;
        }
        const intervalMinutes = Math.max(
          0,
          Math.round((interval.end.getTime() - interval.start.getTime()) / 60000)
        );
        if (intervalMinutes <= 0) {
          continue;
        }
        if (intervalMinutes > remainingMinutes) {
          const truncatedEnd = new Date(
            interval.start.getTime() + remainingMinutes * 60000
          );
          addIntervalMinutesToHourlyTotals(
            points,
            interval.start,
            truncatedEnd,
            start,
            end
          );
          remainingMinutes = 0;
          break;
        }
        addIntervalMinutesToHourlyTotals(
          points,
          interval.start,
          interval.end,
          start,
          end
        );
        remainingMinutes -= intervalMinutes;
      }
      continue;
    }

    points.set(dateKey, mergedMinutes);
  }

  const suspiciousDays = debugDays.filter(
    (day) =>
      day.capacitySource === "general_windows" ||
      day.intervalsBeforeMergeCount > 20 ||
      day.usableWindowMinutes > 900
  );
  if (suspiciousDays.length > 0) {
    console.warn("[analytics:overview-efficiency] debug", {
      range,
      datesGenerated,
      generalWindows: usableScheduleSource.generalWindows.length,
      dayTypeWindows: Array.from(
        usableScheduleSource.dayTypeWindowsByDayTypeId.values()
      ).reduce((sum, windows) => sum + windows.length, 0),
      days: suspiciousDays.map((day) => ({
        dayKey: day.dayKey,
        assignedDayTypeId: day.assignedDayTypeId,
        capacitySource: day.capacitySource,
        intervalsBeforeMergeCount: day.intervalsBeforeMergeCount,
        mergedIntervalCount: day.mergedIntervalCount,
        usableWindowMinutes: day.usableWindowMinutes,
      })),
    });
  }

  return {
    minutesByPoint: points,
    perDay: debugDays,
  };
}

function inferOverviewDebugSourceKind(
  window: Pick<OverviewUsableWindowMeta, "sourceKind">
): AnalyticsOverviewEfficiencyDebugSource["sourceKind"] {
  return window.sourceKind;
}

function buildOverviewEfficiencyDebug({
  range,
  start,
  end,
  overviewDaily,
  timeZone,
  totalCompletedMinutes,
  totalUsableWindowMinutes,
  rangeEfficiencyRate,
}: {
  range: AnalyticsRange;
  start: Date;
  end: Date;
  overviewDaily: {
    overviewDaily: AnalyticsOverviewDailyPoint[];
    overviewEfficiencyDebugPerDay: OverviewUsableWindowDebugDayInternal[];
    overviewEfficiencyCompletedDebug: OverviewDailySeriesCompletedDebug;
  };
  timeZone: string;
  totalCompletedMinutes: number;
  totalUsableWindowMinutes: number;
  rangeEfficiencyRate: number;
}): AnalyticsOverviewEfficiencyDebug {
  const completedMinutesByDayKey = new Map<string, number>();

  if (range === "1d") {
    const dayKey = formatProductivityDayKey(start, timeZone);
    completedMinutesByDayKey.set(
      dayKey,
      overviewDaily.overviewDaily.reduce(
        (sum, point) => sum + point.completedMinutes,
        0
      )
    );
  } else {
    for (const point of overviewDaily.overviewDaily) {
      const dayKey = point.date;
      completedMinutesByDayKey.set(
        dayKey,
        (completedMinutesByDayKey.get(dayKey) ?? 0) + point.completedMinutes
      );
    }
  }

  return {
    selectedRange: range,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    totalCompletedMinutes,
    totalUsableWindowMinutes,
    rangeEfficiencyRate,
    completed: overviewDaily.overviewEfficiencyCompletedDebug,
    perDay: overviewDaily.overviewEfficiencyDebugPerDay.map((day) => ({
      dayKey: day.dayKey,
      dayStartUtc: day.dayStartUtc,
      dayEndUtc: day.dayEndUtc,
      assignedDayTypeId: day.assignedDayTypeId,
      capacitySource: day.capacitySource,
      completedMinutes: completedMinutesByDayKey.get(day.dayKey) ?? 0,
      usableWindowMinutes: day.usableWindowMinutes,
      mergedIntervalCount: day.mergedIntervalCount,
      intervalsBeforeMergeCount: day.intervalsBeforeMergeCount,
      includedSources: day.includedSources,
      excludedSources: day.excludedSources,
    })),
  };
}

function mergeWindowIntervals(
  windows: Array<Pick<WindowLite, "dayTypeStartUtcMs" | "dayTypeEndUtcMs">>
) {
  const sorted = windows
    .map((window) => {
      const startMs = window.dayTypeStartUtcMs ?? null;
      const endMs = window.dayTypeEndUtcMs ?? null;
      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        startMs == null ||
        endMs == null ||
        endMs <= startMs
      ) {
        return null;
      }
      return {
        start: new Date(startMs),
        end: new Date(endMs),
      };
    })
    .filter((interval): interval is { start: Date; end: Date } => interval !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: Array<{ start: Date; end: Date }> = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start.getTime() > previous.end.getTime()) {
      merged.push(interval);
      continue;
    }
    if (interval.end.getTime() > previous.end.getTime()) {
      previous.end = interval.end;
    }
  }
  return merged;
}

function addIntervalMinutesToHourlyPointField(
  points: Map<string, AnalyticsOverviewDailyPoint>,
  intervalStart: Date | string,
  intervalEnd: Date | string,
  rangeStart: Date,
  rangeEnd: Date,
  field: "completedMinutes"
) {
  const start = intervalStart instanceof Date ? intervalStart : parseDate(intervalStart);
  const end = intervalEnd instanceof Date ? intervalEnd : parseDate(intervalEnd);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return;
  }

  const clampedStart = new Date(Math.max(start.getTime(), rangeStart.getTime()));
  const clampedEnd = new Date(Math.min(end.getTime(), rangeEnd.getTime()));
  if (clampedEnd.getTime() <= clampedStart.getTime()) {
    return;
  }

  let cursor = new Date(clampedStart);
  cursor.setUTCMinutes(0, 0, 0);

  while (cursor.getTime() < clampedEnd.getTime()) {
    const bucketStart = cursor;
    const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
    const overlapMinutes = Math.round(
      Math.max(
        0,
        Math.min(clampedEnd.getTime(), bucketEnd.getTime()) -
          Math.max(clampedStart.getTime(), bucketStart.getTime())
      ) / 60000
    );

    if (overlapMinutes > 0) {
      const key = formatHourBucketKey(bucketStart);
      const point = points.get(key);
      if (point) {
        point[field] += overlapMinutes;
      }
    }

    cursor = bucketEnd;
  }
}

function addIntervalMinutesToDailyPointField(
  points: Map<string, AnalyticsOverviewDailyPoint>,
  intervalStart: Date,
  intervalEnd: Date,
  timeZone: string,
  field: "completedMinutes"
) {
  if (intervalEnd.getTime() <= intervalStart.getTime()) {
    return;
  }

  for (
    let dayStart = getProductivityDayStartForDate(intervalStart, timeZone);
    dayStart.getTime() < intervalEnd.getTime();
    dayStart = addProductivityDay(dayStart, timeZone)
  ) {
    const dayEnd = addProductivityDay(dayStart, timeZone);
    const overlapMinutes = Math.round(
      Math.max(
        0,
        Math.min(intervalEnd.getTime(), dayEnd.getTime()) -
          Math.max(intervalStart.getTime(), dayStart.getTime())
      ) / 60000
    );
    if (overlapMinutes <= 0) {
      continue;
    }

    const point = points.get(formatProductivityDayKey(dayStart, timeZone));
    if (point) {
      point[field] += overlapMinutes;
    }
  }
}

function addIntervalMinutesToHourlyTotals(
  points: Map<string, number>,
  intervalStart: Date | string,
  intervalEnd: Date | string,
  rangeStart: Date,
  rangeEnd: Date
) {
  const start = intervalStart instanceof Date ? intervalStart : parseDate(intervalStart);
  const end = intervalEnd instanceof Date ? intervalEnd : parseDate(intervalEnd);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return;
  }

  const clampedStart = new Date(Math.max(start.getTime(), rangeStart.getTime()));
  const clampedEnd = new Date(Math.min(end.getTime(), rangeEnd.getTime()));
  if (clampedEnd.getTime() <= clampedStart.getTime()) {
    return;
  }

  let cursor = new Date(clampedStart);
  cursor.setUTCMinutes(0, 0, 0);

  while (cursor.getTime() < clampedEnd.getTime()) {
    const bucketStart = cursor;
    const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
    const overlapMinutes = Math.round(
      Math.max(
        0,
        Math.min(clampedEnd.getTime(), bucketEnd.getTime()) -
          Math.max(clampedStart.getTime(), bucketStart.getTime())
      ) / 60000
    );

    if (overlapMinutes > 0) {
      const key = formatHourBucketKey(bucketStart);
      points.set(key, (points.get(key) ?? 0) + overlapMinutes);
    }

    cursor = bucketEnd;
  }
}

function normalizeScheduleSourceType(
  value: string | null | undefined
): ScheduleSourceType | null {
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (
    normalized === "PROJECT" ||
    normalized === "TASK" ||
    normalized === "HABIT" ||
    normalized === "EVENT"
  ) {
    return normalized as ScheduleSourceType;
  }
  return null;
}

function normalizeScheduleSummaryType(
  value: string | null | undefined
): ScheduleSummaryType {
  const normalized = normalizeScheduleSourceType(value);
  if (!normalized) {
    return "unknown";
  }
  return SCHEDULE_SOURCE_TYPE_MAP[normalized];
}

function normalizeCompletionSummaryType(
  value: string | null | undefined
): OverviewCompletionSummaryType {
  if (value?.toUpperCase() === "GOAL") {
    return "goal";
  }
  return normalizeScheduleSummaryType(value);
}

function normalizeScheduleStatus(
  value: string | null | undefined
): ScheduleInstanceStatus | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (
    normalized === "scheduled" ||
    normalized === "completed" ||
    normalized === "missed" ||
    normalized === "canceled"
  ) {
    return normalized;
  }
  return null;
}

function normalizeObservedScheduleStatus(
  value: string | null | undefined
): "scheduled" | "completed" | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "completed") {
    return "completed";
  }
  if (normalized === "scheduled") {
    return "scheduled";
  }
  return null;
}

function deriveDurationMinutes(
  duration: number | null | undefined,
  startUtc: string,
  endUtc: string
) {
  if (
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
  ) {
    return Math.max(1, Math.round(duration));
  }
  const start = parseDate(startUtc);
  const end = parseDate(endUtc);
  if (!start || !end) {
    return 30;
  }
  const diffMs = end.getTime() - start.getTime();
  const minutes = Math.round(diffMs / (60 * 1000));
  return Math.max(1, minutes);
}

function fallbackScheduleLabel(type: ScheduleSourceType) {
  switch (type) {
    case "PROJECT":
      return "Project focus";
    case "TASK":
      return "Task event";
    case "HABIT":
      return "Habit session";
    case "EVENT":
      return "Event";
    default:
      return "Event";
  }
}

function collectCancelledScheduleInstances(
  events: Array<{ schedule_instance_id: string | null; amount: number | null }>
) {
  const cancelled = new Set<string>();
  const aggregates = new Map<string, { sum: number; count: number }>();
  for (const event of events) {
    const scheduleId =
      typeof event.schedule_instance_id === "string"
        ? event.schedule_instance_id
        : null;
    if (!scheduleId) continue;
    const amount = Number(event.amount ?? 0);
    const current = aggregates.get(scheduleId);
    if (current) {
      current.sum += amount;
      current.count += 1;
    } else {
      aggregates.set(scheduleId, { sum: amount, count: 1 });
    }
  }
  for (const [id, stats] of aggregates.entries()) {
    if (stats.count > 0 && stats.sum === 0) {
      cancelled.add(id);
    }
  }
  return cancelled;
}

function buildScheduleSummary(
  instances: NormalizedObservedScheduleAnalyticsRow[],
  now: Date
): AnalyticsScheduleSummary {
  const byTypeMap = new Map<
    ScheduleSummaryType,
    AnalyticsScheduleSummary["byType"][number]
  >(
    ["project", "task", "habit", "unknown"].map((type) => [
      type as ScheduleSummaryType,
      { type: type as ScheduleSummaryType, planned: 0, completed: 0, missed: 0, minutes: 0 },
    ])
  );

  let completedEvents = 0;
  let scheduledEvents = 0;
  let missedEvents = 0;
  let completedMinutes = 0;
  let missedMinutes = 0;
  let pastEvents = 0;
  let completedPastEvents = 0;
  let upcomingScheduledEvents = 0;

  for (const instance of instances) {
    const bucket = byTypeMap.get(instance.sourceType);
    const effectiveStatus = getEffectiveObservedSummaryStatus(instance, now);
    if (!bucket || !effectiveStatus) {
      continue;
    }

    const classification = classifyObservedScheduleInstance(instance, now);

    if (effectiveStatus === "completed") {
      completedEvents += 1;
      completedMinutes += instance.durationMinutes;
      bucket.completed += 1;
      bucket.planned += 1;
      bucket.minutes += instance.durationMinutes;
      if (classification.isAssigned) {
        if (classification.isPast) {
          pastEvents += 1;
          completedPastEvents += 1;
        }
      }
      continue;
    }

    if (effectiveStatus === "missed") {
      missedEvents += 1;
      missedMinutes += instance.durationMinutes;
      bucket.missed += 1;
      bucket.planned += 1;
      if (classification.isAssigned && classification.isPast) {
        pastEvents += 1;
      }
      continue;
    }

    if (effectiveStatus === "scheduled") {
      scheduledEvents += 1;
      bucket.planned += 1;
      if (classification.isAssigned) {
        if (classification.isPast) {
          pastEvents += 1;
        } else {
          upcomingScheduledEvents += 1;
        }
      }
      continue;
    }
  }

  const plannedEvents = completedEvents + scheduledEvents + missedEvents;
  const assignedExecutionRate =
    pastEvents > 0
      ? Math.round((completedPastEvents / pastEvents) * 100)
      : 0;

  return {
    plannedEvents,
    completedEvents,
    missedEvents,
    scheduledEvents,
    executionRate:
      plannedEvents > 0 ? Math.round((completedEvents / plannedEvents) * 100) : 0,
    pastEvents,
    completedPastEvents,
    upcomingScheduledEvents,
    assignedExecutionRate,
    missedRate:
      plannedEvents > 0 ? Math.round((missedEvents / plannedEvents) * 100) : 0,
    completedMinutes,
    missedMinutes,
    byType: Array.from(byTypeMap.values()),
  };
}

function buildUnscheduledPressure(
  instances: NormalizedScheduleInstanceRow[],
  habits: NormalizedHabitRow[],
  now: Date
): AnalyticsUnscheduledPressure {
  const habitNameById = new Map(habits.map((habit) => [habit.id, habit.name]));
  const pressureHabits = new Map<
    string,
    { id: string; name: string; durationMinutes: number }
  >();
  let blocks = 0;
  let minutes = 0;

  for (const instance of instances) {
    if (instance.status !== "missed") {
      continue;
    }
    const classification = classifyScheduleInstance(instance, now);
    if (
      classification.isAssigned ||
      instance.scheduleSourceType !== "HABIT" ||
      !instance.sourceId
    ) {
      continue;
    }

    blocks += 1;
    minutes += instance.durationMinutes;

    const existing = pressureHabits.get(instance.sourceId);
    if (existing) {
      existing.durationMinutes += instance.durationMinutes;
      continue;
    }

    pressureHabits.set(instance.sourceId, {
      id: instance.sourceId,
      name: habitNameById.get(instance.sourceId) ?? "Untitled habit",
      durationMinutes: instance.durationMinutes,
    });
  }

  return {
    blocks,
    minutes,
    habits: Array.from(pressureHabits.values()).sort(
      (a, b) => b.durationMinutes - a.durationMinutes || a.name.localeCompare(b.name)
    ),
  };
}

function buildTodaySummary(
  instances: NormalizedObservedScheduleAnalyticsRow[],
  now: Date,
  dayStart: Date,
  dayEnd: Date
): AnalyticsTodaySummary {
  const byTypeMap = new Map<TodaySummaryType, AnalyticsTodaySummary["byType"][number]>(
    ["project", "task", "habit", "unknown"].map((type) => [
      type as TodaySummaryType,
      {
        type: type as TodaySummaryType,
        planned: 0,
        completed: 0,
        missed: 0,
        scheduled: 0,
      },
    ])
  );

  let completedEvents = 0;
  let scheduledEvents = 0;
  let missedEvents = 0;
  let completedMinutes = 0;

  for (const instance of instances) {
    const bucket = byTypeMap.get(instance.sourceType);
    const effectiveStatus = getEffectiveObservedSummaryStatus(instance, now);
    if (!bucket || !effectiveStatus) {
      continue;
    }

    if (effectiveStatus === "completed") {
      completedEvents += 1;
      completedMinutes += instance.durationMinutes;
      bucket.completed += 1;
      bucket.planned += 1;
      continue;
    }

    if (effectiveStatus === "missed") {
      missedEvents += 1;
      bucket.missed += 1;
      bucket.planned += 1;
      continue;
    }

    if (effectiveStatus === "scheduled") {
      scheduledEvents += 1;
      bucket.scheduled += 1;
      bucket.planned += 1;
    }
  }

  const plannedEvents = completedEvents + scheduledEvents + missedEvents;

  return {
    dayStartUtc: dayStart.toISOString(),
    dayEndUtc: dayEnd.toISOString(),
    plannedEvents,
    completedEvents,
    missedEvents,
    scheduledEvents,
    executionRate:
      plannedEvents > 0 ? Math.round((completedEvents / plannedEvents) * 100) : 0,
    completedMinutes,
    remainingScheduledEvents: scheduledEvents,
    byType: Array.from(byTypeMap.values()),
  };
}

function splitByPeriod<T>(
  items: T[],
  start: Date,
  end: Date,
  previousStart: Date,
  previousEnd: Date,
  getDate: (item: T) => Date | null
) {
  const current: T[] = [];
  const previous: T[] = [];

  for (const item of items) {
    const date = getDate(item);
    if (!date) continue;
    if (isWithinRange(date, start, end)) {
      current.push(item);
    } else if (isWithinRange(date, previousStart, previousEnd)) {
      previous.push(item);
    }
  }

  return { current, previous };
}

function isWithinRange(date: Date | null, start: Date, end: Date) {
  if (!date) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function makeKpi(
  id: AnalyticsKpiId,
  label: string,
  current: number,
  previous: number
): AnalyticsKpi {
  return {
    id,
    label,
    value: Math.round(current),
    delta: Math.round(current - previous),
  } satisfies AnalyticsKpi;
}

function skillCost(level: number, prestige: number) {
  const base = (() => {
    if (level >= 1 && level <= 9) return 10;
    if (level >= 10 && level <= 19) return 14;
    if (level >= 20 && level <= 29) return 20;
    if (level >= 30 && level <= 39) return 24;
    if (level >= 40 && level <= 99) return 30;
    if (level === 100) return 50;
    return 30;
  })();

  return base + Math.max(0, prestige ?? 0) * 2;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function buildWindowHeatmap(
  windows: Array<{
    days?: number[] | null;
    start_local?: string | null;
    end_local?: string | null;
  }>
) {
  const rows = 7;
  const columns = 4;
  const heatmap = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => 0)
  );

  const bucketBounds = [0, 360, 720, 1080, 1440];

  for (const window of windows) {
    const days = Array.isArray(window.days) ? window.days : [];
    const start = parseMinutes(window.start_local);
    const end = parseMinutes(window.end_local);
    if (start === null || end === null || end <= start) continue;

    for (const day of days) {
      const row = normalizeDayIndex(day);
      if (row === null) continue;

      for (let bucket = 0; bucket < columns; bucket++) {
        const bucketStart = bucketBounds[bucket];
        const bucketEnd = bucketBounds[bucket + 1];
        const overlap = Math.max(
          0,
          Math.min(end, bucketEnd) - Math.max(start, bucketStart)
        );
        if (overlap > 0) {
          heatmap[row][bucket] += overlap;
        }
      }
    }
  }

  const flat = heatmap.flat();
  const max = flat.length ? Math.max(...flat) : 0;

  if (max === 0) {
    return heatmap.map((row) => row.map(() => 0));
  }

  return heatmap.map((row) =>
    row.map((value) => Math.round((value / max) * 100))
  );
}

function parseMinutes(value: string | null | undefined) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    minutes < 0
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function normalizeDayIndex(value: number) {
  if (!Number.isFinite(value)) return null;
  const normalized = ((Math.round(value) % 7) + 7) % 7;
  return normalized;
}

function buildEnergyBreakdown(windows: Array<{ energy?: string | null }>) {
  const counts = new Map<string, number>();
  for (const window of windows) {
    const key = (window.energy ?? "Unknown").toString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([label, value]) => ({
    label,
    value,
  }));
}

async function buildTimeBlockPerformanceSummary({
  client,
  userId,
  instances,
  now,
}: {
  client: SupabaseClient<Database>;
  userId: string;
  instances: NormalizedObservedScheduleAnalyticsRow[];
  now: Date;
}): Promise<AnalyticsTimeBlockPerformance[]> {
  const relevantInstances = instances.filter(
    (instance) =>
      Boolean(
        instance.timeBlockId || instance.dayTypeTimeBlockId || instance.windowId
      ) &&
      getEffectiveObservedSummaryStatus(instance, now) !== null
  );

  if (relevantInstances.length === 0) {
    return [];
  }

  const timeBlockIds = Array.from(
    new Set(
      relevantInstances
        .map((instance) => instance.timeBlockId)
        .filter((id): id is string => typeof id === "string")
    )
  );
  const dayTypeTimeBlockIds = Array.from(
    new Set(
      relevantInstances
        .map((instance) => instance.dayTypeTimeBlockId)
        .filter((id): id is string => typeof id === "string")
    )
  );
  const windowIds = Array.from(
    new Set(
      relevantInstances
        .map((instance) => instance.windowId)
        .filter((id): id is string => typeof id === "string")
    )
  );

  const [timeBlocksRes, dayTypeTimeBlocksRes, windowsRes] = await Promise.all([
    timeBlockIds.length > 0
      ? client
          .from("time_blocks")
          .select("id, label, start_local, end_local")
          .eq("user_id", userId)
          .in("id", timeBlockIds)
      : Promise.resolve({ data: [], error: null }),
    dayTypeTimeBlockIds.length > 0
      ? client
          .from("day_type_time_blocks")
          .select(
            "id, time_block_id, time_blocks(label, start_local, end_local)"
          )
          .eq("user_id", userId)
          .in("id", dayTypeTimeBlockIds)
      : Promise.resolve({ data: [], error: null }),
    windowIds.length > 0
      ? client
          .from("windows")
          .select("id, label")
          .eq("user_id", userId)
          .in("id", windowIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const lookupError =
    timeBlocksRes.error || dayTypeTimeBlocksRes.error || windowsRes.error;
  if (lookupError) {
    throw lookupError;
  }

  const timeBlockMetaById = new Map<
    string,
    { label: string | null; startLocal: string | null; endLocal: string | null }
  >();
  for (const row of (timeBlocksRes.data ?? []) as TimeBlockLabelRow[]) {
    if (row.id) {
      timeBlockMetaById.set(row.id, {
        label: normalizeText(row.label),
        startLocal: normalizeTimeValue(row.start_local),
        endLocal: normalizeTimeValue(row.end_local),
      });
    }
  }

  const dayTypeTimeBlockMetaById = new Map<
    string,
    {
      timeBlockId: string | null;
      label: string | null;
      startLocal: string | null;
      endLocal: string | null;
    }
  >();
  for (const row of (dayTypeTimeBlocksRes.data ?? []) as DayTypeTimeBlockLabelRow[]) {
    if (!row.id) {
      continue;
    }
    dayTypeTimeBlockMetaById.set(row.id, {
      timeBlockId:
        typeof row.time_block_id === "string" && row.time_block_id.length > 0
          ? row.time_block_id
          : null,
      label: normalizeText(row.time_blocks?.label),
      startLocal: normalizeTimeValue(row.time_blocks?.start_local),
      endLocal: normalizeTimeValue(row.time_blocks?.end_local),
    });
  }

  const windowLabelById = new Map<string, string>();
  for (const row of (windowsRes.data ?? []) as WindowLabelRow[]) {
    const label = normalizeText(row.label);
    if (row.id && label) {
      windowLabelById.set(row.id, label);
    }
  }

  const groups = new Map<string, AnalyticsTimeBlockPerformance>();

  for (const instance of relevantInstances) {
    const directTimeBlockMeta = instance.timeBlockId
      ? timeBlockMetaById.get(instance.timeBlockId) ?? null
      : null;
    const dayTypeTimeBlockMeta = instance.dayTypeTimeBlockId
      ? dayTypeTimeBlockMetaById.get(instance.dayTypeTimeBlockId) ?? null
      : null;
    const dayTypeTimeBlockLabel =
      dayTypeTimeBlockMeta?.label ??
      (dayTypeTimeBlockMeta?.timeBlockId
        ? timeBlockMetaById.get(dayTypeTimeBlockMeta.timeBlockId)?.label ?? null
        : null);
    const windowLabel = instance.windowId
      ? windowLabelById.get(instance.windowId) ?? null
      : null;
    const resolvedTimeBlockId =
      instance.timeBlockId ?? dayTypeTimeBlockMeta?.timeBlockId ?? null;
    const joinedTimeBlockMeta =
      dayTypeTimeBlockMeta?.timeBlockId != null
        ? timeBlockMetaById.get(dayTypeTimeBlockMeta.timeBlockId) ?? null
        : null;
    const resolvedStartLocal =
      directTimeBlockMeta?.startLocal ??
      dayTypeTimeBlockMeta?.startLocal ??
      joinedTimeBlockMeta?.startLocal ??
      null;
    const resolvedEndLocal =
      directTimeBlockMeta?.endLocal ??
      dayTypeTimeBlockMeta?.endLocal ??
      joinedTimeBlockMeta?.endLocal ??
      null;
    const resolvedLabel =
      directTimeBlockMeta?.label ??
      dayTypeTimeBlockLabel ??
      windowLabel ??
      "Unnamed Time Block";
    const resolvedId =
      resolvedTimeBlockId != null
        ? `time_block:${resolvedTimeBlockId}`
        : instance.windowId != null
          ? `window:${instance.windowId}`
          : instance.dayTypeTimeBlockId != null
            ? `day_type_time_block:${instance.dayTypeTimeBlockId}`
            : `time_block:${resolvedLabel.toLowerCase()}`;

    const group = groups.get(resolvedId) ?? {
      id: resolvedId,
      label: resolvedLabel,
      startLocal: resolvedStartLocal,
      endLocal: resolvedEndLocal,
      plannedEvents: 0,
      completedEvents: 0,
      scheduledEvents: 0,
      missedEvents: 0,
      completionRate: 0,
      missedRate: 0,
      totalMinutes: 0,
      completedMinutes: 0,
    };

    const effectiveStatus = getEffectiveObservedSummaryStatus(instance, now);
    if (!effectiveStatus) {
      continue;
    }

    group.plannedEvents += 1;
    group.totalMinutes += instance.durationMinutes;

    if (effectiveStatus === "completed") {
      group.completedEvents += 1;
      group.completedMinutes += instance.durationMinutes;
    } else if (effectiveStatus === "missed") {
      group.missedEvents += 1;
    } else if (effectiveStatus === "scheduled") {
      group.scheduledEvents += 1;
    }

    groups.set(resolvedId, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      completionRate:
        group.plannedEvents > 0
          ? Math.round((group.completedEvents / group.plannedEvents) * 100)
          : 0,
      missedRate:
        group.plannedEvents > 0
          ? Math.round((group.missedEvents / group.plannedEvents) * 100)
          : 0,
    }))
    .sort((a, b) => {
      const startCompare = compareLocalTimes(a.startLocal, b.startLocal);
      if (startCompare !== 0) {
        return startCompare;
      }
      return a.label.localeCompare(b.label);
    });
}

function normalizeTimeValue(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compareLocalTimes(a: string | null, b: string | null) {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }
  return a.localeCompare(b);
}

function classifyScheduleInstance(
  instance: NormalizedScheduleInstanceRow,
  now: Date
) {
  const isAssigned = Boolean(
    instance.timeBlockId || instance.dayTypeTimeBlockId || instance.windowId
  );
  const end = parseDate(instance.endUtc);
  const isPast = end ? end.getTime() < now.getTime() : false;

  return {
    isAssigned,
    isPast,
    isFutureOrCurrent: !isPast,
  };
}

function classifyObservedScheduleInstance(
  instance: Pick<
    NormalizedObservedScheduleAnalyticsRow,
    "endUtc" | "timeBlockId" | "dayTypeTimeBlockId" | "windowId"
  >,
  now: Date
) {
  const isAssigned = Boolean(
    instance.timeBlockId || instance.dayTypeTimeBlockId || instance.windowId
  );
  const end = parseDate(instance.endUtc);
  const isPast = end ? end.getTime() < now.getTime() : false;

  return {
    isAssigned,
    isPast,
    isFutureOrCurrent: !isPast,
  };
}

function getEffectiveObservedSummaryStatus(
  instance: NormalizedObservedScheduleAnalyticsRow,
  now: Date
): "completed" | "scheduled" | "missed" | null {
  if (instance.status === "completed") {
    return "completed";
  }

  if (instance.status !== "scheduled") {
    return null;
  }

  const end = parseDate(instance.endUtc);
  const start = parseDate(instance.startUtc);
  const comparisonDate = end ?? start;

  if (comparisonDate && comparisonDate.getTime() < now.getTime()) {
    return "missed";
  }

  return "scheduled";
}

function buildActivityFeed(input: {
  xpEvents: Array<{
    id: string;
    created_at: string | null;
    amount?: number | null;
    kind?: string | null;
  }>;
  tasks: Array<{ id: string; created_at: string | null; name?: string | null }>;
  projects: Array<{
    id: string;
    created_at: string | null;
    name?: string | null;
  }>;
  habits: Array<{
    id: string;
    created_at: string | null;
    name?: string | null;
  }>;
  monuments: Array<{
    id: string;
    created_at: string | null;
    title?: string | null;
    name?: string | null;
  }>;
  windows: Array<{
    id: string;
    created_at: string | null;
    label?: string | null;
  }>;
  goals: Array<{ id: string; created_at: string | null; name?: string | null }>;
}): AnalyticsActivityEvent[] {
  const events: AnalyticsActivityEvent[] = [];

  const pushEvent = (id: string, created_at: string | null, label: string) => {
    const date = parseDate(created_at);
    if (!date) return;
    events.push({ id, date: date.toISOString(), label });
  };

  for (const event of input.xpEvents) {
    const kind = event.kind ?? "activity";
    const amount = event.amount ?? 0;
    pushEvent(
      `xp-${event.id}`,
      event.created_at,
      amount ? `Gained ${amount} XP from ${kind}` : `Logged ${kind} activity`
    );
  }

  for (const task of input.tasks) {
    const name = task.name?.trim();
    pushEvent(
      `task-${task.id}`,
      task.created_at,
      name ? `Created task ${name}` : "Logged a new task"
    );
  }

  for (const project of input.projects) {
    const name = project.name?.trim();
    pushEvent(
      `project-${project.id}`,
      project.created_at,
      name ? `Started project ${name}` : "Created a new project"
    );
  }

  for (const habit of input.habits) {
    const name = habit.name?.trim();
    pushEvent(
      `habit-${habit.id}`,
      habit.created_at,
      name ? `Tracked habit ${name}` : "Logged a habit"
    );
  }

  for (const monument of input.monuments) {
    const title = monument.title ?? monument.name ?? "Monument";
    pushEvent(
      `monument-${monument.id}`,
      monument.created_at,
      `Progressed monument ${title}`
    );
  }

  for (const window of input.windows) {
    const label = window.label?.trim() || "Focus window";
    pushEvent(`window-${window.id}`, window.created_at, `Scheduled ${label}`);
  }

  for (const goal of input.goals) {
    const name = goal.name?.trim();
    pushEvent(
      `goal-${goal.id}`,
      goal.created_at,
      name ? `Created goal ${name}` : "Added a new goal"
    );
  }

  return events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
}

type HabitCompletionEntry = {
  habitId: string;
  timestamp: Date;
  dayIso: string;
};

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const TIME_BUCKETS = [
  { id: "early", label: "Early (before 8am)", startHour: 0, endHour: 8 },
  { id: "morning", label: "Morning (8am-noon)", startHour: 8, endHour: 12 },
  { id: "midday", label: "Midday (noon-3pm)", startHour: 12, endHour: 15 },
  { id: "afternoon", label: "Afternoon (3-6pm)", startHour: 15, endHour: 18 },
  { id: "evening", label: "Evening (6-9pm)", startHour: 18, endHour: 21 },
  { id: "late", label: "Late (after 9pm)", startHour: 21, endHour: 24 },
];

const WEEK_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function buildHabitSummary({
  completions,
  habits,
  routines,
  end,
  calendarDays = 28,
  heatmapWeeks = 6,
  fallbackDates = [],
}: {
  completions: NormalizedHabitCompletionRow[];
  habits: NormalizedHabitRow[];
  routines: NormalizedHabitRoutineRow[];
  end: Date;
  calendarDays?: number;
  heatmapWeeks?: number;
  fallbackDates?: string[];
}): AnalyticsHabitSummary {
  const baseSummary: AnalyticsHabitSummary = {
    currentStreak: 0,
    longestStreak: 0,
    calendarDays,
    calendarCompleted: [],
    routines: [],
    streakHistory: [],
    bestTimes: [],
    bestDays: [],
    weeklyReflections: [],
  };

  const completionEntries = completions
    .map((entry) => {
      const date =
        parseDate(entry.completed_at) ??
        (entry.completion_day
          ? parseDate(`${entry.completion_day}T12:00:00Z`)
          : null);
      if (!date) {
        return null;
      }
      return {
        habitId: entry.habit_id,
        timestamp: date,
        dayIso: startOfDay(date).toISOString(),
      } satisfies HabitCompletionEntry;
    })
    .filter(
      (entry): entry is HabitCompletionEntry =>
        entry !== null && Boolean(entry.habitId)
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const hasConcreteCompletions = completionEntries.length > 0;

  const fallbackEntries =
    completionEntries.length === 0 && fallbackDates.length > 0
      ? fallbackDates
          .map((iso) => parseDate(iso))
          .filter((date): date is Date => Boolean(date))
          .map((date) => ({
            habitId: "__fallback__",
            timestamp: date,
            dayIso: startOfDay(date).toISOString(),
          }))
      : [];

  const entries =
    completionEntries.length > 0 ? completionEntries : fallbackEntries;

  if (entries.length === 0) {
    return baseSummary;
  }

  const uniqueDayIsos = Array.from(
    new Set(entries.map((entry) => entry.dayIso))
  ).sort();

  const longestStreak = computeLongestRunFromIsoDays(uniqueDayIsos);
  const daySet = new Set(uniqueDayIsos);
  let currentStreak = 0;
  let cursor = startOfDay(end);
  while (daySet.has(cursor.toISOString())) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  const calendarStart = startOfDay(addDays(end, -(calendarDays - 1)));
  const calendarCompleted = uniqueDayIsos
    .map((iso) => {
      const date = new Date(iso);
      if (!isWithinRange(date, calendarStart, end)) return null;
      const diff = Math.round(
        (startOfDay(date).getTime() - calendarStart.getTime()) / MS_PER_DAY
      );
      return diff + 1;
    })
    .filter(
      (value): value is number =>
        value !== null && value >= 1 && value <= calendarDays
    )
    .sort((a, b) => a - b);

  const streakHistory = buildStreakHistoryPoints(uniqueDayIsos, end);

  const routineHeatmap =
    hasConcreteCompletions && routines.length > 0
      ? buildRoutineHeatmap({
          entries: completionEntries,
          habits,
          routines,
          end,
          weeks: heatmapWeeks,
        })
      : [];

  const bestTimes = hasConcreteCompletions
    ? buildBestTimes(completionEntries)
    : [];
  const bestDays = hasConcreteCompletions
    ? buildBestDays(completionEntries)
    : [];
  const weeklyReflections = hasConcreteCompletions
    ? buildWeeklyReflections(completionEntries, end)
    : [];

  return {
    currentStreak,
    longestStreak,
    calendarDays,
    calendarCompleted,
    routines: routineHeatmap,
    streakHistory,
    bestTimes,
    bestDays,
    weeklyReflections,
  };
}

function computeLongestRunFromIsoDays(dayIsos: string[]): number {
  if (dayIsos.length === 0) return 0;
  let longest = 0;
  let run = 0;
  let previousDate: Date | null = null;
  for (const iso of dayIsos) {
    const date = new Date(iso);
    if (!previousDate) {
      run = 1;
    } else {
      const diff = Math.round(
        (date.getTime() - previousDate.getTime()) / MS_PER_DAY
      );
      run = diff === 1 ? run + 1 : 1;
    }
    if (run > longest) {
      longest = run;
    }
    previousDate = date;
  }
  return longest;
}

function buildStreakHistoryPoints(
  dayIsos: string[],
  end: Date,
  maxWeeks = 8
): AnalyticsHabitStreakPoint[] {
  if (dayIsos.length === 0) return [];
  const weekMap = new Map<string, { start: Date; value: number }>();
  let run = 0;
  let prevDate: Date | null = null;
  for (const iso of dayIsos) {
    const date = new Date(iso);
    if (!prevDate) {
      run = 1;
    } else {
      const diff = Math.round(
        (date.getTime() - prevDate.getTime()) / MS_PER_DAY
      );
      run = diff === 1 ? run + 1 : 1;
    }
    const weekStart = startOfWeek(date);
    const key = weekStart.toISOString();
    const existing = weekMap.get(key);
    if (!existing || run > existing.value) {
      weekMap.set(key, { start: weekStart, value: run });
    }
    prevDate = date;
  }

  const ordered = Array.from(weekMap.values()).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const slice = ordered.slice(-maxWeeks);
  return slice.map((entry) => ({
    label: formatWeekLabel(entry.start),
    value: entry.value,
  }));
}

function buildRoutineHeatmap({
  entries,
  habits,
  routines,
  end,
  weeks,
}: {
  entries: HabitCompletionEntry[];
  habits: NormalizedHabitRow[];
  routines: NormalizedHabitRoutineRow[];
  end: Date;
  weeks: number;
}): AnalyticsHabitRoutine[] {
  if (entries.length === 0) return [];
  const routineNames = new Map(
    routines.map((routine) => [routine.id, routine.name])
  );
  const habitsByRoutine = new Map<string, string[]>();
  for (const habit of habits) {
    if (!habit.routine_id || !routineNames.has(habit.routine_id)) continue;
    const bucket = habitsByRoutine.get(habit.routine_id) ?? [];
    bucket.push(habit.id);
    habitsByRoutine.set(habit.routine_id, bucket);
  }
  if (habitsByRoutine.size === 0) return [];

  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const completionsByDay = new Map<string, Map<string, Set<string>>>();

  for (const entry of entries) {
    const habit = habitById.get(entry.habitId);
    const routineId = habit?.routine_id;
    if (!routineId) continue;
    let routineMap = completionsByDay.get(entry.dayIso);
    if (!routineMap) {
      routineMap = new Map<string, Set<string>>();
      completionsByDay.set(entry.dayIso, routineMap);
    }
    const habitSet = routineMap.get(routineId) ?? new Set<string>();
    habitSet.add(entry.habitId);
    routineMap.set(routineId, habitSet);
  }

  const startWeek = startOfWeek(addDays(end, -7 * (weeks - 1)));
  const result: AnalyticsHabitRoutine[] = [];

  for (const [routineId, routineHabitIds] of habitsByRoutine) {
    const heatmap: number[][] = [];
    for (let weekIndex = 0; weekIndex < weeks; weekIndex += 1) {
      const weekStart = addDays(startWeek, weekIndex * 7);
      const weekRow: number[] = [];
      for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
        const date = addDays(weekStart, dayOffset);
        if (date.getTime() > end.getTime()) {
          weekRow.push(0);
          continue;
        }
        const dayKey = startOfDay(date).toISOString();
        const routineSet = completionsByDay.get(dayKey)?.get(routineId) ?? null;
        const matched = routineSet ? routineSet.size : 0;
        const ratio =
          routineHabitIds.length === 0 ? 0 : matched / routineHabitIds.length;
        weekRow.push(Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : 0);
      }
      heatmap.push(weekRow);
    }
    const hasSignal = heatmap.some((week) => week.some((value) => value > 0));
    if (!hasSignal) continue;
    result.push({
      id: routineId,
      name: routineNames.get(routineId) ?? "Routine",
      heatmap,
    });
  }

  return result.slice(0, 4);
}

function buildBestTimes(
  entries: HabitCompletionEntry[]
): AnalyticsHabitPerformance[] {
  if (entries.length === 0) return [];
  const bucketCounts = TIME_BUCKETS.map((bucket) => ({
    ...bucket,
    count: 0,
  }));

  for (const entry of entries) {
    const hours =
      entry.timestamp.getUTCHours() + entry.timestamp.getUTCMinutes() / 60;
    const bucket =
      bucketCounts.find(
        (slot) => hours >= slot.startHour && hours < slot.endHour
      ) ?? bucketCounts[bucketCounts.length - 1];
    bucket.count += 1;
  }

  const total = entries.length || 1;
  return bucketCounts
    .filter((bucket) => bucket.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map(
      (bucket) =>
        ({
          label: bucket.label,
          successRate: bucket.count / total,
        } satisfies AnalyticsHabitPerformance)
    );
}

function buildBestDays(
  entries: HabitCompletionEntry[]
): AnalyticsHabitPerformance[] {
  if (entries.length === 0) return [];
  const counts = Array.from({ length: 7 }, () => 0);
  for (const entry of entries) {
    const dayIndex = entry.timestamp.getUTCDay();
    counts[dayIndex] += 1;
  }
  const total = entries.length || 1;
  return counts
    .map((count, index) => ({
      label: DAY_LABELS[index],
      successRate: count / total,
      count,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(
      (item) =>
        ({
          label: item.label,
          successRate: item.successRate,
        } satisfies AnalyticsHabitPerformance)
    );
}

function buildWeeklyReflections(
  entries: HabitCompletionEntry[],
  end: Date,
  maxWeeks = 4
): AnalyticsHabitWeeklyReflection[] {
  const reflections: AnalyticsHabitWeeklyReflection[] = [];
  if (entries.length === 0) return reflections;

  const entriesByWeek = new Map<string, HabitCompletionEntry[]>();
  for (const entry of entries) {
    const weekKey = startOfWeek(entry.timestamp).toISOString();
    const bucket = entriesByWeek.get(weekKey) ?? [];
    bucket.push(entry);
    entriesByWeek.set(weekKey, bucket);
  }

  const startWeek = startOfWeek(end);
  for (let offset = 0; offset < maxWeeks; offset += 1) {
    const weekStart = addDays(startWeek, -7 * offset);
    const weekEnd = addDays(weekStart, 6);
    const key = weekStart.toISOString();
    const weekEntries = entriesByWeek.get(key) ?? [];
    if (weekEntries.length === 0) {
      continue;
    }
    const dayIsoSet = Array.from(
      new Set(
        weekEntries
          .map((entry) => entry.dayIso)
          .filter((iso) => {
            const date = new Date(iso);
            return isWithinRange(date, weekStart, weekEnd);
          })
      )
    ).sort();
    const weekStreak = computeLongestRunFromIsoDays(dayIsoSet);
    const dayCounts = Array.from({ length: 7 }, () => 0);
    for (const entry of weekEntries) {
      dayCounts[entry.timestamp.getUTCDay()] += 1;
    }
    const bestDayIndex = dayCounts.reduce(
      (best, value, index) => (value > dayCounts[best] ? index : best),
      0
    );
    const bestDayLabel =
      dayCounts[bestDayIndex] > 0 ? DAY_LABELS[bestDayIndex] : "—";
    const lesson = buildReflectionLesson(
      weekStreak,
      bestDayLabel,
      weekEntries.length
    );
    const recommendation = buildReflectionRecommendation(weekStreak);

    reflections.push({
      id: `week-${key}`,
      weekLabel: formatWeekRange(weekStart),
      streak: weekStreak,
      bestDay: bestDayLabel,
      lesson,
      pinned: offset === 0,
      recommendation,
    });
  }

  return reflections;
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const weekday = start.getUTCDay();
  const diff = (weekday + 6) % 7;
  return addDays(start, -diff);
}

function formatWeekLabel(date: Date) {
  return `Week of ${WEEK_LABEL_FORMATTER.format(date)}`;
}

function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  const startLabel = WEEK_LABEL_FORMATTER.format(start);
  const endLabel = WEEK_LABEL_FORMATTER.format(end);
  return `${startLabel} – ${endLabel}`;
}

function buildReflectionLesson(streak: number, bestDay: string, total: number) {
  if (streak >= 6) {
    return `Locked in a ${streak}-day streak. Keep the chain going.`;
  }
  if (streak >= 3) {
    return `Momentum clustered around ${bestDay}. Extend it to nearby days.`;
  }
  if (total >= 3) {
    return `Logged ${total} times—batching around ${bestDay} works.`;
  }
  return "Light week. Plan deliberate check-ins earlier to regain flow.";
}

function buildReflectionRecommendation(streak: number) {
  if (streak >= 6) {
    return "Experiment with tougher goals or longer sessions.";
  }
  if (streak >= 3) {
    return "Aim to add one more consecutive day next week.";
  }
  return "Schedule two back-to-back check-ins to spark a new streak.";
}

function buildProjectDeliverySeries(
  events: Array<{ created_at: string | null }>,
  end: Date
): number[] {
  const segments = 7;
  const series = Array.from({ length: segments }, () => 0);
  const start = startOfDay(addDays(end, -(segments - 1)));

  for (const event of events) {
    const date = parseDate(event.created_at);
    if (!date) continue;
    if (!isWithinRange(date, start, end)) continue;
    const diff = Math.round(
      (startOfDay(date).getTime() - start.getTime()) / MS_PER_DAY
    );
    if (diff >= 0 && diff < segments) {
      series[diff] += 1;
    }
  }

  return series;
}

function shouldFallbackToLegacySchema(error: PostgrestError) {
  return error.code === "42703" || error.code === "42P01";
}

async function queryWithFallback<T>(
  primary: () => Promise<PostgrestResponse<T>>,
  fallback?: () => Promise<PostgrestResponse<T>>
): Promise<PostgrestResponse<T>> {
  const result = await primary();
  if (result.error && fallback && shouldFallbackToLegacySchema(result.error)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Analytics query falling back to legacy schema", {
        code: result.error.code,
        message: result.error.message,
      });
    }
    const fallbackResult = await fallback();
    if (!fallbackResult.error) {
      return fallbackResult;
    }
    return fallbackResult;
  }
  return result;
}
