"use client";

import { useState, useEffect } from "react";
import type { Goal } from "../types";
import { getSupabaseBrowser } from "@/lib/supabase";

interface GoalDrawerProps {
  open: boolean;
  onClose(): void;
  /** Callback when creating a new goal */
  onAdd(goal: Goal): void | Promise<void>;
  /** Existing goal to edit */
  initialGoal?: Goal | null;
  /** Callback when updating an existing goal */
  onUpdate?(goal: Goal): void | Promise<void>;
}

export function GoalDrawer({
  open,
  onClose,
  onAdd,
  initialGoal,
  onUpdate,
}: GoalDrawerProps) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [priority, setPriority] = useState<Goal["priority"]>("Low");
  const [monumentId, setMonumentId] = useState("");
  const [monuments, setMonuments] = useState<{ id: string; title: string }[]>([]);
  const [skillId, setSkillId] = useState("");
  const [skills, setSkills] = useState<{ id: string; name: string }[]>([]);

  const editing = Boolean(initialGoal);

  useEffect(() => {
    if (initialGoal) {
      setTitle(initialGoal.title);
      setEmoji(initialGoal.emoji || "");
      setPriority(initialGoal.priority);
      setMonumentId(initialGoal.monumentId || "");
      setSkillId(initialGoal.skillId || "");
    } else {
      setTitle("");
      setEmoji("");
      setPriority("Low");
      setMonumentId("");
      setSkillId("");
    }
  }, [initialGoal]);

  useEffect(() => {
    if (!open) return;
    const loadRefs = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      await supabase.auth.getSession();
      const [monRes, skillRes] = await Promise.all([
        supabase
          .from("monuments")
          .select("id,title")
          .order("created_at", { ascending: false }),
        supabase
          .from("skills")
          .select("id,name")
          .order("created_at", { ascending: false }),
      ]);
      if (monRes.error) {
        console.error("Error fetching monuments:", monRes.error);
      } else {
        setMonuments(monRes.data ?? []);
      }
      if (skillRes.error) {
        console.error("Error fetching skills:", skillRes.error);
      } else {
        setSkills(skillRes.data ?? []);
      }
    };
    loadRefs();
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    const base: Goal = {
      id: initialGoal?.id || Date.now().toString(),
      title,
      emoji,
      priority,
      monumentId: monumentId || null,
      skillId: skillId || null,
      progress: initialGoal?.progress || 0,
      status: initialGoal?.status || "Active",
      updatedAt: new Date().toISOString(),
      projects: initialGoal?.projects || [],
      active: initialGoal?.active ?? true,
    };

    if (editing && onUpdate) {
      onUpdate(base);
    } else {
      onAdd(base);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-80 bg-gray-800 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Goal" : "Create Goal"}</h2>
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
            <label className="block text-sm mb-1">Monument</label>
            <select
              value={monumentId}
              onChange={(e) => setMonumentId(e.target.value)}
              className="w-full px-3 py-2 rounded bg-gray-700"
            >
              <option value="">None</option>
              {monuments.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Skill</label>
            <select
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              className="w-full px-3 py-2 rounded bg-gray-700"
            >
              <option value="">None</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
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
              {editing ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
