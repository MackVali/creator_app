"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

const DASHBOARD_LOAD_TIMEOUT_MS = 10_000;
const DASHBOARD_SEED_TIMEOUT_MS = 8_000;

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function timeoutError(label: string, timeoutMs: number): Error {
  return new Error(`${label} timed out after ${timeoutMs}ms`);
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

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
      let fallbackQuery = supabase.from("skills").select(columns).eq("user_id", userId);
      if (columns.includes("sort_order")) {
        fallbackQuery = fallbackQuery
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true });
      } else {
        fallbackQuery = fallbackQuery.order("name", { ascending: true });
      }

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;

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

const UNCATEGORIZED_CATEGORY: Category = {
  id: "uncategorized",
  name: "Uncategorized",
  color_hex: "#000000",
  order: null,
  icon: null,
  is_default: false,
  is_locked: false,
};

export function useSkillsData() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [skillsByCategory, setSkillsByCategory] = useState<Record<string, Skill[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    let loadError: Error | null = null;

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Supabase client not available");
      const {
        data: { user },
      } = await withTimeout(supabase.auth.getUser(), DASHBOARD_LOAD_TIMEOUT_MS, "Supabase auth");
      if (!user) throw new Error("No user");

      const readCategories = () =>
        withTimeout(fetchCategories(user.id), DASHBOARD_LOAD_TIMEOUT_MS, "Supabase categories").catch((e) => {
          loadError = loadError ?? toError(e);
          return [];
        });
      const readSkills = () =>
        withTimeout(fetchSkills(user.id), DASHBOARD_LOAD_TIMEOUT_MS, "Supabase skills").catch((e) => {
          loadError = loadError ?? toError(e);
          return [];
        });

      let [cats, skills] = await Promise.all([readCategories(), readSkills()]);

      if (cats.length === 0 && skills.length === 0) {
        try {
          await withTimeout(
            fetch("/api/dashboard", { cache: "no-store" }),
            DASHBOARD_SEED_TIMEOUT_MS,
            "/api/dashboard seed"
          );
        } catch (e) {
          loadError = loadError ?? toError(e);
          // ignore seed failures; we'll continue to re-fetch below
        }

        [cats, skills] = await Promise.all([readCategories(), readSkills()]);
      }
      const grouped = groupByCategory(skills);
      const hasUncategorizedSkills = (grouped["uncategorized"] ?? []).length > 0;
      const categoriesWithUncategorized =
        hasUncategorizedSkills && !cats.some((cat) => cat.id === "uncategorized")
          ? [...cats, UNCATEGORIZED_CATEGORY]
          : cats;

      setSkillsByCategory(grouped);
      if (categoriesWithUncategorized.length > 0) {
        setCategories(categoriesWithUncategorized);
      } else if (Object.keys(grouped).length > 0) {
        // derive a single fallback category so skills still render
        setCategories([UNCATEGORIZED_CATEGORY]);
      } else {
        setCategories([]);
      }
      setError(loadError);
    } catch (e) {
      setError(toError(e));
      setSkillsByCategory({});
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return { categories, skillsByCategory, isLoading, error, reload };
}

export default useSkillsData;
