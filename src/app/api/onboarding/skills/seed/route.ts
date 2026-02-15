import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { updateMyOnboarding } from "@/lib/db/profiles";

export const runtime = "nodejs";

type SeedSkillStackBody = {
  cats: Array<{
    name: string;
    icon?: string | null;
    color_hex?: string | null;
  }>;
  skills: Array<{
    name: string;
    icon?: string | null;
    cat_name?: string | null;
  }>;
};

type NormalizedCat = {
  name: string;
  icon: string | null;
  color_hex: string | null;
};

type NormalizedSkill = {
  name: string;
  icon: string | null;
  cat_name: string;
};

export async function POST(request: Request) {
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

  let body: SeedSkillStackBody | undefined;
  try {
    body = (await request.json()) as SeedSkillStackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cats = Array.isArray(body?.cats) ? body.cats : [];
  const skills = Array.isArray(body?.skills) ? body.skills : [];

  if (cats.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one cat entry" },
      { status: 400 }
    );
  }

  if (skills.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one skill entry" },
      { status: 400 }
    );
  }

  const normalizedCats: NormalizedCat[] = [];
  for (const cat of cats) {
    const trimmedName = (cat?.name ?? "").trim();
    if (!trimmedName) {
      return NextResponse.json(
        { error: "Cat names must not be blank" },
        { status: 400 }
      );
    }
    normalizedCats.push({
      name: trimmedName,
      icon: cat?.icon ?? null,
      color_hex: cat?.color_hex ?? null,
    });
  }

  const normalizedSkills: NormalizedSkill[] = [];
  for (const skill of skills) {
    const trimmedName = (skill?.name ?? "").trim();
    if (!trimmedName) {
      return NextResponse.json(
        { error: "Skill names must not be blank" },
        { status: 400 }
      );
    }
    normalizedSkills.push({
      name: trimmedName.toUpperCase(),
      icon: skill?.icon ?? null,
      cat_name: (skill?.cat_name ?? "").trim(),
    });
  }

  const { data: insertedCats, error: catsError } = await supabase
    .from("cats")
    .insert(
      normalizedCats.map((cat, index) => ({
        user_id: user.id,
        name: cat.name,
        icon: cat.icon,
        color_hex: cat.color_hex,
        sort_order: index,
        is_default: false,
        is_locked: false,
      }))
    )
    .select("id,name");

  if (catsError) {
    return NextResponse.json(
      { error: "Failed to insert categories" },
      { status: 500 }
    );
  }

  const catMap = new Map<string, string>();
  for (const cat of insertedCats ?? []) {
    const key = (cat?.name ?? "").trim().toLowerCase();
    if (cat?.id && key) {
      catMap.set(key, cat.id);
    }
  }

  const fallbackCatId = insertedCats?.[0]?.id;
  if (!fallbackCatId) {
    return NextResponse.json(
      { error: "Unable to determine a category for skills" },
      { status: 500 }
    );
  }

  const skillsToInsert = normalizedSkills
    .map((skill) => {
      const normalizedCatName = skill.cat_name.toLowerCase();
      const catId =
        (normalizedCatName && catMap.get(normalizedCatName)) ?? fallbackCatId;
      if (!catId) {
        return null;
      }
      return {
        user_id: user.id,
        name: skill.name,
        icon: skill.icon,
        cat_id: catId,
        level: 1,
        is_default: false,
        is_locked: false,
      };
    })
    .filter(Boolean) as Array<{
    user_id: string;
    name: string;
    icon: string | null;
    cat_id: string;
    level: number;
    is_default: boolean;
    is_locked: boolean;
  }>;

  if (skillsToInsert.length === 0) {
    return NextResponse.json(
      { error: "No valid skills to insert" },
      { status: 400 }
    );
  }

  const { data: insertedSkills, error: skillsError } = await supabase
    .from("skills")
    .insert(skillsToInsert)
    .select("id");

  if (skillsError) {
    return NextResponse.json(
      { error: "Failed to insert skills" },
      { status: 500 }
    );
  }

  try {
    const { success, error } = await updateMyOnboarding({
      onboarding_version: 1,
      onboarding_step: "skills_seeded",
    });
    if (!success) {
      console.error(
        "[onboarding/skills/seed] Failed to update onboarding state",
        error
      );
    }
  } catch (error) {
    console.error(
      "[onboarding/skills/seed] Failed to update onboarding state",
      error
    );
  }

  return NextResponse.json({
    success: true,
    inserted_cats_count: insertedCats?.length ?? 0,
    inserted_skills_count: insertedSkills?.length ?? 0,
  });
}
