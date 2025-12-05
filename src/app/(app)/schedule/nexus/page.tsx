"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  getMonumentsForUser,
  type Monument,
} from "@/lib/queries/monuments";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getCatsForUser } from "@/lib/data/cats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import type { CatRow } from "@/lib/types/cat";

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
  weight?: number | null;
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
  weight: number | null;
  weightSnapshot: number | null;
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

type SkillCategoryOption = {
  id: string;
  label: string;
  icon: string | null;
  skills: Skill[];
};

type ProjectEditableField = "name" | "goal" | "skills" | "energy" | "stage";
type HabitEditableField = "name" | "goal" | "skill" | "energy" | "rhythm";

type EditTarget =
  | { type: "project"; id: string; field: ProjectEditableField }
  | { type: "habit"; id: string; field: HabitEditableField };

const PROJECT_STAGE_OPTIONS = [
  { value: "RESEARCH", label: "Research" },
  { value: "TEST", label: "Test" },
  { value: "BUILD", label: "Build" },
  { value: "REFINE", label: "Refine" },
  { value: "RELEASE", label: "Release" },
];

const HABIT_RECURRENCE_PRESETS = [
  "DAILY",
  "WEEKLY",
  "BI-WEEKLY",
  "MONTHLY",
  "6 MONTHS",
  "QUARTERLY",
  "YEARLY",
  "EVERY X DAYS",
  "NONE",
];

const FLAME_LEVELS = ENERGY.LIST as FlameLevel[];

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const VIRTUAL_RECURRENCE_DAY_OFFSETS: Record<string, number> = {
  daily: 1,
  everyday: 1,
  weekly: 7,
  "bi-weekly": 14,
  monthly: 30,
  "bi-monthly": 60,
  "every 6 months": 180,
  quarterly: 90,
  yearly: 365,
};
const DEFAULT_VIRTUAL_RECURRENCE_DAYS = 45;

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

const FILTER_TRIGGER_CLASS =
  "h-9 rounded-lg border border-black/70 bg-black/30 px-2.5 text-[11px] text-white/80";
const FILTER_CONTENT_CLASS = "bg-black/95";
const FILTER_ITEM_CLASS = "px-2 py-1.5 text-[12px]";
const SHEET_SELECT_TRIGGER_CLASS =
  "h-10 w-full rounded-lg border border-white/20 bg-white/[0.05] px-3 text-sm text-white";
const SHEET_SELECT_CONTENT_CLASS = "bg-[#05070c] border border-white/10";
const SHEET_SELECT_ITEM_CLASS = "px-3 py-2 text-sm";

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
  weight_snapshot?: number | null;
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

function parseTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEveryXDays(value: string): number | null {
  const match = /^every\s+(\d+)\s+day/i.exec(value);
  if (!match) return null;
  const candidate = Number(match[1]);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatWeightValue(value?: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.00$/, "");
}

function getVirtualRecurrenceDays(recurrence?: string | null): number | null {
  const normalized = recurrence?.toLowerCase().trim() ?? "";
  if (!normalized) {
    return DEFAULT_VIRTUAL_RECURRENCE_DAYS;
  }
  if (Object.prototype.hasOwnProperty.call(VIRTUAL_RECURRENCE_DAY_OFFSETS, normalized)) {
    return VIRTUAL_RECURRENCE_DAY_OFFSETS[normalized];
  }
  const parsedEvery = parseEveryXDays(normalized);
  if (parsedEvery) {
    return parsedEvery;
  }
  return DEFAULT_VIRTUAL_RECURRENCE_DAYS;
}

function getVirtualNextTimestamp(entry: NexusEntry): number | null {
  if (entry.type !== "habit") return null;
  const offsetDays = getVirtualRecurrenceDays(entry.recurrence);
  if (!offsetDays || offsetDays <= 0) return null;
  const updatedMs = parseTimestamp(entry.updatedAt);
  const base = Math.max(updatedMs ?? 0, Date.now());
  return base + offsetDays * DAY_IN_MS;
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
  const [goals, setGoals] = useState<NormalizedGoal[]>([]);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
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
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState({
    goal: true,
    monument: true,
    skill: true,
    energy: true,
  });

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
        const categoriesPromise = getCatsForUser(user.id, supabase).catch((err) => {
          console.error("Failed to load skill categories for Nexus", err);
          return [] as CatRow[];
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
            .select("source_id, source_type, start_utc, end_utc, status, weight_snapshot")
            .eq("user_id", user.id)
            .in("source_type", ["PROJECT", "HABIT"])
            .in("status", ["scheduled", "in_progress"])
            .order("start_utc", { ascending: true })
            .range(from, to)
        );

        const [projectRows, habitRowsData, goalRows, monumentRows, skillRows, categoryRows, priorityRows, scheduleRows] =
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
            categoriesPromise,
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
        setGoals(normalizedGoals);
        const monumentLookup = new Map(
          (monumentRows ?? []).map((monument) => [monument.id, monument])
        );
        const skillLookup = new Map(
          (skillRows ?? []).map((skill) => [skill.id, skill])
        );
        const priorityLookup = buildPriorityLookup(priorityRows);

        setMonuments(monumentRows ?? []);
        setSkills(skillRows ?? []);
        setSkillCategories(categoryRows ?? []);

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
        const projectWeightSnapshotLookup = new Map<string, number>();
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
          const isHabitSource = instance.source_type === "HABIT";
          const isProjectSource = instance.source_type === "PROJECT";
          const targetMap =
            isHabitSource
              ? habitScheduleLookup
              : isProjectSource
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
            if (isProjectSource) {
              const weightSnapshot = normalizeNumber(instance.weight_snapshot);
              if (weightSnapshot != null) {
                projectWeightSnapshotLookup.set(instance.source_id, weightSnapshot);
              } else {
                projectWeightSnapshotLookup.delete(instance.source_id);
              }
            }
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
          const weightSnapshot = projectWeightSnapshotLookup.get(project.id) ?? null;
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
            weight: normalizeNumber(project.weight),
            weightSnapshot,
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

  const groupedSkillOptions = useMemo<SkillCategoryOption[]>(() => {
    if (skills.length === 0) return [];

    const categoryMap = new Map<string, SkillCategoryOption>();
    skillCategories.forEach((category) => {
      const label = category.name?.trim() || "Untitled category";
      categoryMap.set(category.id, {
        id: category.id,
        label,
        icon: category.icon ?? null,
        skills: [],
      });
    });

    const sortedSkills = [...skills].sort((a, b) => a.name.localeCompare(b.name));
    sortedSkills.forEach((skill) => {
      const groupId = skill.cat_id ?? "uncategorized";
      if (!categoryMap.has(groupId)) {
        const fallbackLabel =
          groupId === "uncategorized" ? "Uncategorized" : "Other";
        categoryMap.set(groupId, {
          id: groupId,
          label: fallbackLabel,
          icon: null,
          skills: [],
        });
      }
      categoryMap.get(groupId)!.skills.push(skill);
    });

    const ordered: SkillCategoryOption[] = [];
    const usedIds = new Set<string>();

    skillCategories.forEach((category) => {
      const group = categoryMap.get(category.id);
      if (!group || group.skills.length === 0) return;
      ordered.push({
        ...group,
        skills: [...group.skills].sort((a, b) => a.name.localeCompare(b.name)),
      });
      usedIds.add(category.id);
    });

    const leftovers = Array.from(categoryMap.values())
      .filter((group) => !usedIds.has(group.id) && group.skills.length > 0)
      .map((group) => ({
        ...group,
        skills: [...group.skills].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        if (a.id === "uncategorized") return 1;
        if (b.id === "uncategorized") return -1;
        return a.label.localeCompare(b.label);
      });

    return [...ordered, ...leftovers];
  }, [skillCategories, skills]);

  const activeEditEntry = useMemo<NexusEntry | null>(() => {
    if (!editTarget) return null;
    if (editTarget.type === "project") {
      return projects.find((project) => project.id === editTarget.id) ?? null;
    }
    return habits.find((habit) => habit.id === editTarget.id) ?? null;
  }, [editTarget, habits, projects]);

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
          const nextMs = parseTimestamp(entry.nextScheduledAt);
          if (nextMs != null) {
            return nextMs;
          }
          const virtualMs = getVirtualNextTimestamp(entry);
          if (virtualMs != null) {
            return virtualMs;
          }
          const updatedMs = parseTimestamp(entry.updatedAt);
          if (updatedMs != null) {
            return updatedMs;
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

  const startEdit = (
    entry: NexusEntry,
    field: ProjectEditableField | HabitEditableField
  ) => {
    setEditError(null);
    if (entry.type === "project") {
      setEditTarget({ type: "project", id: entry.id, field: field as ProjectEditableField });
    } else {
      setEditTarget({ type: "habit", id: entry.id, field: field as HabitEditableField });
    }
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditError(null);
    setEditTarget(null);
  };

  const toggleColumnVisibility = (key: keyof typeof columnVisibility) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const resolveGoalMetadata = (goalId: string | null) => {
    if (!goalId) {
      return {
        goalId: null,
        goalName: null,
        monumentId: null,
        monumentTitle: null,
        monumentEmoji: null,
      } as const;
    }
    const goal = goals.find((g) => g.id === goalId) ?? null;
    const monumentRecord = goal?.monument_id
      ? monuments.find((monument) => monument.id === goal.monument_id) ?? null
      : null;
    return {
      goalId,
      goalName: goal?.name ?? null,
      monumentId: goal?.monument_id ?? null,
      monumentTitle: monumentRecord?.title ?? null,
      monumentEmoji: monumentRecord?.emoji ?? null,
    } as const;
  };

  const getCellInteractionProps = (
    entry: NexusEntry,
    field: ProjectEditableField | HabitEditableField
  ) => ({
    role: "button" as const,
    tabIndex: 0,
    onClick: () => startEdit(entry, field),
    onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        startEdit(entry, field);
      }
    },
  });

  const handleSaveField = async (value: unknown) => {
    if (!editTarget || !activeEditEntry) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setEditError("Supabase client is not available.");
      return;
    }
    setEditSaving(true);
    setEditError(null);

    try {
      if (editTarget.type === "project") {
        const project = activeEditEntry as NexusProject;
        if (editTarget.field === "name" && typeof value === "string") {
          const trimmed = value.trim();
          await supabase.from("projects").update({ name: trimmed || null }).eq("id", project.id);
          setProjects(prev =>
            prev.map(item =>
              item.id === project.id
                ? {
                    ...item,
                    name: trimmed || "Untitled project",
                  }
                : item
            )
          );
        } else if (editTarget.field === "goal" && (typeof value === "string" || value === null)) {
          const nextGoalId = value && value.trim().length > 0 ? value : null;
          await supabase.from("projects").update({ goal_id: nextGoalId }).eq("id", project.id);
          const metadata = resolveGoalMetadata(nextGoalId);
          setProjects(prev =>
            prev.map(item =>
              item.id === project.id
                ? {
                    ...item,
                    goalId: metadata.goalId,
                    goalName: metadata.goalName,
                    monumentId: metadata.monumentId,
                    monumentEmoji: metadata.monumentEmoji,
                    monumentTitle: metadata.monumentTitle,
                  }
                : item
            )
          );
        } else if (editTarget.field === "energy" && typeof value === "string") {
          await supabase.from("projects").update({ energy: value }).eq("id", project.id);
          setProjects(prev =>
            prev.map(item =>
              item.id === project.id
                ? {
                    ...item,
                    energy: value as FlameLevel,
                  }
                : item
            )
          );
        } else if (
          editTarget.field === "stage" &&
          typeof value === "object" &&
          value !== null &&
          "stage" in value
        ) {
          const stageValue = typeof (value as { stage?: string }).stage === "string"
            ? ((value as { stage?: string }).stage ?? "")
            : "";
          const priorityValue =
            typeof (value as { priority?: string | null }).priority === "string"
              ? (value as { priority?: string | null }).priority
              : null;
          await supabase
            .from("projects")
            .update({ stage: stageValue || null, priority: priorityValue })
            .eq("id", project.id);
          setProjects(prev =>
            prev.map(item =>
              item.id === project.id
                ? {
                    ...item,
                    stage: stageValue || null,
                    priority: priorityValue,
                  }
                : item
            )
          );
        } else if (editTarget.field === "skills" && Array.isArray(value)) {
          await supabase.from("project_skills").delete().eq("project_id", project.id);
          if (value.length > 0) {
            await supabase
              .from("project_skills")
              .insert(value.map((id: string) => ({ project_id: project.id, skill_id: id })));
          }
          setProjects(prev =>
            prev.map(item =>
              item.id === project.id
                ? {
                    ...item,
                    skillIds: value,
                  }
                : item
            )
          );
        }
      } else {
        const habit = activeEditEntry as NexusHabit;
        if (editTarget.field === "name" && typeof value === "string") {
          const trimmed = value.trim();
          await supabase.from("habits").update({ name: trimmed || null }).eq("id", habit.id);
          setHabits(prev =>
            prev.map(item =>
              item.id === habit.id
                ? {
                    ...item,
                    name: trimmed || "Untitled habit",
                  }
                : item
            )
          );
        } else if (editTarget.field === "goal" && (typeof value === "string" || value === null)) {
          const nextGoalId = value && value.trim().length > 0 ? value : null;
          await supabase.from("habits").update({ goal_id: nextGoalId }).eq("id", habit.id);
          const metadata = resolveGoalMetadata(nextGoalId);
          setHabits(prev =>
            prev.map(item =>
              item.id === habit.id
                ? {
                    ...item,
                    goalId: metadata.goalId,
                    goalName: metadata.goalName,
                    monumentId: metadata.monumentId,
                    monumentEmoji: metadata.monumentEmoji,
                    monumentTitle: metadata.monumentTitle,
                  }
                : item
            )
          );
        } else if (editTarget.field === "energy" && typeof value === "string") {
          await supabase.from("habits").update({ energy: value }).eq("id", habit.id);
          setHabits(prev =>
            prev.map(item =>
              item.id === habit.id
                ? {
                    ...item,
                    energy: value as FlameLevel,
                  }
                : item
            )
          );
        } else if (editTarget.field === "skill" && (typeof value === "string" || value === null)) {
          const nextSkillId = value && value.trim().length > 0 ? value : null;
          await supabase.from("habits").update({ skill_id: nextSkillId }).eq("id", habit.id);
          setHabits(prev =>
            prev.map(item =>
              item.id === habit.id
                ? {
                    ...item,
                    skillId: nextSkillId,
                  }
                : item
            )
          );
        } else if (
          editTarget.field === "rhythm" &&
          typeof value === "object" &&
          value !== null &&
          "recurrence" in value
        ) {
          const payload = value as {
            recurrence: string | null;
            habitType: string | null;
            durationMinutes: number | null;
          };
          await supabase
            .from("habits")
            .update({
              recurrence: payload.recurrence,
              habit_type: payload.habitType,
              duration_minutes: payload.durationMinutes,
            })
            .eq("id", habit.id);
          setHabits(prev =>
            prev.map(item =>
              item.id === habit.id
                ? {
                    ...item,
                    recurrence: payload.recurrence,
                    habitType: payload.habitType,
                    durationMinutes: payload.durationMinutes,
                  }
                : item
            )
          );
        }
      }
      closeEdit();
    } catch (error) {
      console.error("Failed to update entry", error);
      setEditError(error instanceof Error ? error.message : "Unable to save changes.");
    } finally {
      setEditSaving(false);
    }
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
              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70">
                  <span className="text-white font-semibold">{projects.length}</span>
                  <span className="text-white/50">Projects</span>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70">
                  <span className="text-white font-semibold">{habits.length}</span>
                  <span className="text-white/50">Habits</span>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70">
                  <span className="text-white font-semibold">{filteredEntries.length}</span>
                  <span className="text-white/50">Active filters</span>
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
              <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                <span className="mr-1 text-white/60">Columns:</span>
                {([
                  { key: "goal", label: "Goal" },
                  { key: "monument", label: "Monument" },
                  { key: "skill", label: "Skills" },
                  { key: "energy", label: "Energy" },
                ] as const).map(({ key, label }) => {
                  const active = columnVisibility[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleColumnVisibility(key)}
                      className={cn(
                        "rounded-full px-2 py-0.5",
                        active
                          ? "border border-white/40 bg-white/10 text-white"
                          : "border border-white/20 bg-white/0 text-white/50"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {filtersOpen ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Select
                      value={typeFilter}
                      onValueChange={(value) =>
                        setTypeFilter(value as "all" | "project" | "habit")
                      }
                      placeholder="Type"
                      className="w-full"
                      triggerClassName={FILTER_TRIGGER_CLASS}
                      contentWrapperClassName={FILTER_CONTENT_CLASS}
                    >
                      <SelectContent>
                        <SelectItem className={FILTER_ITEM_CLASS} value="all">
                          All entries
                        </SelectItem>
                        <SelectItem className={FILTER_ITEM_CLASS} value="project">
                          Projects only
                        </SelectItem>
                        <SelectItem className={FILTER_ITEM_CLASS} value="habit">
                          Habits only
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Select
                    value={monumentFilter}
                    onValueChange={(value) => setMonumentFilter(value)}
                    placeholder="Monument"
                    className="w-full"
                    triggerClassName={FILTER_TRIGGER_CLASS}
                    contentWrapperClassName={FILTER_CONTENT_CLASS}
                  >
                    <SelectContent>
                      <SelectItem className={FILTER_ITEM_CLASS} value="">
                        All monuments
                      </SelectItem>
                      {monuments.map((monument) => (
                        <SelectItem
                          key={monument.id}
                          value={monument.id}
                          className={FILTER_ITEM_CLASS}
                        >
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
                    triggerClassName={FILTER_TRIGGER_CLASS}
                    contentWrapperClassName={FILTER_CONTENT_CLASS}
                  >
                    <SelectContent>
                      <SelectItem className={FILTER_ITEM_CLASS} value="">
                        All skills
                      </SelectItem>
                      {groupedSkillOptions.map((group) => (
                        <div key={`skill-group-${group.id}`} className="px-1 pt-2 text-[10px]">
                          <p className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-[0.3em] text-white/40">
                            {group.icon ? `${group.icon} ` : ""}
                            {group.label}
                          </p>
                          <div className="space-y-1">
                            {group.skills.map((skill) => (
                              <SelectItem
                                key={skill.id}
                                value={skill.id}
                                className={FILTER_ITEM_CLASS}
                              >
                                {skill.icon ?? "🎯"} {skill.name}
                              </SelectItem>
                            ))}
                          </div>
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={priorityFilter}
                    onValueChange={(value) => setPriorityFilter(value)}
                    placeholder="Priority"
                    className="w-full"
                    triggerClassName={FILTER_TRIGGER_CLASS}
                    contentWrapperClassName={FILTER_CONTENT_CLASS}
                  >
                    <SelectContent>
                      <SelectItem className={FILTER_ITEM_CLASS} value="">
                        All priorities
                      </SelectItem>
                      {priorityOptions.map((priority) => (
                        <SelectItem
                          key={priority}
                          value={priority}
                          className={FILTER_ITEM_CLASS}
                        >
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
                    triggerClassName={FILTER_TRIGGER_CLASS}
                    contentWrapperClassName={FILTER_CONTENT_CLASS}
                  >
                    <SelectContent>
                      <SelectItem className={FILTER_ITEM_CLASS} value="">
                        All energy levels
                      </SelectItem>
                      {ENERGY_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className={FILTER_ITEM_CLASS}
                        >
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
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10"
                >
                  <FilterIcon className="h-3.5 w-3.5" />
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
                      {columnVisibility.goal ? (
                        <th className="px-3 py-2 text-left font-semibold">Goal</th>
                      ) : null}
                      {columnVisibility.monument ? (
                        <th className="px-3 py-2 text-left font-semibold">Monument</th>
                      ) : null}
                      {columnVisibility.skill ? (
                        <th className="px-3 py-2 text-left font-semibold">Skills</th>
                      ) : null}
                      {columnVisibility.energy ? (
                        <th className="px-3 py-2 text-left font-semibold">Energy</th>
                      ) : null}
                      <th className="px-3 py-2 text-left font-semibold">Stage / Rhythm</th>
                      <th className="px-3 py-2 text-left font-semibold">Weight</th>
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
                      const weightDisplay =
                        entry.type === "project"
                          ? formatWeightValue(entry.weightSnapshot ?? entry.weight ?? null)
                          : null;
                      const skillField: ProjectEditableField | HabitEditableField =
                        entry.type === "project" ? "skills" : "skill";
                      const stageField: ProjectEditableField | HabitEditableField =
                        entry.type === "project" ? "stage" : "rhythm";

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
                          <td
                            className="px-3 py-3 align-top cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                            {...getCellInteractionProps(entry, "name")}
                          >
                            <p className="text-[13px] font-semibold text-white">{entry.name}</p>
                            {entry.description && (
                              <p className="mt-1 text-[11px] text-white/60">{entry.description}</p>
                            )}
                          </td>
                          {columnVisibility.goal ? (
                            <td
                              className="px-3 py-3 align-top cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                              {...getCellInteractionProps(entry, "goal")}
                            >
                              {entry.goalName ? (
                                <span className="text-[12px]">{entry.goalName}</span>
                              ) : (
                                <span className="text-[12px] text-white/40">—</span>
                              )}
                            </td>
                          ) : null}
                          {columnVisibility.monument ? (
                            <td
                              className="px-3 py-3 align-top cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                              {...getCellInteractionProps(entry, "goal")}
                            >
                              {entry.monumentTitle ? (
                                <span className="flex items-center gap-2 text-[12px]">
                                  <span>{entry.monumentEmoji ?? "🗿"}</span>
                                  {entry.monumentTitle}
                                </span>
                              ) : (
                                <span className="text-[12px] text-white/40">—</span>
                              )}
                            </td>
                          ) : null}
                          {columnVisibility.skill ? (
                            <td
                              className="px-3 py-3 align-top cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                              {...getCellInteractionProps(entry, skillField)}
                            >
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
                          ) : null}
                          {columnVisibility.energy ? (
                            <td
                              className="px-3 py-3 align-top cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                              {...getCellInteractionProps(entry, "energy")}
                            >
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
                          ) : null}
                          <td
                            className="px-3 py-3 align-top cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                            {...getCellInteractionProps(entry, stageField)}
                          >
                            <div className="flex flex-col text-[12px] leading-tight">
                              <span>{stageLabel}</span>
                              {stageDetail && (
                                <span className="text-[11px] text-white/50">{stageDetail}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            {weightDisplay ? (
                              <span className="text-[12px]">{weightDisplay}</span>
                            ) : (
                              <span className="text-[12px] text-white/40">—</span>
                            )}
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
      <Sheet
        open={Boolean(editTarget && activeEditEntry)}
        onOpenChange={(open) => {
          if (!open) {
            closeEdit();
          }
        }}
      >
        <SheetContent side="right" className="bg-[#05070c] text-white sm:max-w-md">
          {editTarget && activeEditEntry ? (
            <FieldEditorForm
              target={editTarget}
              entry={activeEditEntry}
              goals={goals}
              skills={skills}
              saving={editSaving}
              error={editError}
              onCancel={closeEdit}
              onSubmit={handleSaveField}
            />
          ) : (
            <div className="p-6 text-sm text-white/70">
              Select a cell in the Nexus table to edit it.
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ProtectedRoute>
  );
}

type FieldEditorFormProps = {
  target: EditTarget;
  entry: NexusEntry;
  goals: NormalizedGoal[];
  skills: Skill[];
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: unknown) => Promise<void>;
};

function FieldEditorForm({
  target,
  entry,
  goals,
  skills,
  saving,
  error,
  onCancel,
  onSubmit,
}: FieldEditorFormProps) {
  const [textValue, setTextValue] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [energyValue, setEnergyValue] = useState(entry.energy ?? "NO");
  const [stageValue, setStageValue] = useState(entry.stage ?? PROJECT_STAGE_OPTIONS[0].value);
  const [priorityValue, setPriorityValue] = useState(entry.type === "project" ? entry.priority ?? "" : "");
  const [skillSelection, setSkillSelection] = useState<Set<string>>(
    entry.type === "project" ? new Set(entry.skillIds) : new Set()
  );
  const [singleSkillValue, setSingleSkillValue] = useState(entry.type === "habit" ? entry.skillId ?? "" : "");
  const [habitRecurrenceValue, setHabitRecurrenceValue] = useState(
    entry.type === "habit" ? entry.recurrence ?? "" : ""
  );
  const [habitTypeValue, setHabitTypeValue] = useState(
    entry.type === "habit" ? entry.habitType ?? "" : ""
  );
  const [habitDurationValue, setHabitDurationValue] = useState(
    entry.type === "habit" && entry.durationMinutes
      ? String(entry.durationMinutes)
      : ""
  );

  useEffect(() => {
    setTextValue(entry.name ?? "");
    setGoalValue(entry.goalId ?? "");
    setEnergyValue(entry.energy ?? "NO");
    if (entry.type === "project") {
      setStageValue(entry.stage ?? PROJECT_STAGE_OPTIONS[0].value);
      setPriorityValue(entry.priority ?? "");
      setSkillSelection(new Set(entry.skillIds));
    } else {
      setSingleSkillValue(entry.skillId ?? "");
      setHabitRecurrenceValue(entry.recurrence ?? "");
      setHabitTypeValue(entry.habitType ?? "");
      setHabitDurationValue(entry.durationMinutes ? String(entry.durationMinutes) : "");
    }
  }, [entry, target]);

  const toggleSkillSelection = (skillId: string) => {
    setSkillSelection((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    switch (target.field) {
      case "name":
        await onSubmit(textValue);
        break;
      case "goal":
        await onSubmit(goalValue);
        break;
      case "energy":
        await onSubmit(energyValue);
        break;
      case "stage":
        await onSubmit({ stage: stageValue, priority: priorityValue || null });
        break;
      case "skills":
        await onSubmit(Array.from(skillSelection));
        break;
      case "skill":
        await onSubmit(singleSkillValue);
        break;
      case "rhythm": {
        const trimmedRecurrence = habitRecurrenceValue.trim();
        const trimmedType = habitTypeValue.trim();
        const durationNumber = habitDurationValue.trim()
          ? Number(habitDurationValue)
          : NaN;
        await onSubmit({
          recurrence: trimmedRecurrence ? trimmedRecurrence : null,
          habitType: trimmedType ? trimmedType : null,
          durationMinutes: Number.isFinite(durationNumber) ? durationNumber : null,
        });
        break;
      }
      default:
        break;
    }
  };

  const fieldLabel = (() => {
    switch (target.field) {
      case "name":
        return "Name";
      case "goal":
        return "Goal";
      case "energy":
        return "Energy";
      case "stage":
        return "Stage & priority";
      case "skills":
        return "Linked skills";
      case "skill":
        return "Skill";
      case "rhythm":
        return "Rhythm & duration";
      default:
        return "";
    }
  })();

  let body: ReactNode = null;

  if (target.field === "name") {
    body = (
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
          Name
        </label>
        <Input
          value={textValue}
          onChange={(event) => setTextValue(event.target.value)}
          className="border-white/20 bg-white/[0.08] text-white"
          placeholder={`Enter a ${entry.type === "project" ? "project" : "habit"} name`}
        />
      </div>
    );
  } else if (target.field === "goal") {
    body = (
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
          Goal
        </label>
        <Select
          value={goalValue}
          onValueChange={setGoalValue}
          placeholder="Select goal"
          className="w-full"
          triggerClassName={SHEET_SELECT_TRIGGER_CLASS}
          contentWrapperClassName={SHEET_SELECT_CONTENT_CLASS}
        >
          <SelectContent>
            <SelectItem className={SHEET_SELECT_ITEM_CLASS} value="">
              No goal
            </SelectItem>
            {goals.length === 0 ? (
              <SelectItem className={SHEET_SELECT_ITEM_CLASS} value="__disabled" disabled>
                No goals available
              </SelectItem>
            ) : (
              goals.map((goal) => (
                <SelectItem key={goal.id} className={SHEET_SELECT_ITEM_CLASS} value={goal.id}>
                  {goal.name ?? "Untitled goal"}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    );
  } else if (target.field === "energy") {
    body = (
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
          Energy level
        </label>
        <Select
          value={energyValue}
          onValueChange={setEnergyValue}
          placeholder="Select energy"
          className="w-full"
          triggerClassName={SHEET_SELECT_TRIGGER_CLASS}
          contentWrapperClassName={SHEET_SELECT_CONTENT_CLASS}
        >
          <SelectContent>
            {ENERGY_OPTIONS.map((option) => (
              <SelectItem key={option.value} className={SHEET_SELECT_ITEM_CLASS} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  } else if (target.field === "stage" && entry.type === "project") {
    body = (
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
            Stage
          </label>
          <Select
            value={stageValue || PROJECT_STAGE_OPTIONS[0].value}
            onValueChange={setStageValue}
            className="w-full"
            triggerClassName={SHEET_SELECT_TRIGGER_CLASS}
            contentWrapperClassName={SHEET_SELECT_CONTENT_CLASS}
          >
            <SelectContent>
              {PROJECT_STAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} className={SHEET_SELECT_ITEM_CLASS} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
            Priority
          </label>
          <Select
            value={priorityValue ?? ""}
            onValueChange={setPriorityValue}
            placeholder="Select priority"
            className="w-full"
            triggerClassName={SHEET_SELECT_TRIGGER_CLASS}
            contentWrapperClassName={SHEET_SELECT_CONTENT_CLASS}
          >
            <SelectContent>
              <SelectItem className={SHEET_SELECT_ITEM_CLASS} value="">
                No priority
              </SelectItem>
              {DEFAULT_PRIORITY_PRESETS.map((preset) => (
                <SelectItem key={preset.code} className={SHEET_SELECT_ITEM_CLASS} value={preset.code}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  } else if (target.field === "skills" && entry.type === "project") {
    body = (
      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
          Linked skills
        </label>
        <ScrollArea className="max-h-64 rounded-xl border border-white/10 p-1">
          {skills.length === 0 ? (
            <p className="p-3 text-sm text-white/50">You have not created any skills yet.</p>
          ) : (
            <div className="space-y-1">
              {[...skills]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((skill) => (
                  <label
                    key={skill.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white/10"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/30 bg-transparent"
                      checked={skillSelection.has(skill.id)}
                      onChange={() => toggleSkillSelection(skill.id)}
                    />
                    <span>
                      {skill.icon ?? "🎯"} {skill.name}
                    </span>
                  </label>
                ))}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  } else if (target.field === "skill" && entry.type === "habit") {
    body = (
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
          Skill
        </label>
        <Select
          value={singleSkillValue ?? ""}
          onValueChange={setSingleSkillValue}
          placeholder="Select skill"
          className="w-full"
          triggerClassName={SHEET_SELECT_TRIGGER_CLASS}
          contentWrapperClassName={SHEET_SELECT_CONTENT_CLASS}
        >
          <SelectContent>
            <SelectItem className={SHEET_SELECT_ITEM_CLASS} value="">
              No skill
            </SelectItem>
            {skills.length === 0 ? (
              <SelectItem className={SHEET_SELECT_ITEM_CLASS} value="__disabled" disabled>
                No skills available
              </SelectItem>
            ) : (
              skills
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((skill) => (
                  <SelectItem key={skill.id} className={SHEET_SELECT_ITEM_CLASS} value={skill.id}>
                    {skill.icon ?? "🎯"} {skill.name}
                  </SelectItem>
                ))
            )}
          </SelectContent>
        </Select>
      </div>
    );
  } else if (target.field === "rhythm" && entry.type === "habit") {
    body = (
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
            Recurrence
          </label>
          <Input
            value={habitRecurrenceValue}
            onChange={(event) => setHabitRecurrenceValue(event.target.value)}
            className="border-white/20 bg-white/[0.08] text-white"
            placeholder="e.g., Daily, Weekly"
          />
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {HABIT_RECURRENCE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setHabitRecurrenceValue(preset)}
                className={cn(
                  "rounded-full border px-2 py-0.5",
                  habitRecurrenceValue.trim().toLowerCase() === preset.toLowerCase()
                    ? "border-white bg-white text-slate-900"
                    : "border-white/20 text-white/70 hover:border-white/40"
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
            Habit type
          </label>
          <Input
            value={habitTypeValue}
            onChange={(event) => setHabitTypeValue(event.target.value)}
            className="border-white/20 bg-white/[0.08] text-white"
            placeholder="e.g., HABIT, CHORE"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
            Duration (minutes)
          </label>
          <Input
            value={habitDurationValue}
            onChange={(event) => setHabitDurationValue(event.target.value)}
            className="border-white/20 bg-white/[0.08] text-white"
            placeholder="15"
            inputMode="numeric"
          />
        </div>
      </div>
    );
  }

  const sheetTitle = `${entry.type === "project" ? "Project" : "Habit"} ${fieldLabel}`;

  return (
    <form className="flex h-full flex-col" onSubmit={handleSubmit}>
      <SheetHeader className="border-b border-white/10 px-6 py-5">
        <SheetTitle className="text-xl font-semibold text-white">{sheetTitle}</SheetTitle>
        <SheetDescription className="text-sm text-white/70">
          Editing {entry.name} — adjust the {fieldLabel.toLowerCase()} below and save to update Nexus.
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-white">
        {body ?? <p className="text-sm text-white/70">This field cannot be edited.</p>}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>
      <SheetFooter className="border-t border-white/10 bg-white/[0.02] px-6 py-4">
        <div className="flex w-full items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </SheetFooter>
    </form>
  );
}
