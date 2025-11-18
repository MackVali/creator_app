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
export type PriorityFilter =
  | "All"
  | "NO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL"
  | "ULTRA-CRITICAL";
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
        <div className="grid grid-cols-3 gap-3">
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
            options={[
              { value: "All", label: "All" },
              { value: "NO", label: "No Priority" },
              { value: "LOW", label: "Low" },
              { value: "MEDIUM", label: "Medium" },
              { value: "HIGH", label: "High" },
              { value: "CRITICAL", label: "Critical" },
              { value: "ULTRA-CRITICAL", label: "Ultra-Critical" },
            ]}
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
            options={[
              { value: "All", label: "All" },
              ...skills.map((s) => ({ value: s.id, label: s.name })),
            ]}
            searchable
            searchPlaceholder="Search skills"
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
  searchable?: boolean;
  searchPlaceholder?: string;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  searchable = false,
  searchPlaceholder = "Search",
}: FilterSelectProps) {
  const [query, setQuery] = useState("");
  const searchId = `${label.toLowerCase().replace(/\s+/g, "-")}-search`;
  const normalized = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  );
  const filtered =
    searchable && query.trim()
      ? normalized.filter((option) => {
          if (option.value === value || option.value === "All") {
            return true;
          }
          return option.label.toLowerCase().includes(query.trim().toLowerCase());
        })
      : normalized;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="text-[9px] uppercase tracking-[0.2em] text-white/50 sm:text-[10px] sm:tracking-[0.3em]">
        {label}
      </p>
      {searchable && (
        <div className="mt-2">
          <label className="sr-only" htmlFor={searchId}>
            Search {label}
          </label>
          <input
            id={searchId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white placeholder:text-white/50 focus:border-cyan-400/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
            type="search"
          />
        </div>
      )}
      <div className="relative mt-0.5 sm:mt-1">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none bg-transparent text-xs font-medium text-white focus:outline-none sm:text-sm sm:font-semibold"
        >
          {filtered.length === 0 ? (
            <option value={value} disabled>
              No matches
            </option>
          ) : (
            filtered.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#07050d] text-white">
                {option.label}
              </option>
            ))
          )}
        </select>
        <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-white/50">
          ▾
        </span>
      </div>
    </div>
  );
}
