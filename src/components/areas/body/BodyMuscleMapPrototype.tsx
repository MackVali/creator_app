"use client";

import { useEffect, useMemo, useState } from "react";
import Body, { type ExtendedBodyPart } from "react-muscle-highlighter";

import { getFitnessExerciseHistories } from "@/lib/fitness/exerciseHistory";
import {
  FITNESS_ANATOMY_MUSCLES,
  getFitnessPrimaryExercisesForMuscle,
  resolveFitnessAnatomyMuscleActivations,
  type FitnessAnatomyMuscleId,
} from "@/lib/fitness/anatomyMuscles";
import {
  getFitnessMuscleStrengthStats,
  getFitnessStrengthLevelLabel,
  type FitnessMuscleStrengthStat,
} from "@/lib/fitness/muscleStrength";
import {
  extractFitnessLoggedSetPerformances,
  normalizeFitnessExerciseName,
} from "@/lib/fitness/progressiveOverload";
import { getCurrentUserFitnessWorkoutEntries } from "@/lib/fitness/workoutEntries";

type BodySide = "front" | "back";
type MuscleSide = "left" | "right";

type SelectedMuscle = {
  slug: string;
  side?: MuscleSide;
};

type PreferredUnits = "metric" | "us";

type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

type NutritionProfile = {
  current_weight_kg?: number | null;
  height_cm?: number | null;
  formula_sex?: string | null;
  preferred_units?: PreferredUnits | null;
  age_years?: number | null;
  body_fat_pct?: number | null;
  activity_level?: ActivityLevel | null;
};

type NutritionProfileResponse = {
  profile?: NutritionProfile | null;
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

const KG_TO_LB = 2.2046226218;
const CM_TO_IN = 1 / 2.54;

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  active: "Active",
  very_active: "Very active",
};

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDecimal(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatWeight(valueKg: number | null | undefined, units: PreferredUnits) {
  if (!valueKg || !Number.isFinite(valueKg) || valueKg <= 0) return "—";

  if (units === "metric") return `${formatDecimal(valueKg)} kg`;

  return `${Math.round(valueKg * KG_TO_LB)} lb`;
}

function formatHeight(valueCm: number | null | undefined, units: PreferredUnits) {
  if (!valueCm || !Number.isFinite(valueCm) || valueCm <= 0) return "—";

  if (units === "metric") return `${formatDecimal(valueCm)} cm`;

  const totalInches = valueCm * CM_TO_IN;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);

  if (inches === 12) {
    feet += 1;
    inches = 0;
  }

  return `${feet}'${inches}"`;
}

function calculateBmi(weightKg: number | null | undefined, heightCm: number | null | undefined) {
  if (
    !weightKg ||
    !heightCm ||
    !Number.isFinite(weightKg) ||
    !Number.isFinite(heightCm) ||
    weightKg <= 0 ||
    heightCm <= 0
  ) {
    return null;
  }

  const heightM = heightCm / 100;
  if (heightM <= 0) return null;

  const bmi = weightKg / (heightM * heightM);
  return Number.isFinite(bmi) ? bmi : null;
}

function formatPercent(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) return "—";
  return `${formatDecimal(value)}%`;
}

function formatEstimatedMax(valueKg: number, units: PreferredUnits) {
  if (units === "metric") return `${Math.round(valueKg)} kg est. 1RM`;

  const pounds = valueKg * 2.2046226218;
  return `${Math.round(pounds)} lb est. 1RM`;
}

function formatLastTrained(value: string | null | undefined) {
  if (!value) return "No recent log";

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Logged";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(timestamp);
}

function formatCatalogExerciseName(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getExerciseIdentityKeys(exercise: {
  exerciseId: string;
  exerciseName: string;
}) {
  return [
    normalizeFitnessExerciseName(exercise.exerciseId),
    normalizeFitnessExerciseName(exercise.exerciseName),
  ].filter(Boolean);
}

function doExercisesMatch(
  first: { exerciseId: string; exerciseName: string },
  second: { exerciseId: string; exerciseName: string },
) {
  const firstKeys = new Set(getExerciseIdentityKeys(first));
  return getExerciseIdentityKeys(second).some((key) => firstKeys.has(key));
}

function getLoggedExerciseDisclosureKey(exercise: {
  exerciseId: string;
  exerciseName: string;
}) {
  const [identityKey] = getExerciseIdentityKeys(exercise);
  const fallbackKey = normalizeFitnessExerciseName(
    `${exercise.exerciseId} ${exercise.exerciseName}`,
  );

  return (
    identityKey ||
    fallbackKey ||
    encodeURIComponent(`${exercise.exerciseId}:${exercise.exerciseName}`)
  );
}

export function BodyMuscleMapPrototype() {
  const [view, setView] = useState<BodySide>("front");
  const [selected, setSelected] = useState<SelectedMuscle | null>(null);
  const [entries, setEntries] = useState<
    Awaited<ReturnType<typeof getCurrentUserFitnessWorkoutEntries>>
  >([]);
  const [nutritionProfile, setNutritionProfile] =
    useState<NutritionProfile | null>(null);
  const [bodyweightKg, setBodyweightKg] = useState<number | null>(null);
  const [sex, setSex] = useState<"male" | "female">("male");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showUnusedPrimaryExercises, setShowUnusedPrimaryExercises] =
    useState(false);
  const [expandedExerciseKey, setExpandedExerciseKey] = useState<string | null>(
    null,
  );

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
          const profile = payload.profile ?? null;

          setNutritionProfile(profile);

          const weight = finiteNumber(profile?.current_weight_kg);
          setBodyweightKg(
            typeof weight === "number" && Number.isFinite(weight) ? weight : null,
          );

          setSex(profile?.formula_sex === "female" ? "female" : "male");
        } else {
          setNutritionProfile(null);
          setBodyweightKg(null);
          setSex("male");
        }
      } catch (error) {
        if (cancelled) return;

        console.error("Failed to load Body strength data", { error });
        setEntries([]);
        setNutritionProfile(null);
        setBodyweightKg(null);
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

  useEffect(() => {
    setShowUnusedPrimaryExercises(false);
    setExpandedExerciseKey(null);
  }, [selectedMuscleId]);

  const selectedPrimaryExercises = useMemo(
    () =>
      selectedMuscleId
        ? getFitnessPrimaryExercisesForMuscle(selectedMuscleId)
        : [],
    [selectedMuscleId],
  );

  const selectedHistories = useMemo(() => {
    if (!selectedMuscleId) return [];

    const selectedPrimaryExerciseKeys = new Set(
      selectedPrimaryExercises.map(
        (exercise) => exercise.normalizedExerciseName,
      ),
    );
    const getPrimaryExerciseKey = (history: {
      exerciseId: string;
      exerciseName: string;
    }) =>
      getExerciseIdentityKeys(history).find((key) =>
        selectedPrimaryExerciseKeys.has(key),
      ) ?? getExerciseIdentityKeys(history)[0];

    const histories = exerciseHistories
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

    const uniqueHistories = new Map<string, (typeof histories)[number]>();

    histories.forEach((history) => {
      const key =
        getPrimaryExerciseKey(history) ??
        `${history.exerciseId}:${history.exerciseName}`;
      if (!uniqueHistories.has(key)) uniqueHistories.set(key, history);
    });

    return Array.from(uniqueHistories.values());
  }, [exerciseHistories, selectedMuscleId, selectedPrimaryExercises]);

  const selectedPerformedExerciseKeys = useMemo(() => {
    const selectedPrimaryExerciseKeys = new Set(
      selectedPrimaryExercises.map(
        (exercise) => exercise.normalizedExerciseName,
      ),
    );

    return new Set(
      selectedHistories.flatMap((history) =>
        getExerciseIdentityKeys(history).filter((key) =>
          selectedPrimaryExerciseKeys.has(key),
        ),
      ),
    );
  }, [selectedHistories, selectedPrimaryExercises]);

  const selectedUnusedPrimaryExercises = useMemo(
    () =>
      selectedPrimaryExercises.filter(
        (exercise) =>
          !selectedPerformedExerciseKeys.has(exercise.normalizedExerciseName),
      ),
    [selectedPerformedExerciseKeys, selectedPrimaryExercises],
  );

  const preferredUnits: PreferredUnits =
    nutritionProfile?.preferred_units === "metric" ? "metric" : "us";

  const profileMetrics = useMemo(() => {
    const weightKg = finiteNumber(nutritionProfile?.current_weight_kg);
    const heightCm = finiteNumber(nutritionProfile?.height_cm);
    const bmi = calculateBmi(weightKg, heightCm);
    const bodyFatPct = finiteNumber(nutritionProfile?.body_fat_pct);
    const ageYears = finiteNumber(nutritionProfile?.age_years);
    const activityLevel = nutritionProfile?.activity_level;

    return [
      {
        label: "Weight",
        value: formatWeight(weightKg, preferredUnits),
      },
      {
        label: "Height",
        value: formatHeight(heightCm, preferredUnits),
      },
      {
        label: "BMI",
        value: bmi ? formatDecimal(bmi) : "—",
      },
      ...(bodyFatPct
        ? [
            {
              label: "Body fat",
              value: formatPercent(bodyFatPct),
            },
          ]
        : []),
      ...(ageYears
        ? [
            {
              label: "Age",
              value: `${Math.round(ageYears)}`,
            },
          ]
        : []),
      ...(activityLevel
        ? [
            {
              label: "Activity",
              value: ACTIVITY_LABELS[activityLevel],
            },
          ]
        : []),
    ];
  }, [nutritionProfile, preferredUnits]);

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
      <div className="grid min-h-[390px] grid-cols-[minmax(172px,58fr)_minmax(0,42fr)] max-[360px]:grid-cols-[minmax(166px,58fr)_minmax(0,42fr)] sm:min-h-[430px] sm:grid-cols-[minmax(210px,54fr)_minmax(0,46fr)]">
        <div className="relative flex min-h-[390px] items-center justify-center overflow-hidden border-r border-white/[0.055] px-1 py-4 sm:min-h-[430px] sm:px-3">
          <div className="origin-center scale-[0.86] min-[375px]:scale-[0.94] sm:scale-100">
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

                setSelected((current) =>
                  current?.slug === part.slug && current.side === side
                    ? null
                    : {
                        slug: part.slug,
                        side,
                      },
                );
              }}
            />
          </div>

          <div className="absolute left-2 top-2 z-10 flex rounded-lg border border-white/[0.075] bg-black/60 p-0.5 backdrop-blur">
            {(["front", "back"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Show ${option} body view`}
                aria-pressed={view === option}
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
        </div>

        <div className="min-w-0 px-3 py-4 max-[360px]:px-2.5 sm:px-4 sm:py-5">
          {selected ? (
            selectedStat ? (
              <div className="flex h-full min-w-0 flex-col">
                <div className="border-b border-white/[0.06] pb-3">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28">
                    Muscle focus
                  </p>
                  <h3 className="mt-1.5 text-[15px] font-semibold leading-tight text-white sm:text-lg">
                    {selectedStat.label}
                  </h3>

                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              STRENGTH_COLORS[selectedStat.strengthLevel],
                          }}
                        />
                        <p className="truncate text-[10px] font-medium text-white/52">
                          {getFitnessStrengthLevelLabel(
                            selectedStat.strengthLevel,
                          )}
                        </p>
                      </div>
                      <p className="mt-1 text-[9px] leading-snug text-white/28">
                        {bodyweightKg
                          ? `${formatWeight(bodyweightKg, preferredUnits)} bodyweight`
                          : "Add bodyweight in Nutrition"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-mono text-[18px] leading-none text-white sm:text-2xl">
                        {selectedStat.strengthScore}
                      </p>
                      <p className="mt-0.5 font-mono text-[9px] text-white/30">
                        /100
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pt-2">
                  {selectedHistories.length > 0 ? (
                    selectedHistories.map((history) => {
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
                          doExercisesMatch(exercise, history),
                      );

                      const bestRecord =
                        history.records.find(
                          (record) => record.type === "heaviest_weight",
                        ) ?? history.records[0] ?? null;
                      const disclosureKey = `performed:${getLoggedExerciseDisclosureKey(
                        history,
                      )}`;
                      const isExpanded = expandedExerciseKey === disclosureKey;
                      const panelId = `body-muscle-exercise-${disclosureKey}`;

                      return (
                        <div
                          key={`${history.exerciseId}:${history.exerciseName}`}
                          className="border-b border-white/[0.045]"
                        >
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={panelId}
                            onClick={() =>
                              setExpandedExerciseKey((value) =>
                                value === disclosureKey ? null : disclosureKey,
                              )
                            }
                            className="relative w-full py-2 pr-3 text-left transition hover:bg-white/[0.018] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                          >
                            <span className="block min-w-0">
                              <span className="block break-words text-[11px] font-semibold leading-tight text-white/76">
                                {history.exerciseName}
                              </span>
                              <span className="mt-0.5 block text-right font-mono text-[10px] leading-none text-white/46">
                                {bestRecord?.valueLabel ?? "No PR"}
                              </span>
                            </span>
                            <span
                              aria-hidden="true"
                              className={`absolute right-0 top-2.5 text-[10px] leading-none text-white/20 transition ${
                                isExpanded ? "rotate-90 text-white/34" : ""
                              }`}
                            >
                              ›
                            </span>
                          </button>

                          {isExpanded ? (
                            <div
                              id={panelId}
                              className="bg-white/[0.018] px-2 pb-2.5 pt-1"
                            >
                              <p className="break-words text-[11px] font-semibold leading-snug text-white/82">
                                {history.exerciseName}
                              </p>
                              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_max-content] gap-x-3 gap-y-1.5">
                                <p className="text-[9px] uppercase tracking-wide text-white/24">
                                  Relationship
                                </p>
                                <p className="text-right text-[10px] font-medium text-white/58">
                                  {activation?.role === "primary"
                                    ? "Primary"
                                    : "Related"}
                                </p>
                                <p className="text-[9px] uppercase tracking-wide text-white/24">
                                  Last trained
                                </p>
                                <p className="text-right text-[10px] font-medium text-white/58">
                                  {formatLastTrained(history.lastTrainedAt)}
                                </p>
                                <p className="text-[9px] uppercase tracking-wide text-white/24">
                                  Best PR
                                </p>
                                <p className="text-right font-mono text-[10px] text-white/68">
                                  {bestRecord?.valueLabel ?? "No PR"}
                                </p>
                                {strengthExercise ? (
                                  <>
                                    <p className="text-[9px] uppercase tracking-wide text-white/24">
                                      Est. 1RM
                                    </p>
                                    <p className="text-right font-mono text-[10px] text-white/58">
                                      {formatEstimatedMax(
                                        strengthExercise.estimatedOneRepMaxKg,
                                        preferredUnits,
                                      )}
                                    </p>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className="pt-3 text-[10px] leading-snug text-white/32">
                      No logged exercises for this muscle yet.
                    </p>
                  )}

                  {selectedUnusedPrimaryExercises.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setShowUnusedPrimaryExercises((value) => !value)
                        }
                        className="mt-2 text-[10px] font-semibold text-white/36 transition hover:text-white/62"
                      >
                        {showUnusedPrimaryExercises ? "Show less" : "See more"}
                      </button>

                      {showUnusedPrimaryExercises
                        ? selectedUnusedPrimaryExercises.map((exercise) => {
                            const exerciseName = formatCatalogExerciseName(
                              exercise.exerciseName,
                            );
                            const disclosureKey = `unused:${exercise.normalizedExerciseName}`;
                            const isExpanded =
                              expandedExerciseKey === disclosureKey;
                            const panelId = `body-muscle-exercise-${disclosureKey}`;

                            return (
                              <div
                                key={exercise.normalizedExerciseName}
                                className="border-b border-white/[0.035] last:border-b-0"
                              >
                                <button
                                  type="button"
                                  aria-expanded={isExpanded}
                                  aria-controls={panelId}
                                  onClick={() =>
                                    setExpandedExerciseKey((value) =>
                                      value === disclosureKey
                                        ? null
                                        : disclosureKey,
                                    )
                                  }
                                  className="relative w-full py-2 pr-3 text-left transition hover:bg-white/[0.014] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/24"
                                >
                                  <span className="block min-w-0">
                                    <span className="block break-words text-[11px] font-semibold leading-tight text-white/42">
                                      {exerciseName}
                                    </span>
                                    <span className="mt-0.5 block text-right font-mono text-[10px] leading-none text-white/30">
                                      0 lb
                                    </span>
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className={`absolute right-0 top-2.5 text-[10px] leading-none text-white/16 transition ${
                                      isExpanded
                                        ? "rotate-90 text-white/28"
                                        : ""
                                    }`}
                                  >
                                    ›
                                  </span>
                                </button>

                                {isExpanded ? (
                                  <div
                                    id={panelId}
                                    className="bg-white/[0.012] px-2 pb-2.5 pt-1"
                                  >
                                    <p className="break-words text-[11px] font-semibold leading-snug text-white/58">
                                      {exerciseName}
                                    </p>
                                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_max-content] gap-x-3 gap-y-1.5">
                                      <p className="text-[9px] uppercase tracking-wide text-white/20">
                                        Relationship
                                      </p>
                                      <p className="text-right text-[10px] font-medium text-white/42">
                                        Primary
                                      </p>
                                      <p className="text-[9px] uppercase tracking-wide text-white/20">
                                        Last trained
                                      </p>
                                      <p className="text-right text-[10px] font-medium text-white/42">
                                        Not logged
                                      </p>
                                      <p className="text-[9px] uppercase tracking-wide text-white/20">
                                        Best PR
                                      </p>
                                      <p className="text-right text-[10px] font-medium text-white/42">
                                        No history / no PR
                                      </p>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        : null}
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28">
                  Muscle focus
                </p>
                <h3 className="mt-1.5 text-[15px] font-semibold capitalize leading-tight text-white/80">
                  {selected.slug.replaceAll("-", " ")}
                </h3>
                <p className="mt-3 text-[10px] leading-snug text-white/32">
                  No strength mapping for this area yet.
                </p>
              </div>
            )
          ) : loadError ? (
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-red-200/42">
                Body profile
              </p>
              <p className="mt-3 text-[11px] font-medium leading-snug text-red-300/60">
                {loadError}
              </p>
            </div>
          ) : isLoading ? (
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28">
                Body profile
              </p>
              <p className="mt-3 text-[11px] font-medium leading-snug text-white/34">
                Loading strength profile…
              </p>
            </div>
          ) : (
            <div className="flex h-full min-w-0 flex-col">
              <div className="border-b border-white/[0.06] pb-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28">
                  Body profile
                </p>
                <h3 className="mt-1.5 text-[15px] font-semibold leading-tight text-white sm:text-lg">
                  Current frame
                </h3>
                <p className="mt-2 text-[10px] leading-snug text-white/32">
                  Tap the anatomy to shift this panel into muscle context.
                </p>
              </div>

              <div className="pt-2">
                {profileMetrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="flex items-baseline justify-between gap-2 border-b border-white/[0.045] py-2 last:border-b-0"
                  >
                    <p className="min-w-0 truncate text-[10px] font-medium text-white/34">
                      {metric.label}
                    </p>
                    <p className="shrink-0 whitespace-nowrap text-right font-mono text-[11px] text-white/78 sm:text-xs">
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
