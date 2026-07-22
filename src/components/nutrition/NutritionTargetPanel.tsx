"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import {
  ACTIVITY_LEVELS,
  type GoalType,
  type MacroMode,
  type NutritionTargetResult,
  type PreferredUnits,
  type PregnancyStatus,
} from "@/lib/nutrition/targets";
import {
  buildProfilePayload,
  buildTargetPayload,
  createInitialTargetForm,
  derivePercentageMacroDetails,
  macroPercentTotal,
  normalizeDisplayForUnits,
  prefillTargetSetupForm,
  setGoalWeightDisplay,
  setHeightMetric,
  setHeightUs,
  setTargetFormUnits,
  setWeightDisplay,
  type NutritionGoalRow,
  type NutritionProfileRow,
  type TargetSetupForm,
  type TargetSetupMode,
} from "@/lib/nutrition/targetForms";

type DailyTarget = Record<string, unknown> & { goal?: NutritionGoalRow };
type ProfileResponse = { profile: NutritionProfileRow; activeGoal: NutritionGoalRow };
type OverrideForm = { calories: string; protein: string; carbs: string; fat: string; reason: string; confirmMismatch: boolean };

const goalLabels: Record<GoalType, string> = {
  lose: "Lose",
  maintain: "Maintain",
  gain: "Gain",
  recomposition: "Recomposition",
};

const macroModeLabels: Record<MacroMode, string> = {
  suggested_grams: "Suggested grams",
  custom_grams: "Custom grams",
  custom_percentages: "Custom percentages",
};

const pregnancyLabels: Record<PregnancyStatus, string> = {
  none: "None",
  pregnant: "Pregnant",
  breastfeeding: "Breastfeeding",
};

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatNumber = (value: unknown, suffix = "") => {
  const parsed = numberOrNull(value);
  return parsed === null ? "Not set" : `${Math.round(parsed).toLocaleString()}${suffix}`;
};

const calculationInputs = (goal?: NutritionGoalRow): Record<string, unknown> => {
  const value = goal?.calculation_inputs;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
};

const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

function sourceLabel(target: DailyTarget | null, goal?: NutritionGoalRow) {
  if (target?.is_daily_override) return "Daily override";
  return goal?.is_manual ? "Manual" : "Suggested";
}

function macroCalories(values: { protein: string; carbs: string; fat: string }) {
  const protein = Number(values.protein);
  const carbs = Number(values.carbs);
  const fat = Number(values.fat);
  if (![protein, carbs, fat].every(Number.isFinite)) return null;
  return protein * 4 + carbs * 4 + fat * 9;
}

function isMacroMismatch(values: OverrideForm) {
  const calories = Number(values.calories);
  const macroEnergy = macroCalories(values);
  if (!Number.isFinite(calories) || macroEnergy === null) return false;
  return Math.abs(macroEnergy - calories) > Math.max(25, calories * 0.01);
}

export function NutritionTargetPanel({ creatorDayDate }: { creatorDayDate?: string | null }) {
  const [target, setTarget] = useState<DailyTarget | null>(null);
  const [profile, setProfile] = useState<NutritionProfileRow>(null);
  const [activeGoal, setActiveGoal] = useState<NutritionGoalRow>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupMode, setSetupMode] = useState<TargetSetupMode>("new_goal");
  const [form, setForm] = useState<TargetSetupForm>(() => createInitialTargetForm());
  const [formDirty, setFormDirty] = useState(false);
  const [preview, setPreview] = useState<NutritionTargetResult | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideForm, setOverrideForm] = useState<OverrideForm>({ calories: "", protein: "", carbs: "", fat: "", reason: "", confirmMismatch: false });
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        ...(creatorDayDate ? { creator_day_date: creatorDayDate } : {}),
        ...(deviceTimezone() ? { device_timezone: deviceTimezone()! } : {}),
      });
      const [targetResponse, profileResponse] = await Promise.all([
        fetch(`/api/nutrition/targets?${query}`),
        fetch("/api/nutrition/profile"),
      ]);
      const targetBody = await targetResponse.json();
      const profileBody = await profileResponse.json() as ProfileResponse & { error?: string };
      if (!profileResponse.ok) throw new Error(profileBody.error || "Unable to load Nutrition profile.");
      setProfile(profileBody.profile ?? null);
      setActiveGoal(profileBody.activeGoal ?? null);
      if (targetResponse.ok) {
        setTarget(targetBody.target ?? null);
      } else if (targetBody.setupRequired) {
        setTarget(null);
      } else {
        throw new Error(targetBody.error || "Unable to load daily target.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load Nutrition targets.");
    } finally {
      setLoading(false);
    }
  }, [creatorDayDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const goal = (target?.goal ?? activeGoal) as NutritionGoalRow;
  const inputs = useMemo(() => calculationInputs(goal), [goal]);
  const selectedDay = String(target?.creator_day_date ?? creatorDayDate ?? "Current Creator day");

  const openSetup = (mode: TargetSetupMode, overrides: Partial<TargetSetupForm> = {}) => {
    const base = prefillTargetSetupForm({ profile, activeGoal: goal, dailyTarget: target }, createInitialTargetForm(overrides));
    setForm(normalizeDisplayForUnits({ ...base, ...overrides }));
    setFormDirty(false);
    setPreview(null);
    setProfileSaved(false);
    setError(null);
    setSetupMode(mode);
    setSetupOpen(true);
  };

  const updateForm = (next: TargetSetupForm) => {
    setForm(next);
    setFormDirty(true);
    setPreview(null);
    setProfileSaved(false);
  };

  const previewTarget = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/nutrition/targets/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildTargetPayload(form, deviceTimezone())),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.issues?.join(" ") || body.error || "Unable to preview target.");
      setPreview(body.preview);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to preview target.");
    } finally {
      setBusy(false);
    }
  };

  const saveGoal = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/nutrition/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildTargetPayload(form, deviceTimezone()), changeReason: setupMode === "update_goal" ? "User updated goal" : "User saved target" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.issues?.join(" ") || body.error || "Unable to save target.");
      setSetupOpen(false);
      setPreview(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save target.");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/nutrition/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProfilePayload(form)),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.issues?.join(" ") || body.error || "Unable to save profile.");
      setProfile(body.profile ?? null);
      setProfileSaved(true);
      setFormDirty(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save profile.");
    } finally {
      setBusy(false);
    }
  };

  const openOverride = () => {
    if (!target) return;
    setOverrideForm({
      calories: String(target.calorie_target_kcal ?? ""),
      protein: String(target.protein_target_g ?? ""),
      carbs: String(target.carb_target_g ?? ""),
      fat: String(target.fat_target_g ?? ""),
      reason: typeof target.override_reason === "string" ? target.override_reason : "",
      confirmMismatch: false,
    });
    setOverrideError(null);
    setOverrideOpen(true);
  };

  const saveOverride = async () => {
    if (!target) return;
    if (isMacroMismatch(overrideForm) && !overrideForm.confirmMismatch) {
      setOverrideError("Macro calories do not match the calorie target. Confirm intentional custom values to save this one-day override.");
      return;
    }
    setBusy(true);
    setOverrideError(null);
    try {
      const response = await fetch(`/api/nutrition/targets/${String(target.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calorieTargetKcal: Math.round(Number(overrideForm.calories)),
          proteinTargetG: Math.round(Number(overrideForm.protein)),
          carbTargetG: Math.round(Number(overrideForm.carbs)),
          fatTargetG: Math.round(Number(overrideForm.fat)),
          overrideReason: overrideForm.reason.trim(),
          confirmMacroMismatch: overrideForm.confirmMismatch,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.issues?.join(" ") || body.error || "Unable to save daily override.");
      setTarget(body.target);
      setOverrideOpen(false);
      await load();
    } catch (reason) {
      setOverrideError(reason instanceof Error ? reason.message : "Unable to save daily override.");
    } finally {
      setBusy(false);
    }
  };

  const resetOverride = async () => {
    if (!target) return;
    setBusy(true);
    setOverrideError(null);
    try {
      const response = await fetch(`/api/nutrition/targets/${String(target.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToGoalVersion: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to reset daily override.");
      setTarget(body.target);
      setOverrideOpen(false);
      await load();
    } catch (reason) {
      setOverrideError(reason instanceof Error ? reason.message : "Unable to reset daily override.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 border-b border-white/[0.055] p-4 text-xs text-white/42"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading daily target...</div>;
  }

  const targetSource = sourceLabel(target, goal);
  const goalType = goal?.goal_type && typeof goal.goal_type === "string" ? goal.goal_type as GoalType : null;
  const percentageDetails = derivePercentageMacroDetails(form, preview?.calorieTargetKcal ?? null);
  const percentageTotal = macroPercentTotal(form);
  const automaticLoseBlocked = form.goalType === "lose" && form.formulaInput !== "manual" && form.pregnancyStatus !== "none";
  const profileOnly = setupMode === "edit_profile";

  return (
    <div className="border-b border-white/[0.055] p-3">
      {!target ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
          <h4 className="text-sm font-semibold text-white/88">Build your daily target</h4>
          <p className="mt-1 text-xs leading-5 text-white/46">Add a few details to estimate your maintenance calories and set daily calorie and macro targets.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => openSetup("new_goal")} className="min-h-11 rounded-xl bg-white px-4 text-xs font-semibold text-black">Set up target</button>
            <button type="button" onClick={() => openSetup("new_goal", { formulaInput: "manual", macroMode: "custom_grams" })} className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-semibold text-white/70">Use manual target</button>
          </div>
          <p className="mt-3 text-[11px] text-white/34">Estimates are starting points and can be adjusted at any time.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-2xl font-semibold text-white">{formatNumber(target.calorie_target_kcal, " kcal")}</p>
              <p className="mt-1 text-xs text-white/46">{goalType ? goalLabels[goalType] : "Daily target"}{goal?.target_rate_pct_per_week ? ` · ${Number(goal.target_rate_pct_per_week)}% / week` : ""} · {targetSource}</p>
              <p className="mt-1 text-[11px] text-white/36">Creator day {selectedDay}</p>
            </div>
            <button type="button" onClick={() => openSetup("update_goal")} className="min-h-10 rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-white/68">Update goal</button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-white/62">
            <p>Protein {formatNumber(target.protein_target_g, " g")}</p>
            <p>Carbs {formatNumber(target.carb_target_g, " g")}</p>
            <p>Fat {formatNumber(target.fat_target_g, " g")}</p>
          </div>
          <div className="mt-2 grid gap-1 text-[11px] text-white/38 sm:grid-cols-2">
            <p>Estimated maintenance {formatNumber(goal?.estimated_maintenance_kcal, " kcal")}</p>
            {goal?.goal_weight_kg ? <p>Goal weight {Number(goal.goal_weight_kg).toFixed(1)} kg</p> : null}
            <p>Last updated {new Date(String(goal?.created_at ?? target.updated_at ?? target.created_at)).toLocaleDateString()}</p>
            <p>Source {targetSource}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowCalculation((value) => !value)} className="min-h-10 rounded-lg border border-white/[0.07] px-3 text-[11px] font-semibold text-white/58">View calculation</button>
            <button type="button" onClick={() => openSetup("edit_profile")} className="min-h-10 rounded-lg border border-white/[0.07] px-3 text-[11px] font-semibold text-white/58">Edit profile</button>
            <button type="button" onClick={() => openSetup("update_goal")} className="min-h-10 rounded-lg border border-white/[0.07] px-3 text-[11px] font-semibold text-white/58">Update goal</button>
            <button type="button" onClick={openOverride} className="min-h-10 rounded-lg border border-white/[0.07] px-3 text-[11px] font-semibold text-white/58">Daily override</button>
          </div>
          {showCalculation ? <CalculationDetails goal={goal} inputs={inputs} target={target} /> : null}
        </div>
      )}

      {error && !setupOpen ? <p className="mt-2 text-xs text-red-200/72">{error}</p> : null}

      {setupOpen ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Nutrition target setup">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0b0b0b] p-4 sm:rounded-3xl">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">{profileOnly ? "Edit profile" : setupMode === "update_goal" ? "Update goal" : form.formulaInput === "manual" ? "Manual target" : "Set up daily target"}</h3>
                <p className="mt-1 text-xs leading-5 text-white/42">{profileOnly ? "This updates stored profile details only. Your active target remains unchanged until you recalculate or update the goal." : "Energy equations use one of two biological input constants. Choose the equation input you want CREATOR to use, or set calories manually."}</p>
              </div>
              <button type="button" onClick={() => setSetupOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/5" aria-label="Close target setup"><X className="h-4 w-4 text-white/50" /></button>
            </div>

            <div className="mt-4 space-y-4">
              <Section title="Profile inputs">
                <FormGrid>
                  <Label text="Age"><input inputMode="numeric" type="number" min="13" max="120" value={form.age} onChange={(event) => updateForm({ ...form, age: event.target.value })} /></Label>
                  <Label text="Preferred units"><select value={form.units} onChange={(event) => updateForm(setTargetFormUnits(form, event.target.value as PreferredUnits))}><option value="metric">Metric</option><option value="us">U.S. customary</option></select></Label>
                  <Label text="Calculation setting" wide><select value={form.formulaInput} onChange={(event) => updateForm({ ...form, formulaInput: event.target.value as TargetSetupForm["formulaInput"] })}><option value="male">Male equation</option><option value="female">Female equation</option><option value="manual">Use manual calories</option></select></Label>
                  {form.units === "metric" ? (
                    <Label text="Height (cm)"><input inputMode="decimal" type="number" step="0.1" value={form.heightCm} onChange={(event) => updateForm(setHeightMetric(form, event.target.value))} /></Label>
                  ) : (
                    <>
                      <Label text="Height (ft)"><input inputMode="numeric" type="number" value={form.heightFeet} onChange={(event) => updateForm(setHeightUs(form, "heightFeet", event.target.value))} /></Label>
                      <Label text="Height (in)"><input inputMode="decimal" type="number" step="0.1" value={form.heightInches} onChange={(event) => updateForm(setHeightUs(form, "heightInches", event.target.value))} /></Label>
                    </>
                  )}
                  <Label text={`Current weight (${form.units === "metric" ? "kg" : "lb"})`}><input inputMode="decimal" type="number" step="0.1" value={form.weight} onChange={(event) => updateForm(setWeightDisplay(form, event.target.value))} /></Label>
                  <Label text="Body-fat percentage"><input inputMode="decimal" type="number" step="0.1" placeholder="Optional" value={form.bodyFatPct} onChange={(event) => updateForm({ ...form, bodyFatPct: event.target.value })} /></Label>
                  <Label text="Activity level" wide><select value={form.activityLevel} onChange={(event) => updateForm({ ...form, activityLevel: event.target.value as TargetSetupForm["activityLevel"] })}>{Object.entries(ACTIVITY_LEVELS).map(([key, value]) => <option key={key} value={key}>{value.label} - {value.description}</option>)}</select></Label>
                  <Label text="Current nutrition considerations" wide><select value={form.pregnancyStatus} onChange={(event) => updateForm({ ...form, pregnancyStatus: event.target.value as PregnancyStatus })}>{Object.entries(pregnancyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Label>
                  <label className="col-span-2 flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-black px-3 text-[11px] font-medium text-white/54"><input type="checkbox" checked={form.adjustmentsEnabled} onChange={(event) => updateForm({ ...form, adjustmentsEnabled: event.target.checked })} />Adaptive adjustment suggestions enabled</label>
                </FormGrid>
              </Section>

              {!profileOnly ? (
                <>
                  <Section title="Goal">
                    <FormGrid>
                      <Label text="Goal"><select value={form.goalType} onChange={(event) => { const goalType = event.target.value as GoalType; updateForm({ ...form, goalType, rate: goalType === "lose" ? "0.5" : goalType === "gain" ? "0.25" : "0", goalWeight: goalType === "lose" || goalType === "gain" ? form.goalWeight : "", goalWeightKgCanonical: goalType === "lose" || goalType === "gain" ? form.goalWeightKgCanonical : "" }); }}><option value="lose">Lose</option><option value="maintain">Maintain</option><option value="gain">Gain</option><option value="recomposition">Recomposition</option></select></Label>
                      {form.goalType === "lose" || form.goalType === "gain" ? <Label text="Rate (% / week)"><input inputMode="decimal" type="number" min="0" max={form.goalType === "lose" ? "1" : "0.5"} step="0.05" value={form.rate} onChange={(event) => updateForm({ ...form, rate: event.target.value })} /></Label> : null}
                      {form.goalType === "lose" || form.goalType === "gain" ? <Label text={`Goal weight (${form.units === "metric" ? "kg" : "lb"})`} wide><input inputMode="decimal" type="number" step="0.1" placeholder="Optional" value={form.goalWeight} onChange={(event) => updateForm(setGoalWeightDisplay(form, event.target.value))} /><span className="mt-1 block text-[10px] font-normal text-white/32">Optional. This does not replace the selected weekly rate.</span></Label> : null}
                      <Label text="Manual maintenance estimate" wide><input inputMode="numeric" type="number" placeholder="Optional" value={form.manualMaintenance} onChange={(event) => updateForm({ ...form, manualMaintenance: event.target.value })} /><span className="mt-1 block text-[10px] font-normal text-white/32">Use a maintenance estimate you already trust instead of the activity calculation.</span></Label>
                    </FormGrid>
                    {form.manualMaintenance ? <button type="button" onClick={() => updateForm({ ...form, manualMaintenance: "" })} className="mt-2 flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.07] px-3 text-[11px] font-semibold text-white/58"><RotateCcw className="h-3.5 w-3.5" /> Restore calculated maintenance</button> : null}
                    {automaticLoseBlocked ? <p className="mt-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100/75">Automatic deficit calculation is unavailable for the selected nutrition consideration. Use Maintain or a manual target instead.</p> : null}
                  </Section>

                  <Section title="Daily macros">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {Object.entries(macroModeLabels).map(([mode, label]) => <button key={mode} type="button" onClick={() => updateForm({ ...form, macroMode: mode as MacroMode })} className={`min-h-10 rounded-lg border px-3 text-xs font-semibold ${form.macroMode === mode ? "border-white/35 bg-white/12 text-white" : "border-white/[0.07] text-white/52"}`}>{label}</button>)}
                    </div>
                    <FormGrid>
                      {form.formulaInput === "manual" ? <Label text="Manual calorie target"><input inputMode="numeric" type="number" value={form.calories} onChange={(event) => updateForm({ ...form, calories: event.target.value })} /></Label> : null}
                      {form.macroMode === "suggested_grams" ? <Label text="Protein g/kg"><input inputMode="decimal" type="number" step="0.1" placeholder="Suggested" value={form.proteinGPerKg} onChange={(event) => updateForm({ ...form, proteinGPerKg: event.target.value })} /><span className="mt-1 block text-[10px] font-normal text-white/32">Leave empty to use Suggested grams.</span></Label> : null}
                      {form.macroMode === "custom_grams" ? (
                        <>
                          <Label text="Protein (g)"><input inputMode="numeric" type="number" value={form.protein} onChange={(event) => updateForm({ ...form, protein: event.target.value })} /></Label>
                          <Label text="Carbohydrates (g)"><input inputMode="numeric" type="number" value={form.carbs} onChange={(event) => updateForm({ ...form, carbs: event.target.value })} /></Label>
                          <Label text="Fat (g)"><input inputMode="numeric" type="number" value={form.fat} onChange={(event) => updateForm({ ...form, fat: event.target.value })} /></Label>
                        </>
                      ) : null}
                      {form.macroMode === "custom_percentages" ? (
                        <>
                          <Label text="Protein percentage"><input inputMode="decimal" type="number" min="0" max="100" step="1" value={form.proteinPct} onChange={(event) => updateForm({ ...form, proteinPct: event.target.value })} /></Label>
                          <Label text="Carbohydrate percentage"><input inputMode="decimal" type="number" min="0" max="100" step="1" value={form.carbPct} onChange={(event) => updateForm({ ...form, carbPct: event.target.value })} /></Label>
                          <Label text="Fat percentage"><input inputMode="decimal" type="number" min="0" max="100" step="1" value={form.fatPct} onChange={(event) => updateForm({ ...form, fatPct: event.target.value })} /></Label>
                        </>
                      ) : null}
                    </FormGrid>
                    {form.macroMode === "custom_percentages" ? <div className="mt-3 rounded-lg bg-white/[0.035] p-3 text-[11px] leading-5 text-white/48"><p>Total {percentageTotal.toFixed(1)}% {Math.abs(percentageTotal - 100) <= 0.01 ? <span className="text-emerald-200/70">ready</span> : <span className="text-amber-100/75">must total 100%</span>}</p>{percentageDetails ? <p>Derived: Protein {Math.round(percentageDetails.protein.grams)} g / {Math.round(percentageDetails.protein.calories)} kcal · Carbs {Math.round(percentageDetails.carbs.grams)} g / {Math.round(percentageDetails.carbs.calories)} kcal · Fat {Math.round(percentageDetails.fat.grams)} g / {Math.round(percentageDetails.fat.calories)} kcal</p> : null}</div> : null}
                  </Section>
                </>
              ) : null}
            </div>

            {profileSaved ? <div className="mt-4 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.06] p-3 text-xs leading-5 text-emerald-100/75"><p className="font-semibold">Profile saved. Active target unchanged.</p><p>Your existing daily targets stay the same until you recalculate or update the goal.</p><button type="button" onClick={() => openSetup("update_goal")} className="mt-2 min-h-10 rounded-lg bg-white px-3 text-[11px] font-semibold text-black">Recalculate goal</button></div> : null}
            {error && setupOpen ? <p className="mt-3 text-xs leading-5 text-red-200/76">{error}</p> : null}
            {preview && !profileOnly ? <PreviewCard preview={preview} /> : null}

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setSetupOpen(false)} className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-semibold text-white/64">Close</button>
              {profileOnly ? (
                <button type="button" disabled={busy || !formDirty} onClick={() => void saveProfile()} className="min-h-11 rounded-xl bg-white px-4 text-xs font-semibold text-black disabled:opacity-50">{busy ? "Saving..." : "Save profile"}</button>
              ) : (
                <>
                  {preview ? <button type="button" disabled={busy} onClick={() => setPreview(null)} className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-semibold text-white/64">Edit details</button> : null}
                  <button type="button" disabled={busy || automaticLoseBlocked} onClick={() => void (preview ? saveGoal() : previewTarget())} className="min-h-11 rounded-xl bg-white px-4 text-xs font-semibold text-black disabled:opacity-50">{busy ? "Working..." : preview ? "Save target" : "Preview target"}</button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {overrideOpen && target ? (
        <div className="fixed inset-0 z-[135] flex items-end justify-center bg-black/75 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Daily override">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0b0b0b] p-4 sm:rounded-3xl">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">Daily override</h3>
                <p className="mt-1 text-xs leading-5 text-white/42">Change the target for this Creator day only. Your ongoing goal will stay the same.</p>
                <p className="mt-1 text-[11px] text-white/34">Creator day {selectedDay}</p>
              </div>
              <button type="button" onClick={() => setOverrideOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/5" aria-label="Close daily override"><X className="h-4 w-4 text-white/50" /></button>
            </div>
            <FormGrid>
              <Label text="Calories"><input inputMode="numeric" type="number" value={overrideForm.calories} onChange={(event) => setOverrideForm({ ...overrideForm, calories: event.target.value, confirmMismatch: false })} /></Label>
              <Label text="Protein (g)"><input inputMode="numeric" type="number" value={overrideForm.protein} onChange={(event) => setOverrideForm({ ...overrideForm, protein: event.target.value, confirmMismatch: false })} /></Label>
              <Label text="Carbohydrates (g)"><input inputMode="numeric" type="number" value={overrideForm.carbs} onChange={(event) => setOverrideForm({ ...overrideForm, carbs: event.target.value, confirmMismatch: false })} /></Label>
              <Label text="Fat (g)"><input inputMode="numeric" type="number" value={overrideForm.fat} onChange={(event) => setOverrideForm({ ...overrideForm, fat: event.target.value, confirmMismatch: false })} /></Label>
              <Label text="Override reason" wide><input value={overrideForm.reason} onChange={(event) => setOverrideForm({ ...overrideForm, reason: event.target.value })} placeholder="Optional context for this day" /></Label>
            </FormGrid>
            {isMacroMismatch(overrideForm) ? <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100/75"><input type="checkbox" checked={overrideForm.confirmMismatch} onChange={(event) => setOverrideForm({ ...overrideForm, confirmMismatch: event.target.checked })} className="mt-1" />Keep intentional custom values even though macro calories do not match the calorie target.</label> : null}
            {overrideError ? <p className="mt-3 text-xs leading-5 text-red-200/76">{overrideError}</p> : null}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {target.is_daily_override ? <button type="button" disabled={busy} onClick={() => void resetOverride()} className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-semibold text-white/64 disabled:opacity-50">Restore goal target</button> : <span />}
              <div className="flex gap-2">
                <button type="button" onClick={() => setOverrideOpen(false)} className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-semibold text-white/64">Cancel</button>
                <button type="button" disabled={busy} onClick={() => void saveOverride()} className="min-h-11 rounded-xl bg-white px-4 text-xs font-semibold text-black disabled:opacity-50">{busy ? "Saving..." : "Save override"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalculationDetails({ goal, inputs, target }: { goal?: NutritionGoalRow; inputs: Record<string, unknown>; target: DailyTarget }) {
  const result = inputs.result && typeof inputs.result === "object" ? inputs.result as Record<string, unknown> : {};
  const warnings = Array.isArray(result.warnings) ? result.warnings.filter((value): value is string => typeof value === "string") : [];
  return (
    <div className="mt-3 rounded-lg bg-black/30 p-3 text-[11px] leading-5 text-white/46">
      <p>Algorithm {String(goal?.algorithm_version ?? result.algorithmVersion ?? "nutrition-target-v1")}</p>
      <p>Formula {String(goal?.bmr_formula ?? result.formulaName ?? "Not set")}</p>
      <p>BMI screening estimate {typeof result.bmi === "number" ? result.bmi.toFixed(1) : "Not set"}{result.bmiCategory ? ` · ${String(result.bmiCategory)}` : ""}</p>
      <p>Resting estimate {goal?.bmr_kcal ? formatNumber(goal.bmr_kcal, " kcal") : "Manual"}</p>
      <p>Activity coefficient {String(goal?.activity_coefficient ?? inputs.activityCoefficient ?? "Not set")}</p>
      <p>Estimated maintenance {formatNumber(goal?.estimated_maintenance_kcal, " kcal")} {inputs.maintenanceSource === "manual_estimate" ? "(manual estimate)" : "(activity calculation)"}</p>
      <p>Provisional goal delta {formatNumber(result.provisionalCalorieDeltaKcal ?? 0, " kcal/day")}</p>
      <p>Accepted capped delta {formatNumber(goal?.calorie_delta_kcal ?? result.acceptedCalorieDeltaKcal ?? 0, " kcal/day")}</p>
      <p>Calculation source {target.is_daily_override ? "Daily override" : goal?.is_manual ? "Manual" : "Suggested"}</p>
      {goal?.goal_weight_kg ? <p>Goal weight {Number(goal.goal_weight_kg).toFixed(1)} kg</p> : null}
      {inputs.manualMaintenanceKcal ? <p>Manual maintenance estimate {formatNumber(inputs.manualMaintenanceKcal, " kcal")}</p> : null}
      {inputs.manualCalorieTargetKcal ? <p>Manual calorie target {formatNumber(inputs.manualCalorieTargetKcal, " kcal")}</p> : null}
      {warnings.map((warning) => <p key={warning} className="text-amber-100/75">{warning}</p>)}
      <p>Estimates are starting points, not exact requirements.</p>
    </div>
  );
}

function PreviewCard({ preview }: { preview: NutritionTargetResult }) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/36"><Check className="h-3.5 w-3.5" /> Preview</div>
      <p className="mt-2 text-2xl font-semibold text-white">{preview.calorieTargetKcal.toLocaleString()} kcal</p>
      <p className="mt-1 text-xs text-white/58">Protein {preview.proteinTargetG} g · Carbs {preview.carbTargetG} g · Fat {preview.fatTargetG} g</p>
      <div className="mt-3 text-[11px] leading-5 text-white/44">
        <p>BMI screening estimate {preview.bmi.toFixed(1)}{preview.bmiCategory ? ` · ${preview.bmiCategory}` : ""}</p>
        <p>Resting estimate {preview.restingEstimateDisplayKcal ?? "Manual"} kcal</p>
        <p>Estimated maintenance {preview.estimatedMaintenanceKcal} kcal{preview.calculationInputs.maintenanceSource === "manual_estimate" ? " · manual estimate" : ""}</p>
        <p>Provisional goal delta {Math.round(preview.provisionalCalorieDeltaKcal)} kcal/day</p>
        <p>Accepted capped delta {Math.round(preview.acceptedCalorieDeltaKcal)} kcal/day</p>
        <p>Formula {preview.formulaName} · {preview.algorithmVersion}</p>
        {preview.goalWeightKg ? <p>Goal weight {preview.goalWeightKg.toFixed(1)} kg</p> : null}
        {preview.warnings.map((warning) => <p key={warning} className="text-amber-200/75">{warning}</p>)}
        {preview.explanation.map((line) => <p key={line}>{line}</p>)}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3"><h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">{title}</h4><div className="mt-3">{children}</div></section>;
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 [&_input]:mt-1 [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-white/10 [&_input]:bg-black [&_input]:px-3 [&_input]:text-white [&_select]:mt-1 [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-white/10 [&_select]:bg-black [&_select]:px-3 [&_select]:text-xs [&_select]:text-white">{children}</div>;
}

function Label({ text, wide, children }: { text: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`${wide ? "col-span-2" : ""} min-w-0 text-[11px] font-medium text-white/48`}>{text}{children}</label>;
}
