"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Calendar,
  ChevronRight,
  Dumbbell,
  LoaderCircle,
  RotateCcw,
  Settings2,
} from "lucide-react";

import { NutritionDailyProgressCard } from "@/components/nutrition/NutritionDailyProgressCard";
import { BodyMuscleMapPrototype } from "@/components/areas/body/BodyMuscleMapPrototype";
import { NutritionTargetPanel } from "@/components/nutrition/NutritionTargetPanel";
import { SharedMealPlanPanel } from "@/components/nutrition/SharedMealPlanPanel";
import { useMealPlanDay } from "@/hooks/useMealPlanDay";
import { dispatchOpenFitnessWorkoutEvent } from "@/lib/fitness/openWorkout";
import { hapticPress } from "@/lib/haptics/creatorHaptics";
import { statusLabel } from "@/lib/nutrition/mealPlans";
import { cn } from "@/lib/utils";

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function BodyActionButton({
  icon,
  title,
  detail,
  onClick,
  isActive = false,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[4.5rem] min-w-0 items-center gap-2 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99]",
        isActive
          ? "border-white/[0.14] bg-white/[0.07]"
          : "border-white/[0.075] bg-[#090909] hover:bg-white/[0.045]",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.075] bg-white/[0.045] text-white/66">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white/86">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-white/40">
          {detail}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/28" />
    </button>
  );
}

function BodyMealPlanSummary({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const {
    plan,
    isLoading,
    isRefreshing,
    error,
    backgroundError,
    refresh,
  } = useMealPlanDay("nutrition");
  const items = plan?.items ?? [];
  const nextItem = items.find((item) => item.status === "planned") ?? items[0];
  const loggedCount = items.filter((item) => item.status === "logged").length;
  const plannedCalories = items.reduce((sum, item) => {
    if (!item.nutrition_snapshot.loggable) return sum;
    return sum + item.nutrition_snapshot.calories * item.servings;
  }, 0);
  const plannedProtein = items.reduce((sum, item) => {
    if (!item.nutrition_snapshot.loggable) return sum;
    return sum + item.nutrition_snapshot.protein_g * item.servings;
  }, 0);
  const detail = plan
    ? `${items.length} ${items.length === 1 ? "item" : "items"} · ${loggedCount} logged`
    : "Current Creator day";

  return (
    <section
      className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
      aria-label="Meal plan summary"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-white/[0.035] active:scale-[0.995]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.075] bg-white/[0.045] text-white/66">
          <Calendar className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-white/88">
              Meal Plan
            </span>
            {isLoading || isRefreshing ? (
              <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-white/34" />
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
            {error ? "Unable to load plan" : detail}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-white/32 transition-transform",
            expanded ? "rotate-90" : "",
          )}
          aria-hidden="true"
        />
      </button>

      {error ? (
        <div className="border-t border-red-200/10 px-3 py-3">
          <p className="text-xs font-medium text-red-100/76">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 inline-flex min-h-8 items-center gap-2 rounded-lg border border-white/10 px-2.5 text-[11px] font-semibold text-white/70"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : plan ? (
        <div className="grid grid-cols-[minmax(0,1.45fr)_auto_auto] items-center gap-2 border-t border-white/[0.055] px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white/76">
              {nextItem?.label ?? "No meals planned"}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-white/36">
              {nextItem
                ? `${nextItem.servings} serving${nextItem.servings === 1 ? "" : "s"} · ${statusLabel(nextItem.status)}`
                : "Plan meals when useful."}
            </p>
            {backgroundError ? (
              <p className="mt-1 truncate text-[10px] text-red-100/62">
                {backgroundError}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
              kcal
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-white/78">
              {formatCompactNumber(plannedCalories)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
              pro
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-white/78">
              {formatCompactNumber(plannedProtein)}g
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function BodyAreaDashboard() {
  const targetSectionRef = useRef<HTMLElement | null>(null);
  const [targetSetupOpen, setTargetSetupOpen] = useState(false);
  const [mealPlanOpen, setMealPlanOpen] = useState(false);
  const [targetPanelOpen, setTargetPanelOpen] = useState(false);

  function scrollToNutritionTarget() {
    setTargetPanelOpen(true);
    targetSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function openFitness() {
    void hapticPress();
    dispatchOpenFitnessWorkoutEvent({
      source: "body",
      requestId: `fitness-workout:body:${Date.now()}`,
    });
  }

  return (
    <div className="space-y-3 py-3">
      <NutritionDailyProgressCard onConfigureTarget={scrollToNutritionTarget} />

      <BodyMuscleMapPrototype />


      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <BodyMealPlanSummary
          expanded={mealPlanOpen}
          onToggle={() => setMealPlanOpen((open) => !open)}
        />

        <BodyActionButton
          icon={<Dumbbell className="h-4 w-4" aria-hidden="true" />}
          title="Fitness"
          detail="Open workout flow"
          onClick={openFitness}
        />
      </div>

      {mealPlanOpen ? (
        <section aria-label="Today's meal plan">
          <SharedMealPlanPanel
            surface="nutrition"
            showNutritionTarget={false}
            onNutritionTargetSetupOpenChange={setTargetSetupOpen}
          />
        </section>
      ) : null}

      <section
        ref={targetSectionRef}
        className="scroll-mt-20"
        aria-label="Nutrition target"
      >
        {targetPanelOpen || targetSetupOpen ? (
          <div
            className={cn(
              targetSetupOpen
                ? "overflow-hidden rounded-2xl border border-white/[0.07] bg-[#090909]"
                : "overflow-hidden rounded-2xl border border-white/[0.07] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]",
            )}
          >
            {!targetSetupOpen ? (
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Settings2 className="h-4 w-4 shrink-0 text-white/44" />
                  <p className="truncate text-sm font-semibold text-white/82">
                    Target
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTargetPanelOpen(false)}
                  className="text-[11px] font-semibold text-white/42 transition hover:text-white/70"
                >
                  Hide
                </button>
              </div>
            ) : null}
            <NutritionTargetPanel
              presentation="compact"
              onSetupOpenChange={setTargetSetupOpen}
            />
          </div>
        ) : (
          <BodyActionButton
            icon={<Settings2 className="h-4 w-4" aria-hidden="true" />}
            title="Target"
            detail="View or adjust macros"
            onClick={() => setTargetPanelOpen(true)}
          />
        )}
      </section>

    </div>
  );
}
