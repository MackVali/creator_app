import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  UserStats,
  MonumentCounts,
  CatItem,
  GoalItem,
} from "@/types/dashboard";
import type { SkillRow } from "../../../lib/types/skill";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 }
    );
  }

  const user = (await supabase.auth.getUser()).data.user;
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get skills and categories separately, then join them
  const fetchCatsAndSkills = () =>
    Promise.all([
      supabase
        .from("skills")
        .select(
          "id,name,icon,cat_id,level,monument_id,created_at,updated_at,user_id,is_default,is_locked"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("cats")
        .select(
          "id,name,user_id,color_hex,sort_order,icon,is_default,is_locked"
        )
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true, nullsFirst: false }),
    ]);

  let [skillsResponse, catsResponse] = await fetchCatsAndSkills();

  // Debug logging for development
  // (commented out to avoid noisy production logs)
  // if (process.env.NODE_ENV !== "production") {
  //   console.debug("🔍 Debug: skills response length:", (skillsResponse.data ?? []).length);
  //   console.debug("🔍 Debug: skills response data:", skillsResponse.data);
  //   console.debug("🔍 Debug: cats response length:", catsResponse.data?.length || 0);
  //   console.debug("🔍 Debug: cats response data:", catsResponse.data);
  //   console.debug("🔍 Debug: user ID:", user.id);
  // }

  // Join the data manually
  const skillsRows = skillsResponse.data ?? [];
  const skillsData = skillsRows.map((skill: SkillRow) => {
    const category = catsResponse.data?.find(
      (cat: {
        id: string;
        name: string;
        user_id: string;
        color_hex?: string | null;
        sort_order?: number | null;
        icon?: string | null;
      }) => cat.id === skill.cat_id
    );
    return {
      ...skill,
      cat_name: category?.name || "Uncategorized",
      cat_color_hex: category?.color_hex || "#000000",
      cat_icon: category?.icon || null,
    };
  });

  // Debug skillsData
  // if (process.env.NODE_ENV !== "production") {
  //   console.debug("🔍 Debug: skillsData after mapping:", skillsData);
  // }

  const [
    { data: stats },
    { data: monuments },
    { data: goals },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("user_stats_v")
      .select("level,xp_current,xp_max")
      .maybeSingle(),
    supabase.from("monuments_summary_v").select("category,count"),
    supabase
      .from("goals")
      .select("id,name,priority,energy,monument_id,created_at")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("profiles")
      .select("onboarding_version,onboarding_step")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const statsOut: UserStats = stats ?? {
    level: 1,
    xp_current: 0,
    xp_max: 4000,
  };
  const mBase: MonumentCounts = {
    Achievement: 0,
    Legacy: 0,
    Triumph: 0,
    Pinnacle: 0,
  };
  for (const m of (monuments ?? []) as {
    category: keyof MonumentCounts;
    count: number;
  }[]) {
    if (m?.category in mBase) mBase[m.category] = m.count ?? 0;
  }

  // Group skills by category for the frontend
  const skillsByCategory = skillsData.reduce(
    (
      acc: Record<string, CatItem>,
      skill: SkillRow & {
        cat_name: string;
        cat_color_hex: string | null;
        cat_icon: string | null;
      }
    ) => {
      const catId = skill.cat_id;
      const catName = catId ? skill.cat_name : "Uncategorized";
      const key = catId || "uncategorized";

      if (!acc[key]) {
        acc[key] = {
          cat_id: catId || "uncategorized",
          cat_name: catName,
          user_id: skill.user_id,
          skill_count: 0,
          color_hex: catId ? skill.cat_color_hex || "#000000" : "#000000",
          icon: skill.cat_icon,
          skills: [],
        };
      }

      acc[key].skills.push({
        skill_id: skill.id,
        cat_id: skill.cat_id || "",
        name: skill.name, // Use real name, no placeholder
        icon: skill.icon || "🧩", // Handle null icon case
        level: skill.level ?? 1,
        progress: 0,
      });
      acc[key].skill_count = acc[key].skills.length;
      return acc;
    },
    {} as Record<string, CatItem>
  );

  // Debug skillsByCategory
  // if (process.env.NODE_ENV !== "production") {
  //   console.debug("🔍 Debug: skillsByCategory after grouping:", skillsByCategory);
  // }

  // Always include all CATs, even if they have no skills
  const allCats = (catsResponse.data || []) as {
    id: string;
    name: string;
    user_id: string;
    color_hex?: string | null;
    sort_order?: number | null;
    icon?: string | null;
  }[];

  // Create a complete list of CATs with their skills (or empty skills array)
  const catsOut = allCats.map((cat) => {
    // Check if this CAT has skills in the skillsByCategory
    const catSkills = skillsByCategory[cat.id];
    if (catSkills) {
      return {
        ...catSkills,
        color_hex: cat.color_hex || catSkills.color_hex || "#000000",
        order: cat.sort_order ?? null,
        icon: cat.icon ?? catSkills.icon ?? null,
      }; // Return CAT with its skills
    } else {
      // CAT exists but has no skills
      return {
        cat_id: cat.id,
        cat_name: cat.name,
        user_id: cat.user_id,
        skill_count: 0,
        color_hex: cat.color_hex || "#000000",
        order: cat.sort_order ?? null,
        icon: cat.icon ?? null,
        skills: [],
      };
    }
  });

  // Add uncategorized skills if they exist
  const uncategorizedCat = skillsByCategory["uncategorized"];
  if (uncategorizedCat) {
    catsOut.push({
      ...uncategorizedCat,
      color_hex: uncategorizedCat.color_hex || "#000000",
      order: null,
      icon: uncategorizedCat.icon || null,
    });
  }

  // Sort cats by order then name
  catsOut.sort((a: CatItem, b: CatItem) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.cat_name.localeCompare(b.cat_name);
  });

  const goalsOut = (goals ?? []) as GoalItem[];

  // Debug logging
  // console.log("🔍 Raw skills data:", skillsData);
  // console.log("🔍 All CATs:", allCats);
  // console.log("🔍 Skills by category:", skillsByCategory);
  // console.log("🔍 Final CATs output:", catsOut);

  return NextResponse.json({
    stats: statsOut,
    monuments: mBase,
    profile: {
      onboarding_version: profile?.onboarding_version ?? 0,
      onboarding_step: profile?.onboarding_step ?? null,
    },
    skillsAndGoals: {
      cats: catsOut,
      goals: goalsOut,
    },
  });
}
