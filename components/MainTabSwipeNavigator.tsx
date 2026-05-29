"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import type { AnimationPlaybackControls } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import {
  MAIN_TAB_ROUTES,
  tabRouteConfig,
  type MainTabRouteHref,
} from "@/app/(routes)/navigation";
import CommandTabContent from "@/app/(app)/dashboard/CommandTabContent";
import ConnectTabContent from "@/app/(app)/friends/ConnectTabContent";
import ScheduleTabContent from "@/app/(app)/schedule/ScheduleTabContent";
import Source from "@/components/Source";

const COMMAND_ROUTE = tabRouteConfig.command.href;
const CONNECT_ROUTE = tabRouteConfig.connect.href;
const SOURCE_ROUTE = tabRouteConfig.source.href;
const SCHEDULE_ROUTE = tabRouteConfig.schedule.href;
const swipeRoutes = MAIN_TAB_ROUTES.map((tab) => tab.href);

type SwipeHostRoute = MainTabRouteHref;
type SwipeDirection = "left" | "right";
type SwipeTargetRoute = MainTabRouteHref;

const AXIS_LOCK_DISTANCE = 10;
const EDGE_RESISTANCE = 0.2;
const DRAG_FOLLOW = 1;
const MIN_COMMIT_DISTANCE = 64;
const MAX_COMMIT_DISTANCE = 110;
const COMMIT_DISTANCE_RATIO = 0.22;
const MIN_FLICK_DISTANCE = 34;
const COMMIT_VELOCITY = 0.62;
const PREVIEW_MIN_OPACITY = 0.82;
const PREVIEW_MAX_SCALE_DELTA = 0.018;
const PREVIEW_ENTRY_OFFSET_RATIO = 0.35;
const COMMIT_ANIMATION_DURATION = 0.12;
const COMMIT_FALLBACK_TIMEOUT_MS = 2200;

const IGNORE_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[role='button']",
  "[role='slider']",
  "[contenteditable]:not([contenteditable='false'])",
  "[data-no-tab-swipe]",
  "[data-radix-select-trigger]",
  "[data-radix-dropdown-menu-trigger]",
  "[data-tour='fab']",
].join(",");

const OVERLAY_SELECTOR = [
  "[role='dialog']",
  "[aria-modal='true']",
  "[data-radix-dialog-content]",
  "[data-radix-select-content]",
  "[data-radix-dropdown-menu-content]",
].join(",");

type GesturePhase = "pending" | "dragging";

type GestureState = {
  pointerId: number;
  hostRoute: SwipeHostRoute;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
  phase: GesturePhase;
  width: number;
};

type PeekState = {
  direction: SwipeDirection;
  targetHref: SwipeTargetRoute;
};

function normalizeMainRoute(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

function isMainTabRoute(pathname: string): pathname is MainTabRouteHref {
  return (swipeRoutes as readonly string[]).includes(pathname);
}

function getSwipeHostRoute(pathname: string | null): SwipeHostRoute | null {
  const normalizedPathname = normalizeMainRoute(pathname);
  if (!normalizedPathname || normalizedPathname === SCHEDULE_ROUTE) return null;

  return isMainTabRoute(normalizedPathname) ? normalizedPathname : null;
}

function getSwipeTarget(
  hostRoute: SwipeHostRoute,
  direction: SwipeDirection
): SwipeTargetRoute | null {
  const currentIndex = swipeRoutes.indexOf(hostRoute);
  if (currentIndex === -1) return null;

  const targetIndex =
    direction === "left"
      ? (currentIndex + 1) % swipeRoutes.length
      : (currentIndex - 1 + swipeRoutes.length) % swipeRoutes.length;
  return swipeRoutes[targetIndex] ?? null;
}

function getAdjacentSwipeTargets(hostRoute: SwipeHostRoute) {
  return {
    left: getSwipeTarget(hostRoute, "left"),
    right: getSwipeTarget(hostRoute, "right"),
  };
}

function getCommitDistance(width: number) {
  return Math.min(
    MAX_COMMIT_DISTANCE,
    Math.max(MIN_COMMIT_DISTANCE, width * COMMIT_DISTANCE_RATIO)
  );
}

function hasActiveOverlay() {
  if (typeof document === "undefined") return false;
  return (
    document.body.classList.contains("fab-panel-active") ||
    document.body.classList.contains("modal-open") ||
    Boolean(document.querySelector(OVERLAY_SELECTOR))
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(IGNORE_TARGET_SELECTOR));
}

function isHorizontalScrollableAncestor(target: EventTarget | null, boundary: Element | null) {
  if (!(target instanceof Element)) return false;

  let node: Element | null = target;
  while (node && node !== boundary) {
    const style = window.getComputedStyle(node);
    const canScrollX =
      /(auto|scroll|overlay)/.test(style.overflowX) &&
      node.scrollWidth > node.clientWidth + 8;
    const isKnownHorizontalSurface =
      node.getAttribute("aria-roledescription") === "carousel" ||
      node.classList.contains("scroll-snap") ||
      style.touchAction.includes("pan-x");

    if (canScrollX || isKnownHorizontalSurface) {
      return true;
    }

    node = node.parentElement;
  }

  return false;
}

function clampDrag(rawDeltaX: number, width: number, hasAdjacentRoute: boolean) {
  const limit = Math.max(width * 0.82, 1);

  if (!hasAdjacentRoute) {
    return Math.max(Math.min(rawDeltaX * EDGE_RESISTANCE, 34), -34);
  }

  return Math.max(Math.min(rawDeltaX * DRAG_FOLLOW, limit), -limit);
}

function getPreviewInitialX(direction: SwipeDirection, width: number) {
  const previewSide = direction === "left" ? 1 : -1;
  return previewSide * width * PREVIEW_ENTRY_OFFSET_RATIO;
}

function getPreviewX(direction: SwipeDirection, deltaX: number, width: number) {
  const previewSide = direction === "left" ? 1 : -1;
  const progress = Math.min(Math.abs(deltaX) / Math.max(width, 1), 1);
  const startOffset = width * PREVIEW_ENTRY_OFFSET_RATIO;
  return previewSide * startOffset * (1 - progress);
}

function waitForAnimation(animation: AnimationPlaybackControls) {
  return new Promise<void>((resolve, reject) => {
    const thenable = animation as AnimationPlaybackControls & {
      then?: (onResolve: () => void, onReject?: (error: unknown) => void) => void;
    };

    if (typeof thenable.then === "function") {
      thenable.then(resolve, reject);
      return;
    }

    requestAnimationFrame(() => resolve());
  });
}

function DestinationPreview({ route }: { route: SwipeTargetRoute }) {
  return (
    <div
      data-main-tab-preview={route}
      className="min-h-full bg-[#050505] text-white"
    >
      {route === COMMAND_ROUTE ? <CommandTabContent /> : null}
      {route === CONNECT_ROUTE ? <ConnectTabContent /> : null}
      {route === SOURCE_ROUTE ? <Source /> : null}
      {route === SCHEDULE_ROUTE ? <ScheduleTabContent isSwipePreview /> : null}
    </div>
  );
}

export default function MainTabSwipeNavigator({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const animationRef = useRef<AnimationPlaybackControls | null>(null);
  const peekAnimationRef = useRef<AnimationPlaybackControls[]>([]);
  const peekStateRef = useRef<PeekState | null>(null);
  const isCommittingRef = useRef(false);
  const pendingRouteRef = useRef<SwipeTargetRoute | null>(null);
  const commitFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchedRoutesRef = useRef<Set<SwipeTargetRoute>>(new Set());
  const listenersRef = useRef<{
    move: (event: PointerEvent) => void;
    end: (event: PointerEvent) => void;
    cancel: (event: PointerEvent) => void;
  } | null>(null);
  const x = useMotionValue(0);
  const peekOpacity = useMotionValue(0);
  const peekX = useMotionValue(0);
  const peekScale = useMotionValue(1 - PREVIEW_MAX_SCALE_DELTA);
  const [peekState, setPeekState] = useState<PeekState | null>(null);
  const [committedPreviewRoute, setCommittedPreviewRoute] =
    useState<SwipeTargetRoute | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<SwipeTargetRoute | null>(null);
  const [isCurrentLayerSuppressed, setIsCurrentLayerSuppressed] = useState(false);

  const swipeHostRoute = useMemo(() => getSwipeHostRoute(pathname), [pathname]);
  const isEnabledRoute = swipeHostRoute !== null;
  const activePreviewRoute = committedPreviewRoute ?? peekState?.targetHref ?? null;

  const clearCommitFallbackTimeout = useCallback(() => {
    if (!commitFallbackTimeoutRef.current) return;
    clearTimeout(commitFallbackTimeoutRef.current);
    commitFallbackTimeoutRef.current = null;
  }, []);

  const prefetchRoute = useCallback(
    (route: SwipeTargetRoute | null) => {
      if (!route || prefetchedRoutesRef.current.has(route)) return;

      const prefetch = (router as { prefetch?: (href: string) => void }).prefetch;
      if (!prefetch) return;

      prefetchedRoutesRef.current.add(route);

      try {
        prefetch(route);
      } catch {
        prefetchedRoutesRef.current.delete(route);
      }
    },
    [router]
  );

  const clearCommittedPreview = useCallback(() => {
    clearCommitFallbackTimeout();
    isCommittingRef.current = false;
    pendingRouteRef.current = null;
    setIsCommitting(false);
    setPendingRoute(null);
    setCommittedPreviewRoute(null);
    setIsCurrentLayerSuppressed(false);
    x.set(0);
    peekAnimationRef.current.forEach((animation) => animation.stop());
    peekAnimationRef.current = [];
    peekOpacity.set(0);
    peekX.set(0);
    peekScale.set(1 - PREVIEW_MAX_SCALE_DELTA);
    peekStateRef.current = null;
    setPeekState(null);
  }, [clearCommitFallbackTimeout, peekOpacity, peekScale, peekX, x]);

  function stopAnimation() {
    animationRef.current?.stop();
    animationRef.current = null;
  }

  function stopPeekAnimation() {
    peekAnimationRef.current.forEach((animation) => animation.stop());
    peekAnimationRef.current = [];
  }

  function removeWindowListeners() {
    const listeners = listenersRef.current;
    if (!listeners) return;

    window.removeEventListener("pointermove", listeners.move);
    window.removeEventListener("pointerup", listeners.end);
    window.removeEventListener("pointercancel", listeners.cancel);
    listenersRef.current = null;
  }

  function clearGesture() {
    gestureRef.current = null;
    removeWindowListeners();
  }

  function setPeek(nextPeekState: PeekState | null) {
    const current = peekStateRef.current;
    const isSame =
      current?.direction === nextPeekState?.direction &&
      current?.targetHref === nextPeekState?.targetHref;

    if (isSame) return;

    peekStateRef.current = nextPeekState;
    setPeekState(nextPeekState);
  }

  function hidePeek() {
    stopPeekAnimation();
    const currentPeek = peekStateRef.current;
    const width = rootRef.current?.offsetWidth || window.innerWidth || 390;
    const animations = [
      animate(peekOpacity, 0, {
        duration: reduceMotion ? 0.01 : 0.16,
        ease: [0.4, 0, 0.2, 1],
      }),
    ];

    if (currentPeek) {
      animations.push(
        animate(peekX, getPreviewInitialX(currentPeek.direction, width), {
          duration: reduceMotion ? 0.01 : 0.2,
          ease: [0.4, 0, 0.2, 1],
        }),
        animate(peekScale, 1 - PREVIEW_MAX_SCALE_DELTA, {
          duration: reduceMotion ? 0.01 : 0.18,
          ease: [0.4, 0, 0.2, 1],
        })
      );
    }

    peekAnimationRef.current = animations;
    void Promise.all(animations.map(waitForAnimation)).then(() => {
      if (!gestureRef.current && !isCommittingRef.current) {
        resetPeek();
      }
    });
  }

  function resetPeek() {
    stopPeekAnimation();
    peekOpacity.set(0);
    peekX.set(0);
    peekScale.set(1 - PREVIEW_MAX_SCALE_DELTA);
    setPeek(null);
  }

  function updatePeek(
    targetHref: SwipeTargetRoute | null,
    direction: SwipeDirection,
    deltaX: number,
    width: number
  ) {
    if (!targetHref) {
      setPeek(null);
      peekOpacity.set(0);
      peekX.set(0);
      peekScale.set(1 - PREVIEW_MAX_SCALE_DELTA);
      return;
    }

    stopPeekAnimation();
    setPeek({ direction, targetHref });
    prefetchRoute(targetHref);

    const progress = Math.min(Math.abs(deltaX) / Math.max(width, 1), 1);

    peekOpacity.set(PREVIEW_MIN_OPACITY + progress * (1 - PREVIEW_MIN_OPACITY));
    peekX.set(getPreviewX(direction, deltaX, width));
    peekScale.set(1 - PREVIEW_MAX_SCALE_DELTA * (1 - progress));
  }

  function springBack() {
    if (isCommittingRef.current) return;
    stopAnimation();
    hidePeek();
    animationRef.current = animate(x, 0, {
      type: "spring",
      stiffness: reduceMotion ? 900 : 620,
      damping: reduceMotion ? 60 : 48,
      mass: 0.68,
    });
  }

  function finishNavigation(targetHref: string, direction: SwipeDirection, width: number) {
    if (isCommittingRef.current) return;

    const normalizedTarget = normalizeMainRoute(targetHref);
    if (!normalizedTarget || !isMainTabRoute(normalizedTarget)) {
      springBack();
      return;
    }

    const typedTarget = normalizedTarget;
    isCommittingRef.current = true;
    pendingRouteRef.current = typedTarget;
    setIsCommitting(true);
    setPendingRoute(typedTarget);
    setCommittedPreviewRoute(typedTarget);
    setIsCurrentLayerSuppressed(false);
    setPeek({ direction, targetHref: typedTarget });
    prefetchRoute(typedTarget);

    stopAnimation();
    stopPeekAnimation();
    const exitX = direction === "left" ? -width : width;
    const duration = reduceMotion ? 0.01 : COMMIT_ANIMATION_DURATION;

    if (peekOpacity.get() === 0) {
      peekX.set(getPreviewInitialX(direction, width));
      peekScale.set(1 - PREVIEW_MAX_SCALE_DELTA);
    }

    const currentAnimation = animate(x, exitX, {
      duration,
      ease: [0.25, 0.8, 0.25, 1],
    });
    const previewAnimation = animate(peekX, 0, {
      duration,
      ease: [0.25, 0.8, 0.25, 1],
    });
    const opacityAnimation = animate(peekOpacity, 1, {
      duration: reduceMotion ? 0.01 : 0.12,
      ease: [0.25, 0.8, 0.25, 1],
    });
    const scaleAnimation = animate(peekScale, 1, {
      duration,
      ease: [0.25, 0.8, 0.25, 1],
    });

    animationRef.current = currentAnimation;
    peekAnimationRef.current = [previewAnimation, opacityAnimation, scaleAnimation];
    void Promise.all([
      waitForAnimation(currentAnimation),
      waitForAnimation(previewAnimation),
      waitForAnimation(opacityAnimation),
      waitForAnimation(scaleAnimation),
    ]).then(() => {
      setIsCurrentLayerSuppressed(true);

      try {
        router.push(typedTarget);
      } catch {
        clearCommittedPreview();
        return;
      }

      clearCommitFallbackTimeout();
      commitFallbackTimeoutRef.current = setTimeout(() => {
        if (pendingRouteRef.current === typedTarget) {
          clearCommittedPreview();
        }
      }, COMMIT_FALLBACK_TIMEOUT_MS);
    });
  }

  function handlePointerMove(event: PointerEvent) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const now = performance.now();
    const elapsed = Math.max(now - gesture.lastTime, 1);

    gesture.velocityX = (event.clientX - gesture.lastX) / elapsed;
    gesture.lastX = event.clientX;
    gesture.lastTime = now;

    if (gesture.phase === "pending") {
      if (absX < AXIS_LOCK_DISTANCE && absY < AXIS_LOCK_DISTANCE) return;

      if (absY > absX) {
        clearGesture();
        return;
      }

      gesture.phase = "dragging";
    }

    const direction: SwipeDirection = deltaX < 0 ? "left" : "right";
    const targetRoute = getSwipeTarget(gesture.hostRoute, direction);
    const nextX = clampDrag(deltaX, gesture.width, Boolean(targetRoute));
    x.set(nextX);
    updatePeek(targetRoute, direction, nextX, gesture.width);

    if (event.cancelable) {
      event.preventDefault();
    }

    const isCommittedByVelocity =
      targetRoute &&
      absX >= MIN_FLICK_DISTANCE &&
      Math.abs(gesture.velocityX) >= COMMIT_VELOCITY &&
      Math.sign(gesture.velocityX) === Math.sign(deltaX);

    if (isCommittedByVelocity) {
      clearGesture();
      finishNavigation(targetRoute, direction, gesture.width);
    }
  }

  function handlePointerEnd(event: PointerEvent) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    clearGesture();

    if (gesture.phase !== "dragging") {
      springBack();
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const absX = Math.abs(deltaX);
    const direction: SwipeDirection = deltaX < 0 ? "left" : "right";
    const targetRoute = getSwipeTarget(gesture.hostRoute, direction);
    const distanceThreshold = getCommitDistance(gesture.width);
    const isCommittedByDistance = absX >= distanceThreshold;
    const isCommittedByVelocity =
      absX >= MIN_FLICK_DISTANCE &&
      Math.abs(gesture.velocityX) >= COMMIT_VELOCITY &&
      Math.sign(gesture.velocityX) === Math.sign(deltaX);

    if (targetRoute && (isCommittedByDistance || isCommittedByVelocity)) {
      finishNavigation(targetRoute, direction, gesture.width);
      return;
    }

    springBack();
  }

  function handlePointerCancel(event: PointerEvent) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    clearGesture();
    springBack();
  }

  function handlePointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if (isCommittingRef.current || isCommitting || pendingRoute) return;
    if (!isEnabledRoute || hasActiveOverlay()) return;
    if (!swipeHostRoute) return;
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (isInteractiveTarget(event.target)) return;
    if (isHorizontalScrollableAncestor(event.target, rootRef.current)) return;

    stopAnimation();
    removeWindowListeners();
    gestureRef.current = {
      pointerId: event.pointerId,
      hostRoute: swipeHostRoute,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocityX: 0,
      phase: "pending",
      width: rootRef.current?.offsetWidth || window.innerWidth || 390,
    };

    listenersRef.current = {
      move: handlePointerMove,
      end: handlePointerEnd,
      cancel: handlePointerCancel,
    };

    window.addEventListener("pointermove", listenersRef.current.move, { passive: false });
    window.addEventListener("pointerup", listenersRef.current.end);
    window.addEventListener("pointercancel", listenersRef.current.cancel);
  }

  useEffect(() => {
    const normalizedPathname = normalizeMainRoute(pathname);
    const pendingTarget = pendingRouteRef.current;

    if (isCommittingRef.current && pendingTarget) {
      if (normalizedPathname === pendingTarget) {
        clearCommittedPreview();
      }
      return;
    }

    x.set(0);
    peekAnimationRef.current.forEach((animation) => animation.stop());
    peekAnimationRef.current = [];
    peekOpacity.set(0);
    peekX.set(0);
    peekScale.set(1 - PREVIEW_MAX_SCALE_DELTA);
    peekStateRef.current = null;
    setPeekState(null);
    gestureRef.current = null;
    setCommittedPreviewRoute(null);
    setIsCurrentLayerSuppressed(false);
    const listeners = listenersRef.current;
    if (!listeners) return;

    window.removeEventListener("pointermove", listeners.move);
    window.removeEventListener("pointerup", listeners.end);
    window.removeEventListener("pointercancel", listeners.cancel);
    listenersRef.current = null;
  }, [clearCommittedPreview, pathname, peekOpacity, peekScale, peekX, x]);

  useEffect(() => {
    if (!isEnabledRoute) return;
    if (!swipeHostRoute) return;

    const adjacentTargets = getAdjacentSwipeTargets(swipeHostRoute);
    prefetchRoute(adjacentTargets.left);
    prefetchRoute(adjacentTargets.right);
  }, [isEnabledRoute, prefetchRoute, swipeHostRoute]);

  useEffect(() => {
    return () => {
      animationRef.current?.stop();
      peekAnimationRef.current.forEach((animation) => animation.stop());
      clearCommitFallbackTimeout();
      const listeners = listenersRef.current;
      if (!listeners) return;

      window.removeEventListener("pointermove", listeners.move);
      window.removeEventListener("pointerup", listeners.end);
      window.removeEventListener("pointercancel", listeners.cancel);
      listenersRef.current = null;
    };
  }, [clearCommitFallbackTimeout]);

  if (!isEnabledRoute && !isCommitting) {
    return <>{children}</>;
  }

  return (
    <div
      ref={rootRef}
      data-main-tab-swipe-root
      onPointerDownCapture={handlePointerDownCapture}
      style={{ touchAction: "pan-y pinch-zoom" }}
      className="relative min-h-full overflow-hidden bg-[#050505]"
    >
      {activePreviewRoute ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#050505] will-change-transform"
          style={{ opacity: peekOpacity, scale: peekScale, x: peekX }}
        >
          <DestinationPreview route={activePreviewRoute} />
        </motion.div>
      ) : null}
      <motion.div
        style={{ x }}
        className={`relative z-10 min-h-full bg-[#050505] will-change-transform ${
          isCurrentLayerSuppressed ? "invisible pointer-events-none" : ""
        }`}
      >
        {children}
      </motion.div>
    </div>
  );
}
