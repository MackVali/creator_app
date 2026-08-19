import type { ReactNode } from "react";

import {
  NUTRITION_DAILY_MACRO_KEYS,
  type NutritionDailyMetricKey,
} from "@/lib/nutrition/dailyTotals";

export type NutritionProgressTotals = Partial<
  Record<NutritionDailyMetricKey, number | null | undefined>
>;

function getProgressNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatNutritionProgressNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function getMacroLabel(metric: (typeof NUTRITION_DAILY_MACRO_KEYS)[number]) {
  if (metric === "carbs") return "Carbs";
  if (metric === "protein") return "Protein";
  return "Fat";
}

function NutritionProgressBar({
  label,
  savedValue,
  previewValue,
  target,
  action,
  unit = "",
  size,
  isAnimatedIn,
  shouldReduceMotion,
}: {
  label: string;
  savedValue: number | null | undefined;
  previewValue: number | null | undefined;
  target: number | null | undefined;
  action?: ReactNode;
  unit?: string;
  size: "large" | "small";
  isAnimatedIn: boolean;
  shouldReduceMotion: boolean | null;
}) {
  const normalizedSavedValue = getProgressNumber(savedValue);
  const normalizedPreviewValue = getProgressNumber(previewValue);
  const normalizedTarget = getProgressNumber(target);
  const savedPercent =
    normalizedTarget > 0
      ? Math.min(100, Math.max(0, (normalizedSavedValue / normalizedTarget) * 100))
      : 0;
  const previewPercent =
    normalizedTarget > 0
      ? Math.min(
          Math.max(0, (normalizedPreviewValue / normalizedTarget) * 100),
          Math.max(0, 100 - savedPercent),
        )
      : 0;
  const displayValue = normalizedSavedValue + normalizedPreviewValue;
  const displayedSavedPercent = isAnimatedIn ? savedPercent : 0;
  const displayedPreviewPercent = isAnimatedIn ? previewPercent : 0;
  const formattedValue = formatNutritionProgressNumber(displayValue) ?? "0";
  const formattedTarget =
    formatNutritionProgressNumber(normalizedTarget) ?? String(normalizedTarget);
  const progressValue = `${formattedValue}${unit} / ${formattedTarget}${unit}`;
  const barHeightClassName = size === "large" ? "h-3" : "h-2";
  const labelClassName =
    size === "large"
      ? "text-sm font-semibold text-white/82"
      : "text-[11px] font-semibold text-white/64";
  const valueClassName =
    size === "large"
      ? "text-xs font-semibold text-white/52"
      : "text-[10px] font-semibold text-white/42";
  const fillTransitionClassName = shouldReduceMotion
    ? ""
    : "transition-[width] duration-700 ease-out";
  const savedSegmentRadiusClassName = previewPercent > 0 ? "rounded-l-full" : "rounded-full";
  const previewSegmentRadiusClassName = savedPercent > 0 ? "rounded-r-full" : "rounded-full";

  return (
    <div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className={labelClassName}>{label}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={`${valueClassName} tabular-nums`}>{progressValue}</span>
          {action}
        </span>
      </div>
      <div
        className={`relative mt-1.5 overflow-hidden rounded-full border border-white/[0.045] bg-black/36 shadow-[inset_0_1px_1px_rgba(255,255,255,0.07),inset_0_-1px_2px_rgba(0,0,0,0.55)] ${barHeightClassName}`}
        role="meter"
        aria-label={`${label} daily intake`}
        aria-valuemin={0}
        aria-valuemax={normalizedTarget}
        aria-valuenow={Math.min(displayValue, normalizedTarget)}
      >
        <div className="flex h-full w-full overflow-hidden rounded-full" aria-hidden="true">
          <div
            className={`h-full shrink-0 bg-[#858585] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] ${savedSegmentRadiusClassName} ${fillTransitionClassName}`}
            style={{ width: `${displayedSavedPercent}%` }}
          />
          <div
            className={`h-full shrink-0 bg-[#5a5a5a] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${previewSegmentRadiusClassName} ${fillTransitionClassName}`}
            style={{ width: `${displayedPreviewPercent}%` }}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.12]"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export function NutritionMacroProgressGrid({
  savedTotals,
  previewTotals,
  targetGoals,
  isAnimatedIn,
  shouldReduceMotion,
  className = "",
}: {
  savedTotals: NutritionProgressTotals;
  previewTotals?: NutritionProgressTotals;
  targetGoals: NutritionProgressTotals;
  isAnimatedIn: boolean;
  shouldReduceMotion: boolean | null;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-3 gap-1.5 ${className}`}>
      {NUTRITION_DAILY_MACRO_KEYS.map((macroKey) => (
        <div key={macroKey} className="min-w-0 rounded-lg bg-white/[0.035] px-2 py-2">
          <NutritionProgressBar
            label={getMacroLabel(macroKey)}
            savedValue={savedTotals[macroKey]}
            previewValue={previewTotals?.[macroKey]}
            target={targetGoals[macroKey]}
            unit="g"
            size="small"
            isAnimatedIn={isAnimatedIn}
            shouldReduceMotion={shouldReduceMotion}
          />
        </div>
      ))}
    </div>
  );
}

export function NutritionDailyProgressBars({
  savedTotals,
  previewTotals,
  targetGoals,
  error,
  calorieAction,
  isAnimatedIn,
  shouldReduceMotion,
  className = "",
}: {
  savedTotals: NutritionProgressTotals;
  previewTotals: NutritionProgressTotals;
  targetGoals: NutritionProgressTotals;
  error?: string | null;
  calorieAction?: ReactNode;
  isAnimatedIn: boolean;
  shouldReduceMotion: boolean | null;
  className?: string;
}) {
  return (
    <div className={`space-y-2.5 px-1 pb-2.5 ${className}`}>
      <NutritionProgressBar
        label="Calories"
        savedValue={savedTotals.calories}
        previewValue={previewTotals.calories}
        target={targetGoals.calories}
        action={calorieAction}
        size="large"
        isAnimatedIn={isAnimatedIn}
        shouldReduceMotion={shouldReduceMotion}
      />
      <NutritionMacroProgressGrid
        savedTotals={savedTotals}
        previewTotals={previewTotals}
        targetGoals={targetGoals}
        isAnimatedIn={isAnimatedIn}
        shouldReduceMotion={shouldReduceMotion}
      />
      {error ? <p className="text-[11px] font-medium text-red-200/68">{error}</p> : null}
    </div>
  );
}
