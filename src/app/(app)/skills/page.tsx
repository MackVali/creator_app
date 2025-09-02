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
import { getSupabaseBrowser } from "@/lib/supabase";
import { getSkillsForUser } from "../../../lib/data/skills";
import {
  LayoutGrid,
  List as ListIcon,
  Plus,
  MoreVertical,
  ChevronRight,
} from "lucide-react";

// simple debounce hook for search
function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}

// premium progress ring
function ProgressRing({
  value,
  level,
  className = "",
}: {
  value: number;
  level: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const size = 72;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const dash = clamped === 0 ? "2 6" : `${circumference}`;
  return (
    <div
      className={`relative w-[72px] h-[72px] rounded-full ${
        clamped > 0 ? "shadow-[inset_0_0_4px_rgba(185,185,185,0.3)]" : ""
      } ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="text-[#B9B9B9]"
      >
        <circle
          stroke="#3A3A3A"
          strokeWidth={stroke}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke="currentColor"
          strokeWidth={stroke}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          strokeDasharray={dash}
          strokeDashoffset={clamped === 0 ? undefined : offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-300 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-xs">
        <span className="font-medium tabular-nums text-[#E6E6E6]">
          {Math.round(clamped)}%
        </span>
        <span className="text-[10px] text-[#A6A6A6]">Lv {level}</span>
      </div>
    </div>
  );
}

function SkillsPageContent() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const [selectedCat, setSelectedCat] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState("name");
  const [open, setOpen] = useState(false);

  const supabase = getSupabaseBrowser();

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) return;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const [skillRows, cats] = await Promise.all([
          getSkillsForUser(user.id),
          supabase.from("cats").select("id,name").eq("user_id", user.id),
        ]);

        const formattedSkills: Skill[] = (skillRows || []).map((s) => ({
          id: s.id,
          name: s.name || "Unnamed",
          icon: s.icon || "🧩",
          level: s.level ?? 1,
          progress: 0,
          cat_id: s.cat_id,
          created_at: s.created_at,
        }));
        setSkills(formattedSkills);

        const catList: Category[] = (cats.data || []).map((c) => ({
          id: c.id,
          name: c.name,
        }));
        setCategories(catList);
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

  const addSkill = (skill: Skill) => setSkills((prev) => [...prev, skill]);
  const addCategory = (cat: Category) =>
    setCategories((prev) => [...prev, cat]);

  const handleRemoveSkill = (id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  if (loading) {
    return (
      <div className="p-4 grid grid-cols-2 min-[420px]:grid-cols-3 gap-3.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-2xl border border-[#353535] bg-[#242424]"
          >
            <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-r from-[#2B2B2B] via-[#303030] to-[#2B2B2B] bg-[length:200%_100%] animate-shimmer" />
            <div className="mt-4 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gradient-to-r from-[#2B2B2B] via-[#303030] to-[#2B2B2B] bg-[length:200%_100%] animate-shimmer" />
              <div className="h-3 w-1/2 rounded bg-gradient-to-r from-[#2B2B2B] via-[#303030] to-[#2B2B2B] bg-[length:200%_100%] animate-shimmer" />
            </div>
          </div>
        ))}
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
            className="h-11 flex-1 bg-[#242424] border border-[#353535] placeholder:text-[#808080] focus-visible:ring-1 focus-visible:ring-[#9966CC]"
          />
          <button
            onClick={() => setView("grid")}
            aria-label="Grid view"
            className={`h-11 w-11 flex items-center justify-center rounded-md border border-[#3A3A3A] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#9966CC] ${
              view === "grid"
                ? "bg-[#2E2E2E] text-[#E6E6E6]"
                : "bg-[#242424] text-[#A6A6A6]"
            }`}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
          <button
            onClick={() => setView("list")}
            aria-label="List view"
            className={`h-11 w-11 flex items-center justify-center rounded-md border border-[#3A3A3A] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#9966CC] ${
              view === "list"
                ? "bg-[#2E2E2E] text-[#E6E6E6]"
                : "bg-[#242424] text-[#A6A6A6]"
            }`}
          >
            <ListIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {allCats.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`flex-shrink-0 px-4 min-h-[44px] rounded-full text-sm border border-[#3A3A3A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#9966CC] ${
                selectedCat === cat.id
                  ? "bg-[#2E2E2E] text-[#E6E6E6]"
                  : "bg-[#242424] text-[#A6A6A6]"
              }`}
            >
              {cat.name} ({cat.id === "all" ? searchFiltered.length : counts[cat.id] || 0})
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort"
            className="ml-auto h-11 rounded-md bg-[#242424] border border-[#3A3A3A] px-3 text-[#A6A6A6] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#9966CC] active:scale-[0.98]"
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
        <div className="p-8 flex justify-center">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border border-[#353535] bg-[#242424]">
            <Plus className="w-8 h-8 text-[#A6A6A6]" />
            <div className="text-[#A6A6A6]">No skills yet</div>
            <Button
              variant="secondary"
              onClick={() => setOpen(true)}
              className="px-4"
            >
              Create your first skill
            </Button>
          </div>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-3.5 p-4">
          {filtered.map((skill) => (
            <Link
              key={skill.id}
              href={`/skills/${skill.id}`}
              className="relative rounded-2xl border border-[#353535] bg-[#242424] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9966CC] transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
            >
              <div className="grid grid-cols-[72px_1fr_auto] grid-rows-[auto_auto] gap-x-4 gap-y-2">
                <ProgressRing
                  value={skill.progress}
                  level={skill.level}
                  className="row-span-2"
                />
                <div className="text-[15px] font-semibold text-[#E6E6E6] truncate">
                  {skill.name}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="relative h-11 w-11 -mr-2 flex items-center justify-center rounded-full overflow-hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#9966CC] active:scale-[0.98] [&:after]:content-[''] [&:after]:absolute [&:after]:inset-0 [&:after]:bg-white [&:after]:opacity-0 [&:after]:transition [&:after]:duration-300 active:[&:after]:opacity-8"
                      aria-label="More"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => alert("Edit coming soon")}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleRemoveSkill(skill.id)}>
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="text-xs px-2 py-[2px] rounded-full bg-[#2B2B2B] text-[#A6A6A6]">
                  Lv {skill.level}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="p-4 space-y-3.5">
          {filtered.map((skill) => (
            <Link
              key={skill.id}
              href={`/skills/${skill.id}`}
              className="flex items-center gap-4 rounded-2xl border border-[#353535] bg-[#242424] p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9966CC]"
            >
              <ProgressRing value={skill.progress} level={skill.level} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-[#E6E6E6] truncate">
                  {skill.name}
                </div>
                <span className="mt-2 inline-block text-xs px-2 py-[2px] rounded-full bg-[#2B2B2B] text-[#A6A6A6]">
                  Lv {skill.level}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Link>
          ))}
        </div>
      )}

      <SkillDrawer
        open={open}
        onClose={() => setOpen(false)}
        onAdd={addSkill}
        categories={categories}
        onAddCategory={addCategory}
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

