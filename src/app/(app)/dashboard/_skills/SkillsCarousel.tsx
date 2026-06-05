"use client";

import {
  forwardRef,
  startTransition,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";

import CategoryCard from "./CategoryCard";
import useSkillProgress from "./useSkillProgress";
import useSkillsData, { type Category, type Skill } from "./useSkillsData";
import {
  deriveInitialIndex,
  derivePersistedCategoryOrders,
  shouldUseFiveColumnCategoryPillGrid,
} from "./carouselUtils";
import { updateCatOrder } from "@/lib/data/cats";
import { getSkillsForUser } from "@/lib/data/skills";
import { createRecord, updateRecord } from "@/lib/db";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useToastHelpers } from "@/components/ui/toast";
import type { SkillRow } from "@/lib/types/skill";

const FALLBACK_COLOR = "#6366f1";
const MAX_CATEGORY_SLOTS = 10;
const DEFAULT_CATEGORY_EMOJI = "⚓";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CommunitySkill = {
  id: string | null;
  name: string;
  icon: string;
  categoryName?: string | null;
};

const POPULAR_COMMUNITY_SKILLS = [
  { id: null, name: "Content Strategy", icon: "✦" },
  { id: null, name: "Songwriting", icon: "🎵" },
  { id: null, name: "Videography", icon: "🎥" },
  { id: null, name: "Graphic Design", icon: "🎨" },
  { id: null, name: "Fitness", icon: "💪" },
  { id: null, name: "Coding", icon: "⌘" },
  { id: null, name: "Outreach", icon: "✉" },
  { id: null, name: "Piano", icon: "🎹" },
  { id: null, name: "Marketing", icon: "↗" },
  { id: null, name: "Meditation", icon: "◐" },
  { id: null, name: "Cooking", icon: "🍳" },
  { id: null, name: "Copywriting", icon: "✍" },
  { id: null, name: "Brand Design", icon: "◇" },
  { id: null, name: "Public Speaking", icon: "🎙" },
  { id: null, name: "Productivity", icon: "✓" },
  { id: null, name: "Photography", icon: "📷" },
  { id: null, name: "Sales", icon: "$" },
  { id: null, name: "Yoga", icon: "☽" },
  { id: null, name: "AI Automation", icon: "✧" },
  { id: null, name: "Guitar", icon: "🎸" },
  { id: null, name: "Personal Finance", icon: "◈" },
  { id: null, name: "Interior Styling", icon: "⌂" },
] as const satisfies readonly CommunitySkill[];

const COMMUNITY_SKILL_CATEGORIES = [
  {
    name: "Creative",
    subcategories: [
      {
        name: "Visual Studio",
        skills: [
          { id: null, name: "Graphic Design", icon: "🎨" },
          { id: null, name: "Brand Design", icon: "◇" },
          { id: null, name: "Illustration", icon: "✎" },
          { id: null, name: "Photography", icon: "📷" },
        ],
      },
      {
        name: "Content Craft",
        skills: [
          { id: null, name: "Videography", icon: "🎥" },
          { id: null, name: "Copywriting", icon: "✍" },
          { id: null, name: "Storytelling", icon: "◌" },
          { id: null, name: "Creative Direction", icon: "✦" },
        ],
      },
      {
        name: "Making",
        skills: [
          { id: null, name: "Cooking", icon: "🍳" },
          { id: null, name: "Drawing", icon: "✏" },
          { id: null, name: "Ceramics", icon: "◒" },
          { id: null, name: "Fashion Styling", icon: "✂" },
        ],
      },
    ],
  },
  {
    name: "Business",
    subcategories: [
      {
        name: "Growth",
        skills: [
          { id: null, name: "Marketing", icon: "↗" },
          { id: null, name: "Sales", icon: "$" },
          { id: null, name: "Outreach", icon: "✉" },
          { id: null, name: "Content Strategy", icon: "✦" },
        ],
      },
      {
        name: "Operator",
        skills: [
          { id: null, name: "Project Management", icon: "▦" },
          { id: null, name: "Leadership", icon: "♛" },
          { id: null, name: "Negotiation", icon: "◈" },
          { id: null, name: "Personal Finance", icon: "◈" },
        ],
      },
      {
        name: "Creator Business",
        skills: [
          { id: null, name: "Sponsorships", icon: "★" },
          { id: null, name: "Newsletter", icon: "✉" },
          { id: null, name: "Public Speaking", icon: "🎙" },
          { id: null, name: "Community Building", icon: "◉" },
        ],
      },
    ],
  },
  {
    name: "Health",
    subcategories: [
      {
        name: "Training",
        skills: [
          { id: null, name: "Fitness", icon: "💪" },
          { id: null, name: "Running", icon: "↟" },
          { id: null, name: "Strength Training", icon: "▰" },
          { id: null, name: "Mobility", icon: "⤢" },
        ],
      },
      {
        name: "Mind",
        skills: [
          { id: null, name: "Meditation", icon: "◐" },
          { id: null, name: "Yoga", icon: "☽" },
          { id: null, name: "Breathwork", icon: "≋" },
          { id: null, name: "Journaling", icon: "✍" },
        ],
      },
      {
        name: "Fuel",
        skills: [
          { id: null, name: "Nutrition", icon: "◎" },
          { id: null, name: "Meal Prep", icon: "▤" },
          { id: null, name: "Sleep", icon: "☾" },
          { id: null, name: "Recovery", icon: "◌" },
        ],
      },
    ],
  },
  {
    name: "Tech",
    subcategories: [
      {
        name: "Build",
        skills: [
          { id: null, name: "Coding", icon: "⌘" },
          { id: null, name: "Web Development", icon: "</>" },
          { id: null, name: "Product Design", icon: "▧" },
          { id: null, name: "No-Code", icon: "□" },
        ],
      },
      {
        name: "Systems",
        skills: [
          { id: null, name: "AI Automation", icon: "✧" },
          { id: null, name: "Data Analysis", icon: "▥" },
          { id: null, name: "Cybersecurity", icon: "◆" },
          { id: null, name: "Cloud Ops", icon: "☁" },
        ],
      },
    ],
  },
  {
    name: "Music",
    subcategories: [
      {
        name: "Writing",
        skills: [
          { id: null, name: "Songwriting", icon: "🎵" },
          { id: null, name: "Music Theory", icon: "♬" },
          { id: null, name: "Lyrics", icon: "✍" },
          { id: null, name: "Arrangement", icon: "≡" },
        ],
      },
      {
        name: "Performance",
        skills: [
          { id: null, name: "Piano", icon: "🎹" },
          { id: null, name: "Guitar", icon: "🎸" },
          { id: null, name: "Singing", icon: "♪" },
          { id: null, name: "DJing", icon: "◉" },
        ],
      },
      {
        name: "Production",
        skills: [
          { id: null, name: "Beat Making", icon: "▦" },
          { id: null, name: "Mixing", icon: "≋" },
          { id: null, name: "Audio Engineering", icon: "⌁" },
          { id: null, name: "Sound Design", icon: "◇" },
        ],
      },
    ],
  },
  {
    name: "Lifestyle",
    subcategories: [
      {
        name: "Home",
        skills: [
          { id: null, name: "Interior Styling", icon: "⌂" },
          { id: null, name: "Gardening", icon: "☘" },
          { id: null, name: "Home Organization", icon: "▤" },
          { id: null, name: "DIY Projects", icon: "✚" },
        ],
      },
      {
        name: "Daily Practice",
        skills: [
          { id: null, name: "Productivity", icon: "✓" },
          { id: null, name: "Reading", icon: "▥" },
          { id: null, name: "Language Learning", icon: "Aa" },
          { id: null, name: "Travel Planning", icon: "✈" },
        ],
      },
    ],
  },
] as const satisfies readonly {
  name: string;
  subcategories: readonly {
    name: string;
    skills: readonly CommunitySkill[];
  }[];
}[];

type SkillCreateInput = {
  name: string;
  icon: string;
  level: number;
  cat_id: string | null;
  monument_id?: string | null;
  global_skill_id?: string | null;
};

type ExistingSkillSortItem = {
  id: string;
  name: string;
  cat_id: string | null;
  global_skill_id?: string | null;
  sort_order?: number | null;
};

type CommunitySkillSubcategory = {
  id: string;
  name: string;
  skills: CommunitySkill[];
};

type CommunitySkillCategory = {
  id: string;
  name: string;
  subcategories: CommunitySkillSubcategory[];
};

type CommunityCatalog = {
  categoryNames: string[];
  categories: CommunitySkillCategory[];
  popularSkills: CommunitySkill[];
  skills: CommunitySkill[];
  source: "supabase" | "fallback";
};

type CatalogCategoryRow = {
  id: string;
  name: string;
  sort_order: number | null;
};

type CatalogSubcategoryRow = {
  id: string;
  category_id: string;
  name: string;
  sort_order: number | null;
};

type CatalogSkillRow = {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  name: string;
  icon: string | null;
  is_popular: boolean | null;
  popular_order: number | null;
  sort_order: number | null;
};

export type SkillsCarouselHandle = {
  refresh: () => Promise<void>;
};

function parseHex(hex?: string | null) {
  if (!hex) {
    return { r: 99, g: 102, b: 241 };
  }

  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return { r: 99, g: 102, b: 241 };
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return { r: 99, g: 102, b: 241 };
  }

  return { r, g, b };
}

function withAlpha(hex: string | null | undefined, alpha: number) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const isReorderable = (category: Category) =>
  category.id !== "uncategorized" && !category.is_locked;

const normalizeSkillName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
const normalizeCategoryName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

const compareBySortOrderThenName = <T extends { sort_order: number | null; name: string }>(
  left: T,
  right: T
) => {
  const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.name.localeCompare(right.name);
};

const comparePopularSkills = (left: CatalogSkillRow, right: CatalogSkillRow) => {
  const leftPopularOrder = left.popular_order ?? Number.MAX_SAFE_INTEGER;
  const rightPopularOrder = right.popular_order ?? Number.MAX_SAFE_INTEGER;
  if (leftPopularOrder !== rightPopularOrder) {
    return leftPopularOrder - rightPopularOrder;
  }
  return compareBySortOrderThenName(left, right);
};

function buildFallbackCommunityCatalog(): CommunityCatalog {
  const categories = COMMUNITY_SKILL_CATEGORIES.map((category) => ({
    id: category.name,
    name: category.name,
    subcategories: category.subcategories.map((subcategory) => ({
      id: `${category.name}:${subcategory.name}`,
      name: subcategory.name,
      skills: subcategory.skills.map((skill) => ({
        ...skill,
        categoryName: category.name,
      })),
    })),
  }));
  const skillsByName = new Map<string, CommunitySkill>();

  for (const skill of [
    ...categories.flatMap((category) =>
      category.subcategories.flatMap((subcategory) => subcategory.skills)
    ),
  ]) {
    skillsByName.set(skill.name, skill);
  }

  const popularSkills = POPULAR_COMMUNITY_SKILLS.map((skill) => ({
    ...skill,
    categoryName: skillsByName.get(skill.name)?.categoryName ?? null,
  }));

  return {
    categoryNames: ["Popular", ...categories.map((category) => category.name)],
    categories,
    popularSkills,
    skills: [...skillsByName.values()],
    source: "fallback",
  };
}

async function fetchCommunityCatalog(): Promise<CommunityCatalog> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const [categoryResponse, subcategoryResponse, skillResponse] = await Promise.all([
    supabase
      .from("global_skill_categories")
      .select("id,name,sort_order")
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
      .select("id,category_id,subcategory_id,name,icon,is_popular,popular_order,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
  ]);

  if (categoryResponse.error) throw categoryResponse.error;
  if (subcategoryResponse.error) throw subcategoryResponse.error;
  if (skillResponse.error) throw skillResponse.error;

  const categoryRows = ((categoryResponse.data ?? []) as CatalogCategoryRow[]).sort(
    compareBySortOrderThenName
  );
  const subcategoryRows = ((subcategoryResponse.data ?? []) as CatalogSubcategoryRow[]).sort(
    compareBySortOrderThenName
  );
  const skillRows = ((skillResponse.data ?? []) as CatalogSkillRow[]).sort(
    compareBySortOrderThenName
  );

  if (categoryRows.length === 0 || skillRows.length === 0) {
    throw new Error("Global skill catalog is empty");
  }

  const categoryNameById = new Map(categoryRows.map((category) => [category.id, category.name]));
  const skillsBySubcategory = new Map<string, CommunitySkill[]>();
  for (const skill of skillRows) {
    if (!skill.subcategory_id) {
      continue;
    }
    const list = skillsBySubcategory.get(skill.subcategory_id) ?? [];
    list.push({
      id: skill.id,
      name: skill.name,
      icon: skill.icon || "✦",
      categoryName: categoryNameById.get(skill.category_id) ?? null,
    });
    skillsBySubcategory.set(skill.subcategory_id, list);
  }

  const subcategoriesByCategory = new Map<string, CommunitySkillSubcategory[]>();
  for (const subcategory of subcategoryRows) {
    const list = subcategoriesByCategory.get(subcategory.category_id) ?? [];
    list.push({
      id: subcategory.id,
      name: subcategory.name,
      skills: skillsBySubcategory.get(subcategory.id) ?? [],
    });
    subcategoriesByCategory.set(subcategory.category_id, list);
  }

  const categories = categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    subcategories: subcategoriesByCategory.get(category.id) ?? [],
  }));

  const popularSkills = skillRows
    .filter((skill) => skill.is_popular)
    .sort(comparePopularSkills)
    .slice(0, 20)
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      icon: skill.icon || "✦",
      categoryName: categoryNameById.get(skill.category_id) ?? null,
    }));

  return {
    categoryNames: ["Popular", ...categories.map((category) => category.name)],
    categories,
    popularSkills,
    skills: skillRows.map((skill) => ({
      id: skill.id,
      name: skill.name,
      icon: skill.icon || "✦",
      categoryName: categoryNameById.get(skill.category_id) ?? null,
    })),
    source: "supabase",
  };
}

const SkillsCarousel = forwardRef<SkillsCarouselHandle>(function SkillsCarousel(_props, ref) {
  const { categories: fetchedCategories, skillsByCategory, isLoading, reload } = useSkillsData();
  const { progressBySkillId } = useSkillProgress();
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToastHelpers();

  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeIndexRef = useRef(0);
  const scrollFrame = useRef<number | null>(null);

  const [categories, setCategories] = useState(fetchedCategories);
  const [activeIndex, setActiveIndex] = useState(0);
  const [skillDragging, setSkillDragging] = useState(false);
  const [catOverrides, setCatOverrides] = useState<
    Record<string, { color?: string | null; icon?: string | null }>
  >({});
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [draggingSkill, setDraggingSkill] = useState<Skill | null>(null);
  const [dragOriginCategoryId, setDragOriginCategoryId] = useState<string | null>(null);
  const [dropTargetCategoryId, setDropTargetCategoryId] = useState<string | null>(null);
  const [isMovingSkill, setIsMovingSkill] = useState(false);
  const [communitySkillPickerOpen, setCommunitySkillPickerOpen] = useState(false);
  const [selectedCommunitySkillId, setSelectedCommunitySkillId] = useState<string | null>(null);
  const [communitySkillSearch, setCommunitySkillSearch] = useState("");
  const [skillSuggestionPanelOpen, setSkillSuggestionPanelOpen] = useState(false);
  const [suggestedSkillName, setSuggestedSkillName] = useState("");
  const [suggestedSkillIcon, setSuggestedSkillIcon] = useState("");
  const [activeCommunitySkillCategoryIndex, setActiveCommunitySkillCategoryIndex] = useState(0);
  const [openCommunitySkillSubcategories, setOpenCommunitySkillSubcategories] = useState<
    Record<string, boolean>
  >({});
  const [communityCatalog, setCommunityCatalog] = useState<CommunityCatalog>(() =>
    buildFallbackCommunityCatalog()
  );
  const [isCommunityCatalogLoading, setIsCommunityCatalogLoading] = useState(true);
  const [communityCatalogError, setCommunityCatalogError] = useState<string | null>(null);
  const [existingSkillSortItems, setExistingSkillSortItems] = useState<ExistingSkillSortItem[]>([]);
  const [isAddCategoryMenuOpen, setIsAddCategoryMenuOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(FALLBACK_COLOR);
  const [newCategoryEmoji, setNewCategoryEmoji] = useState(DEFAULT_CATEGORY_EMOJI);
  const addCategoryMenuRef = useRef<HTMLDivElement | null>(null);
  const addCategoryNameRef = useRef<HTMLInputElement | null>(null);
  const communityCategoryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const communityContentContainerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({ refresh: reload }), [reload]);
  const communityResultsPagerRef = useRef<HTMLDivElement>(null);
  const activeCommunitySkillCategoryIndexRef = useRef(0);
  const communityResultsScrollFrameRef = useRef<number | null>(null);
  const communityResultsScrollSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outerSwipeBlockedByCommunityRef = useRef(false);
  const outerSwipeBlockedScrollLeftRef = useRef<number | null>(null);
  const skeletonCategoryPlaceholders = [0, 1, 2];
  const skeletonChipPlaceholders = [0, 1, 2, 3];

  const getCategoryColor = (category: (typeof categories)[number]) =>
    catOverrides[category.id]?.color ?? category.color_hex ?? FALLBACK_COLOR;
  const getCategoryIcon = (category: (typeof categories)[number]) =>
    catOverrides[category.id]?.icon ?? category.icon ?? null;

  useEffect(() => {
    activeCommunitySkillCategoryIndexRef.current = activeCommunitySkillCategoryIndex;
  }, [activeCommunitySkillCategoryIndex]);

  const isInsideCommunityPickerContent = useCallback((target: EventTarget | null) => {
    return target instanceof Node && Boolean(communityContentContainerRef.current?.contains(target));
  }, []);

  const blockOuterSwipeForCommunityPicker = useCallback(() => {
    const track = trackRef.current;
    outerSwipeBlockedByCommunityRef.current = true;
    if (scrollFrame.current != null) {
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
    }
    if (!track) return;
    outerSwipeBlockedScrollLeftRef.current = track.scrollLeft;
    track.style.scrollSnapType = "none";
  }, []);

  const unblockOuterSwipeForCommunityPicker = useCallback(() => {
    const track = trackRef.current;
    if (track) {
      const blockedScrollLeft = outerSwipeBlockedScrollLeftRef.current;
      if (blockedScrollLeft !== null) {
        track.scrollLeft = blockedScrollLeft;
      }
      track.style.scrollSnapType = "";
    }
    outerSwipeBlockedByCommunityRef.current = false;
    outerSwipeBlockedScrollLeftRef.current = null;
  }, []);

  const handleOuterTouchStartCapture = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!isInsideCommunityPickerContent(event.target)) {
        outerSwipeBlockedByCommunityRef.current = false;
        outerSwipeBlockedScrollLeftRef.current = null;
        return;
      }

      blockOuterSwipeForCommunityPicker();
    },
    [blockOuterSwipeForCommunityPicker, isInsideCommunityPickerContent]
  );

  const handleOuterTouchMoveCapture = useCallback(() => {
    if (!outerSwipeBlockedByCommunityRef.current) return;

    const track = trackRef.current;
    const blockedScrollLeft = outerSwipeBlockedScrollLeftRef.current;
    if (track && blockedScrollLeft !== null && track.scrollLeft !== blockedScrollLeft) {
      track.scrollLeft = blockedScrollLeft;
    }
  }, []);

  const handleOuterTouchEndCapture = useCallback(() => {
    if (!outerSwipeBlockedByCommunityRef.current) return;
    unblockOuterSwipeForCommunityPicker();
  }, [unblockOuterSwipeForCommunityPicker]);

  const handleOuterPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isInsideCommunityPickerContent(event.target)) {
        outerSwipeBlockedByCommunityRef.current = false;
        outerSwipeBlockedScrollLeftRef.current = null;
        return;
      }

      blockOuterSwipeForCommunityPicker();
    },
    [blockOuterSwipeForCommunityPicker, isInsideCommunityPickerContent]
  );

  const handleOuterPointerMoveCapture = useCallback(() => {
    if (!outerSwipeBlockedByCommunityRef.current) return;

    const track = trackRef.current;
    const blockedScrollLeft = outerSwipeBlockedScrollLeftRef.current;
    if (track && blockedScrollLeft !== null && track.scrollLeft !== blockedScrollLeft) {
      track.scrollLeft = blockedScrollLeft;
    }
  }, []);

  const handleOuterPointerEndCapture = useCallback(() => {
    if (!outerSwipeBlockedByCommunityRef.current) return;
    unblockOuterSwipeForCommunityPicker();
  }, [unblockOuterSwipeForCommunityPicker]);

  const activeCategory = categories[activeIndex];
  const activeColor = useMemo(() => {
    if (!activeCategory) {
      return FALLBACK_COLOR;
    }
    const override = catOverrides[activeCategory.id];
    return override?.color ?? activeCategory.color_hex ?? FALLBACK_COLOR;
  }, [activeCategory, catOverrides]);
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < categories.length - 1;
  const actualCategoryCount = useMemo(
    () => categories.filter((category) => category.id !== "uncategorized").length,
    [categories]
  );
  const canAddCategory = actualCategoryCount < MAX_CATEGORY_SLOTS;
  const useFiveColumnCategoryPillGrid = shouldUseFiveColumnCategoryPillGrid(categories.length);
  const categoryPillListClass = useFiveColumnCategoryPillGrid
    ? "grid w-full max-w-4xl grid-cols-5 gap-2.5"
    : "flex flex-wrap justify-center gap-2.5";
  const communitySkillCategoryNames = communityCatalog.categoryNames;
  const activeCommunitySkillCategory =
    communitySkillCategoryNames[activeCommunitySkillCategoryIndex] ?? "Popular";
  const activeCommunityMainCategory =
    activeCommunitySkillCategory === "Popular"
      ? null
      : communityCatalog.categories.find((category) => category.name === activeCommunitySkillCategory) ??
        null;
  const communitySkillSearchQuery = communitySkillSearch.trim().toLowerCase();
  const isCommunitySkillSearching = communitySkillSearchQuery.length > 0;
  const filteredPopularCommunitySkills = useMemo(() => {
    const query = communitySkillSearch.trim().toLowerCase();

    return communityCatalog.popularSkills.filter(
      (skill) => query.length === 0 || skill.name.toLowerCase().includes(query)
    );
  }, [communityCatalog.popularSkills, communitySkillSearch]);
  const filteredCommunitySubcategories = useMemo(() => {
    if (!activeCommunityMainCategory) {
      return [];
    }

    const query = communitySkillSearch.trim().toLowerCase();

    return activeCommunityMainCategory.subcategories
      .map((subcategory) => ({
        ...subcategory,
        skills: subcategory.skills.filter(
          (skill) => query.length === 0 || skill.name.toLowerCase().includes(query)
        ),
      }))
      .filter((subcategory) => subcategory.skills.length > 0);
  }, [activeCommunityMainCategory, communitySkillSearch]);
  const filteredCommunitySkills =
    isCommunitySkillSearching
      ? communityCatalog.skills.filter((skill) =>
          skill.name.toLowerCase().includes(communitySkillSearchQuery)
        )
      : activeCommunitySkillCategory === "Popular"
      ? filteredPopularCommunitySkills
      : filteredCommunitySubcategories.flatMap((subcategory) => subcategory.skills);
  const selectedCommunitySkill = selectedCommunitySkillId
    ? communityCatalog.skills.find((skill) => selectedCommunitySkillId === (skill.id ?? skill.name))
    : null;

  const scrollCommunityResultsToIndex = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const pager = communityResultsPagerRef.current;
    if (!pager || communitySkillCategoryNames.length === 0) {
      return;
    }

    const bounded = Math.max(0, Math.min(index, communitySkillCategoryNames.length - 1));
    pager.scrollTo({
      left: pager.clientWidth * bounded,
      behavior,
    });
  }, [communitySkillCategoryNames.length]);

  const setCommunitySkillCategoryIndex = useCallback(
    (nextIndex: number, behavior: ScrollBehavior = "smooth") => {
      if (communitySkillCategoryNames.length === 0) {
        return;
      }

      const bounded = Math.max(0, Math.min(nextIndex, communitySkillCategoryNames.length - 1));
      activeCommunitySkillCategoryIndexRef.current = bounded;
      setActiveCommunitySkillCategoryIndex((current) => (current === bounded ? current : bounded));
      setOpenCommunitySkillSubcategories({});
      scrollCommunityResultsToIndex(bounded, behavior);
    },
    [communitySkillCategoryNames.length, scrollCommunityResultsToIndex]
  );

  const moveCommunitySkillCategory = useCallback((direction: -1 | 1) => {
    if (communitySkillCategoryNames.length === 0) {
      return;
    }

    setCommunitySkillCategoryIndex(
      (activeCommunitySkillCategoryIndex + direction + communitySkillCategoryNames.length) %
        communitySkillCategoryNames.length
    );
  }, [
    activeCommunitySkillCategoryIndex,
    communitySkillCategoryNames.length,
    setCommunitySkillCategoryIndex,
  ]);

  const selectCommunitySkillCategory = useCallback(
    (category: string) => {
      const nextIndex = communitySkillCategoryNames.indexOf(category);
      if (nextIndex === -1) {
        return;
      }
      setCommunitySkillCategoryIndex(nextIndex);
    },
    [communitySkillCategoryNames, setCommunitySkillCategoryIndex]
  );

  const syncCommunityCategoryFromResultsScroll = useCallback(() => {
    const pager = communityResultsPagerRef.current;
    if (!pager || pager.clientWidth <= 0 || communitySkillCategoryNames.length === 0) {
      return;
    }

    const nextIndex = Math.max(
      0,
      Math.min(
        Math.round(pager.scrollLeft / pager.clientWidth),
        communitySkillCategoryNames.length - 1
      )
    );

    setActiveCommunitySkillCategoryIndex((current) => {
      if (current === nextIndex) {
        return current;
      }
      activeCommunitySkillCategoryIndexRef.current = nextIndex;
      setOpenCommunitySkillSubcategories({});
      return nextIndex;
    });
  }, [communitySkillCategoryNames.length]);

  const handleCommunityResultsScroll = useCallback(() => {
    if (communityResultsScrollFrameRef.current !== null) {
      return;
    }

    communityResultsScrollFrameRef.current = requestAnimationFrame(() => {
      communityResultsScrollFrameRef.current = null;
      syncCommunityCategoryFromResultsScroll();
    });

    if (communityResultsScrollSettleTimeoutRef.current !== null) {
      clearTimeout(communityResultsScrollSettleTimeoutRef.current);
    }
    communityResultsScrollSettleTimeoutRef.current = setTimeout(() => {
      communityResultsScrollSettleTimeoutRef.current = null;
      syncCommunityCategoryFromResultsScroll();
    }, 120);
  }, [syncCommunityCategoryFromResultsScroll]);

  const closeCommunitySkillPicker = useCallback(() => {
    setCommunitySkillPickerOpen(false);
    setSelectedCommunitySkillId(null);
    setCommunitySkillSearch("");
    setSkillSuggestionPanelOpen(false);
    setSuggestedSkillName("");
    setSuggestedSkillIcon("");
    activeCommunitySkillCategoryIndexRef.current = 0;
    setActiveCommunitySkillCategoryIndex(0);
    setOpenCommunitySkillSubcategories({});
    communityResultsPagerRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCommunityCatalog() {
      setIsCommunityCatalogLoading(true);
      try {
        const catalog = await fetchCommunityCatalog();
        if (!isMounted) return;
        setCommunityCatalog(catalog);
        setCommunityCatalogError(null);
      } catch (error) {
        console.error("Error loading global skill catalog:", error);
        if (!isMounted) return;
        setCommunityCatalog(buildFallbackCommunityCatalog());
        setCommunityCatalogError(error instanceof Error ? error.message : "Catalog unavailable");
      } finally {
        if (isMounted) {
          setIsCommunityCatalogLoading(false);
        }
      }
    }

    void loadCommunityCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeCommunitySkillCategoryIndex >= communitySkillCategoryNames.length) {
      setActiveCommunitySkillCategoryIndex(0);
      setOpenCommunitySkillSubcategories({});
      scrollCommunityResultsToIndex(0, "auto");
    }
  }, [
    activeCommunitySkillCategoryIndex,
    communitySkillCategoryNames.length,
    scrollCommunityResultsToIndex,
  ]);

  useEffect(() => {
    if (!communitySkillPickerOpen || isCommunitySkillSearching) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      scrollCommunityResultsToIndex(activeCommunitySkillCategoryIndexRef.current, "auto");
    });

    return () => cancelAnimationFrame(frame);
  }, [
    communitySkillPickerOpen,
    isCommunitySkillSearching,
    communitySkillCategoryNames.length,
    scrollCommunityResultsToIndex,
  ]);

  useEffect(() => {
    if (communitySkillPickerOpen && isCommunitySkillSearching) {
      return;
    }

    setSkillSuggestionPanelOpen(false);
  }, [communitySkillPickerOpen, isCommunitySkillSearching]);

  useEffect(() => {
    const pager = communityResultsPagerRef.current;
    if (!pager) {
      return;
    }

    pager.addEventListener("scrollend", syncCommunityCategoryFromResultsScroll);
    return () => {
      pager.removeEventListener("scrollend", syncCommunityCategoryFromResultsScroll);
    };
  }, [communitySkillPickerOpen, isCommunitySkillSearching, syncCommunityCategoryFromResultsScroll]);

  useEffect(() => {
    return () => {
      if (communityResultsScrollFrameRef.current !== null) {
        cancelAnimationFrame(communityResultsScrollFrameRef.current);
        communityResultsScrollFrameRef.current = null;
      }
      if (communityResultsScrollSettleTimeoutRef.current !== null) {
        clearTimeout(communityResultsScrollSettleTimeoutRef.current);
        communityResultsScrollSettleTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!communitySkillPickerOpen) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      const activeCategoryButton =
        communityCategoryButtonRefs.current[activeCommunitySkillCategoryIndex];
      activeCategoryButton?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [activeCommunitySkillCategoryIndex, communitySkillPickerOpen]);

  const loadExistingSkillSortItems = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("skills")
        .select("id,name,cat_id,global_skill_id,sort_order")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) {
        const skillRows = await getSkillsForUser(user.id);

        setExistingSkillSortItems(
          (skillRows || []).map((skill) => ({
            id: skill.id,
            name: skill.name,
            cat_id: skill.cat_id,
            sort_order: skill.sort_order ?? null,
          }))
        );
        return;
      }

      setExistingSkillSortItems(
        (data || []).map((skill) => ({
          id: skill.id,
          name: skill.name,
          cat_id: skill.cat_id,
          global_skill_id: skill.global_skill_id ?? null,
          sort_order: skill.sort_order ?? null,
        }))
      );
    } catch (error) {
      console.error("Error loading skill sort data:", error);
    }
  }, []);

  useEffect(() => {
    void loadExistingSkillSortItems();
  }, [loadExistingSkillSortItems]);

  useEffect(() => {
    if (!canAddCategory && isAddCategoryMenuOpen) {
      setIsAddCategoryMenuOpen(false);
    }
  }, [canAddCategory, isAddCategoryMenuOpen]);

  useEffect(() => {
    if (!isAddCategoryMenuOpen) {
      setNewCategoryName("");
      setNewCategoryEmoji(DEFAULT_CATEGORY_EMOJI);
      setNewCategoryColor(FALLBACK_COLOR);
    }
  }, [isAddCategoryMenuOpen]);

  useEffect(() => {
    if (isAddCategoryMenuOpen) {
      requestAnimationFrame(() => {
        addCategoryNameRef.current?.focus();
      });
    }
  }, [isAddCategoryMenuOpen]);

  useEffect(() => {
    if (!isAddCategoryMenuOpen) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      if (addCategoryMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsAddCategoryMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAddCategoryMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isAddCategoryMenuOpen]);

  const handleSkillDragStart = useCallback((skill: Skill, categoryId: string) => {
    setDraggingSkill(skill);
    setDragOriginCategoryId(categoryId);
  }, []);

  const handleCategoryDragEnter = useCallback(
    (categoryId: string) => {
      if (!draggingSkill) return;
      setDropTargetCategoryId(categoryId);
    },
    [draggingSkill]
  );

  const handleCategoryDragLeave = useCallback(
    (categoryId: string) => {
      if (dropTargetCategoryId === categoryId) {
        setDropTargetCategoryId(null);
      }
    },
    [dropTargetCategoryId]
  );

  const moveSkillBetweenCategories = useCallback(
    async (skill: Skill, targetCategoryId: string) => {
      setIsMovingSkill(true);
      try {
        const targetSkills = skillsByCategory[targetCategoryId] ?? [];
        const nextSortOrder =
          targetSkills.reduce((max, item) => Math.max(max, item.sort_order ?? 0), 0) + 1;
        const targetCatId = targetCategoryId === "uncategorized" ? null : targetCategoryId;

        const { error } = await updateRecord<SkillRow>("skills", skill.id, {
          cat_id: targetCatId,
          sort_order: nextSortOrder,
        });
        if (error) {
          throw error;
        }
        await reload();
      } catch (error) {
        console.error("Failed to move skill between categories", error);
        toast.error("Could not move skill", error instanceof Error ? error.message : "Try again.");
      } finally {
        setIsMovingSkill(false);
      }
    },
    [reload, skillsByCategory, toast]
  );

  const handleSkillDragEnd = useCallback(() => {
    const skillToMove = draggingSkill;
    const targetCategoryId = dropTargetCategoryId;
    const originCategoryId = dragOriginCategoryId;
    setDraggingSkill(null);
    setDragOriginCategoryId(null);
    setDropTargetCategoryId(null);

    if (
      skillToMove &&
      targetCategoryId &&
      originCategoryId &&
      targetCategoryId !== originCategoryId &&
      !isMovingSkill
    ) {
      void moveSkillBetweenCategories(skillToMove, targetCategoryId);
    }
  }, [
    draggingSkill,
    dropTargetCategoryId,
    dragOriginCategoryId,
    isMovingSkill,
    moveSkillBetweenCategories,
  ]);

  const firstReorderableIndex = useMemo(() => categories.findIndex(isReorderable), [categories]);
  const lastReorderableIndex = useMemo(() => {
    for (let idx = categories.length - 1; idx >= 0; idx -= 1) {
      const category = categories[idx];
      if (category && isReorderable(category)) {
        return idx;
      }
    }
    return -1;
  }, [categories]);

  useEffect(() => {
    setCategories((previous) => {
      if (previous === fetchedCategories) {
        return previous;
      }

      if (previous.length === fetchedCategories.length) {
        let identical = true;
        for (let idx = 0; idx < previous.length; idx += 1) {
          const a = previous[idx];
          const b = fetchedCategories[idx];
          if (
            a.id !== b.id ||
            a.name !== b.name ||
            a.color_hex !== b.color_hex ||
            a.icon !== b.icon ||
            a.order !== b.order
          ) {
            identical = false;
            break;
          }
        }
        if (identical) {
          return previous;
        }
      }

      return fetchedCategories;
    });
  }, [fetchedCategories]);

  useEffect(() => {
    setCatOverrides((prev) => {
      let changed = false;
      const next: Record<string, { color?: string | null; icon?: string | null }> = {};
      for (const category of categories) {
        const existing = prev[category.id];
        const color = existing?.color ?? category.color_hex ?? FALLBACK_COLOR;
        const icon = existing?.icon ?? category.icon ?? null;
        next[category.id] = { color, icon };
        if (!existing || existing.color !== color || existing.icon !== icon) {
          changed = true;
        }
      }

      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }

      return next;
    });
  }, [categories]);

  const scrollToIndex = useCallback(
    (index: number, options: { instant?: boolean; skipUrl?: boolean } = {}) => {
      if (categories.length === 0) return;

      const bounded = Math.max(0, Math.min(index, categories.length - 1));
      const track = trackRef.current;
      const card = cardRefs.current[bounded];

      if (track && card) {
        const trackRect = track.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const offset = cardRect.left - trackRect.left;
        const target =
          track.scrollLeft + offset - (trackRect.width - cardRect.width) / 2;
        const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
        const nextScroll = Math.max(0, Math.min(target, maxScroll));

        if (options.instant) {
          track.scrollLeft = nextScroll;
        } else if (typeof track.scrollTo === "function") {
          track.scrollTo({ left: nextScroll, behavior: "smooth" });
        } else {
          track.scrollLeft = nextScroll;
        }
      }

      activeIndexRef.current = bounded;
      setActiveIndex((prev) => (prev === bounded ? prev : bounded));

      if (!options.skipUrl && categories[bounded]) {
        const nextId = categories[bounded].id;
        if (search.get("cat") !== nextId) {
          const params = new URLSearchParams(search);
          params.set("cat", nextId);
          startTransition(() => {
            router.replace(`?${params.toString()}`, { scroll: false });
          });
        }
      }
    },
    [categories, router, search]
  );

  const syncToNearestCard = useCallback(() => {
    const track = trackRef.current;
    if (!track || categories.length === 0) return;

    const trackRect = track.getBoundingClientRect();
    const center = trackRect.left + trackRect.width / 2;

    let nearest = activeIndexRef.current;
    let minDistance = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((card, idx) => {
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const distance = Math.abs(cardCenter - center);

      if (distance < minDistance) {
        nearest = idx;
        minDistance = distance;
      }
    });

    if (nearest !== activeIndexRef.current) {
      activeIndexRef.current = nearest;
      setActiveIndex((prev) => (prev === nearest ? prev : nearest));

      const nextId = categories[nearest]?.id;
      if (nextId && search.get("cat") !== nextId) {
        const params = new URLSearchParams(search);
        params.set("cat", nextId);
        startTransition(() => {
          router.replace(`?${params.toString()}`, { scroll: false });
        });
      }
    }
  }, [categories, router, search]);

  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, categories.length);
    if (categories.length === 0) {
      return;
    }

    if (activeIndexRef.current >= categories.length) {
      const fallback = Math.max(0, categories.length - 1);
      scrollToIndex(fallback, { instant: true });
    } else {
      scrollToIndex(activeIndexRef.current, { instant: true, skipUrl: true });
    }
  }, [categories.length, scrollToIndex]);

  useEffect(() => {
    setOpenMenuFor((current) => {
      if (!current) return null;
      const activeCategory = categories[activeIndex];
      return activeCategory?.id === current ? current : null;
    });
  }, [activeIndex, categories]);

  useEffect(() => {
    if (categories.length === 0) return;

    const initialId = search.get("cat") || undefined;
    const initialIndex = deriveInitialIndex(categories, initialId);

    activeIndexRef.current = initialIndex;
    setActiveIndex(initialIndex);

    const frame = requestAnimationFrame(() => {
      scrollToIndex(initialIndex, { instant: true, skipUrl: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [categories, scrollToIndex, search]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || categories.length === 0) return;

    const handleScroll = () => {
      if (outerSwipeBlockedByCommunityRef.current) {
        const blockedScrollLeft = outerSwipeBlockedScrollLeftRef.current;
        if (blockedScrollLeft !== null && track.scrollLeft !== blockedScrollLeft) {
          track.scrollLeft = blockedScrollLeft;
        }
        return;
      }

      if (scrollFrame.current != null) {
        cancelAnimationFrame(scrollFrame.current);
      }

      scrollFrame.current = requestAnimationFrame(() => {
        scrollFrame.current = null;
        syncToNearestCard();
      });
    };

    handleScroll();
    track.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (scrollFrame.current != null) {
        cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = null;
      }
      track.removeEventListener("scroll", handleScroll);
    };
  }, [categories.length, syncToNearestCard]);

  useEffect(() => {
    const handleResize = () => {
      scrollToIndex(activeIndexRef.current, { instant: true, skipUrl: true });
      requestAnimationFrame(syncToNearestCard);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scrollToIndex, syncToNearestCard]);

  const persistCategoryOrder = useCallback(async (nextCategories: Category[]) => {
    const persistedOrders = derivePersistedCategoryOrders(
      nextCategories.map((category) => ({
        id: category.id,
        isReorderable: isReorderable(category),
      }))
    );
    const categoryIds = Object.keys(persistedOrders);
    if (categoryIds.length === 0) {
      return;
    }
    setIsSavingOrder(true);
    try {
      await Promise.all(
        categoryIds.map((categoryId) => updateCatOrder(categoryId, persistedOrders[categoryId] ?? 1))
      );
    } catch (error) {
      console.error("Failed to update category order", error);
    } finally {
      setIsSavingOrder(false);
    }
  }, []);

  const handleAddCategoryButtonClick = useCallback(() => {
    if (!canAddCategory || isCreatingCategory) return;
    setIsAddCategoryMenuOpen((previous) => {
      const next = !previous;
      if (next) {
        setNewCategoryName("");
        setNewCategoryColor(activeColor);
        setNewCategoryEmoji(DEFAULT_CATEGORY_EMOJI);
      }
      return next;
    });
  }, [activeColor, canAddCategory, isCreatingCategory]);

  const handleCreateCategory = useCallback(async () => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      addCategoryNameRef.current?.focus();
      return;
    }

    setIsCreatingCategory(true);
    try {
      const { data, error } = await createRecord<Category>("cats", {
        name: trimmedName,
        color_hex: newCategoryColor,
        icon: newCategoryEmoji.trim() || null,
      });
      if (error || !data) {
        toast.error("Failed to create category", error?.message || "Please try again.");
        return;
      }
      toast.success("Category created", `${trimmedName} is now available in the carousel.`);
      void reload();
      setIsAddCategoryMenuOpen(false);
    } catch (err) {
      console.error("Failed to create category", err);
      toast.error(
        "Failed to create category",
        err instanceof Error ? err.message : "Please try again."
      );
    } finally {
      setIsCreatingCategory(false);
    }
  }, [newCategoryColor, newCategoryEmoji, newCategoryName, reload, toast]);

  const handleAddSkill = useCallback(
    async (skill: SkillCreateInput) => {
      const catIdToUse = skill.cat_id && UUID_REGEX.test(skill.cat_id) ? skill.cat_id : null;
      const highestSortOrderInCategory = existingSkillSortItems
        .filter((existing) => {
          const existingCategory = existing.cat_id || "";
          const newCategory = catIdToUse || "";
          return existingCategory === newCategory;
        })
        .reduce((max, existing) => Math.max(max, existing.sort_order ?? 0), 0);
      const nextSortOrder = highestSortOrderInCategory + 1;

      const { data, error } = await createRecord<SkillRow & { global_skill_id?: string | null }>(
        "skills",
        {
          name: skill.name,
          icon: skill.icon,
          level: skill.level,
          cat_id: catIdToUse,
          sort_order: nextSortOrder,
          monument_id: skill.monument_id ?? null,
          ...(skill.global_skill_id ? { global_skill_id: skill.global_skill_id } : {}),
        }
      );

      if (error || !data) {
        console.error("Error creating skill:", error);
        toast.error("Error", error?.message || "Failed to create skill");
        return false;
      }

      setExistingSkillSortItems((previous) => {
        if (previous.some((existing) => existing.id === data.id)) {
          return previous;
        }
        return [
          ...previous,
          {
            id: data.id,
            name: data.name,
            cat_id: catIdToUse,
            global_skill_id: skill.global_skill_id ?? null,
            sort_order: data.sort_order ?? nextSortOrder,
          },
        ];
      });
      void reload();
      return true;
    },
    [existingSkillSortItems, reload, toast]
  );

  const handleConfirmCommunitySkill = useCallback(async () => {
    if (!selectedCommunitySkill) return;

    toast.info("Adding skill...", selectedCommunitySkill.name);

    const selectedGlobalSkillId = selectedCommunitySkill.id;
    const normalizedSelectedName = normalizeSkillName(selectedCommunitySkill.name);
    const alreadyAdded = existingSkillSortItems.some((skill) => {
      if (selectedGlobalSkillId && skill.global_skill_id === selectedGlobalSkillId) {
        return true;
      }
      return normalizeSkillName(skill.name) === normalizedSelectedName;
    });

    if (alreadyAdded) {
      toast.info("Skill already added");
      return;
    }

    const matchedCategory = selectedCommunitySkill.categoryName
      ? categories.find((category) => {
          return (
            isReorderable(category) &&
            UUID_REGEX.test(category.id) &&
            normalizeCategoryName(category.name) ===
              normalizeCategoryName(selectedCommunitySkill.categoryName ?? "")
          );
        }) ?? null
      : null;
    const matchedCategoryId = matchedCategory?.id ?? null;
    const created = await handleAddSkill({
      name: selectedCommunitySkill.name,
      icon: selectedCommunitySkill.icon,
      level: 1,
      cat_id: matchedCategoryId,
      monument_id: null,
      global_skill_id: selectedGlobalSkillId,
    });

    if (!created) {
      return;
    }

    toast.success(
      "Skill added",
      matchedCategory
        ? `${selectedCommunitySkill.name} was added to ${matchedCategory.name.toUpperCase()}.`
        : `${selectedCommunitySkill.name} was added.`
    );
    closeCommunitySkillPicker();
  }, [
    closeCommunitySkillPicker,
    categories,
    existingSkillSortItems,
    handleAddSkill,
    selectedCommunitySkill,
    toast,
  ]);

  type ReorderDirection = "left" | "right" | "first" | "last";

  const reorderCategory = useCallback(
    (categoryId: string, direction: ReorderDirection) => {
      if (isSavingOrder) return;

      let nextCategories: Category[] | null = null;
      setCategories((previous) => {
        const currentIndex = previous.findIndex((category) => category.id === categoryId);
        if (currentIndex === -1) return previous;
        const currentCategory = previous[currentIndex];
        if (!currentCategory || !isReorderable(currentCategory)) {
          return previous;
        }
        const targetIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;

        const firstReorderableIndex = previous.findIndex(isReorderable);
        const lastReorderableIndex = (() => {
          for (let idx = previous.length - 1; idx >= 0; idx -= 1) {
            const category = previous[idx];
            if (category && isReorderable(category)) {
              return idx;
            }
          }
          return -1;
        })();

        if (firstReorderableIndex === -1 || lastReorderableIndex === -1) {
          return previous;
        }

        let updated: Category[] | null = null;

        if (direction === "left" || direction === "right") {
          if (targetIndex < firstReorderableIndex || targetIndex > lastReorderableIndex) {
            return previous;
          }
          const targetCategory = previous[targetIndex];
          if (!targetCategory || !isReorderable(targetCategory)) {
            return previous;
          }

          updated = [...previous];
          [updated[currentIndex], updated[targetIndex]] = [
            updated[targetIndex],
            updated[currentIndex],
          ];
        } else if (direction === "first") {
          if (currentIndex === firstReorderableIndex) return previous;
          updated = [...previous];
          const [category] = updated.splice(currentIndex, 1);
          updated.splice(firstReorderableIndex, 0, category);
        } else if (direction === "last") {
          if (currentIndex === lastReorderableIndex) return previous;
          updated = [...previous];
          const [category] = updated.splice(currentIndex, 1);
          // When removing an earlier item, the last index shifts by -1, so insert at updated length constrained by
          // the last reorderable slot.
          const insertionIndex = Math.min(lastReorderableIndex, updated.length);
          updated.splice(insertionIndex, 0, category);
        }

        if (!updated) {
          return previous;
        }

        const mapped = updated.map((category, index) => ({
          ...category,
          order: index + 1,
        }));

        nextCategories = mapped;

        const activeId = previous[activeIndexRef.current]?.id;
        if (activeId) {
          const nextActiveIndex = mapped.findIndex((category) => category.id === activeId);
          if (nextActiveIndex !== -1 && nextActiveIndex !== activeIndexRef.current) {
            activeIndexRef.current = nextActiveIndex;
            setActiveIndex(nextActiveIndex);
          }
        }

        return mapped;
      });

      if (nextCategories) {
        void persistCategoryOrder(nextCategories);
      }
    },
    [isSavingOrder, persistCategoryOrder]
  );

  const handleCategoryNameChange = useCallback(() => {
    void reload();
  }, [reload]);

  const handleCategoryDelete = useCallback(
    (categoryId: string) => {
      setCategories((previous) => previous.filter((category) => category.id !== categoryId));
      void reload();
    },
    [reload]
  );

  if (isLoading) {
    return (
      <div className="relative" role="status" aria-live="polite" aria-busy>
        <span className="sr-only">Loading skill categories…</span>
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/70 px-2 py-6 shadow-lg sm:px-4">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black"
            aria-hidden
          />
          <div className="relative flex gap-5 overflow-hidden px-2 sm:px-3">
            {skeletonCategoryPlaceholders.map((placeholder) => (
              <div
                key={placeholder}
                className="w-[85vw] shrink-0 sm:w-[70vw] lg:w-[52vw] xl:w-[44vw]"
                style={{ scrollMarginInline: "12px" }}
              >
                <div className="flex h-full animate-pulse flex-col justify-between rounded-[26px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-lg">
                  <div className="flex flex-col gap-4">
                    <div className="h-8 w-8 rounded-full bg-white/[0.08]" />
                    <div className="h-6 w-2/3 rounded-full bg-white/[0.08]" />
                    <div className="space-y-3">
                      {skeletonCategoryPlaceholders.map((line) => (
                        <div key={line} className="h-5 w-full rounded-full bg-white/[0.06]" />
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-white/[0.07]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded-full bg-white/[0.06]" />
                      <div className="h-3 w-1/3 rounded-full bg-white/[0.04]" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {skeletonChipPlaceholders.map((placeholder) => (
            <div
              key={placeholder}
              className="inline-flex animate-pulse items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-1.5 text-sm text-slate-300/80"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-sm" />
              <span className="hidden h-4 w-16 rounded-full bg-white/[0.06] sm:block" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!isLoading && categories.length === 0) {
    return (
      <div className="relative">
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/70 px-4 py-6 shadow-lg sm:px-6">
          <div className="space-y-1 text-left">
            <p className="text-xs font-semibold tracking-[0.4em] text-slate-300/70">SKILLS</p>
            <h3 className="text-xl font-semibold text-white">No skills yet</h3>
            <p className="text-sm text-slate-400">
              Set up your skill stack (5 categories, ~25 skills) to personalize CREATOR.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setCommunitySkillPickerOpen(true)}
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-950 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Plus className="mr-2 h-4 w-4" />
              ADD SKILL
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isCreateCategoryDisabled = isCreatingCategory || newCategoryName.trim().length === 0;

  return (
    <>
      <div
        className="relative"
        role="region"
        aria-roledescription="carousel"
        aria-label="Skill categories"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollToIndex(activeIndexRef.current - 1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollToIndex(activeIndexRef.current + 1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            cardRefs.current[activeIndexRef.current]
              ?.querySelector<HTMLButtonElement>("button")
              ?.click();
          }
        }}
      >
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/70 px-2 py-6 shadow-lg sm:px-4">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black" aria-hidden />
          {categories.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous category"
                onClick={() => scrollToIndex(activeIndexRef.current - 1)}
                disabled={!canGoPrev}
                className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border text-slate-100 shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-35 sm:flex"
                style={{
                  backgroundColor: withAlpha(activeColor, 0.18),
                  borderColor: withAlpha(activeColor, 0.35),
                  boxShadow: `0 16px 40px ${withAlpha(activeColor, 0.22)}`,
                }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Next category"
                onClick={() => scrollToIndex(activeIndexRef.current + 1)}
                disabled={!canGoNext}
                className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border text-slate-100 shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-35 sm:flex"
                style={{
                  backgroundColor: withAlpha(activeColor, 0.18),
                  borderColor: withAlpha(activeColor, 0.35),
                  boxShadow: `0 16px 40px ${withAlpha(activeColor, 0.22)}`,
                }}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <div
            ref={trackRef}
            className={`relative flex snap-x gap-5 overflow-x-auto overflow-y-hidden px-2 sm:px-3 ${
              skillDragging ? "snap-none touch-none" : "snap-mandatory [touch-action:pan-x_pan-y]"
            }`}
            onTouchStartCapture={handleOuterTouchStartCapture}
            onTouchMoveCapture={handleOuterTouchMoveCapture}
            onTouchEndCapture={handleOuterTouchEndCapture}
            onTouchCancelCapture={handleOuterTouchEndCapture}
            onPointerDownCapture={handleOuterPointerDownCapture}
            onPointerMoveCapture={handleOuterPointerMoveCapture}
            onPointerUpCapture={handleOuterPointerEndCapture}
            onPointerCancelCapture={handleOuterPointerEndCapture}
          >
            {categories.map((category, idx) => {
              const isActive = idx === activeIndex;
              const isUncategorized = category.id === "uncategorized";
              const isLocked = Boolean(category.is_locked);
              const canMoveLeft =
                !isUncategorized && !isLocked && idx > firstReorderableIndex && firstReorderableIndex !== -1;
              const canMoveRight =
                !isUncategorized && !isLocked && idx < lastReorderableIndex && lastReorderableIndex !== -1;
              return (
                <div
                  key={category.id}
                  ref={(element) => {
                    cardRefs.current[idx] = element;
                  }}
                  role="group"
                  aria-label={`Category ${idx + 1} of ${categories.length}`}
                  className="w-[85vw] shrink-0 snap-center sm:w-[70vw] lg:w-[52vw] xl:w-[44vw]"
                  style={{ scrollMarginInline: "12px" }}
                >
                  <CategoryCard
                    category={category}
                    skills={skillsByCategory[category.id] || []}
                    active={isActive}
                    onSkillDrag={setSkillDragging}
                    colorOverride={getCategoryColor(category)}
                    iconOverride={getCategoryIcon(category)}
                    progressBySkillId={progressBySkillId}
                    isDropTarget={dropTargetCategoryId === category.id}
                    isDraggingSkill={Boolean(draggingSkill)}
                    onSkillDragStart={(skill) => handleSkillDragStart(skill, category.id)}
                    onSkillDragEnd={handleSkillDragEnd}
                    onDragCategoryHover={() => handleCategoryDragEnter(category.id)}
                    onDragCategoryLeave={() => handleCategoryDragLeave(category.id)}
                    menuOpen={openMenuFor === category.id}
                    onMenuOpenChange={(open) => {
                      setOpenMenuFor((current) => {
                        if (open) {
                          return category.id;
                        }
                        return current === category.id ? null : current;
                      });
                    }}
                    onColorChange={(color) =>
                      setCatOverrides((prev) => ({
                        ...prev,
                        [category.id]: {
                          ...(prev[category.id] || {}),
                          color,
                          icon: prev[category.id]?.icon ?? category.icon ?? null,
                        },
                      }))
                    }
                    onIconChange={(icon) =>
                      setCatOverrides((prev) => ({
                        ...prev,
                        [category.id]: {
                          ...(prev[category.id] || {}),
                          icon,
                          color: prev[category.id]?.color ?? category.color_hex ?? FALLBACK_COLOR,
                        },
                      }))
                    }
                    onNameChange={handleCategoryNameChange}
                    onDeleteCategory={handleCategoryDelete}
                    onReorder={(direction) => {
                      if (category.is_locked) return;
                      reorderCategory(category.id, direction);
                    }}
                    canMoveLeft={canMoveLeft}
                    canMoveRight={canMoveRight}
                    canMoveToStart={canMoveLeft}
                    canMoveToEnd={canMoveRight}
                    isReordering={isSavingOrder}
                  />
                </div>
              );
            })}
            <div
              role="group"
              aria-label={communitySkillPickerOpen ? "Community skills picker" : "Add skill"}
              className="w-[85vw] shrink-0 snap-center sm:w-[70vw] lg:w-[52vw] xl:w-[44vw]"
              style={{ scrollMarginInline: "12px" }}
            >
              {communitySkillPickerOpen ? (
                <div className="relative flex h-full min-h-[23rem] w-full flex-col overflow-hidden rounded-[26px] border border-white/[0.1] bg-[#030303]/95 text-white shadow-[0_18px_42px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-300 sm:min-h-[24rem]">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.1),transparent_46%)]"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-[1px] rounded-[24px] border border-white/[0.06]"
                  />
                  <div className="relative z-10 px-3 pb-2.5 pt-3 sm:px-4">
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400/75" />
                      <input
                        type="search"
                        value={communitySkillSearch}
                        onChange={(event) => setCommunitySkillSearch(event.target.value)}
                        placeholder="Search skills"
                        className="h-8 w-full rounded-full border border-white/10 bg-white/[0.035] pl-8 pr-3 text-xs text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-white/20 focus:ring-2 focus:ring-white/15 focus-visible:ring-white/25"
                      />
                    </div>
                    <div className="mt-2.5 grid grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveCommunitySkillCategory(-1)}
                        aria-label="Previous community skill category"
                        className="flex h-7 w-7 items-center justify-center border border-transparent p-0 text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex min-w-0 snap-x snap-mandatory items-end gap-4 overflow-x-auto overscroll-x-contain px-1 text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {communitySkillCategoryNames.map((category, index) => {
                          const isActive = index === activeCommunitySkillCategoryIndex;

                          return (
                            <button
                              key={category}
                              ref={(node) => {
                                communityCategoryButtonRefs.current[index] = node;
                              }}
                              type="button"
                              onClick={() => selectCommunitySkillCategory(category)}
                              aria-current={isActive ? "true" : undefined}
                              className={`relative flex-none snap-center whitespace-nowrap px-1.5 pb-1.5 text-[11px] font-medium uppercase tracking-normal transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                                isActive
                                  ? "text-zinc-100"
                                  : "text-zinc-600 hover:text-zinc-300"
                              }`}
                            >
                              {category}

                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => moveCommunitySkillCategory(1)}
                        aria-label="Next community skill category"
                        className="flex h-7 w-7 items-center justify-center border border-transparent p-0 text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div
                    ref={communityContentContainerRef}
                    className="relative z-10 min-h-0 flex-1 overflow-hidden overscroll-contain overscroll-x-contain px-3 py-2 [overscroll-behavior:contain] sm:px-4"
                    onTouchStart={(e) => {
                      e.stopPropagation();
                    }}
                    onTouchMove={(e) => {
                      e.stopPropagation();
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                    }}
                    onTouchCancel={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {isCommunityCatalogLoading ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-6 text-center text-xs text-zinc-500">
                          Loading skills...
                        </div>
                      </div>
                    ) : isCommunitySkillSearching ? (
                      <div
                        data-community-results-scroll
                        className="h-full min-h-0 overflow-y-auto overscroll-y-contain"
                      >
                        <div className="flex flex-wrap gap-1.5">
                          {filteredCommunitySkills.map((skill) => {
                            const skillKey = skill.id ?? skill.name;
                            const isSelected = selectedCommunitySkillId === skillKey;
                            return (
                              <button
                                key={skillKey}
                                type="button"
                                onClick={() => setSelectedCommunitySkillId(skillKey)}
                                aria-pressed={isSelected}
                                className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-left text-[11px] font-medium leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 ${
                                  isSelected
                                    ? "border-white/25 bg-white/[0.065] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.13),inset_0_-1px_0_rgba(255,255,255,0.05),0_0_20px_rgba(255,255,255,0.07)]"
                                    : "border-white/[0.035] bg-zinc-950/90 text-zinc-500 hover:border-white/15 hover:text-zinc-200 active:border-white/20 active:text-zinc-100"
                                }`}
                              >
                                <span className="shrink-0 text-[12px] text-zinc-200" aria-hidden>
                                  {skill.icon}
                                </span>
                                <span className="truncate">{skill.name}</span>
                                <span
                                  className={isSelected ? "shrink-0 text-zinc-200/85" : "hidden"}
                                  aria-hidden
                                >
                                  <Check className="h-3 w-3" />
                                </span>
                              </button>
                            );
                          })}
                          <div className="relative inline-flex">
                            <button
                              type="button"
                              onClick={() => setSkillSuggestionPanelOpen((isOpen) => !isOpen)}
                              aria-expanded={skillSuggestionPanelOpen}
                              className="inline-flex h-7 items-center rounded-full border border-white/[0.025] bg-white/[0.018] px-2.5 text-left text-[11px] font-medium leading-none text-zinc-600 transition hover:border-white/10 hover:bg-white/[0.035] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                            >
                              +
                            </button>
                            {skillSuggestionPanelOpen && (
                              <div className="absolute left-0 top-9 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-zinc-950/95 p-3 text-zinc-200 shadow-[0_18px_36px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.06)]">
                                <div className="mb-2 flex items-center gap-2">
                                  <p className="text-[11px] font-semibold text-zinc-200">
                                    Suggest skill
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={suggestedSkillIcon}
                                    onChange={(event) => setSuggestedSkillIcon(event.target.value)}
                                    placeholder="✦"
                                    className="h-8 w-10 shrink-0 rounded-lg border border-white/10 bg-white/[0.035] px-2 text-center text-xs text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-white/20 focus:ring-2 focus:ring-white/15"
                                  />
                                  <input
                                    type="text"
                                    value={suggestedSkillName}
                                    onChange={(event) => setSuggestedSkillName(event.target.value)}
                                    placeholder="Skill name"
                                    className="h-8 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-xs font-medium text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-white/25 focus:ring-2 focus:ring-white/15"
                                  />
                                  <Button
                                    type="button"
                                    onClick={() => setSkillSuggestionPanelOpen(false)}
                                    aria-label="Discard skill suggestion"
                                    variant="cancelSquare"
                                    size="iconSquare"
                                    className="h-8 w-8 shrink-0 drop-shadow-xl transform-none touch-manipulation transition-none hover:scale-100 active:translate-y-0"
                                  >
                                    <X
                                      className="h-4 w-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                  <Button
                                    type="button"
                                    disabled
                                    aria-label="Save skill suggestion"
                                    variant="confirmSquare"
                                    size="iconSquare"
                                    className="h-8 w-8 shrink-0 drop-shadow-xl transform-none touch-manipulation bg-white/10 text-white opacity-50 transition-none hover:scale-100 hover:bg-white/20 active:translate-y-0"
                                  >
                                    <Check
                                      className="h-4 w-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        {communityCatalog.source === "fallback" && communityCatalogError && (
                          <p className="mt-2 px-1 text-[10px] text-zinc-600">
                            Showing starter skills while the catalog is unavailable.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div
                        ref={communityResultsPagerRef}
                        className="h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [touch-action:pan-x_pan-y] [&::-webkit-scrollbar]:hidden"
                        onScroll={handleCommunityResultsScroll}
                      >
                        <div
                          className="flex h-full w-full min-w-0"
                        >
                        {(() => {
                          const query = communitySkillSearch.trim().toLowerCase();

                          return communitySkillCategoryNames.map((categoryName) => {
                            const mainCategory =
                              categoryName === "Popular"
                                ? null
                                : communityCatalog.categories.find(
                                    (c) => c.name === categoryName
                                  ) ?? null;
                            const flatSkills =
                              categoryName === "Popular"
                                ? communityCatalog.popularSkills.filter(
                                    (s) => query.length === 0 || s.name.toLowerCase().includes(query)
                                  )
                                : mainCategory
                                  ? mainCategory.subcategories
                                      .map((sub) => ({
                                        ...sub,
                                        skills: sub.skills.filter(
                                          (s) =>
                                            query.length === 0 || s.name.toLowerCase().includes(query)
                                        ),
                                      }))
                                      .filter((sub) => sub.skills.length > 0)
                                      .flatMap((sub) => sub.skills)
                                  : [];
                            const panelSubcategories =
                              categoryName === "Popular" || !mainCategory
                                ? []
                                : mainCategory.subcategories
                                    .map((sub) => ({
                                      ...sub,
                                      skills: sub.skills.filter(
                                        (s) =>
                                          query.length === 0 || s.name.toLowerCase().includes(query)
                                      ),
                                    }))
                                    .filter((sub) => sub.skills.length > 0);

                            return (
                              <div
                                key={categoryName}
                                data-community-results-scroll
                                className="h-full min-h-0 w-full min-w-full shrink-0 snap-start overflow-y-auto overscroll-y-contain"
                              >
                                {categoryName === "Popular" ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {flatSkills.map((skill) => {
                                      const skillKey = skill.id ?? skill.name;
                                      const isSelected = selectedCommunitySkillId === skillKey;
                                      return (
                                        <button
                                          key={skillKey}
                                          type="button"
                                          onClick={() => setSelectedCommunitySkillId(skillKey)}
                                          aria-pressed={isSelected}
                                          className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-left text-[11px] font-medium leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 ${
                                            isSelected
                                              ? "border-white/25 bg-white/[0.065] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.13),inset_0_-1px_0_rgba(255,255,255,0.05),0_0_20px_rgba(255,255,255,0.07)]"
                                              : "border-white/[0.035] bg-zinc-950/90 text-zinc-500 hover:border-white/15 hover:text-zinc-200 active:border-white/20 active:text-zinc-100"
                                          }`}
                                        >
                                          <span className="shrink-0 text-[12px] text-zinc-200" aria-hidden>
                                            {skill.icon}
                                          </span>
                                          <span className="truncate">{skill.name}</span>
                                          <span
                                            className={isSelected ? "shrink-0 text-zinc-200/85" : "hidden"}
                                            aria-hidden
                                          >
                                            <Check className="h-3 w-3" />
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    {panelSubcategories.map((subcategory) => {
                                      const subcategoryKey = subcategory.id;
                                      const isOpen = Boolean(
                                        openCommunitySkillSubcategories[subcategoryKey]
                                      );
                                      return (
                                        <div
                                          key={subcategory.id}
                                          className="border-b border-white/[0.055] pb-1.5 last:border-b-0"
                                        >
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setOpenCommunitySkillSubcategories((previous) => ({
                                                ...previous,
                                                [subcategoryKey]: !previous[subcategoryKey],
                                              }))
                                            }
                                            className="flex w-full items-center justify-between gap-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                                            aria-expanded={isOpen}
                                          >
                                            <span className="truncate">{subcategory.name}</span>
                                            <ChevronDown
                                              className={`h-3.5 w-3.5 shrink-0 transition ${
                                                isOpen ? "rotate-180 text-zinc-100" : "text-zinc-600"
                                              }`}
                                            />
                                          </button>
                                          {isOpen && (
                                            <div className="flex flex-wrap gap-1.5 pb-1">
                                              {subcategory.skills.map((skill) => {
                                                const skillKey = skill.id ?? skill.name;
                                                const isSelected =
                                                  selectedCommunitySkillId === skillKey;
                                                return (
                                                  <button
                                                    key={skillKey}
                                                    type="button"
                                                    onClick={() =>
                                                      setSelectedCommunitySkillId(skillKey)
                                                    }
                                                    aria-pressed={isSelected}
                                                    className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-left text-[11px] font-medium leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 ${
                                                      isSelected
                                                        ? "border-white/25 bg-white/[0.065] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.13),inset_0_-1px_0_rgba(255,255,255,0.05),0_0_20px_rgba(255,255,255,0.07)]"
                                                        : "border-white/[0.035] bg-zinc-950/90 text-zinc-500 hover:border-white/15 hover:text-zinc-200 active:border-white/20 active:text-zinc-100"
                                                    }`}
                                                  >
                                                    <span
                                                      className="shrink-0 text-[12px] text-zinc-200"
                                                      aria-hidden
                                                    >
                                                      {skill.icon}
                                                    </span>
                                                    <span className="truncate">{skill.name}</span>
                                                    <span
                                                      className={
                                                        isSelected
                                                          ? "shrink-0 text-zinc-200/85"
                                                          : "hidden"
                                                      }
                                                      aria-hidden
                                                    >
                                                      <Check className="h-3 w-3" />
                                                    </span>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                        </div>
                      </div>
                    )}
                    {!isCommunityCatalogLoading &&
                      !isCommunitySkillSearching &&
                      filteredCommunitySkills.length === 0 && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-6 text-center text-xs text-zinc-500">
                            No skills found.
                          </div>
                        </div>
                      )}
                    {!isCommunityCatalogLoading &&
                      !isCommunitySkillSearching &&
                      communityCatalog.source === "fallback" &&
                      communityCatalogError && (
                        <p className="mt-2 px-1 text-[10px] text-zinc-600">
                          Showing starter skills while the catalog is unavailable.
                        </p>
                      )}
                  </div>
                  <div className="relative z-10 px-3 pb-3 pt-2 sm:px-4">
                    <button
                      type="button"
                      onClick={handleConfirmCommunitySkill}
                      disabled={!selectedCommunitySkill}
                      className={`h-9 w-full rounded-full text-[11px] font-semibold uppercase tracking-[0.22em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 ${
                        selectedCommunitySkill
                          ? "border border-white/20 bg-white/[0.07] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.11),0_0_22px_rgba(255,255,255,0.07)] hover:border-white/[0.28] hover:bg-white/[0.09]"
                          : "cursor-not-allowed border border-white/10 bg-zinc-950/75 text-zinc-600"
                      }`}
                    >
                      {selectedCommunitySkill ? `ADD ${selectedCommunitySkill.name}` : "SELECT A SKILL"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCommunitySkillPickerOpen(true)}
                  className="group relative flex h-full min-h-[24rem] w-full overflow-hidden rounded-[26px] border border-white/10 bg-black/75 px-3 pb-4 pt-5 text-left shadow-lg transition duration-300 hover:border-white/20 hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:px-4"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-12 rounded-[34px] bg-white/[0.04] blur-3xl transition-opacity duration-300 group-hover:opacity-80"
                  />
                  <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
                    <span className="absolute inset-[1px] rounded-[24px] border border-white/10" />
                    <span className="absolute inset-[6px] rounded-[20px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]" />
                    <span className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-white/[0.03]" />
                  </span>
                  <span className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-4 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white shadow-[0_18px_38px_rgba(0,0,0,0.42)] transition group-hover:border-white/25 group-hover:bg-white/[0.09]">
                      <Plus className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.35em] text-white/80">
                      ADD SKILL
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className={categoryPillListClass} role="tablist">
            {categories.map((category, idx) => {
              const isActive = idx === activeIndex;
              const previewSkill = (skillsByCategory[category.id] || []).find(
                (skill) => skill.emoji
              )?.emoji;
              const catIcon = getCategoryIcon(category);
              const resolvedIcon = catIcon?.trim();
              const preview =
                resolvedIcon && resolvedIcon.length > 0
                  ? resolvedIcon
                  : previewSkill || category.name.charAt(0).toUpperCase();
              const chipColor = getCategoryColor(category) || FALLBACK_COLOR;

              return (
                <button
                  key={category.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Go to ${category.name}`}
                  onClick={() => {
                    const alreadyActive = idx === activeIndexRef.current;
                    scrollToIndex(idx);
                    setOpenMenuFor((current) => {
                      if (!alreadyActive) {
                        return null;
                      }
                      return current === category.id ? null : category.id;
                    });
                  }}
                  className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                    useFiveColumnCategoryPillGrid ? "w-full justify-center" : ""
                  } ${isActive ? "text-slate-100" : "text-slate-300/85 hover:text-slate-100"}`}
                  style={{
                    backgroundColor: isActive ? withAlpha(chipColor, 0.16) : "rgba(255, 255, 255, 0.045)",
                    borderColor: isActive ? withAlpha(chipColor, 0.42) : "rgba(255, 255, 255, 0.1)",
                    boxShadow: isActive
                      ? "inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.28)"
                      : "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.32)",
                  }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center text-base font-semibold"
                    style={{
                      color: isActive ? withAlpha(chipColor, 0.95) : "rgba(255,255,255,0.76)",
                    }}
                  >
                    {preview}
                  </span>
                  <span className="hidden min-w-0 truncate pr-1 sm:block">{category.name}</span>
                </button>
              );
            })}
          </div>
          {canAddCategory && (
            <>
              <div className="inline-flex">
                <button
                  type="button"
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                    isCreatingCategory
                      ? "border-white/30 bg-white/10 text-white/60 cursor-wait"
                      : "border-dashed border-white/30 bg-white/5 text-white/80 hover:border-white/50 hover:bg-white/10"
                } ${isAddCategoryMenuOpen ? "ring-2 ring-white/60" : ""}`}
                onClick={handleAddCategoryButtonClick}
                disabled={isCreatingCategory}
                aria-label="Add a new category"
                aria-expanded={isAddCategoryMenuOpen}
                aria-controls="add-category-panel"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add category</span>
                </button>
              </div>
              {isAddCategoryMenuOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                  <div className="absolute inset-0 bg-black/70 backdrop-blur" />
                  <div
                    ref={addCategoryMenuRef}
                    id="add-category-panel"
                    className="relative z-10 w-full max-w-sm rounded-3xl border px-4 py-3 text-white shadow-2xl backdrop-blur"
                    style={{
                      background: `linear-gradient(150deg, ${withAlpha(activeColor, 0.35)}, ${withAlpha(
                        activeColor,
                        0.08
                      )})`,
                      borderColor: withAlpha(activeColor, 0.55),
                      boxShadow: `0 25px 45px ${withAlpha("#0f172a", 0.55)}, 0 12px 30px ${withAlpha(
                        activeColor,
                        0.35
                      )}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                        New category
                      </p>
                      <p className="text-base font-semibold">Style & name</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddCategoryMenuOpen(false)}
                      className="rounded-full p-1 text-white/70 transition hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 space-y-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,4fr)] gap-3">
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">
                          Emoji
                        </p>
                        <div className="flex items-center justify-center">
                          <input
                            type="text"
                            value={newCategoryEmoji}
                            onChange={(event) => setNewCategoryEmoji(event.target.value)}
                            maxLength={4}
                            className="aspect-square h-10 w-full max-w-[64px] rounded-[18px] border border-white/20 bg-white/5 px-3 text-center text-lg text-white placeholder-transparent transition focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40"
                            aria-label="Choose an emoji for the category"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="category-name"
                          className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70"
                        >
                          Name
                        </label>
                        <input
                          ref={addCategoryNameRef}
                          id="category-name"
                          type="text"
                          value={newCategoryName}
                          onChange={(event) => setNewCategoryName(event.target.value)}
                          placeholder="Example: Flow, Business, Studio"
                          maxLength={36}
                          className="w-full rounded-2xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/50 transition focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">
                        Color
                      </p>
                      <input
                        type="color"
                        value={newCategoryColor}
                        onChange={(event) => setNewCategoryColor(event.target.value)}
                        className="h-10 w-10 cursor-pointer rounded-xl border border-white/40 p-0 transition"
                        aria-label="Pick a color for the new category"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddCategoryMenuOpen(false)}
                      className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60 transition hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateCategory}
                      disabled={isCreatingCategory || newCategoryName.trim().length === 0}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] transition ${
                        isCreatingCategory || newCategoryName.trim().length === 0
                          ? "cursor-not-allowed bg-white/20 text-white/60"
                          : "bg-white text-slate-900 shadow-lg shadow-white/40 hover:bg-white/90"
                      }`}
                    >
                      <Plus
                        className={`h-4 w-4 ${
                          isCreateCategoryDisabled ? "text-white/60" : "text-slate-900"
                        }`}
                      />
                      Create category
                    </button>
                  </div>
                </div>
              </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
});

export default SkillsCarousel;
