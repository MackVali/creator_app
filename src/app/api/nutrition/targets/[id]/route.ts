import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateNutritionTargetRequest, readJson } from "@/lib/nutrition/targetApi";

const overrideSchema = z.object({
  calorieTargetKcal: z.number().int().min(800).max(10000),
  proteinTargetG: z.number().int().positive().max(1000),
  carbTargetG: z.number().int().positive().max(2000),
  fatTargetG: z.number().int().positive().max(500),
  overrideReason: z.string().trim().max(500).optional().nullable(),
  confirmMacroMismatch: z.boolean().optional(),
}).strict().refine((value) => {
  const difference = Math.abs(value.proteinTargetG * 4 + value.carbTargetG * 4 + value.fatTargetG * 9 - value.calorieTargetKcal);
  return value.confirmMacroMismatch === true || difference <= Math.max(25, value.calorieTargetKcal * 0.01);
}, "Macro calories must match the calorie target or be confirmed as an intentional daily override.");
const resetSchema = z.object({ resetToGoalVersion: z.literal(true) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateNutritionTargetRequest(); if ("response" in auth) return auth.response;
  const json = await readJson(request); if ("response" in json) return json.response;
  const { id } = await context.params;
  const reset = resetSchema.safeParse(json.body);
  if (reset.success) {
    const existing = await auth.db.from("daily_nutrition_targets").select("*, goal:nutrition_goal_versions(*)").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
    if (existing.error) return NextResponse.json({ error: "Unable to load daily target" }, { status: 500 });
    if (!existing.data) return NextResponse.json({ error: "Daily target not found" }, { status: 404 });
    const row = existing.data as Record<string, unknown>;
    const goal = row.goal && typeof row.goal === "object" ? row.goal as Record<string, unknown> : null;
    if (!goal) return NextResponse.json({ error: "Goal version not found for this daily target" }, { status: 409 });
    const result = await auth.db.from("daily_nutrition_targets").update({
      calorie_target_kcal: goal.calorie_target_kcal,
      protein_target_g: goal.protein_target_g,
      carb_target_g: goal.carb_target_g,
      fat_target_g: goal.fat_target_g,
      is_daily_override: false,
      override_reason: null,
    }).eq("id", id).eq("user_id", auth.user.id).select("*, goal:nutrition_goal_versions(*)").maybeSingle();
    if (result.error) return NextResponse.json({ error: "Unable to reset daily override" }, { status: 500 });
    return NextResponse.json({ target: result.data });
  }
  const parsed = overrideSchema.safeParse(json.body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid daily override", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
  const values = parsed.data;
  const result = await auth.db.from("daily_nutrition_targets").update({ calorie_target_kcal: values.calorieTargetKcal, protein_target_g: values.proteinTargetG, carb_target_g: values.carbTargetG, fat_target_g: values.fatTargetG, is_daily_override: true, override_reason: values.overrideReason?.trim() || null }).eq("id", id).eq("user_id", auth.user.id).select("*, goal:nutrition_goal_versions(*)").maybeSingle();
  if (result.error) return NextResponse.json({ error: "Unable to save daily override" }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Daily target not found" }, { status: 404 });
  return NextResponse.json({ target: result.data });
}
