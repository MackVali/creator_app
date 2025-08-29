"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListIcon, GridIcon } from "lucide-react";
import { Dispatch, SetStateAction } from "react";

export type FilterType = "All" | "Active" | "Completed" | "Overdue";
export type SortType = "az" | "due" | "progress" | "updated";
export type ViewType = "grid" | "list";

interface GoalsUtilityBarProps {
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  filter: FilterType;
  setFilter: Dispatch<SetStateAction<FilterType>>;
  sort: SortType;
  setSort: Dispatch<SetStateAction<SortType>>;
  view: ViewType;
  setView: Dispatch<SetStateAction<ViewType>>;
}

const filters: FilterType[] = ["All", "Active", "Completed", "Overdue"];

export function GoalsUtilityBar({
  search,
  setSearch,
  filter,
  setFilter,
  sort,
  setSort,
  view,
  setView,
}: GoalsUtilityBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-gray-900 py-2 space-y-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search goals"
        className="w-full bg-gray-800 border-gray-700"
      />
      <div className="flex items-center gap-2 overflow-x-auto">
        {filters.map((f) => (
          <Button
            key={f}
            onClick={() => setFilter(f)}
            variant={f === filter ? "default" : "outline"}
            className="rounded-full px-3 py-1 text-sm"
          >
            {f}
          </Button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortType)}
          className="ml-auto rounded-md bg-gray-800 text-sm px-2 py-1 border border-gray-700"
        >
          <option value="az">A→Z</option>
          <option value="due">Due Soon</option>
          <option value="progress">Progress</option>
          <option value="updated">Recently Updated</option>
        </select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setView(view === "grid" ? "list" : "grid")}
        >
          {view === "grid" ? <ListIcon className="size-4" /> : <GridIcon className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
