"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Plus, Search, Unlink, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AreaSkill = {
  id: string;
  name: string;
  icon: string | null;
};

type AreaSkillRelationsProps = {
  areaId: string;
  areaLabel: string;
};

function normalizeSkillName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Untitled skill";
}

function normalizeSkill(row: unknown): AreaSkill | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) return null;

  return {
    id,
    name: normalizeSkillName(
      typeof record.name === "string"
        ? record.name
        : typeof record.Title === "string"
          ? record.Title
          : null
    ),
    icon:
      typeof record.icon === "string" && record.icon.trim().length > 0
        ? record.icon.trim()
        : null,
  };
}

export function AreaSkillRelations({
  areaId,
  areaLabel,
}: AreaSkillRelationsProps) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [relatedSkills, setRelatedSkills] = useState<AreaSkill[]>([]);
  const [allSkills, setAllSkills] = useState<AreaSkill[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relatedSkillIds = useMemo(
    () => new Set(relatedSkills.map((skill) => skill.id)),
    [relatedSkills]
  );

  const availableSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allSkills
      .filter((skill) => !relatedSkillIds.has(skill.id))
      .filter((skill) =>
        normalizedQuery ? skill.name.toLowerCase().includes(normalizedQuery) : true
      )
      .slice(0, 6);
  }, [allSkills, query, relatedSkillIds]);

  const loadSkills = useCallback(async () => {
    if (!supabase || !areaId) {
      setIsLoading(false);
      setRelatedSkills([]);
      setAllSkills([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      const nextUserId = user?.id ?? null;
      setUserId(nextUserId);
      if (!nextUserId) {
        setRelatedSkills([]);
        setAllSkills([]);
        return;
      }

      const db = supabase as any;
      const [skillsResult, relationsResult] = await Promise.all([
        db
          .from("skills")
          .select("id,name,icon")
          .eq("user_id", nextUserId)
          .order("name", { ascending: true }),
        db
          .from("area_skills")
          .select("skill_id")
          .eq("user_id", nextUserId)
          .eq("area_id", areaId),
      ]);

      if (skillsResult.error) throw skillsResult.error;
      if (relationsResult.error) throw relationsResult.error;

      const skills = ((skillsResult.data ?? []) as unknown[])
        .map(normalizeSkill)
        .filter((skill): skill is AreaSkill => Boolean(skill));
      const relationIds = new Set(
        ((relationsResult.data ?? []) as Array<{ skill_id?: unknown }>)
          .map((row) =>
            row && typeof row.skill_id === "string" ? row.skill_id : null
          )
          .filter((skillId): skillId is string => Boolean(skillId))
      );

      setAllSkills(skills);
      setRelatedSkills(skills.filter((skill) => relationIds.has(skill.id)));
    } catch (loadError) {
      console.error("Failed to load area skill relations", { loadError, areaId });
      setError("Unable to load related skills.");
      setRelatedSkills([]);
      setAllSkills([]);
    } finally {
      setIsLoading(false);
    }
  }, [areaId, supabase]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  async function linkSkill(skill: AreaSkill) {
    if (!supabase || !userId || isSaving) return;
    setIsSaving(true);
    setError(null);
    setRelatedSkills((current) =>
      current.some((item) => item.id === skill.id) ? current : [...current, skill]
    );

    const db = supabase as any;
    const { error: upsertError } = await db.from("area_skills").upsert(
      {
        area_id: areaId,
        skill_id: skill.id,
        user_id: userId,
      },
      { onConflict: "area_id,skill_id" }
    );

    if (upsertError) {
      console.error("Failed to link area skill", { upsertError, areaId, skill });
      setError("Unable to link that skill.");
      await loadSkills();
    }

    setIsSaving(false);
  }

  async function createAndLinkSkill() {
    const name = query.trim();
    if (!supabase || !userId || !name || isSaving) return;

    setIsSaving(true);
    setError(null);

    const db = supabase as any;
    const { data, error: insertError } = await db
      .from("skills")
      .insert({
        user_id: userId,
        name,
        icon: name.charAt(0).toUpperCase(),
      })
      .select("id,name,icon")
      .single();

    if (insertError) {
      console.error("Failed to create area skill", { insertError, areaId, name });
      setError("Unable to create that skill.");
      setIsSaving(false);
      return;
    }

    const skill = normalizeSkill(data);
    if (skill) {
      setAllSkills((current) => [...current, skill].sort((a, b) => a.name.localeCompare(b.name)));
      await linkSkill(skill);
      setQuery("");
    }

    setIsSaving(false);
  }

  async function unlinkSkill(skillId: string) {
    if (!supabase || !userId || isSaving) return;
    const previous = relatedSkills;
    setIsSaving(true);
    setError(null);
    setRelatedSkills((current) => current.filter((skill) => skill.id !== skillId));

    const db = supabase as any;
    const { error: deleteError } = await db
      .from("area_skills")
      .delete()
      .eq("user_id", userId)
      .eq("area_id", areaId)
      .eq("skill_id", skillId);

    if (deleteError) {
      console.error("Failed to unlink area skill", { deleteError, areaId, skillId });
      setError("Unable to unlink that skill.");
      setRelatedSkills(previous);
    }

    setIsSaving(false);
  }

  const canCreateSkill =
    query.trim().length > 0 &&
    !allSkills.some(
      (skill) => skill.name.toLowerCase() === query.trim().toLowerCase()
    );

  return (
    <Card className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#050608] text-white shadow-[0_24px_70px_-46px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.045)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.035),_transparent_62%)]" />
      <CardHeader className="relative z-10 px-4 pb-3 pt-4 sm:px-5">
        <CardTitle className="flex items-center justify-between gap-3 text-sm font-semibold text-white">
          <span className="flex min-w-0 items-center gap-2">
            <Link2 className="size-4 text-white/58" aria-hidden="true" />
            <span className="truncate">Related Skills</span>
          </span>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/36">
            {relatedSkills.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative z-10 space-y-3 px-4 pb-4 sm:px-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/34" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Link skills to ${areaLabel}`}
            className="h-9 w-full rounded-xl border border-white/[0.08] bg-black/30 pl-9 pr-9 text-xs text-white outline-none transition placeholder:text-white/32 focus:border-white/20 focus:ring-2 focus:ring-white/10"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-white/42 transition hover:bg-white/[0.06] hover:text-white/76"
              aria-label="Clear skill search"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-xl border border-red-400/20 bg-red-950/20 px-3 py-2 text-xs text-red-100/80">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-10 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.035]"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {relatedSkills.length > 0 ? (
                relatedSkills.map((skill) => (
                  <span
                    key={skill.id}
                    className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.045] px-2.5 py-2 text-xs font-semibold text-white/84"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[11px]">
                      {skill.icon || skill.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="max-w-[10rem] truncate">{skill.name}</span>
                    <button
                      type="button"
                      onClick={() => unlinkSkill(skill.id)}
                      disabled={isSaving}
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-white/44 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
                      aria-label={`Unlink ${skill.name}`}
                    >
                      <Unlink className="size-3" aria-hidden="true" />
                    </button>
                  </span>
                ))
              ) : (
                <p className="text-xs leading-5 text-white/48">
                  Link skills here to power related habits and Area analytics.
                </p>
              )}
            </div>

            {(availableSkills.length > 0 || canCreateSkill) && query ? (
              <div className="space-y-1.5 rounded-2xl border border-white/[0.08] bg-black/20 p-2">
                {availableSkills.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => linkSkill(skill)}
                    disabled={isSaving}
                    className="flex min-h-9 w-full items-center justify-between gap-3 rounded-xl px-2.5 text-left text-xs font-semibold text-white/82 transition hover:bg-white/[0.06] disabled:opacity-45"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[11px]">
                        {skill.icon || skill.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate">{skill.name}</span>
                    </span>
                    <Plus className="size-3.5 shrink-0 text-white/42" aria-hidden="true" />
                  </button>
                ))}
                {canCreateSkill ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={createAndLinkSkill}
                    disabled={isSaving}
                    className="min-h-9 w-full justify-start rounded-xl px-2.5 text-xs font-semibold text-white/78 hover:bg-white/[0.06] hover:text-white"
                  >
                    <Plus className="mr-2 size-3.5" aria-hidden="true" />
                    Create & link "{query.trim()}"
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AreaSkillRelations;
