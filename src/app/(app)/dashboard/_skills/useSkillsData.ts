"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

export interface Category {
  id: string;
  name: string;
  color_hex?: string | null;
  order?: number | null;
  emoji?: string | null;
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
    .select("id,name,color_hex,sort_order,emoji")
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
    return (fallback.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      order: c.sort_order,
      emoji: null,
    }));
  }
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    color_hex: c.color_hex || "#000000",
    order: c.sort_order,
    emoji: c.emoji || null,
  }));
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

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
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
        setCategories([{ id: "uncategorized", name: "Skills", emoji: null }]);
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
    void load();
  }, [load]);

  return { categories, skillsByCategory, isLoading, error, refresh: load };
}

export default useSkillsData;

