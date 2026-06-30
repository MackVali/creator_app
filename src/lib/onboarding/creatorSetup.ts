import type { Database } from "@/types/supabase";
import type { createSupabaseServerClient } from "@/lib/supabase-server";

export const CREATOR_ONBOARDING_VERSION = 2;
export const CREATOR_ONBOARDING_COMPLETE_STEP = "creator_setup_complete";

export type CreatorCatalogSkill = {
  id: string;
  name: string;
  icon: string;
  slug: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  isPopular: boolean;
  popularOrder: number | null;
  sortOrder: number;
};

export type CreatorCatalogSubcategory = {
  id: string;
  name: string;
  skills: CreatorCatalogSkill[];
};

export type CreatorCatalogCategory = {
  id: string;
  name: string;
  icon: string | null;
  subcategories: CreatorCatalogSubcategory[];
};

export type CreatorSkillCatalog = {
  categories: CreatorCatalogCategory[];
  popularSkills: CreatorCatalogSkill[];
  skills: CreatorCatalogSkill[];
};

type Supabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;
type GlobalCategoryRow =
  Database["public"]["Tables"]["global_skill_categories"]["Row"];
type GlobalSubcategoryRow =
  Database["public"]["Tables"]["global_skill_subcategories"]["Row"];
type GlobalSkillRow = Database["public"]["Tables"]["global_skills"]["Row"];

function compareBySortOrderThenName<
  T extends { sort_order?: number | null; popular_order?: number | null; name: string },
>(a: T, b: T) {
  const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.name.localeCompare(b.name);
}

function comparePopularSkills(a: CreatorCatalogSkill, b: CreatorCatalogSkill) {
  const aOrder = a.popularOrder ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.popularOrder ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.name.localeCompare(b.name);
}

export function isCreatorOnboardingComplete(profile: {
  onboarding_version?: number | null;
  onboarding_step?: string | null;
  onboarding_completed_at?: string | null;
} | null) {
  return Boolean(
    profile &&
      (profile.onboarding_version ?? 0) >= CREATOR_ONBOARDING_VERSION &&
      profile.onboarding_step === CREATOR_ONBOARDING_COMPLETE_STEP &&
      profile.onboarding_completed_at,
  );
}

export async function fetchCreatorSkillCatalog(
  supabase: Supabase,
): Promise<CreatorSkillCatalog> {
  const [categoryResponse, subcategoryResponse, skillResponse] =
    await Promise.all([
      supabase
        .from("global_skill_categories")
        .select("id,name,icon,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
      supabase
        .from("global_skill_subcategories")
        .select("id,category_id,name,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
      supabase
        .from("global_skills")
        .select(
          "id,category_id,subcategory_id,name,slug,icon,is_popular,popular_order,sort_order",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
    ]);

  if (categoryResponse.error) throw categoryResponse.error;
  if (subcategoryResponse.error) throw subcategoryResponse.error;
  if (skillResponse.error) throw skillResponse.error;

  const categoryRows = ((categoryResponse.data ?? []) as GlobalCategoryRow[])
    .slice()
    .sort(compareBySortOrderThenName);
  const subcategoryRows = (
    (subcategoryResponse.data ?? []) as GlobalSubcategoryRow[]
  )
    .slice()
    .sort(compareBySortOrderThenName);
  const skillRows = ((skillResponse.data ?? []) as GlobalSkillRow[])
    .slice()
    .sort(compareBySortOrderThenName);

  const categoryById = new Map(
    categoryRows.map((category) => [category.id, category]),
  );
  const subcategoryById = new Map(
    subcategoryRows.map((subcategory) => [subcategory.id, subcategory]),
  );
  const subcategoriesByCategory = new Map<string, CreatorCatalogSubcategory[]>();

  for (const subcategory of subcategoryRows) {
    const list = subcategoriesByCategory.get(subcategory.category_id) ?? [];
    list.push({
      id: subcategory.id,
      name: subcategory.name,
      skills: [],
    });
    subcategoriesByCategory.set(subcategory.category_id, list);
  }

  const allSkills: CreatorCatalogSkill[] = [];

  for (const skill of skillRows) {
    const category = categoryById.get(skill.category_id);
    if (!category) continue;

    const subcategory = skill.subcategory_id
      ? subcategoryById.get(skill.subcategory_id) ?? null
      : null;
    const item: CreatorCatalogSkill = {
      id: skill.id,
      name: skill.name,
      icon: skill.icon || "◇",
      slug: skill.slug,
      categoryId: category.id,
      categoryName: category.name,
      subcategoryId: subcategory?.id ?? null,
      subcategoryName: subcategory?.name ?? null,
      isPopular: skill.is_popular,
      popularOrder: skill.popular_order,
      sortOrder: skill.sort_order,
    };
    allSkills.push(item);

    const subcategoryId = subcategory?.id ?? `${category.id}:general`;
    const subcategoryName = subcategory?.name ?? "General";
    const list = subcategoriesByCategory.get(category.id) ?? [];
    const existing = list.find((group) => group.id === subcategoryId);
    if (existing) {
      existing.skills.push(item);
    } else {
      list.push({ id: subcategoryId, name: subcategoryName, skills: [item] });
      subcategoriesByCategory.set(category.id, list);
    }
  }

  const categories = categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    icon: category.icon,
    subcategories: (subcategoriesByCategory.get(category.id) ?? []).filter(
      (subcategory) => subcategory.skills.length > 0,
    ),
  }));

  return {
    categories,
    popularSkills: allSkills
      .filter((skill) => skill.isPopular)
      .sort(comparePopularSkills)
      .slice(0, 24),
    skills: allSkills,
  };
}
