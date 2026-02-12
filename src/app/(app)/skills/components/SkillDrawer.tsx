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
  sort_order?: number | null;
  created_at?: string | null;
  is_default?: boolean | null;
  is_locked?: boolean | null;
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
  const [emoji, setEmoji] = useState("");
  const [cat, setCat] = useState("");
  const [newCat, setNewCat] = useState("");
  const [monument, setMonument] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const editing = Boolean(initialSkill);

  useEffect(() => {
    if (initialSkill) {
      setName(initialSkill.name);
      setEmoji(initialSkill.icon ?? "");
      setCat(initialSkill.cat_id || "");
      setMonument(initialSkill.monument_id || "");
    } else {
      setName("");
      setEmoji("");
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-3 top-4 h-[calc(100%-2rem)] w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-black/95 shadow-[0_35px_90px_-60px_rgba(0,0,0,0.8)] sm:right-4 sm:top-6 sm:h-[calc(100%-3rem)] sm:w-[360px]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-white/50">
              {editing ? "Edit skill" : "Create skill"}
            </p>
            <h2 className="text-base font-semibold text-white sm:text-lg">
              {editing ? "Refine your skill" : "Add a new skill"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white sm:px-3 sm:text-xs"
          >
            Close
          </button>
        </div>
        <form onSubmit={submit} className="flex h-full flex-col gap-3 overflow-y-auto px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,4fr)] gap-3">
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                Emoji
              </label>
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder=""
                className="h-9 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-[11px] text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none sm:h-11 sm:px-4 sm:text-sm"
              />
            </div>
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                Skill name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Creative direction"
                className="h-9 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-[11px] text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none sm:h-11 sm:px-4 sm:text-sm"
              />
            </div>
          </div>
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
              Monument
            </label>
            <select
              value={monument}
              onChange={(e) => setMonument(e.target.value)}
              className="h-9 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-[11px] text-white/80 focus:border-white/30 focus:outline-none sm:h-11 sm:px-4 sm:text-sm"
            >
              <option value="">Select...</option>
              {monuments.map((m) => (
                <option key={m.id} value={m.id} className="bg-black text-white">
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
              Category
            </label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-9 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-[11px] text-white/80 focus:border-white/30 focus:outline-none sm:h-11 sm:px-4 sm:text-sm"
            >
              <option value="">Select...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-black text-white">
                  {c.name}
                </option>
              ))}
              <option value="new" className="bg-black text-white">
                + New Category
              </option>
            </select>
            {cat === "new" && (
              <input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="New category"
                className="h-9 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-[11px] text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none sm:h-11 sm:px-4 sm:text-sm"
              />
            )}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/10 pt-3 sm:pt-4">
            <p className="text-[11px] text-white/50 sm:text-xs">
              {editing ? "Changes apply instantly." : "Ready to start tracking."}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-full border border-white/15 bg-white/5 px-3 text-[11px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white sm:h-10 sm:px-4 sm:text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="h-8 rounded-full bg-white px-4 text-[11px] font-semibold text-slate-900 shadow-[0_18px_40px_-20px_rgba(148,163,184,0.85)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:px-5 sm:text-xs"
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
