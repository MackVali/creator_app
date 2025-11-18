"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Project } from "../types";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";

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
}

const MAX_VISIBLE_TASKS = 12;
const LONG_PRESS_MS = 650;

export function ProjectRow({ project, onLongPress }: ProjectRowProps) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);
  const [isBouncing, setIsBouncing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const originElementRef = useRef<HTMLButtonElement | null>(null);
  const skipClickRef = useRef(false);

  const hasTasks = project.tasks.length > 0;
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

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!onLongPress) return;
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
    [cancelPendingPress, onLongPress, project, triggerBounce]
  );

  const handlePointerEnd = useCallback(
    (event?: React.SyntheticEvent) => {
      if (longPressTriggeredRef.current) {
        event?.preventDefault();
      }
      originElementRef.current = null;
      cancelPendingPress();
    },
    [cancelPendingPress]
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
      toggle();
    },
    [toggle]
  );

  return (
    <>
      <div
        className="relative rounded-2xl ring-1 ring-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.02] p-4 shadow-[0_12px_28px_-18px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform"
        style={cardAnimationStyle}
      >
      <div className="pointer-events-none absolute inset-0 rounded-2xl [mask-image:linear-gradient(to_bottom,black,transparent_75%)] bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]" />
      <button
        onClick={handleClick}
        type="button"
        className="relative z-0 flex w-full items-center justify-between text-left text-sm text-white"
        aria-expanded={open}
        aria-controls={`project-${project.id}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className="flex items-center gap-3 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-base font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)]">
            {displayEmoji}
          </div>
          <div className="flex flex-col">
            <span className="font-semibold leading-tight">{project.name}</span>
            <div className="flex items-center gap-1.5 text-[11px] text-white/60">
              <FlameEmber level={flameLevel} size="xs" />
              <span className="uppercase tracking-[0.2em]">{project.energy}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-white/70">{project.progress}%</p>
          {project.dueDate && (
            <span className="text-xs text-white/60">
              {new Date(project.dueDate).toLocaleDateString()}
            </span>
          )}
          {hasTasks && (
            <ChevronDown
              className={`h-4 w-4 text-white/60 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </div>
      </button>
      {hasTasks && (
        <ul
          id={`project-${project.id}`}
          className={`mt-3 space-y-1.5 overflow-hidden rounded-xl ring-1 ring-white/10 bg-white/5 p-3 text-xs text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all ${
            open ? "max-h-60" : "max-h-0"
          }`}
        >
          {open && (
        <>
          {visibleTasks.map((task) => (
            <li key={task.id} className="flex items-start gap-2">
              <span className="mt-1 h-1 w-1 rounded-full bg-white/70" aria-hidden="true" />
              <span>{task.name}</span>
            </li>
          ))}
          {hiddenCount > 0 && (
            <li className="text-white/50">+{hiddenCount} more tasks</li>
          )}
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
