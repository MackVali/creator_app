"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BatteryCharging,
  Flame,
  MoreHorizontal,
  Plus,
  Timer,
} from "lucide-react";

import ActivityPanel from "./ActivityPanel";
import FocusPomo, { type FocusPomoSource } from "@/components/focus/FocusPomo";
import { MonumentGoalsList } from "@/components/monuments/MonumentGoalsList";
import { MonumentRelatedHabits } from "@/components/monuments/MonumentRelatedHabits";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";
import type { MonumentNote } from "@/lib/types/monument-note";
import { cn } from "@/lib/utils";
import MonumentEditDialog from "@/components/monuments/MonumentEditDialog";
import {
  segmentedToggleActiveClassName,
  segmentedToggleButtonClassName,
  segmentedToggleContainerClassName,
  segmentedToggleInactiveClassName,
} from "@/components/ui/segmented-toggle-styles";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export interface MonumentDetailMonument {
  id: string;
  title: string;
  emoji: string | null;
}

interface MonumentDetailProps {
  monument: MonumentDetailMonument;
  notes?: MonumentNote[];
  onClose?: () => void;
}

type MonumentView = "goals" | "roadmap";
const PULL_EXIT_ACTIVATION_PX = 8;
const PULL_EXIT_TOUCH_ACTIVATION_PX = 5;
const PULL_EXIT_THRESHOLD_PX = 128;
const PULL_EXIT_FLICK_VELOCITY = 0.65;
const PULL_EXIT_FLICK_MIN_DISTANCE_PX = 32;

function getScrollParent(element: HTMLElement | null) {
  let current = element?.parentElement ?? null;

  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    const canScrollY =
      /(auto|scroll|overlay)/.test(overflowY) &&
      current.scrollHeight > current.clientHeight;

    if (canScrollY) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function MonumentRoadmapEmptyState() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#080A0F] px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.34)] sm:px-5 sm:py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">
            Start this roadmap
          </h2>
          <p className="mt-1 max-w-sm text-xs leading-5 text-[#A7B0BD]">
            Add the first goal to give this monument a clear next step.
          </p>
        </div>
        <Link
          href="/goals"
          className="inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.11] sm:w-auto"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add Goal
        </Link>
      </div>
    </div>
  );
}

export function MonumentDetail({
  monument,
  notes = [],
  onClose,
}: MonumentDetailProps) {
  const { id } = monument;
  const router = useRouter();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [monumentView, setMonumentView] = useState<MonumentView>("goals");
  const [goalSection, setGoalSection] = useState<"active" | "completed">(
    "active"
  );
  const [focusPomoSource, setFocusPomoSource] =
    useState<FocusPomoSource | null>(null);
  const detailSurfaceRef = useRef<HTMLElement | null>(null);
  const detailScrollRef = useRef<HTMLElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullStartXRef = useRef<number | null>(null);
  const pullStartTimeRef = useRef<number | null>(null);
  const pullLastYRef = useRef<number | null>(null);
  const pullLastTimeRef = useRef<number | null>(null);
  const pullPointerIdRef = useRef<number | null>(null);
  const pullGestureAllowedRef = useRef(false);
  const pullDragActiveRef = useRef(false);
  const pullSnapAnimationRef = useRef<AnimationPlaybackControls | null>(null);
  const pullY = useMotionValue(0);
  const pullExitBlocked =
    editDialogOpen || actionsMenuOpen || Boolean(focusPomoSource);

  useEffect(() => {
    setMonumentView("goals");
    setGoalSection("active");
  }, [id]);

  useEffect(() => {
    detailScrollRef.current = getScrollParent(detailSurfaceRef.current);
  }, []);

  useEffect(() => {
    return () => {
      pullSnapAnimationRef.current?.stop();
    };
  }, []);

  const containerShell =
    "relative w-full rounded-3xl border border-white/10";
  const sectionBackground =
    "bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] shadow-[0_28px_90px_-48px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.035)]";
  const overviewBackground =
    "bg-[linear-gradient(145deg,#06070A_0%,#08090B_56%,#0D0E11_100%)] shadow-[0_35px_120px_-45px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.04)]";

  const quickFacts = [
    {
      label: "Streak",
      value: "0 days",
      description: "Build consistency to light this up.",
      icon: Flame,
    },
    {
      label: "Status",
      value: "Not charging yet",
      description: "No activity has been recorded for this monument yet.",
      icon: BatteryCharging,
    },
  ] as const;

  const handleStartFocusPomo = () => {
    const source: FocusPomoSource = {
      sourceType: "monument",
      sourceId: id,
      title: monument.title,
      icon: monument.emoji,
    };

    console.info("Start focus pomo", source);
    setFocusPomoSource(source);
  };

  const handleCloseOrBack = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }

    router.back();
  }, [onClose, router]);

  const isAtTop = () => {
    const scrollContainer = detailScrollRef.current;

    if (scrollContainer) {
      return scrollContainer.scrollTop <= 2;
    }

    return window.scrollY <= 2;
  };

  const isInteractivePullTarget = (target: EventTarget | null) => {
    return (
      target instanceof HTMLElement &&
      Boolean(
        target.closest(
          "a,button,input,select,textarea,[role='button'],[role='menuitem'],[contenteditable='true']"
        )
      )
    );
  };

  const isNestedScrollablePullTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;

    let current: HTMLElement | null = target;

    while (current && current !== detailSurfaceRef.current) {
      const { overflowX, overflowY } = window.getComputedStyle(current);
      const canScrollX =
        /(auto|scroll|overlay)/.test(overflowX) &&
        current.scrollWidth > current.clientWidth + 2;
      const canScrollY =
        /(auto|scroll|overlay)/.test(overflowY) &&
        current.scrollHeight > current.clientHeight + 2;

      if (canScrollX || canScrollY) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  };

  const resetPullExit = () => {
    pullSnapAnimationRef.current?.stop();
    pullSnapAnimationRef.current = null;
    pullStartYRef.current = null;
    pullStartXRef.current = null;
    pullStartTimeRef.current = null;
    pullLastYRef.current = null;
    pullLastTimeRef.current = null;
    pullPointerIdRef.current = null;
    pullGestureAllowedRef.current = false;
    pullDragActiveRef.current = false;
  };

  const snapPullExitBack = () => {
    resetPullExit();
    pullSnapAnimationRef.current = animate(pullY, 0, {
      type: "spring",
      stiffness: 520,
      damping: 42,
      mass: 0.9,
    });
  };

  const handlePullExitStart = (event: PointerEvent<HTMLElement>) => {
    detailScrollRef.current =
      detailScrollRef.current ?? getScrollParent(detailSurfaceRef.current);
    pullSnapAnimationRef.current?.stop();

    if (
      pullExitBlocked ||
      (event.pointerType !== "touch" && event.pointerType !== "mouse") ||
      !isAtTop() ||
      isInteractivePullTarget(event.target) ||
      isNestedScrollablePullTarget(event.target)
    ) {
      resetPullExit();
      return;
    }

    pullStartYRef.current = event.clientY;
    pullStartXRef.current = event.clientX;
    pullStartTimeRef.current = event.timeStamp;
    pullLastYRef.current = event.clientY;
    pullLastTimeRef.current = event.timeStamp;
    pullPointerIdRef.current = event.pointerId;
    pullGestureAllowedRef.current = true;
    pullDragActiveRef.current = false;
  };

  const handlePullExitMove = (event: PointerEvent<HTMLElement>) => {
    const pullStartY = pullStartYRef.current;
    const pullStartX = pullStartXRef.current;
    const activationThreshold =
      event.pointerType === "touch"
        ? PULL_EXIT_TOUCH_ACTIVATION_PX
        : PULL_EXIT_ACTIVATION_PX;

    if (
      pullExitBlocked ||
      pullStartY === null ||
      pullStartX === null ||
      !pullGestureAllowedRef.current ||
      pullPointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    const deltaY = event.clientY - pullStartY;
    const deltaX = event.clientX - pullStartX;

    if (!pullDragActiveRef.current) {
      if (
        Math.abs(deltaX) > activationThreshold &&
        Math.abs(deltaX) > deltaY
      ) {
        resetPullExit();
        return;
      }

      if (deltaY < -activationThreshold) {
        resetPullExit();
        return;
      }

      if (!isAtTop() && deltaY <= activationThreshold) {
        return;
      }

      if (deltaY <= activationThreshold) {
        return;
      }

      pullDragActiveRef.current = true;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();

    const dampedDistance = Math.max(0, deltaY) * 0.86;
    pullY.set(dampedDistance);
    pullLastYRef.current = event.clientY;
    pullLastTimeRef.current = event.timeStamp;
  };

  const handlePullExitEnd = (event: PointerEvent<HTMLElement>) => {
    const pullStartY = pullStartYRef.current;
    const pullLastY = pullLastYRef.current;
    const pullStartTime = pullStartTimeRef.current;
    const pullLastTime = pullLastTimeRef.current;
    const wasDragging = pullDragActiveRef.current;

    if (
      pullPointerIdRef.current !== null &&
      event.currentTarget.hasPointerCapture(pullPointerIdRef.current)
    ) {
      event.currentTarget.releasePointerCapture(pullPointerIdRef.current);
    }

    if (
      !wasDragging ||
      pullStartY === null ||
      pullLastY === null ||
      pullStartTime === null ||
      pullLastTime === null
    ) {
      resetPullExit();
      pullY.set(0);
      return;
    }

    const pullDistance = Math.max(0, event.clientY - pullStartY);
    const recentDistance = Math.max(0, event.clientY - pullLastY);
    const recentTime = Math.max(1, event.timeStamp - pullLastTime);
    const totalTime = Math.max(1, event.timeStamp - pullStartTime);
    const velocity = Math.max(
      recentDistance / recentTime,
      pullDistance / totalTime
    );
    const shouldClose =
      pullDistance >= PULL_EXIT_THRESHOLD_PX ||
      (pullDistance >= PULL_EXIT_FLICK_MIN_DISTANCE_PX &&
        velocity >= PULL_EXIT_FLICK_VELOCITY);

    resetPullExit();

    if (shouldClose) {
      handleCloseOrBack();
      return;
    }

    snapPullExitBack();
  };

  const handleTopPullExitStart = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    handlePullExitStart(event);
  };

  const handleTopPullExitMove = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    handlePullExitMove(event);
  };

  const handleTopPullExitEnd = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    handlePullExitEnd(event);
  };

  return (
    <motion.main
      ref={detailSurfaceRef}
      className="relative overflow-x-hidden px-2.5 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-2 sm:px-6 sm:pb-10 sm:pt-4 lg:px-8"
      style={{ y: pullY, touchAction: "pan-y", willChange: "transform" }}
      onPointerDown={handlePullExitStart}
      onPointerMove={handlePullExitMove}
      onPointerUp={handlePullExitEnd}
      onPointerCancel={handlePullExitEnd}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 z-10 h-16 touch-none sm:hidden"
        style={{ touchAction: "none" }}
        onPointerDown={handleTopPullExitStart}
        onPointerMove={handleTopPullExitMove}
        onPointerUp={handleTopPullExitEnd}
        onPointerCancel={handleTopPullExitEnd}
      />
      <MonumentEditDialog
        open={editDialogOpen}
        monumentId={id}
        onOpenChange={(open) => {
          if (!open) {
            setEditDialogOpen(false);
          }
        }}
        onSaved={() => setEditDialogOpen(false)}
      />
      <FocusPomo
        open={Boolean(focusPomoSource)}
        source={focusPomoSource}
        onClose={() => setFocusPomoSource(null)}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-col gap-4 overflow-x-hidden sm:gap-6">
        <section
          className={cn(
            containerShell,
            overviewBackground,
            "overflow-hidden px-3 py-3 text-white sm:p-7",
            "min-h-0 sm:min-h-[210px]"
          )}
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-12 -top-16 h-48 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.045),_transparent_72%)] blur-3xl" />
            <div className="absolute bottom-0 right-0 h-56 w-56 translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.025),_transparent_62%)] blur-3xl" />
          </div>
          <div className="relative z-30 flex flex-row gap-4 sm:flex-row sm:items-start sm:gap-6">
            <span
              className="relative flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-white/10 bg-[#09090b] text-3xl text-white shadow-[0_14px_28px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-[72px] sm:w-[72px] sm:text-4xl"
              role="img"
              aria-label={`Monument: ${monument.title}`}
            >
              <span className="relative z-10 drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]">
                {monument.emoji || "\uD83D\uDDFC\uFE0F"}
              </span>
            </span>
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <h1 className="min-w-0 flex-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {monument.title}
                </h1>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Start focus pomo for ${monument.title}`}
                    onClick={handleStartFocusPomo}
                    className="inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <Timer className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <DropdownMenu
                    open={actionsMenuOpen}
                    onOpenChange={setActionsMenuOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Monument actions"
                        className="inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                      >
                        <MoreHorizontal
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setEditDialogOpen(true)}
                      >
                        Edit monument
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="grid gap-0.5 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap">
                {quickFacts.map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="group flex items-center gap-0.5 rounded-full border border-black bg-white/5 px-1 py-0.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur transition hover:border-black hover:bg-white/10 sm:gap-1 sm:px-2 sm:py-1"
                  >
                    <span className="flex size-3 items-center justify-center rounded-full bg-white/10 text-white/70 sm:size-5">
                      <Icon
                        className="h-1.5 w-1.5 sm:h-2.5 sm:w-2.5"
                        aria-hidden="true"
                      />
                    </span>
                    <div className="flex flex-col leading-tight">
                      <span className="text-[5px] font-semibold uppercase tracking-[0.28em] text-white/45 sm:text-[7px]">
                        {label}
                      </span>
                      <span className="text-[7px] font-semibold text-white/85 sm:text-xs">
                        {value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="grid w-full grid-cols-1 items-start gap-5 lg:gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <section
            className={cn(
              containerShell,
              sectionBackground,
              "px-3 py-4 sm:p-7",
              "min-h-[260px]",
              "z-0 overflow-visible"
            )}
          >
            <div className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.04),_transparent_58%)]" />
            <header className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div
                className={segmentedToggleContainerClassName}
                aria-label="Monument view"
              >
                {(
                  [
                    { value: "goals", label: "GOAL GRID" },
                    { value: "roadmap", label: "ROADMAP" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMonumentView(option.value)}
                    className={cn(
                      segmentedToggleButtonClassName,
                      monumentView === option.value
                        ? segmentedToggleActiveClassName
                        : segmentedToggleInactiveClassName
                    )}
                    aria-pressed={monumentView === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </header>
            <div className="relative z-10 mt-3 overflow-visible sm:mt-4">
              <MonumentGoalsList
                monumentId={id}
                monumentEmoji={monument.emoji}
                monumentView={monumentView}
                goalSection={goalSection}
                onGoalSectionChange={setGoalSection}
                roadmapEmptyState={<MonumentRoadmapEmptyState />}
              />
            </div>
          </section>

          <div className="relative z-[1] flex min-w-0 flex-col gap-5 lg:gap-6">
            <MonumentRelatedHabits monumentId={id} />

            <section
              className={cn(
                containerShell,
                sectionBackground,
                "p-4 sm:p-5",
                "min-h-[220px]",
                "z-[1] overflow-visible"
              )}
            >
              <div className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.035),_transparent_62%)]" />
              <div className="relative z-10">
                <MonumentNotesGrid monumentId={id} initialNotes={notes} />
              </div>
            </section>
          </div>

          <div className="relative z-[1] w-full xl:col-span-2">
            <ActivityPanel monumentId={id} />
          </div>
        </div>
      </div>
    </motion.main>
  );
}

export default MonumentDetail;
