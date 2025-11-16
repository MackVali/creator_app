"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { HabitFormFields, HABIT_ENERGY_OPTIONS, HABIT_RECURRENCE_OPTIONS, HABIT_TYPE_OPTIONS, type HabitEnergySelectOption, type HabitGoalSelectOption, type HabitSkillSelectOption } from "@/components/habits/habit-form-fields";
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
import { getSupabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { isValidUuid, resolveLocationContextId } from "@/lib/location-metadata";
import { XIcon } from "lucide-react";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import {
  ScheduleMorphDialog,
  type ScheduleEditOrigin,
} from "@/components/schedule/ScheduleMorphDialog";

type RoutineOption = {
  id: string;
  name: string;
  description: string | null;
};

type RoutineSelectOption = {
  value: string;
  label: string;
  description?: string | null;
  disabled?: boolean;
};

type HabitEditSheetProps = {
  open: boolean;
  habitId: string | null;
  eventTitle?: string | null;
  eventTypeLabel?: string | null;
  timeRangeLabel?: string | null;
  origin?: ScheduleEditOrigin | null;
  layoutId?: string;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
};

type RoutineSelectValue = string;

type SkillOption = {
  id: string;
  name: string | null;
};

type GoalOption = {
  id: string;
  name: string;
  description?: string | null;
};

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
    "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, energy, routine_id, skill_id, daylight_preference, window_edge_preference, location_context_id, next_due_override";

  const columns = [
    baseColumns,
    "location_context:location_contexts(value,label)",
  ];

  if (includeGoalMetadata) {
    columns.push("goal_id, completion_target");
  }

  return columns.filter(Boolean).join(", ");
}

function toDateTimeLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);
  return localDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalInput(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function formatDateTimeDisplay(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "long",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function HabitEditSheet({
  open,
  habitId,
  eventTitle,
  eventTypeLabel,
  timeRangeLabel,
  origin,
  layoutId,
  onClose,
  onSaved,
}: HabitEditSheetProps) {
  const supabase = getSupabaseBrowser();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [habitType, setHabitType] = useState(HABIT_TYPE_OPTIONS[0].value);
  const [recurrence, setRecurrence] = useState(
    HABIT_RECURRENCE_OPTIONS[0].value,
  );
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [duration, setDuration] = useState("15");
  const [energy, setEnergy] = useState(HABIT_ENERGY_OPTIONS[0]?.value ?? "NO");
  const [locationContextId, setLocationContextId] = useState<string | null>(
    null,
  );
  const [daylightPreference, setDaylightPreference] = useState("ALL_DAY");
  const [windowEdgePreference, setWindowEdgePreference] = useState("FRONT");
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
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalLoadError, setGoalLoadError] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string>("none");
  const [goalMetadataSupported, setGoalMetadataSupported] = useState(true);
  const [completionTarget, setCompletionTarget] = useState("10");
  const [habitLoading, setHabitLoading] = useState(false);
  const [habitLoadError, setHabitLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextDueOverrideInput, setNextDueOverrideInput] = useState("");
  const [nextDueOverrideOriginal, setNextDueOverrideOriginal] =
    useState<string | null>(null);

  const energySelectOptions = useMemo<HabitEnergySelectOption[]>(
    () => HABIT_ENERGY_OPTIONS,
    [],
  );

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setHabitType(HABIT_TYPE_OPTIONS[0].value);
    setRecurrence(HABIT_RECURRENCE_OPTIONS[0].value);
    setRecurrenceDays([]);
    setDuration("15");
    setEnergy(HABIT_ENERGY_OPTIONS[0]?.value ?? "NO");
    setLocationContextId(null);
    setDaylightPreference("ALL_DAY");
    setWindowEdgePreference("FRONT");
    setRoutineOptions([]);
    setRoutineLoadError(null);
    setRoutinesLoading(true);
    setRoutineId("none");
    setNewRoutineName("");
    setNewRoutineDescription("");
    setSkillOptions([]);
    setSkillLoadError(null);
    setSkillsLoading(true);
    setSkillId("none");
    setGoalOptions([]);
    setGoalLoadError(null);
    setGoalsLoading(true);
    setGoalId("none");
    setGoalMetadataSupported(true);
    setCompletionTarget("10");
    setHabitLoadError(null);
    setHabitLoading(false);
    setSaving(false);
    setError(null);
    setNextDueOverrideInput("");
    setNextDueOverrideOriginal(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
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
          const safe = data ?? [];
          setRoutineOptions(safe);
          setRoutineLoadError(null);
          setRoutineId((current) => {
            if (current === "none" || current === "__create__") {
              return current;
            }
            return safe.some((option) => option.id === current)
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
  }, [open, supabase]);

  useEffect(() => {
    if (!open) return;
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
            setGoalLoadError(null);
          }
          return;
        }

        const { data, error: goalsError } = await supabase
          .from("goals")
          .select("id, name, description")
          .eq("user_id", user.id)
          .order("name", { ascending: true });

        if (goalsError) throw goalsError;

        if (active) {
          const normalized = (data ?? []).map((goal) => ({
            id: goal.id,
            name: goal.name ?? "Untitled goal",
            description: goal.description,
          }));
          setGoalOptions(normalized);
          setGoalLoadError(null);
          setGoalId((current) => {
            if (current === "none") {
              return current;
            }
            return normalized.some((goal) => goal.id === current)
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
  }, [goalMetadataSupported, open, supabase]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, supabase]);

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

  const goalSelectOptions = useMemo<HabitGoalSelectOption[]>(() => {
    if (!goalMetadataSupported) {
      return [
        {
          value: "none",
          label: "Link this habit to a goal to enable targets",
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
          label: "Create a goal to link this habit",
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

  const localTimeZoneLabel = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local time";
      } catch {
      return "local time";
    }
  }, []);

  const nextDueOverridePreview = useMemo(() => {
    const isoValue = fromDateTimeLocalInput(nextDueOverrideInput);
    return formatDateTimeDisplay(isoValue);
  }, [nextDueOverrideInput]);

  const savedNextDueOverrideLabel = useMemo(
    () => formatDateTimeDisplay(nextDueOverrideOriginal),
    [nextDueOverrideOriginal]
  );

  useEffect(() => {
    if (!open) return;
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
        let habitResponse:
          | PostgrestSingleResponse<Record<string, unknown>>
          | null = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          habitResponse = await supabase
            .from("habits")
            .select(buildHabitSelectColumns(includeGoalMetadata))
            .eq("id", habitId)
            .eq("user_id", user.id)
            .single();

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
          const nextDueOverrideValue =
            typeof data.next_due_override === "string"
              ? data.next_due_override
              : null;
          setNextDueOverrideOriginal(nextDueOverrideValue);
          setNextDueOverrideInput(toDateTimeLocalInput(nextDueOverrideValue));
          setName(data.name ?? "");
          setDescription(data.description ?? "");
          setHabitType(data.habit_type ?? HABIT_TYPE_OPTIONS[0].value);
          setRecurrence(data.recurrence ?? "none");
          const safeRecurrenceDays = Array.isArray(data.recurrence_days)
            ? data.recurrence_days
                .map((value: unknown) => Number(value))
                .filter((value: number) => Number.isFinite(value))
            : [];
          setRecurrenceDays(safeRecurrenceDays);
          setDuration(
            typeof data.duration_minutes === "number"
              ? String(data.duration_minutes)
              : "",
          );
          const normalizedEnergy = (data.energy ?? "").toString().trim().toUpperCase();
          const fallbackEnergy = HABIT_ENERGY_OPTIONS[0]?.value ?? "NO";
          setEnergy(
            HABIT_ENERGY_OPTIONS.some((option) => option.value === normalizedEnergy)
              ? normalizedEnergy
              : fallbackEnergy,
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
              : "ALL_DAY",
          );
          setWindowEdgePreference(
            data.window_edge_preference
              ? String(data.window_edge_preference).toUpperCase()
              : "FRONT",
          );
        }
      } catch (err) {
        console.error("Failed to load habit:", err);
        if (active) {
          setHabitLoadError(
            err instanceof Error
              ? err.message
              : "Unable to load the habit right now.",
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
  }, [habitId, open, supabase]);

  const routineFooter = (
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
                    <span className="text-xs text-white/60">
                      {option.description}
                    </span>
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
              onChange={(event) =>
                setNewRoutineDescription(event.target.value)
              }
              placeholder="Group habits focused on deep work."
              className="min-h-[120px] rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
            />
          </div>
        </div>
      )}
    </div>
  );

  const disableSubmit =
    !habitId || !name.trim() || saving || habitLoading || skillsLoading;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!supabase || !habitId || disableSubmit) return;
      setSaving(true);
      setError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          throw new Error("You must be signed in to edit a habit.");
        }

        let routineIdToUse: string | null = null;

        if (routineId === "__create__") {
          if (!newRoutineName.trim()) {
            setError("Name your routine before saving.");
            setSaving(false);
            return;
          }

          const { data: routineData, error: routineInsertError } =
            await supabase
              .from("habit_routines")
              .insert({
                id: crypto.randomUUID?.() ?? undefined,
                name: newRoutineName.trim(),
                description: newRoutineDescription.trim() || null,
                user_id: user.id,
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

        const trimmedDescription = description.trim();
        const recurrenceValue = recurrence.toLowerCase().trim();
        const recurrenceDaysValue =
          recurrenceValue === "every x days" ? recurrenceDays : null;
        const parsedDuration = Number(duration);
        const durationMinutes =
          duration && Number.isFinite(parsedDuration)
            ? Math.max(1, parsedDuration)
            : null;

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
              setSaving(false);
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
          const isTempHabit =
            habitType.toUpperCase() === "TEMP" || habitType.toUpperCase() === "MEMO";
          const parsedCompletionTarget = Number(completionTarget);
          const goalMetadataRequired =
            isTempHabit &&
            goalId !== "none" &&
            Number.isFinite(parsedCompletionTarget) &&
            parsedCompletionTarget > 0;
          basePayload.goal_id =
            isTempHabit && goalId !== "none" ? goalId : null;
          basePayload.completion_target = goalMetadataRequired
            ? Math.max(1, parsedCompletionTarget)
            : null;
        }

        let nextDueOverrideValue: string | null = null;
        if (nextDueOverrideInput.trim()) {
          const parsedOverride = fromDateTimeLocalInput(nextDueOverrideInput);
          if (!parsedOverride) {
            setError("Choose a valid next due date.");
            setSaving(false);
            return;
          }
          nextDueOverrideValue = parsedOverride;
        }

        const payload: Record<string, unknown> = {
          ...basePayload,
          location_context_id: resolvedLocationContextId,
          next_due_override: nextDueOverrideValue,
        };

        const { error: updateError } = await supabase
          .from("habits")
          .update(payload)
          .eq("id", habitId)
          .eq("user_id", user.id);

        if (updateError) {
          throw updateError;
        }

        if (onSaved) {
          await onSaved();
        }
        onClose();
      } catch (err) {
        console.error("Failed to update habit:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to update the habit right now.",
        );
      } finally {
        setSaving(false);
      }
    },
    [
      supabase,
      habitId,
      disableSubmit,
      routineId,
      newRoutineDescription,
      newRoutineName,
      locationContextId,
      description,
      habitType,
      recurrence,
      recurrenceDays,
      duration,
      name,
      energy,
      skillId,
      daylightPreference,
      windowEdgePreference,
      goalMetadataSupported,
      goalId,
      completionTarget,
      nextDueOverrideInput,
      onSaved,
      onClose,
    ],
  );

  if (!habitId) {
    return null;
  }

  return (
    <ScheduleMorphDialog
      open={open}
      title={eventTitle ?? "Habit"}
      subtitle={timeRangeLabel}
      typeLabel={eventTypeLabel ?? "Habit"}
      onClose={onClose}
      origin={origin}
      layoutId={layoutId}
    >
      {habitLoading ? (
        <div className="px-1 py-4 text-sm text-white/70">Loading…</div>
      ) : habitLoadError ? (
        <div className="space-y-3 px-1 py-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {habitLoadError}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="self-start text-white"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-4">
          <div className="relative pb-2">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-0 top-0 rounded-full border border-white/10 bg-white/10 p-1 text-white transition hover:bg-white/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <XIcon className="size-4" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
            <div className="pr-10">
              <h2 className="text-lg font-semibold text-white">Edit habit</h2>
              <p className="mt-1 text-sm text-white/70">
                Tune the cadence, energy, and advanced settings for this habit.
              </p>
            </div>
          </div>

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
            footerSlot={routineFooter}
          />

          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">
                  Next due date
                </p>
                <p className="text-sm text-white/70">
                  Skip upcoming reminders until a date that works better.
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.3em]",
                  nextDueOverrideInput
                    ? "border border-amber-400/40 text-amber-200"
                    : "border border-white/15 text-white/60"
                )}
              >
                {nextDueOverrideInput ? "Custom" : "Automatic"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                  Resume on
                </Label>
                <Input
                  type="datetime-local"
                  value={nextDueOverrideInput}
                  onChange={(event) => setNextDueOverrideInput(event.target.value)}
                  className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white focus:border-blue-400/60 focus-visible:ring-0"
                />
              </div>
              {nextDueOverrideInput ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNextDueOverrideInput("")}
                  className="h-11 border-white/30 text-white hover:bg-white/10"
                >
                  Clear date
                </Button>
              ) : null}
            </div>
            <div className="space-y-1 text-xs text-white/60">
              <p>Times use {localTimeZoneLabel}.</p>
              {nextDueOverridePreview ? (
                <p className="text-white/80">
                  Next run will resume on {nextDueOverridePreview}.
                </p>
              ) : savedNextDueOverrideLabel ? (
                <p className="text-amber-200">
                  Currently deferred until {savedNextDueOverrideLabel}.
                </p>
              ) : (
                <p>Leave blank to let the scheduler follow the regular cadence.</p>
              )}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pb-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className={cn(
                "bg-white text-zinc-900 hover:bg-white/90",
                disableSubmit && "opacity-50",
              )}
              disabled={disableSubmit}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      )}
    </ScheduleMorphDialog>
  );
}
