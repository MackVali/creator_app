"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getCatsForUser } from "@/lib/data/cats";
import { MAX_MONUMENTS } from "@/lib/monuments/constants";
import type { CatRow } from "@/lib/types/cat";
import type { SkillRow } from "@/lib/types/skill";

const UNCATEGORIZED_GROUP_ID = "__uncategorized__";
const UNCATEGORIZED_GROUP_LABEL = "Uncategorized";

type MonumentCreationFormProps = {
  onCreate?: () => void;
  submitLabel?: string;
  submitButtonClassName?: string;
  variant?: "default" | "dialog";
};

type SkillGroup = {
  id: string;
  label: string;
  skills: SkillRow[];
};

export function MonumentCreationForm({
  onCreate,
  submitLabel = "Create monument",
  submitButtonClassName,
  variant = "default",
}: MonumentCreationFormProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🏛️");
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
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

    const fetchDashboardDefaults = async () => {
      try {
        await fetch("/api/dashboard", { cache: "no-store" });
      } catch {
        // ignore - seeding is best-effort
      }
    };

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
            setSkills([]);
          }
          return;
        }

        const fetchData = async () =>
          Promise.all([
            supabase
              .from("skills")
              .select("id, name, icon, cat_id")
              .eq("user_id", user.id)
              .order("name", { ascending: true }),
            getCatsForUser(user.id, supabase),
          ]);

        let [skillsResult, categoriesData] = await fetchData();
        const shouldSeedDefaults =
          (skillsResult.data?.length ?? 0) === 0 && categoriesData.length === 0;
        if (shouldSeedDefaults) {
          await fetchDashboardDefaults();
          [skillsResult, categoriesData] = await fetchData();
        }

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase not configured");
      return;
    }

    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { count, error: countError } = await supabase
      .from("monuments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) {
      console.error("Failed to count monuments", countError);
      setError("Unable to verify your monuments right now.");
      setLoading(false);
      return;
    }

    if ((count ?? 0) >= MAX_MONUMENTS) {
      setError(`You’ve reached the Monument cap of ${MAX_MONUMENTS}.`);
      setLoading(false);
      return;
    }

    const { data: createdMonument, error: insertError } = await supabase
      .from("monuments")
      .insert({ title, emoji, user_id: user.id })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    if (createdMonument && skills.length > 0) {
      const relationPayload = skills.map((skillId) => ({
        monument_id: createdMonument.id,
        skill_id: skillId,
        user_id: user.id,
      }));
      const { error: relationError } = await supabase
        .from("monument_skills")
        .upsert(relationPayload, { onConflict: "monument_id,skill_id" });

      if (relationError) {
        console.error("Failed to link skills to monument", relationError);
        setError("Monument saved, but we couldn't link all skills.");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    if (onCreate) {
      onCreate();
      return;
    }

    router.push("/monuments");
    router.refresh();
  }

  const isDialogVariant = variant === "dialog";
  const labelClassName = isDialogVariant
    ? "text-[10px] font-semibold uppercase tracking-[0.26em] text-white/48"
    : "text-xs font-semibold uppercase tracking-[0.2em] text-white/70";
  const fieldClassName = isDialogVariant
    ? "border-white/10 bg-black/25 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_10px_22px_-18px_rgba(0,0,0,0.9)] outline-none transition placeholder:text-white/34 focus-visible:border-white/28 focus-visible:ring-2 focus-visible:ring-white/12"
    : "";

  return (
    <form onSubmit={handleSubmit} className={isDialogVariant ? "space-y-4" : "space-y-6"}>
      <div className={isDialogVariant ? "flex flex-row gap-2.5" : "flex flex-row gap-3"}>
        <div
          className={
            isDialogVariant
              ? "flex min-w-[64px] basis-[18%] flex-col gap-1.5"
              : "min-w-[72px] basis-[20%] flex flex-col gap-2"
          }
        >
          <Label htmlFor="monument-emoji" className={labelClassName}>
            Icon
          </Label>
          <Input
            id="monument-emoji"
            value={emoji}
            onChange={(event) => setEmoji(event.target.value)}
            maxLength={2}
            className={cn(
              isDialogVariant
                ? "h-12 rounded-[16px] px-2 text-center text-2xl"
                : "h-14 rounded-2xl border-white/10 bg-white/[0.05] text-center text-3xl",
              fieldClassName,
            )}
          />
        </div>
        <div
          className={
            isDialogVariant
              ? "flex min-w-0 flex-1 basis-[82%] flex-col gap-1.5"
              : "basis-[80%] flex-1 min-w-0 flex flex-col gap-2"
          }
        >
          <Label htmlFor="monument-title" className={labelClassName}>
            Title
          </Label>
          <Input
            id="monument-title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Name your monument"
            className={cn(
              isDialogVariant
                ? "h-12 rounded-[16px] text-[0.95rem] font-medium"
                : "h-12 rounded-xl border-white/10 bg-white/[0.05] text-white placeholder:text-white/40",
              fieldClassName,
            )}
          />
        </div>
      </div>

      <div className={isDialogVariant ? "space-y-2.5" : "space-y-3"}>
        <Label className={labelClassName}>
          Related skills
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex items-center justify-between gap-3 border font-medium transition",
                isDialogVariant
                  ? "h-10 w-full rounded-[14px] border-white/10 bg-white/[0.045] px-3 text-sm text-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-white/22 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/18"
                  : "rounded-full border-white/20 bg-white/[0.04] px-4 py-2 text-sm text-white/80 hover:border-white/40 hover:text-white",
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
            className={cn(
              "z-[230] border-white/10 text-white",
              isDialogVariant
                ? "max-h-[min(320px,calc(100dvh-220px))] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[260px] max-w-[calc(100vw-32px)] rounded-[16px] bg-[#07080d]/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
                : "min-w-[260px] bg-[#0b101b]",
            )}
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
                    "border-t border-white/5 text-sm text-white",
                    isDialogVariant ? "space-y-1.5 px-2 pb-2 pt-2.5" : "space-y-2 px-3 pb-2 pt-3",
                    index === 0 ? "border-t-0 pt-0" : "",
                  )}
                >
                  <p
                    className={
                      isDialogVariant
                        ? "px-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-white/42"
                        : "text-xs font-semibold uppercase tracking-[0.3em] text-white/50"
                    }
                  >
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-1">
                    {group.skills.map((skill) => (
                      <DropdownMenuCheckboxItem
                        key={skill.id}
                        checked={skills.includes(skill.id)}
                        onCheckedChange={() => toggleSkill(skill.id)}
                        className={cn(
                          "gap-3 text-sm text-white",
                          isDialogVariant
                            ? "rounded-[10px] text-white/78 focus:bg-white/[0.07] focus:text-white"
                            : "",
                        )}
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
          <div className={isDialogVariant ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-2"}>
            {skills.map((skillId) => {
              const skill = availableSkills.find((item) => item.id === skillId);
              if (!skill) return null;
              return (
                <span
                  key={skillId}
                  className={
                    isDialogVariant
                      ? "rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium text-white/68"
                      : "rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs text-white/80"
                  }
                >
                  {skill.name}
                </span>
              );
            })}
          </div>
        ) : (
          <p
            className={
              isDialogVariant
                ? "text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36"
                : "text-xs font-semibold uppercase tracking-[0.15em] text-red-400"
            }
          >
            IMPORTANT
          </p>
        )}
      </div>

      {error ? (
        <div
          className={
            isDialogVariant
              ? "rounded-[14px] border border-red-400/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-100"
              : "rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          }
        >
          {error}
        </div>
      ) : null}

      <div
        className={
          isDialogVariant
            ? "border-t border-white/10 pt-3"
            : "flex justify-end"
        }
      >
        <Button
          type="submit"
          disabled={loading}
          className={
            submitButtonClassName ??
            (isDialogVariant
              ? "h-11 w-full rounded-[14px] border border-white/12 bg-[linear-gradient(145deg,rgba(39,39,42,0.88),rgba(9,9,11,0.94))] text-sm font-semibold text-white shadow-[0_18px_36px_-24px_rgba(0,0,0,0.95),0_8px_22px_-18px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:border-white/20 hover:bg-[linear-gradient(145deg,rgba(63,63,70,0.9),rgba(18,18,21,0.96))] hover:text-white active:translate-y-px active:bg-[linear-gradient(145deg,rgba(24,24,27,0.95),rgba(3,3,5,0.98))] focus-visible:ring-white/35 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-zinc-900/45 disabled:text-white/42 disabled:shadow-none"
              : "h-12 rounded-xl bg-gradient-to-r from-slate-600 to-slate-400 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed")
          }
        >
          {loading ? "Creating..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export default MonumentCreationForm;
