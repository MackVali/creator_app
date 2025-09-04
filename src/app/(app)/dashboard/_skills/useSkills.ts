"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";

export interface Category {
  id: string;
  name: string;
  order?: number | null;
}

export interface Skill {
  id: string;
  name: string;
  icon?: string | null;
  level: number;
  progress: number;
  category_id: string | null;
}

export async function getCategoriesForUser(userId: string): Promise<Category[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  const { data, error } = await supabase
    .from("cats")
    .select("id,name")
    .eq("user_id", userId)
    .order("name", { ascending: true });
    
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

export async function getSkillsForUser(userId: string): Promise<Skill[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  const { data, error } = await supabase
    .from("skills")
    .select("id,name,icon,level,cat_id")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name || "Unnamed",
    icon: s.icon,
    level: s.level ?? 1,
    progress: 0,
    category_id: s.cat_id,
  }));
}

export function groupSkillsByCategory(skills: Skill[]): Record<string, Skill[]> {
  return skills.reduce<Record<string, Skill[]>>((acc, skill) => {
    const key = skill.category_id || "uncategorized";
    acc[key] = acc[key] || [];
    acc[key].push(skill);
    return acc;
  }, {});
}

export function useSkillsCarousel() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [skillsByCategory, setSkillsByCategory] = useState<Record<string, Skill[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const search = useSearchParams();
  const router = useRouter();
  const initial = search.get("cat") || undefined;
  const [activeId, setActiveIdState] = useState<string | undefined>(initial);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = getSupabaseBrowser();
        if (!supabase) throw new Error("Supabase client not available");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No user");
        const [cats, skills] = await Promise.all([
          getCategoriesForUser(user.id),
          getSkillsForUser(user.id),
        ]);
        setCategories(cats);
        setSkillsByCategory(groupSkillsByCategory(skills));
        if (!initial && cats[0]) {
          setActiveIdState(cats[0].id);
          const params = new URLSearchParams(search);
          params.set("cat", cats[0].id);
          router.replace(`?${params.toString()}`);
        }
        } catch (e) {
          setError(e as Error);
        } finally {
        setIsLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveId = (id: string) => {
    setActiveIdState(id);
    const params = new URLSearchParams(search);
    params.set("cat", id);
    router.replace(`?${params.toString()}`);
  };

  const categoriesWithUncat = useMemo(() => {
    const t = [...categories];
    if (skillsByCategory["uncategorized"]) {
      t.push({ id: "uncategorized", name: "Uncategorized" });
    }
    return t;
  }, [categories, skillsByCategory]);

  return {
    categories: categoriesWithUncat,
    activeId,
    setActiveId,
    skillsByCategory,
    isLoading,
    error,
  };
}

