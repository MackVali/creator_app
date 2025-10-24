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
import { getSkillLevelBadge } from "@/lib/skills/levelBadges";
import {
  Plus,
  MoreVertical,
  ChevronRight,
  Sparkles,
  FolderKanban,
  Goal,
  Clock3,
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
    setSkills((prev) => [
      ...prev,
      {
        ...skill,
        id: data!.id,
        cat_id: catIdToUse,
        monument_id: skill.monument_id ?? null,
        created_at: data!.created_at,
      },
    ]);
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
  const handleRemoveSkill = async (id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id));
    const { error } = await deleteRecord("skills", id);
    if (error) {
      console.error("Error deleting skill:", error);
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
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#05060a] via-[#10121a] to-[#191c29] p-8 shadow-[0_45px_140px_-60px_rgba(15,23,42,0.85)]">
            <div className="absolute inset-0">
              <div className="absolute -right-28 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(129,140,248,0.28),_transparent_65%)] blur-3xl" />
              <div className="absolute -bottom-32 left-8 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(56,189,248,0.22),_transparent_65%)] blur-3xl" />
            </div>
            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/70 backdrop-blur">
                  Skill library
                </div>
                <div className="space-y-3">
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Your skills headquarters</h1>
                  <p className="text-sm leading-relaxed text-white/70 sm:text-base">
                    Orchestrate every ability you&apos;re building. Track categories, link monuments, and open the drawer to spin up something new in seconds.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => setOpen(true)}
                    className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-[0_15px_40px_-20px_rgba(148,163,184,0.9)] transition hover:bg-white/90"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add a skill
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="rounded-full border-white/30 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur hover:border-white/40 hover:bg-white/15"
                  >
                    <Link href="/dashboard">Return to dashboard</Link>
                  </Button>
                </div>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                {heroStats.map(({ label, value, description, icon: Icon }) => (
                  <div
                    key={label}
                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition hover:border-white/20 hover:bg-white/10"
                  >
                    <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.14),_transparent_60%)] opacity-0 transition group-hover:opacity-100" />
                    <div className="relative flex items-start justify-between gap-3">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-[0.25em] text-white/60">{label}</dt>
                        <dd className="mt-3 text-2xl font-semibold text-white">{value}</dd>
                      </div>
                      <span className="flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="relative mt-3 text-xs leading-relaxed text-white/60">{description}</p>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-[1] -mt-12 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d0f18]/90 p-5 shadow-[0_40px_120px_-70px_rgba(15,23,42,0.85)] backdrop-blur">
            <div className="absolute inset-0">
              <div className="absolute -left-16 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(79,70,229,0.18),_transparent_65%)] blur-2xl" />
            </div>
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:gap-4">
                <Input
                  placeholder="Search skills..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-12 flex-1 rounded-2xl border border-white/10 bg-white/5 text-white placeholder:text-white/40 focus:border-white/30 focus:ring-white/30"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-11 min-w-[180px] rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-medium text-white/80 focus:border-white/30 focus:outline-none"
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
            <div className="relative mt-5 flex flex-wrap gap-2">
              {allCats.map((cat) => {
                const count =
                  cat.id === "all" ? searchFiltered.length : counts[cat.id] || 0;
                const isActive = selectedCat === cat.id;
                return (
                  <div key={cat.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setSelectedCat(cat.id)}
                      className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${
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
              {filtered.map((skill) => {
                const categoryName = categoryLookup.get(skill.cat_id || "uncategorized");
                const levelBadge = getSkillLevelBadge(skill.level ?? undefined);
                const linkedMonument = skill.monument_id
                  ? monumentLookup.get(skill.monument_id)
                  : null;
                return (
                  <Link
                    key={skill.id}
                    href={`/skills/${skill.id}`}
                    className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d17]/90 p-5 text-left shadow-[0_30px_90px_-65px_rgba(79,70,229,0.7)] transition hover:border-white/20 hover:bg-[#111425]"
                  >
                    <div className="absolute inset-0">
                      <div className="absolute -left-20 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(129,140,248,0.22),_transparent_65%)] opacity-40 transition group-hover:opacity-80" />
                    </div>
                    <div className="relative flex items-center gap-5">
                      <span
                        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-3xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-white/15"
                        role="img"
                        aria-label={`Skill: ${skill.name}`}
                      >
                        {skill.icon}
                      </span>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-white">{skill.name}</h3>
                          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70">
                            {levelBadge} Lv {skill.level}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">
                          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white/70">
                            {categoryName || "Uncategorized"}
                          </span>
                          {linkedMonument && (
                            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1 text-emerald-200">
                              <Goal className="h-3 w-3" aria-hidden="true" />
                              {linkedMonument}
                            </span>
                          )}
                        </div>
                        {skill.created_at && (
                          <p className="text-xs text-white/50">
                            Added {new Date(skill.created_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="relative h-5 w-5 text-white/40 transition group-hover:translate-x-1 group-hover:text-white/70" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70 opacity-0 transition hover:text-white group-hover:opacity-100"
                          aria-label="More"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-40 border border-white/10 bg-[#0f111a]/95 text-white backdrop-blur">
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
                            handleRemoveSkill(skill.id);
                          }}
                        >
                          Remove skill
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Link>
                );
              })}
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

