import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type UpdatePayload = {
  id: string;
  status: "completed" | "scheduled";
  completed_at?: string | null;
  allowPast?: boolean;
};

export async function POST(request: Request) {
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

  const payload = (await request.json().catch(() => null)) as
    | { updates?: UpdatePayload[] }
    | UpdatePayload[]
    | null;
  const updates = Array.isArray(payload) ? payload : payload?.updates;
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Missing updates" }, { status: 400 });
  }

  const normalized = updates
    .filter((entry): entry is UpdatePayload => Boolean(entry?.id && entry?.status))
    .map((entry) => ({
      id: entry.id,
      status: entry.status,
      completed_at:
        entry.status === "completed"
          ? entry.completed_at ?? new Date().toISOString()
          : null,
    }));

  const errors: { id: string; message: string }[] = [];

  for (const update of normalized) {
    const { data, error, status } = await supabase
      .from("schedule_instances")
      .update({
        status: update.status,
        completed_at: update.completed_at,
      })
      .eq("id", update.id)
      .eq("user_id", user.id)
      .select(
        "id, user_id, source_type, source_id, status, completed_at, start_utc, end_utc, duration_min"
      )
      .maybeSingle();

    if (!data) {
      console.log(
        "[WRITE] id=%s matched=0 filter={id:%s,user_id:%s}",
        update.id,
        update.id,
        user.id
      );
    } else {
      console.log(
        "[WRITE] id=%s matched=1 status=%s completed_at=%s src=%s start=%s end=%s duration=%s user=%s",
        data.id,
        data.status,
        data.completed_at,
        data.source_type,
        data.start_utc,
        data.end_utc,
        data.duration_min,
        data.user_id
      );
      if (data.source_type === "TASK" && data.source_id) {
        const { error: taskError } = await supabase
          .from("tasks")
          .update({ completed_at: data.completed_at })
          .eq("id", data.source_id)
          .eq("user_id", user.id);
        if (taskError) {
          errors.push({
            id: update.id,
            message: `task sync: ${taskError.message}`,
          });
        }
      }
    }

    if (error || status >= 400) {
      errors.push({
        id: update.id,
        message: error?.message ?? `status ${status ?? 500}`,
      });
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 409 });
  }

  return NextResponse.json({ ok: true, updated: normalized.length });
}
