import { NextResponse } from "next/server";
import { z } from "zod";

import { MAX_MONUMENTS } from "@/lib/monuments/constants";
import {
  CREATOR_ONBOARDING_COMPLETE_STEP,
  CREATOR_ONBOARDING_VERSION,
} from "@/lib/onboarding/creatorSetup";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const MIN_SELECTED_SKILLS = 5;
const MAX_SELECTED_SKILLS = 12;
const MAX_IDENTITY_DIRECTIONS = 9;
const MAX_SETUP_MONUMENTS = 3;
const FALLBACK_CATEGORY_COLOR = "#6366f1";
const CATEGORY_COLORS = [
  "#14b8a6",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#f43f5e",
  "#84cc16",
];

const payloadSchema = z.object({
  identityDirections: z
    .array(z.string().trim().min(1).max(96))
    .min(1)
    .max(MAX_IDENTITY_DIRECTIONS),
  selectedSkillIds: z
    .array(z.string().uuid())
    .min(MIN_SELECTED_SKILLS)
    .max(MAX_SELECTED_SKILLS),
  monuments: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(80),
        emoji: z.string().trim().max(16).optional().default("🏛️"),
        skillIds: z
          .array(z.string().uuid())
          .min(1)
          .max(MAX_SELECTED_SKILLS),
      }),
    )
    .min(1)
    .max(MAX_SETUP_MONUMENTS),
  starterPath: z.string().trim().max(64).optional(),
});

type ParsedPayload = z.infer<typeof payloadSchema>;

type GlobalSkillRow = {
  id: string;
  name: string;
  icon: string;
  category_id: string;
  sort_order: number | null;
};

type GlobalCategoryRow = {
  id: string;
  name: string;
  icon: string | null;
  sort_order: number | null;
};

type UserCategoryRow = {
  id: string;
  name: string;
  sort_order: number | null;
};

type UserSkillRow = {
  id: string;
  name: string;
  cat_id: string | null;
  global_skill_id: string | null;
  sort_order: number | null;
};

type AppSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

type MutationError = { message?: string; code?: string } | null;

type WriteTable<TSelected> = {
  update: (values: unknown) => {
    eq: (column: string, value: string) => PromiseLike<{ error: MutationError }>;
  };
  insert: (values: unknown) => {
    select: (columns: string) => PromiseLike<{
      data: TSelected | null;
      error: MutationError;
    }>;
  };
  upsert: (
    values: unknown,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) => PromiseLike<{ error: MutationError }>;
};

function writeTable<TSelected = unknown>(
  supabase: AppSupabaseClient,
  table: string,
) {
  const from = supabase.from as unknown as (relation: string) => unknown;
  return from(table) as WriteTable<TSelected>;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function getValidationError(payload: ParsedPayload) {
  const uniqueIdentityDirections = new Set(
    payload.identityDirections.map(normalizeName),
  );
  if (uniqueIdentityDirections.size !== payload.identityDirections.length) {
    return "Identity directions must be unique.";
  }

  const uniqueSkillIds = uniqueValues(payload.selectedSkillIds);
  if (uniqueSkillIds.length !== payload.selectedSkillIds.length) {
    return "Selected Skills must be unique.";
  }

  const selectedSkillIdSet = new Set(payload.selectedSkillIds);
  const assignedSkillIds = new Set<string>();

  for (const monument of payload.monuments) {
    const uniqueMonumentSkillIds = uniqueValues(monument.skillIds);
    if (uniqueMonumentSkillIds.length !== monument.skillIds.length) {
      return "A Monument cannot include the same Skill more than once.";
    }

    for (const skillId of monument.skillIds) {
      if (!selectedSkillIdSet.has(skillId)) {
        return "Monuments can only use selected Skills.";
      }
      assignedSkillIds.add(skillId);
    }
  }

  if (assignedSkillIds.size !== selectedSkillIdSet.size) {
    return "Every selected Skill must be assigned to at least one Monument.";
  }

  return null;
}

function normalizeEmoji(value: string | null | undefined) {
  return value?.trim() || "🏛️";
}

async function markCreatorOnboardingComplete(
  supabase: AppSupabaseClient,
  user: { id: string; user_metadata?: { full_name?: string } },
) {
  const onboardingFields = {
    onboarding_version: CREATOR_ONBOARDING_VERSION,
    onboarding_step: CREATOR_ONBOARDING_COMPLETE_STEP,
    onboarding_completed_at: new Date().toISOString(),
  };

  const { data: existingProfile, error: profileSelectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileSelectError) {
    throw profileSelectError;
  }

  if (existingProfile) {
    const { error } = await writeTable(supabase, "profiles")
      .update(onboardingFields)
      .eq("user_id", user.id);
    if (error) throw error;
    return;
  }

  const { error } = await writeTable(supabase, "profiles")
    .insert({
      user_id: user.id,
      username: `user_${user.id.slice(0, 8)}`,
      name: user.user_metadata?.full_name ?? "New User",
      ...onboardingFields,
    })
    .select("id");

  if (error) throw error;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid onboarding payload" },
      { status: 400 },
    );
  }

  const validationError = getValidationError(parsed.data);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const selectedSkillIds = parsed.data.selectedSkillIds;

  const { data: globalSkillRows, error: globalSkillsError } = await supabase
    .from("global_skills")
    .select("id,name,icon,category_id,sort_order")
    .eq("is_active", true)
    .in("id", selectedSkillIds);

  if (globalSkillsError) {
    console.error("[creator-setup] Failed to load global Skills", globalSkillsError);
    return NextResponse.json(
      { error: "Failed to load selected Skills" },
      { status: 500 },
    );
  }

  const globalSkillById = new Map(
    ((globalSkillRows ?? []) as GlobalSkillRow[]).map((skill) => [skill.id, skill]),
  );

  if (globalSkillById.size !== selectedSkillIds.length) {
    return NextResponse.json(
      { error: "One or more selected Skills are unavailable." },
      { status: 400 },
    );
  }

  const selectedGlobalSkills = selectedSkillIds.map(
    (skillId) => globalSkillById.get(skillId) as GlobalSkillRow,
  );
  const globalCategoryIds = uniqueValues(
    selectedGlobalSkills.map((skill) => skill.category_id),
  );

  const { data: globalCategoryRows, error: globalCategoriesError } = await supabase
    .from("global_skill_categories")
    .select("id,name,icon,sort_order")
    .eq("is_active", true)
    .in("id", globalCategoryIds);

  if (globalCategoriesError) {
    console.error(
      "[creator-setup] Failed to load global Skill categories",
      globalCategoriesError,
    );
    return NextResponse.json(
      { error: "Failed to load Skill categories" },
      { status: 500 },
    );
  }

  const globalCategoryById = new Map(
    ((globalCategoryRows ?? []) as GlobalCategoryRow[]).map((category) => [
      category.id,
      category,
    ]),
  );

  const { data: existingCategoryRows, error: existingCategoriesError } =
    await supabase
      .from("cats")
      .select("id,name,sort_order")
      .eq("user_id", user.id);

  if (existingCategoriesError) {
    console.error(
      "[creator-setup] Failed to load user Skill categories",
      existingCategoriesError,
    );
    return NextResponse.json(
      { error: "Failed to load your Skill categories" },
      { status: 500 },
    );
  }

  const userCategoryByName = new Map<string, UserCategoryRow>();
  for (const category of (existingCategoryRows ?? []) as UserCategoryRow[]) {
    userCategoryByName.set(normalizeName(category.name), category);
  }

  const maxCategorySortOrder = ((existingCategoryRows ?? []) as UserCategoryRow[])
    .map((category) => category.sort_order ?? 0)
    .reduce((max, value) => Math.max(max, value), 0);

  const categoriesToCreate = globalCategoryIds
    .map((categoryId) => globalCategoryById.get(categoryId))
    .filter(Boolean)
    .filter(
      (category) => !userCategoryByName.has(normalizeName(category?.name ?? "")),
    ) as GlobalCategoryRow[];

  if (categoriesToCreate.length > 0) {
    const { data: insertedCategories, error: insertCategoriesError } =
      await writeTable<UserCategoryRow[]>(supabase, "cats")
        .insert(
          categoriesToCreate.map((category, index) => ({
            user_id: user.id,
            name: category.name,
            icon: category.icon,
            color_hex:
              CATEGORY_COLORS[index % CATEGORY_COLORS.length] ??
              FALLBACK_CATEGORY_COLOR,
            sort_order: maxCategorySortOrder + index + 1,
            is_default: false,
            is_locked: false,
          })),
        )
        .select("id,name,sort_order");

    if (insertCategoriesError) {
      console.error(
        "[creator-setup] Failed to create user Skill categories",
        insertCategoriesError,
      );
      return NextResponse.json(
        { error: "Failed to create Skill categories" },
        { status: 500 },
      );
    }

    for (const category of (insertedCategories ?? []) as UserCategoryRow[]) {
      userCategoryByName.set(normalizeName(category.name), category);
    }
  }

  const getUserCategoryIdForGlobalCategory = (categoryId: string) => {
    const globalCategory = globalCategoryById.get(categoryId);
    if (!globalCategory) return null;
    return userCategoryByName.get(normalizeName(globalCategory.name))?.id ?? null;
  };

  const { data: existingSkillRows, error: existingSkillsError } = await supabase
    .from("skills")
    .select("id,name,cat_id,global_skill_id,sort_order")
    .eq("user_id", user.id);

  if (existingSkillsError) {
    console.error("[creator-setup] Failed to load user Skills", existingSkillsError);
    return NextResponse.json(
      { error: "Failed to load your Skills" },
      { status: 500 },
    );
  }

  const existingSkills = (existingSkillRows ?? []) as UserSkillRow[];
  const userSkillByGlobalId = new Map<string, UserSkillRow>();
  const maxSkillSortOrderByCategory = new Map<string, number>();

  for (const skill of existingSkills) {
    if (skill.global_skill_id && selectedSkillIds.includes(skill.global_skill_id)) {
      userSkillByGlobalId.set(skill.global_skill_id, skill);
    }
    const categoryKey = skill.cat_id ?? "uncategorized";
    maxSkillSortOrderByCategory.set(
      categoryKey,
      Math.max(
        maxSkillSortOrderByCategory.get(categoryKey) ?? 0,
        skill.sort_order ?? 0,
      ),
    );
  }

  const skillsToCreate = selectedGlobalSkills
    .filter((skill) => !userSkillByGlobalId.has(skill.id))
    .map((skill) => {
      const catId = getUserCategoryIdForGlobalCategory(skill.category_id);
      const categoryKey = catId ?? "uncategorized";
      const nextSortOrder = (maxSkillSortOrderByCategory.get(categoryKey) ?? 0) + 1;
      maxSkillSortOrderByCategory.set(categoryKey, nextSortOrder);
      return {
        user_id: user.id,
        name: skill.name,
        icon: skill.icon || "◇",
        cat_id: catId,
        global_skill_id: skill.id,
        level: 1,
        sort_order: nextSortOrder,
        monument_id: null,
        is_default: false,
        is_locked: false,
      };
    });

  if (skillsToCreate.length > 0) {
    const { data: insertedSkills, error: insertSkillsError } = await writeTable<
      UserSkillRow[]
    >(supabase, "skills")
      .insert(skillsToCreate)
      .select("id,name,cat_id,global_skill_id,sort_order");

    if (insertSkillsError) {
      console.error("[creator-setup] Failed to create user Skills", insertSkillsError);
      return NextResponse.json(
        { error: "Failed to create Skills" },
        { status: 500 },
      );
    }

    for (const skill of (insertedSkills ?? []) as UserSkillRow[]) {
      if (skill.global_skill_id) {
        userSkillByGlobalId.set(skill.global_skill_id, skill);
      }
    }
  }

  const { count: existingMonumentCount, error: monumentCountError } = await supabase
    .from("monuments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (monumentCountError) {
    console.error("[creator-setup] Failed to count Monuments", monumentCountError);
    return NextResponse.json(
      { error: "Failed to verify your Monuments" },
      { status: 500 },
    );
  }

  if ((existingMonumentCount ?? 0) + parsed.data.monuments.length > MAX_MONUMENTS) {
    return NextResponse.json(
      { error: `You can create up to ${MAX_MONUMENTS} Monuments.` },
      { status: 400 },
    );
  }

  const { data: insertedMonuments, error: insertMonumentsError } = await writeTable<
    Array<{ id: string; title: string }>
  >(supabase, "monuments")
    .insert(
      parsed.data.monuments.map((monument, index) => ({
        user_id: user.id,
        title: monument.title,
        emoji: normalizeEmoji(monument.emoji),
        priority_rank: (existingMonumentCount ?? 0) + index + 1,
      })),
    )
    .select("id,title");

  if (insertMonumentsError) {
    console.error("[creator-setup] Failed to create Monuments", insertMonumentsError);
    return NextResponse.json(
      { error: "Failed to create Monuments" },
      { status: 500 },
    );
  }

  const createdMonuments = insertedMonuments ?? [];
  if (createdMonuments.length !== parsed.data.monuments.length) {
    return NextResponse.json(
      { error: "Unable to create all Monuments" },
      { status: 500 },
    );
  }

  const monumentSkillRows = createdMonuments.flatMap((monument, index) => {
    const draft = parsed.data.monuments[index];
    if (!draft) return [];
    return uniqueValues(draft.skillIds)
      .map((globalSkillId) => {
        const skillId = userSkillByGlobalId.get(globalSkillId)?.id;
        if (!skillId) return null;
        return {
          user_id: user.id,
          monument_id: monument.id,
          skill_id: skillId,
        };
      })
      .filter(Boolean) as Array<{
      user_id: string;
      monument_id: string;
      skill_id: string;
    }>;
  });

  if (monumentSkillRows.length > 0) {
    const { error: linkError } = await writeTable(
      supabase,
      "monument_skills",
    )
      .upsert(monumentSkillRows, { onConflict: "monument_id,skill_id" });

    if (linkError) {
      console.error("[creator-setup] Failed to link Skills to Monuments", linkError);
      return NextResponse.json(
        { error: "Monuments were created, but Skills could not be linked." },
        { status: 500 },
      );
    }
  }

  try {
    await markCreatorOnboardingComplete(supabase, user);
  } catch (error) {
    console.error("[creator-setup] Failed to update onboarding state", error);
    return NextResponse.json(
      { error: "Setup data was created, but onboarding could not be completed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    created_skills_count: skillsToCreate.length,
    reused_skills_count: selectedSkillIds.length - skillsToCreate.length,
    created_monuments_count: createdMonuments.length,
    created_monument_skill_links_count: monumentSkillRows.length,
  });
}
