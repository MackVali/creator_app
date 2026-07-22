import { NextResponse } from "next/server";
import { resolveCreatorDay } from "@/lib/creatorDay";
import { authenticateNutritionTargetRequest, authoritativePreview, profileRowFromPreview, readJson } from "@/lib/nutrition/targetApi";

export async function POST(request: Request) {
  const auth = await authenticateNutritionTargetRequest(); if ("response" in auth) return auth.response;
  const json = await readJson(request); if ("response" in json) return json.response;
  const calculated = authoritativePreview(json.body); if ("response" in calculated) return calculated.response;
  const preview = calculated.preview;
  const { data: baseProfile } = await auth.supabase.from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle();
  const creatorDay = resolveCreatorDay({ profileTimezone: (baseProfile as { timezone?: string | null } | null)?.timezone, deviceTimezone: typeof json.body.deviceTimezone === "string" ? json.body.deviceTimezone : null });
  const profile = profileRowFromPreview(preview, json.body);
  const goal = {
    algorithm_version: preview.algorithmVersion, goal_type: preview.goalType, goal_weight_kg: preview.goalWeightKg,
    target_rate_pct_per_week: preview.goalRatePctPerWeek, bmr_formula: preview.isManual ? "manual" : "mifflin_st_jeor",
    bmr_kcal: preview.rawRestingEstimateKcal, activity_coefficient: preview.activityCoefficient,
    estimated_maintenance_kcal: preview.rawEstimatedMaintenanceKcal, calorie_delta_kcal: preview.acceptedCalorieDeltaKcal,
    calorie_target_kcal: preview.calorieTargetKcal, protein_strategy: preview.proteinStrategy, protein_target_g: preview.proteinTargetG,
    carb_strategy: preview.carbStrategy, carb_target_g: preview.carbTargetG, fat_strategy: preview.fatStrategy, fat_target_g: preview.fatTargetG,
    is_manual: preview.isManual, change_reason: typeof json.body.changeReason === "string" ? json.body.changeReason.slice(0, 500) : "User saved target",
    calculation_inputs: { ...preview.calculationInputs, result: preview },
  };
  const { data, error } = await auth.db.rpc("save_nutrition_goal_version", { p_profile: profile, p_goal: goal, p_creator_day_date: creatorDay.creatorDayDate, p_timezone: creatorDay.timezone, p_boundary_hour: creatorDay.boundaryHour });
  if (error) return NextResponse.json({ error: "Unable to save Nutrition target" }, { status: 500 });
  return NextResponse.json({ ...(data as object), preview }, { status: 201 });
}
