"use client";

import { Plus, RotateCcw, Settings2 } from "lucide-react";

import { NutritionDailyProgressBars } from "@/components/nutrition/NutritionDailyProgressBars";
import { useNutritionDailyTotals } from "@/hooks/useNutritionDailyTotals";
import {
  EMPTY_NUTRITION_TOTALS,
  type NutritionDailyMetricKey,
} from "@/lib/nutrition/dailyTotals";
import { dispatchOpenNutritionLogEvent } from "@/lib/nutrition/logEvents";

export function NutritionDailyProgressCard({
  onConfigureTarget,
}: {
  onConfigureTarget?: () => void;
}) {
  const {
    totals,
    targets,
    error,
    targetIsLoading,
    targetError,
    refresh,
  } = useNutritionDailyTotals();
  const displayedTotals = totals ?? EMPTY_NUTRITION_TOTALS;
  const hasCompleteTarget =
    Boolean(targets) &&
    ["calories", "carbs", "protein", "fat"].every(
      (key) => targets?.[key as NutritionDailyMetricKey] !== null,
    );

  return (
    <section
      className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
      aria-label="Today's nutrition"
    >
      <div className="space-y-2.5 px-3 py-2.5 sm:px-4">
        {error ? (
          <div className="rounded-xl border border-red-200/10 bg-red-200/[0.035] px-3 py-3">
            <p className="text-xs font-medium text-red-100/76">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-white/70"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : (
          <>
            <NutritionDailyProgressBars
              savedTotals={displayedTotals}
              previewTotals={EMPTY_NUTRITION_TOTALS}
              targetGoals={targets ?? EMPTY_NUTRITION_TOTALS}
              calorieAction={
                <button
                  type="button"
                  aria-label="Log food"
                  onClick={() => dispatchOpenNutritionLogEvent()}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-400 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition hover:bg-zinc-300 active:bg-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/60"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                </button>
              }
              isAnimatedIn
              shouldReduceMotion={false}
            />
          </>
        )}

        {targetError ? (
          <p className="text-[11px] font-medium text-red-100/62">
            Target unavailable: {targetError}
          </p>
        ) : null}

        {!targetIsLoading && !targetError && !hasCompleteTarget ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onConfigureTarget}
              className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-3 text-xs font-semibold text-white/58 transition hover:bg-white/[0.045] hover:text-white/76"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Target
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
