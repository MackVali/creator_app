"use client";

import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

const PULL_REFRESH_THRESHOLD_PX = 72;
const PULL_REFRESH_MAX_OFFSET_PX = 86;
const PULL_REFRESH_HOLD_OFFSET_PX = 48;
const PULL_REFRESH_AXIS_SLOP_PX = 4;
const PULL_REFRESH_SCROLL_TOP_TOLERANCE_PX = 8;

type PullRefreshStatus = "idle" | "pulling" | "ready" | "refreshing";
type PullRefreshAxis = "pending" | "vertical" | "horizontal";

type TouchGesture = {
  active: boolean;
  startX: number;
  startY: number;
  axis: PullRefreshAxis;
};

export type PullRefreshShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  lockDocumentScroll?: boolean;
  onRefresh: () => Promise<void> | void;
  isBlockedRef?: RefObject<(() => boolean) | null>;
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

function isScrollableElement(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;

  return (
    (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
    element.scrollHeight > element.clientHeight
  );
}

function isScrollPositionAtTop(scrollTop: number | undefined) {
  return (scrollTop ?? 0) <= PULL_REFRESH_SCROLL_TOP_TOLERANCE_PX;
}

function isAtScrollTop(
  scrollContainer: HTMLDivElement | null,
  root: HTMLElement | null,
  target: EventTarget | null,
) {
  const documentScrollTops = [
    document.scrollingElement?.scrollTop,
    document.documentElement.scrollTop,
    document.body.scrollTop,
    window.scrollY,
  ];
  let checkedShellScroll = false;

  if (scrollContainer && isScrollableElement(scrollContainer)) {
    checkedShellScroll = true;
    if (!isScrollPositionAtTop(scrollContainer.scrollTop)) {
      return false;
    }
  }

  if (root && target instanceof Node) {
    let node: Node | null = target;

    while (node && node !== root) {
      if (node instanceof HTMLElement && isScrollableElement(node)) {
        checkedShellScroll = true;
        if (!isScrollPositionAtTop(node.scrollTop)) {
          return false;
        }
      }

      node = node.parentNode;
    }
  }

  return checkedShellScroll
    ? true
    : documentScrollTops.every(isScrollPositionAtTop);
}

export function PullRefreshShell({
  children,
  className,
  contentClassName,
  lockDocumentScroll = true,
  onRefresh,
  isBlockedRef,
}: PullRefreshShellProps) {
  const rootRef = useRef<HTMLElement | null>(null);
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

  const isTouchInsideShell = useCallback((target: EventTarget | null) => {
    const root = rootRef.current;

    return Boolean(root && target instanceof Node && root.contains(target));
  }, []);

  const resetGesture = useCallback(() => {
    gestureRef.current.active = false;
    gestureRef.current.axis = "pending";

    if (!isRefreshing) {
      offsetRef.current = 0;
      setOffset(0);
      setStatus("idle");
    }
  }, [isRefreshing]);

  const updatePull = useCallback((deltaY: number) => {
    const nextOffset = getPullOffset(deltaY);

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    offsetRef.current = nextOffset;
    setOffset(nextOffset);

    if (nextOffset >= PULL_REFRESH_THRESHOLD_PX) {
      setStatus("ready");
      return;
    }

    setStatus("pulling");
  }, []);

  const runRefresh = useCallback(async () => {
    setStatus("refreshing");
    offsetRef.current = PULL_REFRESH_HOLD_OFFSET_PX;
    setOffset(PULL_REFRESH_HOLD_OFFSET_PX);

    try {
      await onRefresh();
    } finally {
      offsetRef.current = 0;
      setOffset(0);
      setStatus("idle");
    }
  }, [onRefresh]);

  const finishGesture = useCallback(() => {
    const isBlocked = isBlockedRef?.current?.() ?? false;
    const shouldRefresh =
      !isBlocked &&
      isAtScrollTop(scrollContainerRef.current, rootRef.current, null) &&
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
  }, [isBlockedRef, runRefresh]);

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!isTouchInsideShell(event.target)) {
        resetGesture();
        return;
      }

      const touch = event.touches[0];
      const scrollContainer = scrollContainerRef.current;

      if (!touch || event.touches.length !== 1) {
        resetGesture();
        return;
      }

      if (isRefreshing) {
        resetGesture();
        return;
      }

      const isBlocked = isBlockedRef?.current?.() ?? false;

      if (isBlocked) {
        resetGesture();
        return;
      }

      if (!isAtScrollTop(scrollContainer, rootRef.current, event.target)) {
        resetGesture();
        return;
      }

      if (isInteractivePullTarget(event.target)) {
        resetGesture();
        return;
      }

      gestureRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        axis: "pending",
      };
    },
    [isBlockedRef, isRefreshing, isTouchInsideShell, resetGesture],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!isTouchInsideShell(event.target)) {
        if (gestureRef.current.active) {
          resetGesture();
        }
        return;
      }

      const gesture = gestureRef.current;
      const touch = event.touches[0];
      const scrollContainer = scrollContainerRef.current;

      if (!gesture.active) {
        return;
      }

      if (!touch || event.touches.length !== 1) {
        resetGesture();
        return;
      }

      if (isRefreshing) {
        resetGesture();
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
        resetGesture();
        return;
      }

      if (deltaY <= 0) {
        resetGesture();
        return;
      }

      const isBlocked = isBlockedRef?.current?.() ?? false;

      if (isBlocked) {
        resetGesture();
        return;
      }

      if (
        scrollContainer &&
        isAtScrollTop(scrollContainer, rootRef.current, event.target)
      ) {
        scrollContainer.scrollTop = 0;
      }

      if (!isAtScrollTop(scrollContainer, rootRef.current, event.target)) {
        resetGesture();
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      updatePull(deltaY);
    },
    [
      isBlockedRef,
      isRefreshing,
      isTouchInsideShell,
      resetGesture,
      updatePull,
    ],
  );

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    if (!isTouchInsideShell(event.target) && gestureRef.current.active) {
      resetGesture();
      return;
    }

    if (!gestureRef.current.active) {
      return;
    }

    finishGesture();
  }, [finishGesture, isTouchInsideShell, resetGesture]);

  useEffect(() => {
    if (!rootRef.current) {
      return;
    }

    const touchStartOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };
    const touchMoveOptions: AddEventListenerOptions = {
      capture: true,
      passive: false,
    };
    const touchEndOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };

    document.addEventListener(
      "touchstart",
      handleTouchStart,
      touchStartOptions,
    );
    document.addEventListener(
      "touchmove",
      handleTouchMove,
      touchMoveOptions,
    );
    document.addEventListener(
      "touchend",
      handleTouchEnd,
      touchEndOptions,
    );
    document.addEventListener(
      "touchcancel",
      handleTouchEnd,
      touchEndOptions,
    );

    return () => {
      document.removeEventListener(
        "touchstart",
        handleTouchStart,
        touchStartOptions,
      );
      document.removeEventListener(
        "touchmove",
        handleTouchMove,
        touchMoveOptions,
      );
      document.removeEventListener(
        "touchend",
        handleTouchEnd,
        touchEndOptions,
      );
      document.removeEventListener(
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
      ref={rootRef}
      className={cn(
        "relative overflow-hidden bg-[var(--background)]",
        className,
      )}
    >
      <div
        ref={scrollContainerRef}
        className="relative overscroll-contain [-webkit-overflow-scrolling:touch] [overscroll-behavior-y:contain] w-full"
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
          className={cn(
            "relative z-0 w-full",
            contentClassName,
          )}
        >
          {children}
        </motion.div>
      </div>
    </section>
  );
}
