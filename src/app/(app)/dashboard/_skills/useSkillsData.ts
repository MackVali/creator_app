"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

export interface Category {
  id: string;
  name: string;
  color_hex?: string | null;
  order?: number | null;
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
    .select("id,name,color_hex")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, color_hex: c.color_hex }));
}

export async function fetchSkills(userId: string): Promise<Skill[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  const baseQuery = supabase
    .from("skills")
    .select("id,name,icon,level,progress,cat_id")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  const { data, error } = await baseQuery;
  let rows = data;
  if (error) {
    // Fallback for projects that lack level/progress columns
    const fallback = await supabase
      .from("skills")
      .select("id,name,icon,cat_id")
      .eq("user_id", userId)
      .order("name", { ascending: true });
    if (fallback.error) throw fallback.error;
    rows = fallback.data;
  }

  type SkillRow = {
    id: string;
    name: string | null;
    icon: string | null;
    level?: number | null;
    progress?: number | null;
    cat_id: string | null;
  };

  return ((rows as SkillRow[] | null) ?? []).map((s) => ({
    id: s.id,
    name: s.name || "Unnamed",
    emoji: s.icon,
    level: s.level ?? undefined,
    xpPercent: s.progress ?? undefined,
    category_id: s.cat_id,
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

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = getSupabaseBrowser();
        if (!supabase) throw new Error("Supabase client not available");
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("No user");
        const [cats, skills] = await Promise.all([
          fetchCategories(user.id),
          fetchSkills(user.id),
        ]);
        setCategories(cats);
        setSkillsByCategory(groupByCategory(skills));
      } catch (e) {
        setError(e as Error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  return { categories, skillsByCategory, isLoading, error };
}

export default useSkillsData;

