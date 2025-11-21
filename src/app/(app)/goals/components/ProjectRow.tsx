"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Project } from "../types";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { getSupabaseBrowser } from "@/lib/supabase";
import { recordProjectCompletion } from "@/lib/projects/projectCompletion";

export type ProjectCardMorphOrigin = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: string;
  backgroundColor?: string;
  boxShadow?: string;
  emoji?: string | null;
};

interface ProjectRowProps {
  project: Project;
  onLongPress?: (project: Project, origin: ProjectCardMorphOrigin | null) => void;
  onUpdated?: (projectId: string, updates: Partial<Project>) => void;
}

const MAX_VISIBLE_TASKS = 12;
const LONG_PRESS_MS = 650;
const DOUBLE_TAP_MS = 325;
const SINGLE_TAP_DELAY_MS = 225;

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

export function ProjectRow({ project, onLongPress, onUpdated }: ProjectRowProps) {
  const hasTasks = project.tasks.length > 0;
  const [open, setOpen] = useState(hasTasks);
  const toggle = useCallback(() => {
    if (!hasTasks) return;
    setOpen((o) => !o);
  }, [hasTasks]);
  const [isBouncing, setIsBouncing] = useState(false);
  const [completionPending, setCompletionPending] = useState(false);
  const [localStatus, setLocalStatus] = useState<Project["status"]>(project.status);
  const [localStage, setLocalStage] = useState(project.stage ?? "BUILD");
  const [lastActiveStage, setLastActiveStage] = useState(
    project.stage && project.stage !== "RELEASE" ? project.stage : "BUILD"
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const originElementRef = useRef<HTMLButtonElement | null>(null);
  const skipClickRef = useRef(false);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTimeRef = useRef(0);

  useEffect(() => {
    setLocalStatus(project.status);
  }, [project.status]);

  useEffect(() => {
    if (project.stage) {
      setLocalStage(project.stage);
      if (project.stage !== "RELEASE") {
        setLastActiveStage(project.stage);
      }
    }
  }, [project.stage]);

  useEffect(
    () => () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  const [visibleTasks, hiddenCount] = useMemo(() => {
    const slice = project.tasks.slice(0, MAX_VISIBLE_TASKS);
    return [slice, project.tasks.length - slice.length] as const;
  }, [project.tasks]);

  const triggerBounce = useCallback(() => {
    setIsBouncing(true);
    const timeout = setTimeout(() => setIsBouncing(false), 450);
    return () => clearTimeout(timeout);
  }, []);

  const cancelPendingPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelSingleTap = useCallback(() => {
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }
  }, []);

  const toggleCompletion = useCallback(async () => {
    if (completionPending) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      console.warn("Supabase client not available for project completion");
      return;
    }

    const shouldComplete = localStatus !== "Done";
    const fallbackStage = localStage && localStage !== "RELEASE" ? localStage : lastActiveStage;
    const nextStage = shouldComplete ? "RELEASE" : fallbackStage || "BUILD";

    setCompletionPending(true);
    const { error } = await supabase.from("projects").update({ stage: nextStage }).eq("id", project.id);
    setCompletionPending(false);
    if (error) {
      console.error("Failed to toggle project completion", error);
      return;
    }

    const nextStatus = projectStageToStatus(nextStage);
    if (shouldComplete && localStage && localStage !== "RELEASE") {
      setLastActiveStage(localStage);
    } else if (!shouldComplete && nextStage && nextStage !== "RELEASE") {
      setLastActiveStage(nextStage);
    }

    setLocalStatus(nextStatus);
    setLocalStage(nextStage);
    onUpdated?.(project.id, { status: nextStatus, stage: nextStage });
    if (shouldComplete) {
      void recordProjectCompletion(
        {
          projectId: project.id,
          projectSkillIds: project.skillIds,
          taskSkillIds: (project.tasks ?? []).map((task) => task.skillId),
        },
        "complete"
      );
    } else {
      void recordProjectCompletion(
        {
          projectId: project.id,
          projectSkillIds: project.skillIds,
          taskSkillIds: (project.tasks ?? []).map((task) => task.skillId),
        },
        "undo"
      );
    }
  }, [completionPending, lastActiveStage, localStage, localStatus, onUpdated, project.id]);

  const isCompleted = localStatus === "Done";

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!onLongPress || completionPending) return;
      originElementRef.current = event.currentTarget;
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      longPressTriggeredRef.current = false;
      skipClickRef.current = false;
      cancelPendingPress();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        longPressTriggeredRef.current = true;
        skipClickRef.current = true;
        triggerBounce();
        let origin: ProjectCardMorphOrigin | null = null;
        const element = originElementRef.current;
        if (element) {
          const rect = element.getBoundingClientRect();
          const computed = window.getComputedStyle(element);
          const radius =
            computed.borderRadius && computed.borderRadius.trim().length > 0
              ? computed.borderRadius
              : [
                  computed.borderTopLeftRadius,
                  computed.borderTopRightRadius,
                  computed.borderBottomRightRadius,
                  computed.borderBottomLeftRadius,
                ]
                  .filter(Boolean)
                  .join(" ") || "0px";
          const backgroundColor =
            computed.backgroundColor &&
            computed.backgroundColor !== "rgba(0, 0, 0, 0)" &&
            computed.backgroundColor.toLowerCase() !== "transparent"
              ? computed.backgroundColor
              : undefined;
          const boxShadow =
            computed.boxShadow && computed.boxShadow !== "none"
              ? computed.boxShadow
              : undefined;
          origin = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            borderRadius: radius,
            backgroundColor,
            boxShadow,
            emoji: project.emoji,
          };
        }
        onLongPress(project, origin);
        originElementRef.current = null;
      }, LONG_PRESS_MS);
    },
    [cancelPendingPress, completionPending, onLongPress, project, triggerBounce]
  );

  const handlePointerEnd = useCallback(
    (event?: React.PointerEvent<HTMLButtonElement>) => {
      if (longPressTriggeredRef.current) {
        event?.preventDefault();
      }
      originElementRef.current = null;
      cancelPendingPress();

      if (completionPending || longPressTriggeredRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastTapTimeRef.current <= DOUBLE_TAP_MS) {
        lastTapTimeRef.current = 0;
        cancelSingleTap();
        skipClickRef.current = true;
        event?.preventDefault();
        void toggleCompletion();
        return;
      }

      lastTapTimeRef.current = now;
    },
    [cancelPendingPress, cancelSingleTap, completionPending, toggleCompletion]
  );

  const displayEmoji =
    typeof project.emoji === "string" && project.emoji.trim().length > 0
      ? project.emoji.trim()
      : project.name.slice(0, 2).toUpperCase();
  const flameLevel = (
    project.energyCode ? project.energyCode : project.energy ?? "No"
  )
    .toString()
    .toUpperCase() as FlameLevel;

  const cardAnimationStyle = isBouncing
    ? ({ animation: "project-bounce 0.45s ease" } satisfies React.CSSProperties)
    : undefined;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (skipClickRef.current) {
        event.preventDefault();
        longPressTriggeredRef.current = false;
        skipClickRef.current = false;
        return;
      }
      if (completionPending) {
        event.preventDefault();
        return;
      }
      cancelSingleTap();
      singleTapTimeoutRef.current = setTimeout(() => {
        toggle();
        singleTapTimeoutRef.current = null;
      }, SINGLE_TAP_DELAY_MS);
    },
    [cancelSingleTap, completionPending, toggle]
  );

  const primaryTextClass = isCompleted ? "text-emerald-50" : "text-white";
  const secondaryTextClass = isCompleted ? "text-emerald-100/80" : "text-white/60";
  const accentTextClass = isCompleted ? "text-emerald-100/75" : "text-white/70";
  const tertiaryTextClass = isCompleted ? "text-emerald-100/65" : "text-white/50";
  const chevronColorClass = isCompleted ? "text-emerald-100/70" : "text-white/60";
  const overlayGlowClass = isCompleted
    ? "bg-[radial-gradient(120%_70%_at_50%_0%,rgba(52,211,153,0.35),transparent_55%)]"
    : "bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]";
  const cardSurfaceClass = isCompleted
    ? "ring-1 ring-emerald-300/60 bg-[linear-gradient(135deg,_rgba(6,78,59,0.96)_0%,_rgba(4,120,87,0.94)_42%,_rgba(16,185,129,0.9)_100%)] shadow-[0_22px_42px_rgba(4,47,39,0.55)]"
    : "ring-1 ring-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.02] shadow-[0_12px_28px_-18px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.06)]";
  const tasksPanelClass = isCompleted
    ? "ring-emerald-200/60 bg-emerald-900/30 text-emerald-50"
    : "ring-white/10 bg-white/5 text-white/70";
  const bulletClass = isCompleted ? "bg-emerald-100/80" : "bg-white/70";

  return (
    <>
      <div
        className={`relative rounded-2xl p-4 transition-transform select-none ${cardSurfaceClass} ${primaryTextClass} ${
          completionPending ? "opacity-70" : ""
        }`}
        style={cardAnimationStyle}
      >
        <div
          className={`pointer-events-none absolute inset-0 rounded-2xl [mask-image:linear-gradient(to_bottom,black,transparent_75%)] ${overlayGlowClass}`}
        />
        <button
          onClick={handleClick}
          type="button"
          className={`relative z-0 flex w-full items-center justify-between text-left text-sm select-none ${primaryTextClass}`}
          aria-expanded={open}
          aria-controls={`project-${project.id}`}
          aria-disabled={completionPending}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div className={`flex items-center gap-3 ${primaryTextClass}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-base font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)]">
              {displayEmoji}
            </div>
            <div className="flex flex-col">
              <span className="font-semibold leading-tight">{project.name}</span>
              <div className={`flex items-center gap-1.5 text-[11px] ${secondaryTextClass}`}>
                <FlameEmber level={flameLevel} size="xs" />
                <span className="uppercase tracking-[0.2em]">{project.energy}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className={`text-[11px] ${accentTextClass}`}>{project.progress}%</p>
            {project.dueDate && (
              <span className={`text-xs ${secondaryTextClass}`}>
                {new Date(project.dueDate).toLocaleDateString()}
              </span>
            )}
            {hasTasks && (
              <ChevronDown
                className={`h-4 w-4 transition-transform ${chevronColorClass} ${open ? "rotate-180" : ""}`}
              />
            )}
          </div>
        </button>
        {hasTasks && (
          <ul
            id={`project-${project.id}`}
            className={`mt-3 space-y-1.5 overflow-hidden rounded-xl ring-1 p-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all ${
              open ? "max-h-60" : "max-h-0"
            } ${tasksPanelClass}`}
          >
            {open && (
              <>
                {visibleTasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-2">
                    <span className={`mt-1 h-1 w-1 rounded-full ${bulletClass}`} aria-hidden="true" />
                    <span>{task.name}</span>
                  </li>
                ))}
                {hiddenCount > 0 && <li className={tertiaryTextClass}>+{hiddenCount} more tasks</li>}
              </>
            )}
          </ul>
        )}
      </div>
      <style jsx>{`
        @keyframes project-bounce {
          0% {
            transform: scale(1);
          }
          35% {
            transform: scale(0.96);
          }
          70% {
            transform: scale(1.02);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </>
  );
}
