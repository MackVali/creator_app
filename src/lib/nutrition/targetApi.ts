import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ACTIVITY_LEVELS, NutritionTargetError, calculateNutritionTarget, type NutritionTargetInput } from "@/lib/nutrition/targets";

export type LooseQueryResult = { data: unknown; error: { message?: string; code?: string } | null };
export interface LooseQuery extends PromiseLike<LooseQueryResult> {
  select(columns?: string): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  is(column: string, value: unknown): LooseQuery;
  order(column: string, options?: { ascending?: boolean }): LooseQuery;
  limit(value: number): LooseQuery;
  maybeSingle(): Promise<LooseQueryResult>;
  insert(values: unknown): LooseQuery;
  upsert(values: unknown, options?: { onConflict?: string }): LooseQuery;
  update(values: unknown): LooseQuery;
}
export type TargetDb = { from(table: string): LooseQuery; rpc(name: string, args: Record<string, unknown>): Promise<LooseQueryResult> };

export async function authenticateNutritionTargetRequest() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { response: NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 }) };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  return { supabase, db: supabase as unknown as TargetDb, user };
}

export async function readJson(request: Request) {
  try { return { body: await request.json() as Record<string, unknown> }; }
  catch { return { response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }; }
}

export function authoritativePreview(value: unknown) {
  const input: unknown = value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : value;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const mutable = input as Record<string, unknown>;
    delete mutable.deviceTimezone;
    delete mutable.changeReason;
    delete mutable.bodyFatPct;
    delete mutable.adjustmentsEnabled;
  }
  try { return { preview: calculateNutritionTarget(input as NutritionTargetInput) }; }
  catch (error) {
    if (error instanceof NutritionTargetError) return { response: NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 }) };
    return { response: NextResponse.json({ error: "Unable to calculate target" }, { status: 400 }) };
  }
}

export function profileRowFromPreview(preview: ReturnType<typeof calculateNutritionTarget>, source: Record<string, unknown>) {
  return {
    age_years: preview.ageYears, formula_sex: preview.formulaInput, height_cm: preview.heightCm,
    current_weight_kg: preview.weightKg, preferred_units: preview.preferredUnits,
    activity_level: preview.activityLevel, activity_coefficient: preview.activityCoefficient,
    body_fat_pct: source.bodyFatPct ?? null, pregnancy_status: source.pregnancyStatus ?? "none",
    adjustments_enabled: source.adjustmentsEnabled !== false,
  };
}

const nutritionProfileInputSchema = z.object({
  ageYears: z.number().int().min(13).max(120),
  formulaInput: z.enum(["male", "female", "manual"]),
  heightCm: z.number().finite().min(100).max(260),
  weightKg: z.number().finite().min(25).max(500),
  preferredUnits: z.enum(["metric", "us"]),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  bodyFatPct: z.number().finite().min(2).max(70).optional(),
  pregnancyStatus: z.enum(["none", "pregnant", "breastfeeding"]).default("none"),
  adjustmentsEnabled: z.boolean().default(true),
}).strict();

export function profileRowFromProfileInput(value: unknown) {
  const parsed = nutritionProfileInputSchema.safeParse(value);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: "Invalid Nutrition profile", issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) },
        { status: 400 },
      ),
    };
  }
  const input = parsed.data;
  return {
    row: {
      age_years: input.ageYears,
      formula_sex: input.formulaInput,
      height_cm: input.heightCm,
      current_weight_kg: input.weightKg,
      preferred_units: input.preferredUnits,
      activity_level: input.activityLevel,
      activity_coefficient: ACTIVITY_LEVELS[input.activityLevel].coefficient,
      body_fat_pct: input.bodyFatPct ?? null,
      pregnancy_status: input.pregnancyStatus,
      adjustments_enabled: input.adjustmentsEnabled,
    },
  };
}
