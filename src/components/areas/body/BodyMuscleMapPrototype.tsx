"use client";

import { useEffect, useMemo, useState } from "react";
import Body, { type ExtendedBodyPart } from "react-muscle-highlighter";

import { getFitnessExerciseHistories } from "@/lib/fitness/exerciseHistory";
import {
  FITNESS_ANATOMY_MUSCLES,
  resolveFitnessAnatomyMuscleActivations,
  type FitnessAnatomyMuscleId,
} from "@/lib/fitness/anatomyMuscles";
import {
  getFitnessMuscleStrengthStats,
  getFitnessStrengthLevelLabel,
  type FitnessMuscleStrengthStat,
} from "@/lib/fitness/muscleStrength";
import { extractFitnessLoggedSetPerformances } from "@/lib/fitness/progressiveOverload";
import { getCurrentUserFitnessWorkoutEntries } from "@/lib/fitness/workoutEntries";

type BodySide = "front" | "back";
type MuscleSide = "left" | "right";

type SelectedMuscle = {
  slug: string;
  side?: MuscleSide;
};

type NutritionProfileResponse = {
  profile?: {
    current_weight_kg?: number | null;
    height_cm?: number | null;
    formula_sex?: string | null;
  } | null;
};

const FITNESS_ANATOMY_MUSCLE_IDS = new Set<FitnessAnatomyMuscleId>(
  FITNESS_ANATOMY_MUSCLES.map((muscle) => muscle.id),
);

const STRENGTH_COLORS = {
  untrained: "#292249",
  beginner: "#39306c",
  novice: "#4c3f91",
  intermediate: "#6550bd",
  advanced: "#8062e8",
  elite: "#a78bfa",
} as const;

function formatEstimatedMax(valueKg: number) {
  const pounds = valueKg * 2.2046226218;
  return `${Math.round(pounds)} lb est. 1RM`;
}

export function BodyMuscleMapPrototype() {
  const [view, setView] = useState<BodySide>("front");
  const [selected, setSelected] = useState<SelectedMuscle | null>(null);
  const [entries, setEntries] = useState<
    Awaited<ReturnType<typeof getCurrentUserFitnessWorkoutEntries>>
  >([]);
  const [bodyweightKg, setBodyweightKg] = useState<number | null>(null);
  const [sex, setSex] = useState<"male" | "female">("male");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadError(null);

        const [fitnessEntries, profileResponse] = await Promise.all([
          getCurrentUserFitnessWorkoutEntries(),
          fetch("/api/nutrition/profile", {
            method: "GET",
            cache: "no-store",
          }),
        ]);

        if (cancelled) return;

        setEntries(fitnessEntries);

        if (profileResponse.ok) {
          const payload = (await profileResponse.json()) as NutritionProfileResponse;

          const weight = payload.profile?.current_weight_kg;
          setBodyweightKg(
            typeof weight === "number" && Number.isFinite(weight) ? weight : null,
          );

          setSex(payload.profile?.formula_sex === "female" ? "female" : "male");
        } else {
          setBodyweightKg(null);
          setSex("male");
        }
      } catch (error) {
        if (cancelled) return;

        console.error("Failed to load Body strength data", { error });
        setEntries([]);
        setLoadError("Unable to load strength data.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();

    const refresh = () => {
      void load();
    };

    window.addEventListener("creator:pinned-body-databases-changed", refresh);
    window.addEventListener("creator:skill-notes-changed", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("creator:pinned-body-databases-changed", refresh);
      window.removeEventListener("creator:skill-notes-changed", refresh);
    };
  }, []);

  const performances = useMemo(
    () => extractFitnessLoggedSetPerformances(entries),
    [entries],
  );

  const exerciseHistories = useMemo(
    () => getFitnessExerciseHistories(entries),
    [entries],
  );

  const strengthStats = useMemo(
    () =>
      getFitnessMuscleStrengthStats({
        performances,
        bodyweightKg,
        sex,
      }),
    [bodyweightKg, performances, sex],
  );

  const strengthById = useMemo(
    () => new Map(strengthStats.map((stat) => [stat.id, stat])),
    [strengthStats],
  );

  const selectedMuscleId =
    selected && FITNESS_ANATOMY_MUSCLE_IDS.has(selected.slug as FitnessAnatomyMuscleId)
      ? (selected.slug as FitnessAnatomyMuscleId)
      : null;

  const selectedStat: FitnessMuscleStrengthStat | null = selectedMuscleId
    ? strengthById.get(selectedMuscleId) ?? null
    : null;

  const selectedHistories = useMemo(() => {
    if (!selectedMuscleId) return [];

    return exerciseHistories
      .filter((history) =>
        resolveFitnessAnatomyMuscleActivations(
          history.exerciseId,
          history.exerciseName,
        ).some(
          (activation) =>
            activation.muscleId === selectedMuscleId &&
            activation.role === "primary",
        ),
      )
      .sort((a, b) => {
        const aTime = a.lastTrainedAt ? Date.parse(a.lastTrainedAt) : 0;
        const bTime = b.lastTrainedAt ? Date.parse(b.lastTrainedAt) : 0;
        return bTime - aTime;
      });
  }, [exerciseHistories, selectedMuscleId]);

  const data = useMemo<readonly ExtendedBodyPart[]>(() => {
    const parts: ExtendedBodyPart[] = [];

    for (const stat of strengthStats) {
      const isSelected = selected?.slug === stat.id;
      const fill = isSelected
        ? "#ffffff"
        : STRENGTH_COLORS[stat.strengthLevel];

      parts.push({
        slug: stat.id as ExtendedBodyPart["slug"],
        color: fill,
        styles: {
          fill,
          stroke: isSelected ? "#ffffff" : "#18181b",
          strokeWidth: isSelected ? 1.5 : 0.45,
        },
      });
    }

    if (
      selected &&
      !parts.some((part) => part.slug === selected.slug)
    ) {
      parts.push({
        slug: selected.slug as ExtendedBodyPart["slug"],
        ...(selected.side ? { side: selected.side } : {}),
        color: "#ffffff",
        styles: {
          fill: "#ffffff",
          stroke: "#ffffff",
          strokeWidth: 1.5,
        },
      });
    }

    return parts;
  }, [selected, strengthStats]);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
      aria-label="Muscle strength map"
    >
      <div className="flex min-h-[390px] items-center justify-center overflow-hidden px-2 py-3">
        <Body
          data={data}
          side={view}
          gender={sex}
          scale={1}
          border="#3f3f46"
          defaultFill="#201d2c"
          defaultStroke="#18181b"
          defaultStrokeWidth={0.35}
          colors={Object.values(STRENGTH_COLORS)}
          onBodyPartPress={(part, side) => {
            if (!part.slug) return;

            setSelected({
              slug: part.slug,
              side,
            });
          }}
        />
      </div>

      <div className="border-t border-white/[0.055] px-3 py-3 pr-28">
        {selected ? (
          selectedStat ? (
            <div className="space-y-2.5">
              <div>
                <div className="flex items-baseline gap-2">
                  <p className="text-xs font-semibold uppercase text-white">
                    {selectedStat.label}
                  </p>
                  <span className="font-mono text-[10px] text-white/45">
                    {selectedStat.strengthScore}/100
                  </span>
                </div>

                <p className="mt-0.5 text-[11px] font-medium text-white/48">
                  {getFitnessStrengthLevelLabel(selectedStat.strengthLevel)}
                  {bodyweightKg
                    ? ` · ${Math.round(bodyweightKg * 2.2046226218)} lb bodyweight`
                    : " · add bodyweight in Nutrition to calculate strength"}
                </p>
              </div>

              {selectedHistories.length > 0 ? (
                <div className="space-y-1.5">
                  {selectedHistories.slice(0, 4).map((history) => {
                    const activation =
                      resolveFitnessAnatomyMuscleActivations(
                        history.exerciseId,
                        history.exerciseName,
                      ).find(
                        (item) =>
                          item.muscleId === selectedMuscleId &&
                          item.role === "primary",
                      );

                    const strengthExercise = selectedStat.exercises.find(
                      (exercise) =>
                        exercise.exerciseId === history.exerciseId ||
                        exercise.exerciseName === history.exerciseName,
                    );

                    const bestRecord =
                      history.records.find(
                        (record) => record.type === "heaviest_weight",
                      ) ?? history.records[0] ?? null;

                    return (
                      <div
                        key={`${history.exerciseId}:${history.exerciseName}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.025] px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-white/76">
                            {history.exerciseName}
                          </p>
                          <p className="mt-0.5 text-[9px] uppercase tracking-wide text-white/30">
                            {activation?.role ?? "related"}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="font-mono text-[10px] text-white/70">
                            {bestRecord?.valueLabel ?? "No PR"}
                          </p>
                          {strengthExercise ? (
                            <p className="mt-0.5 font-mono text-[9px] text-white/30">
                              {formatEstimatedMax(
                                strengthExercise.estimatedOneRepMaxKg,
                              )}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-white/32">
                  No logged exercises for this muscle yet.
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase text-white/78">
                {selected.slug.replaceAll("-", " ")}
              </p>
              <p className="mt-0.5 text-[10px] text-white/32">
                No strength mapping for this area yet.
              </p>
            </div>
          )
        ) : loadError ? (
          <p className="text-[11px] font-medium text-red-300/60">
            {loadError}
          </p>
        ) : isLoading ? (
          <p className="text-[11px] font-medium text-white/34">
            Loading strength profile…
          </p>
        ) : (
          <p className="text-[11px] font-medium text-white/34">
            Tap a muscle to view strength, exercises, and PRs.
          </p>
        )}
      </div>

      <div className="absolute bottom-2.5 right-3 z-10 flex rounded-lg border border-white/[0.075] bg-black/60 p-0.5 backdrop-blur">
        {(["front", "back"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
              view === option
                ? "bg-white/[0.11] text-white"
                : "text-white/38 hover:text-white/68"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  );
}
