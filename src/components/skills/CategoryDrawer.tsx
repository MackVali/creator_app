import React, { useState, useMemo, useEffect } from "react";
import type { CatItem } from "@/types/dashboard";
import { Input } from "@/components/ui/input";
import { LayoutGrid, List as ListIcon, X } from "lucide-react";

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}

interface CategoryDrawerProps {
  category: CatItem | null;
  open: boolean;
  onClose(): void;
}

export function CategoryDrawer({ category, open, onClose }: CategoryDrawerProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const debounced = useDebounce(search, 200);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSort("name");
      setView("grid");
    }
  }, [open]);

  const skills = useMemo(() => {
    if (!category) return [];
    let list = [...category.skills];
    switch (sort) {
      case "level":
        list.sort((a, b) => b.level - a.level);
        break;
      case "recent":
        list.sort((a, b) => (a.skill_id < b.skill_id ? 1 : -1));
        break;
      default:
        list.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (debounced) {
      list = list.filter((s) =>
        s.name.toLowerCase().includes(debounced.toLowerCase())
      );
    }
    return list;
  }, [category, debounced, sort]);

  if (!category || !open) return null;

  const topColor = category.color || "#353535";

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="mt-auto w-full rounded-t-2xl bg-[#1E1E1E] p-4 overflow-y-auto max-h-[80vh]"
        style={{ borderTop: `2px solid ${topColor}` }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold text-[#E6E6E6]">
            {category.cat_name} ({category.skill_count})
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-[#E6E6E6]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="bg-[#242424] border-[#353535] text-[#E6E6E6]"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-md border border-[#353535] bg-[#242424] px-2 py-2 text-sm text-[#E6E6E6]"
          >
            <option value="name">A→Z</option>
            <option value="level">Level desc</option>
            <option value="recent">Recently added</option>
          </select>
          <button
            onClick={() => setView(view === "grid" ? "list" : "grid")}
            className="rounded-md border border-[#353535] p-2 text-[#E6E6E6]"
            aria-label="Toggle view"
          >
            {view === "grid" ? (
              <ListIcon className="h-4 w-4" />
            ) : (
              <LayoutGrid className="h-4 w-4" />
            )}
          </button>
        </div>

        {view === "grid" ? (
          <div className="grid grid-cols-2 gap-2">
            {skills.map((skill) => (
              <div
                key={skill.skill_id}
                className="flex flex-col rounded-lg border border-[#353535] bg-[#242424] p-3 text-[#E6E6E6]"
              >
                <span className="text-lg">{skill.icon || "💡"}</span>
                <div className="mt-1 flex w-full items-center justify-between gap-1">
                  <span className="truncate text-sm">{skill.name}</span>
                  <span className="rounded-full bg-[#353535] px-2 py-0.5 text-[10px]">
                    Lv {skill.level}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => (
              <div
                key={skill.skill_id}
                className="flex items-center justify-between rounded-lg border border-[#353535] bg-[#242424] p-3 text-[#E6E6E6]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{skill.icon || "💡"}</span>
                  <span className="truncate text-sm">{skill.name}</span>
                </div>
                <span className="rounded-full bg-[#353535] px-2 py-0.5 text-[10px]">
                  Lv {skill.level}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CategoryDrawer;
