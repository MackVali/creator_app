"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getCatsForUser } from "@/lib/data/cats";
import type { CatRow } from "@/lib/types/cat";
import type { SkillRow } from "@/lib/types/skill";

const UNCATEGORIZED_GROUP_ID = "__uncategorized__";
const UNCATEGORIZED_GROUP_LABEL = "Uncategorized";

type SkillGroup = {
  id: string;
  label: string;
  skills: SkillRow[];
};

type MonumentEditDialogProps = {
  open: boolean;
  monumentId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

export function MonumentEditDialog({
  open,
  monumentId,
  onOpenChange,
  onSaved,
}: MonumentEditDialogProps) {
  if (!monumentId) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[210] bg-black/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[220] w-[min(90vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#05070c] p-5 shadow-[0_30px_60px_rgba(0,0,0,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
                Monument
              </p>
              <h2 className="text-xl font-semibold text-white">Edit monument</h2>
              <p className="text-xs text-white/70">
                Tune the icon, name, and related skills in one place.
              </p>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-full border border-white/15 bg-white/5 p-2 text-white/70 transition hover:text-white"
                aria-label="Close edit monument modal"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_45px_-25px_rgba(15,23,42,0.85)]">
            <ProtectedRoute>
              <MonumentEditForm monumentId={monumentId} onSaved={onSaved} />
            </ProtectedRoute>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type MonumentEditFormProps = {
  monumentId: string;
  onSaved?: () => void;
};

export function MonumentEditForm({ monumentId, onSaved }: MonumentEditFormProps) {
  const supabase = getSupabaseBrowser();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🏛️");
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableSkills, setAvailableSkills] = useState<SkillRow[]>([]);
  const [categories, setCategories] = useState<CatRow[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setSkillsLoading(false);
      setAvailableSkills([]);
      return;
    }

    let cancelled = false;

    async function loadSkills() {
      setSkillsLoading(true);
      setSkillsError(null);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          if (!cancelled) {
            setAvailableSkills([]);
            setCategories([]);
            setSkills([]);
          }
          return;
        }

        const [skillsResult, categoriesData] = await Promise.all([
          supabase
            .from("skills")
            .select("id, name, icon, cat_id")
            .eq("user_id", user.id)
            .order("name", { ascending: true }),
          getCatsForUser(user.id, supabase),
        ]);

        if (skillsResult.error) throw skillsResult.error;

        if (!cancelled) {
          const safeSkills = (skillsResult.data ?? []) as SkillRow[];
          setAvailableSkills(safeSkills);
          setCategories(categoriesData);
          setSkills((prev) =>
            prev.filter((skillId) => safeSkills.some((skill) => skill.id === skillId)),
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load skills", err);
          setAvailableSkills([]);
          setCategories([]);
          setSkillsError("Unable to load your skills right now.");
        }
      } finally {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      }
    }

    loadSkills();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setLoading(true);

    async function loadMonument() {
      try {
        const [monumentResult, skillRelations] = await Promise.all([
          supabase
            .from("monuments")
            .select("title,emoji")
            .eq("id", monumentId)
            .single(),
          supabase
            .from("monument_skills")
            .select("skill_id")
            .eq("monument_id", monumentId),
        ]);

        if (cancelled) return;

        if (monumentResult.error) {
          throw monumentResult.error;
        }

        setTitle(monumentResult.data?.title ?? "");
        setEmoji(monumentResult.data?.emoji ?? "🏛️");
        setSkills(
          (skillRelations.data ?? [])
            .map((row) => row.skill_id)
            .filter(Boolean) as string[],
        );
      } catch (err) {
        console.error("Failed to load monument", err);
        if (!cancelled) {
          setError("Unable to load monument details right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMonument();

    return () => {
      cancelled = true;
    };
  }, [supabase, monumentId]);

  const toggleSkill = (value: string) => {
    setSkills((prev) =>
      prev.includes(value) ? prev.filter((skill) => skill !== value) : [...prev, value],
    );
  };

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => {
      map.set(category.id, category.name?.trim() ?? "");
    });
    return map;
  }, [categories]);

  const groupedAvailableSkills = useMemo(() => {
    const groups = new Map<string, SkillGroup>();

    availableSkills.forEach((skill) => {
      const groupId = skill.cat_id ?? UNCATEGORIZED_GROUP_ID;
      const label =
        groupId === UNCATEGORIZED_GROUP_ID
          ? UNCATEGORIZED_GROUP_LABEL
          : categoryLookup.get(groupId) || UNCATEGORIZED_GROUP_LABEL;
      const existing = groups.get(groupId);
      if (existing) {
        existing.skills.push(skill);
      } else {
        groups.set(groupId, { id: groupId, label, skills: [skill] });
      }
    });

    const ordered: SkillGroup[] = [];

    categories.forEach((category) => {
      const group = groups.get(category.id);
      if (group) {
        group.label = category.name?.trim() || group.label;
        ordered.push({ id: category.id, label: group.label, skills: group.skills });
        groups.delete(category.id);
      }
    });

    const uncategorizedGroup = groups.get(UNCATEGORIZED_GROUP_ID);
    if (uncategorizedGroup) {
      ordered.push({
        id: UNCATEGORIZED_GROUP_ID,
        label: UNCATEGORIZED_GROUP_LABEL,
        skills: uncategorizedGroup.skills,
      });
      groups.delete(UNCATEGORIZED_GROUP_ID);
    }

    for (const [groupId, group] of groups) {
      ordered.push({ id: groupId, label: group.label, skills: group.skills });
    }

    return ordered;
  }, [availableSkills, categories, categoryLookup]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase not configured");
      return;
    }

    setSaving(true);
    setError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      setError(userError.message);
      setSaving(false);
      return;
    }

    if (!user) {
      setError("Not authenticated");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("monuments")
      .update({ title, emoji })
      .eq("id", monumentId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("monument_skills")
      .delete()
      .eq("monument_id", monumentId);

    if (deleteError) {
      setError("Could not update skill links");
      setSaving(false);
      return;
    }

    if (skills.length > 0) {
      const relationPayload = skills.map((skillId) => ({
        monument_id: monumentId,
        skill_id: skillId,
        user_id: user.id,
      }));

      const { error: relationError } = await supabase
        .from("monument_skills")
        .insert(relationPayload);

      if (relationError) {
        setError("Monument saved, but failed to update skills");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved?.();
  };

  if (loading) {
    return <p className="text-sm text-white/70">Loading monument…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-row gap-3">
        <div className="min-w-[72px] basis-[20%] flex flex-col gap-2">
          <Label
            htmlFor="monument-emoji"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
          >
            Icon
          </Label>
          <Input
            id="monument-emoji"
            value={emoji}
            onChange={(event) => setEmoji(event.target.value)}
            maxLength={2}
            className="h-14 rounded-2xl border-white/10 bg-white/[0.05] text-center text-3xl"
          />
        </div>
        <div className="basis-[80%] flex-1 min-w-0 flex flex-col gap-2">
          <Label
            htmlFor="monument-title"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
          >
            Title
          </Label>
          <Input
            id="monument-title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Name your monument"
            className="h-12 rounded-xl border-white/10 bg-white/[0.05] text-white placeholder:text-white/40"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
          Related skills
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex items-center justify-between gap-3 rounded-full border px-4 py-2 text-sm font-medium transition",
                "border-white/20 bg-white/[0.04] text-white/80 hover:border-white/40 hover:text-white",
              )}
            >
              <span>
                {skills.length > 0
                  ? `${skills.length} skill${skills.length > 1 ? "s" : ""} selected`
                  : "Select related skills"}
              </span>
              <ChevronDown className="size-4 text-white/70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-[260px] border-white/10 bg-[#0b101b] text-white z-[230]"
          >
            {skillsLoading ? (
              <DropdownMenuItem disabled className="text-white/60">
                Loading skills…
              </DropdownMenuItem>
            ) : skillsError ? (
              <DropdownMenuItem disabled className="text-rose-200">
                {skillsError}
              </DropdownMenuItem>
            ) : availableSkills.length === 0 ? (
              <DropdownMenuItem disabled className="text-white/60">
                No skills found yet.
              </DropdownMenuItem>
            ) : (
              groupedAvailableSkills.map((group, index) => (
                <div
                  key={group.id}
                  className={cn(
                    "space-y-2 border-t border-white/5 px-3 pb-2 pt-3 text-sm text-white",
                    index === 0 ? "border-t-0 pt-0" : "",
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-1">
                    {group.skills.map((skill) => (
                      <DropdownMenuCheckboxItem
                        key={skill.id}
                        checked={skills.includes(skill.id)}
                        onCheckedChange={() => toggleSkill(skill.id)}
                        className="gap-3 text-sm text-white"
                      >
                        <span className="text-base">{skill.icon ?? "•"}</span>
                        <span>{skill.name}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                </div>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {skills.map((skillId) => {
              const skill = availableSkills.find((item) => item.id === skillId);
              if (!skill) return null;
              return (
                <span
                  key={skillId}
                  className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs text-white/80"
                >
                  {skill.name}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-red-400">
            IMPORTANT
          </p>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="h-12 rounded-xl bg-gradient-to-r from-slate-600 to-slate-400 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save monument"}
        </Button>
      </div>
    </form>
  );
}

export default MonumentEditDialog;
