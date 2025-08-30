"use client";

import { useEffect, useState } from "react";
import type { Goal } from "../types";
import { updateGoal } from "@/lib/queries/goals";

interface EditGoalDrawerProps {
  open: boolean;
  goal: Goal | null;
  onClose(): void;
  onSave(goal: Goal): void;
}

export function EditGoalDrawer({ open, goal, onClose, onSave }: EditGoalDrawerProps) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Goal["priority"]>("Low");

  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setEmoji(goal.emoji || "");
      setDueDate(goal.dueDate || "");
      setPriority(goal.priority);
    }
  }, [goal]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal) return;
    const updated: Goal = {
      ...goal,
      title,
      emoji,
      dueDate: dueDate || undefined,
      priority,
    };
    onSave(updated);
    try {
      await updateGoal(goal.id, {
        name: title,
        emoji,
        due_date: dueDate || null,
        priority,
      });
    } catch (err) {
      console.error("Failed to update goal", err);
    }
    onClose();
  };

  if (!open || !goal) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-80 bg-gray-800 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Edit Goal</h2>
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
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
