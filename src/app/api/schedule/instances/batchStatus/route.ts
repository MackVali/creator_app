import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { applyFocusPomoScheduleStatusUpdates } from "@/lib/focus/focusPomoLiveActionServer";

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

  const { errors } = await applyFocusPomoScheduleStatusUpdates(
    supabase,
    user.id,
    normalized
  );

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 409 });
  }

  return NextResponse.json({ ok: true, updated: normalized.length });
}
