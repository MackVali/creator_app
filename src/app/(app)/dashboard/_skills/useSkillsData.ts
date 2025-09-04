"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

export interface Skill {
  id: string;
  name: string;
  icon: string | null;
  level: number;
  progress: number;
  cat_id: number | null;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  color_hex: string | null;
  order: number | null;
}

export interface CategoryWithSkills extends Category {
  skills: Skill[];
}

export function useSkillsData() {
  const [categories, setCategories] = useState<CategoryWithSkills[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const sb = getSupabaseBrowser();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return;

      const { data: cats } = await sb
        .from("cats")
        .select("id,name,slug,color_hex,order")
        .eq("user_id", user.id)
        .order("order", { ascending: true });

      const { data: skills } = await sb
        .from("skills")
        .select("id,name,icon,level,progress,cat_id")
        .eq("user_id", user.id);

      const grouped: CategoryWithSkills[] = (cats ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        color_hex: c.color_hex,
        order: c.order,
        skills: (skills ?? []).filter((s) => s.cat_id === c.id),
      }));

      setCategories(grouped);
      setLoading(false);
    };
    load();
  }, []);

  return { categories, loading };
}

