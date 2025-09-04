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
  level: number;
  xpPercent: number;
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
  const { data, error } = await supabase
    .from("skills")
    .select("id,name,icon,level,xp_percent,cat_id")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name || "Unnamed",
    emoji: s.icon,
    level: s.level ?? 1,
    xpPercent: s.xp_percent ?? 0,
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

