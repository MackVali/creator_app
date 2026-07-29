"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, LoaderCircle, Minus, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  poundsToKilograms,
  calculateGoalTimelineEstimate,
  type ActivityLevel,
  type GoalTimelineEstimate,
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
  trimNumber,
  type NutritionGoalRow,
  type NutritionProfileRow,
  type TargetSetupForm,
  type TargetSetupMode,
} from "@/lib/nutrition/targetForms";
import { useActiveNutritionTarget, type ActiveNutritionTarget } from "@/hooks/useActiveNutritionTarget";

type DailyTarget = ActiveNutritionTarget & { goal?: NutritionGoalRow };
type ProfileResponse = { profile: NutritionProfileRow; activeGoal: NutritionGoalRow };
type OverrideForm = { calories: string; protein: string; carbs: string; fat: string; reason: string; confirmMismatch: boolean };
type SetupView = "wizard" | "result" | "advanced";
type SetupStep = 0 | 1;
type PaceGoalType = Extract<GoalType, "lose" | "gain">;
type DirectionFieldIssues = {
  currentWeight?: string;
  goalWeight?: string;
  pace?: string;
};

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

const wizardStepQuestions = [
  "What do you want to change?",
  "Tell us where you’re starting",
] as const;

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

const paceOptions: Record<PaceGoalType, Array<{ value: string; label: "Slow" | "Steady" | "Fast"; description: string }>> = {
  lose: [
    { value: "0.25", label: "Slow", description: "Conservative deficit" },
    { value: "0.5", label: "Steady", description: "Moderate deficit" },
    { value: "0.75", label: "Fast", description: "Aggressive deficit" },
  ],
  gain: [
    { value: "0.1", label: "Slow", description: "Conservative surplus" },
    { value: "0.25", label: "Steady", description: "Moderate surplus" },
    { value: "0.5", label: "Fast", description: "Aggressive surplus" },
  ],
};

const wizardPrimaryActionClass = "flex h-11 w-full items-center justify-center rounded-xl border border-white/[0.16] bg-[#242426] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition hover:border-white/24 hover:bg-[#2b2b2e] focus-visible:ring-1 focus-visible:ring-white/24 active:translate-y-px active:bg-[#1c1c1e] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-white/[0.16] disabled:hover:bg-[#242426] disabled:active:translate-y-0";
const wizardSmallPrimaryActionClass = "min-h-10 rounded-lg border border-white/[0.14] bg-[#242426] px-3 text-[11px] font-semibold text-white shadow-[0_8px_18px_-18px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.07)] transition hover:border-white/22 hover:bg-[#2b2b2e] active:translate-y-px active:bg-[#1c1c1e]";
const wizardSelectedSegmentClass = "border border-white/[0.18] bg-[#2a2a2d] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";
const wizardSelectedChoiceClass = "border border-white/[0.18] bg-[#242427] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";
const wizardTextActionClass = "flex min-h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold text-white/58 outline-none transition hover:bg-white/[0.045] hover:text-white/78 focus-visible:ring-1 focus-visible:ring-white/18 disabled:cursor-not-allowed disabled:opacity-50";
const weightMinKg = 25;
const weightMaxKg = 500;
const directionFieldIds = {
  currentWeight: "nutrition-target-current-weight",
  goalWeight: "nutrition-target-goal-weight",
  pace: "nutrition-target-pace",
} as const;
const directionErrorIds = {
  currentWeight: "nutrition-target-current-weight-error",
  goalWeight: "nutrition-target-goal-weight-error",
  pace: "nutrition-target-pace-error",
} as const;

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

const formatDecimal = (value: number, decimals = 1) => Number(value.toFixed(decimals)).toLocaleString();

const displayWeightFromKg = (weightKg: number, units: PreferredUnits) => (
  units === "metric"
    ? `${formatDecimal(weightKg, 1)} kg`
    : `${formatDecimal(weightKg * 2.2046226218, 1)} lb`
);

const formatSignedCalories = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()} kcal/day`;

const formatTimelineText = (timeline: GoalTimelineEstimate, includeDate = false) => {
  const weekLabel = `About ${timeline.weeks.toLocaleString()} ${timeline.weeks === 1 ? "week" : "weeks"}`;
  if (!includeDate) return weekLabel;
  return `${weekLabel} · around ${timeline.completionDate.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
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
    ((form.goalType === "lose" || form.goalType === "gain") && (form.goalWeight.trim() || form.goalWeightKgCanonical.trim())) ||
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

function unitsFromInputs(inputs: Record<string, unknown>): PreferredUnits {
  return inputs.preferredUnits === "us" ? "us" : "metric";
}

function goalRateSummary(goal?: NutritionGoalRow, inputs: Record<string, unknown> = {}) {
  const goalType = goal?.goal_type;
  if (goalType !== "lose" && goalType !== "gain") return null;
  const rate = numberOrNull(goal?.target_rate_pct_per_week ?? inputs.goalRatePctPerWeek);
  const weightKg = numberOrNull(inputs.weightKg);
  if (rate === null || weightKg === null) return null;
  return `${displayWeightFromKg(weightKg * rate / 100, unitsFromInputs(inputs))} per week`;
}

function timelineFromForm(form: TargetSetupForm) {
  const currentWeightKg = numberOrNull(form.weightKgCanonical);
  const goalWeightKg = numberOrNull(form.goalWeightKgCanonical);
  const selectedRatePct = numberOrNull(form.rate);
  const selectedRateKgPerWeek = currentWeightKg !== null && selectedRatePct !== null
    ? currentWeightKg * selectedRatePct / 100
    : null;
  return calculateGoalTimelineEstimate({
    goalType: form.goalType,
    currentWeightKg,
    goalWeightKg,
    selectedRateKgPerWeek,
  });
}

function timelineFromGoal(goal?: NutritionGoalRow, inputs: Record<string, unknown> = {}) {
  const goalType = goal?.goal_type as GoalType | undefined;
  if (goalType !== "lose" && goalType !== "gain") return null;
  const currentWeightKg = numberOrNull(inputs.weightKg);
  const goalWeightKg = numberOrNull(goal?.goal_weight_kg ?? inputs.goalWeightKg);
  const effectiveRateKgPerWeek = numberOrNull(inputs.effectiveGoalRateKgPerWeek);
  const selectedRateKgPerWeek = numberOrNull(inputs.selectedGoalRateKgPerWeek);
  return calculateGoalTimelineEstimate({
    goalType,
    currentWeightKg,
    goalWeightKg,
    effectiveRateKgPerWeek,
    selectedRateKgPerWeek,
  });
}

function goalWeightSummary(goal?: NutritionGoalRow, inputs: Record<string, unknown> = {}) {
  const goalWeightKg = numberOrNull(goal?.goal_weight_kg ?? inputs.goalWeightKg);
  return goalWeightKg === null ? null : displayWeightFromKg(goalWeightKg, unitsFromInputs(inputs));
}

function paceLabel(goalType: GoalType, rate: number) {
  if (goalType !== "lose" && goalType !== "gain") return null;
  return paceOptions[goalType].find((option) => Number(option.value) === rate)?.label ?? null;
}

function numericInRange(value: string, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}

function goalDefinitionIssue(form: TargetSetupForm) {
  if (form.goalType === "maintain" || form.goalType === "recomposition") return null;
  const currentWeight = numberOrNull(form.weightKgCanonical);
  const goalWeight = numberOrNull(form.goalWeightKgCanonical);
  if (currentWeight === null) return "Enter your current weight first.";
  if (goalWeight === null) return "Goal weight is required.";
  if (form.goalType === "lose" && goalWeight >= currentWeight - 0.1) return "Choose a goal weight below your current weight.";
  if (form.goalType === "gain" && goalWeight <= currentWeight + 0.1) return "Choose a goal weight above your current weight.";
  if (!paceOptions[form.goalType].some((option) => option.value === form.rate)) return "Choose a pace.";
  return null;
}

function directionFieldIssues(form: TargetSetupForm): DirectionFieldIssues {
  const issues: DirectionFieldIssues = {};
  const currentWeight = numberOrNull(form.weightKgCanonical);
  const currentWeightValid = currentWeight !== null && currentWeight >= weightMinKg && currentWeight <= weightMaxKg;

  if (!currentWeightValid) {
    issues.currentWeight = "Enter your current weight.";
  }

  if (form.goalType === "lose" || form.goalType === "gain") {
    const goalWeight = numberOrNull(form.goalWeightKgCanonical);
    if (goalWeight === null) {
      issues.goalWeight = "Goal weight is required.";
    } else if (currentWeightValid && form.goalType === "lose" && goalWeight >= currentWeight - 0.1) {
      issues.goalWeight = "Choose a goal weight below your current weight.";
    } else if (currentWeightValid && form.goalType === "gain" && goalWeight <= currentWeight + 0.1) {
      issues.goalWeight = "Choose a goal weight above your current weight.";
    }

    if (!paceOptions[form.goalType].some((option) => option.value === form.rate)) {
      issues.pace = "Choose a pace.";
    }
  }

  return issues;
}

function directionIssue(form: TargetSetupForm) {
  const issues = directionFieldIssues(form);
  return issues.currentWeight ?? issues.goalWeight ?? issues.pace ?? null;
}

function canContinueSetupStep(form: TargetSetupForm, step: SetupStep) {
  if (step === 0) return directionIssue(form) === null;
  return numericInRange(form.age, 13, 120)
    && (form.formulaInput === "male" || form.formulaInput === "female")
    && numericInRange(form.heightCmCanonical, 100, 260)
    && activityChoices.some((choice) => choice.value === form.activityLevel);
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

export function NutritionTargetPanel({
  creatorDayDate,
  onSetupOpenChange,
  presentation = "full",
}: {
  creatorDayDate?: string | null;
  onSetupOpenChange?: (open: boolean) => void;
  presentation?: "full" | "compact";
}) {
  const targetQuery = useActiveNutritionTarget(creatorDayDate);
  const target = targetQuery.target as DailyTarget | null;
  const [profile, setProfile] = useState<NutritionProfileRow>(null);
  const [activeGoal, setActiveGoal] = useState<NutritionGoalRow>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupMode, setSetupMode] = useState<TargetSetupMode>("new_goal");
  const [setupStep, setSetupStep] = useState<SetupStep>(0);
  const [setupView, setSetupView] = useState<SetupView>("wizard");
  const [setupSessionStarted, setSetupSessionStarted] = useState(false);
  const [setupAttempted, setSetupAttempted] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [form, setForm] = useState<TargetSetupForm>(() => createInitialTargetForm());
  const [formDirty, setFormDirty] = useState(false);
  const [preview, setPreview] = useState<NutritionTargetResult | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideForm, setOverrideForm] = useState<OverrideForm>({ calories: "", protein: "", carbs: "", fat: "", reason: "", confirmMismatch: false });
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setError(null);
    try {
      const profileResponse = await fetch("/api/nutrition/profile");
      const profileBody = await profileResponse.json() as ProfileResponse & { error?: string };
      if (!profileResponse.ok) throw new Error(profileBody.error || "Unable to load Nutrition profile.");
      setProfile(profileBody.profile ?? null);
      setActiveGoal(profileBody.activeGoal ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load Nutrition targets.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    onSetupOpenChange?.(setupOpen);
    return () => onSetupOpenChange?.(false);
  }, [onSetupOpenChange, setupOpen]);

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
    setShowCalculation(false);
    setError(null);
    setSetupStep(0);
    setSetupView("wizard");
    setSetupAttempted(false);
    setActivityExpanded(false);
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
      targetQuery.setTargetInCache(body.target);
      if (body.goal) setActiveGoal(body.goal);
      setSetupOpen(false);
      setPreview(null);
      await Promise.all([targetQuery.invalidate(), loadProfile()]);
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
      targetQuery.setTargetInCache(body.target);
      setOverrideOpen(false);
      await targetQuery.invalidate();
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
      targetQuery.setTargetInCache(body.target);
      setOverrideOpen(false);
      await targetQuery.invalidate();
    } catch (reason) {
      setOverrideError(reason instanceof Error ? reason.message : "Unable to reset daily override.");
    } finally {
      setBusy(false);
    }
  };

  const loading = presentation === "compact" ? targetQuery.isLoading : profileLoading || targetQuery.isLoading;
  const visibleError = error ?? targetQuery.error;

  if (loading) {
    return <div className="flex items-center gap-2 border-b border-white/[0.055] p-4 text-xs text-white/42"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading daily target...</div>;
  }

  const targetSource = sourceLabel(target, goal);
  const goalType = goal?.goal_type && typeof goal.goal_type === "string" ? goal.goal_type as GoalType : null;
  const activeGoalRate = goalRateSummary(goal, inputs);
  const activeGoalWeight = goalWeightSummary(goal, inputs);
  const activeTimeline = timelineFromGoal(goal, inputs);
  const percentageDetails = derivePercentageMacroDetails(form, preview?.calorieTargetKcal ?? null);
  const percentageTotal = macroPercentTotal(form);
  const automaticLoseBlocked = form.goalType === "lose" && form.formulaInput !== "manual" && form.pregnancyStatus !== "none";
  const setupGoalIssue = goalDefinitionIssue(form);
  const setupDirectionFieldIssues = directionFieldIssues(form);
  const profileOnly = setupMode === "edit_profile";
  const canContinue = canContinueSetupStep(form, setupStep) && (setupStep === 0 || !automaticLoseBlocked);
  const focusFirstDirectionInvalidInput = () => {
    const firstInvalidId = setupDirectionFieldIssues.currentWeight
      ? directionFieldIds.currentWeight
      : setupDirectionFieldIssues.goalWeight
        ? directionFieldIds.goalWeight
        : setupDirectionFieldIssues.pace
          ? directionFieldIds.pace
          : null;
    if (!firstInvalidId || typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      document.getElementById(firstInvalidId)?.focus();
    });
  };
  const goBack = () => {
    if (setupView === "advanced") {
      setSetupView(preview ? "result" : "wizard");
      return;
    }
    if (setupView === "result") {
      setSetupView("wizard");
      setSetupStep(1);
      return;
    }
    setSetupAttempted(false);
    setSetupStep((step) => Math.max(0, step - 1) as SetupStep);
  };
  const continueSetup = async () => {
    setError(null);
    if (!canContinue) {
      setSetupAttempted(true);
      if (setupStep === 0) {
        focusFirstDirectionInvalidInput();
        return;
      }
      if (setupStep === 1) setError(automaticLoseBlocked ? "Automatic deficit calculation is unavailable for the selected nutrition consideration. Use Maintain or a manual target instead." : "Complete the baseline details before previewing your target.");
      return;
    }
    if (setupStep < 1) {
      setSetupAttempted(false);
      setActivityExpanded(false);
      setSetupStep(1);
      return;
    }
    const ok = await previewTarget();
    if (ok) setSetupView("result");
  };

  if (setupOpen) {
    const headerLabel = profileOnly ? "Edit profile" : setupView === "wizard" ? `${setupStep + 1} of 2` : setupView === "result" ? "Target result" : "Advanced";
    return (
      <div className="flex h-full max-h-full min-h-0 flex-1 touch-pan-y flex-col overflow-hidden bg-[#090909]" aria-label="Nutrition target setup">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.055] px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            {(setupView !== "wizard" || setupStep > 0) && !profileOnly ? (
              <button type="button" onClick={goBack} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/54 outline-none transition hover:bg-white/[0.055] hover:text-white/82 focus-visible:ring-1 focus-visible:ring-white/18" aria-label="Back">
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
            <p className="text-xs font-semibold text-white/42">{headerLabel}</p>
          </div>
          <button type="button" onClick={() => setSetupOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/50 outline-none transition hover:bg-white/[0.055] hover:text-white/82 focus-visible:ring-1 focus-visible:ring-white/18" aria-label="Close target setup"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] pt-5 [-webkit-overflow-scrolling:touch] sm:px-6">
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
            <WizardStepSurface
              form={form}
              step={setupStep}
              updateForm={updateForm}
              showDirectionIssues={setupAttempted}
              directionFieldIssues={setupDirectionFieldIssues}
              activityExpanded={activityExpanded}
              setActivityExpanded={setActivityExpanded}
            />
          )}

          {visibleError ? <p className="mt-4 rounded-lg border border-red-300/15 bg-red-300/[0.055] p-3 text-xs leading-5 text-red-100/78">{visibleError}</p> : null}

          <div className="mt-6">
            {profileOnly ? (
              <button type="button" disabled={busy || !formDirty} onClick={() => void saveProfile()} className={wizardPrimaryActionClass}>{busy ? "Saving..." : "Save profile"}</button>
            ) : setupView === "result" ? (
              <div className="grid gap-2">
                <button type="button" disabled={busy || !preview} onClick={() => void saveGoal()} className={wizardPrimaryActionClass}>{busy ? "Saving..." : "Use target"}</button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={() => setSetupView("advanced")} className={wizardTextActionClass}>Adjust details</button>
                  <button type="button" disabled={busy} onClick={() => setShowCalculation(!showCalculation)} className={wizardTextActionClass}>View calculation</button>
                </div>
              </div>
            ) : setupView === "advanced" ? (
              <div className="grid gap-2">
                <button type="button" disabled={busy || automaticLoseBlocked || Boolean(setupGoalIssue)} onClick={() => void previewTarget().then((ok) => { if (ok) setSetupView("result"); })} className={wizardPrimaryActionClass}>{busy ? "Updating..." : "Update preview"}</button>
                <button type="button" disabled={busy} onClick={() => setSetupView(preview ? "result" : "wizard")} className="flex h-11 w-full items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white/64 outline-none transition hover:bg-white/[0.045] focus-visible:ring-1 focus-visible:ring-white/18 disabled:cursor-not-allowed disabled:opacity-50">Done</button>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={() => void continueSetup()} className={wizardPrimaryActionClass}>{busy ? "Checking..." : setupStep === 1 ? "See my target" : "Continue"}</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-white/[0.055] p-3">
      {!target ? (
        <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.018] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white/82">Set your daily target</h4>
            <p className="mt-1 text-xs leading-5 text-white/44">Get a calorie and macro target for your meal plan.</p>
          </div>
          <button type="button" onClick={() => openSetup("new_goal")} className="min-h-10 shrink-0 rounded-lg border border-white/[0.14] bg-[#242426] px-3 text-xs font-semibold text-white">Set target</button>
        </div>
      ) : presentation === "compact" ? (
        <button type="button" onClick={() => openSetup("update_goal")} className="w-full rounded-xl border border-white/[0.075] bg-[#141416] px-3 py-3 text-left outline-none transition hover:border-white/[0.12] hover:bg-[#19191b] focus-visible:ring-1 focus-visible:ring-white/18">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-semibold text-white/52">Daily target</span>
            <span className="shrink-0 text-base font-semibold tabular-nums text-white">{formatNumber(target.calorie_target_kcal, " kcal")}</span>
          </span>
          <span className="mt-1 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs font-medium text-white/46">
              {formatNumber(target.protein_target_g)}P · {formatNumber(target.carb_target_g)}C · {formatNumber(target.fat_target_g)}F
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-white/58">Edit</span>
          </span>
        </button>
      ) : (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-2xl font-semibold text-white">{formatNumber(target.calorie_target_kcal, " kcal")}</p>
              <p className="mt-1 text-xs text-white/46">{goalType ? targetSummaryGoalLabels[goalType] : "Daily target"}{activeGoalRate ? ` · ${activeGoalRate}` : ""} · {targetSource}</p>
              {activeTimeline ? <p className="mt-1 text-[11px] text-white/38">Estimated timeline · {formatTimelineText(activeTimeline, true)}</p> : null}
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
            {activeGoalWeight ? <p>Goal weight {activeGoalWeight}</p> : null}
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

      {visibleError && !setupOpen ? <p className="mt-2 text-xs text-red-200/72">{visibleError}</p> : null}

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
                <button type="button" disabled={busy} onClick={() => void saveOverride()} className="min-h-11 rounded-xl border border-white/[0.14] bg-[#242426] px-4 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save override"}</button>
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
  const targetCalories = numberOrNull(target.calorie_target_kcal);
  const maintenanceCalories = numberOrNull(goal?.estimated_maintenance_kcal);
  const signedAdjustment = targetCalories !== null && maintenanceCalories !== null ? targetCalories - Math.round(maintenanceCalories) : null;
  return (
    <div className="mt-3 rounded-lg bg-black/30 p-3 text-[11px] leading-5 text-white/46">
      <p>Algorithm {String(goal?.algorithm_version ?? result.algorithmVersion ?? "nutrition-target-v1")}</p>
      <p>Formula {String(goal?.bmr_formula ?? result.formulaName ?? "Not set")}</p>
      <p>Resting estimate {goal?.bmr_kcal ? formatNumber(goal.bmr_kcal, " kcal") : "Manual"}</p>
      <p>Estimated maintenance {formatNumber(goal?.estimated_maintenance_kcal, " kcal")} {inputs.maintenanceSource === "manual_estimate" ? "(manual estimate)" : "(activity calculation)"}</p>
      <p>Provisional goal delta {formatNumber(result.provisionalCalorieDeltaKcal ?? 0, " kcal/day")}</p>
      <p>Target minus maintenance {signedAdjustment === null ? "Not set" : formatSignedCalories(signedAdjustment)}</p>
      <p>Calculation source {target.is_daily_override ? "Daily override" : goal?.is_manual ? "Manual" : "Suggested"}</p>
      {goalWeightSummary(goal, inputs) ? <p>Goal weight {goalWeightSummary(goal, inputs)}</p> : null}
      {inputs.manualMaintenanceKcal ? <p>Manual maintenance estimate {formatNumber(inputs.manualMaintenanceKcal, " kcal")}</p> : null}
      {inputs.manualCalorieTargetKcal ? <p>Manual calorie target {formatNumber(inputs.manualCalorieTargetKcal, " kcal")}</p> : null}
      {warnings.map((warning) => <p key={warning} className="text-amber-100/75">{warning}</p>)}
      <p>Estimates are starting points, not exact requirements.</p>
    </div>
  );
}

function UnitToggle({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  return (
    <div className="grid grid-cols-2 rounded-lg border border-white/[0.06] bg-[#101011] p-0.5">
      {(["us", "metric"] as PreferredUnits[]).map((units) => (
        <button key={units} type="button" onClick={() => updateForm(setTargetFormUnits(form, units))} className={`min-h-7 rounded-md px-2 text-[10px] font-semibold transition ${form.units === units ? wizardSelectedSegmentClass : "border border-transparent text-white/48 hover:bg-white/[0.045] active:bg-white/[0.025]"}`}>{units === "us" ? "US" : "Metric"}</button>
      ))}
    </div>
  );
}

function WizardStepSurface({
  form,
  step,
  updateForm,
  showDirectionIssues,
  directionFieldIssues: issues,
  activityExpanded,
  setActivityExpanded,
}: {
  form: TargetSetupForm;
  step: SetupStep;
  updateForm: (form: TargetSetupForm) => void;
  showDirectionIssues: boolean;
  directionFieldIssues: DirectionFieldIssues;
  activityExpanded: boolean;
  setActivityExpanded: (expanded: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      <h3 className="text-[1.7rem] font-semibold leading-8 text-white">{wizardStepQuestions[step]}</h3>
      {step === 0 ? (
        <DirectionStep
          form={form}
          updateForm={updateForm}
          showIssues={showDirectionIssues}
          issues={issues}
        />
      ) : null}
      {step === 1 ? (
        <BaselineStep
          form={form}
          updateForm={updateForm}
          activityExpanded={activityExpanded}
          setActivityExpanded={setActivityExpanded}
        />
      ) : null}
    </div>
  );
}

type WeightPickerField = "current" | "goal";

function clampWeightKg(value: number) {
  return Math.min(weightMaxKg, Math.max(weightMinKg, value));
}

function weightFieldValue(form: TargetSetupForm, field: WeightPickerField) {
  return field === "current" ? form.weight : form.goalWeight;
}

function weightFieldCanonicalValue(form: TargetSetupForm, field: WeightPickerField) {
  return field === "current" ? form.weightKgCanonical : form.goalWeightKgCanonical;
}

function updateWeightFieldCanonical(form: TargetSetupForm, field: WeightPickerField, weightKg: number) {
  const canonical = trimNumber(clampWeightKg(weightKg), 4);
  return normalizeDisplayForUnits(
    field === "current"
      ? { ...form, weightKgCanonical: canonical }
      : { ...form, goalWeightKgCanonical: canonical },
  );
}

function updateWeightFieldDisplay(form: TargetSetupForm, field: WeightPickerField, value: string) {
  return field === "current" ? setWeightDisplay(form, value) : setGoalWeightDisplay(form, value);
}

function WeightPicker({
  form,
  field,
  wide,
  issue,
  updateForm,
}: {
  form: TargetSetupForm;
  field: WeightPickerField;
  wide?: boolean;
  issue?: string;
  updateForm: (form: TargetSetupForm) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const value = weightFieldValue(form, field);
  const unit = form.units === "metric" ? "kg" : "lb";
  const label = field === "current" ? "Current weight" : "Goal weight";
  const inputId = field === "current" ? directionFieldIds.currentWeight : directionFieldIds.goalWeight;
  const errorId = field === "current" ? directionErrorIds.currentWeight : directionErrorIds.goalWeight;
  const canonicalWeightKg = numberOrNull(weightFieldCanonicalValue(form, field));
  const incrementKg = form.units === "metric" ? 0.5 : poundsToKilograms(1);
  const commitValue = (nextValue: string) => {
    updateForm(normalizeDisplayForUnits(updateWeightFieldDisplay(form, field, nextValue)));
  };
  const nudge = (direction: -1 | 1) => {
    if (canonicalWeightKg === null) return;
    updateForm(updateWeightFieldCanonical(form, field, canonicalWeightKg + incrementKg * direction));
  };

  return (
    <div className={`${wide ? "col-span-2" : ""} min-w-0 text-[11px] font-medium text-white/48`}>
      <label htmlFor={inputId}>{label}</label>
      <ValidationLine id={errorId} message={issue} />
      <div className="mt-1 grid min-h-11 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] overflow-hidden rounded-xl border border-white/[0.075] bg-[#101011] transition focus-within:border-white/[0.18]">
        <button
          type="button"
          aria-label={field === "current" ? "Decrease current weight" : "Decrease goal weight"}
          onClick={() => nudge(-1)}
          className="flex min-h-11 min-w-11 items-center justify-center border-r border-white/[0.06] bg-[#171719] text-lg font-semibold text-white/66 outline-none transition hover:bg-[#1e1e21] hover:text-white focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/24 active:bg-[#111113]"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <div
          className="flex min-h-11 min-w-0 items-center justify-center gap-1 bg-[#101011] px-2"
          onClick={() => inputRef.current?.focus()}
        >
          <input
            ref={inputRef}
            id={inputId}
            inputMode="decimal"
            type="text"
            value={value}
            aria-label={label}
            aria-describedby={issue ? errorId : undefined}
            aria-invalid={issue ? true : undefined}
            onChange={(event) => updateForm(updateWeightFieldDisplay(form, field, event.target.value))}
            onBlur={(event) => commitValue(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              commitValue(event.currentTarget.value);
              event.currentTarget.blur();
            }}
            className="min-h-11 w-full min-w-0 appearance-none bg-transparent px-0 text-center text-base font-semibold text-white outline-none [appearance:textfield]"
          />
          <span className="shrink-0 text-xs font-semibold text-white/48" aria-hidden="true">{unit}</span>
        </div>
        <button
          type="button"
          aria-label={field === "current" ? "Increase current weight" : "Increase goal weight"}
          onClick={() => nudge(1)}
          className="flex min-h-11 min-w-11 items-center justify-center border-l border-white/[0.06] bg-[#171719] text-lg font-semibold text-white/66 outline-none transition hover:bg-[#1e1e21] hover:text-white focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/24 active:bg-[#111113]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function DirectionStep({
  form,
  updateForm,
  showIssues,
  issues,
}: {
  form: TargetSetupForm;
  updateForm: (form: TargetSetupForm) => void;
  showIssues: boolean;
  issues: DirectionFieldIssues;
}) {
  const currentWeightIssue = showIssues ? issues.currentWeight : undefined;
  const goalWeightIssue = showIssues ? issues.goalWeight : undefined;
  const paceIssue = showIssues ? issues.pace : undefined;
  const setGoalType = (goalType: GoalType) => {
    const nextRate = goalType === "lose"
      ? paceOptions.lose.some((option) => option.value === form.rate) ? form.rate : "0.5"
      : goalType === "gain"
        ? paceOptions.gain.some((option) => option.value === form.rate) ? form.rate : "0.25"
        : "0";
    updateForm({ ...form, goalType, rate: nextRate });
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(goalLabels) as GoalType[]).map((goalType) => (
          <button key={goalType} type="button" onClick={() => setGoalType(goalType)} className={`min-h-[4.25rem] rounded-xl px-3 text-sm font-semibold transition active:translate-y-px ${form.goalType === goalType ? wizardSelectedChoiceClass : "border border-white/[0.075] bg-[#141416] text-white/58 hover:border-white/[0.12] hover:bg-[#19191b]"}`}>{goalLabels[goalType]}</button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-white/54">Weight</p>
          <div className="w-32">
            <UnitToggle form={form} updateForm={updateForm} />
          </div>
        </div>
        <div className={`grid gap-3 ${(form.goalType === "lose" || form.goalType === "gain") ? "sm:grid-cols-2" : ""}`}>
          <WeightPicker
            form={form}
            field="current"
            wide={form.goalType !== "lose" && form.goalType !== "gain"}
            issue={currentWeightIssue}
            updateForm={updateForm}
          />
          {form.goalType === "lose" || form.goalType === "gain" ? (
            <WeightPicker
              form={form}
              field="goal"
              issue={goalWeightIssue}
              updateForm={updateForm}
            />
          ) : null}
        </div>
      </div>

      {form.goalType === "lose" || form.goalType === "gain" ? (
        <DirectionPaceSelector form={form} updateForm={updateForm} issue={paceIssue} />
      ) : (
        <p className="text-sm leading-6 text-white/46">
          {form.goalType === "maintain" ? "Keep your daily target near estimated maintenance." : "Stay near maintenance while prioritizing protein."}
        </p>
      )}
    </div>
  );
}

function DirectionPaceSelector({ form, updateForm, issue }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void; issue?: string }) {
  if (form.goalType !== "lose" && form.goalType !== "gain") return null;
  const goalType = form.goalType;
  const timeline = timelineFromForm(form);
  return (
    <div>
      <p className="text-xs font-semibold text-white/54">Pace</p>
      <ValidationLine id={directionErrorIds.pace} message={issue} />
      <div className="mt-2 grid grid-cols-3 rounded-xl border border-white/[0.07] bg-[#101011] p-1">
        {paceOptions[goalType].map((option) => {
          const selected = form.rate === option.value;
          const receivesFocusId = selected || (Boolean(issue) && option.value === paceOptions[goalType][0]?.value);
          return (
            <button
              key={option.value}
              id={receivesFocusId ? directionFieldIds.pace : undefined}
              type="button"
              aria-describedby={issue && receivesFocusId ? directionErrorIds.pace : undefined}
              onClick={() => updateForm({ ...form, rate: option.value })}
              className={`min-h-12 rounded-lg px-2 text-center text-xs font-semibold transition active:translate-y-px ${selected ? wizardSelectedSegmentClass : "border border-transparent text-white/50 hover:bg-white/[0.045]"}`}
            >
              <span className="block">{option.label}</span>
              {selected ? <span className="mt-0.5 block text-[10px] font-medium leading-3 text-white/48">{weeklyRateLabel(form, option.value)}</span> : null}
            </button>
          );
        })}
      </div>
      {timeline ? <p className="mt-2 text-xs font-medium text-white/42">Estimated timeline · {formatTimelineText(timeline)}</p> : null}
    </div>
  );
}

function BaselineStep({
  form,
  updateForm,
  activityExpanded,
  setActivityExpanded,
}: {
  form: TargetSetupForm;
  updateForm: (form: TargetSetupForm) => void;
  activityExpanded: boolean;
  setActivityExpanded: (expanded: boolean) => void;
}) {
  const visibleSex = form.formulaInput === "female" ? "female" : form.formulaInput === "male" ? "male" : null;
  const selectedActivity = activityChoices.find((choice) => choice.value === form.activityLevel) ?? activityChoices[2];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
        <div>
          <p className="text-xs font-semibold text-white/54">Sex</p>
          <div className="mt-2 grid grid-cols-2 rounded-xl border border-white/[0.07] bg-[#101011] p-1">
            {(["male", "female"] as const).map((sex) => (
              <button key={sex} type="button" onClick={() => updateForm({ ...form, formulaInput: sex })} className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition ${visibleSex === sex ? wizardSelectedSegmentClass : "border border-transparent text-white/58 hover:bg-white/[0.055] active:bg-white/[0.03]"}`}>{sex === "male" ? "Male" : "Female"}</button>
            ))}
          </div>
        </div>
        <Label text="Age">
          <input inputMode="numeric" type="text" pattern="[0-9]*" value={form.age} onChange={(event) => updateForm({ ...form, age: event.target.value })} />
        </Label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-white/54">Height</p>
          <button type="button" onClick={() => updateForm(setTargetFormUnits(form, form.units === "metric" ? "us" : "metric"))} className="rounded-lg px-2 py-1 text-[10px] font-semibold text-white/40 transition hover:bg-white/[0.045] hover:text-white/66">{form.units === "metric" ? "Metric" : "US"}</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {form.units === "metric" ? (
            <Label text="Centimeters" wide><input inputMode="decimal" type="text" value={form.heightCm} onChange={(event) => updateForm(setHeightMetric(form, event.target.value))} /><span className="field-unit">cm</span></Label>
          ) : (
            <>
              <Label text="Feet"><input inputMode="numeric" type="text" value={form.heightFeet} onChange={(event) => updateForm(setHeightUs(form, "heightFeet", event.target.value))} /><span className="field-unit">ft</span></Label>
              <Label text="Inches"><input inputMode="decimal" type="text" value={form.heightInches} onChange={(event) => updateForm(setHeightUs(form, "heightInches", event.target.value))} /><span className="field-unit">in</span></Label>
            </>
          )}
        </div>
      </div>

      <div>
        <button type="button" onClick={() => setActivityExpanded(!activityExpanded)} aria-expanded={activityExpanded} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-white/[0.075] bg-[#141416] px-3 text-left transition hover:border-white/[0.12] hover:bg-[#19191b]">
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-white/38">Daily activity</span>
            <span className="mt-0.5 block text-sm font-semibold text-white/82">{selectedActivity.label}</span>
            <span className="mt-0.5 block truncate text-xs text-white/38">{selectedActivity.description}</span>
          </span>
          <span className={`text-2xl leading-none text-white/34 transition ${activityExpanded ? "rotate-90" : ""}`}>›</span>
        </button>
        {activityExpanded ? (
          <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.07] bg-[#101011]">
            {activityChoices.map((choice) => (
              <button key={choice.value} type="button" onClick={() => { updateForm({ ...form, activityLevel: choice.value }); setActivityExpanded(false); }} className={`block w-full border-b border-white/[0.055] px-3 py-3 text-left last:border-b-0 ${form.activityLevel === choice.value ? "bg-[#242427]" : "hover:bg-white/[0.045]"}`}>
                <span className="block text-sm font-semibold text-white/76">{choice.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-white/40">{choice.description}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BasicsStep({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  const visibleSex = form.formulaInput === "female" ? "female" : form.formulaInput === "male" ? "male" : null;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-white/54">Sex</p>
        <div className="mt-2 grid grid-cols-2 rounded-xl border border-white/[0.06] bg-[#101011] p-1">
          {(["male", "female"] as const).map((sex) => (
            <button key={sex} type="button" onClick={() => updateForm({ ...form, formulaInput: sex })} className={`min-h-9 rounded-lg px-3 text-sm font-semibold transition ${visibleSex === sex ? wizardSelectedSegmentClass : "border border-transparent text-white/58 hover:bg-white/[0.055] active:bg-white/[0.03]"}`}>{sex === "male" ? "Male" : "Female"}</button>
          ))}
        </div>
      </div>
      <FormGrid>
        <Label text="Age" wide><input inputMode="numeric" type="text" pattern="[0-9]*" value={form.age} onChange={(event) => updateForm({ ...form, age: event.target.value })} /></Label>
      </FormGrid>
    </div>
  );
}

function MeasurementsStep({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="w-32">
          <p className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">Units</p>
          <UnitToggle form={form} updateForm={updateForm} />
        </div>
      </div>
      <FormGrid>
        {form.units === "metric" ? (
          <Label text="Height" wide><input inputMode="decimal" type="text" value={form.heightCm} onChange={(event) => updateForm(setHeightMetric(form, event.target.value))} /><span className="field-unit">cm</span></Label>
        ) : (
          <>
            <Label text="Height"><input inputMode="numeric" type="text" value={form.heightFeet} onChange={(event) => updateForm(setHeightUs(form, "heightFeet", event.target.value))} /><span className="field-unit">ft</span></Label>
            <Label text="Height"><input inputMode="decimal" type="text" value={form.heightInches} onChange={(event) => updateForm(setHeightUs(form, "heightInches", event.target.value))} /><span className="field-unit">in</span></Label>
          </>
        )}
        <Label text="Weight" wide><input inputMode="decimal" type="text" value={form.weight} onChange={(event) => updateForm(setWeightDisplay(form, event.target.value))} /><span className="field-unit">{form.units === "metric" ? "kg" : "lb"}</span></Label>
      </FormGrid>
    </div>
  );
}

function ActivityStep({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  return (
    <div className="grid gap-2">
      {activityChoices.map((choice) => {
        const selected = form.activityLevel === choice.value;
        return (
          <button key={choice.value} type="button" onClick={() => updateForm({ ...form, activityLevel: choice.value })} className={`min-h-14 rounded-xl px-3 py-2 text-left transition active:translate-y-px ${selected ? wizardSelectedChoiceClass : "border border-transparent bg-white/[0.035] text-white/62 hover:bg-white/[0.07]"}`}>
            <span className="block text-sm font-semibold">{choice.label}</span>
            <span className={`mt-0.5 block text-xs leading-4 ${selected ? "text-white/54" : "text-white/36"}`}>{choice.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function weeklyRateLabel(form: TargetSetupForm, rate: string) {
  const currentWeightKg = numberOrNull(form.weightKgCanonical);
  const parsedRate = Number(rate);
  if (currentWeightKg === null || !Number.isFinite(parsedRate)) return `About ${rate}% body weight per week`;
  return `About ${displayWeightFromKg(currentWeightKg * parsedRate / 100, form.units)} per week`;
}

function currentWeightLabel(form: TargetSetupForm) {
  const currentWeightKg = numberOrNull(form.weightKgCanonical);
  return currentWeightKg === null ? "Current weight not set" : displayWeightFromKg(currentWeightKg, form.units);
}

function PaceSelector({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  if (form.goalType !== "lose" && form.goalType !== "gain") return null;
  return (
    <div>
      <p className="text-xs font-semibold text-white/54">Pace</p>
      <div className="mt-2 grid gap-2">
        {paceOptions[form.goalType].map((option) => {
          const selected = form.rate === option.value;
          return (
            <button key={option.value} type="button" onClick={() => updateForm({ ...form, rate: option.value })} className={`min-h-14 rounded-xl px-3 py-2 text-left transition active:translate-y-px ${selected ? wizardSelectedChoiceClass : "border border-transparent bg-white/[0.035] text-white/62 hover:bg-white/[0.07]"}`}>
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{option.label}</span>
                <span className={`text-[11px] font-medium ${selected ? "text-white/56" : "text-white/36"}`}>{weeklyRateLabel(form, option.value)}</span>
              </span>
              <span className={`mt-0.5 block text-xs leading-4 ${selected ? "text-white/48" : "text-white/32"}`}>{option.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DefineGoalStep({ form, updateForm }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void }) {
  const issue = goalDefinitionIssue(form);
  if (form.goalType === "maintain") {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-sm leading-6 text-white/62">
        <p className="font-semibold text-white/82">Maintain near {currentWeightLabel(form)}</p>
        <p className="mt-1 text-xs leading-5 text-white/42">CREATOR will design this target to keep you near your current weight with a zero goal rate.</p>
      </div>
    );
  }
  if (form.goalType === "recomposition") {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-sm leading-6 text-white/62">
        <p className="font-semibold text-white/82">Stay near maintenance</p>
        <p className="mt-1 text-xs leading-5 text-white/42">CREATOR will keep calories near estimated maintenance while using the existing recomposition macro behavior, with protein prioritized.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/34">Current weight</p>
        <p className="mt-1 text-lg font-semibold text-white/84">{currentWeightLabel(form)}</p>
      </div>
      <FormGrid>
        <Label text={`Goal weight (${form.units === "metric" ? "kg" : "lb"})`} wide><input inputMode="decimal" type="number" step="0.1" value={form.goalWeight} onChange={(event) => updateForm(setGoalWeightDisplay(form, event.target.value))} /></Label>
      </FormGrid>
      <PaceSelector form={form} updateForm={updateForm} />
      {issue ? <p className="rounded-lg border border-amber-300/15 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100/75">{issue}</p> : null}
    </div>
  );
}

function EditProfileSurface({ form, updateForm, profileSaved, onRecalculate }: { form: TargetSetupForm; updateForm: (form: TargetSetupForm) => void; profileSaved: boolean; onRecalculate: () => void }) {
  return (
    <div className="space-y-4">
      <Section title="Body basics" summary={bodyBasicsSummary(form)}>
        <BasicsStep form={form} updateForm={updateForm} />
        <div className="mt-4"><MeasurementsStep form={form} updateForm={updateForm} /></div>
      </Section>
      <Section title="Activity" summary={activityChoices.find((choice) => choice.value === form.activityLevel)?.label}>
        <ActivityStep form={form} updateForm={updateForm} />
      </Section>
      <AdvancedTargetSurface form={form} profileOnly updateForm={updateForm} percentageTotal={macroPercentTotal(form)} percentageDetails={derivePercentageMacroDetails(form)} automaticLoseBlocked={false} />
      {profileSaved ? (
        <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.06] p-3 text-xs leading-5 text-emerald-100/75">
          <p className="font-semibold">Profile saved. Active target unchanged.</p>
          <p>Your existing daily targets stay the same until you recalculate or update the goal.</p>
          <button type="button" onClick={onRecalculate} className={`mt-2 ${wizardSmallPrimaryActionClass}`}>Recalculate goal</button>
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
            <button type="button" onClick={() => updateForm({ ...form, formulaInput: form.formulaInput === "female" ? "female" : "male" })} className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition active:translate-y-px ${form.formulaInput !== "manual" ? wizardSelectedSegmentClass : "border border-transparent bg-white/[0.04] text-white/56 hover:bg-white/[0.065]"}`}>Suggested</button>
            <button type="button" onClick={() => updateForm({ ...form, formulaInput: "manual" })} className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition active:translate-y-px ${form.formulaInput === "manual" ? wizardSelectedSegmentClass : "border border-transparent bg-white/[0.04] text-white/56 hover:bg-white/[0.065]"}`}>Manual calories</button>
          </div>
          {form.formulaInput === "manual" ? (
            <FormGrid>
              <Label text="Manual calorie target" wide><input inputMode="numeric" type="number" value={form.calories} onChange={(event) => updateForm({ ...form, calories: event.target.value })} /></Label>
            </FormGrid>
          ) : null}
        </div>
      ) : null}
      {!profileOnly ? (
        <Section title="Goal details" summary={form.goalType === "lose" || form.goalType === "gain" ? `${form.goalWeight || "Goal weight"} ${form.units === "metric" ? "kg" : "lb"} · ${weeklyRateLabel(form, form.rate)}` : goalLabels[form.goalType]}>
          <DefineGoalStep form={form} updateForm={updateForm} />
        </Section>
      ) : null}
      <FormGrid>
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
        {Object.entries(macroModeLabels).map(([mode, label]) => <button key={mode} type="button" onClick={() => updateForm({ ...form, macroMode: mode as MacroMode })} className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition active:translate-y-px ${form.macroMode === mode ? wizardSelectedSegmentClass : "border border-transparent bg-white/[0.04] text-white/52 hover:bg-white/[0.065]"}`}>{label}</button>)}
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

function ResultSurface({ preview, showCalculation }: { preview: NutritionTargetResult; showCalculation: boolean }) {
  const calorieAdjustment = preview.calorieTargetKcal - preview.estimatedMaintenanceKcal;
  const currentWeight = displayWeightFromKg(preview.weightKg, preview.preferredUnits);
  const goalWeight = preview.goalWeightKg === null ? null : displayWeightFromKg(preview.goalWeightKg, preview.preferredUnits);
  const selectedPace = paceLabel(preview.goalType, preview.goalRatePctPerWeek);
  const timeline = calculateGoalTimelineEstimate({
    goalType: preview.goalType,
    currentWeightKg: preview.weightKg,
    goalWeightKg: preview.goalWeightKg,
    effectiveRateKgPerWeek: preview.effectiveGoalRateKgPerWeek,
    selectedRateKgPerWeek: preview.selectedGoalRateKgPerWeek,
  });
  const goalLine = preview.goalType === "lose" || preview.goalType === "gain"
    ? `${currentWeight}${goalWeight ? ` → ${goalWeight}` : ""} · ${selectedPace ?? "Selected pace"} · ${formatSignedCalories(calorieAdjustment)}`
    : preview.goalType === "maintain"
      ? "Targeted near maintenance"
      : "Maintenance calories with protein prioritized";
  return (
    <div className="space-y-5">
      <div className="pt-2">
        <h3 className="text-2xl font-semibold leading-8 text-white">Your daily target</h3>
        <div className="mt-8 text-center">
          <p className="text-6xl font-semibold tracking-normal text-white">{preview.calorieTargetKcal.toLocaleString()}</p>
          <p className="mt-2 text-sm font-medium text-white/48">calories per day</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-y border-white/[0.07] py-3 text-center text-xs text-white/48">
        <p>Protein<br /><span className="text-base font-semibold text-white">{preview.proteinTargetG} g</span></p>
        <p>Carbs<br /><span className="text-base font-semibold text-white">{preview.carbTargetG} g</span></p>
        <p>Fat<br /><span className="text-base font-semibold text-white">{preview.fatTargetG} g</span></p>
      </div>
      <div className="space-y-1 text-xs leading-5 text-white/46">
        <p><span className="text-white/68">Estimated maintenance</span> · {preview.estimatedMaintenanceKcal.toLocaleString()} kcal</p>
        <p>{goalLine}</p>
        {timeline ? <p>Estimated timeline · {formatTimelineText(timeline, true)}</p> : null}
      </div>
      {preview.warnings.length ? (
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3 text-xs leading-5 text-amber-100/75">
        {preview.warnings.map((warning) => <p key={warning} className="text-amber-200/75">{warning}</p>)}
        </div>
      ) : null}
      {showCalculation ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[11px] leading-5 text-white/42">
          <p>Estimated maintenance {preview.estimatedMaintenanceKcal.toLocaleString()} kcal{preview.calculationInputs.maintenanceSource === "manual_estimate" ? " · manual estimate" : ""}</p>
          <p>Resting estimate {preview.restingEstimateDisplayKcal ?? "Manual"} kcal</p>
          <p>Goal adjustment {formatSignedCalories(calorieAdjustment)}</p>
          <p>Method {preview.formulaName} · {preview.algorithmVersion}</p>
          {goalWeight ? <p>Goal weight {goalWeight}</p> : null}
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

function ValidationLine({ id, message }: { id: string; message?: string }) {
  return (
    <span
      id={message ? id : undefined}
      aria-hidden={message ? undefined : true}
      className="mt-1 block min-h-3 text-[11px] leading-3 text-red-300/78"
    >
      {message ?? ""}
    </span>
  );
}

function Label({
  text,
  wide,
  children,
  validationId,
  validationMessage,
}: {
  text: string;
  wide?: boolean;
  children: React.ReactNode;
  validationId?: string;
  validationMessage?: string;
}) {
  return (
    <label className={`${wide ? "col-span-2" : ""} min-w-0 text-[11px] font-medium text-white/48 [&_.field-unit]:mt-1 [&_.field-unit]:block [&_.field-unit]:text-[10px] [&_.field-unit]:font-normal [&_.field-unit]:text-white/30 [&_input]:mt-1 [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-white/[0.075] [&_input]:bg-[#101011] [&_input]:px-3 [&_input]:text-white [&_input]:outline-none [&_input]:transition [&_input]:focus:border-white/[0.18] [&_select]:mt-1 [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-white/[0.075] [&_select]:bg-[#101011] [&_select]:px-3 [&_select]:text-xs [&_select]:text-white [&_select]:outline-none`}>
      <span>{text}</span>
      {validationId ? <ValidationLine id={validationId} message={validationMessage} /> : null}
      {children}
    </label>
  );
}
