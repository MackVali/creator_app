"use client";

export const runtime = "nodejs";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToastHelpers } from "@/components/ui/toast";
import { getSupabaseBrowser } from "@/lib/supabase";

interface WindowRow {
  id: string;
  label: string;
  days_of_week: number[];
  start_local: string;
  end_local: string;
  energy_cap: EnergyCap | null;
}

type EnergyCap =
  | "NO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "ULTRA"
  | "EXTREME";

interface WindowPayload {
  label: string;
  days_of_week: number[];
  start_local: string;
  end_local: string;
  energy_cap: EnergyCap | null;
  user_id: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ENERGY_OPTIONS: { value: EnergyCap; label: string }[] = [
  { value: "NO", label: "No Energy" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "ULTRA", label: "Ultra" },
  { value: "EXTREME", label: "Extreme" },
];

export default function WindowsPage() {
  const supabase = getSupabaseBrowser();
  const toast = useToastHelpers();
  const [windows, setWindows] = useState<WindowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WindowRow | null>(null);

  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [dayPreset, setDayPreset] = useState<
    "every" | "weekdays" | "weekends" | "custom"
  >("every");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [energy, setEnergy] = useState<EnergyCap>("NO");
  const [conflictWindow, setConflictWindow] = useState<WindowRow | null>(null);
  const [pendingPayload, setPendingPayload] = useState<WindowPayload | null>(
    null
  );

  const is24Hour = !new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
  }).resolvedOptions().hour12;

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setWindows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("windows")
      .select("id,label,days_of_week,start_local,end_local,energy_cap")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (!error && data) {
      setWindows(data as WindowRow[]);
    }
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setLabel("");
    setDayPreset("every");
    setDays([0, 1, 2, 3, 4, 5, 6]);
    setStart("");
    setEnd("");
    setEnergy("NO");
    setShowForm(true);
  }

  function determinePreset(arr: number[]) {
    const sorted = [...arr].sort().join(",");
    if (sorted === "0,1,2,3,4,5,6") return "every";
    if (sorted === "1,2,3,4,5") return "weekdays";
    if (sorted === "0,6") return "weekends";
    return "custom";
  }

  function openEdit(w: WindowRow) {
    setEditing(w);
    setLabel(w.label);
    setDayPreset(determinePreset(w.days_of_week || []));
    setDays(w.days_of_week || []);
    setStart(w.start_local || "");
    setEnd(w.end_local || "");
    setEnergy(w.energy_cap || "NO");
    setShowForm(true);
  }

  function selectPreset(preset: typeof dayPreset) {
    setDayPreset(preset);
    if (preset === "every") setDays([0, 1, 2, 3, 4, 5, 6]);
    if (preset === "weekdays") setDays([1, 2, 3, 4, 5]);
    if (preset === "weekends") setDays([0, 6]);
  }

  function toggleDay(i: number) {
    setDays((prev) =>
      prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]
    );
  }

  function formatDays(arr: number[]) {
    return arr
      .slice()
      .sort()
      .map((i) => DAY_LABELS[i])
      .join(", ");
  }

  function parseTime(t: string) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  function arraysEqual(a: number[], b: number[]) {
    return a.slice().sort().join(",") === b.slice().sort().join(",");
  }

  function formatDuration(min: number) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  async function saveWindow(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (!label.trim()) {
      toast.error("Label required", "Please enter a label");
      return;
    }
    if (days.length === 0) {
      toast.error("Select days", "Choose at least one day");
      return;
    }
    if (!start || !end) {
      toast.error("Time required", "Provide start and end times");
      return;
    }
    if (parseTime(end) <= parseTime(start)) {
      toast.error("Time error", "End must be after Start");
      return;
    }

    const duplicate = windows.find(
      (w) =>
        w.id !== editing?.id &&
        arraysEqual(w.days_of_week || [], days) &&
        w.start_local === start &&
        w.end_local === end
    );
    if (duplicate) {
      if (confirm("Similar window exists. Use existing + edit?")) {
        openEdit(duplicate);
      }
      return;
    }

    const conflict = windows.find((w) => {
      if (w.id === editing?.id) return false;
      const overlapDay = w.days_of_week.some((d) => days.includes(d));
      if (!overlapDay) return false;
      return parseTime(start) < parseTime(w.end_local) && parseTime(end) > parseTime(w.start_local);
    });
    const payload: WindowPayload = {
      label,
      days_of_week: days,
      start_local: start,
      end_local: end,
      energy_cap: energy,
      user_id: user.id,
    };

    if (conflict) {
      setConflictWindow(conflict);
      setPendingPayload(payload);
      return;
    }

    await performSave(payload, user.id);
  }

  async function performSave(payload: WindowPayload, userId: string) {
    if (!supabase) return;
    let error;
    if (editing) {
      ({ error } = await supabase
        .from("windows")
        .update(payload)
        .eq("id", editing.id)
        .eq("user_id", userId));
    } else {
      ({ error } = await supabase.from("windows").insert(payload));
    }
    if (error) {
      toast.error("Error", "Failed to save window");
    } else {
      toast.success("Saved", "Window saved");
      setShowForm(false);
      setConflictWindow(null);
      setPendingPayload(null);
      load();
    }
  }

  async function handleDelete(id: string) {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (!confirm("Delete window?")) return;
    const { error } = await supabase
      .from("windows")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Error", "Failed to delete window");
    } else {
      toast.success("Deleted", "Window removed");
      load();
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <PageHeader
            title="Windows"
            description="Manage your scheduling windows"
          >
            <Button
              onClick={openNew}
              size="sm"
              className="bg-gray-800 text-gray-100 hover:bg-gray-700"
            >
              New Window
            </Button>
          </PageHeader>

          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : windows.length === 0 ? (
            <p className="text-gray-400">No windows yet</p>
          ) : (
            <div className="space-y-4">
              {windows.map((w) => (
                <Card key={w.id} className="bg-gray-800">
                  <CardContent className="flex justify-between p-4">
                    <div>
                      <div className="font-medium">{w.label}</div>
                      <div className="text-sm text-gray-400">
                        {formatDays(w.days_of_week)} {w.start_local} - {w.end_local}
                      </div>
                      <div className="text-sm text-gray-400">
                        {w.energy_cap}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-gray-300 hover:bg-gray-700"
                        onClick={() => openEdit(w)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-gray-300 hover:bg-gray-700"
                        onClick={() => handleDelete(w.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <form
              onSubmit={saveWindow}
              className="w-full max-w-md space-y-4 rounded-lg bg-gray-900 p-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {editing ? "Edit Window" : "New Window"}
                </h2>
                <button
                  type="button"
                  className="text-gray-400"
                  onClick={() => setShowForm(false)}
                >
                  ×
                </button>
              </div>

              <div className="space-y-1">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  enterKeyHint="next"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {["Every day", "Weekdays", "Weekends", "Custom"].map(
                    (p, i) => (
                      <Button
                        key={p}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`min-w-[44px] h-11 ${
                          dayPreset ===
                          (["every", "weekdays", "weekends", "custom"] as const)[i]
                            ? "bg-gray-100 text-gray-900"
                            : "bg-gray-800 text-gray-300"
                        }`}
                        onClick={() =>
                          selectPreset(
                            (["every", "weekdays", "weekends", "custom"] as const)[i]
                          )
                        }
                      >
                        {p}
                      </Button>
                    )
                  )}
                </div>
                {dayPreset === "custom" && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {DAY_LABELS.map((d, idx) => (
                      <Button
                        key={idx}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`min-w-[44px] h-11 ${
                          days.includes(idx)
                            ? "bg-gray-100 text-gray-900"
                            : "bg-gray-800 text-gray-300"
                        }`}
                        onClick={() => toggleDay(idx)}
                      >
                        {d}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="start">Start</Label>
                  <Input
                    id="start"
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    step={300}
                    lang={is24Hour ? "en-GB" : "en-US"}
                    enterKeyHint="next"
                    required
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="end">End</Label>
                  <Input
                    id="end"
                    type="time"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    step={300}
                    lang={is24Hour ? "en-GB" : "en-US"}
                    enterKeyHint="next"
                    required
                  />
                </div>
              </div>
              {start && end && (
                <div
                  className={`text-center text-xs pt-1 ${
                    parseTime(end) <= parseTime(start)
                      ? "text-red-400"
                      : "text-gray-400"
                  }`}
                >
                  {parseTime(end) <= parseTime(start)
                    ? "End must be after Start."
                    : `${start} \u2192 ${end} • ${formatDuration(
                        parseTime(end) - parseTime(start)
                      )}`}
                </div>
              )}

              <div className="space-y-1">
                <Label>Energy</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {ENERGY_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant="outline"
                      className={`min-w-[44px] h-11 ${
                        energy === opt.value
                          ? "bg-gray-100 text-gray-900"
                          : "bg-gray-800 text-gray-300"
                      }`}
                      onClick={() => setEnergy(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                <div className="text-xs text-gray-400">
                  Tasks require ≤ selected energy.
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-gray-300 hover:bg-gray-700"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-gray-800 text-gray-100 hover:bg-gray-700"
                >
                  Save
                </Button>
              </div>
            </form>
          </div>
        )}
        {conflictWindow && pendingPayload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-sm space-y-4 rounded-lg bg-gray-900 p-6 text-center">
              <p className="text-gray-200">
                Overlaps with existing window &quot;{conflictWindow.label}&quot;.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  className="bg-gray-800 text-gray-100 hover:bg-gray-700"
                  onClick={() => performSave(pendingPayload, pendingPayload.user_id)}
                >
                  Keep both
                </Button>
                <Button
                  className="bg-gray-800 text-gray-100 hover:bg-gray-700"
                  onClick={() => {
                    const startMin = parseTime(pendingPayload.start_local);
                    const conflictStart = parseTime(conflictWindow.start_local);
                    if (conflictStart <= startMin) {
                      toast.error("Conflict", "No room before conflict");
                      setConflictWindow(null);
                      setPendingPayload(null);
                      return;
                    }
                    const newEnd = conflictWindow.start_local;
                    setEnd(newEnd);
                    const adjusted: WindowPayload = {
                      ...pendingPayload,
                      end_local: newEnd,
                    };
                    performSave(adjusted, pendingPayload.user_id);
                  }}
                >
                  Adjust end time
                </Button>
                <Button
                  variant="ghost"
                  className="text-gray-300 hover:bg-gray-700"
                  onClick={() => {
                    setConflictWindow(null);
                    setPendingPayload(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

