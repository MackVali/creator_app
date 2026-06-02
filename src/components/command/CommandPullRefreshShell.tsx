"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import {
  CommandCirclesSection,
  type CommandCirclesSectionHandle,
} from "@/components/command/CommandCirclesSection";

const PULL_REFRESH_THRESHOLD_PX = 72;
const PULL_REFRESH_MAX_OFFSET_PX = 86;
const PULL_REFRESH_HOLD_OFFSET_PX = 48;
const PULL_REFRESH_AXIS_SLOP_PX = 4;
const PULL_REFRESH_SCROLL_TOP_TOLERANCE_PX = 6;
const PULL_REFRESH_BLOCKED_MARKER_MS = 900;

type PullRefreshStatus = "idle" | "pulling" | "ready" | "refreshing";
type PullRefreshAxis = "pending" | "vertical" | "horizontal";
type PullDebugMarker =
  | "touch start"
  | "blocked detail"
  | "blocked refreshing"
  | "blocked not top"
  | "blocked interactive"
  | "blocked multitouch"
  | "blocked horizontal"
  | "blocked upward"
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
  lockDocumentScroll?: boolean;
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
  return !element || element.scrollTop <= PULL_REFRESH_SCROLL_TOP_TOLERANCE_PX;
}

export function CommandPullRefreshShell({
  className,
  lockDocumentScroll = true,
}: CommandPullRefreshShellProps) {
  const commandRef = useRef<CommandCirclesSectionHandle | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const debugMarkerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
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
    if (!lockDocumentScroll) {
      return;
    }

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
  }, [lockDocumentScroll]);

  useEffect(() => {
    return () => {
      if (debugMarkerTimeoutRef.current) {
        clearTimeout(debugMarkerTimeoutRef.current);
      }
    };
  }, []);

  const showDebugMarker = useCallback(
    (marker: PullDebugMarker, clearAfterMs?: number) => {
      if (debugMarkerTimeoutRef.current) {
        clearTimeout(debugMarkerTimeoutRef.current);
        debugMarkerTimeoutRef.current = null;
      }

      setDebugMarker(marker);

      if (clearAfterMs) {
        debugMarkerTimeoutRef.current = setTimeout(() => {
          setDebugMarker(null);
          debugMarkerTimeoutRef.current = null;
        }, clearAfterMs);
      }
    },
    [],
  );

  const showBlockedMarker = useCallback(
    (
      marker: Exclude<
        PullDebugMarker,
        "touch start" | "pull detected" | "ready" | "refreshing" | null
      >,
    ) => {
      showDebugMarker(marker, PULL_REFRESH_BLOCKED_MARKER_MS);
    },
    [showDebugMarker],
  );

  const resetGesture = useCallback(
    (clearDebugMarker = true) => {
      gestureRef.current.active = false;
      gestureRef.current.axis = "pending";

      if (!isRefreshing) {
        offsetRef.current = 0;
        setOffset(0);
        setStatus("idle");
        if (clearDebugMarker) {
          showDebugMarker(null);
        }
      }
    },
    [isRefreshing, showDebugMarker],
  );

  const updatePull = useCallback((deltaY: number) => {
    const nextOffset = getPullOffset(deltaY);

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    offsetRef.current = nextOffset;
    setOffset(nextOffset);

    if (nextOffset >= PULL_REFRESH_THRESHOLD_PX) {
      setStatus("ready");
      showDebugMarker("ready");
      return;
    }

    setStatus("pulling");
    showDebugMarker("pull detected");
  }, [showDebugMarker]);

  const runRefresh = useCallback(async () => {
    setStatus("refreshing");
    showDebugMarker("refreshing");
    offsetRef.current = PULL_REFRESH_HOLD_OFFSET_PX;
    setOffset(PULL_REFRESH_HOLD_OFFSET_PX);

    try {
      await commandRef.current?.refresh();
    } finally {
      offsetRef.current = 0;
      setOffset(0);
      setStatus("idle");
      showDebugMarker(null);
    }
  }, [showDebugMarker]);

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
    showDebugMarker(null);
  }, [runRefresh, showDebugMarker]);

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      showDebugMarker("touch start");

      const touch = event.touches[0];
      const scrollContainer = scrollContainerRef.current;

      if (!touch || event.touches.length !== 1) {
        showBlockedMarker("blocked multitouch");
        resetGesture(false);
        return;
      }

      if (isRefreshing) {
        showBlockedMarker("blocked refreshing");
        resetGesture(false);
        return;
      }

      if (commandRef.current?.isDetailOpen()) {
        showBlockedMarker("blocked detail");
        resetGesture(false);
        return;
      }

      if (!isAtScrollTop(scrollContainer)) {
        showBlockedMarker("blocked not top");
        resetGesture(false);
        return;
      }

      if (isInteractivePullTarget(event.target)) {
        showBlockedMarker("blocked interactive");
        resetGesture(false);
        return;
      }

      gestureRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        axis: "pending",
      };
    },
    [isRefreshing, resetGesture, showBlockedMarker, showDebugMarker],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      const gesture = gestureRef.current;
      const touch = event.touches[0];
      const scrollContainer = scrollContainerRef.current;

      if (!gesture.active) {
        return;
      }

      if (!touch || event.touches.length !== 1) {
        showBlockedMarker("blocked multitouch");
        resetGesture(false);
        return;
      }

      if (isRefreshing) {
        showBlockedMarker("blocked refreshing");
        resetGesture(false);
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

      if (gesture.axis !== "vertical") {
        showBlockedMarker("blocked horizontal");
        resetGesture(false);
        return;
      }

      if (deltaY <= 0) {
        showBlockedMarker("blocked upward");
        resetGesture(false);
        return;
      }

      if (commandRef.current?.isDetailOpen()) {
        showBlockedMarker("blocked detail");
        resetGesture(false);
        return;
      }

      if (scrollContainer && isAtScrollTop(scrollContainer)) {
        scrollContainer.scrollTop = 0;
      }

      if (!isAtScrollTop(scrollContainer)) {
        showBlockedMarker("blocked not top");
        resetGesture(false);
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      updatePull(deltaY);
    },
    [isRefreshing, resetGesture, showBlockedMarker, updatePull],
  );

  const handleTouchEnd = useCallback(() => {
    if (!gestureRef.current.active) {
      return;
    }

    finishGesture();
  }, [finishGesture]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (!scrollContainer) {
      return;
    }

    const touchStartOptions: AddEventListenerOptions = { passive: true };
    const touchMoveOptions: AddEventListenerOptions = { passive: false };
    const touchEndOptions: AddEventListenerOptions = { passive: true };

    scrollContainer.addEventListener(
      "touchstart",
      handleTouchStart,
      touchStartOptions,
    );
    scrollContainer.addEventListener(
      "touchmove",
      handleTouchMove,
      touchMoveOptions,
    );
    scrollContainer.addEventListener(
      "touchend",
      handleTouchEnd,
      touchEndOptions,
    );
    scrollContainer.addEventListener(
      "touchcancel",
      handleTouchEnd,
      touchEndOptions,
    );

    return () => {
      scrollContainer.removeEventListener(
        "touchstart",
        handleTouchStart,
        touchStartOptions,
      );
      scrollContainer.removeEventListener(
        "touchmove",
        handleTouchMove,
        touchMoveOptions,
      );
      scrollContainer.removeEventListener(
        "touchend",
        handleTouchEnd,
        touchEndOptions,
      );
      scrollContainer.removeEventListener(
        "touchcancel",
        handleTouchEnd,
        touchEndOptions,
      );
    };
  }, [handleTouchEnd, handleTouchMove, handleTouchStart]);

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
