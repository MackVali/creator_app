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
export type SortOption =
  | "A→Z"
  | "Due Soon"
  | "Progress"
  | "Recently Updated"
  | "Weight";

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
    <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#07050d]/80 p-6 shadow-[0_25px_90px_-60px_rgba(239,68,68,0.75)] backdrop-blur">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.08),transparent)] opacity-30" />
      <div className="relative flex flex-col gap-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Control filters</p>
          <p className="text-xs text-white/50">
            Tune the feed to surface only the goals you want to play.
          </p>
        </div>
        <div className="relative">
          <label className="sr-only" htmlFor="goals-search">
            Search goals
          </label>
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-white/40">
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
            id="goals-search"
            value={local}
            onChange={(event) => setLocal(event.target.value)}
            placeholder="Search goals or projects"
            className="w-full rounded-2xl border border-white/15 bg-white/[0.04] py-3.5 pl-12 pr-4 text-sm text-white placeholder:text-white/50 focus:border-cyan-400/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="Energy"
            value={energy}
            onChange={(value) => onEnergy(value as EnergyFilter)}
            options={["All", "No", "Low", "Medium", "High", "Ultra", "Extreme"]}
          />
          <FilterSelect
            label="Priority"
            value={priority}
            onChange={(value) => onPriority(value as PriorityFilter)}
            options={["All", "Low", "Medium", "High"]}
          />
          <FilterSelect
            label="Monument"
            value={monument}
            onChange={onMonument}
            options={["All", ...monuments.map((m) => ({ value: m.id, label: m.title }))]}
          />
          <FilterSelect
            label="Skill"
            value={skill}
            onChange={onSkill}
            options={["All", ...skills.map((s) => ({ value: s.id, label: s.name }))]}
          />
          <FilterSelect
            label="Sort"
            value={sort}
            onChange={(value) => onSort(value as SortOption)}
            options={["A→Z", "Due Soon", "Progress", "Recently Updated", "Weight"]}
          />
        </div>
      </div>
    </div>
  );
}

type FilterOption = string | { label: string; value: string };

interface FilterSelectProps {
  label: string;
  value: string;
  onChange(value: string): void;
  options: FilterOption[];
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const normalized = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">{label}</p>
      <div className="relative mt-1">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none bg-transparent text-sm font-semibold text-white focus:outline-none"
        >
          {normalized.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#07050d] text-white">
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-white/50">
          ▾
        </span>
      </div>
    </div>
  );
}
