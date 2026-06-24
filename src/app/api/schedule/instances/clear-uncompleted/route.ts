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

  const { data, error } = await supabase
    .from("schedule_instances")
    .delete()
    .eq("user_id", user.id)
    .neq("status", "completed")
    .select("id");

  if (error) {
    console.error("Failed to clear uncompleted schedule instances", error);
    return NextResponse.json(
      { error: "Unable to clear uncompleted schedule instances" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: data?.length ?? 0,
  });
}
