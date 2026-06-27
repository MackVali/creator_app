import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function DELETE() {
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

  const { count: preservedLocked, error: preservedLockedError } = await supabase
    .from("schedule_instances")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .neq("status", "completed")
    .is("completed_at", null)
    .eq("locked", true);

  if (preservedLockedError) {
    console.warn(
      "Failed to count preserved locked schedule instances",
      preservedLockedError
    );
  }

  const { count: preservedCompleted, error: preservedCompletedError } =
    await supabase
      .from("schedule_instances")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .or("status.eq.completed,completed_at.not.is.null");

  if (preservedCompletedError) {
    console.warn(
      "Failed to count preserved completed schedule instances",
      preservedCompletedError
    );
  }

  const { data, error } = await supabase
    .from("schedule_instances")
    .delete()
    .eq("user_id", user.id)
    .neq("status", "completed")
    .is("completed_at", null)
    .or("locked.is.false,locked.is.null")
    .select("id");

  if (error) {
    console.error("Failed to clear uncompleted schedule instances", error);
    return NextResponse.json(
      {
        error: error.message || "Unable to clear uncompleted schedule instances",
        details: error.details,
        hint: error.hint,
      },
      { status: 500 }
    );
  }

  const deleted = data?.length ?? 0;
  return NextResponse.json({
    ok: true,
    deleted,
    cleared: deleted,
    preservedLocked: preservedLockedError ? null : preservedLocked ?? 0,
    preservedCompleted: preservedCompletedError ? null : preservedCompleted ?? 0,
  });
}
