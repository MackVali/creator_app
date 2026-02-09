"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SkillDrawer, type Category, type Skill } from "./components/SkillDrawer";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToastHelpers } from "@/components/ui/toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getSkillsForUser } from "../../../lib/data/skills";
import { createRecord, deleteRecord, updateRecord } from "@/lib/db";
import type { SkillRow } from "@/lib/types/skill";
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  FolderKanban,
  Goal,
  MoreVertical,
  Plus,
  Sparkles,
} from "lucide-react";

interface Monument {
  id: string;
  title: string;
}

// simple debounce hook for search
function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}

type SkillCompactCardProps = {
  skill: Skill;
  categoryName?: string | null;
  linkedMonument?: string | null;
  startEdit: (skill: Skill) => void;
  handleRemoveSkill: (skill: Skill) => void;
};

function SkillCompactCard({
  skill,
  categoryName,
  linkedMonument,
  startEdit,
  handleRemoveSkill,
}: SkillCompactCardProps) {
  const createdLabel = skill.created_at
    ? `Added ${new Date(skill.created_at).toLocaleDateString()}`
    : "Not logged yet";

  return (
    <Link
      href={`/skills/${skill.id}`}
      className="group relative flex min-h-[175px] flex-col gap-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e18]/90 p-3 text-white transition hover:border-white/30 hover:bg-[#13162b]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(255,255,255,0.08),_transparent_70%)] opacity-40" aria-hidden />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-lg text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
          role="img"
          aria-label={`Skill: ${skill.name}`}
        >
          {skill.icon}
        </span>
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-white/60">
          Lv {skill.level}
        </span>
      </div>
      <h3 className="relative z-10 text-sm font-semibold leading-tight text-white line-clamp-2">
        {skill.name}
      </h3>
      <div className="relative z-10 flex flex-wrap gap-1 text-[0.55rem] uppercase tracking-[0.3em] text-white/70">
        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
          {categoryName || "Uncategorized"}
        </span>
        {linkedMonument && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-emerald-200">
            <Goal className="h-3 w-3" aria-hidden="true" />
            {linkedMonument}
          </span>
        )}
      </div>
      <p className="relative z-10 text-[0.65rem] text-white/60">{createdLabel}</p>
      <ChevronRight className="relative z-10 self-end text-white/40 transition group-hover:text-white/70" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/60 transition hover:border-white/30 hover:text-white"
            aria-label="More"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-40 border border-white/10 bg-[#0f111a]/95 text-white">
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              startEdit(skill);
            }}
          >
            Edit skill
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRemoveSkill(skill);
            }}
          >
            Remove skill
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Link>
  );
}

function SkillsPageContent() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const [selectedCat, setSelectedCat] = useState("all");
  const [sort, setSort] = useState("name");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);

  const supabase = getSupabaseBrowser();
  const toast = useToastHelpers();

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) return;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const [skillRows, cats, mons] = await Promise.all([
          getSkillsForUser(user.id),
          supabase.from("cats").select("id,name").eq("user_id", user.id),
          supabase.from("monuments").select("id,title").eq("user_id", user.id),
        ]);

        const formattedSkills: Skill[] = (skillRows || []).map((s) => ({
          id: s.id,
          name: s.name || "Unnamed",
          icon: s.icon || "🧩",
          level: s.level ?? 1,
          progress: 0,
          cat_id: s.cat_id,
          monument_id: s.monument_id,
          created_at: s.created_at,
        }));
        setSkills(formattedSkills);

        const catList: Category[] = (cats.data || []).map((c) => ({
          id: c.id,
          name: c.name,
        }));
        setCategories(catList);

        const monList: Monument[] = (mons.data || []).map((m) => ({
          id: m.id,
          title: m.title,
        }));
        setMonuments(monList);
      } catch (e) {
        console.error("Error fetching skills:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [supabase]);

  // search filter
  const searchFiltered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return skills.filter((s) => s.name.toLowerCase().includes(q));
  }, [skills, debouncedSearch]);

  // counts per category after search filter
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    searchFiltered.forEach((s) => {
      const key = s.cat_id || "uncategorized";
      c[key] = (c[key] || 0) + 1;
    });
    return c;
  }, [searchFiltered]);

  // sort & category filter
  const filtered = useMemo(() => {
    let data = [...searchFiltered];
    if (selectedCat !== "all") {
      data = data.filter(
        (s) => (s.cat_id || "uncategorized") === selectedCat
      );
    }
    switch (sort) {
      case "level":
        data.sort((a, b) => (b.level || 0) - (a.level || 0));
        break;
      case "progress":
        data.sort((a, b) => b.progress - a.progress);
        break;
      case "recent":
        data.sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        );
        break;
      default:
        data.sort((a, b) => a.name.localeCompare(b.name));
    }
    return data;
  }, [searchFiltered, selectedCat, sort]);

  const skillPages = useMemo(() => {
    const pages: Skill[][] = [];
    for (let i = 0; i < filtered.length; i += 6) {
      pages.push(filtered.slice(i, i + 6));
    }
    return pages;
  }, [filtered]);

  const allCats = useMemo(() => {
    const base = [...categories];
    if (counts["uncategorized"] && !base.find((c) => c.id === "uncategorized")) {
      base.push({ id: "uncategorized", name: "Uncategorized" });
    }
    return [
      { id: "all", name: "All" },
      ...base,
    ];
  }, [categories, counts]);

  const addSkill = async (skill: Skill) => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const catIdToUse =
      skill.cat_id && uuidRegex.test(skill.cat_id) ? skill.cat_id : null;

    const { data, error } = await createRecord<SkillRow>("skills", {
      name: skill.name,
      icon: skill.icon,
      level: skill.level,
      cat_id: catIdToUse,
      monument_id: skill.monument_id ?? null,
    });
    if (error) {
      console.error("Error creating skill:", error);
      toast.error("Error", error.message || "Failed to create skill");
      return;
    }
    setSkills((prev) => {
      if (prev.some((existing) => existing.id === data!.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          ...skill,
          id: data!.id,
          cat_id: catIdToUse,
          monument_id: skill.monument_id ?? null,
          created_at: data!.created_at,
        },
      ];
    });
  };
  const updateSkill = async (skill: Skill) => {
    setSkills((prev) => prev.map((s) => (s.id === skill.id ? skill : s)));
    const { error } = await updateRecord<SkillRow>("skills", skill.id, {
      name: skill.name,
      icon: skill.icon,
      level: skill.level,
      cat_id: skill.cat_id,
      monument_id: skill.monument_id,
    });
    if (error) {
      console.error("Error updating skill:", error);
    }
  };
  const addCategory = async (name: string): Promise<Category | null> => {
    const { data, error } = await createRecord<Category>("cats", { name });
    if (error || !data) {
      console.error("Error creating category:", error);
      toast.error(
        "Error",
        error?.message || "Failed to create category"
      );
      return null;
    }
    const cat = { id: data.id, name: data.name } as Category;
    setCategories((prev) => [...prev, cat]);
    return cat;
  };
  const startEdit = (skill: Skill) => {
    setEditing(skill);
    setOpen(true);
  };
  const handleRemoveSkill = async (skill: Skill) => {
    const confirmed = window.confirm(
      `Remove "${skill.name}"? This will permanently delete the skill.`
    );
    if (!confirmed) return;
    setSkills((prev) => prev.filter((s) => s.id !== skill.id));
    const { error } = await deleteRecord("skills", skill.id);
    if (error) {
      console.error("Error deleting skill:", error);
      toast.error("Error", error.message || "Failed to delete skill");
    }
  };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalSkills = skills.length;
  const totalCategories = categories.length;
  const createdThisMonth = skills.filter((skill) => {
    if (!skill.created_at) return false;
    const createdAt = new Date(skill.created_at);
    return createdAt >= startOfMonth && createdAt <= now;
  }).length;
  const trackedMonuments = skills.reduce((set, skill) => {
    if (skill.monument_id) {
      set.add(skill.monument_id);
    }
    return set;
  }, new Set<string>()).size;

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => {
      map.set(category.id, category.name);
    });
    map.set("uncategorized", "Uncategorized");
    return map;
  }, [categories]);

  const monumentLookup = useMemo(() => {
    const map = new Map<string, string>();
    monuments.forEach((monument) => {
      map.set(monument.id, monument.title);
    });
    return map;
  }, [monuments]);

  const heroStats = [
    {
      label: "Active skills",
      value: totalSkills,
      description: "Skills you're actively tracking and refining.",
      icon: Sparkles,
    },
    {
      label: "Categories organized",
      value: totalCategories,
      description: "Folders giving structure to your practice.",
      icon: FolderKanban,
    },
    {
      label: "Linked monuments",
      value: trackedMonuments,
      description: "Monuments currently tied to your skills.",
      icon: Goal,
    },
    {
      label: "New this month",
      value: createdThisMonth,
      description: "Fresh additions added in the last 30 days.",
      icon: Clock3,
    },
  ];

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  const empty = filtered.length === 0;

  return (
    <div className="pb-24 text-white">
      <section className="relative px-4 pt-6">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#05060a] via-[#10121a] to-[#191c29] p-4 sm:p-5 shadow-[0_45px_140px_-60px_rgba(15,23,42,0.85)]">
            <div className="absolute inset-0">
              <div className="absolute -right-28 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(129,140,248,0.28),_transparent_65%)] blur-3xl" />
              <div className="absolute -bottom-32 left-8 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(56,189,248,0.22),_transparent_65%)] blur-3xl" />
            </div>
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.28em] text-white/70 backdrop-blur sm:px-3 sm:py-1 sm:text-[10px] sm:tracking-[0.3em]">
                  Skill library
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <h1 className="text-xl font-semibold tracking-tight text-white sm:text-3xl">Your skills headquarters</h1>
                  <p className="text-[11px] leading-relaxed text-white/70 sm:text-sm">
                    Orchestrate every ability you&apos;re building. Track categories, link monuments, and open the drawer to spin up something new in seconds.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  <Button
                    onClick={() => setOpen(true)}
                    className="h-8 rounded-full bg-white px-2.5 text-[11px] font-semibold text-slate-900 shadow-[0_15px_40px_-20px_rgba(148,163,184,0.9)] transition hover:bg-white/90 sm:h-9 sm:px-3 sm:text-xs"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5 sm:mr-2" />
                    Add a skill
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-white/30 bg-white/10 px-2.5 text-[11px] font-semibold text-white backdrop-blur hover:border-white/40 hover:bg-white/15 sm:h-9 sm:px-3 sm:text-xs"
                  >
                    <Link href="/dashboard">Return to dashboard</Link>
                  </Button>
                </div>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                {heroStats.map(({ label, value, description, icon: Icon }) => (
                  <div
                    key={label}
                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition hover:border-white/20 hover:bg-white/10 sm:p-4"
                  >
                    <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.14),_transparent_60%)] opacity-0 transition group-hover:opacity-100" />
                    <div className="relative flex items-start justify-between gap-3">
                      <div>
                        <dt className="text-[9px] font-medium uppercase tracking-[0.22em] text-white/60 sm:text-[10px] sm:tracking-[0.25em]">{label}</dt>
                        <dd className="mt-1.5 text-lg font-semibold text-white sm:mt-2 sm:text-xl">{value}</dd>
                      </div>
                      <span className="flex size-7 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 sm:size-8">
                        <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="relative mt-1.5 text-[10px] leading-relaxed text-white/60 sm:mt-2 sm:text-[11px]">{description}</p>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-[1] -mt-8 px-4 sm:-mt-10">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d0f18]/90 p-3 shadow-[0_40px_120px_-70px_rgba(15,23,42,0.85)] backdrop-blur sm:p-4">
            <div className="absolute inset-0">
              <div className="absolute -left-16 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(79,70,229,0.18),_transparent_65%)] blur-2xl" />
            </div>
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:gap-4">
                <Input
                  placeholder="Search skills..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 flex-1 rounded-2xl border border-white/10 bg-white/5 text-[11px] text-white placeholder:text-white/40 focus:border-white/30 focus:ring-white/30 sm:h-10 sm:text-sm"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-9 min-w-[140px] rounded-2xl border border-white/15 bg-white/5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80 focus:border-white/30 focus:outline-none sm:h-10 sm:min-w-[160px] sm:px-3 sm:text-xs sm:tracking-[0.2em]"
              >
                <option value="name" className="bg-slate-900 text-white">
                  Alphabetical
                </option>
                <option value="level" className="bg-slate-900 text-white">
                  Level (high to low)
                </option>
                <option value="progress" className="bg-slate-900 text-white">
                  Progress (high to low)
                </option>
                <option value="recent" className="bg-slate-900 text-white">
                  Recently added
                </option>
              </select>
            </div>
            <div className="relative mt-3 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
              {allCats.map((cat) => {
                const count =
                  cat.id === "all" ? searchFiltered.length : counts[cat.id] || 0;
                const isActive = selectedCat === cat.id;
                return (
                  <div key={cat.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setSelectedCat(cat.id)}
                      className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] transition sm:gap-2 sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[0.2em] ${
                        isActive
                          ? "border-white bg-white text-slate-900 shadow-[0_18px_40px_-28px_rgba(148,163,184,0.85)]"
                          : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className={isActive ? "text-slate-600" : "text-white/50"}>{count}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pt-14">
        <div className="mx-auto max-w-6xl">
          {empty ? (
            <div className="relative overflow-hidden rounded-3xl border border-dashed border-white/20 bg-white/5 p-12 text-center text-white/70 shadow-[0_40px_120px_-80px_rgba(15,23,42,0.9)]">
              <div className="absolute inset-0">
                <div className="absolute left-1/2 top-0 h-52 w-52 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(129,140,248,0.25),_transparent_65%)] blur-3xl" />
              </div>
              <div className="relative space-y-4">
                <h2 className="text-xl font-semibold text-white">No skills yet</h2>
                <p className="text-sm text-white/60">
                  Start your collection by creating your first skill. Once added, you can connect it to monuments, goals, and notes just like the detail pages.
                </p>
                <Button
                  onClick={() => setOpen(true)}
                  className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-[0_18px_40px_-20px_rgba(148,163,184,0.85)] transition hover:bg-white/90"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add your first skill
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <div className="pointer-events-none absolute -top-8 right-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-white/60 sm:hidden">
                  Swipe to browse
                  <ArrowRight className="h-3 w-3" />
                </div>
                <div className="grid auto-cols-[minmax(640px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-6 pr-1 snap-x snap-mandatory sm:auto-cols-auto sm:grid-cols-2 sm:grid-flow-row sm:overflow-visible sm:pb-0 sm:snap-none">
                  {skillPages.map((page, pageIndex) => (
                    <div
                      key={`skills-page-${pageIndex}`}
                      className="snap-start sm:[scroll-snap-align:unset]"
                      style={{ minWidth: "min(100vw-2rem, 720px)" }}
                    >
                      <div className="grid grid-cols-3 gap-3">
                        {page.map((skill) => {
                          const categoryName = categoryLookup.get(
                            skill.cat_id || "uncategorized"
                          );
                          const linkedMonument = skill.monument_id
                            ? monumentLookup.get(skill.monument_id)
                            : null;
                          return (
                            <SkillCompactCard
                              key={skill.id}
                              skill={skill}
                              categoryName={categoryName}
                              linkedMonument={linkedMonument}
                              startEdit={startEdit}
                              handleRemoveSkill={handleRemoveSkill}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <SkillDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        onAdd={addSkill}
        categories={categories}
        monuments={monuments}
        onAddCategory={addCategory}
        initialSkill={editing}
        onUpdate={updateSkill}
      />
    </div>
  );
}

export default function SkillsPage() {
  return (
    <ProtectedRoute>
      <SkillsPageContent />
    </ProtectedRoute>
  );
}
