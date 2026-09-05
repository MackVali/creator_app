"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  ListChecks,
  MinusCircle,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAreaById } from "@/config/areas";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

type AreaSkillInsert = Database["public"]["Tables"]["area_skills"]["Insert"];
type SkillInsert = Database["public"]["Tables"]["skills"]["Insert"];
type DbError = { message?: string } & Record<string, unknown>;
type DbResult<T> = { data: T | null; error: DbError | null };
type SkillSelectRow = {
  id?: unknown;
  name?: unknown;
  Title?: unknown;
  icon?: unknown;
  level?: unknown;
};
type AreaSkillRelationRow = {
  area_id?: unknown;
  skill_id?: unknown;
};

type SelectBuilder<T> = PromiseLike<DbResult<T>> & {
  eq(column: string, value: string): SelectBuilder<T>;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ): SelectBuilder<T>;
};

type DeleteBuilder = PromiseLike<DbResult<null>> & {
  eq(column: string, value: string): DeleteBuilder;
};

type InsertBuilder<T> = PromiseLike<DbResult<null>> & {
  select(columns: string): {
    single(): Promise<DbResult<T>>;
  };
};

type AreaSkillDbClient = {
  from(table: "skills"): {
    select(columns: string): SelectBuilder<SkillSelectRow[]>;
    insert(payload: SkillInsert): InsertBuilder<SkillSelectRow>;
  };
  from(table: "area_skills"): {
    select(columns: string): SelectBuilder<AreaSkillRelationRow[]>;
    delete(): DeleteBuilder;
    insert(payload: AreaSkillInsert): PromiseLike<DbResult<null>>;
    upsert(
      payload: AreaSkillInsert,
      options?: { onConflict?: string }
    ): PromiseLike<DbResult<null>>;
  };
};

type AreaSkill = {
  id: string;
  name: string;
  icon: string | null;
  level: number | null;
  assignedAreaId: string | null;
};

type AreaSkillRelationsProps = {
  areaId: string;
  areaLabel: string;
};

function normalizeSkillName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Untitled skill";
}

function normalizeSkill(
  row: unknown,
  assignedAreaId: string | null = null
): AreaSkill | null {
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
    level: typeof record.level === "number" ? record.level : null,
    assignedAreaId,
  };
}

function getSkillFallbackIcon(skill: AreaSkill) {
  return skill.icon || skill.name.charAt(0).toUpperCase();
}

function getSkillLevelLabel(skill: AreaSkill) {
  return `LV ${skill.level ?? 1}`;
}

function getAreaLabel(areaId: string) {
  return getAreaById(areaId)?.label ?? areaId;
}

export function AreaSkillRelations({
  areaId,
  areaLabel,
}: AreaSkillRelationsProps) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [skills, setSkills] = useState<AreaSkill[]>([]);
  const [query, setQuery] = useState("");
  const [isManaging, setIsManaging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentAreaSkills = useMemo(
    () =>
      skills
        .filter((skill) => skill.assignedAreaId === areaId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [areaId, skills]
  );

  const availableSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return skills
      .filter((skill) => skill.assignedAreaId !== areaId)
      .filter((skill) =>
        normalizedQuery ? skill.name.toLowerCase().includes(normalizedQuery) : true
      )
      .slice(0, 8);
  }, [areaId, query, skills]);

  const loadSkills = useCallback(async () => {
    if (!supabase || !areaId) {
      setIsLoading(false);
      setSkills([]);
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
        setSkills([]);
        return;
      }

      const db = supabase as unknown as AreaSkillDbClient;
      const [skillsResult, relationsResult] = await Promise.all([
        db
          .from("skills")
          .select("id,name,icon,level")
          .eq("user_id", nextUserId)
          .order("name", { ascending: true }),
        db
          .from("area_skills")
          .select("area_id,skill_id")
          .eq("user_id", nextUserId),
      ]);

      if (skillsResult.error) throw skillsResult.error;
      if (relationsResult.error) throw relationsResult.error;

      const areaBySkillId = new Map<string, string>();
      for (const row of (relationsResult.data ?? []) as Array<{
        area_id?: unknown;
        skill_id?: unknown;
      }>) {
        const skillId = typeof row.skill_id === "string" ? row.skill_id : null;
        const relationAreaId =
          typeof row.area_id === "string" ? row.area_id : null;
        if (!skillId || !relationAreaId) continue;

        const existingAreaId = areaBySkillId.get(skillId);
        if (!existingAreaId || relationAreaId === areaId) {
          areaBySkillId.set(skillId, relationAreaId);
        }
      }

      const nextSkills = ((skillsResult.data ?? []) as unknown[])
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const record = row as Record<string, unknown>;
          const skillId = typeof record.id === "string" ? record.id : null;
          return normalizeSkill(
            row,
            skillId ? areaBySkillId.get(skillId) ?? null : null
          );
        })
        .filter((skill): skill is AreaSkill => Boolean(skill));

      setSkills(nextSkills);
    } catch (loadError) {
      console.error("Failed to load area skills", { loadError, areaId });
      setError("Unable to load skills.");
      setSkills([]);
    } finally {
      setIsLoading(false);
    }
  }, [areaId, supabase]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  async function assignSkillToArea(skill: AreaSkill) {
    if (!supabase || !userId || isSaving) return;
    if (skill.assignedAreaId === areaId) return;

    const previousSkills = skills;
    setIsSaving(true);
    setError(null);
    setSkills((current) =>
      current.map((item) =>
        item.id === skill.id ? { ...item, assignedAreaId: areaId } : item
      )
    );

    const db = supabase as unknown as AreaSkillDbClient;
    const relationPayload: AreaSkillInsert = {
      area_id: areaId,
      skill_id: skill.id,
      user_id: userId,
    };
    const { error: insertError } = await db
      .from("area_skills")
      .upsert(relationPayload, { onConflict: "user_id,skill_id" });

    if (insertError) {
      console.error("Failed to assign area skill", { insertError, areaId, skill });
      setError("Unable to move that skill.");
      setSkills(previousSkills);
      await loadSkills();
    }

    setIsSaving(false);
  }

  async function createAndAssignSkill() {
    const name = query.trim();
    if (!supabase || !userId || !name || isSaving) return;

    setIsSaving(true);
    setError(null);

    const db = supabase as unknown as AreaSkillDbClient;
    const skillPayload: SkillInsert = {
      user_id: userId,
      name,
      icon: name.charAt(0).toUpperCase(),
    };
    const { data, error: insertError } = await db
      .from("skills")
      .insert(skillPayload)
      .select("id,name,icon,level")
      .single();

    if (insertError) {
      console.error("Failed to create area skill", { insertError, areaId, name });
      setError("Unable to create that skill.");
      setIsSaving(false);
      return;
    }

    const skill = normalizeSkill(data);
    if (skill) {
      const relationPayload: AreaSkillInsert = {
        area_id: areaId,
        skill_id: skill.id,
        user_id: userId,
      };
      const { error: relationError } = await db
        .from("area_skills")
        .insert(relationPayload);

      if (relationError) {
        console.error("Failed to assign new area skill", {
          relationError,
          areaId,
          skill,
        });
        setError("Skill was created, but could not be assigned to this Area.");
        await loadSkills();
        setIsSaving(false);
        return;
      }

      setSkills((current) =>
        [...current, { ...skill, assignedAreaId: areaId }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setQuery("");
    }

    setIsSaving(false);
  }

  async function removeSkillFromArea(skillId: string) {
    if (!supabase || !userId || isSaving) return;

    const previousSkills = skills;
    setIsSaving(true);
    setError(null);
    setSkills((current) =>
      current.map((skill) =>
        skill.id === skillId ? { ...skill, assignedAreaId: null } : skill
      )
    );

    const db = supabase as unknown as AreaSkillDbClient;
    const { error: deleteError } = await db
      .from("area_skills")
      .delete()
      .eq("user_id", userId)
      .eq("area_id", areaId)
      .eq("skill_id", skillId);

    if (deleteError) {
      console.error("Failed to remove area skill", { deleteError, areaId, skillId });
      setError("Unable to remove that skill from this Area.");
      setSkills(previousSkills);
    }

    setIsSaving(false);
  }

  const trimmedQuery = query.trim();
  const canCreateSkill =
    trimmedQuery.length > 0 &&
    !skills.some(
      (skill) => skill.name.toLowerCase() === trimmedQuery.toLowerCase()
    );

  function toggleManagement() {
    setIsManaging((current) => {
      if (current) {
        setQuery("");
      }
      return !current;
    });
  }

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#050608] text-white shadow-[0_18px_48px_-38px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.045)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.035),_transparent_62%)]" />
      <CardHeader className="relative z-10 px-2 pb-1 pt-2 sm:px-2.5">
        <CardTitle className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-white/62">
          <span className="flex min-w-0 items-center gap-2">
            <ListChecks className="size-3.5 text-white/48" aria-hidden="true" />
            <span className="truncate">SKILLS</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-[10px] text-white/36">{currentAreaSkills.length}</span>
            <button
              type="button"
              onClick={toggleManagement}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 text-[10px] font-semibold normal-case tracking-normal text-white/50 transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/76 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              aria-expanded={isManaging}
            >
              {isManaging ? (
                <X className="size-3" aria-hidden="true" />
              ) : (
                <Pencil className="size-3" aria-hidden="true" />
              )}
              {isManaging ? "Done" : "Manage"}
            </button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative z-10 space-y-1.5 px-1.5 pb-1.5 sm:px-2">
        {error ? (
          <p className="rounded-lg border border-red-400/20 bg-red-950/20 px-2.5 py-1.5 text-[11px] text-red-100/80">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-1">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-8 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.035]"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {currentAreaSkills.length > 0 ? (
                currentAreaSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex min-h-7 min-w-0 items-center gap-1.5 rounded-lg border border-white/[0.075] bg-white/[0.035] px-1.5 py-0.5 text-xs font-semibold text-white/82"
                  >
                    <span className="flex size-4.5 shrink-0 items-center justify-center rounded-md bg-black/25 text-[10px] text-white/76">
                      {getSkillFallbackIcon(skill)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{skill.name}</span>
                    <span className="shrink-0 rounded-md border border-white/[0.07] bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">
                      {getSkillLevelLabel(skill)}
                    </span>
                    {isManaging ? (
                      <button
                        type="button"
                        onClick={() => removeSkillFromArea(skill.id)}
                        disabled={isSaving}
                        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-white/34 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
                        aria-label={`Remove ${skill.name} from ${areaLabel}`}
                      >
                        <MinusCircle className="size-3" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.025] px-2.5 py-2 text-xs text-white/42 sm:col-span-2">
                  No skills yet.
                </p>
              )}
            </div>

            {isManaging ? (
              <div className="space-y-2 border-t border-white/[0.07] pt-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/34" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`Create or move skills into ${areaLabel}`}
                    className="h-8 w-full rounded-lg border border-white/[0.08] bg-black/30 pl-8 pr-8 text-xs text-white outline-none transition placeholder:text-white/32 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-white/42 transition hover:bg-white/[0.06] hover:text-white/76"
                      aria-label="Clear skill search"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>

                {(availableSkills.length > 0 || canCreateSkill) && query ? (
                  <div className="space-y-1 rounded-xl border border-white/[0.07] bg-black/20 p-1.5">
                    {availableSkills.map((skill) => (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => assignSkillToArea(skill)}
                        disabled={isSaving}
                        className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-white/82 transition hover:bg-white/[0.06] disabled:opacity-45"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[11px]">
                            {getSkillFallbackIcon(skill)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{skill.name}</span>
                            <span className="mt-0.5 block truncate text-[10px] font-medium text-white/38">
                              {skill.assignedAreaId
                                ? `Move from ${getAreaLabel(skill.assignedAreaId)}`
                                : "Assign to this Area"}
                              {` - ${getSkillLevelLabel(skill)}`}
                            </span>
                          </span>
                        </span>
                        {skill.assignedAreaId ? (
                          <ArrowRightLeft
                            className="size-3.5 shrink-0 text-white/42"
                            aria-hidden="true"
                          />
                        ) : (
                          <Plus
                            className="size-3.5 shrink-0 text-white/42"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ))}
                    {canCreateSkill ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={createAndAssignSkill}
                        disabled={isSaving}
                        className="min-h-8 w-full justify-start rounded-lg px-2 text-xs font-semibold text-white/78 hover:bg-white/[0.06] hover:text-white"
                      >
                        <Plus className="mr-2 size-3.5" aria-hidden="true" />
                        Create in {areaLabel}: {trimmedQuery}
                      </Button>
                    ) : null}
                  </div>
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
