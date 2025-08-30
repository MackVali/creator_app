"use client";

import { useState, useEffect } from "react";
import type { Goal } from "../types";
import { getSupabaseBrowser } from "@/lib/supabase";

interface CreateGoalDrawerProps {
  open: boolean;
  onClose(): void;
  onAdd?(goal: Goal): void;
  onUpdate?(goal: Goal): void;
  goal?: Goal;
}

export function CreateGoalDrawer({
  open,
  onClose,
  onAdd,
  onUpdate,
  goal,
}: CreateGoalDrawerProps) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Goal["priority"]>("Low");

  useEffect(() => {
    if (goal && open) {
      setTitle(goal.title);
      setEmoji(goal.emoji || "");
      setDueDate(goal.dueDate || "");
      setPriority(goal.priority);
    }
  }, [goal, open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    if (goal && onUpdate) {
      const supabase = getSupabaseBrowser();
      if (supabase) {
        const updates: Record<string, unknown> = {
          name: title,
          priority,
          emoji: emoji || null,
          due_date: dueDate || null,
        };
        await supabase.from("goals").update(updates).eq("id", goal.id);
      }
      const updated: Goal = {
        ...goal,
        title,
        emoji,
        dueDate: dueDate || undefined,
        priority,
        updatedAt: new Date().toISOString(),
      };
      onUpdate(updated);
    } else if (onAdd) {
      const newGoal: Goal = {
        id: Date.now().toString(),
        title,
        emoji,
        dueDate: dueDate || undefined,
        priority,
        progress: 0,
        status: "Active",
        active: true,
        updatedAt: new Date().toISOString(),
        projects: [],
      };
      onAdd(newGoal);
    }
    setTitle("");
    setEmoji("");
    setDueDate("");
    setPriority("Low");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-80 bg-gray-800 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">
          {goal ? "Edit Goal" : "Create Goal"}
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 rounded bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Emoji</label>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-full px-3 py-2 rounded bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Goal["priority"])}
              className="w-full px-3 py-2 rounded bg-gray-700"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded bg-gray-700">
              Cancel
            </button>
            <button type="submit" className="px-3 py-2 rounded bg-blue-600">
              {goal ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
