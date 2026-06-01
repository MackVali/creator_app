"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
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
const PULL_EXIT_THRESHOLD_PX = 56;

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
  const pullStartYRef = useRef<number | null>(null);
  const pullExitTriggeredRef = useRef(false);
  const pullPointerIdRef = useRef<number | null>(null);
  const pullExitBlocked =
    editDialogOpen || actionsMenuOpen || Boolean(focusPomoSource);

  useEffect(() => {
    setMonumentView("goals");
    setGoalSection("active");
  }, [id]);

  const containerShell =
    "relative w-full rounded-3xl border border-white/10";
  const sectionBackground =
    "bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)]";
  const overviewBackground =
    "bg-gradient-to-br from-[#050505] via-[#0f0f10] to-[#1b1b1d] shadow-[0_35px_120px_-45px_rgba(0,0,0,0.85)]";

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

  const isAtTop = () => window.scrollY <= 2;

  const isInteractivePullTarget = (target: EventTarget | null) => {
    return (
      target instanceof HTMLElement &&
      Boolean(
        target.closest(
          "a,button,input,select,textarea,[role='button'],[role='menuitem']"
        )
      )
    );
  };

  const resetPullExit = () => {
    pullStartYRef.current = null;
    pullExitTriggeredRef.current = false;
    pullPointerIdRef.current = null;
  };

  const handlePullExitStart = (event: PointerEvent<HTMLElement>) => {
    if (
      pullExitBlocked ||
      (event.pointerType !== "touch" && event.pointerType !== "mouse") ||
      !isAtTop() ||
      isInteractivePullTarget(event.target)
    ) {
      resetPullExit();
      return;
    }

    pullStartYRef.current = event.clientY;
    pullExitTriggeredRef.current = false;
    pullPointerIdRef.current = event.pointerId;
  };

  const handlePullExitMove = (event: PointerEvent<HTMLElement>) => {
    const pullStartY = pullStartYRef.current;

    if (
      pullExitBlocked ||
      pullStartY === null ||
      pullExitTriggeredRef.current ||
      pullPointerIdRef.current !== event.pointerId ||
      !isAtTop()
    ) {
      return;
    }

    const pullDistance = event.clientY - pullStartY;

    if (pullDistance > PULL_EXIT_THRESHOLD_PX) {
      pullExitTriggeredRef.current = true;
      pullStartYRef.current = null;
      pullPointerIdRef.current = null;
      handleCloseOrBack();
    }
  };

  const handlePullExitEnd = resetPullExit;

  return (
    <main
      className="overflow-x-hidden px-2.5 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-2 sm:px-6 sm:pb-10 sm:pt-4 lg:px-8"
      onPointerDown={handlePullExitStart}
      onPointerMove={handlePullExitMove}
      onPointerUp={handlePullExitEnd}
      onPointerCancel={handlePullExitEnd}
    >
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
            <div className="absolute inset-x-12 -top-16 h-48 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.18),_transparent_70%)] blur-3xl" />
            <div className="absolute bottom-0 right-0 h-56 w-56 translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.06),_transparent_60%)] blur-3xl" />
          </div>
          <div className="relative flex flex-row gap-4 sm:flex-row sm:items-start sm:gap-6">
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
            <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_55%)]" />
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
              <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_60%)]" />
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
    </main>
  );
}

export default MonumentDetail;
