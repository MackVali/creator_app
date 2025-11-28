import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type SearchResult = {
  id: string;
  name: string;
  type: "PROJECT" | "HABIT";
  nextScheduledAt: string | null;
  scheduleInstanceId: string | null;
  durationMinutes: number | null;
};

function normalizeQuery(value: string | null): string {
  if (!value) return "";
  return value.trim();
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = normalizeQuery(searchParams.get("q"));
  const likeQuery = query ? `%${query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%` : null;

  const baseProjectQuery = supabase
    .from("projects")
    .select("id,name")
    .eq("user_id", user.id)
    .order("name", { ascending: true })
    .limit(25);

  const baseHabitQuery = supabase
    .from("habits")
    .select("id,name")
    .eq("user_id", user.id)
    .order("name", { ascending: true })
    .limit(25);

  const [projectsResponse, habitsResponse] = await Promise.all([
    likeQuery ? baseProjectQuery.ilike("name", likeQuery) : baseProjectQuery,
    likeQuery ? baseHabitQuery.ilike("name", likeQuery) : baseHabitQuery,
  ]);

  if (projectsResponse.error) {
    console.error("FAB search projects error", projectsResponse.error);
    return NextResponse.json({ error: "Unable to load projects" }, { status: 500 });
  }

  if (habitsResponse.error) {
    console.error("FAB search habits error", habitsResponse.error);
    return NextResponse.json({ error: "Unable to load habits" }, { status: 500 });
  }

  const projectIds = (projectsResponse.data ?? [])
    .map(project => project?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const habitIds = (habitsResponse.data ?? [])
    .map(habit => habit?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const lookup = new Map<
    string,
    { startUtc: string | null; instanceId: string | null; durationMinutes: number | null }
  >();

  if (projectIds.length + habitIds.length > 0) {
    const sourceIds = [...projectIds, ...habitIds];
    const nowIso = new Date().toISOString();
    const { data: scheduleRows, error: scheduleError } = await supabase
      .from("schedule_instances")
      .select("id, source_id, source_type, start_utc, duration_min, status")
      .eq("user_id", user.id)
      .in("source_id", sourceIds)
      .in("source_type", ["PROJECT", "HABIT"])
      .eq("status", "scheduled")
      .gte("start_utc", nowIso)
      .order("start_utc", { ascending: true });

    if (scheduleError) {
      console.error("FAB search schedule lookup failed", scheduleError);
    } else {
      for (const row of scheduleRows ?? []) {
        if (!row?.source_id) continue;
        const key = `${row.source_type}:${row.source_id}`;
        const current = lookup.get(key);
        const nextPayload = {
          startUtc: typeof row.start_utc === "string" ? row.start_utc : null,
          instanceId: row.id ?? null,
          durationMinutes:
            typeof row.duration_min === "number" && Number.isFinite(row.duration_min)
              ? row.duration_min
              : null,
        };
        if (!current?.startUtc || (nextPayload.startUtc ?? "") < current.startUtc) {
          lookup.set(key, nextPayload);
        }
      }
    }
  }

  const results: SearchResult[] = [];

  for (const project of projectsResponse.data ?? []) {
    if (!project?.id) continue;
    const key = `PROJECT:${project.id}`;
    results.push({
      id: project.id,
      name: project.name?.trim() || "Untitled project",
      type: "PROJECT",
      nextScheduledAt: lookup.get(key)?.startUtc ?? null,
      scheduleInstanceId: lookup.get(key)?.instanceId ?? null,
      durationMinutes: lookup.get(key)?.durationMinutes ?? null,
    });
  }

  for (const habit of habitsResponse.data ?? []) {
    if (!habit?.id) continue;
    const key = `HABIT:${habit.id}`;
    results.push({
      id: habit.id,
      name: habit.name?.trim() || "Untitled habit",
      type: "HABIT",
      nextScheduledAt: lookup.get(key)?.startUtc ?? null,
      scheduleInstanceId: lookup.get(key)?.instanceId ?? null,
      durationMinutes: lookup.get(key)?.durationMinutes ?? null,
    });
  }

  const getSortValue = (value: string | null) => {
    if (!value) return Number.POSITIVE_INFINITY;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
  };

  results.sort((a, b) => {
    const timeA = getSortValue(a.nextScheduledAt);
    const timeB = getSortValue(b.nextScheduledAt);
    if (timeA === timeB) return a.name.localeCompare(b.name);
    return timeA - timeB;
  });

  return NextResponse.json({ results });
}
