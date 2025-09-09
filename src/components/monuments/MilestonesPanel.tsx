"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AutoSplitModal } from "./AutoSplitModal";
import confetti from "canvas-confetti";

interface Milestone {
  id: string;
  title: string;
  order_index: number;
  target_date: string | null;
  done: boolean;
  charge_gain: number | null;
}

interface MilestonesPanelProps {
  monumentId: string;
  onProgressChange?: (progress: number) => void;
}

export function MilestonesPanel({
  monumentId,
  onProgressChange,
}: MilestonesPanelProps) {
  const supabase = getSupabaseBrowser();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showSplit, setShowSplit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("monument_milestones")
        .select("id,title,order_index,target_date,done,charge_gain")
        .eq("monument_id", monumentId)
        .order("order_index");
      if (cancelled) return;
      if (error) {
        console.error("Failed to load milestones", error);
        setMilestones([]);
      } else {
        setMilestones(data ?? []);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, monumentId]);

  async function toggleDone(m: Milestone) {
    if (!supabase) return;
    const updated = { ...m, done: !m.done };
    setMilestones((prev) =>
      prev.map((mi) => (mi.id === m.id ? updated : mi))
    );
    await supabase
      .from("monument_milestones")
      .update({ done: updated.done })
      .eq("id", m.id);

    if (m.charge_gain) {
      try {
        const { data: monumentData } = await supabase
          .from("monuments")
          .select("charge")
          .eq("id", monumentId)
          .single();
        const current = monumentData?.charge ?? 0;
        const newCharge = updated.done
          ? current + m.charge_gain
          : current - m.charge_gain;
        await supabase
          .from("monuments")
          .update({ charge: newCharge })
          .eq("id", monumentId);
        onProgressChange?.(newCharge);
        try {
          await supabase.from("monument_activity").insert({
            monument_id: monumentId,
            type: "charge_update",
            details: { charge: newCharge },
          });
        } catch (err) {
          console.error("Failed logging charge activity", err);
        }
      } catch (err) {
        console.error("Failed updating monument charge", err);
      }

      if (updated.done) {
        confetti({ particleCount: 40, spread: 45, origin: { y: 0.6 } });
        try {
          await supabase.from("monument_activity").insert({
            monument_id: monumentId,
            type: "milestone_done",
            details: { milestone_id: m.id },
          });
        } catch (err) {
          console.error("Failed logging activity", err);
        }
      }
    }
  }

  function startEdit(m: Milestone) {
    setEditingId(m.id);
    setEditTitle(m.title);
    setEditDate(m.target_date ? m.target_date.slice(0, 10) : "");
  }

  async function saveEdit(id: string) {
    if (!supabase) return;
    const { error } = await supabase
      .from("monument_milestones")
      .update({ title: editTitle, target_date: editDate || null })
      .eq("id", id);
    if (error) {
      console.error("Failed to update milestone", error);
    } else {
      setMilestones((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, title: editTitle, target_date: editDate || null } : m
        )
      );
    }
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function addMilestone() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("monument_milestones")
      .insert({
        monument_id: monumentId,
        title: newTitle,
        order_index: milestones.length,
      })
      .select()
      .single();
    if (error) {
      console.error("Failed to add milestone", error);
      return;
    }
    setMilestones((prev) => [...prev, data]);
    setNewTitle("");
    setAdding(false);
  }

  async function handleSplit(count: number, targetDate: Date) {
    if (!supabase) return;
    const today = new Date();
    const diff = targetDate.getTime() - today.getTime();
    const step = Math.floor(diff / count);
    const inserts = Array.from({ length: count }, (_, i) => ({
      monument_id: monumentId,
      title: `Milestone ${i + 1}`,
      order_index: milestones.length + i,
      target_date: new Date(today.getTime() + step * (i + 1)).toISOString(),
    }));
    try {
      const { data, error } = await supabase
        .from("monument_milestones")
        .insert(inserts)
        .select();
      if (error) {
        console.error("Failed autosplitting", error);
        return;
      }
      if (data) setMilestones((prev) => [...prev, ...data]);
    } catch (err) {
      console.error("Failed autosplitting", err);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {milestones.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No milestones yet.
          </div>
        )}
        {milestones.map((m) => (
          <div
            key={m.id}
            className={`relative flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-inner`}
          >
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-zinc-700">
              <div
                className={`h-full bg-[var(--accent)] transition-all duration-300 ${
                  m.done ? "w-full" : "w-0"
                }`}
              />
            </div>
            {editingId === m.id ? (
              <div className="flex w-full items-center justify-between gap-2">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="h-8 flex-1"
                />
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="h-8 w-32"
                />
                <Button
                  size="sm"
                  onClick={() => saveEdit(m.id)}
                  disabled={!editTitle.trim()}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={m.done}
                    onChange={() => toggleDone(m)}
                  />
                  <span
                    className="cursor-pointer"
                    onClick={() => startEdit(m)}
                  >
                    {m.title}
                  </span>
                </label>
                <span
                  className="cursor-pointer text-xs text-muted-foreground"
                  onClick={() => startEdit(m)}
                >
                  {m.target_date
                    ? new Date(m.target_date).toLocaleDateString()
                    : "No date"}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New milestone title"
            className="h-8"
          />
          <Button size="sm" onClick={addMilestone} disabled={!newTitle.trim()}>
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAdding(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setAdding(true)}>
            + Milestone
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowSplit(true)}>
            Auto Split
          </Button>
        </div>
      )}
      {showSplit && (
        <AutoSplitModal
          onClose={() => setShowSplit(false)}
          onSubmit={(count, date) => {
            handleSplit(count, date);
            setShowSplit(false);
          }}
        />
      )}
    </div>
  );
}

export default MilestonesPanel;

