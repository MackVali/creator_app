import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { resolveCreatorDay, resolveCreatorDayForDate } from "@/lib/creatorDay";
import { parseMealPlanNutritionSnapshot } from "@/lib/nutrition/mealPlans";

type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };
interface TableQuery extends PromiseLike<QueryResult> {
  select(columns?: string): TableQuery;
  eq(column: string, value: unknown): TableQuery;
  order(column: string, options?: { ascending?: boolean }): TableQuery;
  maybeSingle(): Promise<QueryResult>;
  upsert(values: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }): TableQuery;
  insert(values: unknown): TableQuery;
}
type PlanClient = { from(table: string): TableQuery };

function hasValidPlanSnapshots(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items) && items.every((item) => item && typeof item === "object" && parseMealPlanNutritionSnapshot((item as { nutrition_snapshot?: unknown }).nutrition_snapshot));
}

async function authenticatedClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { response: NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 }) };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  return { supabase, client: supabase as unknown as PlanClient, user };
}

export async function GET(request: NextRequest) {
  const auth = await authenticatedClient();
  if ("response" in auth) return auth.response;
  const requestedDate = request.nextUrl.searchParams.get("creator_day_date");
  const deviceTimezone = request.nextUrl.searchParams.get("device_timezone");
  const { data: profile } = await auth.supabase.from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle();
  const profileTimezone = (profile as { timezone?: string | null } | null)?.timezone ?? null;
  const current = resolveCreatorDay({ profileTimezone, deviceTimezone });
  const resolved = requestedDate
    ? resolveCreatorDayForDate(requestedDate, current.timezone, current.timezoneSource)
    : current;

  const { data: existing, error: readError } = await auth.client.from("meal_plan_days").select("*, items:meal_plan_items(*)").eq("user_id", auth.user.id).eq("creator_day_date", resolved.creatorDayDate).maybeSingle();
  if (readError) return NextResponse.json({ error: "Unable to load Meal Plan" }, { status: 500 });
  if (existing) return hasValidPlanSnapshots(existing) ? NextResponse.json({ plan: existing }) : NextResponse.json({ error: "Meal Plan contains invalid nutrition data" }, { status: 500 });

  const { error: insertError } = await auth.client.from("meal_plan_days").upsert({
    user_id: auth.user.id,
    creator_day_date: resolved.creatorDayDate,
    timezone: resolved.timezone,
    timezone_source: resolved.timezoneSource,
    boundary_hour: resolved.boundaryHour,
    starts_at: resolved.startsAt,
    ends_at: resolved.endsAt,
    planning_mode: "flexible",
  }, { onConflict: "user_id,creator_day_date", ignoreDuplicates: true }).select("id");
  if (insertError) return NextResponse.json({ error: "Unable to initialize Meal Plan" }, { status: 500 });
  const { data: plan, error } = await auth.client.from("meal_plan_days").select("*, items:meal_plan_items(*)").eq("user_id", auth.user.id).eq("creator_day_date", resolved.creatorDayDate).maybeSingle();
  if (error || !plan) return NextResponse.json({ error: "Unable to load Meal Plan" }, { status: 500 });
  return hasValidPlanSnapshots(plan) ? NextResponse.json({ plan }) : NextResponse.json({ error: "Meal Plan contains invalid nutrition data" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const auth = await authenticatedClient();
  if ("response" in auth) return auth.response;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const dayId = typeof body.mealPlanDayId === "string" ? body.mealPlanDayId : "";
  const source = body.sourceSurface === "grocery" || body.sourceSurface === "nutrition" ? body.sourceSurface : null;
  const servings = Number(body.servings ?? 1);
  const foodId = typeof body.foodId === "string" ? body.foodId : null;
  const mealTemplateId = typeof body.mealTemplateId === "string" ? body.mealTemplateId : null;
  const manualLabel = typeof body.manualLabel === "string" ? body.manualLabel.trim().slice(0, 160) : "";
  const foodResourceId = typeof body.foodResourceId === "string" ? body.foodResourceId : null;
  if (!dayId || !source || !Number.isFinite(servings) || servings <= 0 || servings > 10000 || Number(Boolean(foodId)) + Number(Boolean(mealTemplateId)) + Number(Boolean(manualLabel)) !== 1) return NextResponse.json({ error: "Choose one food, meal, or manual item" }, { status: 400 });
  const { data: day } = await auth.client.from("meal_plan_days").select("id").eq("id", dayId).eq("user_id", auth.user.id).maybeSingle();
  if (!day) return NextResponse.json({ error: "Meal Plan not found" }, { status: 404 });
  let label = "";
  let snapshot: Record<string, unknown> | null = null;
  if (foodId) {
    const { data: rawFood } = await auth.client.from("foods").select("id,name,brand_name,serving_unit,serving_grams,calories,carbs_g,protein_g,fat_g").eq("id", foodId).eq("is_active", true).maybeSingle();
    const food = rawFood as Record<string, unknown> | null;
    if (!food) return NextResponse.json({ error: "Food is unavailable" }, { status: 400 });
    label = String(food.name);
    let groceryDeductions: Array<Record<string, unknown>> = [];
    if (foodResourceId) {
      const { data: rawResource } = await auth.client.from("food_resources").select("id,food_id,unit").eq("id", foodResourceId).eq("user_id", auth.user.id).eq("status", "active").maybeSingle();
      const resource = rawResource as Record<string, unknown> | null;
      if (!resource || resource.food_id !== foodId || typeof resource.unit !== "string") return NextResponse.json({ error: "Grocery item is unavailable" }, { status: 400 });
      groceryDeductions = [{ food_resource_id: resource.id, amount: 1, unit: resource.unit }];
    }
    snapshot = {
      version: 1, calories: Number(food.calories ?? 0), carbs_g: Number(food.carbs_g ?? 0), protein_g: Number(food.protein_g ?? 0), fat_g: Number(food.fat_g ?? 0), grocery_deductions: groceryDeductions,
      items: [{ item_type: "food", food_id: food.id, recipe_id: null, custom_name: null, quantity: 1, serving_unit: food.serving_unit ?? "serving", serving_grams: food.serving_grams ?? null, snapshot_name: food.name, snapshot_brand_name: food.brand_name ?? null, snapshot_calories: Number(food.calories ?? 0), snapshot_carbs_g: Number(food.carbs_g ?? 0), snapshot_protein_g: Number(food.protein_g ?? 0), snapshot_fat_g: Number(food.fat_g ?? 0), metadata: {}, sort_order: 0 }],
    };
  } else if (mealTemplateId) {
    const { data: rawTemplate } = await auth.client.from("meal_templates").select("id,name,total_calories,total_carbs_g,total_protein_g,total_fat_g,meal_template_items(*)").eq("id", mealTemplateId).eq("user_id", auth.user.id).eq("is_active", true).maybeSingle();
    const template = rawTemplate as Record<string, unknown> | null;
    const rows = Array.isArray(template?.meal_template_items) ? template.meal_template_items as Array<Record<string, unknown>> : [];
    if (!template || rows.length === 0) return NextResponse.json({ error: "Meal is unavailable or empty" }, { status: 400 });
    label = String(template.name);
    snapshot = { version: 1, calories: Number(template.total_calories ?? 0), carbs_g: Number(template.total_carbs_g ?? 0), protein_g: Number(template.total_protein_g ?? 0), fat_g: Number(template.total_fat_g ?? 0), grocery_deductions: [], items: rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)).map((row, index) => ({ ...row, metadata: row.metadata ?? {}, sort_order: index })) };
  } else {
    label = manualLabel;
    snapshot = { version: 1, loggable: false, calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0, grocery_deductions: [], items: [] };
  }
  const validatedSnapshot = parseMealPlanNutritionSnapshot(snapshot);
  if (!validatedSnapshot) return NextResponse.json({ error: "The selected item has incomplete nutrition data" }, { status: 400 });
  const item = {
    meal_plan_day_id: dayId, label, source_surface: source, servings,
    position: Number.isInteger(body.position) ? body.position : 0,
    meal_type: typeof body.mealType === "string" ? body.mealType : null,
    planned_time: typeof body.plannedTime === "string" ? body.plannedTime : null,
    food_id: foodId,
    meal_template_id: mealTemplateId,
    nutrition_snapshot: validatedSnapshot,
  };
  const { data, error } = await auth.client.from("meal_plan_items").insert(item).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to add planned item" }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}
