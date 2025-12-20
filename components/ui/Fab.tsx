"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type HTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { Loader2, Plus, Search, X } from "lucide-react";
import { EventModal } from "./EventModal";
import { NoteModal } from "./NoteModal";
import { ComingSoonModal } from "./ComingSoonModal";
import { PostModal } from "./PostModal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

export function Fab({
  className = "",
  menuVariant = "default",
  swipeUpToOpen = false,
  ...wrapperProps
}: FabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [modalEventType, setModalEventType] = useState<
    "GOAL" | "PROJECT" | "TASK" | "HABIT" | null
  >(null);
  const [showNote, setShowNote] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [menuPage, setMenuPage] = useState(0);
  const [pageDirection, setPageDirection] = useState<1 | -1>(1);
  const [menuSection, setMenuSection] = useState<"content" | "blank">(
    "content"
  );
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FabSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] =
    useState<FabSearchResult | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const skipClickRef = useRef(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const router = useRouter();
  const VERTICAL_WHEEL_TRIGGER = 20;
  const DRAG_THRESHOLD_PX = 80;

  const getResultSortValue = useCallback((item: FabSearchResult) => {
    if (item.isCompleted) return Number.POSITIVE_INFINITY;
    const candidate =
      item.nextScheduledAt ?? (item.type === "HABIT" ? item.nextDueAt : null);
    if (!candidate) return Number.POSITIVE_INFINITY;
    const parsed = Date.parse(candidate);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
  }, []);

  const sortSearchResults = useCallback(
    (items: FabSearchResult[]) =>
      [...items].sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) {
          return a.isCompleted ? 1 : -1;
        }
        const timeA = getResultSortValue(a);
        const timeB = getResultSortValue(b);
        if (timeA === timeB) {
          return a.name.localeCompare(b.name);
        }
        return timeA - timeB;
      }),
    [getResultSortValue]
  );

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
    setSearchError(null);
    setIsSearching(false);
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
  }, []);

  const getMenuBackgroundStyles = () => {
    const palettes =
      menuPage === 0
        ? {
            base: [55, 65, 81],
            highlight: [90, 110, 135],
            lowlight: [25, 30, 40],
          }
        : {
            base: [8, 17, 28],
            highlight: [50, 80, 120],
            lowlight: [2, 4, 10],
          };
    const [r, g, b] = palettes.base;

    return {
      backgroundImage: `radial-gradient(circle at top, rgba(${palettes.highlight[0]}, ${palettes.highlight[1]}, ${palettes.highlight[2]}, 0.65), rgba(${r}, ${g}, ${b}, 0.15) 45%), linear-gradient(160deg, rgba(${palettes.highlight[0]}, ${palettes.highlight[1]}, ${palettes.highlight[2]}, 0.95) 0%, rgba(${r}, ${g}, ${b}, 0.97) 50%, rgba(${palettes.lowlight[0]}, ${palettes.lowlight[1]}, ${palettes.lowlight[2]}, 0.98) 100%)`,
      boxShadow:
        "0 18px 36px rgba(15, 23, 42, 0.55), 0 8px 18px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      borderColor: `rgba(${palettes.highlight[0]}, ${palettes.highlight[1]}, ${palettes.highlight[2]}, 0.35)`,
    };
  };

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
    enter: (direction: 1 | -1) => ({
      x: direction === 1 ? "100%" : "-100%",
    }),
    center: {
      x: "0%",
    },
    exit: (direction: 1 | -1) => ({
      x: direction === 1 ? "-100%" : "100%",
    }),
  };

  const handleEventClick = (
    eventType: "GOAL" | "PROJECT" | "TASK" | "HABIT"
  ) => {
    setIsOpen(false);
    setModalEventType(eventType);
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
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
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
    if (diffY < -40) {
      if (!isOpen) {
        setIsOpen(true);
      } else if (menuSection === "content") {
        setMenuSection("blank");
      }
      skipClickRef.current = true;
      return;
    }
    if (isOpen && diffY > 40 && menuSection === "blank") {
      setMenuSection("content");
      skipClickRef.current = true;
      return;
    }
  };

  const handleFabButtonTouchCancel = () => {
    if (!swipeUpToOpen) return;
    setTouchStartY(null);
  };

  const handleFabButtonWheel = (event: React.WheelEvent<HTMLButtonElement>) => {
    if (isOpen) {
      if (
        Math.abs(event.deltaY) >= VERTICAL_WHEEL_TRIGGER &&
        ((menuSection === "content" && event.deltaY < 0) ||
          (menuSection === "blank" && event.deltaY > 0))
      ) {
        setMenuSection(event.deltaY < 0 ? "blank" : "content");
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
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
    if (Math.abs(event.deltaY) >= VERTICAL_WHEEL_TRIGGER) {
      if (event.deltaY < 0 && menuSection === "content") {
        setMenuSection("blank");
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.deltaY > 0 && menuSection === "blank") {
        setMenuSection("content");
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (!swipeUpToOpen) return;
    if (interpretWheelGesture(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const changeMenuPage = useCallback(
    (nextPage: 0 | 1) => {
      setMenuPage((prev) => {
        if (prev === nextPage) {
          return prev;
        }
        setPageDirection(nextPage > prev ? 1 : -1);
        return nextPage;
      });
    },
    []
  );

  const handlePageDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (menuSection !== "content") {
        return;
      }
      if (info.offset.x < -DRAG_THRESHOLD_PX && menuPage === 0) {
        changeMenuPage(1);
        return;
      }
      if (info.offset.x > DRAG_THRESHOLD_PX && menuPage === 1) {
        changeMenuPage(0);
      }
    },
    [changeMenuPage, menuPage, menuSection]
  );

  const handleCloseReschedule = () => {
    if (isSavingReschedule || isDeletingEvent) return;
    setRescheduleTarget(null);
    setRescheduleError(null);
    setDeleteError(null);
  };

  useEffect(() => {
    if (!isOpen) {
      setMenuSection("content");
      setMenuPage(0);
      setPageDirection(1);
      resetSearchState();
      setRescheduleTarget(null);
      setDeleteError(null);
      setIsDeletingEvent(false);
    }
  }, [isOpen, resetSearchState]);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen || menuSection !== "content") return;
    const node = menuRef.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0) {
        setMenuWidth(rect.width);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, menuSection, primary.length, secondary.length]);

  useEffect(() => {
    if (!isOpen || menuSection !== "blank") {
      return;
    }
    if (typeof window === "undefined") return;

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);

    const timer = window.setTimeout(async () => {
      try {
        const trimmed = searchQuery.trim();
        const params = new URLSearchParams();
        if (trimmed.length > 0) {
          params.set("q", trimmed);
        }
        const url =
          params.toString().length > 0
            ? `/api/schedule/search?${params.toString()}`
            : "/api/schedule/search";
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        const payload = (await response.json()) as {
          results?: FabSearchResult[];
        };
        if (!controller.signal.aborted) {
          setSearchResults(sortSearchResults(payload.results ?? []));
        }
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
    };
  }, [isOpen, menuSection, searchQuery, sortSearchResults]);

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
        sortSearchResults(
          prev.map((item) =>
            item.id === rescheduleTarget.id &&
            item.type === rescheduleTarget.type
              ? {
                  ...item,
                  nextScheduledAt: nextStart,
                  scheduleInstanceId: nextInstanceId,
                  durationMinutes: nextDuration,
                }
              : item
          )
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
    sortSearchResults,
    notifySchedulerOfChange,
  ]);

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
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, rescheduleTarget]);

  const menuBackgroundStyles = getMenuBackgroundStyles();
  const { backgroundImage, ...menuChromeStyles } = menuBackgroundStyles;

  return (
    <div className={cn("relative", className)} {...wrapperProps}>
      {/* AddEvents Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            className={cn(
              "absolute bottom-20 mb-2 z-50 min-w-[200px] border rounded-lg shadow-2xl overflow-hidden",
              menuClassName
            )}
            style={{
              ...menuChromeStyles,
              transition: "border-color 0.1s linear",
              transformOrigin:
                menuVariant === "timeline" ? "bottom right" : "bottom center",
              minHeight: menuContainerHeight,
              height: menuContainerHeight,
              maxHeight: menuContainerHeight,
              minWidth: menuWidth ?? undefined,
              width: menuWidth ?? undefined,
              maxWidth: menuWidth ?? undefined,
            }}
            variants={menuVariants}
            initial="closed"
            animate="open"
            exit="closed"
            onWheel={handleMenuWheel}
          >
            {menuSection === "blank" ? (
              <FabNexus
                query={searchQuery}
                onQueryChange={setSearchQuery}
                results={searchResults}
                isSearching={isSearching}
                error={searchError}
                onSelectResult={handleOpenReschedule}
              />
            ) : (
              <>
                <div
                  className="relative h-full w-full px-4 py-2"
                  style={{
                    backgroundImage,
                    borderRadius: "inherit",
                  }}
                >
                  <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
                    {/* Single-viewport pager: pages slide in/out iOS-style; no horizontal scroll so side peeks are impossible. */}
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={`fab-page-${menuPage}`}
                        className="absolute inset-0 flex"
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.08}
                        onDragEnd={handlePageDragEnd}
                        variants={pageVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        custom={pageDirection}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                      >
                        {menuPage === 0 ? (
                          <div className="flex w-full flex-col">
                            {primary.map((event) => (
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
                                <span className="text-lg font-bold">
                                  {event.label}
                                </span>
                              </motion.button>
                            ))}
                          </div>
                        ) : (
                          <div className="flex w-full flex-col">
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
                                <span className="text-lg font-bold">
                                  {event.label}
                                </span>
                              </motion.button>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </>
            )}
          </motion.div>
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
  error: string | null;
  onSelectResult: (result: FabSearchResult) => void;
};

function FabNexus({
  query,
  onQueryChange,
  results,
  isSearching,
  error,
  onSelectResult,
}: FabNexusProps) {
  const hasResults = results.length > 0;

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
      className="flex h-full w-full flex-col gap-3 px-4 py-4 text-white"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="search NEXUS"
          className="h-10 w-full rounded-lg border border-white/10 bg-black/60 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
          aria-label="Search NEXUS"
        />
      </div>
      <div className="flex-1 overflow-y-auto pr-1">
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
          className="fixed inset-0 z-[2147483647] bg-black/60 backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
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
                      className="text-white/70 hover:bg-white/10"
                      disabled={disableActions}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={onSave}
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
