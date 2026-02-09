import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  fetchWindowsForDate,
  type WindowLite,
} from "@/lib/scheduler/repo";
import {
  fetchInstancesForRange,
  type ScheduleInstance,
} from "@/lib/scheduler/instanceRepo";
import { addDaysInTimeZone, makeDateInTimeZone } from "@/lib/scheduler/timezone";
import { runAiIntent } from "@/lib/ai/openaiIntent";
import type { AiScope, AiThreadPayload } from "@/lib/types/ai";

const FALLBACK_TIME_ZONE = "America/Chicago";

function parseDayKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, month, day };
}

function formatDayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

function normalizeTimeZone(value?: string) {
  if (!value) return FALLBACK_TIME_ZONE;
  const trimmed = value.trim();
  if (!trimmed) return FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function normalizeThread(value: unknown): AiThreadPayload[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { role?: unknown }).role === "string" &&
        typeof (entry as { content?: unknown }).content === "string"
      ) {
        const roleValue = (entry as { role: string }).role;
        if (roleValue === "user" || roleValue === "assistant") {
          return {
            role: roleValue,
            content: (entry as { content: string }).content,
          };
        }
    }
    return null;
  })
  .filter((item): item is AiThreadPayload => item !== null);
}

type ScheduleSnapshotInstance = {
  id: string;
  title: string;
  start_utc_ms: number;
  end_utc_ms: number;
  completed_at: string | null;
  kind?: string;
  project_id?: string | null;
  goal_id?: string | null;
};

const SCHEDULE_INSTANCE_KIND_LABELS: Record<string, string> = {
  PROJECT: "Project",
  TASK: "Task",
  HABIT: "Habit",
};

const parseTimestampMs = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveScheduleInstanceTitle = (record: ScheduleInstance): string => {
  const explicit = record.event_name?.trim();
  if (explicit) return explicit;
  const kind = record.source_type?.trim().toUpperCase();
  if (kind) {
    if (kind in SCHEDULE_INSTANCE_KIND_LABELS) {
      return SCHEDULE_INSTANCE_KIND_LABELS[kind];
    }
    return `${kind.charAt(0)}${kind.slice(1).toLowerCase()}`;
  }
  return "Scheduled item";
};

const mapScheduleInstanceToSnapshot = (
  record: ScheduleInstance
): ScheduleSnapshotInstance | null => {
  const startMs = parseTimestampMs(record.start_utc);
  const endMs = parseTimestampMs(record.end_utc);
  if (
    startMs === null ||
    endMs === null ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return null;
  }
  return {
    id: record.id,
    title: resolveScheduleInstanceTitle(record),
    start_utc_ms: startMs,
    end_utc_ms: endMs,
    completed_at: record.completed_at ?? null,
    kind: record.source_type ?? undefined,
    project_id:
      record.source_type === "PROJECT" ? record.source_id ?? null : null,
    goal_id: null,
  };
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client unavailable" },
        { status: 500 }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const payload = (await request.json().catch(() => null)) as
      | {
          prompt?: unknown;
          scope?: unknown;
          timeZone?: unknown;
          dayKey?: unknown;
          thread?: unknown;
        }
      | null;

    const prompt =
      typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt must be a non-empty string" },
        { status: 400 }
      );
    }

    const maybeScope =
      payload?.scope === "draft_creation" ||
      payload?.scope === "schedule_edit"
        ? payload.scope
        : "read_only";

    const scope: AiScope = maybeScope;

    const timeZone = normalizeTimeZone(
      typeof payload?.timeZone === "string" ? payload.timeZone : undefined
    );

    const fallbackDayKey = formatDayKey(new Date(), timeZone);
    const requestedDayKey =
      typeof payload?.dayKey === "string" && payload.dayKey.trim()
        ? payload.dayKey.trim()
        : null;
    const parsedFallback = parseDayKey(fallbackDayKey)!;
    let dayKey = fallbackDayKey;
    let dayParts = parsedFallback;
    if (requestedDayKey) {
      const parsedRequested = parseDayKey(requestedDayKey);
      if (parsedRequested) {
        dayKey = requestedDayKey;
        dayParts = parsedRequested;
      }
    }

    const windowDate = makeDateInTimeZone(
      {
        year: dayParts.year,
        month: dayParts.month,
        day: dayParts.day,
        hour: 4,
        minute: 0,
      },
      timeZone
    );

    let windows: WindowLite[] = [];
    try {
      windows = await fetchWindowsForDate(windowDate, supabase, timeZone, {
        userId: user.id,
        useDayTypes: true,
      });
    } catch (error) {
      console.error("AI intent snapshot error fetching windows", error);
    }

    const dayStart = windowDate;
    const dayEnd = addDaysInTimeZone(dayStart, 1, timeZone);
    let scheduleInstances: ScheduleSnapshotInstance[] = [];
    try {
      const scheduleResponse = await fetchInstancesForRange(
        user.id,
        dayStart.toISOString(),
        dayEnd.toISOString(),
        supabase
      );
      if (scheduleResponse.error) {
        console.error(
          "AI intent snapshot error loading schedule instances",
          scheduleResponse.error
        );
      } else if (Array.isArray(scheduleResponse.data)) {
        scheduleInstances = scheduleResponse.data
          .map(mapScheduleInstanceToSnapshot)
          .filter(
            (entry): entry is ScheduleSnapshotInstance => entry !== null
          )
          .sort((a, b) => a.start_utc_ms - b.start_utc_ms);
      }
    } catch (error) {
      console.error(
        "AI intent snapshot error loading schedule instances",
        error
      );
    }

    const goalsResponse = await supabase
      .from("goals")
      .select("id,name,priority")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    const goals =
      goalsResponse.error || !goalsResponse.data ? [] : goalsResponse.data;
    if (goalsResponse.error) {
      console.error(
        "AI intent snapshot error loading goals",
        goalsResponse.error
      );
    }

    const projectsResponse = await supabase
      .from("projects")
      .select("id,name,global_rank,completed_at")
      .eq("user_id", user.id)
      .order("global_rank", { ascending: true, nullsFirst: false })
      .limit(10);
    const projects =
      projectsResponse.error || !projectsResponse.data
        ? []
        : projectsResponse.data;
    if (projectsResponse.error) {
      console.error(
        "AI intent snapshot error loading projects",
        projectsResponse.error
      );
    }

    const [dayTypesResponse, dayTypeTimeBlocksResponse] = await Promise.all([
      supabase
        .from("day_types")
        .select("id,name")
        .eq("user_id", user.id),
      supabase
        .from("day_type_time_blocks")
        .select(
          "id,day_type_id,time_blocks(id,label,start_local,end_local)"
        )
        .eq("user_id", user.id),
    ]);

    const dayTypes =
      dayTypesResponse.error || !dayTypesResponse.data
        ? []
        : dayTypesResponse.data;
    if (dayTypesResponse.error) {
      console.error(
        "AI intent snapshot error loading day types",
        dayTypesResponse.error
      );
    }

    const dayTypeTimeBlocks =
      dayTypeTimeBlocksResponse.error || !dayTypeTimeBlocksResponse.data
        ? []
        : dayTypeTimeBlocksResponse.data
            .map((row) => ({
              id: row.id,
              day_type_id: row.day_type_id,
              label: row.time_blocks?.label ?? "",
              start_local: row.time_blocks?.start_local ?? "",
              end_local: row.time_blocks?.end_local ?? "",
            }))
            .filter(
              (block): block is {
                id: string;
                day_type_id: string;
                label: string;
                start_local: string;
                end_local: string;
              } => Boolean(block.day_type_id && block.label)
            );
    if (dayTypeTimeBlocksResponse.error) {
      console.error(
        "AI intent snapshot error loading day type time blocks",
        dayTypeTimeBlocksResponse.error
      );
    }

    const snapshot = {
      dayKey,
      timeZone,
      windows,
      goals,
      projects,
      dayTypes,
      dayTypeTimeBlocks,
      schedule_instances: scheduleInstances,
    };

    const sanitizedThread = normalizeThread(payload?.thread);
    const limitedThread = sanitizedThread.slice(-10);
    const ai = await runAiIntent({
      prompt,
      scope,
      snapshot,
      thread: limitedThread.length ? limitedThread : undefined,
    });
    return NextResponse.json(ai);
  } catch (error) {
    console.error("AI intent route error", error);
    return NextResponse.json(
      { error: "Unable to process AI intent" },
      { status: 500 }
    );
  }
}
