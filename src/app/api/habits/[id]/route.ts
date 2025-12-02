import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: { id: string } };

export async function DELETE(_request: Request, { params }: Params) {
  const habitId = params.id;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client unavailable" },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const adminSupabase = createAdminClient();
  const db = adminSupabase ?? supabase;

  const { data: habit, error: loadError } = await db
    .from("habits")
    .select("id, user_id")
    .eq("id", habitId)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }

  if (!habit) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  if (habit.user_id !== user.id) {
    return NextResponse.json(
      { error: "You are not allowed to delete this habit" },
      { status: 403 }
    );
  }

  const { data: deletedHabit, error: deleteError } = await db
    .from("habits")
    .delete()
    .eq("id", habitId)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (!deletedHabit?.id) {
    return NextResponse.json(
      { error: "Unable to delete the habit" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: deletedHabit.id });
}
