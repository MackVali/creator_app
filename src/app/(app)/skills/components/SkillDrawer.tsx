"use client";

import { useState, useEffect } from "react";
import type { Monument } from "@/lib/queries/monuments";

export type { Monument };

export interface Skill {
  id: string;
  name: string;
  icon: string;
  level: number;
  progress: number;
  cat_id: string | null;
  monument_id: string;
  created_at?: string | null;
}

export interface Category {
  id: string;
  name: string;
}

interface SkillDrawerProps {
  open: boolean;
  onClose(): void;
  onAdd(skill: Skill): Promise<void> | void;
  categories: Category[];
  monuments: Monument[];
  onAddCategory(cat: Category): void;
  initialSkill?: Skill | null;
  onUpdate?(skill: Skill): Promise<void> | void;
}

export function SkillDrawer({
  open,
  onClose,
  onAdd,
  categories,
  onAddCategory,
  initialSkill,
  onUpdate,
}: SkillDrawerProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("💡");
  const [cat, setCat] = useState("");
  const [newCat, setNewCat] = useState("");
  const [monument, setMonument] = useState("");

  const editing = Boolean(initialSkill);

  useEffect(() => {
    if (initialSkill) {
      setName(initialSkill.name);
      setEmoji(initialSkill.icon || "💡");
      setCat(initialSkill.cat_id || "");
      setMonument(initialSkill.monument_id || "");
    } else {
      setName("");
      setEmoji("💡");
      setCat("");
      setNewCat("");
      setMonument("");
    }
  }, [initialSkill, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !monument) return;

    let catId = cat;
    if (cat === "new" && newCat.trim()) {
      const created = { id: "local-" + Date.now(), name: newCat.trim() };
      catId = created.id;
      onAddCategory(created);
    }

    const base: Skill = {
      id: initialSkill?.id || "local-" + Date.now(),
      name: trimmed,
      icon: emoji,
      level: initialSkill?.level ?? 1,
      progress: initialSkill?.progress ?? 0,
      cat_id: catId || null,
      monument_id: monument,
      created_at: initialSkill?.created_at ?? new Date().toISOString(),
    };

    if (editing && onUpdate) {
      await onUpdate(base);
    } else {
      await onAdd(base);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-80 bg-gray-800 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Skill" : "Add Skill"}</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
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
            <label className="block text-sm mb-1">Category</label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full px-3 py-2 rounded bg-gray-700"
            >
              <option value="">Select...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="new">+ New Category</option>
            </select>
            {cat === "new" && (
              <input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="New category"
                className="w-full px-3 py-2 rounded bg-gray-700 mt-2"
              />
            )}
          </div>
          <div>
            <label className="block text-sm mb-1">Monument *</label>
            <select
              value={monument}
              onChange={(e) => setMonument(e.target.value)}
              required
              className="w-full px-3 py-2 rounded bg-gray-700"
            >
              <option value="">Select...</option>
              {monuments.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
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
            <button
              type="submit"
              disabled={!name.trim() || !monument}
              className="px-3 py-2 rounded bg-blue-600 disabled:opacity-50"
            >
              {editing ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

