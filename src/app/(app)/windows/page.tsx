"use client";

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
  energy_cap: string | null;
  tags: string[] | null;
  max_consecutive_min: number | null;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WindowsPage() {
  const supabase = getSupabaseBrowser();
  const toast = useToastHelpers();
  const [windows, setWindows] = useState<WindowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WindowRow | null>(null);

  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [energy, setEnergy] = useState("low");
  const [tags, setTags] = useState("");
  const [maxConsecutive, setMaxConsecutive] = useState<number | "">("");

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
      .select(
        "id,label,days_of_week,start_local,end_local,energy_cap,tags,max_consecutive_min"
      )
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
    setDays([]);
    setStart("");
    setEnd("");
    setEnergy("low");
    setTags("");
    setMaxConsecutive("");
    setShowForm(true);
  }

  function openEdit(w: WindowRow) {
    setEditing(w);
    setLabel(w.label);
    setDays(w.days_of_week || []);
    setStart(w.start_local || "");
    setEnd(w.end_local || "");
    setEnergy(w.energy_cap || "low");
    setTags((w.tags || []).join(","));
    setMaxConsecutive(w.max_consecutive_min ?? "");
    setShowForm(true);
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

  async function saveWindow(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      label,
      days_of_week: days,
      start_local: start,
      end_local: end,
      energy_cap: energy,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
      max_consecutive_min:
        maxConsecutive === "" ? null : Number(maxConsecutive),
      user_id: user.id,
    };
    let error;
    if (editing) {
      ({ error } = await supabase
        .from("windows")
        .update(payload)
        .eq("id", editing.id)
        .eq("user_id", user.id));
    } else {
      ({ error } = await supabase.from("windows").insert(payload));
    }
    if (error) {
      toast.error("Error", "Failed to save window");
    } else {
      toast.success("Saved", "Window saved");
      setShowForm(false);
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
                  required
                />
              </div>

              <div className="space-y-1">
                <Label>Days of Week</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {DAY_LABELS.map((d, idx) => (
                    <label key={idx} className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        className="accent-gray-600"
                        checked={days.includes(idx)}
                        onChange={() => toggleDay(idx)}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="start">Start</Label>
                  <Input
                    id="start"
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
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
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="energy">Energy Cap</Label>
                <select
                  id="energy"
                  value={energy}
                  onChange={(e) => setEnergy(e.target.value)}
                  className="w-full rounded-md bg-gray-800 p-2 text-sm"
                >
                  <option value="low">low</option>
                  <option value="med">med</option>
                  <option value="high">high</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="tag1, tag2"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="max">Max Consecutive (min)</Label>
                <Input
                  id="max"
                  type="number"
                  min="0"
                  value={maxConsecutive}
                  onChange={(e) =>
                    setMaxConsecutive(
                      e.target.value === "" ? "" : parseInt(e.target.value)
                    )
                  }
                />
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
      </div>
    </ProtectedRoute>
  );
}

