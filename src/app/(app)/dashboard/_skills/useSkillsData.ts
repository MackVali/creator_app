"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

export interface Category {
  id: string;
  name: string;
  color_hex?: string | null;
  order?: number | null;
  icon?: string | null;
  is_default?: boolean | null;
  is_locked?: boolean | null;
}

export interface Skill {
  id: string;
  name: string;
  emoji?: string | null;
  level?: number | null;
  category_id: string | null;
  sort_order?: number | null;
}

export async function fetchCategories(userId: string): Promise<Category[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  const { data, error } = await supabase
    .from("cats")
    .select("id,name,color_hex,sort_order,icon,is_default,is_locked")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) {
    // Try again without optional color column; if still failing, return empty list
    const fallback = await supabase
      .from("cats")
      .select("id,name,sort_order,icon,is_default,is_locked")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (fallback.error) return [];
    return (fallback.data ?? []).map(
      (c: {
        id: string;
        name: string;
        sort_order?: number | null;
        icon?: string | null;
        is_default?: boolean | null;
        is_locked?: boolean | null;
      }) => ({
        id: c.id,
        name: c.name,
        order: c.sort_order,
        icon: c.icon ?? null,
        is_default: c.is_default ?? false,
        is_locked: c.is_locked ?? false,
      })
    );
  }
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    color_hex: c.color_hex || "#000000",
    order: c.sort_order,
    icon: c.icon || null,
    is_default: c.is_default ?? false,
    is_locked: c.is_locked ?? false,
  }));
}

export async function fetchSkills(userId: string): Promise<Skill[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  const baseQuery = supabase
    .from("skills")
    .select("id,name,icon,level,progress,cat_id,sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  type SkillRow = {
    id: string;
    name: string | null;
    icon: string | null;
    level?: number | null;
    progress?: number | null;
    cat_id?: string | null;
    sort_order?: number | null;
  };

  const { data, error } = await baseQuery;
  let rows: SkillRow[] = (data as SkillRow[] | null) ?? [];
  if (error) {
    // Step down to variants without optional columns while keeping level whenever possible
    const fallbackSelects = [
      "id,name,icon,level,cat_id,sort_order",
      "id,name,icon,level,cat_id",
      "id,name,icon,level",
      "id,name,icon",
    ];

    let resolved = false;
    let lastError: unknown = error;
    for (const columns of fallbackSelects) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("skills")
        .select(columns)
        .eq("user_id", userId)
        .order("name", { ascending: true });

      if (!fallbackError) {
        rows = (fallbackData as SkillRow[] | null) ?? [];
        resolved = true;
        break;
      }

      lastError = fallbackError;
    }

    if (!resolved) {
      throw lastError ?? new Error("Failed to load skills");
    }
  }

  return rows.map((s) => ({
    id: s.id,
    name: s.name || "Unnamed",
    emoji: s.icon,
    level: typeof s.level === "number" ? s.level : 1,
    category_id: "cat_id" in s ? s.cat_id : null,
    sort_order: typeof s.sort_order === "number" ? s.sort_order : null,
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
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Supabase client not available");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");
      let [cats, skills] = await Promise.all([
        fetchCategories(user.id).catch(() => []),
        fetchSkills(user.id).catch(() => []),
      ]);

      if (cats.length === 0 && skills.length === 0) {
        try {
          await fetch("/api/dashboard", { cache: "no-store" });
        } catch {
          // ignore seed failures; we'll continue to re-fetch below
        }

        [cats, skills] = await Promise.all([
          fetchCategories(user.id).catch(() => []),
          fetchSkills(user.id).catch(() => []),
        ]);
      }
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
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return { categories, skillsByCategory, isLoading, error, reload };
}

export default useSkillsData;
