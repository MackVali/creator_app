import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase client unavailable" }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "no user" }, { status: 401 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, energy")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: "no project available" }, { status: 400 });
  }

  const start = new Date(Date.now() + 3 * 3600 * 1000);
  const end = new Date(start.getTime() + 60 * 60000);

  const energy = String(project.energy ?? "MEDIUM").toUpperCase();

  const { data, error } = await supabase
    .from("schedule_instances")
    .insert({
      user_id: user.id,
      source_type: "PROJECT",
      source_id: project.id,
      start_utc: start.toISOString(),
      end_utc: end.toISOString(),
      duration_min: 60,
      status: "scheduled",
      weight_snapshot: 100,
      energy_resolved: energy,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, error: null });
}
