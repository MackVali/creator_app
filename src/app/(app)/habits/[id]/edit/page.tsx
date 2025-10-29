"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  PageHeader,
  Skeleton,
} from "@/components/ui";
import {
  HabitFormFields,
  HABIT_RECURRENCE_OPTIONS,
  HABIT_TYPE_OPTIONS,
  HABIT_ENERGY_OPTIONS,
  type HabitEnergySelectOption,
  type HabitSkillSelectOption,
  type HabitGoalSelectOption,
} from "@/components/habits/habit-form-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isValidUuid, resolveLocationContextId } from "@/lib/location-metadata";
import { getSupabaseBrowser } from "@/lib/supabase";

function normalizeMessageTokens(maybeError?: unknown) {
  if (!maybeError || typeof maybeError !== "object") {
    return "";
  }

  const parts: string[] = [];

  if ("message" in maybeError && typeof maybeError.message === "string") {
    parts.push(maybeError.message.toLowerCase());
  }

  if ("details" in maybeError && typeof maybeError.details === "string") {
    parts.push(maybeError.details.toLowerCase());
  }

  return parts.join(" ");
}

function isGoalMetadataError(maybeError?: unknown) {
  const haystack = normalizeMessageTokens(maybeError);
  if (!haystack) {
    return false;
  }
  return (
    haystack.includes("goal_id") || haystack.includes("completion_target")
  );
}

function buildHabitSelectColumns(includeGoalMetadata: boolean) {
  const baseColumns =
    "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, energy, routine_id, skill_id, daylight_preference, window_edge_preference";

  const columns = [
    baseColumns,
    "location_context_id, location_context:location_contexts(value,label)",
  ];

  if (includeGoalMetadata) {
    columns.push("goal_id, completion_target");
  }

  return columns.filter(Boolean).join(", ");
}

interface RoutineOption {
  id: string;
  name: string;
  description: string | null;
}

interface SkillOption {
  id: string;
  name: string | null;
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

type HabitLocationContext = {
  value: string;
  label: string;
} | null;

type HabitQueryResult = {
  id: string;
  name: string | null;
  description: string | null;
  habit_type: string | null;
  recurrence: string | null;
  recurrence_days: number[] | null;
  duration_minutes: number | null;
  energy: string | null;
  routine_id: string | null;
  skill_id: string | null;
  daylight_preference: string | null;
  window_edge_preference: string | null;
  location_context_id: string | null;
  location_context: HabitLocationContext;
  goal_id?: string | null;
  completion_target?: number | null;
};

export default function EditHabitPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const habitIdRaw = params?.id;
  const habitId = Array.isArray(habitIdRaw) ? habitIdRaw[0] : habitIdRaw;
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
  const [locationContextId, setLocationContextId] = useState<string | null>(null);
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
  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillLoadError, setSkillLoadError] = useState<string | null>(null);
  const [skillId, setSkillId] = useState<string>("none");
  const [habitLoading, setHabitLoading] = useState(true);
  const [habitLoadError, setHabitLoadError] = useState<string | null>(null);
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalLoadError, setGoalLoadError] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string>("none");
  const [completionTarget, setCompletionTarget] = useState("10");
  const [goalMetadataSupported, setGoalMetadataSupported] = useState(true);

  const energySelectOptions = useMemo<HabitEnergySelectOption[]>(
    () => HABIT_ENERGY_OPTIONS,
    []
  );

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

  useEffect(() => {
    let active = true;

    const fetchGoals = async () => {
      if (!goalMetadataSupported) {
        if (active) {
          setGoalsLoading(false);
          setGoalLoadError(null);
          setGoalOptions([]);
          setGoalId("none");
        }
        return;
      }

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
  }, [goalMetadataSupported, supabase]);

  useEffect(() => {
    let active = true;

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
            setSkillOptions([]);
            setSkillId("none");
            setSkillLoadError(null);
          }
          return;
        }

        const { data, error: skillsError } = await supabase
          .from("skills")
          .select("id, name")
          .eq("user_id", user.id)
          .order("name", { ascending: true });

        if (skillsError) throw skillsError;

        if (active) {
          const safeSkills = data ?? [];
          setSkillOptions(safeSkills);
          setSkillLoadError(null);
          setSkillId((current) => {
            if (current === "none") {
              return current;
            }

            return safeSkills.some((skill) => skill.id === current)
              ? current
              : "none";
          });
        }
      } catch (err) {
        console.error("Failed to load skills:", err);
        if (active) {
          setSkillOptions([]);
          setSkillLoadError("Unable to load your skills right now.");
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

  const goalSelectOptions = useMemo<HabitGoalSelectOption[]>(() => {
    if (!goalMetadataSupported) {
      return [
        {
          value: "none",
          label: "Goal linking isn’t available yet for this habit.",
          disabled: true,
        },
      ];
    }

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
  }, [goalMetadataSupported, goalOptions, goalsLoading]);

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

    if (skillOptions.length === 0) {
      return [
        {
          value: "none",
          label: "No skill linked",
        },
      ];
    }

    return [
      {
        value: "none",
        label: "No skill linked",
      },
      ...skillOptions.map((skill) => ({
        value: skill.id,
        label: skill.name?.trim() ? skill.name : "Untitled skill",
      })),
    ];
  }, [skillOptions, skillsLoading]);

  useEffect(() => {
    if (!habitId) {
      setHabitLoadError("Missing habit identifier.");
      setHabitLoading(false);
      return;
    }

    let active = true;

    const fetchHabit = async () => {
      if (!supabase) {
        if (active) {
          setHabitLoading(false);
          setHabitLoadError("Supabase client not available.");
        }
        return;
      }

      setHabitLoading(true);
      setHabitLoadError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          if (active) {
            setHabitLoadError("You need to be signed in to edit habits.");
          }
          return;
        }

        let includeGoalMetadata = true;
        let habitResponse: PostgrestSingleResponse<HabitQueryResult> | null =
          null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const response = (await supabase
            .from("habits")
            .select(buildHabitSelectColumns(includeGoalMetadata))
            .eq("id", habitId)
            .eq("user_id", user.id)
            .single()) as PostgrestSingleResponse<HabitQueryResult>;

          habitResponse = response;

          if (!habitResponse.error) {
            break;
          }

          let adjusted = false;

          if (includeGoalMetadata && isGoalMetadataError(habitResponse.error)) {
            includeGoalMetadata = false;
            adjusted = true;
          }

          if (!adjusted) {
            throw habitResponse.error;
          }
        }

        if (!habitResponse || habitResponse.error) {
          throw habitResponse?.error ?? new Error("Failed to load habit.");
        }

        const data = habitResponse.data;

        if (!data) {
          if (active) {
            setHabitLoadError("We couldn’t find that habit.");
          }
          return;
        }

        if (active) {
          setGoalMetadataSupported(includeGoalMetadata);
          if (!includeGoalMetadata) {
            setGoalsLoading(false);
            setGoalLoadError(null);
            setGoalOptions([]);
            setGoalId("none");
          }
          setName(data.name ?? "");
          setDescription(data.description ?? "");
          setHabitType(data.habit_type ?? HABIT_TYPE_OPTIONS[0].value);
          setRecurrence(data.recurrence ?? "none");
          const safeRecurrenceDays = Array.isArray(data.recurrence_days)
            ? data.recurrence_days
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
            : [];
          setRecurrenceDays(safeRecurrenceDays);
          setDuration(
            typeof data.duration_minutes === "number"
              ? String(data.duration_minutes)
              : ""
          );
          const normalizedEnergy = (data.energy ?? "").toString().trim().toUpperCase();
          const fallbackEnergy = HABIT_ENERGY_OPTIONS[0]?.value ?? "NO";
          setEnergy(
            HABIT_ENERGY_OPTIONS.some((option) => option.value === normalizedEnergy)
              ? normalizedEnergy
              : fallbackEnergy
          );
          setRoutineId(data.routine_id ?? "none");
          setSkillId(data.skill_id ?? "none");
          if (includeGoalMetadata) {
            const resolvedGoalId =
              typeof data.goal_id === "string" && data.goal_id.trim().length > 0
                ? data.goal_id
                : "none";
            setGoalId(resolvedGoalId);
            const completionValue =
              typeof data.completion_target === "number" &&
              Number.isFinite(data.completion_target) &&
              data.completion_target > 0
                ? String(data.completion_target)
                : "10";
            setCompletionTarget(completionValue);
          } else {
            setGoalId("none");
            setCompletionTarget("10");
          }
          setLocationContextId(
            isValidUuid(data.location_context_id)
              ? data.location_context_id
              : null,
          );
          setDaylightPreference(
            data.daylight_preference
              ? String(data.daylight_preference).toUpperCase()
              : "ALL_DAY"
          );
          setWindowEdgePreference(
            data.window_edge_preference
              ? String(data.window_edge_preference).toUpperCase()
              : "FRONT"
          );
        }
      } catch (err) {
        console.error("Failed to load habit:", err);
        if (active) {
          setHabitLoadError(
            err instanceof Error
              ? err.message
              : "Unable to load the habit right now."
          );
        }
      } finally {
        if (active) {
          setHabitLoading(false);
        }
      }
    };

    fetchHabit();

    return () => {
      active = false;
    };
  }, [habitId, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!habitId) {
      setError("Missing habit identifier.");
      return;
    }

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
      setError("Memo habits need to stay connected to a skill so their notes are saved.");
      return;
    }

    if (routineId === "__create__" && !newRoutineName.trim()) {
      setError("Please give your new routine a name.");
      return;
    }

    const normalizedHabitType = habitType.toUpperCase();
    const isTempHabit = normalizedHabitType === "TEMP";
    const goalMetadataRequired = goalMetadataSupported && isTempHabit;

    let parsedCompletionTarget: number | null = null;
    if (goalMetadataRequired) {
      if (goalId === "none") {
        setError("Temp habits need to stay linked to a goal.");
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
        setError("You need to be signed in to edit a habit.");
        return;
      }

      const trimmedDescription = description.trim();
      const normalizedRecurrence = recurrence.toLowerCase().trim();
      const recurrenceValue = normalizedRecurrence === "none" ? null : recurrence;
      const recurrenceDaysValue =
        normalizedRecurrence === "every x days" && recurrenceDays.length > 0
          ? recurrenceDays
          : null;
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

      let resolvedLocationContextId: string | null = null;
      if (locationContextId) {
        if (isValidUuid(locationContextId)) {
          resolvedLocationContextId = locationContextId;
        } else {
          resolvedLocationContextId = await resolveLocationContextId(
            supabase,
            user.id,
            locationContextId,
          );

          if (!resolvedLocationContextId) {
            setError(
              "We couldn’t save that location just yet. Please try again.",
            );
            setLoading(false);
            return;
          }
        }
      }

      const basePayload: Record<string, unknown> = {
        name: name.trim(),
        description: trimmedDescription || null,
        habit_type: habitType,
        recurrence: recurrenceValue,
        recurrence_days: recurrenceDaysValue,
        duration_minutes: durationMinutes,
        energy,
        routine_id: routineIdToUse,
        skill_id: skillId === "none" ? null : skillId,
        daylight_preference:
          daylightPreference && daylightPreference !== "ALL_DAY"
            ? daylightPreference
            : null,
        window_edge_preference: windowEdgePreference,
      };

      if (goalMetadataSupported) {
        basePayload.goal_id =
          isTempHabit && goalId !== "none" ? goalId : null;
        basePayload.completion_target = goalMetadataRequired
          ? parsedCompletionTarget
          : null;
      }

      const payload: Record<string, unknown> = {
        ...basePayload,
        location_context_id: resolvedLocationContextId,
      };

      const { error: updateError } = await supabase
        .from("habits")
        .update(payload)
        .eq("id", habitId)
        .eq("user_id", user.id);

      if (updateError) {
        throw updateError;
      }

      router.push("/habits");
      router.refresh();
    } catch (err) {
      console.error("Failed to update habit:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update the habit right now."
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
                Edit habit
              </span>
            }
            description="Refine the cadence, energy, and routines that shape your momentum."
          >
            <Button asChild variant="outline" size="sm" className="text-white">
              <Link href="/habits">Back to habits</Link>
            </Button>
          </PageHeader>

          {habitLoading ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_45px_-25px_rgba(15,23,42,0.85)] sm:p-8">
              <div className="space-y-6">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-10 w-full" />
                <div className="grid gap-4 md:grid-cols-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ) : habitLoadError ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {habitLoadError}
              </div>
              <Button asChild variant="secondary" className="self-start text-white">
                <Link href="/habits">Go back</Link>
              </Button>
            </div>
          ) : (
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
                locationContextId={locationContextId}
                  daylightPreference={daylightPreference}
                  windowEdgePreference={windowEdgePreference}
                  energyOptions={energySelectOptions}
                  skillsLoading={skillsLoading}
                  skillOptions={skillSelectOptions}
                  skillError={skillLoadError}
                  goalId={goalId}
                  goalOptions={goalSelectOptions}
                  goalError={goalMetadataSupported ? goalLoadError : null}
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
                  onLocationContextIdChange={setLocationContextId}
                  onDaylightPreferenceChange={(value) =>
                    setDaylightPreference(value.toUpperCase())
                  }
                  onWindowEdgePreferenceChange={(value) =>
                    setWindowEdgePreference(value.toUpperCase())
                  }
                  showDescriptionField={false}
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

                      {routineId === "__create__" && (
                        <div className="grid gap-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                              Routine name
                            </Label>
                            <Input
                              value={newRoutineName}
                              onChange={(event) => setNewRoutineName(event.target.value)}
                              placeholder="Morning Focus"
                              className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                              Description
                            </Label>
                            <Textarea
                              value={newRoutineDescription}
                              onChange={(event) => setNewRoutineDescription(event.target.value)}
                              placeholder="Group habits focused on deep work."
                              className="min-h-[120px] rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  }
                />

                {error ? (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={loading} className="text-white">
                    {loading ? "Saving changes…" : "Save changes"}
                  </Button>
                  <Button type="button" variant="ghost" className="text-white/70 hover:text-white" onClick={() => router.push("/habits")}>Cancel</Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
