"use client";

import { useState, useEffect } from "react";
import { List, LayoutGrid } from "lucide-react";

export type FilterStatus = "All" | "Active" | "Completed" | "Overdue";
export type SortOption = "A→Z" | "Due Soon" | "Progress" | "Recently Updated";

interface GoalsUtilityBarProps {
  search: string;
  onSearch(term: string): void;
  filter: FilterStatus;
  onFilter(f: FilterStatus): void;
  sort: SortOption;
  onSort(s: SortOption): void;
  view: "grid" | "list";
  onViewChange(v: "grid" | "list"): void;
}

export function GoalsUtilityBar({
  search,
  onSearch,
  filter,
  onFilter,
  sort,
  onSort,
  view,
  onViewChange,
}: GoalsUtilityBarProps) {
  const [local, setLocal] = useState(search);

  useEffect(() => {
    const id = setTimeout(() => onSearch(local), 200);
    return () => clearTimeout(id);
  }, [local, onSearch]);

  return (
    <div className="sticky top-0 z-10 bg-gray-900 px-4 py-3 space-y-2">
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Search goals"
        className="w-full px-3 py-2 rounded-md bg-gray-800 text-sm focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        {(["All", "Active", "Completed", "Overdue"] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => onFilter(s)}
            className={`px-3 py-1 rounded-full text-xs border border-gray-700 ${
              filter === s ? "bg-blue-600" : "bg-gray-800"
            }`}
          >
            {s}
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortOption)}
          className="ml-auto bg-gray-800 text-sm px-2 py-1 rounded-md"
        >
          <option value="A→Z">A→Z</option>
          <option value="Due Soon">Due Soon</option>
          <option value="Progress">Progress</option>
          <option value="Recently Updated">Recently Updated</option>
        </select>
        <button
          aria-label="Toggle view"
          onClick={() => onViewChange(view === "grid" ? "list" : "grid")}
          className="p-2 rounded-md bg-gray-800"
        >
          {view === "grid" ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
