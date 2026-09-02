"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
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
  Check,
  ChevronDown,
  MoreVertical,
  Plus,
  Timer,
  X,
} from "lucide-react";

import ActivityPanel from "./ActivityPanel";
import FocusPomo, { type FocusPomoSource } from "@/components/focus/FocusPomo";
import { MonumentGoalsList } from "@/components/monuments/MonumentGoalsList";
import { MonumentRelatedHabits } from "@/components/monuments/MonumentRelatedHabits";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";
import type { MonumentNote } from "@/lib/types/monument-note";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  loadMonumentEditDraft,
  saveMonumentEditDraft,
} from "@/components/monuments/MonumentEditDialog";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  getMonumentIconOrDefault,
  normalizeMonumentIconInput,
} from "@/lib/monuments/icon";
import { AREAS } from "@/config/areas";
import { useMonumentActivity } from "@/lib/hooks/useMonumentActivity";
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
  suppressWindowScrollReset?: boolean;
}

type MonumentView = "goals" | "roadmap";
const PULL_EXIT_ACTIVATION_PX = 8;
const PULL_EXIT_TOUCH_ACTIVATION_PX = 5;
const PULL_EXIT_THRESHOLD_PX = 128;
const PULL_EXIT_FLICK_VELOCITY = 0.65;
const PULL_EXIT_FLICK_MIN_DISTANCE_PX = 32;
const CHARGE_MILESTONES = [
  { label: "Lit", threshold: 1 },
  { label: "EVO", threshold: 25 },
  { label: "EVO 2", threshold: 75 },
  { label: "EVO 3", threshold: 125 },
  { label: "EVO 4", threshold: 225 },
] as const;

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

function InlineMonumentHeaderEditor({
  monument,
  onCancel,
  onSaved,
}: {
  monument: MonumentDetailMonument;
  onCancel: () => void;
  onSaved: (monument: MonumentDetailMonument) => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [title, setTitle] = useState(monument.title);
  const [emoji, setEmoji] = useState(monument.emoji || "🏛️");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [areas, setAreas] = useState<
    { id: string; name: string; icon: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError("Supabase not configured");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadEditState() {
      setLoading(true);
      setError(null);

      try {
        const draft = await loadMonumentEditDraft(supabase, monument.id);

        if (cancelled) return;

        setTitle(draft.title);
        setEmoji(draft.emoji);
        setAreaId(draft.areaId);
        setAreas(
          AREAS.map((area) => ({
            id: area.id,
            name: area.label,
            icon: area.emoji,
          })),
        );
      } catch (err) {
        console.warn("Inline monument editor failed to load", err);

        if (!cancelled) {
          setTitle(monument.title);
          setEmoji(monument.emoji || "🏛️");
          setAreaId(null);
          setAreas(
            AREAS.map((area) => ({
              id: area.id,
              name: area.label,
              icon: area.emoji,
            })),
          );
          setError("Unable to load monument details right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEditState();

    return () => {
      cancelled = true;
    };
  }, [monument.emoji, monument.id, monument.title, supabase]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase not configured");
      return;
    }

    const nextTitle = title.trim();
    const nextEmoji = getMonumentIconOrDefault(emoji);
    if (!nextTitle) {
      setError("Name your monument before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveMonumentEditDraft({
        supabase,
        monumentId: monument.id,
        title: nextTitle,
        emoji: nextEmoji,
        areaId,
      });
      onSaved({ id: monument.id, title: nextTitle, emoji: nextEmoji });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save monument");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <input
            aria-label="Monument icon"
            value={emoji}
            onChange={(event) => setEmoji(normalizeMonumentIconInput(event.target.value))}
            className="flex h-[60px] w-[60px] shrink-0 rounded-2xl border border-white/10 bg-[#09090b] text-center text-3xl text-white shadow-[0_14px_28px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/15 sm:h-[72px] sm:w-[72px] sm:text-4xl"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <input
              aria-label="Monument title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-10 w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-2xl font-semibold tracking-tight text-white outline-none transition placeholder:text-white/35 focus:border-white/30 focus:ring-2 focus:ring-white/15 sm:h-12 sm:text-3xl"
              placeholder="Name your monument"
            />
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={loading}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-3 text-xs font-semibold text-white/80 transition hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {(() => {
                      const selectedArea =
                        areas.find((area) => area.id === areaId) ?? null;

                      return (
                        <>
                          {selectedArea?.icon ? (
                            <span>{selectedArea.icon}</span>
                          ) : null}
                          <span>
                            {loading
                              ? "Loading Area"
                              : selectedArea?.name ?? "Select Area"}
                          </span>
                          <ChevronDown
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        </>
                      );
                    })()}
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="start"
                  className="z-[230] min-w-[220px] border-black/80 bg-black text-white shadow-[0_18px_42px_rgba(0,0,0,0.55)]"
                >
                  {areas.map((area) => (
                    <DropdownMenuItem
                      key={area.id}
                      onSelect={() => setAreaId(area.id)}
                      className="gap-3 text-sm text-white"
                    >
                      <span className="flex size-5 items-center justify-center">
                        {area.id === areaId ? (
                          <Check className="size-4" aria-hidden="true" />
                        ) : null}
                      </span>
                      <span className="text-base">{area.icon ?? ""}</span>
                      <span>{area.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {error ? (
              <p className="text-xs font-medium text-red-200">{error}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="cancelSquare"
                size="iconSquare"
                onClick={onCancel}
                disabled={saving}
                aria-label="Cancel monument edit"
                className="h-8 w-8 drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation"
              >
                <X
                  className="h-4 w-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                  aria-hidden="true"
                />
              </Button>
              <Button
                type="submit"
                variant="confirmSquare"
                size="iconSquare"
                disabled={saving || loading}
                aria-label={saving ? "Saving monument" : "Save monument"}
                className={cn(
                  "h-8 w-8 drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation bg-white/10 text-white transition hover:bg-white/20",
                  saving || loading ? "opacity-50" : "",
                )}
              >
                <Check
                  className="h-4 w-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

export function MonumentDetail({
  monument,
  notes = [],
  onClose,
  suppressWindowScrollReset = false,
}: MonumentDetailProps) {
  const { id } = monument;
  const router = useRouter();
  const { summary } = useMonumentActivity(id);
  const [displayMonument, setDisplayMonument] =
    useState<MonumentDetailMonument>(monument);
  const [inlineEditOpen, setInlineEditOpen] = useState(false);
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
    inlineEditOpen || actionsMenuOpen || Boolean(focusPomoSource);

  useEffect(() => {
    setDisplayMonument({
      id: monument.id,
      title: monument.title,
      emoji: monument.emoji,
    });
    setInlineEditOpen(false);
    setMonumentView("goals");
    setGoalSection("active");
  }, [id, monument.id, monument.title, monument.emoji]);

  useLayoutEffect(() => {
    detailScrollRef.current = getScrollParent(detailSurfaceRef.current);
  }, []);

  useLayoutEffect(() => {
    detailScrollRef.current = getScrollParent(detailSurfaceRef.current);

    detailScrollRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    if (!suppressWindowScrollReset) {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    }
  }, [id, suppressWindowScrollReset]);

  useEffect(() => {
    return () => {
      pullSnapAnimationRef.current?.stop();
    };
  }, []);

  const containerShell =
    "relative w-full rounded-3xl border border-white/[0.08]";
  const sectionBackground =
    "bg-[#0D0E11] shadow-[0_24px_70px_-52px_rgba(0,0,0,0.86),inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-1px_0_rgba(0,0,0,0.48)]";
  const overviewBackground =
    "bg-[#111216] shadow-[0_34px_110px_-50px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.075),inset_0_-1px_0_rgba(255,255,255,0.018)]";
  const activeChargeStageIndex = Math.max(
    CHARGE_MILESTONES.findIndex(
      (milestone) => milestone.label === summary.evoLabel
    ),
    0
  );
  const activeChargeCellFill = Math.min(
    Math.max(summary.chargeProgressPercent, 0),
    100
  );
  const getChargeCellFill = (index: number) => {
    if (index < activeChargeStageIndex) return 100;
    if (index === activeChargeStageIndex) return activeChargeCellFill;
    return 0;
  };
  const totalChargeFilledCellUnits = Math.min(
    Math.max(activeChargeStageIndex + activeChargeCellFill / 100, 0),
    CHARGE_MILESTONES.length
  );
  const totalChargeCompletedGapCount = Math.min(
    Math.max(activeChargeStageIndex, 0),
    CHARGE_MILESTONES.length - 1
  );

  const handleStartFocusPomo = () => {
    const source: FocusPomoSource = {
      sourceType: "monument",
      sourceId: id,
      title: displayMonument.title,
      icon: displayMonument.emoji,
    };

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
      className="min-h-[var(--monument-detail-overlay-height,100dvh)] bg-black relative overflow-x-hidden px-2.5 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-2 sm:px-6 sm:pb-10 sm:pt-4 lg:px-8"
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
      <FocusPomo
        open={Boolean(focusPomoSource)}
        source={focusPomoSource}
        onClose={() => setFocusPomoSource(null)}
      />
      <div className="relative z-20 mx-auto flex min-h-0 w-full max-w-6xl flex-col gap-4 overflow-x-hidden sm:gap-6">
        <section
          className={cn(
            containerShell,
            overviewBackground,
            "overflow-hidden px-3 py-3 text-white sm:p-7",
            "min-h-0 sm:min-h-[210px]"
          )}
        >
          <div className="relative z-40 flex flex-row gap-4 sm:flex-row sm:items-start sm:gap-6">
            {inlineEditOpen ? (
              <InlineMonumentHeaderEditor
                monument={displayMonument}
                onCancel={() => setInlineEditOpen(false)}
                onSaved={(nextMonument) => {
                  setDisplayMonument(nextMonument);
                  setInlineEditOpen(false);
                }}
              />
            ) : (
              <>
                <span
                  className="relative flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-white/10 bg-[#09090b] text-3xl text-white shadow-[0_14px_28px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-[72px] sm:w-[72px] sm:text-4xl"
                  role="img"
                  aria-label={`Monument: ${displayMonument.title}`}
                >
                  <span className="relative z-10 drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]">
                    {displayMonument.emoji || "\uD83D\uDDFC\uFE0F"}
                  </span>
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <h1 className="min-w-0 flex-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                      {displayMonument.title}
                    </h1>
                    <div
                      className="flex shrink-0 items-center gap-0.5"
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        aria-label={`Start focus pomo for ${displayMonument.title}`}
                        onClick={handleStartFocusPomo}
                        className="inline-flex size-9 items-center justify-center text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
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
                            className="inline-flex h-9 w-5 items-center justify-center text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                          >
                            <MoreVertical
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="border-black/80 bg-black text-white shadow-[0_18px_42px_rgba(0,0,0,0.55)]"
                        >
                          <DropdownMenuItem
                            onSelect={() => setInlineEditOpen(true)}
                            className="text-white/80 focus:bg-white/[0.06] focus:text-white"
                          >
                            Edit monument
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div
                    className="relative grid h-[11px] max-w-[220px] grid-cols-5 gap-1.5 overflow-hidden sm:max-w-[260px]"
                    aria-label={`EVO charge stage ${summary.evoLabel}`}
                  >
                    {CHARGE_MILESTONES.map((milestone, index) => {
                      const cellFill = getChargeCellFill(index);
                      const isCompleted = cellFill >= 100;
                      const isActive = cellFill > 0 && cellFill < 100;

                      return (
                        <div
                          key={milestone.label}
                          className="relative min-w-0 overflow-hidden rounded-[3px] border border-white/[0.095] bg-[linear-gradient(180deg,#22252b_0%,#15171c_48%,#08090d_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.58),inset_0_0_8px_rgba(0,0,0,0.45)]"
                          aria-current={isActive ? "step" : undefined}
                        >
                          <span
                            className="pointer-events-none absolute inset-x-[1px] top-[1px] z-[1] h-[38%] rounded-[3px] bg-[linear-gradient(180deg,rgba(255,255,255,0.075)_0%,rgba(255,255,255,0)_100%)]"
                            aria-hidden="true"
                          />
                          <span
                            className="pointer-events-none absolute inset-0 z-[1] rounded-[3px] bg-[radial-gradient(circle_at_50%_115%,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_46%)]"
                            aria-hidden="true"
                          />
                          {isCompleted ? (
                            <span className="absolute inset-0 z-[2] rounded-[3px] border border-zinc-200/[0.11] bg-[linear-gradient(90deg,#4d535c_0%,#646b75_52%,#535a63_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.30),0_0_5px_rgba(161,161,170,0.055)]" />
                          ) : null}
                          {isActive ? (
                            <span
                              className="absolute inset-y-0 left-0 isolate z-[3] block overflow-hidden rounded-[3px] border border-zinc-200/[0.13] bg-[linear-gradient(90deg,#505761_0%,#68707a_54%,#58606a_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.31),0_0_6px_rgba(161,161,170,0.075)] transition-[width] duration-700 ease-out"
                              style={{ width: `${cellFill}%` }}
                            >
                              <span
                                className="pointer-events-none absolute inset-y-[-1px] right-0 z-[4] w-[3px] rounded-[3px] bg-[linear-gradient(180deg,rgba(212,212,216,0.48)_0%,rgba(161,161,170,0.46)_45%,rgba(63,63,70,0.52)_100%)] shadow-[0_0_5px_rgba(212,212,216,0.18),-3px_0_6px_rgba(228,228,231,0.07)]"
                                aria-hidden="true"
                              />
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                      {totalChargeFilledCellUnits > 0 ? (
                        <span
                          className="pointer-events-none absolute inset-y-0 left-0 z-[6] overflow-hidden rounded-[3px] opacity-30"
                          style={{
                            width: `calc(((100% - 1.5rem) * ${
                              totalChargeFilledCellUnits / CHARGE_MILESTONES.length
                            }) + (${totalChargeCompletedGapCount} * 0.375rem))`,
                          }}
                          aria-hidden="true"
                        >
                          <span
                            className="progress-bar-glint-sweep level-progress-bar-glint-sweep"
                            aria-hidden="true"
                          />
                        </span>
                      ) : null}
                  </div>

                </div>
              </>
            )}
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
