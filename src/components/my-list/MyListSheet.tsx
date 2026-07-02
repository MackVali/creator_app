"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Grid2x2,
  List,
  Plus,
  X,
} from "lucide-react";

import type { CatRow } from "@/lib/types/cat";
import type { SkillRow } from "@/lib/types/skill";
import type { TaskLite } from "@/lib/scheduler/weight";
import { MatrixContent } from "@/app/(app)/schedule/matrix/MatrixContent";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  normalizePriority,
  type PriorityBucketId,
} from "@/app/(app)/schedule/priorities/utils";

const QUICK_CREATE_PRIORITY_SYMBOLS: Record<PriorityBucketId, string> = {
  CRITICAL: "!!!",
  HIGH: "!!",
  MEDIUM: "!",
  LOW: "~",
  SOMEDAY: "...",
};

const QUICK_CREATE_PRIORITY_OPTIONS = PRIORITY_ORDER.map((priority) => ({
  id: priority,
  label: PRIORITY_LABELS[priority],
  symbol: QUICK_CREATE_PRIORITY_SYMBOLS[priority],
}));
const QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL = "◇";
const LIST_COMPACT_HEADER_ALLOWANCE = 40;
const LIST_COMPACT_ROW_HEIGHT = 42;
const LIST_COMPACT_NOTES_ALLOWANCE = 120;
const LIST_COMPACT_BOTTOM_ALLOWANCE = 36;
const LIST_COMPACT_EXPAND_THRESHOLD_RATIO = 0.88;
const MY_LIST_EDITABLE_TARGET_SELECTOR =
  'input, textarea, [contenteditable="true"]';

function resolveQuickCreateMediumPriorityMetadata() {
  return (
    QUICK_CREATE_PRIORITY_OPTIONS.find((option) => option.id === "MEDIUM") ?? {
      id: "MEDIUM" as const,
      label: PRIORITY_LABELS.MEDIUM,
      symbol: QUICK_CREATE_PRIORITY_SYMBOLS.MEDIUM,
    }
  );
}

const QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID = "uncategorized";
const QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_LABEL = "Uncategorized";

type QuickCreateSkillGroup = {
  id: string;
  label: string;
  categoryOrder: number | null;
  skills: SkillRow[];
};

function compareQuickCreateOrderThenName(
  leftOrder: number | null | undefined,
  leftName: string | null | undefined,
  rightOrder: number | null | undefined,
  rightName: string | null | undefined
) {
  const normalizedLeftOrder =
    typeof leftOrder === "number" && Number.isFinite(leftOrder)
      ? leftOrder
      : Number.POSITIVE_INFINITY;
  const normalizedRightOrder =
    typeof rightOrder === "number" && Number.isFinite(rightOrder)
      ? rightOrder
      : Number.POSITIVE_INFINITY;

  if (normalizedLeftOrder !== normalizedRightOrder) {
    return normalizedLeftOrder - normalizedRightOrder;
  }

  return (leftName ?? "").localeCompare(rightName ?? "");
}

type MyListManualRow = {
  id: string;
  done: boolean;
  skillId: string | null;
  skillName: string | null;
  skillIcon: string;
  priorityId: PriorityBucketId;
  text: string;
};

type MyListRowKey = `manual:${string}` | `task:${string}`;

type MyListTaskOverride = {
  skillId?: string | null;
  skillName?: string | null;
  skillIcon?: string | null;
  priorityId?: PriorityBucketId;
  text?: string;
};

type MyListActiveView = "list" | "matrix";

export function MyListSheet({
  open,
  onOpenChange,
  tasks,
  skills,
  skillCategories,
  pendingTaskIds,
  useFullExpandedHeight,
  onToggleTask,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: TaskLite[];
  skills: SkillRow[];
  skillCategories: CatRow[];
  pendingTaskIds: Set<string>;
  useFullExpandedHeight: boolean;
  onToggleTask: (taskId: string) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [note, setNote] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeView, setActiveView] = useState<MyListActiveView>("list");
  const [manualRows, setManualRows] = useState<MyListManualRow[]>([]);
  const [activeSkillPickerRowKey, setActiveSkillPickerRowKey] =
    useState<MyListRowKey | null>(null);
  const [activePriorityPickerRowKey, setActivePriorityPickerRowKey] =
    useState<MyListRowKey | null>(null);
  const [manualSkillSearch, setManualSkillSearch] = useState("");
  const [pendingDeleteRowId, setPendingDeleteRowId] = useState<string | null>(
    null
  );
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, MyListTaskOverride>
  >({});
  const [hiddenTaskRowIds, setHiddenTaskRowIds] = useState<Set<string>>(
    () => new Set()
  );
  const [myListSheetHeights, setMyListSheetHeights] = useState(() => ({
    compact: 448,
    expanded: 720,
  }));
  const sheetRootRef = useRef<HTMLElement | null>(null);
  const sheetScrollRef = useRef<HTMLDivElement | null>(null);
  const sheetTouchStartYRef = useRef<number | null>(null);
  const lastMeasuredViewportRef = useRef<{ width: number; height: number } | null>(
    null
  );
  const visibleTasks = useMemo(
    () => tasks.filter((task) => !hiddenTaskRowIds.has(task.id)),
    [hiddenTaskRowIds, tasks]
  );
  const hasListRows = visibleTasks.length > 0 || manualRows.length > 0;
  const visibleListRowCount = visibleTasks.length + manualRows.length;
  const listContentHeight =
    LIST_COMPACT_HEADER_ALLOWANCE +
    visibleListRowCount * LIST_COMPACT_ROW_HEIGHT +
    LIST_COMPACT_NOTES_ALLOWANCE +
    LIST_COMPACT_BOTTOM_ALLOWANCE;
  const listCompactHeight = Math.min(
    Math.max(myListSheetHeights.compact, listContentHeight),
    myListSheetHeights.expanded
  );
  const shouldExpandListOnOpen =
    listContentHeight >= myListSheetHeights.expanded ||
    listContentHeight >=
      myListSheetHeights.expanded * LIST_COMPACT_EXPAND_THRESHOLD_RATIO;
  const shouldExpandOnOpen = shouldExpandListOnOpen;
  const compactSheetHeight =
    activeView === "list" ? listCompactHeight : myListSheetHeights.compact;
  const currentSheetHeight = isExpanded
    ? myListSheetHeights.expanded
    : compactSheetHeight;
  const defaultPriority = resolveQuickCreateMediumPriorityMetadata();
  const skillLookup = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill])),
    [skills]
  );

  const resolveTaskPriorityId = useCallback(
    (task: TaskLite): PriorityBucketId => {
      const overridePriority = taskOverrides[task.id]?.priorityId;
      if (overridePriority) return overridePriority;
      if (task.priority?.trim()) return normalizePriority(task.priority);
      return defaultPriority.id;
    },
    [defaultPriority.id, taskOverrides]
  );

  const resolveTaskSkillMetadata = useCallback(
    (task: TaskLite) => {
      const override = taskOverrides[task.id];
      const overrideSkillId = override?.skillId;
      const sourceSkillId =
        overrideSkillId !== undefined ? overrideSkillId : task.skill_id ?? null;
      const skill = sourceSkillId ? skillLookup.get(sourceSkillId) ?? null : null;
      const skillName =
        override?.skillName ??
        skill?.name?.trim() ??
        (sourceSkillId ? "Untitled skill" : null);
      const skillIcon =
        override?.skillIcon?.trim() ||
        task.skill_icon?.trim() ||
        skill?.icon?.trim() ||
        "✦";

      return {
        skillId: sourceSkillId,
        skillName,
        skillIcon,
      };
    },
    [skillLookup, taskOverrides]
  );

  const addManualRow = useCallback(() => {
    setPendingDeleteRowId(null);
    setActivePriorityPickerRowKey(null);
    setManualRows((currentRows) => [
      ...currentRows,
      {
        id: `manual-${Date.now()}-${currentRows.length}`,
        done: false,
        skillId: null,
        skillName: null,
        skillIcon: "",
        priorityId: defaultPriority.id,
        text: "",
      },
    ]);
  }, [defaultPriority.id]);

  const updateManualRow = useCallback(
    (rowId: string, updates: Partial<Omit<MyListManualRow, "id">>) => {
      setPendingDeleteRowId((currentRowId) =>
        currentRowId === `manual:${rowId}` ? null : currentRowId
      );
      setManualRows((currentRows) =>
        currentRows.map((row) =>
          row.id === rowId ? { ...row, ...updates } : row
        )
      );
    },
    []
  );

  const manualSkillGroups = useMemo<QuickCreateSkillGroup[]>(() => {
    const term = manualSkillSearch.trim().toLowerCase();
    const categoryLookup = new Map(
      skillCategories.map((category) => [category.id, category])
    );
    const originalIndex = new Map(
      skills.map((skill, index) => [skill.id, index])
    );
    const groups = new Map<string, QuickCreateSkillGroup>();

    const filteredSkills = skills.filter((skill) => {
      if (!term) return true;
      return (
        (skill.name ?? "").toLowerCase().includes(term) ||
        (skill.icon ?? "").toLowerCase().includes(term)
      );
    });

    filteredSkills.forEach((skill) => {
      const groupId =
        skill.cat_id?.trim() || QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID;
      const category = categoryLookup.get(groupId);
      const label =
        groupId === QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID
          ? QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_LABEL
          : category?.name?.trim() || `Category ${groupId.slice(0, 8)}`;
      const existing = groups.get(groupId);

      if (existing) {
        existing.skills.push(skill);
      } else {
        groups.set(groupId, {
          id: groupId,
          label,
          categoryOrder: category?.sort_order ?? null,
          skills: [skill],
        });
      }
    });

    const orderedGroups = Array.from(groups.values()).sort((left, right) => {
      const leftUncategorized =
        left.id === QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID;
      const rightUncategorized =
        right.id === QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID;

      if (leftUncategorized !== rightUncategorized) {
        return leftUncategorized ? 1 : -1;
      }

      const orderComparison = compareQuickCreateOrderThenName(
        left.categoryOrder,
        left.label,
        right.categoryOrder,
        right.label
      );

      return orderComparison !== 0
        ? orderComparison
        : left.id.localeCompare(right.id);
    });

    return orderedGroups.map((group) => ({
      ...group,
      skills: [...group.skills].sort((left, right) => {
        const orderComparison = compareQuickCreateOrderThenName(
          left.sort_order,
          left.name,
          right.sort_order,
          right.name
        );

        return orderComparison !== 0
          ? orderComparison
          : (originalIndex.get(left.id) ?? 0) -
              (originalIndex.get(right.id) ?? 0);
      }),
    }));
  }, [manualSkillSearch, skillCategories, skills]);

  const handleManualSkillSelect = useCallback(
    (rowId: string, skill: SkillRow) => {
      updateManualRow(rowId, {
        skillId: skill.id,
        skillName: skill.name?.trim() || "Untitled skill",
        skillIcon: (skill.icon ?? "").trim() || "✦",
      });
      setActiveSkillPickerRowKey(null);
      setManualSkillSearch("");
    },
    [updateManualRow]
  );

  const handleTaskSkillSelect = useCallback((taskId: string, skill: SkillRow) => {
    setPendingDeleteRowId((currentRowId) =>
      currentRowId === `task:${taskId}` ? null : currentRowId
    );
    setTaskOverrides((currentOverrides) => ({
      ...currentOverrides,
      [taskId]: {
        ...currentOverrides[taskId],
        skillId: skill.id,
        skillName: skill.name?.trim() || "Untitled skill",
        skillIcon: (skill.icon ?? "").trim() || "✦",
      },
    }));
    setActiveSkillPickerRowKey(null);
    setManualSkillSearch("");
  }, []);

  const handlePrioritySelect = useCallback(
    (
      rowId: string,
      rowType: "manual" | "task",
      priorityId: PriorityBucketId
    ) => {
      setPendingDeleteRowId((currentRowId) =>
        currentRowId === `${rowType}:${rowId}` ? null : currentRowId
      );

      if (rowType === "manual") {
        updateManualRow(rowId, { priorityId });
      } else {
        setTaskOverrides((currentOverrides) => ({
          ...currentOverrides,
          [rowId]: {
            ...currentOverrides[rowId],
            priorityId,
          },
        }));
      }

      setActivePriorityPickerRowKey(null);
    },
    [updateManualRow]
  );

  const handleDeleteRowAction = useCallback(
    (rowId: string, rowType: "manual" | "task") => {
      const deleteRowId = `${rowType}:${rowId}`;

      if (pendingDeleteRowId !== deleteRowId) {
        setPendingDeleteRowId(deleteRowId);
        return;
      }

      setPendingDeleteRowId(null);
      if (rowType === "manual") {
        setManualRows((currentRows) =>
          currentRows.filter((row) => row.id !== rowId)
        );
        setActiveSkillPickerRowKey((currentRowKey) =>
          currentRowKey === `manual:${rowId}` ? null : currentRowKey
        );
        setActivePriorityPickerRowKey((currentRowKey) =>
          currentRowKey === `manual:${rowId}` ? null : currentRowKey
        );
        return;
      }

      setActiveSkillPickerRowKey((currentRowKey) =>
        currentRowKey === `task:${rowId}` ? null : currentRowKey
      );
      setActivePriorityPickerRowKey((currentRowKey) =>
        currentRowKey === `task:${rowId}` ? null : currentRowKey
      );
      setHiddenTaskRowIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(rowId);
        return nextIds;
      });
    },
    [pendingDeleteRowId]
  );

  const renderDeleteRowButton = useCallback(
    (rowId: string, rowType: "manual" | "task") => {
      const deleteRowId = `${rowType}:${rowId}`;
      const confirming = pendingDeleteRowId === deleteRowId;

      return (
        <button
          type="button"
          aria-label={confirming ? "Confirm remove to-do" : "Remove to-do"}
          onClick={(event) => {
            event.stopPropagation();
            handleDeleteRowAction(rowId, rowType);
          }}
          tabIndex={open ? 0 : -1}
          className={clsx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-transparent p-0 outline-none transition focus-visible:ring-2 focus-visible:ring-white/30",
            confirming
              ? "text-emerald-200/72 hover:text-emerald-100"
              : "text-white/24 hover:text-white/48"
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={confirming ? "check" : "x"}
              initial={
                prefersReducedMotion ? false : { opacity: 0, scale: 0.72 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={
                prefersReducedMotion ? undefined : { opacity: 0, scale: 0.72 }
              }
              transition={{ duration: prefersReducedMotion ? 0 : 0.14 }}
              className="flex h-3.5 w-3.5 items-center justify-center"
            >
              {confirming ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
              ) : (
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </motion.span>
          </AnimatePresence>
        </button>
      );
    },
    [
      handleDeleteRowAction,
      open,
      pendingDeleteRowId,
      prefersReducedMotion,
    ]
  );

  const renderSkillPicker = useCallback(
    (
      rowKey: MyListRowKey,
      selectedSkillId: string | null,
      onSelect: (skill: SkillRow) => void
    ) =>
      activeSkillPickerRowKey === rowKey ? (
        <div
          role="listbox"
          aria-label="Choose Skill"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-64 max-w-[calc(100vw-3rem)] rounded-[1.1rem] border border-white/10 bg-zinc-950/94 p-2 text-white shadow-[0_18px_40px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            value={manualSkillSearch}
            onChange={(event) => setManualSkillSearch(event.target.value)}
            placeholder="Search skills"
            className="h-8 w-full rounded-full border border-white/10 bg-black/35 px-3 text-xs text-white placeholder:text-white/35 outline-none focus:border-white/25"
            aria-label="Search skills"
            tabIndex={open ? 0 : -1}
          />
          <div className="mt-2 max-h-[min(16rem,calc(100vh-14rem))] touch-pan-y overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
            {manualSkillGroups.length === 0 ? (
              <div className="px-2 py-3 text-xs text-white/40">
                No skills found.
              </div>
            ) : (
              <div className="grid gap-2">
                {manualSkillGroups.map((group) => (
                  <div key={group.id} className="grid gap-1">
                    <div className="px-2.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/35">
                      {group.label}
                    </div>
                    {group.skills.map((skill) => {
                      const selected = selectedSkillId === skill.id;
                      const icon = (skill.icon ?? "").trim() || "✦";
                      const name = skill.name?.trim() || "Untitled skill";
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(skill);
                          }}
                          tabIndex={open ? 0 : -1}
                          className={clsx(
                            "flex h-9 w-full items-center gap-2 rounded-full px-2.5 text-left text-xs transition",
                            selected
                              ? "bg-white/[0.16] text-white"
                              : "text-white/75 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/30 text-sm leading-none">
                            {icon}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null,
    [
      activeSkillPickerRowKey,
      manualSkillGroups,
      manualSkillSearch,
      open,
    ]
  );

  const renderPriorityPicker = useCallback(
    (
      rowKey: MyListRowKey,
      selectedPriorityId: PriorityBucketId,
      onSelect: (priorityId: PriorityBucketId) => void
    ) =>
      activePriorityPickerRowKey === rowKey ? (
        <div
          role="listbox"
          aria-label="Choose priority"
          className="absolute right-0 top-[calc(100%+0.45rem)] z-30 w-44 rounded-[1.05rem] border border-white/10 bg-zinc-950/94 p-1.5 text-white shadow-[0_18px_40px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="grid gap-1">
            {QUICK_CREATE_PRIORITY_OPTIONS.map((option) => {
              const selected = selectedPriorityId === option.id;
              const symbol =
                option.symbol || QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(option.id);
                  }}
                  tabIndex={open ? 0 : -1}
                  className={clsx(
                    "flex h-8 w-full items-center gap-2 rounded-full border px-2 text-left text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35",
                    selected
                      ? "border-white/22 bg-white/[0.12] text-white"
                      : "border-transparent bg-transparent text-white/68 hover:bg-white/[0.08] hover:text-white"
                  )}
                >
                  <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 text-[10px] font-black leading-none text-white/72">
                    {symbol}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null,
    [activePriorityPickerRowKey, open]
  );

  const expandSheet = useCallback(() => {
    if (open) setIsExpanded(true);
  }, [open]);

  const handleSheetTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      event.stopPropagation();
      sheetTouchStartYRef.current = event.touches[0]?.clientY ?? null;
    },
    []
  );

  const handleSheetTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (!open || isExpanded) return;

      const startY = sheetTouchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY === null || currentY === undefined) return;

      const upwardDragDistance = startY - currentY;
      if (upwardDragDistance > 18) {
        expandSheet();
      }
    },
    [expandSheet, isExpanded, open]
  );

  const handleSheetTouchEnd = useCallback(() => {
    sheetTouchStartYRef.current = null;
  }, []);

  const handleSheetWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (!open || isExpanded) return;

      const scrollElement = sheetScrollRef.current;
      const nearTop = !scrollElement || scrollElement.scrollTop <= 8;
      if (event.deltaY > 8 && nearTop) {
        event.preventDefault();
        if (scrollElement) scrollElement.scrollTop = 0;
        expandSheet();
      }
    },
    [expandSheet, isExpanded, open]
  );

  const isMobileKeyboardFocus = useCallback(() => {
    if (typeof window === "undefined") return false;

    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const hasCoarsePointer =
      window.matchMedia?.("(pointer: coarse)").matches ?? false;

    return (
      Boolean(window.visualViewport) && hasCoarsePointer && viewportWidth < 768
    );
  }, []);

  const handleSheetFocusCapture = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      if (!open || isExpanded || activeView !== "list") return;
      if (!isMobileKeyboardFocus()) return;

      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!sheetRootRef.current?.contains(target)) return;
      if (!target.matches(MY_LIST_EDITABLE_TARGET_SELECTOR)) return;

      setIsExpanded(true);
    },
    [activeView, isExpanded, isMobileKeyboardFocus, open]
  );

  const isEditableElementFocusedInsideSheet = useCallback(() => {
    if (typeof document === "undefined") return false;

    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return false;
    if (!sheetRootRef.current?.contains(activeElement)) return false;

    return activeElement.matches(MY_LIST_EDITABLE_TARGET_SELECTOR);
  }, []);

  useEffect(() => {
    const measureSafeAreaTop = () => {
      if (typeof document === "undefined") return 0;

      const probe = document.createElement("div");
      probe.style.position = "fixed";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      probe.style.height = "env(safe-area-inset-top, 0px)";
      probe.style.width = "0";
      document.body.appendChild(probe);
      const safeAreaTop = probe.getBoundingClientRect().height;
      probe.remove();

      return Number.isFinite(safeAreaTop) ? safeAreaTop : 0;
    };

    const calculateSheetHeights = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const lastMeasuredViewport = lastMeasuredViewportRef.current;
      const widthChanged =
        !lastMeasuredViewport ||
        Math.abs(lastMeasuredViewport.width - viewportWidth) >= 0.5;
      const heightChanged =
        !lastMeasuredViewport ||
        Math.abs(lastMeasuredViewport.height - viewportHeight) >= 0.5;
      const isKeyboardResizeInsideSheet =
        heightChanged &&
        !widthChanged &&
        isEditableElementFocusedInsideSheet();

      if (isKeyboardResizeInsideSheet) return;

      lastMeasuredViewportRef.current = {
        width: viewportWidth,
        height: viewportHeight,
      };

      const rootFontSize =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const compact = Math.min(viewportHeight * 0.58, 28 * rootFontSize);
      const scheduleTopReserve = Math.max(
        4.75 * rootFontSize,
        measureSafeAreaTop() + 3.75 * rootFontSize
      );
      const fullTopReserve = Math.max(
        2.5 * rootFontSize,
        measureSafeAreaTop() + 1.5 * rootFontSize
      );
      const topReserve = useFullExpandedHeight
        ? fullTopReserve
        : scheduleTopReserve;
      const expanded = Math.max(compact, viewportHeight - topReserve);

      setMyListSheetHeights((currentHeights) => {
        if (
          Math.abs(currentHeights.compact - compact) < 0.5 &&
          Math.abs(currentHeights.expanded - expanded) < 0.5
        ) {
          return currentHeights;
        }

        return { compact, expanded };
      });
    };

    calculateSheetHeights();
    window.addEventListener("resize", calculateSheetHeights);
    window.visualViewport?.addEventListener("resize", calculateSheetHeights);

    return () => {
      window.removeEventListener("resize", calculateSheetHeights);
      window.visualViewport?.removeEventListener(
        "resize",
        calculateSheetHeights
      );
    };
  }, [isEditableElementFocusedInsideSheet, useFullExpandedHeight]);

  useEffect(() => {
    if (!open) {
      setIsExpanded(false);
      setActiveSkillPickerRowKey(null);
      setActivePriorityPickerRowKey(null);
      setManualSkillSearch("");
      setPendingDeleteRowId(null);
      setActiveView("list");
    }
  }, [open]);

  useEffect(() => {
    if (open && activeView === "list" && shouldExpandListOnOpen) {
      setIsExpanded(true);
    }
  }, [activeView, open, shouldExpandListOnOpen]);

  return (
    <motion.aside
      ref={sheetRootRef}
      aria-label="My List"
      data-no-tab-swipe
      data-my-list-sheet
      className={clsx(
        "fixed inset-x-0 bottom-0 z-[150] w-full sm:mx-auto sm:max-w-[34rem] sm:px-4",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      initial={false}
      animate={{ y: open ? 0 : "calc(100% - 2px)" }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 245, damping: 30, mass: 0.9 }
      }
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onTouchStart={(event) => {
        event.stopPropagation();
      }}
      onTouchMove={(event) => {
        if (open) event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onFocusCapture={handleSheetFocusCapture}
    >
      {!open ? (
        <button
          type="button"
          aria-label="Open My List"
          aria-expanded={open}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (shouldExpandOnOpen) setIsExpanded(true);
            onOpenChange(true);
          }}
          className="pointer-events-auto absolute left-1/2 top-0 flex h-[1.95rem] w-[4.75rem] -translate-x-1/2 -translate-y-[calc(1.35rem+0.375rem)] flex-col items-center justify-center gap-0.5 rounded-t-[1.25rem] border-x border-t border-white/14 bg-[#050507]/94 pb-1 pt-0.5 text-white/72 shadow-[0_-8px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)] outline-none backdrop-blur-2xl transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
        >
          <ChevronUp
            className="h-3.5 w-3.5 transition-transform duration-200"
            strokeWidth={2.2}
            aria-hidden="true"
          />
          <span className="text-[0.55rem] font-semibold leading-none tracking-[0.08em] text-white/58">
            My List
          </span>
        </button>
      ) : isExpanded ? (
        <button
          type="button"
          aria-label="Close My List"
          aria-expanded={open}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setIsExpanded(false);
            onOpenChange(false);
          }}
          className="pointer-events-auto absolute left-1/2 top-0 flex h-6 w-16 -translate-x-1/2 -translate-y-[1.35rem] items-center justify-center rounded-t-[1.25rem] border-x border-t border-white/14 bg-[#050507]/94 text-white/72 shadow-[0_-8px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)] outline-none backdrop-blur-2xl transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
        </button>
      ) : (
        <div
          role="group"
          aria-label="My List size controls"
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 top-0 flex h-6 w-16 -translate-x-1/2 -translate-y-[1.35rem] items-center justify-center overflow-hidden rounded-t-[1.25rem] border-x border-t border-white/14 bg-[#050507]/94 text-white/64 shadow-[0_-8px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl"
        >
          <button
            type="button"
            aria-label="Expand My List"
            aria-expanded={isExpanded}
            onPointerDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsExpanded(true);
            }}
            className="pointer-events-auto flex h-full flex-1 items-center justify-center bg-transparent p-0 text-white/72 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
          >
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Close My List"
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation();
              onOpenChange(false);
            }}
            className="flex h-full flex-1 items-center justify-center bg-transparent p-0 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      )}
      <motion.div
        aria-hidden={!open}
        className="flex flex-col overflow-hidden rounded-t-[1.65rem] border border-b-0 border-white/[0.095] bg-[#070708]/90 text-white shadow-[0_-24px_70px_-18px_rgba(0,0,0,0.95),0_-8px_28px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.075)] backdrop-blur-2xl"
        initial={false}
        animate={{
          height: currentSheetHeight,
          maxHeight: currentSheetHeight,
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 220, damping: 34, mass: 0.9 }
        }
        style={{
          paddingBottom: "calc(0.8rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="relative border-b border-white/[0.07] bg-black/[0.18] px-4 pb-1.5 pt-1.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.025)] sm:px-5">
          <button
            type="button"
            aria-label={
              activeView === "list" ? "Show Matrix view" : "Show My List view"
            }
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onTouchStart={(event) => {
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setActiveSkillPickerRowKey(null);
              setActivePriorityPickerRowKey(null);
              setPendingDeleteRowId(null);
              if (activeView === "list") {
                onOpenChange(true);
                setIsExpanded(true);
                setActiveView("matrix");
                return;
              }

              setActiveView("list");
            }}
            tabIndex={open ? 0 : -1}
            className="absolute left-4 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg border border-white/[0.08] bg-black/24 p-0 text-white/54 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] outline-none transition hover:border-white/[0.14] hover:bg-white/[0.055] hover:text-white/84 focus-visible:ring-2 focus-visible:ring-white/35 sm:left-5"
          >
            {activeView === "list" ? (
              <Grid2x2
                className="h-3.5 w-3.5"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            ) : (
              <List
                className="h-3.5 w-3.5"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            )}
          </button>
          <h2 className="text-center text-[0.72rem] font-semibold leading-none tracking-[0.08em] text-white/90">
            {activeView === "list" ? "My List" : "MATRIX"}
          </h2>
          {activeView === "list" ? (
            <button
              type="button"
              aria-label="Add My List to-do"
              onClick={(event) => {
                event.stopPropagation();
                addManualRow();
              }}
              tabIndex={open ? 0 : -1}
              className="absolute right-4 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center bg-transparent p-0 text-white/58 outline-none transition hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/35 sm:right-5"
            >
              <Plus
                className="h-3.5 w-3.5"
                strokeWidth={2.2}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </div>
        <div
          ref={sheetScrollRef}
          className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch] sm:px-5"
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
          onTouchCancel={handleSheetTouchEnd}
          onWheel={handleSheetWheel}
        >
          {activeView === "list" ? (
            <>
          <div className="space-y-1.5">
            {hasListRows ? (
              <>
                {visibleTasks.map((task) => {
                  const done =
                    task.stage?.toString().toUpperCase() === "PERFECT";
                  const pending = pendingTaskIds.has(task.id);
                  const taskSkill = resolveTaskSkillMetadata(task);
                  const priorityId = resolveTaskPriorityId(task);
                  const priorityOption =
                    QUICK_CREATE_PRIORITY_OPTIONS.find(
                      (option) => option.id === priorityId
                    ) ?? defaultPriority;
                  const prioritySymbol =
                    priorityOption.symbol ||
                    QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL;
                  const taskText = taskOverrides[task.id]?.text ?? task.name;
                  const checkboxId = `my-list-task-${task.id}`;
                  const rowKey = `task:${task.id}` as const;

                  return (
                    <div
                      key={task.id}
                      className={clsx(
                        "flex min-h-9 items-center gap-2 rounded-lg bg-transparent py-2 pl-3 pr-1.5 text-sm text-white/84 transition-colors hover:bg-white/[0.035]",
                        pending && "opacity-60"
                      )}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={done}
                        disabled={pending}
                        onChange={() => {
                          setPendingDeleteRowId(null);
                          onToggleTask(task.id);
                        }}
                        tabIndex={open ? 0 : -1}
                        className="peer sr-only disabled:cursor-wait"
                      />
                      <label
                        htmlFor={checkboxId}
                        aria-label={
                          done ? "Mark to-do incomplete" : "Mark to-do complete"
                        }
                        className={clsx(
                          "relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[0.32rem] border transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950",
                          done
                            ? "shimmer-border-complete focus-pomo-start-glint isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white shadow-[0_8px_16px_rgba(3,83,45,0.24),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45"
                            : "border-white/16 bg-black/24 text-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        )}
                      >
                        <span
                          className={clsx(
                            "h-2 w-1.5 rotate-45 border-b-2 border-r-2 border-current transition-opacity",
                            done ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </label>
                      <div className="relative h-4 w-4 shrink-0">
                        <button
                          type="button"
                          aria-label={
                            taskSkill.skillName
                              ? `Change Skill: ${taskSkill.skillName}`
                              : "Choose Skill"
                          }
                          aria-haspopup="listbox"
                          aria-expanded={activeSkillPickerRowKey === rowKey}
                          title={taskSkill.skillName ?? "Choose Skill"}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActivePriorityPickerRowKey(null);
                            setManualSkillSearch("");
                            setActiveSkillPickerRowKey((currentRowKey) =>
                              currentRowKey === rowKey ? null : rowKey
                            );
                          }}
                          tabIndex={open ? 0 : -1}
                          className={clsx(
                            "flex h-4 w-4 items-center justify-center bg-transparent p-0 text-center text-[0.78rem] leading-none text-white/70 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35",
                            done && "text-white/42"
                          )}
                        >
                          {taskSkill.skillIcon}
                        </button>
                        {renderSkillPicker(rowKey, taskSkill.skillId, (skill) =>
                          handleTaskSkillSelect(task.id, skill)
                        )}
                      </div>
                      <input
                        type="text"
                        value={taskText}
                        onPointerDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          const nextText = event.target.value;
                          setTaskOverrides((currentOverrides) => ({
                            ...currentOverrides,
                            [task.id]: {
                              ...currentOverrides[task.id],
                              text: nextText,
                            },
                          }));
                        }}
                        placeholder="To-do"
                        aria-label="To-do text"
                        tabIndex={open ? 0 : -1}
                        className={clsx(
                          "min-w-0 flex-1 bg-transparent p-0 leading-snug text-white/84 outline-none placeholder:text-white/30",
                          done && "text-white/42 line-through"
                        )}
                      />
                      <div className="-mr-0.5 flex shrink-0 items-center gap-0.5">
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            aria-label={`Choose priority: ${priorityOption.label}`}
                            aria-haspopup="listbox"
                            aria-expanded={activePriorityPickerRowKey === rowKey}
                            title={priorityOption.label}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveSkillPickerRowKey(null);
                              setActivePriorityPickerRowKey((currentRowKey) =>
                                currentRowKey === rowKey ? null : rowKey
                              );
                            }}
                            tabIndex={open ? 0 : -1}
                            className={clsx(
                              "flex h-7 min-w-7 items-center justify-center rounded-full border border-white/8 bg-black/20 px-1 text-[10px] font-black leading-none text-white/46 outline-none transition hover:border-white/14 hover:bg-white/[0.055] hover:text-white/72 focus-visible:ring-2 focus-visible:ring-white/35",
                              done && "text-white/42"
                            )}
                          >
                            <span className="max-w-8 truncate">
                              {prioritySymbol}
                            </span>
                          </button>
                          {renderPriorityPicker(rowKey, priorityId, (nextId) =>
                            handlePrioritySelect(task.id, "task", nextId)
                          )}
                        </div>
                        {renderDeleteRowButton(task.id, "task")}
                      </div>
                    </div>
                  );
                })}
                {manualRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex min-h-9 items-center gap-2 rounded-lg bg-transparent py-2 pl-3 pr-1.5 text-sm text-white/84 transition-colors hover:bg-white/[0.035]"
                  >
                    <input
                      id={`my-list-${row.id}`}
                      type="checkbox"
                      checked={row.done}
                      onChange={(event) =>
                        updateManualRow(row.id, { done: event.target.checked })
                      }
                      tabIndex={open ? 0 : -1}
                      className="peer sr-only"
                    />
                    <label
                      htmlFor={`my-list-${row.id}`}
                      aria-label={
                        row.done ? "Mark to-do incomplete" : "Mark to-do complete"
                      }
                      className={clsx(
                        "relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[0.32rem] border transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950",
                        row.done
                          ? "shimmer-border-complete focus-pomo-start-glint isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white shadow-[0_8px_16px_rgba(3,83,45,0.24),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45"
                          : "border-white/16 bg-black/24 text-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      )}
                    >
                      <span
                        className={clsx(
                          "h-2 w-1.5 rotate-45 border-b-2 border-r-2 border-current transition-opacity",
                          row.done ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </label>
                    <div className="relative h-4 w-4 shrink-0">
                      <button
                        type="button"
                        aria-label={
                          row.skillName
                            ? `Change Skill: ${row.skillName}`
                            : "Choose Skill"
                        }
                        aria-haspopup="listbox"
                        aria-expanded={
                          activeSkillPickerRowKey === `manual:${row.id}`
                        }
                        title={row.skillName ?? "Choose Skill"}
                        onClick={(event) => {
                          event.stopPropagation();
                          setActivePriorityPickerRowKey(null);
                          setManualSkillSearch("");
                          setActiveSkillPickerRowKey((currentRowKey) =>
                            currentRowKey === `manual:${row.id}`
                              ? null
                              : `manual:${row.id}`
                          );
                        }}
                        tabIndex={open ? 0 : -1}
                        className={clsx(
                          "flex h-4 w-4 items-center justify-center bg-transparent p-0 text-center text-[0.78rem] leading-none text-white/70 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35",
                          !row.skillIcon.trim() && "text-white/36",
                          row.done && "text-white/42"
                        )}
                      >
                        {row.skillIcon.trim() || "✦"}
                      </button>
                      {renderSkillPicker(
                        `manual:${row.id}`,
                        row.skillId,
                        (skill) => handleManualSkillSelect(row.id, skill)
                      )}
                    </div>
                    <input
                      type="text"
                      value={row.text}
                      onPointerDown={(event) => event.stopPropagation()}
                      onTouchStart={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        updateManualRow(row.id, { text: event.target.value })
                      }
                      placeholder="To-do"
                      aria-label="To-do text"
                      tabIndex={open ? 0 : -1}
                      className={clsx(
                        "min-w-0 flex-1 bg-transparent p-0 leading-snug text-white/84 outline-none placeholder:text-white/30",
                        row.done && "text-white/42 line-through"
                      )}
                    />
                    <div className="-mr-0.5 flex shrink-0 items-center gap-0.5">
                      {(() => {
                        const priorityOption =
                          QUICK_CREATE_PRIORITY_OPTIONS.find(
                            (option) => option.id === row.priorityId
                          ) ?? defaultPriority;
                        const prioritySymbol =
                          priorityOption.symbol ||
                          QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL;
                        const rowKey = `manual:${row.id}` as const;

                        return (
                          <>
                            <div className="relative shrink-0">
                              <button
                                type="button"
                                aria-label={`Choose priority: ${priorityOption.label}`}
                                aria-haspopup="listbox"
                                aria-expanded={
                                  activePriorityPickerRowKey === rowKey
                                }
                                title={priorityOption.label}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveSkillPickerRowKey(null);
                                  setActivePriorityPickerRowKey(
                                    (currentRowKey) =>
                                      currentRowKey === rowKey ? null : rowKey
                                  );
                                }}
                                tabIndex={open ? 0 : -1}
                                className={clsx(
                                  "flex h-7 min-w-7 items-center justify-center rounded-full border border-white/8 bg-black/20 px-1 text-[10px] font-black leading-none text-white/46 outline-none transition hover:border-white/14 hover:bg-white/[0.055] hover:text-white/72 focus-visible:ring-2 focus-visible:ring-white/35",
                                  row.done && "text-white/42"
                                )}
                              >
                                <span className="max-w-8 truncate">
                                  {prioritySymbol}
                                </span>
                              </button>
                              {renderPriorityPicker(
                                rowKey,
                                row.priorityId,
                                (nextId) =>
                                  handlePrioritySelect(row.id, "manual", nextId)
                              )}
                            </div>
                            {renderDeleteRowButton(row.id, "manual")}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="rounded-lg bg-transparent px-3 py-2.5 text-sm text-white/42">
                No To-Dos yet.
              </div>
            )}
          </div>
          <div className="border-t border-white/[0.055] pt-2">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Notes..."
              tabIndex={open ? 0 : -1}
              className="min-h-24 w-full resize-none rounded-lg bg-transparent px-3 py-2 text-sm leading-relaxed text-white/86 outline-none placeholder:text-white/30 focus:bg-white/[0.025]"
            />
          </div>
            </>
          ) : (
            <MatrixContent variant="sheet" />
          )}
        </div>
      </motion.div>
    </motion.aside>
  );
}
