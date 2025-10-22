"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  HabitFormFields,
  HABIT_RECURRENCE_OPTIONS,
  HABIT_TYPE_OPTIONS,
  HABIT_ENERGY_OPTIONS,
  type HabitSkillSelectOption,
  type HabitEnergySelectOption,
  type HabitGoalSelectOption,
} from "@/components/habits/habit-form-fields";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocationMetadataMode, isLocationMetadataError, normalizeLocationValue } from "@/lib/location-metadata";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { SkillRow } from "@/lib/types/skill";

async function resolveLocationContextId(
  supabase: ReturnType<typeof getSupabaseBrowser>,
  userId: string,
  value: string | null,
) {
  if (!supabase) return null;
  const normalized = value ? value.trim().toUpperCase() : "";
  if (!normalized || normalized === "ANY") return null;

  const { data, error } = await supabase
    .from("location_contexts")
    .select("id")
    .eq("user_id", userId)
    .eq("value", normalized)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return data?.id ?? null;
}

interface RoutineOption {
  id: string;
  name: string;
  description: string | null;
}

type RoutineSelectValue = string;
type RoutineSelectOption = {
  value: string;
  label: string;
  description?: string | null;
  disabled?: boolean;
};

interface GoalOption {
  id: string;
  name: string;
  description?: string | null;
}

export default function NewHabitPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [habitType, setHabitType] = useState(HABIT_TYPE_OPTIONS[0].value);
  const [recurrence, setRecurrence] = useState(
    HABIT_RECURRENCE_OPTIONS[0].value
  );
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [duration, setDuration] = useState("15");
  const [energy, setEnergy] = useState(HABIT_ENERGY_OPTIONS[0]?.value ?? "NO");
  const [skillId, setSkillId] = useState("none");
  const [locationContext, setLocationContext] = useState<string | null>(null);
  const [daylightPreference, setDaylightPreference] = useState("ALL_DAY");
  const [windowEdgePreference, setWindowEdgePreference] = useState("FRONT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routineOptions, setRoutineOptions] = useState<RoutineOption[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(true);
  const [routineLoadError, setRoutineLoadError] = useState<string | null>(null);
  const [routineId, setRoutineId] = useState<RoutineSelectValue>("none");
  const [newRoutineName, setNewRoutineName] = useState("");
  const [newRoutineDescription, setNewRoutineDescription] = useState("");
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillLoadError, setSkillLoadError] = useState<string | null>(null);
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalLoadError, setGoalLoadError] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string>("none");
  const [completionTarget, setCompletionTarget] = useState("10");
  const [locationMetadataMode, setLocationMetadataMode] =
    useState<LocationMetadataMode>("id");

  const energySelectOptions = useMemo<HabitEnergySelectOption[]>(
    () => HABIT_ENERGY_OPTIONS,
    []
  );

  useEffect(() => {
    let active = true;

    setSkillsLoading(true);
    setSkillLoadError(null);

    const fetchSkills = async () => {
      if (!supabase) {
        if (active) {
          setSkillsLoading(false);
          setSkillLoadError("Supabase client not available.");
        }
        return;
      }

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          if (active) {
            setSkills([]);
            setSkillId("none");
            setSkillLoadError(null);
          }
          return;
        }

        const { data, error: skillsError } = await supabase
          .from("skills")
          .select("id, name, icon")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (skillsError) throw skillsError;

        if (active) {
          const safeSkills = (data ?? []) as SkillRow[];
          setSkills(safeSkills);
          setSkillLoadError(null);
          setSkillId((current) => {
            if (current === "none") return current;
            return safeSkills.some((skill) => skill.id === current)
              ? current
              : "none";
          });
        }
      } catch (err) {
        console.error("Failed to load skills:", err);
        if (active) {
          setSkills([]);
          setSkillLoadError("Unable to load your skills right now.");
          setSkillId("none");
        }
      } finally {
        if (active) {
          setSkillsLoading(false);
        }
      }
    };

    fetchSkills();

    return () => {
      active = false;
    };
  }, [supabase]);

  const skillSelectOptions = useMemo<HabitSkillSelectOption[]>(() => {
    if (skillsLoading) {
      return [
        {
          value: "none",
          label: "Loading skills…",
          disabled: true,
        },
      ];
    }

    if (skills.length === 0) {
      return [
        {
          value: "none",
          label: "No skill focus",
        },
      ];
    }

    return [
      {
        value: "none",
        label: "No skill focus",
      },
      ...skills
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((skill) => ({
          value: skill.id,
          label: skill.name,
          icon: skill.icon,
        })),
    ];
  }, [skills, skillsLoading]);

  useEffect(() => {
    let active = true;

    const fetchGoals = async () => {
      if (!supabase) {
        if (active) {
          setGoalsLoading(false);
          setGoalLoadError("Supabase client not available.");
        }
        return;
      }

      setGoalsLoading(true);
      setGoalLoadError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          if (active) {
            setGoalOptions([]);
            setGoalId("none");
          }
          return;
        }

        const { data, error: goalsError } = await supabase
          .from("goals")
          .select("id, name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (goalsError) throw goalsError;

        if (active) {
          const safeGoals = (data ?? []).map((goal) => {
            const goalRecord = goal as { id?: unknown; name?: unknown };
            const goalIdValue =
              typeof goalRecord.id === "string" ? goalRecord.id : null;
            const goalNameValue =
              typeof goalRecord.name === "string" && goalRecord.name.trim().length > 0
                ? goalRecord.name.trim()
                : null;
            return {
              id: goalIdValue ?? "",
              name: goalNameValue ?? "Untitled goal",
            } satisfies GoalOption;
          });

          const normalizedGoals = safeGoals.filter((goal) => goal.id);

          setGoalOptions(normalizedGoals);
          setGoalLoadError(null);
          setGoalId((current) => {
            if (current === "none") return current;
            return normalizedGoals.some((goal) => goal.id === current)
              ? current
              : "none";
          });
        }
      } catch (err) {
        console.error("Failed to load goals:", err);
        if (active) {
          setGoalOptions([]);
          setGoalLoadError("Unable to load your goals right now.");
          setGoalId("none");
        }
      } finally {
        if (active) {
          setGoalsLoading(false);
        }
      }
    };

    fetchGoals();

    return () => {
      active = false;
    };
  }, [supabase]);

  const goalSelectOptions = useMemo<HabitGoalSelectOption[]>(() => {
    if (goalsLoading) {
      return [
        {
          value: "none",
          label: "Loading goals…",
          disabled: true,
        },
      ];
    }

    if (goalOptions.length === 0) {
      return [
        {
          value: "none",
          label: "Create a goal to link this temp habit",
          disabled: true,
        },
      ];
    }

    return [
      {
        value: "none",
        label: "Select a goal",
      },
      ...goalOptions.map((goal) => ({
        value: goal.id,
        label: goal.name,
        description: goal.description ?? null,
      })),
    ];
  }, [goalOptions, goalsLoading]);

  useEffect(() => {
    let active = true;

    const fetchRoutines = async () => {
      if (!supabase) {
        if (active) {
          setRoutinesLoading(false);
          setRoutineLoadError("Supabase client not available.");
        }
        return;
      }

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          if (active) {
            setRoutineOptions([]);
            setRoutineId("none");
            setRoutineLoadError(null);
          }
          return;
        }

        const { data, error: routinesError } = await supabase
          .from("habit_routines")
          .select("id, name, description")
          .eq("user_id", user.id)
          .order("name", { ascending: true });

        if (routinesError) throw routinesError;

        if (active) {
          const safeRoutines = data ?? [];
          setRoutineOptions(safeRoutines);
          setRoutineLoadError(null);
          setRoutineId((current) => {
            if (current === "none" || current === "__create__") {
              return current;
            }

            return safeRoutines.some((option) => option.id === current)
              ? current
              : "none";
          });
        }
      } catch (err) {
        console.error("Failed to load routines:", err);
        if (active) {
          setRoutineOptions([]);
          setRoutineLoadError("Unable to load your routines right now.");
        }
      } finally {
        if (active) {
          setRoutinesLoading(false);
        }
      }
    };

    fetchRoutines();

    return () => {
      active = false;
    };
  }, [supabase]);

  const routineSelectOptions = useMemo<RoutineSelectOption[]>(() => {
    if (routinesLoading) {
      return [
        {
          value: "none",
          label: "Loading routines…",
          disabled: true,
        },
      ];
    }

    const baseOptions = routineOptions.map((routine) => ({
      value: routine.id,
      label: routine.name,
      description: routine.description,
    }));

    return [
      {
        value: "none",
        label: "No routine",
      },
      ...baseOptions,
      {
        value: "__create__",
        label: "Create a new routine",
      },
    ];
  }, [routineOptions, routinesLoading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase client not available.");
      return;
    }

    if (!name.trim()) {
      setError("Please provide a name for your habit.");
      return;
    }

    const durationMinutes = Number(duration);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setError("Please enter how many minutes the habit should take.");
      return;
    }

    if (recurrence.toLowerCase().trim() === "every x days" && recurrenceDays.length === 0) {
      setError("Please select at least one day for this recurrence.");
      return;
    }

    if (habitType.toUpperCase() === "MEMO" && skillId === "none") {
      setError("Memo habits need to be linked to a skill so memos have a home.");
      return;
    }

    if (routineId === "__create__" && !newRoutineName.trim()) {
      setError("Please give your new routine a name.");
      return;
    }

    const normalizedHabitType = habitType.toUpperCase();
    const isTempHabit = normalizedHabitType === "TEMP";

    let parsedCompletionTarget: number | null = null;
    if (isTempHabit) {
      if (goalId === "none") {
        setError("Temp habits need to be connected to a goal.");
        return;
      }

      const completionValue = Number(completionTarget);
      if (
        !Number.isFinite(completionValue) ||
        completionValue <= 0 ||
        !Number.isInteger(completionValue)
      ) {
        setError(
          "Set how many completions you need using a whole number greater than zero."
        );
        return;
      }

      parsedCompletionTarget = completionValue;
    }

    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        setError("You need to be signed in to create a habit.");
        return;
      }

      const trimmedDescription = description.trim();
      const normalizedRecurrence = recurrence.toLowerCase().trim();
      const recurrenceValue = normalizedRecurrence === "none" ? null : recurrence;
      const recurrenceDaysValue =
        normalizedRecurrence === "every x days" && recurrenceDays.length > 0
          ? recurrenceDays
          : null;
      const goalIdValue = goalId === "none" ? null : goalId;
      let routineIdToUse: string | null = null;

      if (routineId === "__create__") {
        const routineName = newRoutineName.trim();
        const routineDescription = newRoutineDescription.trim();

        const { data: routineData, error: routineInsertError } = await supabase
          .from("habit_routines")
          .insert({
            user_id: user.id,
            name: routineName,
            description: routineDescription ? routineDescription : null,
          })
          .select("id")
          .single();

        if (routineInsertError) {
          throw routineInsertError;
        }

        if (!routineData?.id) {
          throw new Error("Routine creation did not return an id.");
        }

        routineIdToUse = routineData.id;
      } else if (routineId !== "none") {
        routineIdToUse = routineId;
      }

      const normalizedLocationValue = normalizeLocationValue(locationContext);
      let locationModeForInsert = locationMetadataMode;
      let locationContextId: string | null = null;

      if (locationModeForInsert === "id" && normalizedLocationValue) {
        try {
          locationContextId = await resolveLocationContextId(
            supabase,
            user.id,
            normalizedLocationValue,
          );
        } catch (maybeError) {
          if (isLocationMetadataError(maybeError)) {
            locationModeForInsert = "legacy";
            setLocationMetadataMode("legacy");
          } else {
            throw maybeError;
          }
        }
      }

      const insertPayload: Record<string, unknown> = {
        user_id: user.id,
        name: name.trim(),
        description: trimmedDescription || null,
        habit_type: habitType,
        recurrence: recurrenceValue,
        recurrence_days: recurrenceDaysValue,
        duration_minutes: durationMinutes,
        energy,
        skill_id: skillId === "none" ? null : skillId,
        routine_id: routineIdToUse,
        daylight_preference:
          daylightPreference && daylightPreference !== "ALL_DAY"
            ? daylightPreference
            : null,
        window_edge_preference: windowEdgePreference,
        goal_id: isTempHabit ? goalIdValue : null,
        completion_target: parsedCompletionTarget,
      };

      if (locationModeForInsert === "id") {
        insertPayload.location_context_id = locationContextId;
      } else {
        insertPayload.location_context = normalizedLocationValue;
      }

      const { error: insertError } = await supabase
        .from("habits")
        .insert(insertPayload);

      if (insertError) {
        if (
          locationModeForInsert === "id" &&
          isLocationMetadataError(insertError)
        ) {
          const legacyPayload: Record<string, unknown> = { ...insertPayload };
          delete legacyPayload.location_context_id;
          legacyPayload.location_context = normalizedLocationValue;

          const { error: legacyInsertError } = await supabase
            .from("habits")
            .insert(legacyPayload);

          if (legacyInsertError) {
            throw legacyInsertError;
          }

          locationModeForInsert = "legacy";
          setLocationMetadataMode("legacy");
        } else {
          throw insertError;
        }
      }

      router.push("/habits");
      router.refresh();
    } catch (err) {
      console.error("Failed to create habit:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the habit right now."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#05070c] pb-16 text-white">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageHeader
            title={
              <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                Create a habit
              </span>
            }
            description="Define your routine, set a cadence, and make progress feel tangible."
          >
            <Button asChild variant="outline" size="sm" className="text-white">
              <Link href="/habits">Back to habits</Link>
            </Button>
          </PageHeader>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_45px_-25px_rgba(15,23,42,0.85)] sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              <HabitFormFields
                name={name}
                description={description}
                habitType={habitType}
                recurrence={recurrence}
                recurrenceDays={recurrenceDays}
                duration={duration}
                energy={energy}
                skillId={skillId}
                locationContext={locationContext}
                daylightPreference={daylightPreference}
                windowEdgePreference={windowEdgePreference}
                energyOptions={energySelectOptions}
                skillsLoading={skillsLoading}
                skillOptions={skillSelectOptions}
                skillError={skillLoadError}
                goalId={goalId}
                goalOptions={goalSelectOptions}
                goalError={goalLoadError}
                onGoalChange={setGoalId}
                completionTarget={completionTarget}
                onCompletionTargetChange={setCompletionTarget}
                onNameChange={setName}
                onDescriptionChange={setDescription}
                onHabitTypeChange={setHabitType}
                onRecurrenceChange={setRecurrence}
                onRecurrenceDaysChange={setRecurrenceDays}
                onEnergyChange={setEnergy}
                onDurationChange={setDuration}
                onSkillChange={setSkillId}
                onLocationContextChange={(value) =>
                  setLocationContext(value ? value.toUpperCase() : null)
                }
                onDaylightPreferenceChange={(value) =>
                  setDaylightPreference(value.toUpperCase())
                }
                onWindowEdgePreferenceChange={(value) =>
                  setWindowEdgePreference(value.toUpperCase())
                }
                footerSlot={
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                        Routine
                      </Label>
                      <Select
                        value={routineId}
                        onValueChange={(value) => {
                          setRoutineId(value);
                          if (value !== "__create__") {
                            setNewRoutineName("");
                            setNewRoutineDescription("");
                          }
                        }}
                        disabled={routinesLoading}
                      >
                        <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                          <SelectValue placeholder="Choose a routine" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0b101b] text-sm text-white">
                          {routineSelectOptions.map((option) => (
                            <SelectItem
                              key={`${option.value}-${option.label}`}
                              value={option.value}
                              disabled={option.disabled}
                            >
                              <div className="flex flex-col">
                                <span>{option.label}</span>
                                {option.description ? (
                                  <span className="text-xs text-white/60">{option.description}</span>
                                ) : null}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {routineLoadError ? (
                        <p className="text-xs text-red-300">{routineLoadError}</p>
                      ) : null}
                    </div>

                    {routineId === "__create__" ? (
                      <div className="space-y-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
                        <div className="space-y-3">
                          <Label
                            htmlFor="new-routine-name"
                            className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
                          >
                            Routine name
                          </Label>
                          <Input
                            id="new-routine-name"
                            value={newRoutineName}
                            onChange={(event) => setNewRoutineName(event.target.value)}
                            placeholder="e.g. Morning kickoff"
                            className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label
                            htmlFor="new-routine-description"
                            className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
                          >
                            Description (optional)
                          </Label>
                          <Textarea
                            id="new-routine-description"
                            value={newRoutineDescription}
                            onChange={(event) => setNewRoutineDescription(event.target.value)}
                            placeholder="Give your routine a purpose so future habits stay aligned."
                            className="min-h-[120px] rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                }
              />

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed"
                >
                  {loading ? "Creating..." : "Create habit"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
