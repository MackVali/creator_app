"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
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
import { getSupabaseBrowser } from "@/lib/supabase";

const HABIT_TYPE_OPTIONS = [
  { label: "Habit", value: "HABIT" },
  { label: "Chore", value: "CHORE" },
];

const RECURRENCE_OPTIONS = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Bi-weekly", value: "bi-weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Bi-monthly", value: "bi-monthly" },
  { label: "Yearly", value: "yearly" },
  { label: "Every X Days", value: "every x days" },
];

interface WindowOption {
  id: string;
  label: string;
  start_local: string;
  end_local: string;
  energy: string;
}

function formatTimeLabel(value: string | null | undefined) {
  if (!value) return null;
  const [hour, minute] = value.split(":");
  if (typeof hour === "undefined" || typeof minute === "undefined") {
    return null;
  }

  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatWindowSummary(window: WindowOption) {
  const start = formatTimeLabel(window.start_local);
  const end = formatTimeLabel(window.end_local);
  const energy = window.energy
    ? window.energy.replace(/[_-]+/g, " ").toLowerCase()
    : null;
  const parts = [window.label];
  if (start && end) {
    parts.push(`${start} – ${end}`);
  }
  if (energy) {
    parts.push(`${energy} energy`);
  }
  return parts.join(" • ");
}

export default function NewHabitPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [habitType, setHabitType] = useState("HABIT");
  const [recurrence, setRecurrence] = useState("none");
  const [duration, setDuration] = useState("");
  const [windowId, setWindowId] = useState("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowOptions, setWindowOptions] = useState<WindowOption[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(true);
  const [windowLoadError, setWindowLoadError] = useState<string | null>(null);

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

  const windowSelectItems = useMemo(() => {
    if (windowsLoading) {
      return [
        <SelectItem key="loading" value="none" disabled>
          Loading windows…
        </SelectItem>,
      ];
    }

    if (windowOptions.length === 0) {
      return [
        <SelectItem key="none" value="none">
          No window preference
        </SelectItem>,
      ];
    }

    return [
      <SelectItem key="none" value="none">
        No window preference
      </SelectItem>,
      ...windowOptions.map((window) => (
        <SelectItem key={window.id} value={window.id}>
          {formatWindowSummary(window)}
        </SelectItem>
      )),
    ];
  }, [windowOptions, windowsLoading]);

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
      const recurrenceValue = recurrence === "none" ? null : recurrence;

      const { error: insertError } = await supabase.from("habits").insert({
        user_id: user.id,
        name: name.trim(),
        description: trimmedDescription || null,
        habit_type: habitType,
        recurrence: recurrenceValue,
        duration_minutes: durationMinutes,
        window_id: windowId === "none" ? null : windowId,
      });

      if (insertError) {
        throw insertError;
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
              <div className="space-y-3">
                <Label
                  htmlFor="name"
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
                >
                  Habit name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Morning meditation"
                  required
                  className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
                />
              </div>

              <div className="space-y-3">
                <Label
                  htmlFor="description"
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
                >
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add any notes that will keep you accountable."
                  className="min-h-[120px] rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
                />
                <p className="text-xs text-white/50">
                  Optional, but a clear intention makes it easier to stay consistent.
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                    Type
                  </Label>
                  <Select
                    value={habitType}
                    onValueChange={(value) => setHabitType(value)}
                  >
                    <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0b101b] text-sm text-white">
                      {HABIT_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-white/50">
                    Use chores for recurring upkeep tasks; habits track personal rituals.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                    Recurrence
                  </Label>
                  <Select
                    value={recurrence}
                    onValueChange={(value) => setRecurrence(value)}
                  >
                    <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                      <SelectValue placeholder="How often will you do this?" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0b101b] text-sm text-white">
                      <SelectItem value="none">No set cadence</SelectItem>
                      {RECURRENCE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-white/50">
                    Pick the cadence that fits best. You can adjust this later.
                  </p>
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                    Preferred window
                  </Label>
                  <Select value={windowId} onValueChange={(value) => setWindowId(value)}>
                    <SelectTrigger
                      disabled={windowsLoading}
                      className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0"
                    >
                      <SelectValue placeholder="Choose when this fits best" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0b101b] text-sm text-white">
                      {windowSelectItems}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-white/50">
                    Anchoring to a window helps scheduling align with your energy.
                  </p>
                  {windowLoadError && (
                    <p className="text-xs text-red-300">{windowLoadError}</p>
                  )}
                </div>
                <div className="space-y-3">
                  <Label
                    htmlFor="duration"
                    className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
                  >
                    Duration (minutes)
                  </Label>
                  <Input
                    id="duration"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                    placeholder="e.g. 25"
                    required
                    className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
                  />
                  <p className="text-xs text-white/50">
                    Estimate how long this habit usually takes so we can track your time investment.
                  </p>
                </div>
              </div>

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
