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
  start_utc: string | null;
  duration_min: number | null;
};

type SearchCursor = {
  startUtc: string;
  projectId: string;
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
  if (likeQuery) {
    const { data: projectIdRows, error: projectIdError } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", likeQuery);
    if (projectIdError) {
      console.error("FAB search project lookup error", projectIdError);
      return NextResponse.json(
        { error: "Unable to load projects" },
        { status: 500 }
      );
    }
    projectIdFilter = (projectIdRows ?? [])
      .map((row) => row?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (projectIdFilter.length === 0) {
      return NextResponse.json({ results: [], nextCursor: null });
    }
  }

  let scheduleQuery = supabase
    .from("schedule_instances")
    .select("id, source_id, start_utc, duration_min")
    .eq("user_id", user.id)
    .eq("source_type", "PROJECT")
    .eq("status", "scheduled")
    .gte("start_utc", new Date().toISOString())
    .order("start_utc", { ascending: true })
    .order("source_id", { ascending: true })
    .limit(PAGE_SIZE + 1);

  if (projectIdFilter) {
    scheduleQuery = scheduleQuery.in("source_id", projectIdFilter);
  }

  if (cursor) {
    scheduleQuery = scheduleQuery.or(
      `start_utc.gt.${cursor.startUtc},and(start_utc.eq.${cursor.startUtc},source_id.gt.${cursor.projectId})`
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

  const pageRows = (scheduleRows ?? []).slice(0, PAGE_SIZE) as ScheduleRow[];
  const hasMore = (scheduleRows ?? []).length > PAGE_SIZE;
  const lastRow = pageRows[pageRows.length - 1] ?? null;
  const nextCursor =
    hasMore && lastRow?.start_utc && lastRow.source_id
      ? {
          startUtc: lastRow.start_utc,
          projectId: lastRow.source_id,
        }
      : null;

  const projectIds = pageRows
    .map((row) => row?.source_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (projectIds.length === 0) {
    return NextResponse.json({
      results: [],
      nextCursor: null,
    });
  }

  const { data: projectRows, error: projectError } = await supabase
    .from("projects")
    .select("id,name,completed_at,global_rank")
    .eq("user_id", user.id)
    .in("id", projectIds);

  if (projectError) {
    console.error("FAB search projects error", projectError);
    return NextResponse.json(
      { error: "Unable to load projects" },
      { status: 500 }
    );
  }

  const projectLookup = new Map<string, ProjectSearchRecord>();
  for (const project of projectRows ?? []) {
    if (!project?.id) continue;
    projectLookup.set(project.id, project as ProjectSearchRecord);
  }

  const results: SearchResult[] = [];
  for (const row of pageRows) {
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
  }

  return NextResponse.json({ results, nextCursor });
}

function parseCursor(searchParams: URLSearchParams): SearchCursor | null {
  const startUtc = searchParams.get("cursorStartUtc");
  const projectId = searchParams.get("cursorProjectId");
  if (!startUtc || !projectId) return null;
  const parsed = Date.parse(startUtc);
  if (Number.isNaN(parsed)) return null;
  return { startUtc, projectId };
}
