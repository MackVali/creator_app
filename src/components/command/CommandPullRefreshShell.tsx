"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
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

type TouchGesture = {
  active: boolean;
  startX: number;
  startY: number;
  axis: PullRefreshAxis;
};

type PointerGesture = TouchGesture & {
  pointerId: number | null;
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

function getScrollableAncestorScrollTops(surface: HTMLElement | null) {
  const scrollTops: number[] = [];
  let current = surface?.parentElement ?? null;

  while (current) {
    const style = window.getComputedStyle(current);
    const canScroll =
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      current.scrollHeight > current.clientHeight + 2;

    if (canScroll) {
      scrollTops.push(current.scrollTop);
    }

    current = current.parentElement;
  }

  return scrollTops;
}

function getCommandScrollTop(surface: HTMLElement | null) {
  if (typeof window === "undefined") {
    return 0;
  }

  return Math.max(
    window.scrollY,
    document.scrollingElement?.scrollTop ?? 0,
    document.documentElement.scrollTop,
    document.body.scrollTop,
    ...getScrollableAncestorScrollTops(surface),
  );
}

function getPullOffset(deltaY: number) {
  return Math.min(PULL_REFRESH_MAX_OFFSET_PX, deltaY * 0.62);
}

export function CommandPullRefreshShell({
  className,
}: CommandPullRefreshShellProps) {
  const commandRef = useRef<CommandCirclesSectionHandle | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const touchGestureRef = useRef<TouchGesture>({
    active: false,
    startX: 0,
    startY: 0,
    axis: "pending",
  });
  const pointerGestureRef = useRef<PointerGesture>({
    active: false,
    startX: 0,
    startY: 0,
    axis: "pending",
    pointerId: null,
  });
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<PullRefreshStatus>("idle");

  const isRefreshing = status === "refreshing";
  const isDragging = status === "pulling" || status === "ready";
  const isVisible = isRefreshing || offset > 2;

  useEffect(() => {
    const previousHtmlOverscroll =
      document.documentElement.style.overscrollBehaviorY;
    const previousBodyOverscroll = document.body.style.overscrollBehaviorY;

    document.documentElement.style.overscrollBehaviorY = "contain";
    document.body.style.overscrollBehaviorY = "contain";

    return () => {
      document.documentElement.style.overscrollBehaviorY =
        previousHtmlOverscroll;
      document.body.style.overscrollBehaviorY = previousBodyOverscroll;
    };
  }, []);

  const resetGesture = useCallback(() => {
    touchGestureRef.current = {
      active: false,
      startX: 0,
      startY: 0,
      axis: "pending",
    };
    pointerGestureRef.current = {
      active: false,
      startX: 0,
      startY: 0,
      axis: "pending",
      pointerId: null,
    };

    if (!isRefreshing) {
      offsetRef.current = 0;
      setOffset(0);
      setStatus("idle");
    }
  }, [isRefreshing]);

  const canStartPull = useCallback(
    (target: EventTarget | null) =>
      !isRefreshing &&
      !commandRef.current?.isDetailOpen() &&
      getCommandScrollTop(surfaceRef.current) <= 2 &&
      !isInteractivePullTarget(target),
    [commandRef, isRefreshing],
  );

  const updatePull = useCallback((deltaY: number) => {
    const nextOffset = getPullOffset(deltaY);
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
    setStatus(nextOffset >= PULL_REFRESH_THRESHOLD_PX ? "ready" : "pulling");
  }, []);

  const runRefresh = useCallback(async () => {
    setStatus("refreshing");
    offsetRef.current = PULL_REFRESH_HOLD_OFFSET_PX;
    setOffset(PULL_REFRESH_HOLD_OFFSET_PX);

    try {
      await commandRef.current?.refresh();
    } finally {
      offsetRef.current = 0;
      setOffset(0);
      setStatus("idle");
    }
  }, [commandRef]);

  const finishGesture = useCallback(() => {
    const shouldRefresh =
      !commandRef.current?.isDetailOpen() &&
      getCommandScrollTop(surfaceRef.current) <= 2 &&
      offsetRef.current >= PULL_REFRESH_THRESHOLD_PX;

    touchGestureRef.current.active = false;
    pointerGestureRef.current.active = false;
    pointerGestureRef.current.pointerId = null;

    if (shouldRefresh) {
      void runRefresh();
      return;
    }

    offsetRef.current = 0;
    setOffset(0);
    setStatus("idle");
  }, [commandRef, runRefresh]);

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];

      if (!touch || event.touches.length !== 1 || !canStartPull(event.target)) {
        resetGesture();
        return;
      }

      touchGestureRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        axis: "pending",
      };
    },
    [canStartPull, resetGesture],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const gesture = touchGestureRef.current;
      const touch = event.touches[0];

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
        getCommandScrollTop(surfaceRef.current) > 2
      ) {
        resetGesture();
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }
      updatePull(deltaY);
    },
    [commandRef, isRefreshing, resetGesture, updatePull],
  );

  const handleTouchEnd = useCallback(() => {
    if (!touchGestureRef.current.active) {
      resetGesture();
      return;
    }

    finishGesture();
  }, [finishGesture, resetGesture]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType === "touch" ||
        (event.pointerType !== "mouse" && event.pointerType !== "pen") ||
        !canStartPull(event.target)
      ) {
        return;
      }

      pointerGestureRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        axis: "pending",
        pointerId: event.pointerId,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [canStartPull],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const gesture = pointerGestureRef.current;

      if (
        !gesture.active ||
        gesture.pointerId !== event.pointerId ||
        isRefreshing
      ) {
        return;
      }

      const deltaY = event.clientY - gesture.startY;
      const deltaX = event.clientX - gesture.startX;
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
        getCommandScrollTop(surfaceRef.current) > 2
      ) {
        resetGesture();
        return;
      }

      event.preventDefault();
      updatePull(deltaY);
    },
    [commandRef, isRefreshing, resetGesture, updatePull],
  );

  const handlePointerEnd = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const gesture = pointerGestureRef.current;

      if (!gesture.active || gesture.pointerId !== event.pointerId) {
        resetGesture();
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      finishGesture();
    },
    [finishGesture, resetGesture],
  );

  const contentY = isRefreshing ? PULL_REFRESH_HOLD_OFFSET_PX : offset;
  const transition = isDragging
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.8 };
  const label =
    status === "refreshing"
      ? "refreshing"
      : status === "ready"
        ? "ready"
        : "pull detected";

  return (
    <div
      ref={surfaceRef}
      className={cn(
        "relative min-h-[calc(100dvh-4rem)] overscroll-contain [overscroll-behavior-y:contain]",
        className,
      )}
      style={{ overscrollBehaviorY: "contain" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-28 bg-gradient-to-b from-black via-zinc-950/95 to-transparent"
        initial={false}
        animate={{
          opacity: isVisible ? 1 : 0,
          scaleY: isVisible ? Math.max(0.45, Math.min(1, offset / 72)) : 0.35,
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
          {/* Temporary phone-test marker: remove this span when pull testing is done. */}
          {isVisible ? <span>{label}</span> : null}
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={{ y: contentY }}
        transition={transition}
        className="relative z-0"
      >
        <CommandCirclesSection ref={commandRef} />
      </motion.div>
    </div>
  );
}
