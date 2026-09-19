"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Timer } from "lucide-react";

import { AreaSkillRelations } from "@/components/areas/AreaSkillRelations";
import { AreaMonuments } from "@/components/areas/AreaMonuments";
import { BodyAreaDashboard } from "@/components/areas/BodyAreaDashboard";
import { MindAreaDashboard } from "@/components/areas/MindAreaDashboard";
import { MoneyAreaDashboard } from "@/components/areas/MoneyAreaDashboard";
import FocusPomo, { type FocusPomoSource } from "@/components/focus/FocusPomo";
import {
  AreaFeaturedGoal,
  type AreaFeaturedGoalControls,
} from "@/components/goals/AreaFeaturedGoal";
import ActivityPanel from "@/components/monuments/ActivityPanel";
import { MonumentGoalsList } from "@/components/monuments/MonumentGoalsList";
import { MonumentRelatedHabits } from "@/components/monuments/MonumentRelatedHabits";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";
import {
  segmentedToggleActiveClassName,
  segmentedToggleButtonClassName,
  segmentedToggleContainerClassName,
  segmentedToggleInactiveClassName,
} from "@/components/ui/segmented-toggle-styles";
import type { AreaConfig } from "@/config/areas";
import type { Goal } from "@/app/(app)/goals/types";
import { useAreaActivity } from "@/lib/hooks/useMonumentActivity";
import { cn } from "@/lib/utils";

const areaEmojiStyle = {
  fontFamily:
    '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
  WebkitTouchCallout: "none",
  WebkitTapHighlightColor: "transparent",
  WebkitUserSelect: "none",
  userSelect: "none",
} as CSSProperties;

type AreaView = "goals" | "roadmap";
type GoalPanel = "active" | "completed";
type AreaDetailTab = "overview" | "dashboard" | "analytics" | "skills";

const AREA_DETAIL_TABS: Array<{
  value: AreaDetailTab;
  label: string;
}> = [
  { value: "overview", label: "OVERVIEW" },
  { value: "dashboard", label: "DASHBOARD" },
  { value: "analytics", label: "ANALYTICS" },
  { value: "skills", label: "SKILLS" },
];

const CHARGE_MILESTONES = [
  { label: "Lit", threshold: 1 },
  { label: "EVO", threshold: 25 },
  { label: "EVO 2", threshold: 75 },
  { label: "EVO 3", threshold: 125 },
  { label: "EVO 4", threshold: 225 },
] as const;

export function AreaDetail({
  area,
}: {
  area: AreaConfig;
  onClose: () => void;
}) {
  const { summary } = useAreaActivity(area.id);
  const [areaView, setAreaView] = useState<AreaView>("goals");
  const [activeAreaTab, setActiveAreaTab] =
    useState<AreaDetailTab>("overview");
  const [mountedAreaTabs, setMountedAreaTabs] = useState<Set<AreaDetailTab>>(
    () => new Set(["overview"])
  );
  const [goalSection, setGoalSection] = useState<GoalPanel>("active");
  const [featuredGoalId, setFeaturedGoalId] = useState<string | null>(null);
  const [featuredGoal, setFeaturedGoal] = useState<Goal | null>(null);
  const [featuredGoalControls, setFeaturedGoalControls] =
    useState<AreaFeaturedGoalControls | null>(null);
  const [focusPomoSource, setFocusPomoSource] =
    useState<FocusPomoSource | null>(null);

  const containerShell =
    "relative w-full rounded-2xl border border-white/[0.08] sm:rounded-3xl";
  const overviewBackground =
    "bg-[#111216] shadow-[0_34px_110px_-50px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.075),inset_0_-1px_0_rgba(255,255,255,0.018)]";
  const sectionBackground =
    "bg-[#0D0E11] shadow-[0_24px_70px_-52px_rgba(0,0,0,0.86),inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-1px_0_rgba(0,0,0,0.48)]";

  const activeChargeStageIndex = Math.max(
    CHARGE_MILESTONES.findIndex(
      (milestone) => milestone.label === summary.evoLabel
    ),
    0
  );

  const activeChargeCellFill = Math.min(
    Math.max(summary.chargeProgressPercent, 0),
    100
  );

  const getChargeCellFill = (index: number) => {
    if (index < activeChargeStageIndex) return 100;
    if (index === activeChargeStageIndex) return activeChargeCellFill;
    return 0;
  };

  const totalChargeFilledCellUnits = Math.min(
    Math.max(activeChargeStageIndex + activeChargeCellFill / 100, 0),
    CHARGE_MILESTONES.length
  );

  const totalChargeCompletedGapCount = Math.min(
    Math.max(activeChargeStageIndex, 0),
    CHARGE_MILESTONES.length - 1
  );

  function openAreaFocusPomo() {
    setFocusPomoSource({
      sourceType: "area",
      sourceId: area.id,
      title: area.label,
      icon: area.emoji,
    });
  }

  const handleFeaturedGoalResolved = useCallback(
    (goal: Goal | null, controls?: AreaFeaturedGoalControls) => {
      setFeaturedGoal(goal);
      setFeaturedGoalControls(controls ?? null);
    },
    []
  );

  const activateAreaTab = useCallback((tab: AreaDetailTab) => {
    setMountedAreaTabs((current) => {
      if (current.has(tab)) return current;

      const next = new Set(current);
      next.add(tab);
      return next;
    });

    setActiveAreaTab(tab);
  }, []);

  useEffect(() => {
    setActiveAreaTab("overview");
    setMountedAreaTabs(new Set(["overview"]));
    setFeaturedGoalId(null);
    setFeaturedGoal(null);
    setFeaturedGoalControls(null);
  }, [area.id]);

  return (
    <div className="flex min-h-[var(--area-detail-overlay-height,100dvh)] w-full flex-col bg-black px-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-2 text-white sm:px-6 sm:pb-10 sm:pt-4 lg:px-8">
      <FocusPomo
        open={Boolean(focusPomoSource)}
        source={focusPomoSource}
        onClose={() => setFocusPomoSource(null)}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-col gap-2 overflow-x-hidden sm:gap-5">
        <section className="relative w-full px-3 py-1.5 text-white sm:px-4 sm:py-2">
          <div className="relative z-40 flex items-center gap-4 sm:gap-5">
            <span
              className="relative flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#09090b] text-3xl text-white shadow-[0_14px_28px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-[72px] sm:w-[72px] sm:text-4xl"
              style={areaEmojiStyle}
              role="img"
              aria-label={`Area: ${area.label}`}
            >
              <span className="relative z-10 drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]">
                {area.emoji}
              </span>
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="min-w-0 truncate text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    {area.label.toUpperCase()}
                  </h1>
                  <div
                    className="hidden"
                    aria-label={`EVO charge stage ${summary.evoLabel}`}
                  >
                    {CHARGE_MILESTONES.map((milestone, index) => {
                      const cellFill = getChargeCellFill(index);
                      const isCompleted = cellFill >= 100;
                      const isActive = cellFill > 0 && cellFill < 100;

                      return (
                        <div
                          key={milestone.label}
                          className="relative min-w-0 overflow-hidden rounded-[3px] border border-white/[0.095] bg-[linear-gradient(180deg,#22252b_0%,#15171c_48%,#08090d_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.58),inset_0_0_8px_rgba(0,0,0,0.45)]"
                          aria-current={isActive ? "step" : undefined}
                        >
                          <span
                            className="pointer-events-none absolute inset-x-[1px] top-[1px] z-[1] h-[38%] rounded-[3px] bg-[linear-gradient(180deg,rgba(255,255,255,0.075)_0%,rgba(255,255,255,0)_100%)]"
                            aria-hidden="true"
                          />
                          <span
                            className="pointer-events-none absolute inset-0 z-[1] rounded-[3px] bg-[radial-gradient(circle_at_50%_115%,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_46%)]"
                            aria-hidden="true"
                          />
                          {isCompleted ? (
                            <span className="absolute inset-0 z-[2] rounded-[3px] border border-zinc-200/[0.11] bg-[linear-gradient(90deg,#4d535c_0%,#646b75_52%,#535a63_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.30),0_0_5px_rgba(161,161,170,0.055)]" />
                          ) : null}
                          {isActive ? (
                            <span
                              className="absolute inset-y-0 left-0 isolate z-[3] block overflow-hidden rounded-[3px] border border-zinc-200/[0.13] bg-[linear-gradient(90deg,#505761_0%,#68707a_54%,#58606a_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.31),0_0_6px_rgba(161,161,170,0.075)] transition-[width] duration-700 ease-out"
                              style={{ width: `${cellFill}%` }}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                    {totalChargeFilledCellUnits > 0 ? (
                      <span
                        className="pointer-events-none absolute inset-y-0 left-0 z-[6] overflow-hidden rounded-[3px] opacity-30"
                        style={{
                          width: `calc(((100% - 1.5rem) * ${
                            totalChargeFilledCellUnits / CHARGE_MILESTONES.length
                          }) + (${totalChargeCompletedGapCount} * 0.375rem))`,
                        }}
                        aria-hidden="true"
                      >
                        <span
                          className="progress-bar-glint-sweep level-progress-bar-glint-sweep"
                          aria-hidden="true"
                        />
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Start focus pomo for ${area.label}`}
                  onClick={openAreaFocusPomo}
                  className="inline-flex size-9 shrink-0 items-center justify-center text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                >
                  <Timer className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <nav
          className="flex w-full min-w-0 items-center gap-5 overflow-x-auto border-b border-white/[0.07] px-1 pt-0.5"
          aria-label="Area detail sections"
        >
          {AREA_DETAIL_TABS.map((tab) => {
            const isActive = activeAreaTab === tab.value;

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => activateAreaTab(tab.value)}
                aria-pressed={isActive}
                className={cn(
                  "relative shrink-0 px-0.5 pb-2 pt-1 text-[10px] font-semibold tracking-[0.12em] transition-colors sm:text-[11px]",
                  isActive
                    ? "text-white"
                    : "text-white/38 hover:text-white/65"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-[2px] rounded-full transition-opacity",
                    isActive ? "bg-white opacity-100" : "opacity-0"
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </nav>

        {mountedAreaTabs.has("dashboard") ? (
          <div
            className="w-full min-w-0"
            hidden={activeAreaTab !== "dashboard"}
          >
            {area.id === "body" ? (
              <section className="min-w-0">
                <BodyAreaDashboard />
              </section>
            ) : null}

            {area.id === "mind" ? (
              <section className="min-w-0">
                <MindAreaDashboard />
              </section>
            ) : null}

            {area.id === "money" ? (
              <section className="min-w-0">
                <MoneyAreaDashboard />
              </section>
            ) : null}

            {!["body", "mind", "money"].includes(area.id) ? (
              <section className="flex min-h-[220px] w-full items-center justify-center px-4 py-12 text-center">
                <div>
                  <p className="text-[13px] font-semibold text-white/72">
                    Dashboard coming soon
                  </p>
                  <p className="mt-1 text-[11px] text-white/38">
                    {area.label} does not have a dashboard configured yet.
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        <div hidden={activeAreaTab !== "overview"}>
          <AreaFeaturedGoal
            goal={featuredGoal}
            areaLabel={area.label}
            areaEmoji={area.emoji}
            {...(featuredGoalControls ?? {})}
          />
        </div>

        {mountedAreaTabs.has("overview") ? (
          <div hidden={activeAreaTab !== "overview"}>
            <AreaMonuments
              areaId={area.id}
              areaLabel={area.label}
            />
          </div>
        ) : null}

        <div
          className={cn(
            "grid w-full grid-cols-1 items-start gap-2 sm:gap-5 lg:gap-6",
            activeAreaTab === "overview"
              ? "xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
              : "xl:grid-cols-1"
          )}
        >
          {mountedAreaTabs.has("overview") ? (
            <section hidden={activeAreaTab !== "overview"}
                        className={cn(
                          "relative w-full min-h-[150px] overflow-visible px-2 py-2 sm:min-h-[260px] sm:px-0 sm:py-0"
                        )}
                      >
                        <header className="relative z-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className={segmentedToggleContainerClassName} aria-label="Area view">
                            {(
                              [
                                { value: "goals", label: "GOAL GRID" },
                                { value: "roadmap", label: "ROADMAP" },
                              ] as const
                            ).map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setAreaView(option.value)}
                                className={cn(
                                  segmentedToggleButtonClassName,
                                  areaView === option.value
                                    ? segmentedToggleActiveClassName
                                    : segmentedToggleInactiveClassName
                                )}
                                aria-pressed={areaView === option.value}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </header>
                        <div className="relative z-10 mt-2 overflow-visible sm:mt-4">
                          <MonumentGoalsList
                            sourceType="area"
                            sourceId={area.id}
                            areaId={area.id}
                            monumentEmoji={area.emoji}
                            monumentView={areaView}
                            goalSection={goalSection}
                            onGoalSectionChange={setGoalSection}
                            featuredGoalId={featuredGoalId}
                            onFeaturedGoalChange={setFeaturedGoalId}
                            onFeaturedGoalResolved={handleFeaturedGoalResolved}
                          />
                        </div>
                      </section>
          ) : null}

          {mountedAreaTabs.has("overview") || mountedAreaTabs.has("skills") ? (
            <div
              className="relative z-[1] flex min-w-0 flex-col gap-2 sm:gap-5 lg:gap-6"
              hidden={
                activeAreaTab !== "overview" &&
                activeAreaTab !== "skills"
              }
            >
                        {mountedAreaTabs.has("overview") ? (
                          <div hidden={activeAreaTab !== "overview"}>
                            <MonumentRelatedHabits
                              sourceType="area"
                              areaId={area.id}
                              sourceLabel={area.label}
                            />
                          </div>
                        ) : null}
            
                        {mountedAreaTabs.has("overview") ? (
                          <section
                            className="relative z-[1] w-full overflow-visible"
                            hidden={activeAreaTab !== "overview"}
                          >
                                        <MonumentNotesGrid
                                          sourceType="area"
                                          areaId={area.id}
                                          initialNotes={[]}
                                        />
                                      </section>
                        ) : null}
            
                        {mountedAreaTabs.has("skills") ? (
                          <div hidden={activeAreaTab !== "skills"}>
                            <AreaSkillRelations
                              areaId={area.id}
                              areaLabel={area.label}
                            />
                          </div>
                        ) : null}
                      </div>
          ) : null}

          {mountedAreaTabs.has("analytics") ? (
            <div
              className="relative z-[1] w-full xl:col-span-2"
              hidden={activeAreaTab !== "analytics"}
            >
                        <ActivityPanel
                          sourceType="area"
                          areaId={area.id}
                          sourceLabel={area.label}
                        />
                      </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
