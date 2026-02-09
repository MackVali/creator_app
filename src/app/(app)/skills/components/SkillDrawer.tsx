"use client";

import { useState, useEffect } from "react";

export interface Skill {
  id: string;
  name: string;
  icon: string;
  level: number;
  progress: number;
  cat_id: string | null;
  monument_id: string | null;
  created_at?: string | null;
}

export interface Category {
  id: string;
  name: string;
}

interface SkillDrawerProps {
  open: boolean;
  onClose(): void;
  onAdd(skill: Skill): Promise<void>;
  categories: Category[];
  monuments: { id: string; title: string }[];
  onAddCategory(name: string): Promise<Category | null>;
  initialSkill?: Skill | null;
  onUpdate?(skill: Skill): Promise<void>;
}

export function SkillDrawer({
  open,
  onClose,
  onAdd,
  categories,
  monuments,
  onAddCategory,
  initialSkill,
  onUpdate,
}: SkillDrawerProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("💡");
  const [cat, setCat] = useState("");
  const [newCat, setNewCat] = useState("");
  const [monument, setMonument] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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
    if (isSaving) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    let catId = cat;
    if (cat === "new" && newCat.trim()) {
      const saved = await onAddCategory(newCat.trim());
      catId = saved?.id || "";
    }

    const base: Skill = {
      id: initialSkill?.id || "local-" + Date.now(),
      name: trimmed,
      icon: emoji,
      level: initialSkill?.level ?? 1,
      progress: initialSkill?.progress ?? 0,
      cat_id: catId || null,
      monument_id: monument || null,
      created_at: initialSkill?.created_at ?? new Date().toISOString(),
    };

    try {
      setIsSaving(true);
      if (editing && onUpdate) {
        await onUpdate(base);
      } else {
        await onAdd(base);
      }
      onClose();
    } catch (err) {
      console.error("Failed to save skill:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-4 top-6 h-[calc(100%-3rem)] w-[360px] overflow-hidden rounded-3xl border border-white/10 bg-[#0c0f1a]/95 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.9)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-white/50">
              {editing ? "Edit skill" : "Create skill"}
            </p>
            <h2 className="text-lg font-semibold text-white">
              {editing ? "Refine your skill" : "Add a new skill"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Close
          </button>
        </div>
        <form onSubmit={submit} className="flex h-full flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
              Skill name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Creative direction"
              className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                Emoji
              </label>
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
              />
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                Monument
              </label>
              <select
                value={monument}
                onChange={(e) => setMonument(e.target.value)}
                className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white/80 focus:border-white/30 focus:outline-none"
              >
                <option value="">Select...</option>
                {monuments.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
              Category
            </label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white/80 focus:border-white/30 focus:outline-none"
            >
              <option value="">Select...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                  {c.name}
                </option>
              ))}
              <option value="new" className="bg-slate-900 text-white">
                + New Category
              </option>
            </select>
            {cat === "new" && (
              <input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="New category"
                className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
              />
            )}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/10 pt-4">
            <p className="text-xs text-white/50">
              {editing ? "Changes apply instantly." : "Ready to start tracking."}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-full border border-white/15 bg-white/5 px-4 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="h-10 rounded-full bg-white px-5 text-xs font-semibold text-slate-900 shadow-[0_18px_40px_-20px_rgba(148,163,184,0.85)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Saving..." : editing ? "Save skill" : "Add skill"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
