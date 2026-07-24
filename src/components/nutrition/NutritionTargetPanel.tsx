"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, LoaderCircle, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  type ActivityLevel,
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
  inferPreferredUnitsFromLocales,
  macroPercentTotal,
  normalizeDisplayForUnits,
  prefillTargetSetupForm,
  resolveInitialTargetUnits,
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
type SetupView = "wizard" | "result" | "advanced";
type SetupStep = 0 | 1 | 2 | 3;

const goalLabels: Record<GoalType, string> = {
  lose: "Lose weight",
  maintain: "Maintain",
  gain: "Gain weight",
  recomposition: "Recomposition",
};

const targetSummaryGoalLabels: Record<GoalType, string> = {
  lose: "Lose",
  maintain: "Maintain",
  gain: "Gain",
  recomposition: "Recomposition",
};

const wizardStepTitles = ["About you", "Your body", "Your activity", "Your goal"] as const;

const activityChoices: Array<{ value: ActivityLevel; label: string; description: string }> = [
  { value: "sedentary", label: "Mostly seated", description: "Little exercise or daily movement" },
  { value: "light", label: "Lightly active", description: "Some walking or occasional workouts" },
  { value: "moderate", label: "Active", description: "Regular workouts or daily movement" },
  { value: "active", label: "Very active", description: "Hard training or a physical job" },
  { value: "very_active", label: "Extremely active", description: "Intense training and high daily movement" },
];

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

const lossRates = [
  { value: "0.25", label: "Easy", description: "Small deficit" },
  { value: "0.5", label: "Steady", description: "Moderate deficit" },
  { value: "0.75", label: "Assertive", description: "Larger deficit" },
  { value: "1", label: "Maximum", description: "Upper limit" },
];

const gainRates = [
  { value: "0.1", label: "Lean", description: "Slow gain" },
  { value: "0.25", label: "Steady", description: "Moderate surplus" },
  { value: "0.5", label: "Fast", description: "Upper limit" },
];

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

const browserPreferredUnits = (): PreferredUnits => {
  if (typeof navigator === "undefined") return "metric";
  const languages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : [];
  return inferPreferredUnitsFromLocales(languages);
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

function hasAdvancedValues(form: TargetSetupForm) {
  return Boolean(
    form.goalWeight.trim() ||
    form.goalWeightKgCanonical.trim() ||
    form.manualMaintenance.trim() ||
    form.bodyFatPct.trim() ||
    form.pregnancyStatus !== "none" ||
    !form.adjustmentsEnabled ||
    form.formulaInput === "manual" ||
    form.macroMode !== "suggested_grams" ||
    form.proteinGPerKg.trim(),
  );
}

function bodyBasicsSummary(form: TargetSetupForm) {
  const height = form.units === "metric" ? `${form.heightCm || "?"} cm` : `${form.heightFeet || "?"}' ${form.heightInches || "0"}"`;
  const weight = `${form.weight || "?"} ${form.units === "metric" ? "kg" : "lb"}`;
  const sex = form.formulaInput === "female" ? "Female" : form.formulaInput === "male" ? "Male" : "Manual";
  return `${form.age || "?"} yrs · ${height} · ${weight} · ${sex}`;
}

function numericInRange(value: string, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}

function canContinueSetupStep(form: TargetSetupForm, step: SetupStep) {
  if (step === 0) return numericInRange(form.age, 13, 120) && ["male", "female", "manual"].includes(form.formulaInput);
  if (step === 1) return numericInRange(form.heightCmCanonical, 100, 260) && numericInRange(form.weightKgCanonical, 25, 500);
  if (step === 2) return activityChoices.some((choice) => choice.value === form.activityLevel);
  return Boolean(form.goalType);
}

function advancedSummary(form: TargetSetupForm) {
  const items = [];
  if (form.goalWeight.trim() && (form.goalType === "lose" || form.goalType === "gain")) items.push("goal weight");
  if (form.manualMaintenance.trim()) items.push("manual maintenance");
  if (form.bodyFatPct.trim()) items.push("body fat");
  if (form.pregnancyStatus !== "none") items.push(pregnancyLabels[form.pregnancyStatus].toLowerCase());
  if (!form.adjustmentsEnabled) items.push("adjustments off");
  if (form.formulaInput === "manual") items.push("manual calories");
  if (form.macroMode === "custom_grams") items.push("custom grams");
  if (form.macroMode === "custom_percentages") items.push("custom percentages");
  if (form.proteinGPerKg.trim()) items.push("protein ratio");
  return items.length ? items.join(", ") : "No advanced values";
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
  const [setupStep, setSetupStep] = useState<SetupStep>(0);
  const [setupView, setSetupView] = useState<SetupView>("wizard");
  const [setupSessionStarted, setSetupSessionStarted] = useState(false);
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
    const unsavedForm = mode === "new_goal" && setupSessionStarted ? form : null;
    const units = resolveInitialTargetUnits({ profile, unsavedForm, localeUnits: browserPreferredUnits() });
    const fallback = unsavedForm ? setTargetFormUnits({ ...unsavedForm, ...overrides }, units) : createInitialTargetForm({ units, ...overrides });
    const base = prefillTargetSetupForm({ profile, activeGoal: goal, dailyTarget: target }, fallback);
    setForm(normalizeDisplayForUnits({ ...base, ...overrides }));
    setFormDirty(false);
    setPreview(null);
    setProfileSaved(false);
    setError(null);
    setSetupStep(0);
    setSetupView("wizard");
    setSetupSessionStarted(true);
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
      return true;
    } catch (reason) {
      if (hasAdvancedValues(form)) setSetupView("advanced");
      setError(reason instanceof Error ? reason.message : "Unable to preview target.");
      return false;
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
  const currentStepTitle = wizardStepTitles[setupStep];
  const canContinue = canContinueSetupStep(form, setupStep) && !automaticLoseBlocked;
  const goBack = () => {
    if (setupView === "advanced") {
      setSetupView(preview ? "result" : "wizard");
      return;
    }
    if (setupView === "result") {
      setSetupView("wizard");
      setSetupStep(3);
      return;
    }
    setSetupStep((step) => Math.max(0, step - 1) as SetupStep);
  };
  const continueSetup = async () => {
    if (!canContinue) return;
    if (setupStep < 3) {
      setSetupStep((step) => Math.min(3, step + 1) as SetupStep);
      return;
    }
    const ok = await previewTarget();
    if (ok) setSetupView("result");
  };

  return (
    <div className="border-b border-white/[0.055] p-3">
      {!target ? (
        <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.018] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white/82">Set your daily target</h4>
            <p className="mt-1 text-xs leading-5 text-white/44">Get a calorie and macro target for your meal plan.</p>
          </div>
          <button type="button" onClick={() => openSetup("new_goal")} className="min-h-10 shrink-0 rounded-lg bg-white px-3 text-xs font-semibold text-black">Set target</button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-2xl font-semibold text-white">{formatNumber(target.calorie_target_kcal, " kcal")}</p>
              <p className="mt-1 text-xs text-white/46">{goalType ? targetSummaryGoalLabels[goalType] : "Daily target"}{goal?.target_rate_pct_per_week ? ` · ${Number(goal.target_rate_pct_per_week)}% / week` : ""} · {targetSource}</p>
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
          <div className="flex max-h-[92vh] min-h-[560px] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0b0b0b] sm:rounded-3xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {(setupView !== "wizard" || setupStep > 0) && !profileOnly ? (
                  <button type="button" onClick={goBack} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/5" aria-label="Back">
                    <ChevronLeft className="h-4 w-4 text-white/58" />
                  </button>
                ) : null}
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-white/34">{profileOnly ? "Profile only" : setupView === "result" ? "Result" : setupView === "advanced" ? "Adjust target" : `Step ${setupStep + 1} of 4`}</p>
                  <h3 className="truncate text-base font-semibold text-white">{profileOnly ? "Edit profile" : setupView === "result" ? "Your target" : setupView === "advanced" ? "Adjust target" : currentStepTitle}</h3>
                </div>
              </div>
              <button type="button" onClick={() => setSetupOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/5" aria-label="Close target setup"><X className="h-4 w-4 text-white/50" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {profileOnly ? (
                <EditProfileSurface
                  form={form}
                  updateForm={updateForm}
                  profileSaved={profileSaved}
                  onRecalculate={() => openSetup("update_goal")}
                />
              ) : setupView === "result" && preview ? (
                <ResultSurface
                  preview={preview}
                  showCalculation={showCalculation}
                  setShowCalculation={setShowCalculation}
                />
              ) : setupView === "advanced" ? (
                <AdvancedTargetSurface
                  form={form}
                  updateForm={updateForm}
                  percentageTotal={percentageTotal}
                  percentageDetails={percentageDetails}
                  automaticLoseBlocked={automaticLoseBlocked}
                />
              ) : (
                <WizardStepSurface form={form} step={setupStep} updateForm={updateForm} />
              )}
            </div>

            {error && setupOpen ? <p className="px-4 pb-2 text-xs leading-5 text-red-200/76">{error}</p> : null}

            <div className="border-t border-white/[0.06] bg-[#0b0b0b]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur">
              {profileOnly ? (
                <button type="button" disabled={busy || !formDirty} onClick={() => void saveProfile()} className="min-h-11 w-full rounded-xl bg-white px-4 text-xs font-semibold text-black disabled:opacity-50">{busy ? "Saving..." : "Save profile"}</button>
              ) : setupView === "result" ? (
                <div className="grid gap-2">
                  <button type="button" disabled={busy || !preview} onClick={() => void saveGoal()} className="min-h-11 w-full rounded-xl bg-white px-4 text-xs font-semibold text-black disabled:opacity-50">{busy ? "Saving..." : "Use this target"}</button>
                  <button type="button" disabled={busy} onClick={() => setSetupView("advanced")} className="min-h-11 w-full rounded-xl border border-white/10 px-4 text-xs font-semibold text-white/64 disabled:opacity-50">Adjust target</button>
                </div>
              ) : setupView === "advanced" ? (
                <div className="grid gap-2">
                  <button type="button" disabled={busy || automaticLoseBlocked} onClick={() => void previewTarget().then((ok) => { if (ok) setSetupView("result"); })} className="min-h-11 w-full rounded-xl bg-white px-4 text-xs font-semibold text-black disabled:opacity-50">{busy ? "Updating..." : "Update preview"}</button>
                  <button type="button" disabled={busy} onClick={() => setSetupView(preview ? "result" : "wizard")} className="min-h-11 w-full rounded-xl border border-white/10 px-4 text-xs font-semibold text-white/64 disabled:opacity-50">Done</button>
                </div>
              ) : (
                <button type="button" disabled={busy || !canContinue} onClick={() => void continueSetup()} className="min-h-11 w-full rounded-xl bg-white px-4 text-xs font-semibold text-black disabled:opacity-50">{busy ? "Loading..." : setupStep === 3 ? "Calculate target" : "Continue"}</button>
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
      <p>Resting estimate {goal?.bmr_kcal ? formatNumber(goal.bmr_kcal, " kcal") : "Manual"}</p>
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

function UnitToggle({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  return (
    <div className="flex rounded-xl bg-black p-1">
      {(["us", "metric"] as PreferredUnits[]).map((units) => (
        <button key={units} type="button" onClick={() => updateForm(setTargetFormUnits(form, units))} className={`min-h-8 flex-1 rounded-lg px-3 text-[11px] font-semibold ${form.units === units ? "bg-white text-black" : "text-white/48"}`}>{units === "us" ? "US" : "Metric"}</button>
      ))}
    </div>
  );
}

function WizardStepSurface({ form, step, updateForm }: { form: TargetSetupForm; step: SetupStep; updateForm: (form: TargetSetupForm) => void }) {
  if (step === 0) return <AboutStep form={form} updateForm={updateForm} />;
  if (step === 1) return <BodyStep form={form} updateForm={updateForm} />;
  if (step === 2) return <ActivityStep form={form} updateForm={updateForm} />;
  return <GoalStep form={form} updateForm={updateForm} />;
}

function AboutStep({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  const visibleSex = form.formulaInput === "female" ? "female" : form.formulaInput === "male" ? "male" : null;
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-white/54">Sex</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["male", "female"] as const).map((sex) => (
              <button key={sex} type="button" onClick={() => updateForm({ ...form, formulaInput: sex })} className={`min-h-12 rounded-xl px-5 text-sm font-semibold ${visibleSex === sex ? "bg-white text-black" : "bg-white/[0.04] text-white/62 hover:bg-white/[0.07]"}`}>{sex === "male" ? "Male" : "Female"}</button>
            ))}
          </div>
        </div>
        <div className="w-36 shrink-0">
          <UnitToggle form={form} updateForm={updateForm} />
        </div>
      </div>
      <FormGrid>
        <Label text="Age" wide><input inputMode="numeric" type="number" min="13" max="120" value={form.age} onChange={(event) => updateForm({ ...form, age: event.target.value })} /></Label>
      </FormGrid>
    </div>
  );
}

function BodyStep({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  return (
    <div className="space-y-4">
      <FormGrid>
        {form.units === "metric" ? (
          <Label text="Height" wide><input inputMode="decimal" type="number" step="0.1" value={form.heightCm} onChange={(event) => updateForm(setHeightMetric(form, event.target.value))} /><span className="field-unit">cm</span></Label>
        ) : (
          <>
            <Label text="Height"><input inputMode="numeric" type="number" value={form.heightFeet} onChange={(event) => updateForm(setHeightUs(form, "heightFeet", event.target.value))} /><span className="field-unit">ft</span></Label>
            <Label text="Height"><input inputMode="decimal" type="number" step="0.1" value={form.heightInches} onChange={(event) => updateForm(setHeightUs(form, "heightInches", event.target.value))} /><span className="field-unit">in</span></Label>
          </>
        )}
        <Label text="Weight" wide><input inputMode="decimal" type="number" step="0.1" value={form.weight} onChange={(event) => updateForm(setWeightDisplay(form, event.target.value))} /><span className="field-unit">{form.units === "metric" ? "kg" : "lb"}</span></Label>
      </FormGrid>
      <UnitToggle form={form} updateForm={updateForm} />
    </div>
  );
}

function ActivityStep({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  return (
    <div className="grid gap-2">
      {activityChoices.map((choice) => {
        const selected = form.activityLevel === choice.value;
        return (
          <button key={choice.value} type="button" onClick={() => updateForm({ ...form, activityLevel: choice.value })} className={`min-h-14 rounded-xl px-3 py-2 text-left transition ${selected ? "bg-white text-black" : "bg-white/[0.035] text-white/62 hover:bg-white/[0.07]"}`}>
            <span className="block text-sm font-semibold">{choice.label}</span>
            <span className={`mt-0.5 block text-xs leading-4 ${selected ? "text-black/58" : "text-white/36"}`}>{choice.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function GoalStep({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(goalLabels) as GoalType[]).map((goalType) => (
        <button key={goalType} type="button" onClick={() => updateForm({ ...form, goalType, rate: goalType === "lose" ? "0.5" : goalType === "gain" ? "0.25" : "0", goalWeight: goalType === "lose" || goalType === "gain" ? form.goalWeight : "", goalWeightKgCanonical: goalType === "lose" || goalType === "gain" ? form.goalWeightKgCanonical : "" })} className={`min-h-24 rounded-2xl px-3 text-sm font-semibold ${form.goalType === goalType ? "bg-white text-black" : "bg-white/[0.035] text-white/62 hover:bg-white/[0.07]"}`}>{goalLabels[goalType]}</button>
      ))}
    </div>
  );
}

function EditProfileSurface({ form, updateForm, profileSaved, onRecalculate }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void; profileSaved: boolean; onRecalculate: () => void }) {
  return (
    <div className="space-y-4">
      <Section title="Body basics" summary={bodyBasicsSummary(form)}>
        <AboutStep form={form} updateForm={updateForm} />
        <div className="mt-4"><BodyStep form={form} updateForm={updateForm} /></div>
      </Section>
      <Section title="Activity" summary={activityChoices.find((choice) => choice.value === form.activityLevel)?.label}>
        <ActivityStep form={form} updateForm={updateForm} />
      </Section>
      <AdvancedTargetSurface form={form} profileOnly updateForm={updateForm} percentageTotal={macroPercentTotal(form)} percentageDetails={derivePercentageMacroDetails(form)} automaticLoseBlocked={false} />
      {profileSaved ? (
        <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.06] p-3 text-xs leading-5 text-emerald-100/75">
          <p className="font-semibold">Profile saved. Active target unchanged.</p>
          <p>Your existing daily targets stay the same until you recalculate or update the goal.</p>
          <button type="button" onClick={onRecalculate} className="mt-2 min-h-10 rounded-lg bg-white px-3 text-[11px] font-semibold text-black">Recalculate goal</button>
        </div>
      ) : null}
    </div>
  );
}

function AdvancedTargetSurface({
  form,
  updateForm,
  percentageTotal,
  percentageDetails,
  automaticLoseBlocked,
  profileOnly = false,
}: {
  form: TargetSetupForm;
  updateForm: (form: TargetSetupForm) => void;
  percentageTotal: number;
  percentageDetails: ReturnType<typeof derivePercentageMacroDetails>;
  automaticLoseBlocked: boolean;
  profileOnly?: boolean;
}) {
  const hasValues = hasAdvancedValues(form);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-white/44">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>{hasValues ? advancedSummary(form) : "Optional controls"}</span>
      </div>
      {!profileOnly ? (
        <div className="rounded-2xl bg-white/[0.018] p-3">
          <p className="text-xs font-semibold text-white/68">Calories</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => updateForm({ ...form, formulaInput: form.formulaInput === "female" ? "female" : "male" })} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${form.formulaInput !== "manual" ? "bg-white text-black" : "bg-white/[0.04] text-white/56"}`}>Suggested</button>
            <button type="button" onClick={() => updateForm({ ...form, formulaInput: "manual" })} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${form.formulaInput === "manual" ? "bg-white text-black" : "bg-white/[0.04] text-white/56"}`}>Manual calories</button>
          </div>
          {form.formulaInput === "manual" ? (
            <FormGrid>
              <Label text="Manual calorie target" wide><input inputMode="numeric" type="number" value={form.calories} onChange={(event) => updateForm({ ...form, calories: event.target.value })} /></Label>
            </FormGrid>
          ) : null}
        </div>
      ) : null}
      <FormGrid>
        {!profileOnly && (form.goalType === "lose" || form.goalType === "gain") ? <Label text={`Goal weight (${form.units === "metric" ? "kg" : "lb"})`} wide><input inputMode="decimal" type="number" step="0.1" placeholder="Optional" value={form.goalWeight} onChange={(event) => updateForm(setGoalWeightDisplay(form, event.target.value))} /></Label> : null}
        {!profileOnly ? <Label text="Goal rate" wide><select value={form.rate} onChange={(event) => updateForm({ ...form, rate: event.target.value })}>{(form.goalType === "lose" ? lossRates : form.goalType === "gain" ? gainRates : [{ value: "0", label: "None", description: "No change" }]).map((rate) => <option key={rate.value} value={rate.value}>{rate.label} - {rate.description}</option>)}</select></Label> : null}
        {!profileOnly ? <Label text="Manual maintenance" wide><input inputMode="numeric" type="number" placeholder="Optional" value={form.manualMaintenance} onChange={(event) => updateForm({ ...form, manualMaintenance: event.target.value })} /></Label> : null}
        <Label text="Body-fat percentage"><input inputMode="decimal" type="number" step="0.1" placeholder="Optional" value={form.bodyFatPct} onChange={(event) => updateForm({ ...form, bodyFatPct: event.target.value })} /></Label>
        <Label text="Nutrition considerations"><select value={form.pregnancyStatus} onChange={(event) => updateForm({ ...form, pregnancyStatus: event.target.value as PregnancyStatus })}>{Object.entries(pregnancyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Label>
        <label className="col-span-2 flex min-h-11 items-center gap-2 rounded-xl bg-black px-3 text-[11px] font-medium text-white/54"><input type="checkbox" checked={form.adjustmentsEnabled} onChange={(event) => updateForm({ ...form, adjustmentsEnabled: event.target.checked })} />Adaptive adjustment suggestions</label>
      </FormGrid>
      {form.manualMaintenance && !profileOnly ? <button type="button" onClick={() => updateForm({ ...form, manualMaintenance: "" })} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.07] px-3 text-[11px] font-semibold text-white/58"><RotateCcw className="h-3.5 w-3.5" /> Restore calculated maintenance</button> : null}
      {!profileOnly ? <MacroCustomization form={form} updateForm={updateForm} percentageTotal={percentageTotal} percentageDetails={percentageDetails} /> : null}
      {automaticLoseBlocked ? <p className="rounded-lg border border-amber-300/15 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100/75">Automatic deficit calculation is unavailable for the selected nutrition consideration. Use Maintain or a manual target instead.</p> : null}
    </div>
  );
}

function MacroCustomization({ form, updateForm, percentageTotal, percentageDetails }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void; percentageTotal: number; percentageDetails: ReturnType<typeof derivePercentageMacroDetails> }) {
  return (
    <div className="mt-3 rounded-xl bg-black/45 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {Object.entries(macroModeLabels).map(([mode, label]) => <button key={mode} type="button" onClick={() => updateForm({ ...form, macroMode: mode as MacroMode })} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${form.macroMode === mode ? "bg-white text-black" : "bg-white/[0.04] text-white/52"}`}>{label}</button>)}
      </div>
      <FormGrid>
        {form.macroMode === "suggested_grams" ? <Label text="Protein g/kg" wide><input inputMode="decimal" type="number" step="0.1" placeholder="Suggested" value={form.proteinGPerKg} onChange={(event) => updateForm({ ...form, proteinGPerKg: event.target.value })} /></Label> : null}
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
    </div>
  );
}

function ResultSurface({ preview, showCalculation, setShowCalculation }: { preview: NutritionTargetResult; showCalculation: boolean; setShowCalculation: (show: boolean) => void }) {
  return (
    <div className="space-y-5">
      <div className="py-4 text-center">
        <p className="text-6xl font-semibold tracking-normal text-white">{preview.calorieTargetKcal.toLocaleString()}</p>
        <p className="mt-2 text-sm font-medium text-white/46">calories per day</p>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/[0.035] p-3 text-center text-xs text-white/52">
        <p>Protein<br /><span className="text-base font-semibold text-white">{preview.proteinTargetG}g</span></p>
        <p>Carbs<br /><span className="text-base font-semibold text-white">{preview.carbTargetG}g</span></p>
        <p>Fat<br /><span className="text-base font-semibold text-white">{preview.fatTargetG}g</span></p>
      </div>
      <div className="rounded-xl bg-white/[0.025] p-3 text-[11px] leading-5 text-white/46">
        <p>Estimated maintenance {preview.estimatedMaintenanceKcal.toLocaleString()} kcal{preview.calculationInputs.maintenanceSource === "manual_estimate" ? " · manual estimate" : ""}</p>
        <p>Goal adjustment {Math.round(preview.acceptedCalorieDeltaKcal).toLocaleString()} kcal/day</p>
        {preview.warnings.map((warning) => <p key={warning} className="text-amber-200/75">{warning}</p>)}
      </div>
      <button type="button" onClick={() => setShowCalculation(!showCalculation)} className="min-h-10 w-full rounded-xl border border-white/[0.07] px-3 text-xs font-semibold text-white/58">How was this calculated?</button>
      {showCalculation ? (
        <div className="rounded-xl bg-white/[0.025] p-3 text-[11px] leading-5 text-white/42">
          <p>Resting estimate {preview.restingEstimateDisplayKcal ?? "Manual"} kcal</p>
          <p>Goal adjustment {Math.round(preview.acceptedCalorieDeltaKcal)} kcal/day</p>
          <p>Method {preview.formulaName} · {preview.algorithmVersion}</p>
          {preview.goalWeightKg ? <p>Goal weight {preview.goalWeightKg.toFixed(1)} kg</p> : null}
          {preview.explanation.map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, summary, children }: { title: string; summary?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl bg-white/[0.02] p-3"><div className="flex items-baseline justify-between gap-3"><h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">{title}</h4>{summary ? <p className="min-w-0 truncate text-[11px] text-white/30">{summary}</p> : null}</div><div className="mt-3">{children}</div></section>;
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 [&_.field-unit]:mt-1 [&_.field-unit]:block [&_.field-unit]:text-[10px] [&_.field-unit]:font-normal [&_.field-unit]:text-white/30 [&_input]:mt-1 [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border-0 [&_input]:bg-black [&_input]:px-3 [&_input]:text-white [&_select]:mt-1 [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border-0 [&_select]:bg-black [&_select]:px-3 [&_select]:text-xs [&_select]:text-white">{children}</div>;
}

function Label({ text, wide, children }: { text: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`${wide ? "col-span-2" : ""} min-w-0 text-[11px] font-medium text-white/48`}>{text}{children}</label>;
}
