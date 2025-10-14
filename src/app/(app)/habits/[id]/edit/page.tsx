"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  PageHeader,
  Skeleton,
} from "@/components/ui";
import {
  HabitFormFields,
  HABIT_RECURRENCE_OPTIONS,
  HABIT_TYPE_OPTIONS,
  type HabitWindowSelectOption,
  type HabitSkillSelectOption,
} from "@/components/habits/habit-form-fields";
import {
  buildHabitRoutineSelectOptions,
  buildHabitSkillSelectOptions,
  buildHabitWindowSelectOptions,
  type HabitRoutineSelectOption,
} from "@/components/habits/habit-form-utils";
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
import { getSupabaseBrowser } from "@/lib/supabase";

interface WindowOption {
  id: string;
  label: string;
  start_local: string | null;
  end_local: string | null;
  energy: string | null;
}

interface RoutineOption {
  id: string;
  name: string;
  description: string | null;
}

interface SkillOption {
  id: string;
  name: string | null;
  icon?: string | null;
}

type RoutineSelectValue = string;

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
  const [windowId, setWindowId] = useState("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowOptions, setWindowOptions] = useState<WindowOption[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(true);
  const [windowLoadError, setWindowLoadError] = useState<string | null>(null);
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

  useEffect(() => {
    let active = true;

    const fetchWindows = async () => {
      if (!supabase) {
        if (active) {
          setWindowsLoading(false);
          setWindowLoadError("Supabase client not available.");
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
            setWindowOptions([]);
            setWindowId("none");
          }
          return;
        }

        const { data, error: windowsError } = await supabase
          .from("windows")
          .select("id, label, start_local, end_local, energy")
          .eq("user_id", user.id)
          .order("start_local", { ascending: true });

        if (windowsError) throw windowsError;

        if (active) {
          const safeWindows = data ?? [];
          setWindowOptions(safeWindows);
          setWindowLoadError(null);
          setWindowId((current) => {
            if (current === "none") return current;
            return safeWindows.some((option) => option.id === current)
              ? current
              : "none";
          });
        }
      } catch (err) {
        console.error("Failed to load windows:", err);
        if (active) {
          setWindowOptions([]);
          setWindowLoadError("Unable to load your time windows right now.");
        }
      } finally {
        if (active) {
          setWindowsLoading(false);
        }
      }
    };

    fetchWindows();

    return () => {
      active = false;
    };
  }, [supabase]);

  const windowSelectOptions = useMemo<HabitWindowSelectOption[]>(() => {
    return buildHabitWindowSelectOptions({
      windows: windowOptions,
      isLoading: windowsLoading,
    });
  }, [windowOptions, windowsLoading]);

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

  const routineSelectOptions = useMemo<HabitRoutineSelectOption[]>(() => {
    return buildHabitRoutineSelectOptions({
      routines: routineOptions,
      isLoading: routinesLoading,
    });
  }, [routineOptions, routinesLoading]);

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
          .select("id, name, icon")
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

  const skillSelectOptions = useMemo<HabitSkillSelectOption[]>(() => {
    return buildHabitSkillSelectOptions({
      skills: skillOptions,
      isLoading: skillsLoading,
    });
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

        const { data, error: habitError } = await supabase
          .from("habits")
          .select(
            "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, window_id, routine_id, skill_id"
          )
          .eq("id", habitId)
          .eq("user_id", user.id)
          .single();

        if (habitError) throw habitError;

        if (!data) {
          if (active) {
            setHabitLoadError("We couldn’t find that habit.");
          }
          return;
        }

        if (active) {
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
          setWindowId(data.window_id ?? "none");
          setRoutineId(data.routine_id ?? "none");
          setSkillId(data.skill_id ?? "none");
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

    if (routineId === "__create__" && !newRoutineName.trim()) {
      setError("Please give your new routine a name.");
      return;
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

      const { error: updateError } = await supabase
        .from("habits")
        .update({
          name: name.trim(),
          description: trimmedDescription || null,
          habit_type: habitType,
          recurrence: recurrenceValue,
          recurrence_days: recurrenceDaysValue,
          duration_minutes: durationMinutes,
          window_id: windowId === "none" ? null : windowId,
          routine_id: routineIdToUse,
          skill_id: skillId === "none" ? null : skillId,
        })
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
            description="Refine the cadence, windows, and routines that shape your momentum."
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
                  windowId={windowId}
                  skillId={skillId}
                  windowsLoading={windowsLoading}
                  windowOptions={windowSelectOptions}
                  windowError={windowLoadError}
                  skillsLoading={skillsLoading}
                  skillOptions={skillSelectOptions}
                  skillError={skillLoadError}
                  onNameChange={setName}
                  onDescriptionChange={setDescription}
                  onHabitTypeChange={setHabitType}
                  onRecurrenceChange={setRecurrence}
                  onRecurrenceDaysChange={setRecurrenceDays}
                  onWindowChange={setWindowId}
                  onDurationChange={setDuration}
                  onSkillChange={setSkillId}
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
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                              Routine name
                            </Label>
                            <Input
                              value={newRoutineName}
                              onChange={(event) => setNewRoutineName(event.target.value)}
                              placeholder="e.g. Morning kickoff"
                              className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
                            />
                          </div>

                          <div className="space-y-3">
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                              Description (optional)
                            </Label>
                            <Textarea
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
