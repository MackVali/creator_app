"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import {
  CommandCirclesSection,
  type CommandCirclesSectionHandle,
} from "@/components/command/CommandCirclesSection";

const PULL_REFRESH_THRESHOLD_PX = 72;
const PULL_REFRESH_MAX_OFFSET_PX = 86;
const PULL_REFRESH_HOLD_OFFSET_PX = 48;
const PULL_REFRESH_AXIS_SLOP_PX = 6;

type PullRefreshStatus = "idle" | "pulling" | "ready" | "refreshing";
type PullRefreshAxis = "pending" | "vertical" | "horizontal";
type PullDebugMarker =
  | "touch start"
  | "pull detected"
  | "ready"
  | "refreshing"
  | null;

type TouchGesture = {
  active: boolean;
  startX: number;
  startY: number;
  axis: PullRefreshAxis;
};

type CommandPullRefreshShellProps = {
  className?: string;
};

function isInteractivePullTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "a,button,input,select,textarea,[role='button'],[role='menuitem']",
      ),
    )
  );
}

function getPullOffset(deltaY: number) {
  return Math.min(PULL_REFRESH_MAX_OFFSET_PX, deltaY * 0.62);
}

function isAtScrollTop(element: HTMLDivElement | null) {
  return !element || element.scrollTop <= 0;
}

export function CommandPullRefreshShell({
  className,
}: CommandPullRefreshShellProps) {
  const commandRef = useRef<CommandCirclesSectionHandle | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const gestureRef = useRef<TouchGesture>({
    active: false,
    startX: 0,
    startY: 0,
    axis: "pending",
  });
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<PullRefreshStatus>("idle");
  const [debugMarker, setDebugMarker] = useState<PullDebugMarker>(null);

  const isRefreshing = status === "refreshing";
  const isDragging = status === "pulling" || status === "ready";
  const isVisible = status !== "idle";

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlOverscrollBehavior = html.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      html.style.overflow = previousHtmlOverflow;
      html.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
    };
  }, []);

  const resetGesture = useCallback(() => {
    gestureRef.current.active = false;
    gestureRef.current.axis = "pending";

    if (!isRefreshing) {
      offsetRef.current = 0;
      setOffset(0);
      setStatus("idle");
      setDebugMarker(null);
    }
  }, [isRefreshing]);

  const updatePull = useCallback((deltaY: number) => {
    const nextOffset = getPullOffset(deltaY);

    scrollContainerRef.current?.scrollTo({ top: 0 });
    offsetRef.current = nextOffset;
    setOffset(nextOffset);

    if (nextOffset >= PULL_REFRESH_THRESHOLD_PX) {
      setStatus("ready");
      setDebugMarker("ready");
      return;
    }

    setStatus("pulling");
    setDebugMarker("pull detected");
  }, []);

  const runRefresh = useCallback(async () => {
    setStatus("refreshing");
    setDebugMarker("refreshing");
    offsetRef.current = PULL_REFRESH_HOLD_OFFSET_PX;
    setOffset(PULL_REFRESH_HOLD_OFFSET_PX);

    try {
      await commandRef.current?.refresh();
    } finally {
      offsetRef.current = 0;
      setOffset(0);
      setStatus("idle");
      setDebugMarker(null);
    }
  }, []);

  const finishGesture = useCallback(() => {
    const shouldRefresh =
      !commandRef.current?.isDetailOpen() &&
      isAtScrollTop(scrollContainerRef.current) &&
      offsetRef.current >= PULL_REFRESH_THRESHOLD_PX;

    gestureRef.current.active = false;
    gestureRef.current.axis = "pending";

    if (shouldRefresh) {
      void runRefresh();
      return;
    }

    offsetRef.current = 0;
    setOffset(0);
    setStatus("idle");
    setDebugMarker(null);
  }, [runRefresh]);

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      const scrollContainer = scrollContainerRef.current;

      if (
        !touch ||
        event.touches.length !== 1 ||
        isRefreshing ||
        commandRef.current?.isDetailOpen() ||
        !isAtScrollTop(scrollContainer) ||
        isInteractivePullTarget(event.target)
      ) {
        resetGesture();
        return;
      }

      gestureRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        axis: "pending",
      };
      setDebugMarker("touch start");
    },
    [isRefreshing, resetGesture],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      const touch = event.touches[0];
      const scrollContainer = scrollContainerRef.current;

      if (!gesture.active || !touch || isRefreshing) {
        return;
      }

      const deltaY = touch.clientY - gesture.startY;
      const deltaX = touch.clientX - gesture.startX;
      const absDeltaY = Math.abs(deltaY);
      const absDeltaX = Math.abs(deltaX);

      if (gesture.axis === "pending") {
        if (
          absDeltaY < PULL_REFRESH_AXIS_SLOP_PX &&
          absDeltaX < PULL_REFRESH_AXIS_SLOP_PX
        ) {
          return;
        }

        gesture.axis =
          absDeltaY > absDeltaX * 1.25 ? "vertical" : "horizontal";
      }

      if (
        gesture.axis !== "vertical" ||
        deltaY <= 0 ||
        commandRef.current?.isDetailOpen() ||
        !isAtScrollTop(scrollContainer)
      ) {
        resetGesture();
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      updatePull(deltaY);
    },
    [isRefreshing, resetGesture, updatePull],
  );

  const handleTouchEnd = useCallback(() => {
    if (!gestureRef.current.active) {
      resetGesture();
      return;
    }

    finishGesture();
  }, [finishGesture, resetGesture]);

  const contentY = isRefreshing ? PULL_REFRESH_HOLD_OFFSET_PX : offset;
  const transition = isDragging
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.8 };
  const label =
    status === "refreshing"
      ? "Refreshing"
      : status === "ready"
        ? "Release to refresh"
        : "Pull to refresh";

  return (
    <section
      className={cn(
        "relative h-[calc(100dvh-4rem)] min-h-[calc(100dvh-4rem)] overflow-hidden bg-[var(--background)]",
        className,
      )}
    >
      <div
        ref={scrollContainerRef}
        className="relative h-full overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [overscroll-behavior-y:contain]"
        style={{ overscrollBehaviorY: "contain" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-28 bg-gradient-to-b from-black via-zinc-950/95 to-transparent"
          initial={false}
          animate={{
            opacity: isVisible ? 1 : 0,
            scaleY: isVisible
              ? Math.max(0.45, Math.min(1, offset / 72))
              : 0.35,
          }}
          style={{ originY: 0 }}
          transition={transition}
        />

        <motion.div
          aria-hidden={!isVisible}
          className="pointer-events-none absolute inset-x-0 top-1 z-10 flex justify-center"
          initial={false}
          animate={{
            opacity: isVisible ? 1 : 0,
            y: isRefreshing ? 8 : Math.max(-34, offset - 54),
          }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/92 px-3 py-2 text-xs font-semibold text-white/70 shadow-2xl shadow-black/35 backdrop-blur-md">
            <span
              className={cn(
                "h-4 w-4 rounded-full border-2 border-white/25 border-t-white/90",
                (isRefreshing || status === "ready") && "animate-spin",
              )}
            />
            {isVisible ? <span>{label}</span> : null}
          </div>
        </motion.div>

        <motion.div
          initial={false}
          animate={{ y: contentY }}
          transition={transition}
          className="relative z-0 mx-auto w-full max-w-6xl px-4 pb-10 pt-4"
        >
          <CommandCirclesSection ref={commandRef} />
        </motion.div>
      </div>

      {/* TEMP PTR DEBUG MARKER. */}
      {debugMarker ? (
        <div className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-white/70">
          {debugMarker}
        </div>
      ) : null}
    </section>
  );
}
