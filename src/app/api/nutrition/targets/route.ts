import { NextRequest, NextResponse } from "next/server";
import { resolveCreatorDay, resolveCreatorDayForDate } from "@/lib/creatorDay";
import { authenticateNutritionTargetRequest } from "@/lib/nutrition/targetApi";

export async function GET(request: NextRequest) {
  const auth = await authenticateNutritionTargetRequest(); if ("response" in auth) return auth.response;
  const requestedDate = request.nextUrl.searchParams.get("creator_day_date");
  if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return NextResponse.json({ error: "Invalid Creator-day date" }, { status: 400 });
  const { data: baseProfile } = await auth.supabase.from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle();
  const current = resolveCreatorDay({ profileTimezone: (baseProfile as { timezone?: string | null } | null)?.timezone, deviceTimezone: request.nextUrl.searchParams.get("device_timezone") });
  const day = requestedDate ? resolveCreatorDayForDate(requestedDate, current.timezone, current.timezoneSource) : current;
  const existing = await auth.db.from("daily_nutrition_targets").select("*, goal:nutrition_goal_versions(*)").eq("user_id", auth.user.id).eq("creator_day_date", day.creatorDayDate).maybeSingle();
  if (existing.error) return NextResponse.json({ error: "Unable to load daily target" }, { status: 500 });
  if (existing.data) return NextResponse.json({ target: existing.data });
  const active = await auth.db.from("nutrition_goal_versions").select("*").eq("user_id", auth.user.id).is("effective_to", null).maybeSingle();
  if (active.error) return NextResponse.json({ error: "Unable to load active target" }, { status: 500 });
  if (!active.data) return NextResponse.json({ setupRequired: true, target: null }, { status: 404 });
  const goal = active.data as Record<string, unknown>;
  const row = { user_id: auth.user.id, creator_day_date: day.creatorDayDate, timezone: day.timezone, boundary_hour: day.boundaryHour, goal_version_id: goal.id, calorie_target_kcal: goal.calorie_target_kcal, protein_target_g: goal.protein_target_g, carb_target_g: goal.carb_target_g, fat_target_g: goal.fat_target_g };
  const inserted = await auth.db.from("daily_nutrition_targets").upsert(row, { onConflict: "user_id,creator_day_date" }).select("*, goal:nutrition_goal_versions(*)").maybeSingle();
  if (inserted.error) return NextResponse.json({ error: "Unable to create daily target" }, { status: 500 });
  return NextResponse.json({ target: inserted.data }, { status: 201 });
}
