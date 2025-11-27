"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  getMonumentsForUser,
  type Monument,
} from "@/lib/queries/monuments";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ENERGY } from "@/lib/scheduler/config";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import {
  ArrowLeft,
  Filter as FilterIcon,
  Loader2,
  Search as SearchIcon,
  Sparkles,
} from "lucide-react";
import type { PostgrestError } from "@supabase/supabase-js";

type ProjectRow = {
  id: string;
  user_id?: string | null;
  name?: string | null;
  Title?: string | null;
  title?: string | null;
  description?: string | null;
  why?: string | null;
  energy?: string | null;
  energy_id?: number | string | null;
  priority?: string | null;
  priority_id?: number | string | null;
  stage?: string | null;
  stage_id?: number | string | null;
  goal_id?: string | null;
  duration_min?: number | null;
  duration_minutes?: number | null;
  due_date?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  inserted_at?: string | null;
};

type HabitRow = {
  id: string;
  user_id?: string | null;
  name?: string | null;
  Title?: string | null;
  description?: string | null;
  energy?: string | null;
  energy_id?: number | string | null;
  priority?: string | null;
  priority_id?: number | string | null;
  skill_id?: string | null;
  goal_id?: string | null;
  recurrence?: string | null;
  habit_type?: string | null;
  type_id?: number | string | null;
  duration_minutes?: number | null;
  duration_min?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type GoalRow = {
  id: string;
  name?: string | null;
  Title?: string | null;
  monument_id?: string | null;
};

type NexusProject = {
  type: "project";
  id: string;
  name: string;
  description: string | null;
  energy: FlameLevel | null;
  priority: string | null;
  stage: string | null;
  goalId: string | null;
  goalName: string | null;
  monumentId: string | null;
  monumentTitle: string | null;
  monumentEmoji: string | null;
  skillIds: string[];
  updatedAt: string | null;
  nextScheduledAt: string | null;
};

type NexusHabit = {
  type: "habit";
  id: string;
  name: string;
  description: string | null;
  energy: FlameLevel | null;
  skillId: string | null;
  goalId: string | null;
  goalName: string | null;
  monumentId: string | null;
  monumentTitle: string | null;
  monumentEmoji: string | null;
  recurrence: string | null;
  habitType: string | null;
  durationMinutes: number | null;
  updatedAt: string | null;
  nextScheduledAt: string | null;
};

type NexusEntry = NexusProject | NexusHabit;

const FLAME_LEVELS = ENERGY.LIST as FlameLevel[];

const ENERGY_LABELS: Record<FlameLevel, string> = {
  NO: "No",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  ULTRA: "Ultra",
  EXTREME: "Extreme",
};

const ENERGY_OPTIONS = FLAME_LEVELS.map(level => ({
  value: level,
  label: ENERGY_LABELS[level],
}));

type NormalizedGoal = {
  id: string;
  name: string | null;
  monument_id: string | null;
};

type PriorityRow = {
  id: unknown;
  name?: string | null;
};

type ScheduleInstanceRow = {
  id: string;
  source_id?: string | null;
  source_type?: string | null;
  scheduled_at?: string | null;
  start_utc?: string | null;
  end_utc?: string | null;
  status?: string | null;
};

const DEFAULT_PRIORITY_PRESETS = [
  { code: "NO", label: "No" },
  { code: "LOW", label: "Low" },
  { code: "MEDIUM", label: "Medium" },
  { code: "HIGH", label: "High" },
  { code: "CRITICAL", label: "Critical" },
  { code: "ULTRA-CRITICAL", label: "Ultra Critical" },
] as const;

function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleString();
}

function pickFirstString(...candidates: Array<unknown>): string | null {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) return trimmed;
      continue;
    }
    if (typeof candidate === "number" || typeof candidate === "bigint") {
      return String(candidate);
    }
  }
  return null;
}

function normalizeEnergy(value: unknown): FlameLevel | null {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (FLAME_LEVELS.includes(normalized as FlameLevel)) {
      return normalized as FlameLevel;
    }
    return null;
  }
  return null;
}

function buildPriorityLookup(rows: PriorityRow[]): Map<string, string> {
  const lookup = new Map<string, string>();
  DEFAULT_PRIORITY_PRESETS.forEach(({ code, label }, index) => {
    lookup.set(code, label);
    lookup.set(code.toUpperCase(), label);
    lookup.set(String(index + 1), label);
  });
  for (const { code, label } of DEFAULT_PRIORITY_PRESETS) {
    lookup.set(code.toLowerCase(), label);
  }
  for (const row of rows) {
    const label = typeof row.name === "string" ? row.name.trim() : "";
    if (!label) continue;
    if (row.id != null) {
      lookup.set(String(row.id), label);
    }
    lookup.set(label.toUpperCase(), label);
    lookup.set(label.toLowerCase(), label);
  }
  return lookup;
}

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizePriority(value: unknown, lookup: Map<string, string>): string | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "bigint") {
    const key = String(value);
    return lookup.get(key) ?? null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const direct = lookup.get(trimmed) ?? lookup.get(trimmed.toUpperCase());
    if (direct) return direct;
    return toTitleCase(trimmed);
  }
  return null;
}

type RangeFetcher<T> = (
  from: number,
  to: number
) => Promise<{ data: T[] | null; error: PostgrestError | null }>;

async function fetchAllRows<T>(fetchRange: RangeFetcher<T>, chunkSize = 1000) {
  const rows: T[] = [];
  for (let from = 0; ; from += chunkSize) {
    const to = from + chunkSize - 1;
    const { data, error } = await fetchRange(from, to);
    if (error) {
      throw error;
    }
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < chunkSize) {
      break;
    }
  }
  return rows;
}

type SupabaseBrowserClient = ReturnType<typeof getSupabaseBrowser>;

async function fetchProjectSkillsForProjects(
  client: SupabaseBrowserClient,
  projectIds: string[],
  chunkSize = 200
) {
  if (!client || projectIds.length === 0) return [];
  const rows: Array<{ project_id: string; skill_id: string | null }> = [];
  for (let index = 0; index < projectIds.length; index += chunkSize) {
    const slice = projectIds.slice(index, index + chunkSize);
    const { data, error } = await client
      .from("project_skills")
      .select("project_id, skill_id")
      .in("project_id", slice);
    if (error) {
      throw error;
    }
    rows.push(...(data ?? []));
  }
  return rows;
}

export default function NexusPage() {
  const [projects, setProjects] = useState<NexusProject[]>([]);
  const [habits, setHabits] = useState<NexusHabit[]>([]);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "project" | "habit">(
    "all"
  );
  const [monumentFilter, setMonumentFilter] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [energyFilter, setEnergyFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setError("Supabase client is not available in this environment.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) throw new Error("You need to be signed in to view Nexus.");

        const monumentsPromise = getMonumentsForUser(user.id).catch((err) => {
          console.error("Failed to load monuments for Nexus", err);
          return [] as Monument[];
        });
        const skillsPromise = getSkillsForUser(user.id).catch((err) => {
          console.error("Failed to load skills for Nexus", err);
          return [] as Skill[];
        });

        const priorityPromise = supabase
          .from("priority")
          .select("id, name")
          .order("id", { ascending: true })
          .then(result => {
            if (result.error) {
              console.warn("Failed to load priority lookup", result.error);
              return [] as PriorityRow[];
            }
            return (result.data ?? []) as PriorityRow[];
          })
          .catch((err) => {
            console.warn("Priority lookup unavailable", err);
            return [] as PriorityRow[];
          });

        const schedulePromise = fetchAllRows<ScheduleInstanceRow>((from, to) =>
          supabase
            .from("schedule_instances")
            .select("source_id, source_type, start_utc, end_utc, status")
            .eq("user_id", user.id)
            .in("source_type", ["PROJECT", "HABIT"])
            .in("status", ["scheduled", "in_progress"])
            .order("start_utc", { ascending: true })
            .range(from, to)
        );

        const [projectRows, habitRowsData, goalRows, monumentRows, skillRows, priorityRows, scheduleRows] =
          await Promise.all([
            fetchAllRows<ProjectRow>((from, to) =>
              supabase
                .from("projects")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .range(from, to)
            ),
            fetchAllRows<HabitRow>((from, to) =>
              supabase
                .from("habits")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .range(from, to)
            ),
            fetchAllRows<GoalRow>((from, to) =>
              supabase
                .from("goals")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .range(from, to)
            ),
            monumentsPromise,
            skillsPromise,
            priorityPromise,
            schedulePromise,
          ]);

        const normalizedGoals: NormalizedGoal[] = goalRows.map((goal) => ({
          id: goal.id,
          name: pickFirstString(goal.name, goal.Title),
          monument_id: goal.monument_id ?? null,
        }));
        const goalMap = new Map<string, NormalizedGoal>(
          normalizedGoals.map((goal) => [goal.id, goal])
        );
        const monumentLookup = new Map(
          (monumentRows ?? []).map((monument) => [monument.id, monument])
        );
        const skillLookup = new Map(
          (skillRows ?? []).map((skill) => [skill.id, skill])
        );
        const priorityLookup = buildPriorityLookup(priorityRows);

        setMonuments(monumentRows ?? []);
        setSkills(skillRows ?? []);

        let projectSkills: Array<{ project_id: string; skill_id: string | null }> = [];
        const projectIds = projectRows.map((project) => project.id);

        if (projectIds.length > 0) {
          try {
            projectSkills = await fetchProjectSkillsForProjects(supabase, projectIds);
          } catch (skillLoadError) {
            console.error("Failed to load project skills", skillLoadError);
            projectSkills = [];
          }
        }

        const projectScheduleLookup = new Map<string, string>();
        const habitScheduleLookup = new Map<string, string>();
        for (const instance of scheduleRows) {
          if (!instance?.source_id) continue;
          const startMs = instance.start_utc ? Date.parse(instance.start_utc) : Number.NaN;
          const endMs = instance.end_utc ? Date.parse(instance.end_utc) : Number.NaN;
          const candidateMs = Number.isFinite(startMs)
            ? startMs
            : Number.isFinite(endMs)
              ? endMs
              : Number.POSITIVE_INFINITY;
          if (!Number.isFinite(candidateMs)) continue;
          const targetMap =
            instance.source_type === "HABIT"
              ? habitScheduleLookup
              : instance.source_type === "PROJECT"
                ? projectScheduleLookup
                : null;
          if (!targetMap) continue;
          const existing = targetMap.get(instance.source_id);
          if (existing && Date.parse(existing) <= candidateMs) continue;
          const value =
            Number.isFinite(startMs) && instance.start_utc
              ? instance.start_utc
            : Number.isFinite(endMs) && instance.end_utc
                ? instance.end_utc
                : null;
          if (value) {
            targetMap.set(instance.source_id, value);
          }
        }

        const projectSkillMap = new Map<string, string[]>();
        projectSkills.forEach((row) => {
          if (!row.project_id || !row.skill_id) return;
          const existing = projectSkillMap.get(row.project_id);
          if (existing) {
            existing.push(row.skill_id);
          } else {
            projectSkillMap.set(row.project_id, [row.skill_id]);
          }
        });
        const mappedProjects: NexusProject[] = projectRows.map((project) => {
          const goal = project.goal_id ? goalMap.get(project.goal_id) : null;
          const monumentId = goal?.monument_id ?? null;
          const monument = monumentId ? monumentLookup.get(monumentId) : null;
          const projectEnergy = normalizeEnergy(
            pickFirstString(project.energy, project.energy_id)
          );
          const projectPriority = normalizePriority(
            project.priority ?? project.priority_id ?? null,
            priorityLookup
          );
          const nextScheduledAt = projectScheduleLookup.get(project.id) ?? null;
          return {
            type: "project",
            id: project.id,
            name: pickFirstString(project.name, project.Title, project.title) ?? "Untitled project",
            description: pickFirstString(project.description, project.why),
            energy: projectEnergy,
            priority: projectPriority,
            stage:
              pickFirstString(
                project.stage,
                typeof project.stage_id !== "undefined" ? String(project.stage_id) : null
              ) ?? null,
            goalId: project.goal_id ?? null,
            goalName: goal?.name ?? null,
            monumentId,
            monumentTitle: monument?.title ?? null,
            monumentEmoji: monument?.emoji ?? null,
            skillIds: projectSkillMap.get(project.id) ?? [],
            updatedAt:
              pickFirstString(project.updated_at, project.inserted_at, project.created_at) ?? null,
            nextScheduledAt,
          };
        });

        const mappedHabits: NexusHabit[] = habitRowsData.map((habit) => {
          const goal = habit.goal_id ? goalMap.get(habit.goal_id) : null;
          const monumentId = goal?.monument_id ?? null;
          const monument = monumentId ? monumentLookup.get(monumentId) : null;
          const habitEnergy = normalizeEnergy(
            pickFirstString(habit.energy, habit.energy_id)
          );
          const nextScheduledAt = habitScheduleLookup.get(habit.id) ?? null;
          return {
            type: "habit",
            id: habit.id,
            name: pickFirstString(habit.name, habit.Title) ?? "Untitled habit",
            description: pickFirstString(habit.description),
            energy: habitEnergy,
            priority: null,
            skillId: habit.skill_id ?? null,
            goalId: habit.goal_id ?? null,
            goalName: goal?.name ?? null,
            monumentId,
            monumentTitle: monument?.title ?? null,
            monumentEmoji: monument?.emoji ?? null,
            recurrence: pickFirstString(habit.recurrence) ?? null,
            habitType:
              pickFirstString(
                habit.habit_type,
                typeof habit.type_id !== "undefined" ? String(habit.type_id) : null
              ) ?? null,
            durationMinutes: habit.duration_minutes ?? habit.duration_min ?? null,
            updatedAt: pickFirstString(habit.updated_at, habit.created_at) ?? null,
            nextScheduledAt,
          };
        });

        setProjects(mappedProjects);
        setHabits(mappedHabits);
      } catch (err) {
        console.error("Failed to load Nexus data", err);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load Nexus data. Please try again."
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const skillLookup = useMemo(
    () =>
      new Map(
        skills.map((skill) => [
          skill.id,
          { name: skill.name, icon: skill.icon ?? null },
        ])
      ),
    [skills]
  );

  const combinedEntries = useMemo<NexusEntry[]>(
    () => [...projects, ...habits],
    [projects, habits]
  );

  const priorityOptions = useMemo(() => {
    const set = new Set<string>();
    combinedEntries.forEach((entry) => {
      if (entry.type === "project" && entry.priority) {
        set.add(entry.priority);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [combinedEntries]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return combinedEntries
      .filter((entry) => {
        if (typeFilter !== "all" && entry.type !== typeFilter) {
          return false;
        }
        if (monumentFilter && entry.monumentId !== monumentFilter) {
          return false;
        }
        if (priorityFilter) {
          if (entry.type !== "project") return false;
          if ((entry.priority ?? "") !== priorityFilter) return false;
        }
        if (skillFilter) {
          if (entry.type === "project") {
            if (!entry.skillIds.includes(skillFilter)) {
              return false;
            }
          } else if (entry.skillId !== skillFilter) {
            return false;
          }
        }
        if (energyFilter) {
          if ((entry.energy ?? "") !== energyFilter) {
            return false;
          }
        }
        if (!query) return true;
        const haystack: string[] = [];
        haystack.push(
          entry.name,
          entry.description ?? "",
          entry.goalName ?? "",
          entry.monumentTitle ?? "",
          entry.monumentEmoji ?? ""
        );
        if (entry.type === "project") {
          entry.skillIds.forEach((id) => {
            const skill = skillLookup.get(id);
            if (skill?.name) haystack.push(skill.name);
          });
        } else if (entry.skillId) {
          const skill = skillLookup.get(entry.skillId);
          if (skill?.name) haystack.push(skill.name);
        }
        return haystack.some((term) =>
          term.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const getSortTime = (entry: NexusEntry) => {
          if (entry.nextScheduledAt) {
            const parsed = Date.parse(entry.nextScheduledAt);
            if (Number.isFinite(parsed)) return parsed;
          }
          if (entry.updatedAt) {
            const parsed = Date.parse(entry.updatedAt);
            if (Number.isFinite(parsed)) return parsed;
          }
          return Number.MAX_SAFE_INTEGER;
        };
        return getSortTime(a) - getSortTime(b);
      });
  }, [
    combinedEntries,
    energyFilter,
    monumentFilter,
    priorityFilter,
    search,
    skillFilter,
    skillLookup,
    typeFilter,
  ]);

  const resetFilters = () => {
    setTypeFilter("all");
    setMonumentFilter("");
    setSkillFilter("");
    setEnergyFilter("");
    setPriorityFilter("");
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#030612] text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
          <header className="relative rounded-2xl border border-white/5 bg-gradient-to-br from-[#131b2f] via-[#060812] to-[#010204] p-4 shadow-xl shadow-black/40">
            <Link
              href="/schedule"
              aria-label="Back to schedule"
              className="absolute left-4 top-4 inline-flex h-8 w-8 items-center justify-center text-lg font-semibold text-white/70 hover:text-white"
            >
              &lt;
            </Link>
            <div className="ml-10 space-y-1">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
                <Sparkles className="h-3 w-3 text-amber-400" />
                Nexus
              </p>
              <p className="text-xs text-white/65">Projects & Habits overview</p>
            </div>
            <div className="mt-3 space-y-2">
              <h1 className="text-xl font-semibold text-white">
                Everything scheduled in one glance
              </h1>
              <p className="text-xs text-white/70">
                Quick filters keep the table focused on whatever you need to move next.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/80">
                  <span className="text-white font-semibold">{projects.length}</span>
                  <span className="text-white/60">Projects</span>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/80">
                  <span className="text-white font-semibold">{habits.length}</span>
                  <span className="text-white/60">Habits</span>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/80">
                  <span className="text-white font-semibold">{filteredEntries.length}</span>
                  <span className="text-white/60">Active filters</span>
                </div>
              </div>
            </div>
          </header>

          <section className="space-y-4 rounded-3xl border border-white/5 bg-white/[0.03] p-6 shadow-xl shadow-black/40">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xl">
                <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search names, goals, monuments, or skills"
                  className="h-12 rounded-2xl border-white/10 bg-black/30 pl-11 text-sm text-white placeholder:text-white/40 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setFiltersOpen(prev => !prev)}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-white/80 transition hover:bg-white/20"
                  aria-label={filtersOpen ? "Hide filters" : "Show filters"}
                >
                  <FilterIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {filtersOpen ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Select
                      value={typeFilter}
                      onValueChange={(value) =>
                        setTypeFilter(value as "all" | "project" | "habit")
                      }
                      placeholder="Type"
                      className="w-full"
                    >
                      <SelectContent>
                        <SelectItem value="all">All entries</SelectItem>
                        <SelectItem value="project">Projects only</SelectItem>
                        <SelectItem value="habit">Habits only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Select
                    value={monumentFilter}
                    onValueChange={(value) => setMonumentFilter(value)}
                    placeholder="Monument"
                    className="w-full"
                  >
                    <SelectContent>
                      <SelectItem value="">All monuments</SelectItem>
                      {monuments.map((monument) => (
                        <SelectItem key={monument.id} value={monument.id}>
                          {monument.emoji ?? "🗿"} {monument.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={skillFilter}
                    onValueChange={(value) => setSkillFilter(value)}
                    placeholder="Skill"
                    className="w-full"
                  >
                    <SelectContent>
                      <SelectItem value="">All skills</SelectItem>
                      {[...skills]
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((skill) => (
                          <SelectItem key={skill.id} value={skill.id}>
                            {skill.icon ?? "🎯"} {skill.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={priorityFilter}
                    onValueChange={(value) => setPriorityFilter(value)}
                    placeholder="Priority"
                    className="w-full"
                  >
                    <SelectContent>
                      <SelectItem value="">All priorities</SelectItem>
                      {priorityOptions.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={energyFilter}
                    onValueChange={(value) => setEnergyFilter(value)}
                    placeholder="Energy"
                    className="w-full"
                  >
                    <SelectContent>
                      <SelectItem value="">All energy levels</SelectItem>
                      {ENERGY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex items-center gap-2">
                            <FlameEmber level={option.value} size="xs" className="shrink-0" />
                            <span>{option.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetFilters}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                >
                  <FilterIcon className="h-4 w-4" />
                  Reset filters
                </Button>
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center rounded-3xl border border-white/5 bg-black/30 p-10 text-white/70">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading Nexus…
              </div>
            )}
            {error && !loading && (
              <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-red-100">
                <p className="font-semibold">Something went wrong</p>
                <p className="mt-1 text-sm text-red-100/80">{error}</p>
              </div>
            )}
            {!loading && !error && filteredEntries.length === 0 && (
              <div className="rounded-3xl border border-white/5 bg-black/40 p-6 text-center text-white/70">
                Nothing matches those filters yet. Try loosening the search or
                clearing the filters to explore everything again.
              </div>
            )}
            {!loading && !error && filteredEntries.length > 0 && (
              <div className="overflow-x-auto rounded-3xl border border-white/5 bg-black/30 shadow-2xl shadow-black/40">
                <table className="w-full min-w-[900px] text-left text-[13px] text-white/80">
                  <thead className="bg-white/5 text-[10px] uppercase tracking-[0.25em] text-white/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Type</th>
                      <th className="px-3 py-2 text-left font-semibold">Name</th>
                      <th className="px-3 py-2 text-left font-semibold">Goal</th>
                      <th className="px-3 py-2 text-left font-semibold">Monument</th>
                      <th className="px-3 py-2 text-left font-semibold">Skills</th>
                      <th className="px-3 py-2 text-left font-semibold">Energy</th>
                      <th className="px-3 py-2 text-left font-semibold">Stage / Rhythm</th>
                      <th className="px-3 py-2 text-left font-semibold">Scheduled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => {
                      const timestamp = entry.nextScheduledAt
                        ? formatTimestamp(entry.nextScheduledAt)
                        : null;
                      let resolvedSkills: Array<{ id: string; name: string; icon: string | null }> = [];
                      if (entry.type === "project") {
                        resolvedSkills = entry.skillIds
                          .map((id) => {
                            const skill = skillLookup.get(id);
                            return skill ? { id, ...skill } : null;
                          })
                          .filter(
                            (skill): skill is { id: string; name: string; icon: string | null } =>
                              Boolean(skill)
                          );
                      } else if (entry.skillId) {
                        const skill = skillLookup.get(entry.skillId);
                        if (skill) {
                          resolvedSkills = [{ id: entry.skillId, ...skill }];
                        }
                      }
                      const stageLabel =
                        entry.type === "project"
                          ? entry.stage ?? "—"
                          : entry.recurrence ?? entry.habitType ?? "—";
                      const stageDetail =
                        entry.type === "project"
                          ? entry.priority ?? null
                          : entry.durationMinutes
                            ? `${entry.durationMinutes} min`
                            : null;

                      return (
                        <tr
                          key={`${entry.type}-${entry.id}`}
                          className="border-t border-white/10 bg-white/[0.01] text-[12px] leading-tight transition hover:bg-white/5"
                        >
                          <td className="px-3 py-3 align-top">
                            <Badge
                              variant="secondary"
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-semibold",
                                entry.type === "project"
                                  ? "bg-emerald-500/20 text-emerald-200"
                                  : "bg-blue-500/20 text-blue-200"
                              )}
                            >
                              {entry.type === "project" ? "Project" : "Habit"}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <p className="text-[13px] font-semibold text-white">{entry.name}</p>
                            {entry.description && (
                              <p className="mt-1 text-[11px] text-white/60">{entry.description}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {entry.goalName ? (
                              <span className="text-[12px]">{entry.goalName}</span>
                            ) : (
                              <span className="text-[12px] text-white/40">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {entry.monumentTitle ? (
                              <span className="flex items-center gap-2 text-[12px]">
                                <span>{entry.monumentEmoji ?? "🗿"}</span>
                                {entry.monumentTitle}
                              </span>
                            ) : (
                              <span className="text-[12px] text-white/40">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {resolvedSkills.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {resolvedSkills.map((skill) => (
                                  <Badge
                                    key={`${entry.id}-${skill.id}`}
                                    variant="outline"
                                    className="border-white/15 text-white/80"
                                  >
                                    {skill.icon ?? "🎯"} {skill.name}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[12px] text-white/40">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {entry.energy ? (
                              <span className="flex items-center gap-2">
                                <FlameEmber level={entry.energy} size="xs" className="shrink-0" />
                                <span className="text-[12px]">
                                  {ENERGY_LABELS[entry.energy] ?? entry.energy}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[12px] text-white/40">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="flex flex-col text-[12px] leading-tight">
                              <span>{stageLabel}</span>
                              {stageDetail && (
                                <span className="text-[11px] text-white/50">{stageDetail}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            {timestamp ? (
                              <span className="text-[12px]">{timestamp}</span>
                            ) : (
                              <span className="text-[12px] text-white/40">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
}
