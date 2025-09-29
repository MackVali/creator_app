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
  monuments: { id: string; title: string }[];
  monument: string;
  onMonument(id: string): void;
  skills: { id: string; name: string }[];
  skill: string;
  onSkill(id: string): void;
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
  monuments,
  monument,
  onMonument,
  skills,
  skill,
  onSkill,
}: GoalsUtilityBarProps) {
  const [local, setLocal] = useState(search);

  useEffect(() => {
    const id = setTimeout(() => onSearch(local), 200);
    return () => clearTimeout(id);
  }, [local, onSearch]);

  return (
    <div className="relative z-10">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_25px_80px_-40px_rgba(79,70,229,0.6)] backdrop-blur">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/40">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <input
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Search goals or projects"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 md:grid-cols-5">
          <select
            value={energy}
            onChange={(e) => onEnergy(e.target.value as EnergyFilter)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left font-medium text-white transition focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
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
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left font-medium text-white transition focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          >
            <option value="All">Priority: All</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
          <select
            value={monument}
            onChange={(e) => onMonument(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left font-medium text-white transition focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          >
            <option value="All">Monument: All</option>
            {monuments.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <select
            value={skill}
            onChange={(e) => onSkill(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left font-medium text-white transition focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          >
            <option value="All">Skill: All</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortOption)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left font-medium text-white transition focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
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
