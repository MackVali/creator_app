"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

export interface Category {
  id: string;
  name: string;
  color_hex?: string | null;
  order?: number | null;
  icon?: string | null;
}

export interface Skill {
  id: string;
  name: string;
  emoji?: string | null;
  level?: number | null;
  xpPercent?: number | null;
  category_id: string | null;
}

export async function fetchCategories(userId: string): Promise<Category[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  const { data, error } = await supabase
    .from("cats")
    .select("id,name,color_hex,sort_order,icon")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) {
    // Try again without optional color column; if still failing, return empty list
    const fallback = await supabase
      .from("cats")
      .select("id,name,sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (fallback.error) return [];
    return (fallback.data ?? []).map(
      (c: { id: string; name: string; sort_order?: number | null; icon?: string | null }) => ({
        id: c.id,
        name: c.name,
        order: c.sort_order,
        icon: c.icon ?? null,
      })
    );
  }
  return (data ?? []).map((c, idx) => {
    const fallbackOrder = idx + 1;
    const resolvedOrder =
      typeof c.sort_order === "number" && Number.isFinite(c.sort_order) && c.sort_order > 0
        ? Math.floor(c.sort_order)
        : fallbackOrder;
    return {
      id: c.id,
      name: c.name,
      color_hex: c.color_hex || "#000000",
      order: resolvedOrder,
      icon: c.icon || null,
    };
  });
}

export async function fetchSkills(userId: string): Promise<Skill[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  const baseQuery = supabase
    .from("skills")
    .select("id,name,icon,level,progress,cat_id")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  type SkillRow = {
    id: string;
    name: string | null;
    icon: string | null;
    level?: number | null;
    progress?: number | null;
    cat_id: string | null;
  };

  const { data, error } = await baseQuery;
  let rows: SkillRow[] = (data as SkillRow[] | null) ?? [];
  if (error) {
    // Remove progress/level first, keeping cat_id
    const fallback = await supabase
      .from("skills")
      .select("id,name,icon,cat_id")
      .eq("user_id", userId)
      .order("name", { ascending: true });
    if (fallback.error) {
      // If cat_id also missing, drop it entirely
      const minimal = await supabase
        .from("skills")
        .select("id,name,icon")
        .eq("user_id", userId)
        .order("name", { ascending: true });
      if (minimal.error) throw minimal.error;
      rows = (minimal.data as SkillRow[] | null) ?? [];
    } else {
      rows = (fallback.data as SkillRow[] | null) ?? [];
    }
  }

  return rows.map((s) => ({
    id: s.id,
    name: s.name || "Unnamed",
    emoji: s.icon,
    level: "level" in s ? s.level ?? undefined : undefined,
    xpPercent: "progress" in s ? s.progress ?? undefined : undefined,
    category_id: "cat_id" in s ? s.cat_id : null,
  }));
}

export function groupByCategory(skills: Skill[]): Record<string, Skill[]> {
  return skills.reduce<Record<string, Skill[]>>((acc, skill) => {
    const key = skill.category_id || "uncategorized";
    (acc[key] ||= []).push(skill);
    return acc;
  }, {});
}

export function useSkillsData() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [skillsByCategory, setSkillsByCategory] = useState<Record<string, Skill[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Supabase client not available");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");
      const [cats, skills] = await Promise.all([
        fetchCategories(user.id).catch(() => []),
        fetchSkills(user.id),
      ]);
      const grouped = groupByCategory(skills);
      setSkillsByCategory(grouped);
      if (cats.length > 0) {
        setCategories(cats);
      } else if (Object.keys(grouped).length > 0) {
        // derive a single fallback category so skills still render
        setCategories([{ id: "uncategorized", name: "Skills" }]);
      } else {
        setCategories([]);
      }
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load({ silent: true }), [load]);

  const applyCategoryOrder = useCallback(
    (ordered: ReadonlyArray<Pick<Category, "id">>) => {
      setCategories((previous) => {
        if (previous.length === 0 || ordered.length === 0) {
          return previous;
        }

        const existingById = new Map(previous.map((cat) => [cat.id, cat]));
        const seen = new Set<string>();
        const next: Category[] = [];

        ordered.forEach((entry, index) => {
          if (!entry?.id) return;
          const current = existingById.get(entry.id);
          if (!current) return;

          seen.add(entry.id);
          next.push({
            ...current,
            order: index + 1,
          });
        });

        if (next.length === 0) {
          return previous;
        }

        previous.forEach((cat) => {
          if (seen.has(cat.id)) return;
          next.push(cat);
        });

        return next;
      });
    },
    []
  );

  return { categories, skillsByCategory, isLoading, error, refresh, applyCategoryOrder };
}

export default useSkillsData;

