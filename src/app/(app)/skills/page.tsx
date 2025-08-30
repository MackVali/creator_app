"use client";

import { useState, useEffect, useMemo } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
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

// circular progress ring component
function CircularProgress({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(100, value));
  const circumference = 2 * Math.PI * 20;
  const offset = circumference - (normalized / 100) * circumference;
  return (
    <div className="relative w-14 h-14">
      <svg className="w-14 h-14" viewBox="0 0 44 44">
        <circle
          className="text-[#3C3C3C]"
          strokeWidth="4"
          stroke="currentColor"
          fill="transparent"
          r="20"
          cx="22"
          cy="22"
        />
        <circle
          className="text-[#A0A0A0]"
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
      <span className="absolute inset-0 flex items-center justify-center text-xs text-[#E0E0E0]">
        {normalized}%
      </span>
    </div>
  );
}

interface Skill {
  id: string;
  name: string;
  icon: string;
  level: number;
  progress: number;
  cat_id: string | null;
  created_at?: string | null;
}

interface Category {
  id: string;
  name: string;
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

  // create drawer fields
  const [formName, setFormName] = useState("");
  const [formEmoji, setFormEmoji] = useState("💡");
  const [formCat, setFormCat] = useState("");
  const [formNewCat, setFormNewCat] = useState("");

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

  const handleAddSkill = () => {
    const name = formName.trim();
    if (!name) return;
    let catId = formCat;
    const catName = formNewCat.trim();
    if (formCat === "new" && catName) {
      catId = "local-" + Date.now();
      setCategories((prev) => [...prev, { id: catId, name: catName }]);
    }
    const newSkill: Skill = {
      id: "local-" + Date.now(),
      name,
      icon: formEmoji,
      level: 1,
      progress: 0,
      cat_id: catId || null,
      created_at: new Date().toISOString(),
    };
    setSkills((prev) => [...prev, newSkill]);
    setOpen(false);
    setFormName("");
    setFormEmoji("💡");
    setFormCat("");
    setFormNewCat("");
  };

  const handleRemoveSkill = (id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4 bg-[#1E1E1E]">
        <Skeleton className="h-8 w-32 bg-[#2B2B2B]" />
        <Skeleton className="h-11 w-full bg-[#2B2B2B]" />
        <Skeleton className="h-11 w-full bg-[#2B2B2B]" />
      </div>
    );
  }

  const empty = filtered.length === 0;

  return (
    <div className="bg-[#1E1E1E] text-[#E0E0E0] pb-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <div>
          <h1 className="text-2xl font-bold leading-tight">Skills</h1>
          <p className="text-sm text-[#A0A0A0]">Track and improve your skills</p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="h-11 px-4 bg-[#2B2B2B] text-[#E0E0E0] border border-[#3C3C3C] hover:bg-[#353535]"
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
            className="h-11 flex-1 bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0] placeholder-[#666666]"
          />
          <Button
            onClick={() => setView("grid")}
            className={`h-11 w-11 p-0 border border-[#3C3C3C] text-[#E0E0E0] ${
              view === "grid" ? "bg-[#353535]" : "bg-[#2B2B2B] hover:bg-[#353535]"
            }`}
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="sr-only">Grid view</span>
          </Button>
          <Button
            onClick={() => setView("list")}
            className={`h-11 w-11 p-0 border border-[#3C3C3C] text-[#E0E0E0] ${
              view === "list" ? "bg-[#353535]" : "bg-[#2B2B2B] hover:bg-[#353535]"
            }`}
          >
            <ListIcon className="w-5 h-5" />
            <span className="sr-only">List view</span>
          </Button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {allCats.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`flex-shrink-0 px-4 min-h-[44px] rounded-full text-sm whitespace-nowrap border border-[#3C3C3C] ${
                selectedCat === cat.id
                  ? "bg-[#353535] text-[#E0E0E0]"
                  : "bg-[#2B2B2B] text-[#A0A0A0] hover:bg-[#353535]"
              }`}
            >
              {cat.name} ({cat.id === "all" ? searchFiltered.length : counts[cat.id] || 0})
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="ml-auto h-11 bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0] rounded-md px-3"
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
          <div className="text-center text-[#A0A0A0]">No skills found</div>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 p-4">
          {filtered.map((skill) => (
            <div
              key={skill.id}
              className="relative bg-[#2B2B2B] border border-[#3C3C3C] rounded-lg p-4 flex flex-col items-center gap-2 hover:bg-[#353535] active:scale-95 transition-transform"
            >
              <CircularProgress value={skill.progress} />
              <div className="text-center w-full">
                <div className="text-sm font-medium truncate text-[#E0E0E0]">
                  {skill.name}
                </div>
                <span className="text-[10px] bg-[#3C3C3C] text-[#A0A0A0] px-2 py-0.5 rounded-full">
                  Lv {skill.level}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="absolute top-2 right-2 p-2 text-[#A0A0A0] hover:text-[#E0E0E0]" aria-label="More">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0]">
                  <DropdownMenuItem className="hover:bg-[#353535]" onClick={() => alert("Edit coming soon")}>Edit</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-[#353535]" onClick={() => handleRemoveSkill(skill.id)}>
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {filtered.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between bg-[#2B2B2B] border border-[#3C3C3C] rounded-lg p-3 hover:bg-[#353535]"
            >
              <div className="flex items-center gap-3">
                <CircularProgress value={skill.progress} />
                <div>
                  <div className="text-sm font-medium text-[#E0E0E0]">{skill.name}</div>
                  <span className="text-[10px] bg-[#3C3C3C] text-[#A0A0A0] px-2 py-0.5 rounded-full">
                    Lv {skill.level}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#A0A0A0]" />
            </div>
          ))}
        </div>
      )}

      {/* Create Drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="bg-[#1E1E1E] text-[#E0E0E0] max-h-[80vh]"
        >
          <SheetHeader>
            <SheetTitle>Add Skill</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="block text-sm mb-1 text-[#E0E0E0]">Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-11 bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0] placeholder-[#666666]"
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-[#E0E0E0]">Emoji</label>
              <Input
                value={formEmoji}
                onChange={(e) => setFormEmoji(e.target.value)}
                className="h-11 bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0] placeholder-[#666666]"
                placeholder="🎯"
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-[#E0E0E0]">Category</label>
              <select
                value={formCat}
                onChange={(e) => setFormCat(e.target.value)}
                className="h-11 w-full bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0] rounded-md px-3"
              >
                <option value="">Select...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="new">+ New Category</option>
              </select>
              {formCat === "new" && (
                <Input
                  placeholder="New category"
                  value={formNewCat}
                  onChange={(e) => setFormNewCat(e.target.value)}
                  className="h-11 mt-2 bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0] placeholder-[#666666]"
                />
              )}
            </div>
          </div>
          <SheetFooter>
            <Button
              className="w-full bg-[#2B2B2B] text-[#E0E0E0] border border-[#3C3C3C] hover:bg-[#353535]"
              onClick={handleAddSkill}
              disabled={!formName}
            >
              Add
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
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

