import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseMealPlanStatus } from "@/lib/nutrition/mealPlans";

type Context = { params: Promise<{ id: string }> };
type LooseResult = { data: Record<string, unknown> | null; error: unknown };
interface LooseQuery extends PromiseLike<LooseResult> {
  select(columns?: string): LooseQuery;
  update(value: unknown): LooseQuery;
  delete(): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  maybeSingle(): Promise<LooseResult>;
}
type LooseClient = { from(table: string): LooseQuery };

async function auth() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { response: NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 }) };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  return { supabase, user };
}

export async function PATCH(request: NextRequest, context: Context) {
  const session = await auth();
  if ("response" in session) return session.response;
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const updates: Record<string, unknown> = {};
  if (typeof body.label === "string" && body.label.trim()) updates.label = body.label.trim();
  if (body.servings !== undefined && Number(body.servings) > 0) updates.servings = Number(body.servings);
  if (Number.isInteger(body.position) && Number(body.position) >= 0) updates.position = body.position;
  if (body.mealType === null || typeof body.mealType === "string") updates.meal_type = body.mealType || null;
  if (body.plannedTime === null || typeof body.plannedTime === "string") updates.planned_time = body.plannedTime || null;
  const status = parseMealPlanStatus(body.status);
  if (status === "planned" || status === "skipped") updates.status = status;
  if (!Object.keys(updates).length) return NextResponse.json({ error: "No valid changes" }, { status: 400 });
  const client = session.supabase as unknown as LooseClient;
  const { data, error } = await client.from("meal_plan_items").update(updates).eq("id", id).select("*, meal_plan_days!inner(user_id)").eq("meal_plan_days.user_id", session.user.id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Unable to update planned item" }, { status: error ? 500 : 404 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const session = await auth();
  if ("response" in session) return session.response;
  const { id } = await context.params;
  const client = session.supabase as unknown as LooseClient;
  const { data: owned } = await client.from("meal_plan_items").select("id, meal_plan_days!inner(user_id)").eq("id", id).eq("meal_plan_days.user_id", session.user.id).maybeSingle();
  if (!owned) return NextResponse.json({ error: "Planned item not found" }, { status: 404 });
  const { error } = await client.from("meal_plan_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Unable to remove planned item" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
