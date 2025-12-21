import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
const PAGE_SIZE = 25;

type SearchResult = {
  id: string;
  name: string;
  type: "PROJECT" | "HABIT";
  nextScheduledAt: string | null;
  scheduleInstanceId: string | null;
  durationMinutes: number | null;
  nextDueAt: string | null;
  completedAt: string | null;
  isCompleted: boolean;
  global_rank?: number | null;
};

type ProjectSearchRecord = {
  id: string;
  name?: string | null;
  completed_at?: string | null;
  global_rank?: number | null;
};

type ScheduleRow = {
  id: string;
  source_id: string;
  source_type: "PROJECT" | "HABIT";
  start_utc: string | null;
  duration_min: number | null;
};

type SearchCursor = {
  startUtc: string;
  sourceType: "PROJECT" | "HABIT";
  sourceId: string;
};

function normalizeQuery(value: string | null): string {
  if (!value) return "";
  return value.trim();
}

export async function GET(request: NextRequest) {
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = normalizeQuery(searchParams.get("q"));
  const likeQuery = query
    ? `%${query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`
    : null;

  const cursor = parseCursor(searchParams);

  let projectIdFilter: string[] | null = null;
  let habitIdFilter: string[] | null = null;
  if (likeQuery) {
    const [projectIdResponse, habitIdResponse] = await Promise.all([
      supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id)
        .ilike("name", likeQuery),
      supabase
        .from("habits")
        .select("id")
        .eq("user_id", user.id)
        .ilike("name", likeQuery),
    ]);
    if (projectIdResponse.error) {
      console.error(
        "FAB search project lookup error",
        projectIdResponse.error
      );
      return NextResponse.json(
        { error: "Unable to load projects" },
        { status: 500 }
      );
    }
    if (habitIdResponse.error) {
      console.error("FAB search habit lookup error", habitIdResponse.error);
      return NextResponse.json(
        { error: "Unable to load habits" },
        { status: 500 }
      );
    }
    projectIdFilter = (projectIdResponse.data ?? [])
      .map((row) => row?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    habitIdFilter = (habitIdResponse.data ?? [])
      .map((row) => row?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (projectIdFilter.length === 0 && habitIdFilter.length === 0) {
      return NextResponse.json({ results: [], nextCursor: null });
    }
  }

  let scheduleQuery = supabase
    .from("schedule_instances")
    .select("id, source_id, source_type, start_utc, duration_min")
    .eq("user_id", user.id)
    .in("source_type", ["PROJECT", "HABIT"])
    .eq("status", "scheduled")
    .gte("start_utc", new Date().toISOString())
    .order("start_utc", { ascending: true })
    .order("source_type", { ascending: true })
    .order("source_id", { ascending: true })
    .limit(PAGE_SIZE + 1);

  if (projectIdFilter || habitIdFilter) {
    const projectFilter =
      projectIdFilter && projectIdFilter.length > 0
        ? `and(source_type.eq.PROJECT,source_id.in.(${projectIdFilter.join(
            ","
          )}))`
        : null;
    const habitFilter =
      habitIdFilter && habitIdFilter.length > 0
        ? `and(source_type.eq.HABIT,source_id.in.(${habitIdFilter.join(",")}))`
        : null;
    const filters = [projectFilter, habitFilter].filter(
      (value): value is string => Boolean(value)
    );
    if (filters.length > 0) {
      scheduleQuery = scheduleQuery.or(filters.join(","));
    }
  }

  if (cursor) {
    scheduleQuery = scheduleQuery.or(
      [
        `start_utc.gt.${cursor.startUtc}`,
        `and(start_utc.eq.${cursor.startUtc},source_type.gt.${cursor.sourceType})`,
        `and(start_utc.eq.${cursor.startUtc},source_type.eq.${cursor.sourceType},source_id.gt.${cursor.sourceId})`,
      ].join(",")
    );
  }

  const { data: scheduleRows, error: scheduleError } = await scheduleQuery;

  if (scheduleError) {
    console.error("FAB search schedule lookup failed", scheduleError);
    return NextResponse.json(
      { error: "Unable to load schedule" },
      { status: 500 }
    );
  }

  const seen = new Set<string>();
  const dedupedRows: ScheduleRow[] = [];
  for (const row of (scheduleRows ?? []) as ScheduleRow[]) {
    const key = `${row.source_type}:${row.source_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedRows.push(row);
  }

  const pageRows = dedupedRows.slice(0, PAGE_SIZE);
  const hasMore = dedupedRows.length > PAGE_SIZE;
  const lastRow = pageRows[pageRows.length - 1] ?? null;
  const nextCursor =
    hasMore && lastRow?.start_utc && lastRow.source_id
      ? {
          startUtc: lastRow.start_utc,
          sourceType: lastRow.source_type,
          sourceId: lastRow.source_id,
        }
      : null;

  const projectIds = pageRows
    .filter((row) => row.source_type === "PROJECT")
    .map((row) => row.source_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const habitIds = pageRows
    .filter((row) => row.source_type === "HABIT")
    .map((row) => row.source_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (projectIds.length === 0 && habitIds.length === 0) {
    return NextResponse.json({
      results: [],
      nextCursor: null,
    });
  }

  const [projectResponse, habitResponse] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("projects")
          .select("id,name,completed_at,global_rank")
          .eq("user_id", user.id)
          .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    habitIds.length > 0
      ? supabase
          .from("habits")
          .select("id,name")
          .eq("user_id", user.id)
          .in("id", habitIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectResponse.error) {
    console.error("FAB search projects error", projectResponse.error);
    return NextResponse.json(
      { error: "Unable to load projects" },
      { status: 500 }
    );
  }
  if (habitResponse.error) {
    console.error("FAB search habits error", habitResponse.error);
    return NextResponse.json(
      { error: "Unable to load habits" },
      { status: 500 }
    );
  }

  const projectLookup = new Map<string, ProjectSearchRecord>();
  for (const project of projectResponse.data ?? []) {
    if (!project?.id) continue;
    projectLookup.set(project.id, project as ProjectSearchRecord);
  }
  const habitLookup = new Map<string, { id: string; name?: string | null }>();
  for (const habit of habitResponse.data ?? []) {
    if (!habit?.id) continue;
    habitLookup.set(habit.id, habit as { id: string; name?: string | null });
  }

  const results: SearchResult[] = [];
  for (const row of pageRows) {
    if (row.source_type === "PROJECT") {
      const project = projectLookup.get(row.source_id);
      if (!project) continue;
      const completedAt =
        typeof project.completed_at === "string" &&
        project.completed_at.length > 0
          ? project.completed_at
          : null;
      results.push({
        id: project.id,
        name: project.name?.trim() || "Untitled project",
        type: "PROJECT",
        nextScheduledAt:
          typeof row.start_utc === "string" ? row.start_utc : null,
        scheduleInstanceId: row.id ?? null,
        durationMinutes:
          typeof row.duration_min === "number" &&
          Number.isFinite(row.duration_min)
            ? row.duration_min
            : null,
        nextDueAt: null,
        completedAt,
        isCompleted: typeof completedAt === "string",
        global_rank: project.global_rank ?? null,
      });
      continue;
    }
    const habit = habitLookup.get(row.source_id);
    if (!habit) continue;
    results.push({
      id: habit.id,
      name: habit.name?.trim() || "Untitled habit",
      type: "HABIT",
      nextScheduledAt:
        typeof row.start_utc === "string" ? row.start_utc : null,
      scheduleInstanceId: row.id ?? null,
      durationMinutes:
        typeof row.duration_min === "number" &&
        Number.isFinite(row.duration_min)
          ? row.duration_min
          : null,
      nextDueAt: null,
      completedAt: null,
      isCompleted: false,
    });
  }

  return NextResponse.json({ results, nextCursor });
}

function parseCursor(searchParams: URLSearchParams): SearchCursor | null {
  const startUtc = searchParams.get("cursorStartUtc");
  const sourceType = searchParams.get("cursorSourceType");
  const sourceId = searchParams.get("cursorSourceId");
  if (!startUtc || !sourceType || !sourceId) return null;
  const parsed = Date.parse(startUtc);
  if (Number.isNaN(parsed)) return null;
  if (sourceType !== "PROJECT" && sourceType !== "HABIT") return null;
  return { startUtc, sourceType, sourceId };
}
