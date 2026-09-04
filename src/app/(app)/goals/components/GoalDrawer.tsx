"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Pause, Play, Plus, Timer, X } from "lucide-react";
import { listRoadmaps, createRoadmap } from "@/lib/queries/roadmaps";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { WheelPicker, WheelPickerWrapper } from "@/components/wheel-picker";
import type { LimitErrorCode } from "@/lib/goals/persistGoalUpdate";
import { normalizeGoalStatus } from "@/lib/goals/status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { cn } from "@/lib/utils";
import { AREAS, type AreaConfig } from "@/config/areas";
import type { Goal, Project, Task } from "../types";

export interface GoalUpdateContext {
  campaignId?: string | null;
  projects: (Project & { tasks: (Task & { isNew?: boolean })[] })[];
  removedProjectIds: string[];
  removedTaskIds: string[];
}

type GoalDrawerSubmitResult = {
  limitCode: LimitErrorCode;
};

type GoalCampaignOption = {
  id: string;
  name: string;
  emoji: string | null;
  roadmap_id: string | null;
  primary_monument_id: string | null;
  primary_circle_id?: string | null;
  primary_area_id?: string | null;
  scheduling_state?: string | null;
  position: number | null;
};

interface GoalDrawerProps {
  open: boolean;
  onClose(): void;
  /** Callback when creating a new goal */
  onAdd(
    goal: Goal,
    context: GoalUpdateContext
  ): Promise<GoalDrawerSubmitResult | void> | GoalDrawerSubmitResult | void;
  /** Existing goal to edit */
  initialGoal?: Goal | null;
  /** Callback when updating an existing goal */
  onUpdate?(
    goal: Goal,
    context: GoalUpdateContext
  ): Promise<GoalDrawerSubmitResult | void> | GoalDrawerSubmitResult | void;
  /** Optional delete handler shown only while editing */
  onDelete?(goal: Goal): Promise<void> | void;
  areas?: readonly AreaConfig[];
  monuments?: {
    id: string;
    title: string;
    emoji?: string | null;
    areaId?: string | null;
  }[];
  roadmaps?: { id: string; title: string; emoji?: string | null }[];
  initialAreaId?: string | null;
  initialCircleId?: string | null;
  initialMonumentId?: string | null;
  initialRoadmapId?: string | null;
  initialCampaignId?: string | null;
  hideProjects?: boolean;
  saveDisabled?: boolean;
  onGoalLimitReached?(limitCode: LimitErrorCode): void;
}

const PRIORITY_OPTIONS: {
  value: Goal["priority"];
  label: string;
  description: string;
}[] = [
  {
    value: "No",
    label: "No",
    description: "Keep this goal available without pulling focus.",
  },
  {
    value: "Low",
    label: "Low",
    description: "A gentle intention you can ease into.",
  },
  {
    value: "Medium",
    label: "Medium",
    description: "Important, but with space to breathe.",
  },
  {
    value: "High",
    label: "High",
    description: "Make room and rally your focus here.",
  },
  {
    value: "Critical",
    label: "Critical",
    description: "Top of the stack—treat like a burning deadline.",
  },
  {
    value: "Ultra",
    label: "Ultra",
    description: "Emergency mode. Everything else yields until this moves.",
  },
];

const PRIORITY_CODE_TO_LABEL: Record<string, Goal["priority"]> = {
  NO: "No",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
  "ULTRA-CRITICAL": "Ultra",
};

const PRIORITY_LABEL_TO_CODE: Record<Goal["priority"], string> = {
  No: "NO",
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
  Critical: "CRITICAL",
  Ultra: "ULTRA-CRITICAL",
  "Ultra-Critical": "ULTRA-CRITICAL",
};

type PriorityCodeInput = string | { name?: string | null } | null | undefined;

const normalizePriorityCodeInput = (
  code?: PriorityCodeInput
): string | null => {
  if (!code) return null;
  if (typeof code === "string") {
    return code.toUpperCase();
  }
  if (typeof code === "object" && "name" in code) {
    const value = code.name;
    if (typeof value === "string") {
      return value.toUpperCase();
    }
  }
  return null;
};

const priorityLabelFromCode = (
  code?: PriorityCodeInput,
  fallback: Goal["priority"] = "Low"
): Goal["priority"] => {
  const normalized = normalizePriorityCodeInput(code);
  const displayFallback = fallback === "Ultra-Critical" ? "Ultra" : fallback;
  if (!normalized) return displayFallback;
  return PRIORITY_CODE_TO_LABEL[normalized] ?? displayFallback;
};

const energyLabelFromCode = (
  code?: string | null,
  fallback: Goal["energy"] = "No"
): Goal["energy"] => {
  if (!code) return fallback;
  const normalized = code.toUpperCase();
  return ENERGY_CODE_TO_LABEL[normalized] ?? fallback;
};

const ENERGY_OPTIONS: {
  value: Goal["energy"];
  label: string;
}[] = [
  { value: "No", label: "No" },
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Ultra", label: "Ultra" },
  { value: "Extreme", label: "Extreme" },
];

const ENERGY_CODE_TO_LABEL: Record<string, Goal["energy"]> = {
  NO: "No",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  ULTRA: "Ultra",
  EXTREME: "Extreme",
};

const ENERGY_LABEL_TO_CODE: Record<Goal["energy"], string> = {
  No: "NO",
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
  Ultra: "ULTRA",
  Extreme: "EXTREME",
};

const PROJECT_STAGE_OPTIONS = [
  { value: "RESEARCH", label: "Research" },
  { value: "TEST", label: "Test" },
  { value: "BUILD", label: "Build" },
  { value: "REFINE", label: "Refine" },
  { value: "RELEASE", label: "Release" },
];

const TASK_STAGE_OPTIONS = [
  { value: "PREPARE", label: "Prepare" },
  { value: "PRODUCE", label: "Produce" },
  { value: "PERFECT", label: "Perfect" },
];

const DEFAULT_PROJECT_STAGE = "RESEARCH";
const DEFAULT_TASK_STAGE = "PREPARE";
const focusPomoCompleteDrawerHeaderClass =
  "shimmer-border-complete focus-pomo-start-glint relative isolate z-0 overflow-visible bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white shadow-[0_22px_38px_rgba(0,0,0,0.34),0_9px_18px_rgba(3,83,45,0.22),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45 outline outline-1 outline-green-900/40";

const toDateInputValue = (iso?: string | null) => {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const formatDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

const formatTimeInputValue = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;

const toTimeInputValue = (iso?: string | null) => {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return formatTimeInputValue(parsed);
};

const toGoalDateInputValue = (iso?: string | null) => {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return formatDateInputValue(parsed);
};

const parseDateInputValueLocal = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
};

const getTimeValueMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
};

const getTimeValueParts = (value: string) => {
  const totalMinutes = getTimeValueMinutes(value) ?? 0;
  const hours24 = Math.floor(totalMinutes / 60);
  return {
    hour: hours24 % 12 === 0 ? 12 : hours24 % 12,
    minute: totalMinutes % 60,
    period: hours24 >= 12 ? "PM" : "AM",
  } as const;
};

const getTimeValueFromParts = (
  hour: number,
  minute: number,
  period: "AM" | "PM"
) => {
  const normalizedHour = ((hour - 1 + 12) % 12) + 1;
  let hours24 = normalizedHour % 12;
  if (period === "PM") {
    hours24 += 12;
  }
  return `${String(hours24).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0"
  )}`;
};

const buildGoalLocalDueDateTime = (dateValue: string, timeValue: string) => {
  const parsedDate = parseDateInputValueLocal(dateValue.trim());
  if (!parsedDate) return null;
  const parsedTimeMinutes = getTimeValueMinutes(timeValue.trim()) ?? 0;
  parsedDate.setHours(
    Math.floor(parsedTimeMinutes / 60),
    parsedTimeMinutes % 60,
    0,
    0
  );
  return parsedDate;
};

const fromDateInputValue = (value: string): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const formatPickerTime = (value: string) => {
  const minutes = getTimeValueMinutes(value);
  if (minutes === null) return "Pick time";
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const projectStageToStatus = (stage: string): Project["status"] => {
  switch (stage) {
    case "RESEARCH":
      return "Todo";
    case "RELEASE":
      return "Done";
    default:
      return "In-Progress";
  }
};

const projectStatusToStage = (status: Project["status"]): string => {
  switch (status) {
    case "Todo":
      return "RESEARCH";
    case "Done":
      return "RELEASE";
    default:
      return "BUILD";
  }
};

const energyToDbValue = (energy: Goal["energy"]): string => {
  switch (energy) {
    case "Extreme":
      return "EXTREME";
    case "Ultra":
      return "ULTRA";
    case "High":
      return "HIGH";
    case "Medium":
      return "MEDIUM";
    case "Low":
      return "LOW";
    default:
      return "NO";
  }
};

const computeProjectProgress = (tasks: Task[]): number => {
  if (tasks.length === 0) {
    return 0;
  }
  const completed = tasks.filter((task) => task.stage === "PERFECT").length;
  return Math.round((completed / tasks.length) * 100);
};

const computeGoalProgress = (projects: Project[]): number => {
  if (projects.length === 0) {
    return 0;
  }
  const total = projects.reduce((sum, project) => sum + project.progress, 0);
  return Math.round(total / projects.length);
};

type EditableTask = Task & { isNew?: boolean };
type EditableProject = Project & {
  tasks: EditableTask[];
  isNew?: boolean;
};

export function GoalDrawer({
  open,
  onClose,
  onAdd,
  initialGoal,
  onUpdate,
  onDelete,
  areas = AREAS,
  monuments = [],
  roadmaps = undefined,
  initialAreaId = null,
  initialCircleId = null,
  initialMonumentId = null,
  initialRoadmapId = null,
  initialCampaignId = null,
  hideProjects = false,
  saveDisabled = false,
  onGoalLimitReached,
}: GoalDrawerProps) {
  console.log(
    "🎯 GoalDrawer render - open:",
    open,
    "initialGoal:",
    initialGoal?.id
  );
  const formId = useId();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [priority, setPriority] = useState<Goal["priority"]>("Low");
  const [energy, setEnergy] = useState<Goal["energy"]>("No");
  const [active, setActive] = useState(true);
  const [why, setWhy] = useState("");
  const [areaId, setAreaId] = useState<string>("");
  const [circleId, setCircleId] = useState<string>("");
  const [monumentId, setMonumentId] = useState<string>("");
  const [roadmapId, setRoadmapId] = useState<string>("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [dueTimeInput, setDueTimeInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDueTimePicker, setShowDueTimePicker] = useState(false);
  const [showCreateRoadmap, setShowCreateRoadmap] = useState(false);
  const [newRoadmapTitle, setNewRoadmapTitle] = useState("");
  const [newRoadmapEmoji, setNewRoadmapEmoji] = useState("");
  const [roadmapsList, setRoadmapsList] = useState<
    { id: string; title: string; emoji?: string | null }[]
  >(roadmaps || []);
  const [goalCampaignId, setGoalCampaignId] = useState<string | null>(
    initialCampaignId
  );
  const [goalCampaignTouched, setGoalCampaignTouched] = useState(false);
  const [goalCampaigns, setGoalCampaigns] = useState<GoalCampaignOption[]>([]);
  const [goalCampaignsLoading, setGoalCampaignsLoading] = useState(false);
  const [isCreatingRoadmap, setIsCreatingRoadmap] = useState(false);
  const [projectsState, setProjectsState] = useState<EditableProject[]>([]);
  const [removedProjectIds, setRemovedProjectIds] = useState<string[]>([]);
  const [removedTaskIds, setRemovedTaskIds] = useState<string[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const monumentSelectionRef = useRef<string>("");

  const editing = Boolean(initialGoal);
  const initialGoalStatus = normalizeGoalStatus(
    initialGoal?.status,
    initialGoal?.active
  );
  const currentGoalStatus =
    initialGoalStatus === "COMPLETED"
      ? "COMPLETED"
      : active
        ? "ACTIVE"
        : "PAUSED";
  const showPauseResumeAction =
    editing &&
    Boolean(onUpdate && initialGoal) &&
    (currentGoalStatus === "ACTIVE" || currentGoalStatus === "PAUSED");
  const pauseResumeActionLabel =
    currentGoalStatus === "PAUSED" ? "Resume Goal" : "Pause Goal";

  const getMonumentEmojiById = useCallback(
    (id?: string | null) => {
      if (!id) return null;
      const match = monuments.find((monument) => monument.id === id);
      return match?.emoji ?? null;
    },
    [monuments]
  );

  const areaOptions = useMemo(
    () => [...areas].sort((a, b) => a.sortOrder - b.sortOrder),
    [areas]
  );

  const defaultAreaId = areaOptions[0]?.id ?? "";

  useEffect(() => {
    if (initialGoal) {
      const resolvedPriority = priorityLabelFromCode(
        initialGoal.priorityCode,
        initialGoal.priority
      );
      const monumentDefaultEmoji = getMonumentEmojiById(
        initialGoal.monumentId ?? null
      );
      const initialEmojiValue = initialGoal.emoji || monumentDefaultEmoji || "";
      setTitle(initialGoal.title);
      setEmoji(initialEmojiValue);
      setPriority(resolvedPriority);
      const resolvedEnergy = energyLabelFromCode(
        initialGoal.energyCode,
        initialGoal.energy
      );
      setEnergy(resolvedEnergy);
      setActive(
        normalizeGoalStatus(initialGoal.status, initialGoal.active) === "ACTIVE"
      );
      setWhy(initialGoal.why || "");
      setAreaId(initialGoal.areaId || "");
      setCircleId(initialGoal.circleId || "");
      setMonumentId(initialGoal.monumentId || "");
      monumentSelectionRef.current = initialGoal.monumentId || "";
      setRoadmapId(initialGoal.roadmapId || "");
      setShowCreateRoadmap(false);
      setNewRoadmapTitle("");
      setNewRoadmapEmoji("");
      setDueDateInput(toGoalDateInputValue(initialGoal.dueDate));
      setDueTimeInput(toTimeInputValue(initialGoal.dueDate));
      setShowAdvanced(Boolean(initialGoal.dueDate));
      setShowDueTimePicker(false);
      setGoalCampaignId(initialCampaignId);
      setGoalCampaignTouched(false);
      setProjectsState(
        (initialGoal.projects || []).map((project) => {
          const stage = project.stage ?? projectStatusToStage(project.status);
          const tasks = (project.tasks || []).map((task) => ({
            ...task,
            isNew: false,
          }));
          const progress = computeProjectProgress(tasks);
          return {
            ...project,
            stage,
            status: projectStageToStatus(stage),
            energy: project.energy,
            energyCode: project.energyCode ?? energyToDbValue(project.energy),
            priorityCode: project.priorityCode,
            progress,
            tasks,
            isNew: false,
          } satisfies EditableProject;
        })
      );
    } else {
      setTitle("");
      setEmoji("");
      setPriority("Low");
      setEnergy("No");
      setActive(true);
      setWhy("");
      setAreaId(initialAreaId || (initialCircleId ? "" : defaultAreaId));
      setCircleId(initialCircleId || "");
      setMonumentId(initialMonumentId || "");
      monumentSelectionRef.current = initialMonumentId || "";
      setRoadmapId(initialRoadmapId || "");
      setShowCreateRoadmap(false);
      setNewRoadmapTitle("");
      setNewRoadmapEmoji("");
      setDueDateInput("");
      setDueTimeInput("");
      setShowAdvanced(false);
      setShowDueTimePicker(false);
      setGoalCampaignId(initialCampaignId);
      setGoalCampaignTouched(false);
      setProjectsState([]);
    }
    setRemovedProjectIds([]);
    setRemovedTaskIds([]);
    setStatusActionLoading(false);
  }, [
    defaultAreaId,
    getMonumentEmojiById,
    initialAreaId,
    initialCircleId,
    initialMonumentId,
    initialGoal,
    initialCampaignId,
    initialRoadmapId,
    open,
  ]);

  useEffect(() => {
    if (!open || !initialGoal?.id) return;
    let cancelled = false;
    const hydrateGoalCampaign = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data: campaignGoalRows, error: campaignGoalError } =
          await supabase
            .from("campaign_goals")
            .select("campaign_id")
            .eq("user_id", user.id)
            .eq("goal_id", initialGoal.id)
            .order("position", { ascending: true })
            .limit(1);
        if (campaignGoalError) throw campaignGoalError;
        if (cancelled) return;

        const hydratedCampaignRows = (campaignGoalRows ?? []) as {
          campaign_id?: string | null;
        }[];
        const hydratedCampaignId =
          typeof hydratedCampaignRows[0]?.campaign_id === "string"
            ? hydratedCampaignRows[0].campaign_id
            : null;
        setGoalCampaignId(hydratedCampaignId);
        setGoalCampaignTouched(false);

        if (!hydratedCampaignId) return;
        const { data: campaignRow, error: campaignError } = await supabase
          .from("campaigns")
          .select(
            "id, name, emoji, roadmap_id, primary_monument_id, primary_circle_id, primary_area_id, scheduling_state, position"
          )
          .eq("id", hydratedCampaignId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (campaignError) throw campaignError;
        if (cancelled || !campaignRow) return;
        const campaign = campaignRow as GoalCampaignOption;
        setGoalCampaigns((current) =>
          current.some((item) => item.id === campaign.id)
            ? current
            : [...current, campaign]
        );
      } catch (err) {
        console.error("Error hydrating goal campaign:", err);
      }
    };
    void hydrateGoalCampaign();
    return () => {
      cancelled = true;
    };
  }, [initialGoal?.id, open]);

  useEffect(() => {
    if (monumentSelectionRef.current === monumentId) {
      return;
    }
    monumentSelectionRef.current = monumentId;
    if (!monumentId) {
      setEmoji("");
      return;
    }
    const defaultEmoji = getMonumentEmojiById(monumentId);
    if (defaultEmoji) {
      setEmoji(defaultEmoji);
    }
  }, [monumentId, getMonumentEmojiById]);

  const monumentOptions = useMemo(() => {
    if (!monuments.length) {
      return [] as {
        id: string;
        title: string;
        emoji?: string | null;
        areaId?: string | null;
      }[];
    }
    return [...monuments].sort((a, b) => a.title.localeCompare(b.title));
  }, [monuments]);

  const roadmapOptions = useMemo(() => {
    if (!roadmapsList.length) {
      return [] as { id: string; title: string; emoji?: string | null }[];
    }
    return [...roadmapsList].sort((a, b) => a.title.localeCompare(b.title));
  }, [roadmapsList]);

  const goalCampaignOptions = useMemo(() => {
    if (areaId && !monumentId && !circleId) {
      return goalCampaignId
        ? goalCampaigns.filter((campaign) => campaign.id === goalCampaignId)
        : [];
    }

    const campaigns = [...goalCampaigns];
    if (circleId) {
      return campaigns
        .filter(
          (campaign) =>
            campaign.primary_circle_id === circleId ||
            campaign.id === goalCampaignId
        )
        .sort((a, b) => {
          const aPosition = a.position ?? Number.MAX_SAFE_INTEGER;
          const bPosition = b.position ?? Number.MAX_SAFE_INTEGER;
          if (aPosition !== bPosition) return aPosition - bPosition;
          return a.name.localeCompare(b.name);
        });
    }

    campaigns.sort((a, b) => {
      const aMatches = Boolean(monumentId && a.primary_monument_id === monumentId);
      const bMatches = Boolean(monumentId && b.primary_monument_id === monumentId);
      if (aMatches !== bMatches) return aMatches ? -1 : 1;
      const aPosition = a.position ?? Number.MAX_SAFE_INTEGER;
      const bPosition = b.position ?? Number.MAX_SAFE_INTEGER;
      if (aPosition !== bPosition) return aPosition - bPosition;
      return a.name.localeCompare(b.name);
    });
    return campaigns;
  }, [areaId, circleId, goalCampaignId, goalCampaigns, monumentId]);

  const selectedGoalCampaign = goalCampaignId
    ? goalCampaigns.find((campaign) => campaign.id === goalCampaignId) ?? null
    : null;

  const goalRelationshipSelectClass =
    "flex h-auto min-w-0 max-w-full items-center gap-1.5 border-0 bg-transparent p-0 text-left text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4 transition";

  // Load roadmaps if not provided as prop
  useEffect(() => {
    if (roadmaps !== undefined) {
      setRoadmapsList(roadmaps);
      return;
    }
    if (!open) return;
    let cancelled = false;
    const loadRoadmaps = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const roadmapsData = await listRoadmaps(user.id);
        if (!cancelled) {
          setRoadmapsList(roadmapsData);
        }
      } catch (err) {
        console.error("Error loading roadmaps:", err);
      }
    };
    loadRoadmaps();
    return () => {
      cancelled = true;
    };
  }, [open, roadmaps]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadGoalCampaigns = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      try {
        setGoalCampaignsLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data, error } = await supabase
          .from("campaigns")
          .select(
            "id, name, emoji, roadmap_id, primary_monument_id, primary_circle_id, primary_area_id, scheduling_state, position"
          )
          .eq("user_id", user.id)
          .order("position", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const loadedCampaigns = (data ?? []) as GoalCampaignOption[];
        setGoalCampaigns((current) => {
          const loadedIds = new Set(loadedCampaigns.map((item) => item.id));
          const hydratedCampaigns = current.filter(
            (campaign) => !loadedIds.has(campaign.id)
          );
          return [...loadedCampaigns, ...hydratedCampaigns];
        });
      } catch (err) {
        console.error("Error loading campaigns:", err);
        if (!cancelled) {
          setGoalCampaigns([]);
        }
      } finally {
        if (!cancelled) {
          setGoalCampaignsLoading(false);
        }
      }
    };
    void loadGoalCampaigns();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleCreateRoadmap = async () => {
    if (!newRoadmapTitle.trim()) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    try {
      setIsCreatingRoadmap(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const newRoadmap = await createRoadmap(user.id, {
        title: newRoadmapTitle.trim(),
        emoji: newRoadmapEmoji.trim() || null,
      });
      setRoadmapsList((prev) => [...prev, newRoadmap]);
      setRoadmapId(newRoadmap.id);
      setShowCreateRoadmap(false);
      setNewRoadmapTitle("");
      setNewRoadmapEmoji("");
    } catch (err) {
      console.error("Error creating roadmap:", err);
    } finally {
      setIsCreatingRoadmap(false);
    }
  };

  const handleRoadmapSelectChange = (value: string) => {
    if (value === "__create__") {
      setShowCreateRoadmap(true);
    } else {
      setRoadmapId(value);
      setShowCreateRoadmap(false);
    }
  };

  // Allow saving at any point: only require a title.
  // Empty-named projects/tasks will be filtered out during persistence.
  const canSubmit =
    title.trim().length > 0 && (areaId.length > 0 || circleId.length > 0);

  const generateId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const handleConfirmDelete = async () => {
    if (!initialGoal || !onDelete) return;
    let success = false;
    try {
      setDeleteLoading(true);
      await Promise.resolve(onDelete(initialGoal));
      success = true;
    } catch (err) {
      console.error("Error deleting goal from drawer:", err);
    } finally {
      setDeleteLoading(false);
      if (success) {
        onClose();
      }
    }
  };

  const handleAddProject = () => {
    const stage = DEFAULT_PROJECT_STAGE;
    const nextProject: EditableProject = {
      id: generateId(),
      name: "",
      status: projectStageToStatus(stage),
      progress: 0,
      energy: "No",
      energyCode: energyToDbValue("No"),
      dueDate: undefined,
      tasks: [],
      stage,
      priorityCode: "NO",
      isNew: true,
    };
    setProjectsState((projects) => [...projects, nextProject]);
  };

  const handleProjectNameChange = (projectId: string, value: string) => {
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId ? { ...project, name: value } : project
      )
    );
  };

  const handleProjectStageChange = (projectId: string, stage: string) => {
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              stage,
              status: projectStageToStatus(stage),
            }
          : project
      )
    );
  };

  const handleProjectEnergyChange = (
    projectId: string,
    energyValue: Goal["energy"]
  ) => {
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              energy: energyValue,
              energyCode: energyToDbValue(energyValue),
            }
          : project
      )
    );
  };

  const handleProjectDueDateChange = (projectId: string, value: string) => {
    const normalized = fromDateInputValue(value);
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              dueDate: normalized ?? undefined,
            }
          : project
      )
    );
  };

  const handleRemoveProject = (projectId: string) => {
    const projectToRemove =
      projectsState.find((project) => project.id === projectId) ?? null;
    setProjectsState((projects) =>
      projects.filter((project) => project.id !== projectId)
    );
    if (projectToRemove && !projectToRemove.isNew) {
      setRemovedProjectIds((ids) =>
        ids.includes(projectId) ? ids : [...ids, projectId]
      );
      const existingTaskIds = projectToRemove.tasks
        .filter((task) => !task.isNew)
        .map((task) => task.id);
      if (existingTaskIds.length > 0) {
        setRemovedTaskIds((ids) => {
          const unique = new Set(ids);
          existingTaskIds.forEach((id) => unique.add(id));
          return Array.from(unique);
        });
      }
    }
  };

  const handleAddTask = (projectId: string) => {
    const newTask: EditableTask = {
      id: generateId(),
      name: "",
      stage: DEFAULT_TASK_STAGE,
      isNew: true,
    };
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const nextTasks = [...project.tasks, newTask];
        return {
          ...project,
          tasks: nextTasks,
          progress: computeProjectProgress(nextTasks),
        };
      })
    );
  };

  const handleTaskNameChange = (
    projectId: string,
    taskId: string,
    value: string
  ) => {
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const nextTasks = project.tasks.map((task) =>
          task.id === taskId ? { ...task, name: value } : task
        );
        return {
          ...project,
          tasks: nextTasks,
          progress: computeProjectProgress(nextTasks),
        };
      })
    );
  };

  const handleTaskStageChange = (
    projectId: string,
    taskId: string,
    stage: string
  ) => {
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const nextTasks = project.tasks.map((task) =>
          task.id === taskId ? { ...task, stage } : task
        );
        return {
          ...project,
          tasks: nextTasks,
          progress: computeProjectProgress(nextTasks),
        };
      })
    );
  };

  const handleRemoveTask = (projectId: string, taskId: string) => {
    let removedExisting = false;
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const taskToRemove = project.tasks.find((task) => task.id === taskId);
        if (taskToRemove && !taskToRemove.isNew) {
          removedExisting = true;
        }
        const nextTasks = project.tasks.filter((task) => task.id !== taskId);
        return {
          ...project,
          tasks: nextTasks,
          progress: computeProjectProgress(nextTasks),
        };
      })
    );
    if (removedExisting) {
      setRemovedTaskIds((ids) =>
        ids.includes(taskId) ? ids : [...ids, taskId]
      );
    }
  };

  const saveGoal = async ({
    closeOnSuccess,
    statusOverride,
  }: {
    closeOnSuccess: boolean;
    statusOverride?: "ACTIVE" | "PAUSED";
  }) => {
    if (!canSubmit || deleteLoading || statusActionLoading) return;

    const preservedStatus = normalizeGoalStatus(
      initialGoal?.status,
      initialGoal?.active,
    );
    if (preservedStatus === "COMPLETED" && statusOverride) {
      return;
    }
    const computedStatus =
      statusOverride ??
      (preservedStatus === "COMPLETED"
        ? "COMPLETED"
        : active
          ? "ACTIVE"
          : "PAUSED");
    const computedActive = computedStatus === "ACTIVE";

    const preparedProjects: Project[] = projectsState.map((project) => {
      const stage = project.stage ?? projectStatusToStage(project.status);
      const sanitizedTasks = project.tasks.map((task) => ({
        id: task.id,
        name: task.name.trim(),
        stage: task.stage,
        skillId: task.skillId,
      }));
      const progress = computeProjectProgress(sanitizedTasks);
      return {
        id: project.id,
        name: project.name.trim(),
        status: projectStageToStatus(stage),
        progress,
        dueDate: project.dueDate,
        energy: project.energy,
        energyCode: project.energyCode ?? energyToDbValue(project.energy),
        tasks: sanitizedTasks,
        stage,
        priorityCode: project.priorityCode,
        isNew: project.isNew,
      };
    });

    const goalProgress = computeGoalProgress(preparedProjects);

    const context: GoalUpdateContext = {
      campaignId: editing
        ? goalCampaignTouched
          ? goalCampaignId
          : undefined
        : goalCampaignId ?? initialCampaignId,
      projects: projectsState.map((project) => ({
        ...project,
        tasks: project.tasks.map((task) => ({ ...task })),
      })),
      removedProjectIds,
      removedTaskIds,
    };

    const normalizedGoalDueDate = dueDateInput
      ? buildGoalLocalDueDateTime(dueDateInput, dueTimeInput)?.toISOString()
      : undefined;
    const normalizedPriorityCode = PRIORITY_LABEL_TO_CODE[priority] ?? "LOW";
    const normalizedEnergyCode = ENERGY_LABEL_TO_CODE[energy] ?? "NO";

    const nextGoal: Goal = {
      id: initialGoal?.id || Date.now().toString(),
      title: title.trim(),
      emoji: emoji.trim() || undefined,
      dueDate: normalizedGoalDueDate,
      priority,
      priorityCode: normalizedPriorityCode,
      energy,
      energyCode: normalizedEnergyCode,
      progress: goalProgress,
      status: computedStatus,
      active: computedActive,
      createdAt: initialGoal?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projects: preparedProjects,
      circleId: circleId || null,
      areaId: circleId ? null : areaId || null,
      monumentId: monumentId || null,
      roadmapId: roadmapId || null,
      skills: initialGoal?.skills,
      weight: initialGoal?.weight,
      why: why.trim() ? why.trim() : undefined,
    };

    const result = editing && onUpdate
      ? await onUpdate(nextGoal, context)
      : await onAdd(nextGoal, context);

    if (result?.limitCode) {
      if (result.limitCode === "GOAL_LIMIT_REACHED") {
        onGoalLimitReached?.(result.limitCode);
      }
      return;
    }

    setActive(computedActive);

    if (closeOnSuccess) {
      onClose();
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await saveGoal({ closeOnSuccess: true });
  };

  const handlePauseResumeGoal = async () => {
    if (!initialGoal || !onUpdate) return;
    const nextStatus = currentGoalStatus === "PAUSED" ? "ACTIVE" : "PAUSED";
    const previousActive = active;
    try {
      setStatusActionLoading(true);
      setActive(nextStatus === "ACTIVE");
      await saveGoal({
        closeOnSuccess: false,
        statusOverride: nextStatus,
      });
    } catch (err) {
      setActive(previousActive);
      console.error("Error updating goal status from drawer:", err);
    } finally {
      setStatusActionLoading(false);
    }
  };

  const isCompletedGoalDrawer =
    editing &&
    normalizeGoalStatus(initialGoal?.status, initialGoal?.active) ===
      "COMPLETED";

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      modal={false}
    >
      <SheetContent
        side="center"
        className="h-[90vh] w-full max-w-3xl overflow-hidden border border-white/10 bg-[#05070c] text-white shadow-[0_45px_120px_-40px_rgba(5,8,21,0.85)] sm:max-w-4xl"
        style={{ zIndex: 9999 }}
      >
        <SheetHeader
          className={cn(
            "border-b border-white/10 px-6 py-5 sm:px-8 sm:py-6",
            isCompletedGoalDrawer && focusPomoCompleteDrawerHeaderClass
          )}
        >
          <SheetTitle className="relative z-10 text-left text-xl font-semibold text-white tracking-[0.2em] uppercase">
            {editing ? "Edit goal" : "Create a goal"}
          </SheetTitle>
        </SheetHeader>
        <form
          id={formId}
          onSubmit={submit}
          className="flex flex-1 min-h-0 flex-col"
        >
          <div className="flex-1 min-h-0 space-y-8 overflow-y-auto px-6 pb-10 pt-6 sm:px-8 sm:pb-12">
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <Select
                    value={
                      monumentId
                        ? `MONUMENT:${monumentId}`
                        : circleId
                          ? `CIRCLE:${circleId}`
                          : areaId
                            ? `AREA:${areaId}`
                            : ""
                    }
                    onValueChange={(value) => {
                      const [type, id] = value.split(":");
                      if (type === "MONUMENT" && id) {
                        setMonumentId(id);
                        setCircleId("");
                        const monument = monuments.find(
                          (item) => item.id === id
                        );
                        setAreaId(monument?.areaId || "");
                        return;
                      }
                      if (type === "AREA" && id) {
                        setAreaId(id);
                        setCircleId("");
                        setMonumentId("");
                      }
                    }}
                    hideChevron
                    triggerClassName={cn(
                      goalRelationshipSelectClass,
                      "text-zinc-400/85 hover:text-zinc-300"
                    )}
                    trigger={
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate">
                          {monumentId
                            ? (monumentOptions.find(
                                (monument) => monument.id === monumentId
                              )?.title ?? "Monument")
                            : circleId
                              ? "Circle linked"
                              : areaOptions.find((area) => area.id === areaId)
                                  ?.label ?? "Add AREA / MONUMENT / CIRCLE"}
                        </span>
                      </span>
                    }
                    contentWrapperClassName="rounded-sm border-zinc-700/70 bg-zinc-950 shadow-xl shadow-black/50"
                    minContentWidth={240}
                  >
                    <SelectContent className="bg-zinc-950">
                      {circleId ? (
                        <SelectItem value={`CIRCLE:${circleId}`} disabled>
                          Circle linked
                        </SelectItem>
                      ) : null}
                      {areaOptions.map((area) => (
                        <SelectItem key={area.id} value={`AREA:${area.id}`}>
                          <span className="flex items-center gap-2">
                            <span>{area.emoji}</span>
                            <span>{area.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                      {monumentOptions.map((monument) => (
                        <SelectItem
                          key={monument.id}
                          value={`MONUMENT:${monument.id}`}
                        >
                          <span className="flex items-center gap-2">
                            <span>{monument.emoji ?? "🏛️"}</span>
                            <span>{monument.title}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={goalCampaignId ?? "__none__"}
                    onValueChange={(value) => {
                      setGoalCampaignTouched(true);
                      const nextCampaignId = value === "__none__" ? null : value;
                      setGoalCampaignId(nextCampaignId);
                      const selectedCampaign = nextCampaignId
                        ? goalCampaigns.find(
                            (campaign) => campaign.id === nextCampaignId
                          )
                        : null;
                      if (selectedCampaign?.roadmap_id) {
                        setRoadmapId(selectedCampaign.roadmap_id);
                      }
                    }}
                    hideChevron
                    triggerClassName={cn(
                      goalRelationshipSelectClass,
                      "max-w-[45%] justify-end text-right",
                      goalCampaignId
                        ? "text-zinc-300/90 hover:text-white"
                        : "text-zinc-500/85 hover:text-zinc-300"
                    )}
                    trigger={
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        {goalCampaignId ? (
                          <span
                            className="w-4 shrink-0 text-center text-sm leading-none"
                            aria-hidden="true"
                          >
                            {selectedGoalCampaign?.emoji ?? "🎯"}
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate">
                          {selectedGoalCampaign?.name ??
                            (goalCampaignId ? "Selected Campaign" : "add CAMPAIGN")}
                        </span>
                      </span>
                    }
                    contentWrapperClassName="rounded-sm border-zinc-700/70 bg-zinc-950 shadow-xl shadow-black/50"
                    contentAlign="end"
                    minContentWidth={240}
                  >
                    <SelectContent className="max-h-[18rem] bg-zinc-950">
                      <SelectItem value="__none__">No Campaign</SelectItem>
                      {goalCampaignsLoading ? (
                        <SelectItem value="__loading" disabled>
                          Loading Campaigns...
                        </SelectItem>
                      ) : goalCampaignOptions.length > 0 ? (
                        goalCampaignOptions.map((campaign) => (
                          <SelectItem key={campaign.id} value={campaign.id}>
                            <span className="inline-flex min-w-0 items-center gap-2">
                              <span
                                className="w-5 shrink-0 text-center text-base leading-none"
                                aria-hidden="true"
                              >
                                {campaign.emoji ?? "🎯"}
                              </span>
                              <span className="min-w-0 truncate">
                                {campaign.name}
                              </span>
                            </span>
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__empty" disabled>
                          No Campaigns yet
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Label
                  htmlFor="goal-title"
                  className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60"
                >
                  Title<span className="text-rose-300"> *</span>
                </Label>
                <Input
                  id="goal-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Name the ambition..."
                  className="h-12 rounded-xl border-white/20 bg-white/5 text-base text-white placeholder:text-white/40"
                />
              </div>

              <div className="w-24 space-y-2">
                <Label
                  htmlFor="goal-emoji"
                  className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60"
                >
                  Emoji
                </Label>
                <Input
                  id="goal-emoji"
                  value={emoji}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEmoji(value);
                  }}
                  maxLength={2}
                  placeholder="✨"
                  className="h-12 rounded-xl border-white/20 bg-white/5 text-center text-xl text-white"
                />
              </div>

              {!monumentId ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                      Monument link
                    </Label>
                    <Select
                      value={monumentId}
                      onValueChange={(value) => {
                        setMonumentId(value);
                        const monument = monuments.find(
                          (item) => item.id === value
                        );
                        if (monument?.areaId) {
                          setAreaId(monument.areaId);
                        }
                      }}
                      placeholder="Not linked"
                      className="w-full"
                      triggerClassName="h-11 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white"
                    >
                      <SelectContent>
                        <SelectItem value="" label="Not linked">
                          <span className="text-sm text-white/70">
                            Not linked
                          </span>
                        </SelectItem>
                        {monumentOptions.map((monument) => (
                          <SelectItem key={monument.id} value={monument.id}>
                            {monument.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                  Roadmap
                </Label>
                {showCreateRoadmap ? (
                  <div className="space-y-2 rounded-xl border border-white/20 bg-white/5 p-3">
                    <div className="flex gap-2">
                      <Input
                        value={newRoadmapEmoji}
                        onChange={(e) => setNewRoadmapEmoji(e.target.value)}
                        maxLength={2}
                        placeholder="✨"
                        className="h-10 w-16 rounded-xl border-white/20 bg-white/5 text-center text-xl text-white"
                      />
                      <Input
                        value={newRoadmapTitle}
                        onChange={(e) => setNewRoadmapTitle(e.target.value)}
                        placeholder="Roadmap name"
                        className="flex-1 h-10 rounded-xl border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newRoadmapTitle.trim()) {
                            e.preventDefault();
                            handleCreateRoadmap();
                          }
                          if (e.key === "Escape") {
                            setShowCreateRoadmap(false);
                            setNewRoadmapTitle("");
                            setNewRoadmapEmoji("");
                          }
                        }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={handleCreateRoadmap}
                        disabled={!newRoadmapTitle.trim() || isCreatingRoadmap}
                        className="flex-1 h-8 text-xs"
                      >
                        {isCreatingRoadmap ? "Creating..." : "Create"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowCreateRoadmap(false);
                          setNewRoadmapTitle("");
                          setNewRoadmapEmoji("");
                        }}
                        className="h-8 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select
                    value={roadmapId}
                    onValueChange={handleRoadmapSelectChange}
                    placeholder="Not linked"
                    className="w-full"
                    triggerClassName="h-11 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white"
                  >
                    <SelectContent>
                      <SelectItem value="" label="Not linked">
                        <span className="text-sm text-white/70">
                          Not linked
                        </span>
                      </SelectItem>
                      {roadmapOptions.map((roadmap) => (
                        <SelectItem key={roadmap.id} value={roadmap.id}>
                          <span className="flex items-center gap-2">
                            {roadmap.emoji && <span>{roadmap.emoji}</span>}
                            <span>{roadmap.title}</span>
                          </span>
                        </SelectItem>
                      ))}
                      <SelectItem
                        value="__create__"
                        label="➕ Create new roadmap"
                      >
                        <span className="flex items-center gap-2 text-sm text-white/70">
                          <Plus className="h-4 w-4" />
                          <span>Create new roadmap</span>
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex flex-row gap-4 sm:grid sm:grid-cols-2">
                <div className="space-y-3 flex-1">
                  <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                    Priority
                  </Label>
                  <Select
                    value={priority}
                    onValueChange={(value) =>
                      setPriority(value as Goal["priority"])
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f172a] text-sm text-white">
                      {PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="font-semibold">
                            {option.label.toUpperCase()}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 flex-1">
                  <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                    Energy
                  </Label>
                  <Select
                    value={energy}
                    onValueChange={(value) =>
                      setEnergy(value as Goal["energy"])
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white">
                      <SelectValue placeholder="Select energy level" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f172a] text-sm text-white">
                      {ENERGY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <FlameEmber
                              level={option.value.toUpperCase() as FlameLevel}
                              size="xs"
                            />
                            <span>{option.label.toUpperCase()}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left text-sm font-semibold text-white"
                >
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays
                      className="h-4 w-4 text-white/70"
                      aria-hidden="true"
                    />
                    Advanced timeline
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-white/60 transition-transform ${
                      showAdvanced ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {showAdvanced && (
                  <div className="mt-4 space-y-3">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                      Goal deadline
                    </Label>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <Input
                        type="date"
                        value={dueDateInput}
                        onChange={(event) => {
                          const nextDate = event.target.value;
                          setDueDateInput(nextDate);
                          if (!nextDate) {
                            setDueTimeInput("");
                            setShowDueTimePicker(false);
                          } else if (!dueTimeInput) {
                            setDueTimeInput("00:00");
                          }
                        }}
                        className="h-11 min-w-0 rounded-xl border-white/15 bg-white/[0.05] text-sm text-white"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!dueDateInput}
                        className="h-11 rounded-xl border border-white/15 bg-white/[0.03] px-3 text-sm text-white/70 hover:text-white disabled:cursor-not-allowed disabled:text-white/30"
                        onClick={() => setShowDueTimePicker((open) => !open)}
                      >
                        <Timer className="h-4 w-4" aria-hidden="true" />
                        {dueDateInput
                          ? formatPickerTime(dueTimeInput || "00:00")
                          : "Pick time"}
                      </Button>
                      {dueDateInput ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 rounded-xl border border-white/15 bg-white/[0.03] text-sm text-white/70 hover:text-white"
                          onClick={() => {
                            setDueDateInput("");
                            setDueTimeInput("");
                            setShowDueTimePicker(false);
                          }}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                    {dueDateInput && showDueTimePicker ? (
                      <div className="flex justify-center rounded-2xl border border-white/10 bg-black/25 py-3">
                        <WheelPickerWrapper
                          aria-label="Goal deadline time picker"
                          className="border-0 dark:border-0"
                        >
                          <WheelPicker
                            value={getTimeValueParts(dueTimeInput || "00:00").hour}
                            onValueChange={(hour) => {
                              const parts = getTimeValueParts(
                                dueTimeInput || "00:00"
                              );
                              setDueTimeInput(
                                getTimeValueFromParts(
                                  hour,
                                  parts.minute,
                                  parts.period
                                )
                              );
                            }}
                            options={Array.from({ length: 12 }, (_, index) => {
                              const hour = index + 1;
                              return { value: hour, label: hour };
                            })}
                            infinite
                          />
                          <WheelPicker
                            value={
                              getTimeValueParts(dueTimeInput || "00:00").minute
                            }
                            onValueChange={(minute) => {
                              const parts = getTimeValueParts(
                                dueTimeInput || "00:00"
                              );
                              setDueTimeInput(
                                getTimeValueFromParts(
                                  parts.hour,
                                  minute,
                                  parts.period
                                )
                              );
                            }}
                            options={Array.from({ length: 60 }, (_, index) => ({
                              value: index,
                              label: String(index).padStart(2, "0"),
                            }))}
                            infinite
                          />
                          <WheelPicker<"AM" | "PM">
                            value={
                              getTimeValueParts(dueTimeInput || "00:00").period
                            }
                            onValueChange={(period) => {
                              const parts = getTimeValueParts(
                                dueTimeInput || "00:00"
                              );
                              setDueTimeInput(
                                getTimeValueFromParts(
                                  parts.hour,
                                  parts.minute,
                                  period
                                )
                              );
                            }}
                            options={["AM", "PM"].map((period) => ({
                              value: period as "AM" | "PM",
                              label: period,
                            }))}
                          />
                        </WheelPickerWrapper>
                      </div>
                    ) : null}
                    <p className="text-xs text-white/50">
                      Deadlines slowly boost weight inside a 4-week window and
                      spike over the final few days so this goal takes the lead
                      when it matters.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="goal-why"
                  className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60"
                >
                  Why?
                </Label>
                <Textarea
                  id="goal-why"
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  placeholder="Capture the purpose or narrative behind this goal."
                  className="min-h-[120px] rounded-xl border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
                />
              </div>

              {!hideProjects && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                        Projects &amp; tasks
                      </Label>
                      <p className="text-xs text-white/55">
                        Manage the projects and tasks connected to this goal
                        without leaving the page.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-full border-white/20 bg-white/[0.04] text-xs font-medium text-white/80 hover:border-indigo-400/50 hover:text-white"
                      onClick={handleAddProject}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Add project
                    </Button>
                  </div>

                  {projectsState.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-sm text-white/60">
                      No projects linked yet. Add one to keep your plan in sync
                      with this goal.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {projectsState.map((project, index) => {
                        const stageValue =
                          project.stage ?? projectStatusToStage(project.status);
                        const projectDueDateValue = toDateInputValue(
                          project.dueDate
                        );
                        return (
                          <div
                            key={project.id}
                            className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                  <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                                    Project {index + 1}
                                  </Label>
                                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/60">
                                    {project.progress}% progress
                                  </span>
                                </div>
                                <Input
                                  value={project.name}
                                  onChange={(event) =>
                                    handleProjectNameChange(
                                      project.id,
                                      event.target.value
                                    )
                                  }
                                  placeholder="Name this project"
                                  className="h-11 rounded-xl border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="mt-1 size-8 rounded-full border border-white/10 bg-white/[0.04] text-white/60 hover:border-rose-400/50 hover:text-rose-200"
                                onClick={() => handleRemoveProject(project.id)}
                                aria-label={`Remove project ${index + 1}`}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
                                  Stage
                                </Label>
                                <Select
                                  value={stageValue}
                                  onValueChange={(value) =>
                                    handleProjectStageChange(project.id, value)
                                  }
                                  triggerClassName="h-10 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white"
                                >
                                  <SelectContent className="bg-[#0f172a] text-sm text-white">
                                    {PROJECT_STAGE_OPTIONS.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
                                  Energy
                                </Label>
                                <Select
                                  value={project.energy}
                                  onValueChange={(value) =>
                                    handleProjectEnergyChange(
                                      project.id,
                                      value as Goal["energy"]
                                    )
                                  }
                                  triggerClassName="h-10 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white"
                                >
                                  <SelectContent className="bg-[#0f172a] text-sm text-white">
                                    {ENERGY_OPTIONS.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                              <details
                                className="group"
                                open={Boolean(projectDueDateValue)}
                              >
                                <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-white">
                                  <span>Advanced options</span>
                                  <ChevronDown className="h-4 w-4 text-white/60 transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="mt-3 space-y-2">
                                  <Label className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
                                    Project due date
                                  </Label>
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <Input
                                      type="date"
                                      value={projectDueDateValue}
                                      onChange={(event) =>
                                        handleProjectDueDateChange(
                                          project.id,
                                          event.target.value
                                        )
                                      }
                                      className="h-10 rounded-xl border-white/20 bg-white/5 text-sm text-white sm:flex-1"
                                    />
                                    {projectDueDateValue ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-10 rounded-xl border border-white/15 bg-white/[0.03] text-xs text-white/70 hover:text-white"
                                        onClick={() =>
                                          handleProjectDueDateChange(
                                            project.id,
                                            ""
                                          )
                                        }
                                      >
                                        Clear
                                      </Button>
                                    ) : null}
                                  </div>
                                  <p className="text-xs text-white/50">
                                    Projects surge to the top of schedules as
                                    their due date nears.
                                  </p>
                                </div>
                              </details>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
                                  Tasks
                                </Label>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-lg border-white/20 bg-white/[0.04] px-3 text-xs font-medium text-white/80 hover:border-indigo-400/50 hover:text-white"
                                  onClick={() => handleAddTask(project.id)}
                                >
                                  <Plus
                                    className="mr-1 h-3 w-3"
                                    aria-hidden="true"
                                  />
                                  Add task
                                </Button>
                              </div>

                              {project.tasks.length === 0 ? (
                                <p className="text-xs text-white/50">
                                  No tasks yet. Break this project down into
                                  actionable steps.
                                </p>
                              ) : (
                                <div className="space-y-3">
                                  {project.tasks.map((task, taskIndex) => (
                                    <div
                                      key={task.id}
                                      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="flex-1 space-y-1">
                                          <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
                                            Task {taskIndex + 1}
                                          </Label>
                                          <Input
                                            value={task.name}
                                            onChange={(event) =>
                                              handleTaskNameChange(
                                                project.id,
                                                task.id,
                                                event.target.value
                                              )
                                            }
                                            placeholder="Describe the task"
                                            className="h-10 rounded-lg border-white/10 bg-white/[0.05] text-sm"
                                          />
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="mt-1 size-8 rounded-full border border-white/10 bg-white/[0.05] text-white/60 hover:border-rose-400/50 hover:text-rose-200"
                                          onClick={() =>
                                            handleRemoveTask(
                                              project.id,
                                              task.id
                                            )
                                          }
                                          aria-label={`Remove task ${
                                            taskIndex + 1
                                          }`}
                                        >
                                          <X
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                          />
                                        </Button>
                                      </div>

                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1">
                                          <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
                                            Stage
                                          </Label>
                                          <Select
                                            value={task.stage}
                                            onValueChange={(value) =>
                                              handleTaskStageChange(
                                                project.id,
                                                task.id,
                                                value
                                              )
                                            }
                                            triggerClassName="h-9 rounded-lg border-white/10 bg-white/[0.05] text-left text-sm"
                                          >
                                            <SelectContent className="bg-[#0f172a] text-sm text-white">
                                              {TASK_STAGE_OPTIONS.map(
                                                (option) => (
                                                  <SelectItem
                                                    key={option.value}
                                                    value={option.value}
                                                  >
                                                    {option.label}
                                                  </SelectItem>
                                                )
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
                                            Status
                                          </Label>
                                          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                                            {task.stage === "PERFECT"
                                              ? "Complete"
                                              : task.stage === "PRODUCE"
                                              ? "In progress"
                                              : "Preparing"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>
        <SheetFooter className="border-t border-white/10 bg-white/[0.02] px-6 py-4 sm:px-8">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <h4 className="text-sm font-semibold text-white">
                  Delete Goal
                </h4>
                <p className="text-sm text-white/70">
                  This will permanently delete this goal and all related
                  projects and tasks.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? "Deleting..." : "Delete Goal"}
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                {showPauseResumeAction ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={pauseResumeActionLabel}
                    title={pauseResumeActionLabel}
                    className="h-10 w-10 rounded-full border border-white/10 bg-black text-white/78 hover:bg-white/[0.06] hover:text-rose-200 disabled:opacity-70"
                    onClick={handlePauseResumeGoal}
                    disabled={deleteLoading || statusActionLoading}
                  >
                    {currentGoalStatus === "PAUSED" ? (
                      <Play aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <Pause aria-hidden="true" className="h-4 w-4" />
                    )}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="text-sm text-white/70 hover:text-white"
                  onClick={onClose}
                  disabled={deleteLoading}
                >
                  Cancel
                </Button>
              </div>
              <Button
                type="submit"
                form={formId}
                className="w-full bg-white text-sm font-semibold text-[#05070c] hover:bg-white/90 disabled:opacity-60 sm:w-auto"
                disabled={saveDisabled || !canSubmit || deleteLoading}
              >
                Save goal
              </Button>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
