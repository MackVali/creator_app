"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import {
  Calendar,
  ChevronDown,
  Dumbbell,
  LoaderCircle,
  Settings2,
} from "lucide-react";

import { NutritionDailyProgressCard } from "@/components/nutrition/NutritionDailyProgressCard";
import { BodyMuscleMapPrototype } from "@/components/areas/body/BodyMuscleMapPrototype";
import { NutritionTargetPanel } from "@/components/nutrition/NutritionTargetPanel";
import { SharedMealPlanPanel } from "@/components/nutrition/SharedMealPlanPanel";
import { useMealPlanDay } from "@/hooks/useMealPlanDay";
import { dispatchOpenFitnessWorkoutEvent } from "@/lib/fitness/openWorkout";
import { hapticPress } from "@/lib/haptics/creatorHaptics";
import { cn } from "@/lib/utils";

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

type MealPlanDayResult = ReturnType<typeof useMealPlanDay>;

function BodyDashboardTile({
  icon,
  title,
  detail,
  onClick,
  isActive = false,
  isLoading = false,
  ariaLabel,
  ariaControls,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  isActive?: boolean;
  isLoading?: boolean;
  ariaLabel: string;
  ariaControls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={ariaControls ? isActive : undefined}
      aria-controls={ariaControls}
      className={cn(
        "flex min-h-[5.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] transition active:scale-[0.99]",
        isActive
          ? "border-white/[0.14] bg-white/[0.07]"
          : "border-white/[0.075] bg-[#090909] hover:bg-white/[0.045]",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.075] bg-white/[0.045] text-white/66">
        {icon}
      </span>
      <span className="flex min-w-0 max-w-full flex-col items-center">
        <span className="block max-w-full truncate text-xs font-semibold leading-tight text-white/86">
          {title}
        </span>
        <span className="mt-0.5 flex max-w-full items-center justify-center gap-1 truncate text-[10px] font-medium leading-tight text-white/40">
          {isLoading ? (
            <LoaderCircle
              className="h-3 w-3 shrink-0 animate-spin text-white/34"
              aria-hidden="true"
            />
          ) : null}
          <span className="min-w-0 truncate">{detail}</span>
        </span>
      </span>
    </button>
  );
}

function BodyMealPlanTile({
  expanded,
  onToggle,
  mealPlanDay,
}: {
  expanded: boolean;
  onToggle: () => void;
  mealPlanDay: MealPlanDayResult;
}) {
  const {
    plan,
    isLoading,
    isRefreshing,
    error,
  } = mealPlanDay;
  const items = plan?.items ?? [];
  const loggedCount = items.filter((item) => item.status === "logged").length;
  const plannedCount = items.filter((item) => item.status === "planned").length;
  const detail = plan
    ? loggedCount > 0
      ? `${loggedCount} logged`
      : `${plannedCount || items.length} planned`
    : "Current Creator day";

  return (
    <BodyDashboardTile
      icon={<Calendar className="h-4 w-4" aria-hidden="true" />}
      title="Meal Plan"
      detail={error ? "Plan unavailable" : detail}
      onClick={onToggle}
      isActive={expanded}
      isLoading={isLoading || isRefreshing}
      ariaLabel="Toggle meal plan panel"
      ariaControls="body-meal-plan-panel"
    />
  );
}

export function BodyAreaDashboard() {
  const dashboardBodyId = useId();
  const targetSectionRef = useRef<HTMLElement | null>(null);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [targetSetupOpen, setTargetSetupOpen] = useState(false);
  const [mealPlanOpen, setMealPlanOpen] = useState(false);
  const [targetPanelOpen, setTargetPanelOpen] = useState(false);
  const mealPlanDay = useMealPlanDay("nutrition");
  const mealPlanItems = mealPlanDay.plan?.items ?? [];
  const loggedMealCount = mealPlanItems.filter(
    (item) => item.status === "logged"
  ).length;
  const plannedCalories = mealPlanItems.reduce((sum, item) => {
    if (!item.nutrition_snapshot.loggable) return sum;
    return sum + item.nutrition_snapshot.calories * item.servings;
  }, 0);
  const plannedProtein = mealPlanItems.reduce((sum, item) => {
    if (!item.nutrition_snapshot.loggable) return sum;
    return sum + item.nutrition_snapshot.protein_g * item.servings;
  }, 0);
  const mealPlanLoading = mealPlanDay.isLoading || mealPlanDay.isRefreshing;
  const bodySummaryPrimary = mealPlanLoading
    ? "Loading meal status"
    : mealPlanDay.error
      ? "Meal status unavailable"
      : mealPlanDay.plan && mealPlanItems.length > 0
        ? `${mealPlanItems.length} ${
            mealPlanItems.length === 1 ? "meal" : "meals"
          } · ${loggedMealCount} logged`
        : "No meals planned";
  const bodySummarySecondary =
    mealPlanLoading ||
    mealPlanDay.error ||
    !mealPlanDay.plan ||
    mealPlanItems.length === 0
      ? null
      : `${formatCompactNumber(plannedCalories)} kcal · ${formatCompactNumber(
          plannedProtein
        )}g protein`;

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

  function toggleTargetPanel() {
    setTargetPanelOpen((open) => (targetSetupOpen ? true : !open));
  }

  return (
    <div
      className={cn(
        "space-y-3",
        dashboardExpanded ? "py-3" : "-mb-1 py-0"
      )}
    >
      <button
        type="button"
        aria-expanded={dashboardExpanded}
        aria-controls={dashboardBodyId}
        onClick={() => setDashboardExpanded((expanded) => !expanded)}
        className={cn(
          "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/[0.075] bg-[#090909] px-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] transition hover:border-white/[0.12] hover:bg-[#101011] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/24 active:scale-[0.995]",
          dashboardExpanded ? "min-h-14 py-2.5" : "min-h-12 py-2",
        )}
      >
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/44">
              Body
            </span>
            {mealPlanLoading ? (
              <LoaderCircle
                className="h-3.5 w-3.5 shrink-0 animate-spin text-white/34"
                aria-hidden="true"
              />
            ) : null}
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-white/82">
            {bodySummaryPrimary}
          </span>
          {bodySummarySecondary ? (
            <span className="mt-0.5 block truncate text-[11px] font-medium text-white/42">
              {bodySummarySecondary}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-white/32 transition-transform",
            dashboardExpanded && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {dashboardExpanded ? (
        <div id={dashboardBodyId} className="space-y-3">
          <NutritionDailyProgressCard
            onConfigureTarget={scrollToNutritionTarget}
          />

          <BodyMuscleMapPrototype />

          <div className="grid grid-cols-3 gap-2">
            <BodyMealPlanTile
              expanded={mealPlanOpen}
              onToggle={() => setMealPlanOpen((open) => !open)}
              mealPlanDay={mealPlanDay}
            />

            <BodyDashboardTile
              icon={<Dumbbell className="h-4 w-4" aria-hidden="true" />}
              title="Fitness"
              detail="Workout"
              onClick={openFitness}
              ariaLabel="Open fitness workout flow"
            />

            <BodyDashboardTile
              icon={<Settings2 className="h-4 w-4" aria-hidden="true" />}
              title="Target"
              detail="Macros"
              onClick={toggleTargetPanel}
              isActive={targetPanelOpen || targetSetupOpen}
              ariaLabel="Toggle nutrition target panel"
              ariaControls="body-nutrition-target-panel"
            />
          </div>

          {mealPlanOpen ? (
            <section id="body-meal-plan-panel" aria-label="Today's meal plan">
              <SharedMealPlanPanel
                surface="nutrition"
                showNutritionTarget={false}
                onNutritionTargetSetupOpenChange={setTargetSetupOpen}
              />
            </section>
          ) : null}

          <section
            id="body-nutrition-target-panel"
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
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
