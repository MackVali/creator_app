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
  LayoutGrid,
  List as ListIcon,
  Plus,
  MoreVertical,
  ChevronRight,
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

// circular progress ring component
function CircularProgress({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(100, value));
  const circumference = 2 * Math.PI * 20;
  const offset = circumference - (normalized / 100) * circumference;
  return (
    <div className="relative w-14 h-14">
      <svg className="w-14 h-14" viewBox="0 0 44 44">
        <circle
          className="text-gray-700"
          strokeWidth="4"
          stroke="currentColor"
          fill="transparent"
          r="20"
          cx="22"
          cy="22"
        />
        <circle
          className="text-gray-400"
          strokeWidth="4"
          stroke="currentColor"
          fill="transparent"
          r="20"
          cx="22"
          cy="22"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-100">
        {normalized}%
      </span>
    </div>
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
  const [view, setView] = useState<"grid" | "list">("grid");
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
          supabase
            .from("cats")
            .select("id,name,color_hex,sort_order")
            .eq("user_id", user.id),
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
          color_hex: c.color_hex,
          sort_order: c.sort_order,
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

  const handleRemoveCategory = async (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setSkills((prev) =>
      prev.map((s) => (s.cat_id === id ? { ...s, cat_id: null } : s))
    );
    if (selectedCat === id) {
      setSelectedCat("all");
    }
    const { error } = await deleteRecord("cats", id);
    if (error) {
      console.error("Error deleting category:", error);
    }
  };

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
    <div className="text-white pb-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <div>
          <h1 className="text-2xl font-bold leading-tight">Skills</h1>
          <p className="text-sm text-gray-400">Track and improve your skills</p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="h-11 px-4 bg-gray-200 text-black hover:bg-gray-300"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create
        </Button>
      </div>

      {/* Utility Bar */}
      <div className="sticky top-0 z-10 bg-[#1E1E1E] px-4 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 flex-1"
          />
          <Button
            onClick={() => setView("grid")}
            variant={view === "grid" ? undefined : "secondary"}
            className="h-11 w-11 p-0"
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="sr-only">Grid view</span>
          </Button>
          <Button
            onClick={() => setView("list")}
            variant={view === "list" ? undefined : "secondary"}
            className="h-11 w-11 p-0"
          >
            <ListIcon className="w-5 h-5" />
            <span className="sr-only">List view</span>
          </Button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {allCats.map((cat) => (
            <div key={cat.id} className="relative flex-shrink-0">
              <button
                onClick={() => setSelectedCat(cat.id)}
                className={`px-4 min-h-[44px] rounded-full text-sm whitespace-nowrap border ${
                  selectedCat === cat.id
                    ? "bg-gray-200 text-black border-gray-200"
                    : "bg-[#2C2C2C] border-[#333]"
                }`}
              >
                {cat.name} ({cat.id === "all" ? searchFiltered.length : counts[cat.id] || 0})
              </button>
              {cat.id !== "all" && cat.id !== "uncategorized" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveCategory(cat.id);
                  }}
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center"
                  aria-label={`Delete ${cat.name}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="ml-auto h-11 bg-[#2C2C2C] border border-[#333] rounded-md px-3"
          >
            <option value="name">A→Z</option>
            <option value="level">Level (desc)</option>
            <option value="progress">Progress (desc)</option>
            <option value="recent">Recently Added</option>
          </select>
        </div>
      </div>

      {/* Skills */}
      {empty ? (
        <div className="p-8">
          <div className="text-center text-gray-400">No skills found</div>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 p-4">
          {filtered.map((skill) => (
            <Link
              key={skill.id}
              href={`/skills/${skill.id}`}
              className="relative bg-[#2C2C2C] rounded-lg p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
            >
              <CircularProgress value={skill.progress} />
              <div className="text-center w-full">
                <div className="text-sm font-medium truncate">
                  {skill.name}
                </div>
                <span className="text-[10px] bg-[#404040] px-2 py-0.5 rounded-full">
                  Lv {skill.level}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="absolute top-2 right-2 p-2"
                    aria-label="More"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#2C2C2C] border-[#333]">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startEdit(skill);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRemoveSkill(skill.id);
                    }}
                  >
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Link>
          ))}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {filtered.map((skill) => (
            <Link
              key={skill.id}
              href={`/skills/${skill.id}`}
              className="relative flex items-center justify-between bg-[#2C2C2C] border border-[#333] rounded-lg p-3"
            >
              <div className="flex items-center gap-3">
                <CircularProgress value={skill.progress} />
                <div>
                  <div className="text-sm font-medium">{skill.name}</div>
                  <span className="text-[10px] bg-[#404040] px-2 py-0.5 rounded-full">
                    Lv {skill.level}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="absolute top-2 right-2 p-2"
                    aria-label="More"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#2C2C2C] border-[#333]">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startEdit(skill);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRemoveSkill(skill.id);
                    }}
                  >
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Link>
          ))}
        </div>
      )}

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

