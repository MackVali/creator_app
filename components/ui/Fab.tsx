"use client";

import * as React from "react";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type HTMLAttributes,
  type RefObject,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useMotionTemplate,
  useDragControls,
  animate,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import { Check, Clock, Filter, Loader2, Plus, Search, X } from "lucide-react";
import FlameEmber, { type FlameEmberProps } from "@/components/FlameEmber";
import { EventModal } from "./EventModal";
import { NoteModal } from "./NoteModal";
import { ComingSoonModal } from "./ComingSoonModal";
import { PostModal } from "./PostModal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useSelectContext,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalsForUser, type Goal } from "@/lib/queries/goals";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getProjectsForUser, type Project } from "@/lib/queries/projects";
import { getMonumentsForUser, type Monument } from "@/lib/queries/monuments";
import { getCatsForUser } from "@/lib/data/cats";
import type { CatRow } from "@/lib/types/cat";
import { useProjectedGlobalRank } from "@/lib/hooks/useProjectedGlobalRank";
import {
  HABIT_RECURRENCE_OPTIONS,
  HABIT_TYPE_OPTIONS,
} from "@/components/habits/habit-form-fields";

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [err, setErr] = React.useState<Error | null>(null);
  if (err) {
    return (
      <div className="mt-2 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-xs">
        <div className="font-semibold">Render error:</div>
        <pre className="whitespace-pre-wrap break-words">
          {String(err?.message || err)}
        </pre>
      </div>
    );
  }
  return (
    <React.Suspense
      fallback={<div className="text-xs opacity-60">Loading…</div>}
    >
      <BoundarySetter onError={setErr}>{children}</BoundarySetter>
    </React.Suspense>
  );
}

function BoundarySetter({
  onError,
  children,
}: {
  onError: (e: Error) => void;
  children: React.ReactNode;
}) {
  try {
    return <>{children}</>;
  } catch (e: any) {
    onError(e);
    return null;
  }
}

function DebugPanel({
  expanded,
  selected,
}: {
  expanded: boolean;
  selected: string | null;
}) {
  return (
    <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/50 px-2 py-1 text-[10px] leading-none">
      <span>expanded:</span> {String(expanded)}{" "}
      <span className="ml-2">selected:</span> {selected ?? "null"}
    </div>
  );
}

interface FabProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  menuVariant?: "default" | "timeline";
  swipeUpToOpen?: boolean;
}

type FabSearchResult = {
  id: string;
  name: string;
  type: "PROJECT" | "HABIT";
  nextScheduledAt: string | null;
  scheduleInstanceId: string | null;
  durationMinutes: number | null;
  nextDueAt: string | null;
  completedAt: string | null;
  isCompleted: boolean;
  global_rank?: number | null;
};

type FabSearchCursor = {
  startUtc: string;
  sourceType: "PROJECT" | "HABIT";
  sourceId: string;
};

const FAB_PAGES = ["primary", "secondary", "nexus"] as const;

// Keeps taps single-action on iOS by acting on pointerup and ignoring the
// synthetic click that follows; real clicks (keyboard/AT) still fire onClick.
function useTapHandler(onTap: () => void, opts?: { disabled?: boolean }) {
  const sawPointerUpRef = React.useRef(false);

  const onPointerUp = React.useCallback(
    (e: React.PointerEvent) => {
      if (opts?.disabled) return;
      // Only primary button
      // (pointerup.button may be 0 or -1 on some mobile UAs; don't over-filter)
      if ((e as any).button != null && (e as any).button !== 0) return;

      // Act immediately on pointerup for mouse & touch
      sawPointerUpRef.current = true;
      onTap();
      // Reset flag soon so keyboard click later still works
      setTimeout(() => {
        sawPointerUpRef.current = false;
      }, 0);
    },
    [onTap, opts?.disabled]
  );

  const onClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (opts?.disabled) return;
      // Ignore synthetic click that follows our pointerup (iOS)
      if (sawPointerUpRef.current) {
        return;
      }
      onTap(); // allow keyboard/AT-triggered clicks
    },
    [onTap, opts?.disabled]
  );

  return { onPointerUp, onClick };
}

function useOverhangLT(
  ref: React.RefObject<HTMLElement>,
  deps: any[] = [],
  opts?: { listenVisualViewport?: boolean; listenScroll?: boolean }
) {
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(
    null
  );

  useLayoutEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();

      const OVERHANG = 12; // vertical overhang only
      const BTN = 48;
      const GAP = 12;
      const GROUP_W = BTN * 2 + GAP;
      const GROUP_H = BTN;
      const SHIFT_LEFT = 0; // keep right edge flush to panel

      const safeBottom =
        Number.parseFloat(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--sat-safe-bottom")
            .trim() || "0"
        ) || 0;

      // Use visualViewport for mobile keyboard compatibility, fallback to window
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;

      // Align group's right edge to panel's right (no horizontal overhang).
      let left = Math.round(rect.right - GROUP_W - SHIFT_LEFT);
      const minLeft = 8;
      const maxLeft = viewportWidth - GROUP_W - 8;
      left = Math.min(Math.max(left, minLeft), maxLeft);

      let top = Math.round(rect.bottom + OVERHANG - GROUP_H);
      const maxTop = viewportHeight - safeBottom - GROUP_H - 8;
      top = Math.min(top, maxTop);
      top = Math.max(top, 8);

      setPos({ left, top });
    };

    update();
    // Listen to visualViewport resize for mobile keyboard compatibility
    const listenVisualViewport = opts?.listenVisualViewport ?? true;
    const listenScroll = opts?.listenScroll ?? true;
    const visualViewport = window.visualViewport;
    if (listenVisualViewport) {
      if (visualViewport) {
        visualViewport.addEventListener("resize", update);
      } else {
        // Fallback for browsers without visualViewport support
        window.addEventListener("resize", update);
      }
    }
    if (listenScroll) {
      window.addEventListener("scroll", update, { passive: true });
    }
    return () => {
      if (listenVisualViewport) {
        if (visualViewport) {
          visualViewport.removeEventListener("resize", update);
        } else {
          window.removeEventListener("resize", update);
        }
      }
      if (listenScroll) {
        window.removeEventListener("scroll", update);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return pos;
}

export function Fab({
  className = "",
  menuVariant = "default",
  swipeUpToOpen = false,
  ...wrapperProps
}: FabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<
    "GOAL" | "PROJECT" | "TASK" | "HABIT" | null
  >(null);
  const PROJECT_STAGE_OPTIONS_LOCAL = [
    { value: "RESEARCH", label: "RESEARCH" },
    { value: "TEST", label: "TEST" },
    { value: "BUILD", label: "BUILD" },
    { value: "REFINE", label: "REFINE" },
    { value: "RELEASE", label: "RELEASE" },
  ];
  const PRIORITY_OPTIONS_LOCAL = [
    { value: "NO", label: "NO" },
    { value: "LOW", label: "LOW" },
    { value: "MEDIUM", label: "MEDIUM" },
    { value: "HIGH", label: "HIGH" },
    { value: "CRITICAL", label: "CRITICAL" },
    { value: "ULTRA-CRITICAL", label: "ULTRA-CRITICAL" },
  ];
  const PRIORITY_ICON_MAP: Record<string, string | null> = {
    NO: null,
    LOW: null,
    MEDIUM: "!",
    HIGH: "!!",
    CRITICAL: "!!!",
    "ULTRA-CRITICAL": "⚠️",
  };
  const ENERGY_OPTIONS_LOCAL = [
    { value: "NO", label: "No" },
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "ULTRA", label: "Ultra" },
    { value: "EXTREME", label: "Extreme" },
  ];
  const TASK_STAGE_OPTIONS_LOCAL = [
    { value: "RESEARCH", label: "Research" },
    { value: "PLAN", label: "Plan" },
    { value: "PRODUCE", label: "Produce" },
    { value: "QA", label: "QA" },
    { value: "SHIP", label: "Ship" },
  ];
  const [projectName, setProjectName] = useState("");
  const [projectStage, setProjectStage] = useState<string>("RESEARCH");
  const [projectDuration, setProjectDuration] = useState<number | "">("");
  const [projectPriority, setProjectPriority] = useState<string>("MEDIUM");
  const [projectEnergy, setProjectEnergy] = useState<string>("MEDIUM");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [monumentEmojiMap, setMonumentEmojiMap] = useState<
    Map<string, string | null>
  >(new Map());
  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "goal-link-pulse-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes goalLinkPulse {
        0%, 100% { opacity: 0.8; }
        50% { opacity: 0.72; }
      }
    `;
    document.head.appendChild(style);
  }, []);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalFilterSkillId, setGoalFilterSkillId] = useState("");
  const [goalFilterMonumentId, setGoalFilterMonumentId] = useState("");
  const [goalFilterEnergy, setGoalFilterEnergy] = useState("");
  const [goalFilterPriority, setGoalFilterPriority] = useState("");
  const [goalSort, setGoalSort] = useState<"recent" | "oldest" | "weight">(
    "recent"
  );
  const [goalSearch, setGoalSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [skillFilterMonumentId, setSkillFilterMonumentId] = useState("");
  const [showSkillFilters, setShowSkillFilters] = useState(false);
  const [taskProjectSearch, setTaskProjectSearch] = useState("");
  const [taskProjectFilterStage, setTaskProjectFilterStage] = useState("");
  const [taskProjectFilterPriority, setTaskProjectFilterPriority] =
    useState("");
  const [showTaskProjectFilters, setShowTaskProjectFilters] = useState(false);
  const [taskProjects, setTaskProjects] = useState<Project[]>([]);
  const [taskProjectsLoading, setTaskProjectsLoading] = useState(false);
  const filteredGoals = useMemo(() => {
    const query = goalSearch.trim().toLowerCase();
    let list = goals;
    if (query) {
      list = list.filter((goal) =>
        (goal.name ?? "").toLowerCase().includes(query)
      );
    }
    if (goalFilterEnergy) {
      list = list.filter(
        (goal) =>
          (goal.energy_code ?? goal.energy ?? "").toLowerCase() ===
          goalFilterEnergy.toLowerCase()
      );
    }
    if (goalFilterPriority) {
      list = list.filter(
        (goal) =>
          (goal.priority ?? "").toLowerCase() ===
          goalFilterPriority.toLowerCase()
      );
    }
    if (goalFilterMonumentId) {
      list = list.filter(
        (goal) => (goal.monument_id ?? "") === goalFilterMonumentId
      );
    }
    if (goalFilterSkillId) {
      const skillName =
        skills.find((s) => s.id === goalFilterSkillId)?.name?.toLowerCase() ??
        "";
      list = list.filter((goal) => {
        const goalAny = goal as any;
        const skillIds: string[] | undefined = goalAny.skills;
        const matchesId = Array.isArray(skillIds)
          ? skillIds.includes(goalFilterSkillId)
          : false;
        const matchesName =
          skillName.length > 0 &&
          (goal.name ?? "").toLowerCase().includes(skillName);
        return matchesId || matchesName;
      });
    }
    const sorter =
      goalSort === "recent"
        ? (a: Goal, b: Goal) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : goalSort === "oldest"
        ? (a: Goal, b: Goal) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : (a: Goal, b: Goal) => (b.weight ?? 0) - (a.weight ?? 0);
    return [...list].sort(sorter);
  }, [
    goalFilterEnergy,
    goalFilterMonumentId,
    goalFilterPriority,
    goalFilterSkillId,
    goalSearch,
    goalSort,
    goals,
    skills,
  ]);
  const filteredSkills = useMemo(() => {
    const term = skillSearch.trim().toLowerCase();
    let list = skills;
    if (term) {
      list = list.filter((skill) =>
        (skill.name ?? "").toLowerCase().includes(term)
      );
    }
    if (skillFilterMonumentId) {
      list = list.filter(
        (skill) => (skill.monument_id ?? "") === skillFilterMonumentId
      );
    }
    const categoryOrder = new Map(
      skillCategories.map((cat, index) => [cat.id, index])
    );
    const getCategoryIndex = (catId?: string | null) =>
      catId && categoryOrder.has(catId)
        ? categoryOrder.get(catId) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => {
      const catA = getCategoryIndex(a.cat_id ?? null);
      const catB = getCategoryIndex(b.cat_id ?? null);
      if (catA !== catB) return catA - catB;
      const nameA = (a.name ?? "").toLowerCase();
      const nameB = (b.name ?? "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [skillCategories, skillFilterMonumentId, skillSearch, skills]);
  const filteredTaskProjects = useMemo(() => {
    let list = taskProjects;
    if (taskProjectFilterStage) {
      const stage = taskProjectFilterStage.toLowerCase();
      list = list.filter(
        (project) => (project.stage ?? "").toLowerCase() === stage
      );
    }
    if (taskProjectFilterPriority) {
      const priority = taskProjectFilterPriority.toLowerCase();
      list = list.filter(
        (project) => (project.priority ?? "").toLowerCase() === priority
      );
    }
    const term = taskProjectSearch.trim().toLowerCase();
    if (!term) return list;
    return list.filter((project) =>
      (project.name ?? "").toLowerCase().includes(term)
    );
  }, [
    taskProjectFilterPriority,
    taskProjectFilterStage,
    taskProjectSearch,
    taskProjects,
  ]);
  const resetSkillLookupState = useCallback(() => {
    setSkillSearch("");
    setSkillFilterMonumentId("");
    setShowSkillFilters(false);
  }, []);
  const handleSkillDropdownOpenChange = useCallback(
    (open: boolean) => {
      if (!open) return;
      if (skillSearch || skillFilterMonumentId || filteredSkills.length === 0) {
        resetSkillLookupState();
      }
    },
    [
      filteredSkills.length,
      resetSkillLookupState,
      skillFilterMonumentId,
      skillSearch,
    ]
  );
  useEffect(() => {
    resetSkillLookupState();
  }, [resetSkillLookupState, selected]);
  useEffect(() => {
    if (selected !== "TASK") {
      setTaskProjectSearch("");
      setTaskProjectFilterStage("");
      setTaskProjectFilterPriority("");
      setShowTaskProjectFilters(false);
    }
  }, [selected]);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const durationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [durationPosition, setDurationPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [showHabitDurationPicker, setShowHabitDurationPicker] = useState(false);
  const habitDurationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [habitDurationPosition, setHabitDurationPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const normalizedProjectDuration =
    typeof projectDuration === "number" && Number.isFinite(projectDuration)
      ? projectDuration
      : 0;
  const updateDurationPosition = useCallback(() => {
    if (!showDurationPicker) return;
    const trigger = durationTriggerRef.current;
    if (
      !trigger ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 150;
    const margin = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow =
      spaceBelow > estimatedHeight + margin || rect.top < estimatedHeight;
    const top = placeBelow
      ? rect.bottom + margin + window.scrollY
      : Math.max(margin, rect.top - estimatedHeight) + window.scrollY;
    const width = rect.width;
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) left = margin;
    setDurationPosition({ top, left: left + window.scrollX, width });
  }, [showDurationPicker]);
  useEffect(() => {
    if (!showDurationPicker) return;
    updateDurationPosition();
    const handle = () => updateDurationPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [showDurationPicker, updateDurationPosition]);
  const toggleDurationPicker = () => {
    setShowDurationPicker((prev) => {
      const next = !prev;
      if (
        next &&
        (projectDuration === "" || !Number.isFinite(projectDuration))
      ) {
        setProjectDuration(30);
      }
      // Defer position calculation to allow layout to settle.
      requestAnimationFrame(() => updateDurationPosition());
      return next;
    });
  };

  const adjustProjectDuration = (delta: number) => {
    const next = Math.max(0, normalizedProjectDuration + delta);
    setProjectDuration(next);
  };

  const updateHabitDurationPosition = useCallback(() => {
    if (!showHabitDurationPicker) return;
    const trigger = habitDurationTriggerRef.current;
    if (
      !trigger ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 150;
    const margin = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow =
      spaceBelow > estimatedHeight + margin || rect.top < estimatedHeight;
    const top = placeBelow
      ? rect.bottom + margin + window.scrollY
      : Math.max(margin, rect.top - estimatedHeight) + window.scrollY;
    const width = rect.width;
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) left = margin;
    setHabitDurationPosition({ top, left: left + window.scrollX, width });
  }, [showHabitDurationPicker]);

  useEffect(() => {
    if (!showHabitDurationPicker) return;
    updateHabitDurationPosition();
    const handle = () => updateHabitDurationPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [showHabitDurationPicker, updateHabitDurationPosition]);

  const toggleHabitDurationPicker = () => {
    setShowHabitDurationPicker((prev) => {
      const next = !prev;
      if (
        next &&
        (!habitDuration || !Number.isFinite(Number.parseInt(habitDuration, 10)))
      ) {
        setHabitDuration("15");
      }
      // Defer position calculation to allow layout to settle.
      requestAnimationFrame(() => updateHabitDurationPosition());
      return next;
    });
  };

  const adjustHabitDuration = (delta: number) => {
    const current = Number.parseInt(habitDuration || "15", 10);
    const next = Math.max(1, current + delta);
    setHabitDuration(next.toString());
  };

  const projectDurationTapHandlers = useTapHandler(() =>
    toggleDurationPicker()
  );
  const habitDurationTapHandlers = useTapHandler(() =>
    toggleHabitDurationPicker()
  );
  const projectDurationMinusTapHandlers = useTapHandler(() =>
    adjustProjectDuration(-5)
  );
  const projectDurationPlusTapHandlers = useTapHandler(() =>
    adjustProjectDuration(5)
  );
  const habitDurationMinusTapHandlers = useTapHandler(() =>
    adjustHabitDuration(-5)
  );
  const habitDurationPlusTapHandlers = useTapHandler(() =>
    adjustHabitDuration(5)
  );
  const [projectSkillIds, setProjectSkillIds] = useState<string[]>([]);
  const [projectGoalId, setProjectGoalId] = useState<string | null>(null);
  const [showGoalFilters, setShowGoalFilters] = useState(false);
  const projectedRankState = useProjectedGlobalRank({
    goalId: projectGoalId,
    priority: projectPriority,
    stage: projectStage,
  });
  const [projectWhy, setProjectWhy] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalMonumentId, setGoalMonumentId] = useState<string | "">("");
  const [goalPriority, setGoalPriority] = useState("MEDIUM");
  const [goalEnergy, setGoalEnergy] = useState("MEDIUM");
  const [goalWhy, setGoalWhy] = useState("");
  const [goalDue, setGoalDue] = useState<string | null>(null);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [monumentsLoading, setMonumentsLoading] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskStage, setTaskStage] = useState("PRODUCE");
  const [taskDuration, setTaskDuration] = useState<string>("");
  const [taskPriority, setTaskPriority] = useState("MEDIUM");
  const [taskEnergy, setTaskEnergy] = useState("MEDIUM");
  const [taskProjectId, setTaskProjectId] = useState<string | "">("");
  const [taskSkillId, setTaskSkillId] = useState<string | "">("");
  const [taskNotes, setTaskNotes] = useState("");
  const [habitName, setHabitName] = useState("");
  const [habitType, setHabitType] = useState(HABIT_TYPE_OPTIONS[0].value);
  const [habitRecurrence, setHabitRecurrence] = useState(
    HABIT_RECURRENCE_OPTIONS.find((option) => option.value === "weekly")
      ?.value ?? HABIT_RECURRENCE_OPTIONS[0].value
  );
  const [habitDuration, setHabitDuration] = useState<string>("15");
  const [habitEnergy, setHabitEnergy] = useState("LOW");
  const [habitGoalId, setHabitGoalId] = useState<string | "">("");
  const [habitSkillId, setHabitSkillId] = useState<string | "">("");
  const [habitWhy, setHabitWhy] = useState("");
  const [habitRoutineId, setHabitRoutineId] = useState<string | "">("");
  const [habitRoutines, setHabitRoutines] = useState<
    { id: string; name: string; description?: string | null }[]
  >([]);
  const [habitRoutinesLoading, setHabitRoutinesLoading] = useState(false);
  const findSkillById = useCallback(
    (id: string | null | undefined) =>
      id ? skills.find((s) => s.id === id) ?? null : null,
    [skills]
  );

  function SkillTrigger({
    selectedId,
    onClearSelection,
  }: {
    selectedId: string | null;
    onClearSelection?: () => void;
  }) {
    const { isOpen, setIsOpen } = useSelectContext();
    const selectedSkill = findSkillById(selectedId);
    const backspaceTapRef = React.useRef<{ count: number; last: number }>({
      count: 0,
      last: 0,
    });
    const handlePointerDown = (event: React.PointerEvent<HTMLInputElement>) => {
      if (!isOpen) {
        event.preventDefault();
        setIsOpen?.(true);
      }
    };
    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      setIsOpen?.(true);
      if (event.key !== "Backspace") {
        backspaceTapRef.current = { count: 0, last: 0 };
        return;
      }
      const now = Date.now();
      const { last, count } = backspaceTapRef.current;
      const isRapidBackspace = now - last < 600;
      const nextCount = isRapidBackspace ? count + 1 : 1;
      backspaceTapRef.current = { count: nextCount, last: now };
      if (skillSearch.length > 0 && nextCount >= 2) {
        event.preventDefault();
        setSkillSearch("");
        backspaceTapRef.current = { count: 0, last: now };
        return;
      }
      if (
        event.key === "Backspace" &&
        skillSearch.trim().length === 0 &&
        selectedId
      ) {
        onClearSelection?.();
        setSkillSearch("");
      }
    };
    return (
      <div className="flex h-12 md:h-14 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition focus-within:border-blue-400/60">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-lg">
          {selectedSkill?.icon ?? "🎯"}
        </span>
        <Input
          value={skillSearch}
          readOnly={false}
          onPointerDown={handlePointerDown}
          onFocus={() => setIsOpen?.(true)}
          onChange={(e) => setSkillSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedSkill?.name ?? "Search skills…"}
          className="h-full flex-1 border-none bg-transparent p-0 text-base font-semibold text-white placeholder:text-white/60 focus-visible:ring-0"
        />
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            setShowSkillFilters((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setShowSkillFilters((v) => !v);
            }
          }}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
            showSkillFilters && "text-white"
          )}
          aria-label="Filter skills"
        >
          <Filter className="h-4 w-4" />
        </div>
      </div>
    );
  }
  const [modalEventType, setModalEventType] = useState<
    "GOAL" | "PROJECT" | "TASK" | "HABIT" | null
  >(null);
  const [showNote, setShowNote] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const pages = FAB_PAGES;
  const pageCount = FAB_PAGES.length;
  const [activeFabPage, setActiveFabPage] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTargetPage, setDragTargetPage] = useState<number | null>(null);
  const [dragDirection, setDragDirection] = useState<1 | -1 | null>(null);
  const [, setIsAnimatingPageChange] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FabSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchCursor, setSearchCursor] = useState<FabSearchCursor | null>(
    null
  );
  const [rescheduleTarget, setRescheduleTarget] =
    useState<FabSearchResult | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingFab, setIsSavingFab] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const goalFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const skillFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const taskProjectFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const pageX = useMotionValue(0);
  const pageDragControls = useDragControls();
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const VERTICAL_WHEEL_TRIGGER = 20;
  const DRAG_THRESHOLD_PX = 80;
  const EDGE_SWIPE_ZONE_RATIO = 0.12;
  const nexusInputRef = useRef<HTMLInputElement | null>(null);
  const overhangPos = useOverhangLT(panelRef, [expanded, selected], {
    listenVisualViewport: !expanded,
  });
  const [stableViewportHeight, setStableViewportHeight] = useState<number | null>(
    null
  );
  const [stableSafeBottom, setStableSafeBottom] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [keyboardLift, setKeyboardLift] = useState(0);

  useEffect(() => {
    if (!expanded) return;
    const measureOnce = () => {
      if (typeof window === "undefined") return;
      const height = Math.max(
        window.innerHeight,
        window.visualViewport?.height ?? 0
      );
      setStableViewportHeight((prev) => (prev ?? height));
      setViewportHeight((prev) => prev ?? (window.visualViewport?.height ?? window.innerHeight));
      const safeBottom =
        Number.parseFloat(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--sat-safe-bottom")
            .trim() || "0"
        ) || 0;
      setStableSafeBottom((prev) => (prev || safeBottom));
    };
    const handleResize = () => {
      if (typeof window === "undefined") return;
      const nextHeight = window.innerHeight;
      setStableViewportHeight((prev) => {
        if (prev === null) return nextHeight;
        // Ignore shrinkage (likely keyboard); allow growth (rotation/fullscreen).
        if (nextHeight > prev * 0.98) return nextHeight;
        return prev;
      });
    };
    measureOnce();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", measureOnce);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", measureOnce);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) {
      setKeyboardLift(0);
      return;
    }
    const updateLift = () => {
      if (typeof window === "undefined") return;
      const viewport = window.visualViewport;
      if (!viewport) {
        setKeyboardLift(0);
        return;
      }
      const viewportH = viewport.height ?? window.innerHeight;
      if (viewportH) {
        setViewportHeight(viewportH);
      }
      const heightLoss = Math.max(0, window.innerHeight - viewport.height);
      const offsetTop = viewport.offsetTop ?? 0;
      const lift = Math.max(0, heightLoss - offsetTop - stableSafeBottom);
      setKeyboardLift(lift);
    };
    updateLift();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updateLift);
    viewport?.addEventListener("scroll", updateLift);
    window.addEventListener("orientationchange", updateLift);
    return () => {
      viewport?.removeEventListener("resize", updateLift);
      viewport?.removeEventListener("scroll", updateLift);
      window.removeEventListener("orientationchange", updateLift);
    };
  }, [expanded, stableSafeBottom]);

  useEffect(() => {
    if (!expanded) {
      setGoalSearch("");
      setGoalFilterEnergy("");
      setGoalFilterMonumentId("");
      setGoalFilterPriority("");
      setGoalFilterSkillId("");
      setGoalSort("recent");
      setShowGoalFilters(false);
      setSkillSearch("");
      setSkillFilterMonumentId("");
      setShowSkillFilters(false);
    }
  }, [expanded]);

  useEffect(() => {
    if (!showGoalFilters) return;
    const handleClick = (event: MouseEvent) => {
      if (
        goalFilterMenuRef.current &&
        !goalFilterMenuRef.current.contains(event.target as Node)
      ) {
        setShowGoalFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showGoalFilters]);

  useEffect(() => {
    if (!showSkillFilters) return;
    const handleClick = (event: MouseEvent) => {
      if (
        skillFilterMenuRef.current &&
        !skillFilterMenuRef.current.contains(event.target as Node)
      ) {
        setShowSkillFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSkillFilters]);
  useEffect(() => {
    if (!showTaskProjectFilters) return;
    const handleClick = (event: MouseEvent) => {
      if (
        taskProjectFilterMenuRef.current &&
        !taskProjectFilterMenuRef.current.contains(event.target as Node)
      ) {
        setShowTaskProjectFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTaskProjectFilters]);

  const formatDateInput = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;

  const formatTimeInput = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes()
    ).padStart(2, "0")}`;

  const fetchNextScheduledInstance = useCallback(
    async (sourceId: string, sourceType: "PROJECT" | "HABIT") => {
      const params = new URLSearchParams({ sourceId, sourceType });
      const response = await fetch(
        `/api/schedule/instances/next?${params.toString()}`
      );
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json().catch(() => null)) as {
        instanceId: string | null;
        startUtc: string | null;
        durationMinutes?: number | null;
      } | null;
      return payload ?? null;
    },
    []
  );

  const buildSearchUrl = useCallback(
    (cursor: FabSearchCursor | null) => {
      const trimmed = searchQuery.trim();
      const params = new URLSearchParams();
      if (trimmed.length > 0) {
        params.set("q", trimmed);
      }
      if (cursor) {
        params.set("cursorStartUtc", cursor.startUtc);
        params.set("cursorSourceType", cursor.sourceType);
        params.set("cursorSourceId", cursor.sourceId);
      }
      return params.toString().length > 0
        ? `/api/schedule/search?${params.toString()}`
        : "/api/schedule/search";
    },
    [searchQuery]
  );

  const runSearch = useCallback(
    async ({
      cursor,
      append,
      signal,
    }: {
      cursor: FabSearchCursor | null;
      append: boolean;
      signal?: AbortSignal;
    }) => {
      const response = await fetch(buildSearchUrl(cursor), { signal });
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        results?: FabSearchResult[];
        nextCursor?: {
          startUtc?: string | null;
          sourceType?: "PROJECT" | "HABIT" | null;
          sourceId?: string | null;
        } | null;
      };
      const nextCursor =
        payload.nextCursor?.startUtc &&
        payload.nextCursor?.sourceType &&
        payload.nextCursor?.sourceId
          ? {
              startUtc: payload.nextCursor.startUtc,
              sourceType: payload.nextCursor.sourceType,
              sourceId: payload.nextCursor.sourceId,
            }
          : null;
      if (!signal?.aborted) {
        setSearchResults((prev) =>
          append ? [...prev, ...(payload.results ?? [])] : payload.results ?? []
        );
        setSearchCursor(nextCursor);
      }
    },
    [buildSearchUrl]
  );

  const notifySchedulerOfChange = useCallback(async () => {
    try {
      const timeZone =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
          : null;
      const payload = {
        localNow: new Date().toISOString(),
        timeZone,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        mode: { type: "REGULAR" },
        writeThroughDays: 1,
      };
      await fetch("/api/scheduler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Failed to notify scheduler", error);
    }
  }, []);

  const resetSearchState = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchCursor(null);
    setSearchError(null);
    setIsSearching(false);
    setIsLoadingMore(false);
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
  }, []);

  type MenuPalette = {
    base: [number, number, number];
    highlight: [number, number, number];
    lowlight: [number, number, number];
  };

  const MENU_PALETTES: readonly MenuPalette[] = [
    {
      base: [55, 65, 81],
      highlight: [90, 110, 135],
      lowlight: [25, 30, 40],
    },
    {
      base: [8, 17, 28],
      highlight: [50, 80, 120],
      lowlight: [2, 4, 10],
    },
    {
      base: [10, 12, 24],
      highlight: [86, 60, 140],
      lowlight: [4, 6, 18],
    },
  ];

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

  const getMenuPalette = (pageIndex: number): MenuPalette =>
    MENU_PALETTES[pageIndex];

  const lerp = (start: number, end: number, t: number) =>
    start + (end - start) * t;

  const createPaletteBackground = (palette: MenuPalette) => {
    const [r, g, b] = palette.base;
    const [hr, hg, hb] = palette.highlight;
    const [lr, lg, lb] = palette.lowlight;
    return `radial-gradient(circle at top, rgba(${hr}, ${hg}, ${hb}, 0.65), rgba(${r}, ${g}, ${b}, 0.15) 45%), linear-gradient(160deg, rgba(${hr}, ${hg}, ${hb}, 0.95) 0%, rgba(${r}, ${g}, ${b}, 0.97) 50%, rgba(${lr}, ${lg}, ${lb}, 0.98) 100%)`;
  };

  const createPaletteBorderColor = (palette: MenuPalette) =>
    `rgba(${palette.highlight[0]}, ${palette.highlight[1]}, ${palette.highlight[2]}, 0.35)`;

  const MENU_BOX_SHADOW =
    "0 18px 36px rgba(15, 23, 42, 0.55), 0 8px 18px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)";

  const menuConfigs = {
    default: {
      primary: [
        {
          label: "GOAL",
          eventType: "GOAL" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "PROJECT",
          eventType: "PROJECT" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "TASK",
          eventType: "TASK" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "HABIT",
          eventType: "HABIT" as const,
          color: "hover:bg-gray-600",
        },
      ],
      secondary: [
        { label: "SERVICE" },
        { label: "PRODUCT" },
        { label: "POST" },
        { label: "NOTE" },
      ],
      menuClassName: "left-1/2 -translate-x-1/2",
      itemAlignmentClass: "text-left",
    },
    timeline: {
      primary: [
        {
          label: "GOAL",
          eventType: "GOAL" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "PROJECT",
          eventType: "PROJECT" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "TASK",
          eventType: "TASK" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "HABIT",
          eventType: "HABIT" as const,
          color: "hover:bg-gray-600",
        },
      ],
      secondary: [
        { label: "NOTE" },
        { label: "POST" },
        { label: "SERVICE" },
        { label: "PRODUCT" },
      ],
      menuClassName: "right-0 origin-bottom-right text-left",
      itemAlignmentClass: "text-left",
    },
  } as const;

  const { primary, secondary, menuClassName, itemAlignmentClass } =
    menuConfigs[menuVariant];
  const menuContainerHeight = primary.length * 56;

  const menuVariants = {
    closed: {
      opacity: 0,
      clipPath: "inset(100% 0% 0% 0%)",
      transition: { type: "tween", ease: "easeInOut", duration: 0.2 },
    },
    open: {
      opacity: 1,
      clipPath: "inset(0% 0% 0% 0%)",
      transition: {
        type: "tween",
        ease: "easeOut",
        duration: 0.25,
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  } as const;

  const itemVariants = {
    closed: {
      opacity: 0,
      y: 10,
      transition: { type: "tween", ease: "easeIn", duration: 0.15 },
    },
    open: {
      opacity: 1,
      y: 0,
      transition: { type: "tween", ease: "easeOut", duration: 0.15 },
    },
  } as const;

  const pageVariants = {
    closed: {},
    open: {},
  } as const;

  const normalizedStageWidth = Math.max(stageWidth, 1);
  const dragProgress = useTransform(pageX, (latest) => {
    const width = normalizedStageWidth;
    const ratio = Math.abs(latest) / (width || 1);
    return clamp01(ratio);
  });
  const incomingFromRight = useTransform(pageX, (latest) => {
    const width = normalizedStageWidth;
    const clamped = Math.max(-width, Math.min(0, latest));
    return width + clamped;
  });
  const incomingFromLeft = useTransform(pageX, (latest) => {
    const width = normalizedStageWidth;
    const clamped = Math.max(0, Math.min(width, latest));
    return -width + clamped;
  });

  const renderPrimaryPage = () => (
    <div className={cn("flex w-full flex-col", expanded ? "p-0" : "px-4 py-2")}>
      {!expanded &&
        primary.map((event) => (
          <motion.button
            key={event.label}
            variants={itemVariants}
            onClick={() => handleEventClick(event.eventType)}
            className={cn(
              "w-full px-6 py-3 text-white font-medium transition-colors duration-200 border-b border-gray-700 last:border-b-0 whitespace-nowrap",
              itemAlignmentClass,
              event.color
            )}
          >
            <span className="text-sm opacity-80">add</span>{" "}
            <span className="text-lg font-bold">{event.label}</span>
          </motion.button>
        ))}
      <AnimatePresence>
        {expanded ? (
          <motion.div
            key="fab-expanded-placeholder"
            className="relative mt-0 bg-black/80"
            aria-label="Expanded placeholder"
          >
            <div
              className="relative grid gap-4 p-4 pb-4 md:p-8 md:pb-6"
              style={{
                paddingBottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${keyboardLift}px)`,
                scrollPaddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardLift + 16}px)`,
              }}
            >
              {selected === "GOAL" && (
                <>
                  <div className="grid gap-2">
                    <Select
                      value={goalMonumentId ?? ""}
                      onValueChange={setGoalMonumentId}
                      hideChevron
                      triggerClassName={cn(
                        "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                        goalMonumentId
                          ? "text-white/80 hover:text-blue-200"
                          : "text-red-400/80 drop-shadow-[0_0_4px_rgba(248,113,113,0.15)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]"
                      )}
                      trigger={
                        <span>
                          {goalMonumentId
                            ? monuments.find((m) => m.id === goalMonumentId)
                                ?.title ?? "Link to existing MONUMENT +"
                            : "Link to existing MONUMENT +"}
                        </span>
                      }
                    >
                      <SelectContent className="min-w-[220px]">
                        <SelectItem value="">No monument</SelectItem>
                        {monumentsLoading ? (
                          <SelectItem value="__loading" disabled>
                            Loading monuments…
                          </SelectItem>
                        ) : monuments.length > 0 ? (
                          monuments.map((monument) => (
                            <SelectItem key={monument.id} value={monument.id}>
                              <div className="flex items-center gap-2">
                                <span className="text-lg">
                                  {monument.emoji ?? "🏛️"}
                                </span>
                                <span>{monument.title}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__empty" disabled>
                            No monuments yet
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 gap-4 md:grid-cols-[3fr_1fr]">
                    <div className="grid gap-2 col-span-3">
                      <Label htmlFor="goal-name" className="sr-only">
                        Goal name
                      </Label>
                      <Input
                        id="goal-name"
                        value={goalName}
                        onChange={(e) => setGoalName(e.target.value)}
                        placeholder="Name your GOAL"
                        className="h-12 md:h-14 rounded-md !border-white/10 bg-white/[0.05] text-lg md:text-xl font-extrabold leading-tight placeholder:font-extrabold focus:!border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                    <div className="grid gap-2 col-span-1">
                      <Label className="sr-only">Energy</Label>
                      <Select
                        value={goalEnergy}
                        onValueChange={setGoalEnergy}
                        triggerClassName="!h-12 md:!h-14 !items-center !justify-center rounded-md border-white/15 bg-white/[0.06] !overflow-visible"
                        hideChevron
                        trigger={
                          <div className="flex h-full w-full items-center justify-center leading-none">
                            {goalEnergy ? (
                              <FlameEmber
                                level={goalEnergy as FlameEmberProps["level"]}
                                size="md"
                                className="-translate-y-[3px]"
                              />
                            ) : (
                              <span className="text-zinc-400">Energy</span>
                            )}
                          </div>
                        }
                      >
                        <SelectContent>
                          {ENERGY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              <div className="flex items-center justify-center py-2">
                                <FlameEmber
                                  level={o.value as FlameEmberProps["level"]}
                                  size="md"
                                />
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        PRIORITY
                      </Label>
                      <Select
                        value={goalPriority}
                        onValueChange={setGoalPriority}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        contentWrapperClassName="min-w-[240px] sm:min-w-[280px]"
                        placeholder="Priority"
                      >
                        <SelectContent>
                          {PRIORITY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        DUE
                      </Label>
                      <input
                        id="goal-due"
                        type="datetime-local"
                        className="h-12 md:h-14 w-full rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 focus:!border-blue-400/60 focus-visible:ring-0"
                        value={goalDue ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setGoalDue(value === "" ? null : value);
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="goal-why" className="text-zinc-500">
                      WHY (optional)
                    </Label>
                    <Textarea
                      id="goal-why"
                      value={goalWhy}
                      onChange={(e) => setGoalWhy(e.target.value)}
                      placeholder="Motivation…"
                      className="border border-white/10 bg-white/[0.05] focus:border-blue-400/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                    />
                  </div>
                </>
              )}

              {selected === "PROJECT" && (
                <>
                  <div className="grid grid-cols-[2fr_1fr] gap-4">
                    <div className="grid gap-2">
                      <Label className="sr-only">Goal</Label>
                      <Select
                        value={projectGoalId ?? ""}
                        onValueChange={(v) => setProjectGoalId(v)}
                        hideChevron
                        triggerClassName={cn(
                          "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                          projectGoalId
                            ? "text-white/80 hover:text-blue-200"
                            : "text-red-400/80 drop-shadow-[0_0_4px_rgba(248,113,113,0.15)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]"
                        )}
                        trigger={
                          <span>
                            {projectGoalId
                              ? goals.find((g) => g.id === projectGoalId)
                                  ?.name ?? "Link to existing GOAL +"
                              : "Link to existing GOAL +"}
                          </span>
                        }
                      >
                        <SelectContent className="relative min-w-[220px]">
                          <div className="sticky top-0 z-10 bg-black/80 p-2 backdrop-blur border-b border-white/5">
                            <div className="relative flex items-center gap-2">
                              <Input
                                value={goalSearch}
                                onChange={(e) => setGoalSearch(e.target.value)}
                                placeholder="Search goals…"
                                className="h-9 text-sm border-white/10 bg-white/[0.05] text-white placeholder:text-white/60 focus:border-blue-400/60 focus-visible:ring-0"
                              />
                              <button
                                type="button"
                                onClick={() => setShowGoalFilters((v) => !v)}
                                className={cn(
                                  "flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white",
                                  showGoalFilters &&
                                    "border-blue-400/60 text-white"
                                )}
                                aria-label="Filter goals"
                              >
                                <Filter className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {showGoalFilters ? (
                            <div
                              ref={goalFilterMenuRef}
                              className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                            >
                              <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                                <span className="text-sm font-semibold">
                                  Filter & Sort Goals
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowGoalFilters(false)}
                                  className="text-xs text-white/80 underline-offset-4 hover:underline"
                                >
                                  Close
                                </button>
                              </div>
                              <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-3">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                      Filter
                                    </div>
                                    <div className="space-y-2">
                                      <select
                                        value={goalFilterSkillId}
                                        onChange={(e) =>
                                          setGoalFilterSkillId(e.target.value)
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {goalFilterSkillId
                                            ? "Skill (clear)"
                                            : "Skill (any)"}
                                        </option>
                                        {skills.map((skill) => (
                                          <option
                                            key={skill.id}
                                            value={skill.id}
                                          >
                                            {skill.name}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={goalFilterMonumentId}
                                        onChange={(e) =>
                                          setGoalFilterMonumentId(
                                            e.target.value
                                          )
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {goalFilterMonumentId
                                            ? "Monument (clear)"
                                            : "Monument (any)"}
                                        </option>
                                        {monuments.map((m) => (
                                          <option key={m.id} value={m.id}>
                                            {(m.emoji ?? "✨") +
                                              " " +
                                              (m.title ?? "Monument")}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={goalFilterEnergy}
                                        onChange={(e) =>
                                          setGoalFilterEnergy(e.target.value)
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {goalFilterEnergy
                                            ? "Energy (clear)"
                                            : "Energy (any)"}
                                        </option>
                                        {ENERGY_OPTIONS_LOCAL.map((o) => (
                                          <option key={o.value} value={o.value}>
                                            {o.label}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={goalFilterPriority}
                                        onChange={(e) =>
                                          setGoalFilterPriority(e.target.value)
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {goalFilterPriority
                                            ? "Priority (clear)"
                                            : "Priority (any)"}
                                        </option>
                                        {PRIORITY_OPTIONS_LOCAL.map((o) => (
                                          <option key={o.value} value={o.value}>
                                            {o.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                      Sort
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setGoalSort("recent")}
                                        className={cn(
                                          "w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30",
                                          goalSort === "recent" &&
                                            "border-blue-400/60 bg-blue-500/10 text-white"
                                        )}
                                      >
                                        Recently updated
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setGoalSort("oldest")}
                                        className={cn(
                                          "w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30",
                                          goalSort === "oldest" &&
                                            "border-blue-400/60 bg-blue-500/10 text-white"
                                        )}
                                      >
                                        Oldest updated
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setGoalSort("weight")}
                                        className={cn(
                                          "w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30",
                                          goalSort === "weight" &&
                                            "border-blue-400/60 bg-blue-500/10 text-white"
                                        )}
                                      >
                                        Highest weight
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {goalsLoading ? (
                            <SelectItem value="" disabled>
                              Loading goals…
                            </SelectItem>
                          ) : goals.length > 0 ? (
                            filteredGoals.length > 0 ? (
                              filteredGoals.map((goal) => (
                                <SelectItem key={goal.id} value={goal.id}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">
                                      {goal.emoji ??
                                        goal.monumentEmoji ??
                                        monumentEmojiMap.get(
                                          (goal as any).monument_id ??
                                            (goal as any).monumentId ??
                                            ""
                                        ) ??
                                        "✨"}
                                    </span>
                                    <span>{goal.name}</span>
                                  </div>
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="" disabled>
                                No goals match your search
                              </SelectItem>
                            )
                          ) : (
                            <SelectItem value="" disabled>
                              No goals yet
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-start justify-end text-right">
                      {projectedRankState.status === "incomplete" ? (
                        <p className="text-sm font-semibold tracking-wide text-zinc-500">
                          ∞
                        </p>
                      ) : projectedRankState.status === "loading" ? (
                        <div className="flex items-center gap-2 text-[10px] text-white/70">
                          <Loader2 className="h-3 w-3 animate-spin text-white/70" />
                          <span>Calculating…</span>
                        </div>
                      ) : projectedRankState.status === "error" ? (
                        <p className="text-[10px] text-red-300">
                          Couldn&apos;t calculate rank:{" "}
                          {projectedRankState.message}
                        </p>
                      ) : (
                        <p className="text-sm font-semibold tracking-wide text-zinc-500">
                          #{projectedRankState.data.rank}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 md:grid-cols-[3fr_1fr]">
                    <div className="grid gap-2 col-span-3">
                      <Label htmlFor="project-name" className="sr-only">
                        Project name
                      </Label>
                      <Input
                        id="project-name"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="Name your PROJECT"
                        className="h-12 md:h-14 rounded-md !border-white/10 bg-white/[0.05] text-lg md:text-xl font-extrabold leading-tight placeholder:font-extrabold focus:!border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                    <div className="grid gap-2 col-span-1">
                      <Label className="sr-only">Energy</Label>
                      <Select
                        value={projectEnergy}
                        onValueChange={setProjectEnergy}
                        triggerClassName="!h-12 md:!h-14 !items-center !justify-center rounded-md border-white/15 bg-white/[0.06] !overflow-visible"
                        hideChevron
                        trigger={
                          <div className="flex h-full w-full items-center justify-center leading-none">
                            {projectEnergy ? (
                              <FlameEmber
                                level={
                                  projectEnergy as FlameEmberProps["level"]
                                }
                                size="md"
                                className="-translate-y-[3px]"
                              />
                            ) : (
                              <span className="text-zinc-400">Energy</span>
                            )}
                          </div>
                        }
                      >
                        <SelectContent>
                          {ENERGY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              <div className="flex items-center justify-center py-2">
                                <FlameEmber
                                  level={o.value as FlameEmberProps["level"]}
                                  size="md"
                                />
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.6fr_1.2fr_1fr] gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        PRIORITY
                      </Label>
                      <Select
                        value={projectPriority}
                        onValueChange={setProjectPriority}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        contentWrapperClassName="min-w-[240px] sm:min-w-[280px]"
                        placeholder="Priority"
                      >
                        <SelectContent>
                          {PRIORITY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem
                              key={o.value}
                              value={o.value}
                              label={o.label}
                            >
                              <div className="flex w-full items-center justify-between gap-3">
                                <span>{o.label}</span>
                                <span className="w-10 text-right text-red-400">
                                  {PRIORITY_ICON_MAP[o.value] ?? ""}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        STAGE
                      </Label>
                      <Select
                        value={projectStage}
                        onValueChange={setProjectStage}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        placeholder="Stage"
                      >
                        <SelectContent>
                          {PROJECT_STAGE_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 items-end">
                      <div className="relative">
                        <button
                          type="button"
                          {...projectDurationTapHandlers}
                          ref={durationTriggerRef}
                          className="flex h-12 md:h-14 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20 touch-manipulation"
                          aria-haspopup="dialog"
                          aria-expanded={showDurationPicker}
                          aria-controls="project-duration-picker"
                        >
                          <span className="flex h-12 w-12 flex-col items-center justify-center rounded-md bg-white/[0.08]">
                            <Clock className="h-6 w-6 text-white/80" />
                            <span className="mt-1 text-[10px] font-semibold leading-none text-white/80">
                              {normalizedProjectDuration || 30}m
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {showDurationPicker && durationPosition
                    ? createPortal(
                        <div
                          data-fab-overlay
                          id="project-duration-picker"
                          className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                          style={{
                            position: "absolute",
                            top: durationPosition.top,
                            left: durationPosition.left,
                            width: durationPosition.width,
                            touchAction: "manipulation",
                          }}
                          onTouchStart={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              {...projectDurationMinusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              -
                            </button>
                            <div className="text-lg font-semibold text-white">
                              {normalizedProjectDuration || 30} min
                            </div>
                            <button
                              type="button"
                              {...projectDurationPlusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              +
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-white/60">
                            Adjust in 5-minute steps. Default starts at 30.
                          </p>
                        </div>,
                        document.body
                      )
                    : null}
                  {showHabitDurationPicker && habitDurationPosition
                    ? createPortal(
                        <div
                          data-fab-overlay
                          id="habit-duration-picker"
                          className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                          style={{
                            position: "absolute",
                            top: habitDurationPosition.top,
                            left: habitDurationPosition.left,
                            width: habitDurationPosition.width,
                            touchAction: "manipulation",
                          }}
                          onTouchStart={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              {...habitDurationMinusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              -
                            </button>
                            <div className="text-lg font-semibold text-white">
                              {habitDuration || 15} min
                            </div>
                            <button
                              type="button"
                              {...habitDurationPlusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              +
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-white/60">
                            Adjust in 5-minute steps. Default starts at 15.
                          </p>
                        </div>,
                        document.body
                      )
                    : null}
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                      SKILL
                    </Label>
                    <Select
                      value={projectSkillIds[0] ?? ""}
                      onOpenChange={handleSkillDropdownOpenChange}
                      onValueChange={(value) => {
                        setProjectSkillIds(value ? [value] : []);
                        const skill = findSkillById(value);
                        setSkillSearch(skill?.name ?? "");
                        setShowSkillFilters(false);
                      }}
                      placeholder="Link a skill"
                      triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                      contentWrapperClassName="w-full max-h-[150px] overflow-y-auto overscroll-contain"
                      maxHeight={150}
                      openOnTriggerFocus
                      trigger={
                        <SkillTrigger
                          selectedId={projectSkillIds[0] ?? null}
                          onClearSelection={() => {
                            setProjectSkillIds([]);
                            setSkillSearch("");
                          }}
                        />
                      }
                    >
                      <SelectContent className="relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain">
                        {showSkillFilters ? (
                          <div
                            ref={skillFilterMenuRef}
                            className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                              <span className="text-sm font-semibold">
                                Filter Skills
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowSkillFilters(false)}
                                className="text-xs text-white/80 underline-offset-4 hover:underline"
                              >
                                Close
                              </button>
                            </div>
                            <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Filter
                                  </div>
                                  <div className="space-y-2">
                                    <select
                                      value={skillFilterMonumentId}
                                      onChange={(e) =>
                                        setSkillFilterMonumentId(e.target.value)
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {skillFilterMonumentId
                                          ? "Monument (clear)"
                                          : "Monument (any)"}
                                      </option>
                                      {monuments.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {(m.emoji ?? "✨") +
                                            " " +
                                            (m.title ?? "Monument")}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Quick actions
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSkillSearch("")}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Reset search
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSkillFilterMonumentId("")
                                      }
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {skillsLoading ? (
                          <SelectItem value="__loading" disabled>
                            Loading skills…
                          </SelectItem>
                        ) : filteredSkills.length > 0 ? (
                          filteredSkills.map((skill) => (
                            <SelectItem key={skill.id} value={skill.id}>
                              <div className="flex items-center gap-2">
                                <span className="text-lg">
                                  {skill.icon ?? "🎯"}
                                </span>
                                <span>{skill.name}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__empty" disabled>
                            No skills found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="project-why" className="text-zinc-500">
                      WHY (optional)
                    </Label>
                    <Textarea
                      id="project-why"
                      value={projectWhy}
                      onChange={(e) => setProjectWhy(e.target.value)}
                      placeholder="Add context…"
                      className="border border-white/10 bg-white/[0.05] focus:border-blue-400/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                    />
                  </div>
                </>
              )}

              {selected === "TASK" && (
                <>
                  <div className="grid gap-2">
                    <Select
                      value={taskProjectId ?? ""}
                      onValueChange={setTaskProjectId}
                      onOpenChange={(open) => {
                        if (!open) {
                          setShowTaskProjectFilters(false);
                        }
                      }}
                      hideChevron
                      triggerClassName={cn(
                        "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                        taskProjectId
                          ? "text-white/80 hover:text-blue-200"
                          : "text-red-400/80 drop-shadow-[0_0_4px_rgba(248,113,113,0.15)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]"
                      )}
                      trigger={
                        <span>
                          {taskProjectId
                            ? taskProjects.find((p) => p.id === taskProjectId)
                                ?.name ?? "Link to existing PROJECT +"
                            : "Link to existing PROJECT +"}
                        </span>
                      }
                    >
                      <SelectContent className="relative min-w-[220px]">
                        <div className="sticky top-0 z-10 bg-black/80 p-2 backdrop-blur border-b border-white/5">
                          <div className="relative flex items-center gap-2">
                            <Input
                              value={taskProjectSearch}
                              onChange={(e) =>
                                setTaskProjectSearch(e.target.value)
                              }
                              placeholder="Search projects…"
                              className="h-9 text-sm border-white/10 bg-white/[0.05] text-white placeholder:text-white/60 focus:border-blue-400/60 focus-visible:ring-0"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowTaskProjectFilters((v) => !v)
                              }
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white",
                                showTaskProjectFilters &&
                                  "border-blue-400/60 text-white"
                              )}
                              aria-label="Filter projects"
                            >
                              <Filter className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {showTaskProjectFilters ? (
                          <div
                            ref={taskProjectFilterMenuRef}
                            className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                              <span className="text-sm font-semibold">
                                Filter Projects
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowTaskProjectFilters(false)}
                                className="text-xs text-white/80 underline-offset-4 hover:underline"
                              >
                                Close
                              </button>
                            </div>
                            <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Filter
                                  </div>
                                  <div className="space-y-2">
                                    <select
                                      value={taskProjectFilterStage}
                                      onChange={(e) =>
                                        setTaskProjectFilterStage(
                                          e.target.value
                                        )
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {taskProjectFilterStage
                                          ? "Stage (clear)"
                                          : "Stage (any)"}
                                      </option>
                                      {PROJECT_STAGE_OPTIONS_LOCAL.map(
                                        (stage) => (
                                          <option
                                            key={stage.value}
                                            value={stage.value}
                                          >
                                            {stage.label}
                                          </option>
                                        )
                                      )}
                                    </select>
                                    <select
                                      value={taskProjectFilterPriority}
                                      onChange={(e) =>
                                        setTaskProjectFilterPriority(
                                          e.target.value
                                        )
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {taskProjectFilterPriority
                                          ? "Priority (clear)"
                                          : "Priority (any)"}
                                      </option>
                                      {PRIORITY_OPTIONS_LOCAL.map((p) => (
                                        <option key={p.value} value={p.value}>
                                          {p.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Quick actions
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setTaskProjectSearch("")}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Reset search
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTaskProjectFilterStage("");
                                        setTaskProjectFilterPriority("");
                                      }}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {taskProjectsLoading ? (
                          <SelectItem value="__loading" disabled>
                            Loading projects…
                          </SelectItem>
                        ) : filteredTaskProjects.length > 0 ? (
                          filteredTaskProjects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__empty" disabled>
                            {taskProjectSearch.trim().length > 0
                              ? "No projects found"
                              : "No projects yet"}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 gap-4 md:grid-cols-[3fr_1fr]">
                    <div className="grid gap-2 col-span-3">
                      <Label htmlFor="task-name" className="sr-only">
                        Task name
                      </Label>
                      <Input
                        id="task-name"
                        value={taskName}
                        onChange={(e) => setTaskName(e.target.value)}
                        placeholder="Name your TASK"
                        className="h-12 md:h-14 rounded-md !border-white/10 bg-white/[0.05] text-lg md:text-xl font-extrabold leading-tight placeholder:font-extrabold focus:!border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                    <div className="grid gap-2 col-span-1">
                      <Label className="sr-only">Energy</Label>
                      <Select
                        value={taskEnergy}
                        onValueChange={setTaskEnergy}
                        triggerClassName="!h-12 md:!h-14 !items-center !justify-center rounded-md border-white/15 bg-white/[0.06] !overflow-visible"
                        hideChevron
                        trigger={
                          <div className="flex h-full w-full items-center justify-center leading-none">
                            {taskEnergy ? (
                              <FlameEmber
                                level={taskEnergy as FlameEmberProps["level"]}
                                size="md"
                                className="-translate-y-[3px]"
                              />
                            ) : (
                              <span className="text-zinc-400">Energy</span>
                            )}
                          </div>
                        }
                      >
                        <SelectContent>
                          {ENERGY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              <div className="flex items-center justify-center py-2">
                                <FlameEmber
                                  level={o.value as FlameEmberProps["level"]}
                                  size="md"
                                />
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.6fr_1.2fr_1fr] gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        PRIORITY
                      </Label>
                      <Select
                        value={taskPriority}
                        onValueChange={setTaskPriority}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        contentWrapperClassName="min-w-[240px] sm:min-w-[280px]"
                        placeholder="Priority"
                      >
                        <SelectContent>
                          {PRIORITY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        STAGE
                      </Label>
                      <Select
                        value={taskStage}
                        onValueChange={setTaskStage}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        placeholder="Stage"
                      >
                        <SelectContent>
                          {TASK_STAGE_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        DURATION
                      </Label>
                      <button
                        type="button"
                        className="flex h-12 md:h-14 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20"
                      >
                        <span className="flex h-12 w-12 flex-col items-center justify-center rounded-md bg-white/[0.08]">
                          <Clock className="h-6 w-6 text-white/80" />
                          <span className="mt-1 text-[10px] font-semibold leading-none text-white/80">
                            {taskDuration || 30}m
                          </span>
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>Skill</Label>
                      <Select
                        value={taskSkillId ?? ""}
                        onOpenChange={handleSkillDropdownOpenChange}
                        onValueChange={(value) => {
                          setTaskSkillId(value);
                          const skill = findSkillById(value);
                          setSkillSearch(skill?.name ?? "");
                          setShowSkillFilters(false);
                        }}
                        placeholder="Link a skill"
                        triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                        contentWrapperClassName="w-full max-h-[150px] overflow-y-auto overscroll-contain"
                        maxHeight={150}
                        openOnTriggerFocus
                        trigger={
                          <SkillTrigger
                            selectedId={taskSkillId ?? null}
                            onClearSelection={() => {
                              setTaskSkillId("");
                              setSkillSearch("");
                            }}
                          />
                        }
                      >
                        <SelectContent className="relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain">
                          {showSkillFilters ? (
                            <div
                              ref={skillFilterMenuRef}
                              className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                            >
                              <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                                <span className="text-sm font-semibold">
                                  Filter Skills
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowSkillFilters(false)}
                                  className="text-xs text-white/80 underline-offset-4 hover:underline"
                                >
                                  Close
                                </button>
                              </div>
                              <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-3">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                      Filter
                                    </div>
                                    <div className="space-y-2">
                                      <select
                                        value={skillFilterMonumentId}
                                        onChange={(e) =>
                                          setSkillFilterMonumentId(
                                            e.target.value
                                          )
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {skillFilterMonumentId
                                            ? "Monument (clear)"
                                            : "Monument (any)"}
                                        </option>
                                        {monuments.map((m) => (
                                          <option key={m.id} value={m.id}>
                                            {(m.emoji ?? "✨") +
                                              " " +
                                              (m.title ?? "Monument")}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                      Quick actions
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setSkillSearch("")}
                                        className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                      >
                                        Reset search
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSkillFilterMonumentId("")
                                        }
                                        className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                      >
                                        Clear filters
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {skillsLoading ? (
                            <SelectItem value="__loading" disabled>
                              Loading skills…
                            </SelectItem>
                          ) : filteredSkills.length > 0 ? (
                            filteredSkills.map((skill) => (
                              <SelectItem key={skill.id} value={skill.id}>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">
                                    {skill.icon ?? "🎯"}
                                  </span>
                                  <span>{skill.name}</span>
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="__empty" disabled>
                              No skills found
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor="task-notes">Notes (optional)</Label>
                      <Textarea
                        id="task-notes"
                        value={taskNotes}
                        onChange={(e) => setTaskNotes(e.target.value)}
                        placeholder="Context…"
                        className="border border-white/10 bg-white/[0.05] focus:border-blue-400/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {selected === "HABIT" && (
                <>
                  <div className="grid gap-2">
                    <Select
                      value={habitRoutineId ?? ""}
                      onValueChange={(value) => {
                        if (value === "__create__") {
                          router.push("/habits/new");
                          return;
                        }
                        setHabitRoutineId(value);
                      }}
                      hideChevron
                      triggerClassName={cn(
                        "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                        habitRoutineId
                          ? "text-white/80 hover:text-blue-200"
                          : "text-zinc-600/90 drop-shadow-[0_0_4px_rgba(39,39,42,0.32)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]"
                      )}
                      trigger={
                        <span>
                          {habitRoutineId
                            ? habitRoutines.find((r) => r.id === habitRoutineId)
                                ?.name ?? "Link to existing ROUTINE +"
                            : "Link to existing ROUTINE +"}
                        </span>
                      }
                    >
                      <SelectContent className="min-w-[220px]">
                        <SelectItem value="__create__">
                          <div className="flex items-center gap-2 text-white">
                            <Plus className="h-4 w-4" />
                            <span>Create new routine</span>
                          </div>
                        </SelectItem>
                        {habitRoutinesLoading ? (
                          <SelectItem value="__loading" disabled>
                            Loading routines…
                          </SelectItem>
                        ) : habitRoutines.length > 0 ? (
                          habitRoutines.map((routine) => (
                            <SelectItem key={routine.id} value={routine.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {routine.name}
                                </span>
                                {routine.description ? (
                                  <span className="text-xs text-white/60">
                                    {routine.description}
                                  </span>
                                ) : null}
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__empty" disabled>
                            No routines yet
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 gap-4 md:grid-cols-[3fr_1fr]">
                    <div className="grid gap-2 col-span-3">
                      <Label htmlFor="habit-name" className="sr-only">
                        Habit name
                      </Label>
                      <Input
                        id="habit-name"
                        value={habitName}
                        onChange={(e) => setHabitName(e.target.value)}
                        placeholder="Name your HABIT"
                        className="h-12 md:h-14 rounded-md !border-white/10 bg-white/[0.05] text-lg md:text-xl font-extrabold leading-tight placeholder:font-extrabold focus:!border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                    <div className="grid gap-2 col-span-1">
                      <Label className="sr-only">Energy</Label>
                      <Select
                        value={habitEnergy}
                        onValueChange={setHabitEnergy}
                        triggerClassName="!h-12 md:!h-14 !items-center !justify-center rounded-md border-white/15 bg-white/[0.06] !overflow-visible"
                        hideChevron
                        trigger={
                          <div className="flex h-full w-full items-center justify-center leading-none">
                            {habitEnergy ? (
                              <FlameEmber
                                level={habitEnergy as FlameEmberProps["level"]}
                                size="md"
                                className="-translate-y-[3px]"
                              />
                            ) : (
                              <span className="text-zinc-400">Energy</span>
                            )}
                          </div>
                        }
                      >
                        <SelectContent>
                          {ENERGY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              <div className="flex items-center justify-center py-2">
                                <FlameEmber
                                  level={o.value as FlameEmberProps["level"]}
                                  size="md"
                                />
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.6fr_1.2fr_1fr] gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        TYPE
                      </Label>
                      <Select
                        value={habitType}
                        onValueChange={setHabitType}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        placeholder="Type"
                      >
                        <SelectContent>
                          {HABIT_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        RECURRENCE
                      </Label>
                      <Select
                        value={habitRecurrence}
                        onValueChange={setHabitRecurrence}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        placeholder="Recurrence"
                      >
                        <SelectContent>
                          {HABIT_RECURRENCE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 items-end">
                      <div className="relative">
                        <button
                          type="button"
                          {...habitDurationTapHandlers}
                          ref={habitDurationTriggerRef}
                          className="flex h-12 md:h-14 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20 touch-manipulation"
                          aria-haspopup="dialog"
                          aria-expanded={showHabitDurationPicker}
                          aria-controls="habit-duration-picker"
                        >
                          <span className="flex h-12 w-12 flex-col items-center justify-center rounded-md bg-white/[0.08]">
                            <Clock className="h-6 w-6 text-white/80" />
                            <span className="mt-1 text-[10px] font-semibold leading-none text-white/80">
                              {Number.parseInt(habitDuration || "15", 10)}m
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                      SKILL
                    </Label>
                    <Select
                      value={habitSkillId ?? ""}
                      onOpenChange={handleSkillDropdownOpenChange}
                      onValueChange={(value) => {
                        setHabitSkillId(value);
                        const skill = findSkillById(value);
                        setSkillSearch(skill?.name ?? "");
                        setShowSkillFilters(false);
                      }}
                      placeholder="Link a skill"
                      triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                      contentWrapperClassName="w-full max-h-[150px] overflow-y-auto overscroll-contain"
                      maxHeight={150}
                      openOnTriggerFocus
                      trigger={
                        <SkillTrigger
                          selectedId={habitSkillId ?? null}
                          onClearSelection={() => {
                            setHabitSkillId("");
                            setSkillSearch("");
                          }}
                        />
                      }
                    >
                      <SelectContent className="relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain">
                        {showSkillFilters ? (
                          <div
                            ref={skillFilterMenuRef}
                            className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                              <span className="text-sm font-semibold">
                                Filter Skills
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowSkillFilters(false)}
                                className="text-xs text-white/80 underline-offset-4 hover:underline"
                              >
                                Close
                              </button>
                            </div>
                            <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Filter
                                  </div>
                                  <div className="space-y-2">
                                    <select
                                      value={skillFilterMonumentId}
                                      onChange={(e) =>
                                        setSkillFilterMonumentId(e.target.value)
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {skillFilterMonumentId
                                          ? "Monument (clear)"
                                          : "Monument (any)"}
                                      </option>
                                      {monuments.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {(m.emoji ?? "✨") +
                                            " " +
                                            (m.title ?? "Monument")}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Quick actions
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSkillSearch("")}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Reset search
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSkillFilterMonumentId("")
                                      }
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {skillsLoading ? (
                          <SelectItem value="__loading" disabled>
                            Loading skills…
                          </SelectItem>
                        ) : filteredSkills.length > 0 ? (
                          filteredSkills.map((skill) => (
                            <SelectItem key={skill.id} value={skill.id}>
                              <div className="flex items-center gap-2">
                                <span className="text-lg">
                                  {skill.icon ?? "🎯"}
                                </span>
                                <span>{skill.name}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__empty" disabled>
                            No skills found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {showHabitDurationPicker && habitDurationPosition
                    ? createPortal(
                        <div
                          id="habit-duration-picker"
                          className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                          style={{
                            position: "absolute",
                            top: habitDurationPosition.top,
                            left: habitDurationPosition.left,
                            width: habitDurationPosition.width,
                            touchAction: "manipulation",
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              {...habitDurationMinusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              -
                            </button>
                            <div className="text-lg font-semibold text-white">
                              {habitDuration || 15} min
                            </div>
                            <button
                              type="button"
                              {...habitDurationPlusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              +
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-white/60">
                            Adjust in 5-minute steps. Default starts at 15.
                          </p>
                        </div>,
                        document.body
                      )
                    : null}
                </>
              )}
            </div>

            {saveError ? (
              <p className="text-xs text-red-300">{saveError}</p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const renderSecondaryPage = () => (
    <div className="flex w-full flex-col px-4 py-2">
      {secondary.map((event) => (
        <motion.button
          key={event.label}
          variants={itemVariants}
          onClick={() => handleExtraClick(event.label)}
          className={cn(
            "w-full px-6 py-3 text-white font-medium transition-colors duration-200 border-b border-gray-700 last:border-b-0 hover:bg-gray-800 whitespace-nowrap",
            itemAlignmentClass
          )}
        >
          <span className="text-sm opacity-80">add</span>{" "}
          <span className="text-lg font-bold">{event.label}</span>
        </motion.button>
      ))}
    </div>
  );

  const renderNexusPage = () => (
    <FabNexus
      query={searchQuery}
      onQueryChange={setSearchQuery}
      results={searchResults}
      isSearching={isSearching}
      isLoadingMore={isLoadingMore}
      error={searchError}
      hasMore={Boolean(searchCursor)}
      onLoadMore={handleLoadMoreResults}
      onSelectResult={handleOpenReschedule}
      inputRef={nexusInputRef}
    />
  );

  const renderPage = (pageIndex: number) => {
    const page = pages[pageIndex];
    if (page === "primary") {
      return renderPrimaryPage();
    }
    if (page === "secondary") {
      return renderSecondaryPage();
    }
    return renderNexusPage();
  };

  const handleEventClick = (
    eventType: "GOAL" | "PROJECT" | "TASK" | "HABIT"
  ) => {
    // Ensure any in-progress drag state cannot leave the neighbor overlay visible.
    setIsDragging(false);
    setDragTargetPage(null);
    setDragDirection(null);
    pageX.set(0);

    if (expanded) {
      setSelected(eventType);
      return;
    }
    setExpanded(true);
    setSelected(eventType);
  };

  const handleExtraClick = (label: string) => {
    setIsOpen(false);
    if (label === "NOTE") {
      setShowNote(true);
    } else if (label === "POST") {
      setShowPost(true);
    } else if (label === "SERVICE" || label === "PRODUCT") {
      router.push(`/source?create=${label.toLowerCase()}`);
    } else {
      setComingSoon(label);
    }
  };

  const toggleMenu = () => {
    setIsOpen((prev) => !prev);
  };

  const handleFabButtonClick = () => {
    toggleMenu();
  };

  const interpretWheelGesture = (deltaY: number) => {
    if (deltaY < -VERTICAL_WHEEL_TRIGGER) {
      setIsOpen(true);
      return true;
    }
    return false;
  };

  const handleFabButtonTouchStart = (
    event: React.TouchEvent<HTMLButtonElement>
  ) => {
    if (!swipeUpToOpen) return;
    setTouchStartY(event.touches[0].clientY);
  };

  const handleFabButtonTouchEnd = (
    event: React.TouchEvent<HTMLButtonElement>
  ) => {
    if (!swipeUpToOpen || touchStartY === null) return;
    const diffY = event.changedTouches[0].clientY - touchStartY;
    setTouchStartY(null);
    if (diffY < -40 && !isOpen) {
      setIsOpen(true);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  };

  const handleFabButtonTouchCancel = () => {
    if (!swipeUpToOpen) return;
    setTouchStartY(null);
  };

  const handleFabButtonWheel = (event: React.WheelEvent<HTMLButtonElement>) => {
    if (!swipeUpToOpen) return;
    if (interpretWheelGesture(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleOpenReschedule = (result: FabSearchResult) => {
    if (result.type === "PROJECT" && result.isCompleted) {
      return;
    }
    setRescheduleTarget(result);
    setDeleteError(null);
    setRescheduleError(
      result.scheduleInstanceId
        ? null
        : "This event has no upcoming scheduled time."
    );
    const baseDate = result.nextScheduledAt
      ? new Date(result.nextScheduledAt)
      : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      const now = new Date();
      setRescheduleDate(formatDateInput(now));
      setRescheduleTime(formatTimeInput(now));
      return;
    }
    setRescheduleDate(formatDateInput(baseDate));
    setRescheduleTime(formatTimeInput(baseDate));
  };

  const handleMenuWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!swipeUpToOpen) return;
    if (interpretWheelGesture(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleExpandedPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!expanded) return;

      // Skip on touch/pencil to avoid iOS Safari suppressing the subsequent click.
      const pt = (event as any).pointerType as string | undefined;
      if (pt && pt !== "mouse") return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Only help text inputs on desktop; never programmatically focus buttons.
      const tag = target.tagName;
      const isTextInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable;

      if (isTextInput) {
        target.focus({ preventScroll: true });
      }
    },
    [expanded]
  );

  useEffect(() => {
    if (selected !== "PROJECT") return;
    let cancelled = false;
    const loadGoals = async () => {
      try {
        setGoalsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const [goalsData, monumentsResp] = await Promise.all([
          getGoalsForUser(user.id),
          supabase
            .from("monuments")
            .select("id, emoji")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
        ]);
        if (!cancelled) {
          const map = new Map<string, string | null>();
          monumentsResp.data?.forEach((m) => {
            if (m.id) {
              map.set(m.id, m.emoji ?? null);
            }
          });
          setMonumentEmojiMap(map);
          setGoals(
            goalsData.map((goal) => ({
              ...goal,
              monumentEmoji:
                goal.monumentEmoji ??
                map.get(
                  (goal as any).monument_id ?? (goal as any).monumentId ?? ""
                ) ??
                null,
            }))
          );
        }
      } catch (error) {
        console.error("Failed to load goals", error);
        if (!cancelled) {
          setGoals([]);
          setMonumentEmojiMap(new Map());
        }
      } finally {
        if (!cancelled) {
          setGoalsLoading(false);
        }
      }
    };
    void loadGoals();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (selected !== "GOAL") return;
    let cancelled = false;
    const loadMonuments = async () => {
      try {
        setMonumentsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          setMonumentsLoading(false);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setMonumentsLoading(false);
          return;
        }
        const monumentsData = await getMonumentsForUser(user.id);
        if (!cancelled) {
          setMonuments(monumentsData);
          setGoalMonumentId((current) =>
            current && monumentsData.some((m) => m.id === current)
              ? current
              : ""
          );
        }
      } catch (error) {
        console.error("Failed to load monuments", error);
        if (!cancelled) {
          setMonuments([]);
        }
      } finally {
        if (!cancelled) {
          setMonumentsLoading(false);
        }
      }
    };
    void loadMonuments();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (selected !== "TASK") return;
    let cancelled = false;
    const loadProjects = async () => {
      try {
        setTaskProjectsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          setTaskProjectsLoading(false);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setTaskProjectsLoading(false);
          return;
        }
        const projectsData = await getProjectsForUser(user.id);
        if (!cancelled) {
          setTaskProjects(projectsData ?? []);
          setTaskProjectId((current) =>
            current && projectsData.some((p) => p.id === current) ? current : ""
          );
        }
      } catch (error) {
        console.error("Failed to load projects for tasks", error);
        if (!cancelled) {
          setTaskProjects([]);
        }
      } finally {
        if (!cancelled) {
          setTaskProjectsLoading(false);
        }
      }
    };
    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (selected !== "HABIT" && selected !== "PROJECT" && selected !== "TASK")
      return;
    let cancelled = false;
    const loadSkills = async () => {
      try {
        setSkillsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setSkillCategories([]);
          }
          return;
        }
        const [skillsData, categoriesData] = await Promise.all([
          getSkillsForUser(user.id),
          getCatsForUser(user.id, supabase).catch((err) => {
            console.error("Failed to load skill categories", err);
            return [] as CatRow[];
          }),
        ]);
        if (!cancelled) {
          setSkills(skillsData);
          setSkillCategories(categoriesData);
        }
      } catch (error) {
        console.error("Failed to load skills", error);
        if (!cancelled) {
          setSkills([]);
          setSkillCategories([]);
        }
      } finally {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      }
    };
    void loadSkills();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (selected !== "HABIT") return;
    let cancelled = false;
    const loadRoutines = async () => {
      try {
        setHabitRoutinesLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          setHabitRoutinesLoading(false);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setHabitRoutinesLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("habit_routines")
          .select("id, name, description")
          .eq("user_id", user.id)
          .order("name", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const routines = data ?? [];
        setHabitRoutines(routines);
        setHabitRoutineId((current) =>
          current && routines.some((r) => r.id === current) ? current : ""
        );
      } catch (error) {
        console.error("Failed to load habit routines", error);
        if (!cancelled) {
          setHabitRoutines([]);
        }
      } finally {
        if (!cancelled) {
          setHabitRoutinesLoading(false);
        }
      }
    };
    void loadRoutines();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const getNextIndex = useCallback(
    (index: number) => (index + 1) % pageCount,
    [pageCount]
  );

  const getPrevIndex = useCallback(
    (index: number) => (index - 1 + pageCount) % pageCount,
    [pageCount]
  );

  const animateToPage = useCallback(
    async (
      targetPage: number,
      options?: { fromDrag?: boolean; direction?: 1 | -1 }
    ) => {
      if (targetPage === activeFabPage) {
        pageX.set(0);
        setDragTargetPage(null);
        setDragDirection(null);
        setIsAnimatingPageChange(false);
        return;
      }
      const width = stageWidth > 0 ? stageWidth : 280;
      const resolvedDirection =
        options?.direction ??
        (targetPage === getNextIndex(activeFabPage) ? 1 : -1);
      if (dragTargetPage === null) {
        setDragTargetPage(targetPage);
      }
      setIsAnimatingPageChange(true);
      if (!options?.fromDrag) {
        pageX.set(0);
      }
      if (prefersReducedMotion) {
        setActiveFabPage(targetPage);
        pageX.set(0);
        setDragTargetPage(null);
        setDragDirection(null);
        setIsAnimatingPageChange(false);
        return;
      }
      const controls = animate(
        pageX,
        resolvedDirection === 1 ? -width : width,
        {
          duration: 0.25,
          ease: "easeOut",
        }
      );
      try {
        await controls.finished;
      } catch {
        // Ignore interruptions
      }
      setActiveFabPage(targetPage);
      pageX.set(0);
      setDragTargetPage(null);
      setDragDirection(null);
      setIsAnimatingPageChange(false);
    },
    [
      activeFabPage,
      dragTargetPage,
      getNextIndex,
      pageX,
      prefersReducedMotion,
      stageWidth,
    ]
  );

  const handlePageDragStart = useCallback(() => {
    if (!isOpen || stageWidth <= 0) {
      return;
    }
    setIsDragging(true);
    setDragDirection(null);
    setIsAnimatingPageChange(false);
  }, [isOpen, stageWidth]);

  const isPointerInEdgeZone = useCallback((clientX: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return true;
    }
    const edgeZone = rect.width * EDGE_SWIPE_ZONE_RATIO;
    const offsetX = clientX - rect.left;
    return offsetX <= edgeZone || offsetX >= rect.width - edgeZone;
  }, []);

  const handlePagePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isOpen) return;
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      const isNexusPageActive = pages[activeFabPage] === "nexus";
      if (isNexusPageActive && !isPointerInEdgeZone(event.clientX)) {
        return;
      }
      pageDragControls.start(event);
    },
    [activeFabPage, isOpen, isPointerInEdgeZone, pageDragControls, pages]
  );

  const handlePageDrag = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!isDragging) {
        return;
      }
      const limit = stageWidth > 0 ? stageWidth : DRAG_THRESHOLD_PX;
      const nextX = Math.max(-limit, Math.min(limit, info.offset.x));
      pageX.set(nextX);
      let nextTarget: number | null = null;
      let nextDirection: 1 | -1 | null = null;
      if (nextX < 0) {
        nextTarget = getNextIndex(activeFabPage);
        nextDirection = 1;
      } else if (nextX > 0) {
        nextTarget = getPrevIndex(activeFabPage);
        nextDirection = -1;
      }
      if (nextTarget !== dragTargetPage) {
        setDragTargetPage(nextTarget);
      }
      if (nextDirection !== null && nextDirection !== dragDirection) {
        setDragDirection(nextDirection);
      } else if (nextDirection === null && dragDirection !== null) {
        setDragDirection(null);
      }
    },
    [
      activeFabPage,
      dragDirection,
      dragTargetPage,
      getNextIndex,
      getPrevIndex,
      isDragging,
      pageX,
      stageWidth,
    ]
  );

  const handlePageDragEnd = useCallback(
    async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!isDragging) {
        setDragTargetPage(null);
        setDragDirection(null);
        return;
      }
      setIsDragging(false);
      const target = dragTargetPage;
      const width = stageWidth > 0 ? stageWidth : 0;
      const threshold = width > 0 ? width * 0.33 : 120;
      const distance = Math.abs(pageX.get());
      const shouldCommit =
        target !== null &&
        (distance > threshold || Math.abs(info.velocity.x) > 600);
      if (shouldCommit && target !== null) {
        const direction = dragDirection ?? (pageX.get() < 0 ? 1 : -1);
        await animateToPage(target, { fromDrag: true, direction });
        return;
      }
      setIsAnimatingPageChange(true);
      try {
        await animate(pageX, 0, {
          duration: 0.2,
          ease: "easeOut",
        }).finished;
      } catch {
        // Ignore interruptions
      }
      pageX.set(0);
      setDragTargetPage(null);
      setDragDirection(null);
      setIsAnimatingPageChange(false);
    },
    [
      animateToPage,
      dragDirection,
      dragTargetPage,
      isDragging,
      pageX,
      stageWidth,
    ]
  );

  const handleCloseReschedule = () => {
    if (isSavingReschedule || isDeletingEvent) return;
    setRescheduleTarget(null);
    setRescheduleError(null);
    setDeleteError(null);
  };

  useEffect(() => {
    if (!isOpen) {
      setActiveFabPage(0);
      setDragTargetPage(null);
      setDragDirection(null);
      setIsDragging(false);
      setIsAnimatingPageChange(false);
      if (
        typeof document !== "undefined" &&
        document.activeElement === nexusInputRef.current
      ) {
        nexusInputRef.current?.blur();
      }
      pageX.set(0);
      resetSearchState();
      setRescheduleTarget(null);
      setDeleteError(null);
      setIsDeletingEvent(false);
      searchAbortRef.current?.abort();
    }
  }, [isOpen, pageX, resetSearchState]);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const node = menuRef.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0) {
        setMenuWidth(rect.width);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, primary.length, secondary.length]);

  useEffect(() => {
    if (!isOpen) {
      setStageWidth(0);
      return;
    }
    const node = stageRef.current;
    if (!node) {
      return;
    }
    const updateWidth = () => setStageWidth(node.clientWidth || 0);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => {
        window.removeEventListener("resize", updateWidth);
      };
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || pages[activeFabPage] !== "nexus") {
      return;
    }
    if (typeof window === "undefined") return;

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setIsLoadingMore(false);
    setSearchError(null);
    setSearchResults([]);
    setSearchCursor(null);

    const timer = window.setTimeout(async () => {
      try {
        await runSearch({
          cursor: null,
          append: false,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("FAB menu search failed", error);
        setSearchError("Unable to load results");
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setIsSearching(false);
    };
  }, [activeFabPage, isOpen, runSearch, searchQuery]);

  const handleLoadMoreResults = useCallback(async () => {
    if (!searchCursor || isSearching || isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    setSearchError(null);
    try {
      await runSearch({ cursor: searchCursor, append: true });
    } catch (error) {
      console.error("FAB menu search pagination failed", error);
      if (searchResults.length === 0) {
        setSearchError("Unable to load results");
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    isLoadingMore,
    isSearching,
    runSearch,
    searchCursor,
    searchResults.length,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (pages[activeFabPage] === "nexus") {
      const frame = requestAnimationFrame(() => {
        nexusInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
    if (
      typeof document !== "undefined" &&
      document.activeElement === nexusInputRef.current
    ) {
      nexusInputRef.current?.blur();
    }
  }, [activeFabPage, isOpen]);

  const handleRescheduleSave = useCallback(async () => {
    if (isDeletingEvent) {
      return;
    }
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) {
      setRescheduleError("Select both date and time");
      return;
    }
    if (!rescheduleTarget.scheduleInstanceId) {
      setRescheduleError("No scheduled instance available to update.");
      return;
    }
    const parsed = new Date(`${rescheduleDate}T${rescheduleTime}`);
    if (Number.isNaN(parsed.getTime())) {
      setRescheduleError("Invalid date or time");
      return;
    }
    setIsSavingReschedule(true);
    setRescheduleError(null);
    try {
      const response = await fetch(
        `/api/schedule/instances/${rescheduleTarget.scheduleInstanceId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startUtc: parsed.toISOString() }),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to update schedule");
      }
      const payload = (await response.json().catch(() => null)) as {
        startUtc?: string | null;
      } | null;
      let nextStart = payload?.startUtc ?? parsed.toISOString();
      let nextInstanceId = rescheduleTarget.scheduleInstanceId;
      let nextDuration = rescheduleTarget.durationMinutes;

      if (rescheduleTarget.type === "HABIT") {
        const refreshed = await fetchNextScheduledInstance(
          rescheduleTarget.id,
          "HABIT"
        );
        if (refreshed) {
          nextStart = refreshed.startUtc ?? nextStart;
          nextInstanceId = refreshed.instanceId ?? nextInstanceId;
          if (
            typeof refreshed.durationMinutes === "number" &&
            Number.isFinite(refreshed.durationMinutes)
          ) {
            nextDuration = refreshed.durationMinutes;
          }
        }
      }

      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === rescheduleTarget.id && item.type === rescheduleTarget.type
            ? {
                ...item,
                nextScheduledAt: nextStart,
                scheduleInstanceId: nextInstanceId,
                durationMinutes: nextDuration,
              }
            : item
        )
      );
      void notifySchedulerOfChange();
      setIsSavingReschedule(false);
      setRescheduleTarget(null);
      setDeleteError(null);
    } catch (error) {
      console.error("Failed to reschedule", error);
      setRescheduleError(
        error instanceof Error ? error.message : "Unable to update schedule"
      );
      setIsSavingReschedule(false);
    }
  }, [
    fetchNextScheduledInstance,
    isDeletingEvent,
    rescheduleDate,
    rescheduleTime,
    rescheduleTarget,
    notifySchedulerOfChange,
  ]);

  const isSaveDisabled = useMemo(() => {
    if (isSavingFab || !selected) return true;
    if (selected === "GOAL") {
      if (goalName.trim().length === 0) return true;
      if (!goalMonumentId) return true;
      if (!goalEnergy) return true;
      if (!goalPriority) return true;
      return false;
    }
    if (selected === "PROJECT") {
      if (projectName.trim().length === 0) return true;
      if (!projectGoalId) return true;
      if (projectSkillIds.length === 0) return true;
      return false;
    }
    if (selected === "TASK") {
      if (taskName.trim().length === 0) return true;
      if (!taskProjectId) return true;
      if (!taskSkillId) return true;
      return false;
    }
    if (selected === "HABIT") {
      if (habitName.trim().length === 0) return true;
      if (!habitEnergy) return true;
      if (!habitRecurrence) return true;
      if (!habitType) return true;
      if (!habitSkillId) return true;
      return false;
    }
    return habitName.trim().length === 0;
  }, [
    goalEnergy,
    goalMonumentId,
    goalName,
    goalPriority,
    habitName,
    habitRecurrence,
    habitSkillId,
    habitType,
    isSavingFab,
    projectGoalId,
    projectName,
    projectSkillIds,
    selected,
    taskName,
    taskProjectId,
    taskSkillId,
  ]);

  const handleFabSave = useCallback(async () => {
    if (isSavingFab || !selected) return;
    setSaveError(null);
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setSaveError("Supabase client not available.");
      return;
    }
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) {
      setSaveError("Unable to resolve user.");
      return;
    }
    if (!user) {
      setSaveError("You need to be signed in to save.");
      return;
    }
    const trimmedName =
      selected === "GOAL"
        ? goalName.trim()
        : selected === "PROJECT"
        ? projectName.trim()
        : selected === "TASK"
        ? taskName.trim()
        : habitName.trim();
    if (trimmedName.length === 0) {
      setSaveError("Please enter a name.");
      return;
    }
    if (selected === "GOAL") {
      if (!goalMonumentId) {
        setSaveError("Link this goal to a monument before saving.");
        return;
      }
      if (!goalEnergy) {
        setSaveError("Select an energy level before saving.");
        return;
      }
      if (!goalPriority) {
        setSaveError("Select a priority before saving.");
        return;
      }
    }
    if (selected === "PROJECT") {
      if (!projectGoalId) {
        setSaveError("Link this project to a goal before saving.");
        return;
      }
      if (projectSkillIds.length === 0) {
        setSaveError("Link at least one skill before saving.");
        return;
      }
    }
    if (selected === "TASK") {
      if (!taskProjectId) {
        setSaveError("Link this task to a project before saving.");
        return;
      }
      if (!taskSkillId) {
        setSaveError("Link this task to a skill before saving.");
        return;
      }
    }
    if (selected === "HABIT") {
      if (!habitEnergy) {
        setSaveError("Select an energy level before saving.");
        return;
      }
      if (!habitRecurrence) {
        setSaveError("Select a recurrence before saving.");
        return;
      }
      if (!habitType) {
        setSaveError("Select a habit type before saving.");
        return;
      }
      if (!habitSkillId) {
        setSaveError("Link this habit to a skill before saving.");
        return;
      }
    }
    setIsSavingFab(true);
    try {
      if (selected === "GOAL") {
        const { error } = await supabase.from("goals").insert({
          user_id: user.id,
          name: trimmedName,
          priority: goalPriority,
          energy: goalEnergy,
          why: goalWhy?.trim() || null,
          monument_id: goalMonumentId || null,
          due_date: goalDue ?? null,
        });
        if (error) throw error;
      } else if (selected === "PROJECT") {
        const { data: projectData, error } = await supabase
          .from("projects")
          .insert({
            user_id: user.id,
            name: trimmedName,
            goal_id: projectGoalId || null,
            priority: projectPriority,
            energy: projectEnergy,
            stage: projectStage,
            why: projectWhy?.trim() || null,
            duration_min:
              typeof projectDuration === "number" &&
              Number.isFinite(projectDuration)
                ? projectDuration
                : normalizedProjectDuration || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (projectData?.id && projectSkillIds.length > 0) {
          const { error: projectSkillsError } = await supabase
            .from("project_skills")
            .insert(
              projectSkillIds.map((skillId) => ({
                project_id: projectData.id,
                skill_id: skillId,
              }))
            );
          if (projectSkillsError) throw projectSkillsError;
        }
      } else if (selected === "TASK") {
        const { error } = await supabase.from("tasks").insert({
          user_id: user.id,
          name: trimmedName,
          project_id: taskProjectId || null,
          stage: taskStage,
          skill_id: taskSkillId || null,
        });
        if (error) throw error;
      } else if (selected === "HABIT") {
        const parsedDuration = Number.parseInt(habitDuration || "0", 10);
        const duration = Number.isFinite(parsedDuration)
          ? parsedDuration
          : null;
        const { error } = await supabase.from("habits").insert({
          user_id: user.id,
          name: trimmedName,
          type: habitType,
          habit_type: habitType,
          recurrence: habitRecurrence,
          duration_minutes: duration,
          energy: habitEnergy,
          skill_id: habitSkillId || null,
          routine_id: habitRoutineId || null,
          goal_id: habitGoalId || null,
        });
        if (error) throw error;
        await notifySchedulerOfChange();
      }
      setExpanded(false);
      setSelected(null);
    } catch (error: any) {
      console.error("Failed to save item", error);
      const errorMessage =
        error?.message || error?.error?.message || "Unable to save right now.";
      setSaveError(errorMessage);
    } finally {
      setIsSavingFab(false);
    }
  }, [
    habitDuration,
    habitEnergy,
    habitGoalId,
    habitRecurrence,
    habitSkillId,
    habitType,
    habitWhy,
    habitName,
    isSavingFab,
    goalDue,
    goalEnergy,
    goalMonumentId,
    goalName,
    goalPriority,
    goalWhy,
    normalizedProjectDuration,
    notifySchedulerOfChange,
    projectDuration,
    projectEnergy,
    projectGoalId,
    projectName,
    projectPriority,
    projectSkillIds,
    projectStage,
    projectWhy,
    selected,
    taskName,
    taskProjectId,
    taskSkillId,
    taskStage,
  ]);

  const overhangCancelTapHandlers = useTapHandler(() => {
    setExpanded(false);
    setSelected(null);
    setIsOpen(false);
  });
  const overhangSaveTapHandlers = useTapHandler(() => handleFabSave(), {
    disabled: isSaveDisabled,
  });
  const handleDeleteEvent = useCallback(async () => {
    if (isDeletingEvent) {
      return;
    }
    const target = rescheduleTarget;
    if (!target) {
      return;
    }
    setDeleteError(null);
    setIsDeletingEvent(true);
    try {
      const typeSegment = target.type === "HABIT" ? "habit" : "project";
      const response = await fetch(
        `/api/schedule/events/${typeSegment}/${target.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to delete this event");
      }
      setSearchResults((prev) =>
        prev.filter(
          (item) => !(item.id === target.id && item.type === target.type)
        )
      );
      setRescheduleTarget(null);
      setRescheduleDate("");
      setRescheduleTime("");
      setRescheduleError(null);
      setDeleteError(null);
      void notifySchedulerOfChange();
    } catch (error) {
      console.error("Failed to delete schedule event", error);
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete this event"
      );
    } finally {
      setIsDeletingEvent(false);
    }
  }, [isDeletingEvent, notifySchedulerOfChange, rescheduleTarget]);

  // Close menu when clicking outside
  useEffect(() => {
    if (rescheduleTarget) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        if (expanded) return;
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expanded, isOpen, rescheduleTarget]);

  useEffect(() => {
    if (!isOpen) {
      setExpanded(false);
      setSelected(null);
    }
  }, [isOpen]);

  const shouldRenderNeighbor = isDragging && dragTargetPage !== null;
  const neighborPage = shouldRenderNeighbor ? dragTargetPage : null;
  const neighborDirection =
    neighborPage !== null ? dragDirection ?? (pageX.get() < 0 ? 1 : -1) : null;

  const restingPalette = getMenuPalette(activeFabPage);
  const staticBackgroundImage = createPaletteBackground(restingPalette);
  const staticBorderColor = createPaletteBorderColor(restingPalette);
  const targetPalette =
    isDragging && dragTargetPage !== null
      ? getMenuPalette(dragTargetPage)
      : restingPalette;
  const baseR = useTransform(dragProgress, (value) =>
    lerp(restingPalette.base[0], targetPalette.base[0], value)
  );
  const baseG = useTransform(dragProgress, (value) =>
    lerp(restingPalette.base[1], targetPalette.base[1], value)
  );
  const baseB = useTransform(dragProgress, (value) =>
    lerp(restingPalette.base[2], targetPalette.base[2], value)
  );
  const highlightR = useTransform(dragProgress, (value) =>
    lerp(restingPalette.highlight[0], targetPalette.highlight[0], value)
  );
  const highlightG = useTransform(dragProgress, (value) =>
    lerp(restingPalette.highlight[1], targetPalette.highlight[1], value)
  );
  const highlightB = useTransform(dragProgress, (value) =>
    lerp(restingPalette.highlight[2], targetPalette.highlight[2], value)
  );
  const lowlightR = useTransform(dragProgress, (value) =>
    lerp(restingPalette.lowlight[0], targetPalette.lowlight[0], value)
  );
  const lowlightG = useTransform(dragProgress, (value) =>
    lerp(restingPalette.lowlight[1], targetPalette.lowlight[1], value)
  );
  const lowlightB = useTransform(dragProgress, (value) =>
    lerp(restingPalette.lowlight[2], targetPalette.lowlight[2], value)
  );
  // Background blends from drag motion value so color transitions stay continuous during interactive paging.
  const blendedBackgroundImage = useMotionTemplate`
    radial-gradient(circle at top, rgba(${highlightR}, ${highlightG}, ${highlightB}, 0.65), rgba(${baseR}, ${baseG}, ${baseB}, 0.15) 45%),
    linear-gradient(160deg, rgba(${highlightR}, ${highlightG}, ${highlightB}, 0.95) 0%, rgba(${baseR}, ${baseG}, ${baseB}, 0.97) 50%, rgba(${lowlightR}, ${lowlightG}, ${lowlightB}, 0.98) 100%)
  `;
  const blendedBorderColor = useMotionTemplate`
    rgba(${highlightR}, ${highlightG}, ${highlightB}, 0.35)
  `;
  const isBlendingGradient = isDragging && dragTargetPage !== null;
  const dragConstraintLeft = -normalizedStageWidth;
  const dragConstraintRight = normalizedStageWidth;
  const effectiveViewportHeight =
    expanded && (viewportHeight || stableViewportHeight)
      ? viewportHeight ?? stableViewportHeight
      : null;
  const minHeightExpanded = expanded
    ? effectiveViewportHeight
      ? Math.round(effectiveViewportHeight * 0.58)
      : "58vh"
    : undefined;
  const maxHeightExpanded = expanded
    ? effectiveViewportHeight
      ? Math.round(effectiveViewportHeight * 0.9 - 8 - stableSafeBottom)
      : "calc(90vh - env(safe-area-inset-bottom, 0px) - 8px)"
    : undefined;

  return (
    <div className={cn("relative", className)} {...wrapperProps}>
      {/* AddEvents Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {expanded
              ? createPortal(
                  <div
                    data-fab-overlay
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                    style={{ touchAction: "manipulation" }}
                    onWheel={(event) => event.preventDefault()}
                    onTouchMove={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  />,
                  document.body
                )
              : null}
            <motion.div
              data-fab-overlay
              ref={(node) => {
                menuRef.current = node;
                panelRef.current = node;
              }}
              className={cn(
                "bottom-20 mb-2 z-[2147483650] border rounded-lg shadow-2xl bg-[var(--surface-elevated)]",
                expanded ? "fixed" : "absolute",
                expanded ? "w-[92vw] max-w-[920px]" : "min-w-[200px]",
                menuClassName
              )}
              layout={!expanded}
              onTouchStart={(event) => event.stopPropagation()}
              onPointerDownCapture={handleExpandedPointerDownCapture}
              style={{
                boxShadow: MENU_BOX_SHADOW,
                borderColor: isBlendingGradient
                  ? blendedBorderColor
                  : staticBorderColor,
                transition: "border-color 0.1s linear, transform 0.2s ease",
                transformOrigin:
                  menuVariant === "timeline" ? "bottom right" : "bottom center",
                minHeight: expanded ? minHeightExpanded : menuContainerHeight,
                maxHeight: expanded ? maxHeightExpanded : menuContainerHeight,
                y: 0,
                height: expanded ? undefined : menuContainerHeight,
                minWidth: expanded ? undefined : menuWidth ?? undefined,
                width: expanded ? undefined : menuWidth ?? undefined,
                maxWidth: expanded ? undefined : menuWidth ?? undefined,
                touchAction: expanded ? "manipulation" : undefined,
                overflowY: expanded ? "auto" : "hidden",
                overflowX: "hidden",
                overscrollBehavior: expanded ? "contain" : undefined,
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { type: "tween", ease: "easeOut", duration: 0.2 },
              }}
              exit={{
                opacity: 0,
                y: 8,
                transition: { type: "tween", ease: "easeIn", duration: 0.2 },
              }}
              onWheel={handleMenuWheel}
            >
              <>
                <motion.div
                  className="relative h-full w-full"
                  style={{
                    backgroundImage: isBlendingGradient
                      ? blendedBackgroundImage
                      : staticBackgroundImage,
                    borderRadius: "inherit",
                  }}
                >
                  <div
                    ref={stageRef}
                    className="relative h-full w-full rounded-[inherit]"
                  >
                    <motion.div
                      className="absolute inset-0 flex"
                      drag="x"
                      dragListener={false}
                      dragControls={pageDragControls}
                      dragElastic={0}
                      dragMomentum={false}
                      dragConstraints={{
                        left: dragConstraintLeft,
                        right: dragConstraintRight,
                      }}
                      style={{ x: pageX }}
                      onPointerDown={
                        !expanded ? handlePagePointerDown : undefined
                      }
                      onDragStart={handlePageDragStart}
                      onDrag={handlePageDrag}
                      onDragEnd={handlePageDragEnd}
                      dragPropagation
                    >
                      <motion.div
                        className="absolute inset-0 z-10 flex"
                        variants={pageVariants}
                        initial="open"
                        animate="open"
                        style={{ borderRadius: "inherit" }}
                      >
                        {renderPage(activeFabPage)}
                      </motion.div>
                    </motion.div>
                    {neighborPage !== null &&
                      neighborDirection !== null &&
                      !expanded && (
                        <motion.div
                          className="pointer-events-none absolute inset-0 z-0 flex"
                          style={{
                            x:
                              neighborDirection === 1
                                ? incomingFromRight
                                : incomingFromLeft,
                          }}
                        >
                          <motion.div
                            className="absolute inset-0 flex overflow-hidden"
                            variants={pageVariants}
                            initial="open"
                            animate="open"
                            style={{ borderRadius: "inherit" }}
                          >
                            {renderPage(neighborPage)}
                          </motion.div>
                        </motion.div>
                      )}
                  </div>
                </motion.div>
              </>
            </motion.div>
            {expanded
              ? createPortal(
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 4 }}
                    transition={{
                      type: "tween",
                      duration: 0.18,
                      ease: "easeOut",
                    }}
                    className="pointer-events-auto fixed flex w-[108px] items-center gap-3"
                    style={{
                      left: overhangPos?.left,
                      top: overhangPos?.top,
                      right: overhangPos ? undefined : 12,
                      bottom: overhangPos
                        ? undefined
                        : "calc(12px + env(safe-area-inset-bottom, 0px))",
                      zIndex: 2147483651,
                      transition:
                        "top 0.18s ease, left 0.18s ease, right 0.18s ease, bottom 0.18s ease, transform 0.18s ease",
                      transform:
                        expanded && keyboardLift > 0
                          ? `translateY(${-keyboardLift}px)`
                          : undefined,
                    }}
                  >
                    <Button
                      type="button"
                      aria-label="Discard"
                      variant="cancelSquare"
                      size="iconSquare"
                      className="drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation"
                      {...overhangCancelTapHandlers}
                    >
                      <X
                        className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                        aria-hidden="true"
                      />
                    </Button>

                    <Button
                      type="button"
                      aria-label="Save"
                      variant="confirmSquare"
                      size="iconSquare"
                      disabled={isSaveDisabled}
                      className={cn(
                        "drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation",
                        isSaveDisabled
                          ? "btn-3d--amber bg-gradient-to-b from-amber-500 to-amber-700 hover:from-amber-500 hover:to-amber-800 active:from-amber-600 active:to-amber-800 disabled:opacity-100"
                          : ""
                      )}
                      {...overhangSaveTapHandlers}
                    >
                      <Check
                        className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                        aria-hidden="true"
                      />
                    </Button>
                  </motion.div>,
                  document.body
                )
              : null}
          </>
        )}
      </AnimatePresence>

      {/* FAB Button - Restored to your original styling */}
      <motion.button
        ref={buttonRef}
        onClick={handleFabButtonClick}
        aria-label={isOpen ? "Close add events menu" : "Add new item"}
        className={`relative flex items-center justify-center h-14 w-14 rounded-full text-white shadow-lg hover:scale-110 transition ${
          isOpen ? "rotate-45" : ""
        }`}
        onTouchStart={handleFabButtonTouchStart}
        onTouchEnd={handleFabButtonTouchEnd}
        onTouchCancel={handleFabButtonTouchCancel}
        onWheel={handleFabButtonWheel}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        style={{
          background:
            "linear-gradient(145deg, rgba(75, 85, 99, 0.95) 0%, rgba(31, 41, 55, 0.98) 55%, rgba(15, 23, 42, 1) 100%)",
          boxShadow:
            "0 18px 36px rgba(15, 23, 42, 0.55), 0 8px 18px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
        }}
      >
        {isOpen ? (
          <X className="h-8 w-8" aria-hidden="true" />
        ) : (
          <Plus className="h-8 w-8" aria-hidden="true" />
        )}
      </motion.button>

      {/* Event Creation Modal */}
      <EventModal
        isOpen={modalEventType !== null}
        onClose={() => setModalEventType(null)}
        eventType={modalEventType!}
      />
      <NoteModal isOpen={showNote} onClose={() => setShowNote(false)} />
      <PostModal isOpen={showPost} onClose={() => setShowPost(false)} />
      <ComingSoonModal
        isOpen={comingSoon !== null}
        onClose={() => setComingSoon(null)}
        label={comingSoon || ""}
      />
      <FabRescheduleOverlay
        open={Boolean(rescheduleTarget)}
        target={rescheduleTarget}
        dateValue={rescheduleDate}
        timeValue={rescheduleTime}
        error={rescheduleError}
        deleteError={deleteError}
        isSaving={isSavingReschedule}
        isDeleting={isDeletingEvent}
        onDateChange={setRescheduleDate}
        onTimeChange={setRescheduleTime}
        onClose={handleCloseReschedule}
        onSave={handleRescheduleSave}
        onDelete={handleDeleteEvent}
      />
    </div>
  );
}

type FabNexusProps = {
  query: string;
  onQueryChange: (value: string) => void;
  results: FabSearchResult[];
  isSearching: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelectResult: (result: FabSearchResult) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

function FabNexus({
  query,
  onQueryChange,
  results,
  isSearching,
  isLoadingMore,
  error,
  hasMore,
  onLoadMore,
  onSelectResult,
  inputRef,
}: FabNexusProps) {
  const hasResults = results.length > 0;
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMore || isLoadingMore) return;
    const target = event.currentTarget;
    const remaining =
      target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining < 120) {
      onLoadMore();
    }
  };

  const formatDateTime = (
    value: string | null,
    options?: Intl.DateTimeFormatOptions
  ) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    try {
      return new Intl.DateTimeFormat(
        undefined,
        options ?? { dateStyle: "medium", timeStyle: "short" }
      ).format(date);
    } catch {
      return date.toLocaleString();
    }
  };

  const getStatusText = (result: FabSearchResult) => {
    if (result.type === "PROJECT" && result.isCompleted) {
      const completedLabel = formatDateTime(result.completedAt);
      return completedLabel ? `Completed ${completedLabel}` : "Completed";
    }
    if (result.nextScheduledAt) {
      const scheduledLabel = formatDateTime(result.nextScheduledAt);
      return scheduledLabel ? `Scheduled ${scheduledLabel}` : "Scheduled";
    }
    if (result.type === "HABIT" && result.nextDueAt) {
      const dueLabel = formatDateTime(result.nextDueAt, {
        dateStyle: "medium",
      });
      return dueLabel ? `Due ${dueLabel}` : "Due soon";
    }
    return "No upcoming schedule";
  };

  return (
    <div
      className="flex h-full w-full flex-col text-white"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
    >
      <div className="px-4 pt-4">
        <div className="relative h-10">
          <span className="pointer-events-none absolute left-3 inset-y-0 flex items-center">
            <Search className="h-4 w-4 text-white/30" />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="search NEXUS"
            className="h-10 w-full rounded-lg border border-white/10 bg-black/60 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            aria-label="Search NEXUS"
          />
        </div>
      </div>
      <div
        className="flex-1 overflow-y-auto px-4 pb-4 pr-5 pt-3"
        data-fab-nexus-scroll="true"
        onScroll={handleScroll}
      >
        {isSearching ? (
          <div className="flex h-32 items-center justify-center text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-900/40 px-4 py-4 text-center text-sm text-red-100">
            {error}
          </div>
        ) : hasResults ? (
          <div className="flex flex-col">
            {results.map((result) => {
              const isCompletedProject =
                result.type === "PROJECT" && result.isCompleted;
              const isDisabled = isCompletedProject;
              const statusText = getStatusText(result);
              const cardClassName = cn(
                "flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
                isCompletedProject
                  ? "border-emerald-300/60 bg-[linear-gradient(135deg,_rgba(6,78,59,0.96)_0%,_rgba(4,120,87,0.94)_42%,_rgba(16,185,129,0.9)_100%)] text-emerald-50 shadow-[0_22px_42px_rgba(4,47,39,0.55)]"
                  : "border-white/5 bg-black/60 text-white/85 hover:bg-black/70",
                isDisabled && "cursor-not-allowed"
              );
              const nameTextClass = isCompletedProject
                ? "text-emerald-50"
                : "text-white";
              const metaLabelClass = isCompletedProject
                ? "text-[4px] uppercase tracking-[0.4em] text-emerald-100/70"
                : "text-[4px] uppercase tracking-[0.4em] text-white/45";
              const statusLabelClass = isCompletedProject
                ? "text-[4px] uppercase tracking-[0.4em] text-emerald-100/80 break-words leading-tight"
                : "text-[4px] uppercase tracking-[0.4em] text-white/50 break-words leading-tight";
              return (
                <button
                  key={`${result.type}-${result.id}`}
                  type="button"
                  onClick={() => {
                    if (isDisabled) return;
                    onSelectResult(result);
                  }}
                  disabled={isDisabled}
                  aria-disabled={isDisabled}
                  className={cardClassName}
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 flex-[3] basis-3/4 min-w-0">
                      <span
                        className={cn(
                          "block line-clamp-2 break-words text-[12px] font-medium leading-snug tracking-wide",
                          nameTextClass
                        )}
                      >
                        {result.name}
                      </span>
                      {result.type === "PROJECT" &&
                        result.global_rank !== null &&
                        result.global_rank !== undefined && (
                          <span className="text-gray-600 font-bold text-xs leading-none">
                            #{result.global_rank}
                          </span>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right flex-[1] basis-1/4 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={metaLabelClass}>
                          {result.type === "PROJECT" ? "Project" : "Habit"}
                        </span>
                      </div>
                      <span className={statusLabelClass}>{statusText}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {isLoadingMore ? (
              <div className="flex items-center justify-center py-3 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/50 px-4 py-6 text-center text-sm text-white/60">
            Start typing to search every project and habit.
          </div>
        )}
      </div>
    </div>
  );
}

type FabRescheduleOverlayProps = {
  open: boolean;
  target: FabSearchResult | null;
  dateValue: string;
  timeValue: string;
  error: string | null;
  deleteError: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
};

function FabRescheduleOverlay({
  open,
  target,
  dateValue,
  timeValue,
  error,
  deleteError,
  isSaving,
  isDeleting,
  onDateChange,
  onTimeChange,
  onClose,
  onSave,
  onDelete,
}: FabRescheduleOverlayProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    setConfirmingDelete(false);
  }, [open, target?.id]);

  if (typeof document === "undefined") return null;
  const combinedErrors = [error, deleteError].filter(
    (message): message is string =>
      typeof message === "string" && message.length > 0
  );
  const disableActions = isSaving || isDeleting;
  const deleteLabel =
    target?.type === "HABIT"
      ? "Habit"
      : target?.type === "PROJECT"
      ? "Project"
      : "Event";
  const handleDeleteClick = () => {
    if (disableActions || !target) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    void onDelete();
  };
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          data-fab-reschedule-overlay
          className="fixed inset-0 z-[2147483647] bg-black/60 backdrop-blur"
          style={{ touchAction: "manipulation" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <motion.div
            className="absolute left-1/2 top-1/2 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#050507]/95 p-5 text-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full border border-white/10 p-1 text-white/70 transition hover:text-white"
              aria-label="Close reschedule menu"
              disabled={disableActions}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.35em] text-white/40">
                Reschedule
              </p>
              <h3 className="text-lg font-semibold leading-tight">
                {target?.name ?? "Event"}
              </h3>
            </div>
            <div className="mt-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-white/55">
                  Due date
                </label>
                <input
                  type="date"
                  value={dateValue}
                  onChange={(event) => onDateChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  disabled={disableActions}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-white/55">
                  Time due
                </label>
                <input
                  type="time"
                  value={timeValue}
                  onChange={(event) => onTimeChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  disabled={disableActions}
                />
              </div>
              {combinedErrors.length > 0 && (
                <div className="rounded-xl border border-red-500/20 bg-red-900/30 px-3 py-2 text-sm text-red-100">
                  {combinedErrors.map((message, index) => (
                    <p key={`${message}-${index}`}>{message}</p>
                  ))}
                </div>
              )}
              <div className="pt-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteClick}
                    onTouchEnd={(event) => {
                      event.stopPropagation();
                      handleDeleteClick();
                    }}
                    disabled={disableActions || !target}
                    className={cn(
                      "bg-red-600 text-white hover:bg-red-500 transition",
                      confirmingDelete && "border border-white/40 bg-red-700"
                    )}
                  >
                    {isDeleting
                      ? "Deleting…"
                      : confirmingDelete
                      ? `Confirm delete ${deleteLabel}`
                      : `Delete ${deleteLabel}`}
                  </Button>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setConfirmingDelete(false);
                        onClose();
                      }}
                      onTouchEnd={(event) => {
                        event.stopPropagation();
                        setConfirmingDelete(false);
                        onClose();
                      }}
                      className="text-white/70 hover:bg-white/10"
                      disabled={disableActions}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={onSave}
                      onTouchEnd={(event) => {
                        event.stopPropagation();
                        onSave();
                      }}
                      disabled={disableActions || !target?.scheduleInstanceId}
                      className="bg-white/90 text-black hover:bg-white"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
