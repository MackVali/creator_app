"use client";

import { useState, useEffect } from "react";
import type { Goal } from "../types";
import { getSupabaseBrowser } from "@/lib/supabase";

interface GoalDrawerProps {
  open: boolean;
  onClose(): void;
  goal?: Goal;
  onSave(goal: Goal): void;
}

export function GoalDrawer({ open, onClose, goal, onSave }: GoalDrawerProps) {
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
    if (!open && !goal) {
      setTitle("");
      setEmoji("");
      setDueDate("");
      setPriority("Low");
    }
  }, [goal, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    if (goal) {
      await supabase
        .from("goals")
        .update({
          name: title,
          emoji,
          due_date: dueDate || null,
          priority,
        })
        .eq("id", goal.id);

      onSave({ ...goal, title, emoji, dueDate: dueDate || undefined, priority });
    } else {
      const { data } = await supabase
        .from("goals")
        .insert({
          name: title,
          emoji,
          due_date: dueDate || null,
          priority,
          active: true,
          status: "Active",
        })
        .select("id, name, emoji, due_date, priority, active, status, created_at")
        .single();

      const newGoal: Goal = {
        id: data.id,
        title: data.name,
        emoji: data.emoji || "",
        dueDate: data.due_date || undefined,
        priority: data.priority as Goal["priority"],
        progress: 0,
        status: data.status || "Active",
        active: data.active ?? true,
        updatedAt: data.created_at,
        projects: [],
      };
      onSave(newGoal);
      setTitle("");
      setEmoji("");
      setDueDate("");
      setPriority("Low");
    }

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
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded bg-gray-700"
            >
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
