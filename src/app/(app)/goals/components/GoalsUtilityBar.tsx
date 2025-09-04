"use client";

import { useState, useEffect } from "react";

export type EnergyFilter =
  | "All"
  | "No"
  | "Low"
  | "Medium"
  | "High"
  | "Ultra"
  | "Extreme";
export type PriorityFilter = "All" | "Low" | "Medium" | "High";
export type SortOption = "A→Z" | "Due Soon" | "Progress" | "Recently Updated";

interface GoalsUtilityBarProps {
  search: string;
  onSearch(term: string): void;
  energy: EnergyFilter;
  onEnergy(e: EnergyFilter): void;
  priority: PriorityFilter;
  onPriority(p: PriorityFilter): void;
  sort: SortOption;
  onSort(s: SortOption): void;
}

export function GoalsUtilityBar({
  search,
  onSearch,
  energy,
  onEnergy,
  priority,
  onPriority,
  sort,
  onSort,
}: GoalsUtilityBarProps) {
  const [local, setLocal] = useState(search);

  useEffect(() => {
    const id = setTimeout(() => onSearch(local), 200);
    return () => clearTimeout(id);
  }, [local, onSearch]);

  return (
    <div className="sticky top-0 z-10 bg-gray-900 px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-2">
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="Search goals"
          className="w-full px-3 py-2 rounded-md bg-gray-800 text-sm focus:outline-none"
        />
        <div className="flex items-center gap-1 sm:gap-2">
          <select
            value={energy}
            onChange={(e) => onEnergy(e.target.value as EnergyFilter)}
            className="bg-gray-800 text-sm px-2 py-1 rounded-md"
          >
            <option value="All">Energy: All</option>
            <option value="No">No</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Ultra">Ultra</option>
            <option value="Extreme">Extreme</option>
          </select>
          <select
            value={priority}
            onChange={(e) => onPriority(e.target.value as PriorityFilter)}
            className="bg-gray-800 text-sm px-2 py-1 rounded-md"
          >
            <option value="All">Priority: All</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
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
        </div>
      </div>
    </div>
  );
}
