"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

export type TourStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  requiresClick?: boolean;
  allowNext?: boolean;
  canSkip?: boolean;
  blockOutsideClicks?: boolean;
  onBeforeNext?: () => Promise<void> | void;
  waitForSelector?: boolean;
  advanceOnEvent?: { type: "click" | "custom"; eventName?: string };
  waitForEvent?: { type: "custom"; eventName: string };
  navigateTo?: string;
};

type TourSession = {
  id: string;
  steps: TourStep[];
  currentIndex: number;
  onFinish?: () => void;
};

type TourContextValue = {
  startTour: (steps: TourStep[], onFinish?: () => void) => void;
};

const TourContext = createContext<TourContextValue | null>(null);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const OVERLAY_Z_INDEX = 2147483646;
const HIGHLIGHT_Z_INDEX = OVERLAY_Z_INDEX + 1;
const TARGET_Z_INDEX = OVERLAY_Z_INDEX + 2;
const TOOLTIP_Z_INDEX = OVERLAY_Z_INDEX + 3;
const TOOLTIP_PADDING = 12;
const TOOLTIP_WIDTH = 260;

const hasFabEventAlreadyFired = (eventName?: string) => {
  if (typeof window === "undefined" || !eventName) {
    return false;
  }
  if (eventName === "tour:fab-opened") {
    return Boolean((window as any).__CREATOR_FAB_IS_OPEN__);
  }
  if (eventName === "tour:fab-ai-opened") {
    return Boolean((window as any).__CREATOR_FAB_AI_IS_OPEN__);
  }
  return false;
};

export function TourProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TourSession | null>(null);
  const [targetElement, setTargetElement] = useState<Element | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [
    tooltipPosition,
    setTooltipPosition,
  ] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [awaitingClick, setAwaitingClick] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [lookupKey, setLookupKey] = useState(0);
  const [missingTarget, setMissingTarget] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const advancingRef = useRef(false);
  const clickedThisStepRef = useRef(false);
  const pendingFinishRef = useRef<(() => void) | null>(null);
  const setTourActive = useCallback((active: boolean) => {
    if (typeof window === "undefined") {
      return;
    }
    (window as any).__CREATOR_TOUR_ACTIVE__ = active;
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      setTourActive(false);
    };
  }, [setTourActive]);

  const finishTour = useCallback(() => {
    setSession((prev) => {
      if (!prev) return null;
      pendingFinishRef.current = prev.onFinish ?? null;
      return null;
    });
    setTourActive(false);
  }, [setTourActive]);

  const goToNextStep = useCallback(() => {
    setSession((prev) => {
      if (!prev) return null;
      const nextIndex = prev.currentIndex + 1;
      if (nextIndex >= prev.steps.length) {
        pendingFinishRef.current = prev.onFinish ?? null;
        setTourActive(false);
        return null;
      }
      return { ...prev, currentIndex: nextIndex };
    });
  }, [setTourActive]);

  const startTour = useCallback((steps: TourStep[], onFinish?: () => void) => {
    if (steps.length === 0) {
      onFinish?.();
      return;
    }
    setTourActive(true);
    setSession({
      id: `tour-${steps[0]?.id ?? Date.now()}`,
      steps,
      currentIndex: 0,
      onFinish,
    });
  }, [setTourActive]);

  const currentStep = session?.steps[session.currentIndex] ?? null;
  const shouldBlockOutsideClicks = currentStep?.blockOutsideClicks ?? true;
  const shouldAdvanceAfterCustomEvent = Boolean(
    currentStep?.requiresClick &&
      currentStep?.allowNext === false &&
      currentStep?.advanceOnEvent?.type === "custom"
  );

  const advanceStep = useCallback(async () => {
    if (!currentStep || advancingRef.current) return;
    advancingRef.current = true;
    setIsAdvancing(true);
    try {
      await currentStep.onBeforeNext?.();
    } catch (error) {
      console.error("Tour step hook failed:", error);
    } finally {
      goToNextStep();
      advancingRef.current = false;
      setIsAdvancing(false);
    }
  }, [currentStep, goToNextStep]);

  const markAdvanced = useCallback(async () => {
    setAwaitingClick(false);
    await advanceStep();
  }, [advanceStep]);

  useEffect(() => {
    if (!currentStep?.navigateTo) return;
    if (currentStep.navigateTo !== pathname) {
      router.push(currentStep.navigateTo);
    }
  }, [currentStep, pathname, router]);

  useEffect(() => {
    advancingRef.current = false;
    clickedThisStepRef.current = false;
    setAwaitingClick(currentStep?.requiresClick ?? false);
    setTargetElement(null);
    setHighlightRect(null);
    setTooltipPosition(null);
    setMissingTarget(false);
    if (currentStep) {
      setLookupKey((prev) => prev + 1);
    }
  }, [
    currentStep?.id,
    currentStep?.requiresClick,
    currentStep?.selector,
    currentStep?.navigateTo,
  ]);

  useEffect(() => {
    if (!currentStep) {
      return;
    }
    if (typeof window === "undefined") return;

    const requiresNavigation =
      Boolean(currentStep.navigateTo) &&
      currentStep.navigateTo !== pathname;
    const shouldWaitForSelector = currentStep.waitForSelector ?? true;
    setTargetElement(null);
    setHighlightRect(null);
    setTooltipPosition(null);
    setMissingTarget(false);
    if (requiresNavigation) {
      return;
    }

    if (!shouldWaitForSelector) {
      const target = document.querySelector(currentStep.selector);
      if (target) {
        setTargetElement(target);
        setMissingTarget(false);
        target.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      } else {
        setMissingTarget(true);
      }
      return;
    }

    const requiresClick = Boolean(currentStep.requiresClick);
    const TIMEOUT = requiresClick ? 60000 : 8000;
    const allowMissingTarget = !requiresClick;
    const POLL_INTERVAL = 100;

    const startReadinessLoop = () => {
      let cancelled = false;
      let observer: MutationObserver | null = null;
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let rafId: number | null = null;
      let pendingMutationFrame = false;
      let hasMatched = false;
      let hasTimedOut = false;
      const startTime = Date.now();

      const cleanup = () => {
        if (intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      };

      const markMissing = () => {
        if (!allowMissingTarget) return;
        if (!hasTimedOut) {
          hasTimedOut = true;
          setMissingTarget(true);
        }
      };

      const handleReady = (element: Element) => {
        hasMatched = true;
        cleanup();
        setMissingTarget(false);
        setTargetElement(element);
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      };

      const runReadinessCheck = () => {
        if (cancelled || hasMatched) return;
        const now = Date.now();
        const target = document.querySelector(currentStep.selector);
        if (target) {
          const rect = target.getBoundingClientRect();
          const styles = window.getComputedStyle(target);
          const hasVisibleRect = rect.width > 0 && rect.height > 0;
          const isElementVisible =
            styles.display !== "none" && styles.visibility !== "hidden";
          if (hasVisibleRect && isElementVisible) {
            handleReady(target);
            return;
          }
        }
        if (now - startTime >= TIMEOUT) {
          markMissing();
        }
      };

      const scheduleMutationCheck = () => {
        if (pendingMutationFrame || hasMatched) return;
        pendingMutationFrame = true;
        rafId = requestAnimationFrame(() => {
          pendingMutationFrame = false;
          runReadinessCheck();
        });
      };

      const root = window.document.body;
      if (root) {
        observer = new MutationObserver(() => {
          scheduleMutationCheck();
        });
        observer.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
        });
      }

      runReadinessCheck();
      intervalId = window.setInterval(runReadinessCheck, POLL_INTERVAL);

      return () => {
        cancelled = true;
        cleanup();
      };
    };

    let readinessCleanup: (() => void) | null = null;
    let eventListenerCleanup: (() => void) | null = null;

    const triggerReadiness = () => {
      readinessCleanup?.();
      readinessCleanup = startReadinessLoop();
    };

    const waitForEventConfig =
      currentStep.waitForEvent?.type === "custom"
        ? currentStep.waitForEvent
        : null;

    if (waitForEventConfig) {
      const eventName = waitForEventConfig.eventName;
      const alreadyFired = hasFabEventAlreadyFired(eventName);

      const startAfterEvent = () => {
        eventListenerCleanup?.();
        eventListenerCleanup = null;
        triggerReadiness();
      };

      if (alreadyFired) {
        startAfterEvent();
      } else {
        const handler = () => {
          startAfterEvent();
        };
        window.addEventListener(eventName, handler, { once: true });
        eventListenerCleanup = () => {
          window.removeEventListener(eventName, handler);
        };
      }
    } else {
      triggerReadiness();
    }

    return () => {
      readinessCleanup?.();
      eventListenerCleanup?.();
    };
  }, [currentStep, pathname, lookupKey]);

  useEffect(() => {
    if (!targetElement) {
      setHighlightRect(null);
      setTooltipPosition(null);
      return;
    }
    if (!targetElement.isConnected) {
      setMissingTarget(true);
      setTargetElement(null);
      setHighlightRect(null);
      setTooltipPosition(null);
      return;
    }

    let rafId: number | null = null;
    const updatePositions = () => {
      if (!targetElement) return;
      const rect = targetElement.getBoundingClientRect();
      setHighlightRect(rect);

      const left = clamp(
        rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2,
        TOOLTIP_PADDING,
        Math.max(window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_PADDING, TOOLTIP_PADDING),
      );
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow >= 180) {
        setTooltipPosition({ left, top: rect.bottom + TOOLTIP_PADDING });
      } else if (spaceAbove >= 180) {
        setTooltipPosition({ left, bottom: window.innerHeight - rect.top + TOOLTIP_PADDING });
      } else {
        const maxTop = Math.max(window.innerHeight - TOOLTIP_PADDING - 120, TOOLTIP_PADDING);
        const top = clamp(
          rect.bottom + TOOLTIP_PADDING,
          TOOLTIP_PADDING,
          maxTop,
        );
        setTooltipPosition({ left, top });
      }
    };

    const scheduleUpdate = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(updatePositions);
    };

    scheduleUpdate();
    const handleScroll = () => scheduleUpdate();
    const handleResize = () => scheduleUpdate();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [targetElement]);

  useEffect(() => {
    if (!targetElement || !(targetElement instanceof HTMLElement)) return;
    const previousPointerEvents = targetElement.style.pointerEvents;
    const previousZIndex = targetElement.style.zIndex;
    targetElement.style.pointerEvents = "auto";
    targetElement.style.zIndex = String(TARGET_Z_INDEX);
    return () => {
      targetElement.style.pointerEvents = previousPointerEvents;
      targetElement.style.zIndex = previousZIndex;
    };
  }, [targetElement]);

  useEffect(() => {
    if (!currentStep?.requiresClick || !targetElement) return;
    if (!(targetElement instanceof HTMLElement)) return;
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !targetElement.contains(event.target)) {
        return;
      }
      if (shouldAdvanceAfterCustomEvent) {
        clickedThisStepRef.current = true;
        return;
      }
      void markAdvanced();
    };
    targetElement.addEventListener("click", handleClick, true);
    return () => {
      targetElement.removeEventListener("click", handleClick, true);
    };
  }, [
    currentStep?.id,
    currentStep?.requiresClick,
    markAdvanced,
    shouldAdvanceAfterCustomEvent,
    targetElement,
  ]);

  useEffect(() => {
    const advanceConfig = currentStep?.advanceOnEvent;
    if (!advanceConfig) return;
    if (typeof window === "undefined") return;

    if (advanceConfig.type === "custom") {
      if (!advanceConfig.eventName) return;
      const handleCustomEvent = (event: Event) => {
        event.stopPropagation();
        if (shouldAdvanceAfterCustomEvent && !clickedThisStepRef.current) {
          return;
        }
        clickedThisStepRef.current = false;
        void markAdvanced();
      };
      window.addEventListener(advanceConfig.eventName, handleCustomEvent);
      return () => {
        window.removeEventListener(advanceConfig.eventName, handleCustomEvent);
      };
    }

      if (
        advanceConfig.type === "click" &&
        targetElement &&
        targetElement instanceof HTMLElement
      ) {
        const handleTargetClick = (event: MouseEvent) => {
          if (!(event.target instanceof Node) || !targetElement.contains(event.target)) {
            return;
          }
          if (shouldAdvanceAfterCustomEvent) {
            clickedThisStepRef.current = true;
            return;
          }
          void markAdvanced();
        };
        targetElement.addEventListener("click", handleTargetClick, true);
        return () => {
          targetElement.removeEventListener("click", handleTargetClick, true);
        };
      }
    return;
  }, [
    currentStep?.advanceOnEvent,
    currentStep?.requiresClick,
    currentStep?.allowNext,
    shouldAdvanceAfterCustomEvent,
    targetElement,
    markAdvanced,
  ]);

  useEffect(() => {
    if (!session) {
      setHighlightRect(null);
      setTooltipPosition(null);
      setTargetElement(null);
      setAwaitingClick(false);
      setIsAdvancing(false);
      advancingRef.current = false;
      clickedThisStepRef.current = false;
      setMissingTarget(false);
      setLookupKey(0);
      setTourActive(false);
    }
  }, [session, setTourActive]);

  const contextValue = useMemo(() => ({ startTour }), [startTour]);

  useEffect(() => {
    if (session !== null) return;
    const callback = pendingFinishRef.current;
    if (!callback) {
      return;
    }
    const runCallback = () => {
      callback();
      pendingFinishRef.current = null;
    };
    if (typeof queueMicrotask === "function") {
      queueMicrotask(runCallback);
    } else {
      Promise.resolve().then(runCallback);
    }
  }, [session]);

  const isLastStep =
    Boolean(session) && session.currentIndex >= (session.steps.length - 1);
  const showNextButton = currentStep?.allowNext ?? true;
  const showSkipButton = currentStep?.canSkip !== false;
  const waitingForGuidedAction =
    Boolean(currentStep?.requiresClick && awaitingClick);
  const nextDisabled = waitingForGuidedAction || isAdvancing;
  const handleNextClick = () => {
    if (nextDisabled) return;
    void advanceStep();
  };

  const retryFindingTarget = () => {
    if (!currentStep) return;
    setMissingTarget(false);
    setTargetElement(null);
    setHighlightRect(null);
    setTooltipPosition(null);
    setLookupKey((prev) => prev + 1);
  };

  const handleContinueFromMissing = () => {
    if (!missingTarget) return;
    setMissingTarget(false);
    void advanceStep();
  };

  const stopOverlayInteraction = useCallback(
    (event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  const stopOverlayCapture = useCallback(
    (
      event:
        | PointerEvent<HTMLDivElement>
        | MouseEvent<HTMLDivElement>
        | TouchEvent<HTMLDivElement>
    ) => {
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  const handleOverlayPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      stopOverlayInteraction(event);
    },
    [stopOverlayInteraction]
  );

  const handleOverlayMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      stopOverlayInteraction(event);
    },
    [stopOverlayInteraction]
  );

  const tooltipStyle: CSSProperties = tooltipPosition
    ? {
        left: tooltipPosition.left,
        top: tooltipPosition.top,
        bottom: tooltipPosition.bottom,
        position: "absolute",
        maxWidth: TOOLTIP_WIDTH,
      }
    : {
        left: "50%",
        top: "50%",
        position: "absolute",
        transform: "translate(-50%, -50%)",
        maxWidth: TOOLTIP_WIDTH,
      };
  const missingPanelStyle: CSSProperties = {
    left: "50%",
    top: "50%",
    position: "absolute",
    transform: "translate(-50%, -50%)",
    maxWidth: TOOLTIP_WIDTH,
  };

  const overlayStyle: CSSProperties = highlightRect
    ? (() => {
        const centerX = highlightRect.left + highlightRect.width / 2;
        const centerY = highlightRect.top + highlightRect.height / 2;
        const radius =
          Math.hypot(highlightRect.width, highlightRect.height) / 2 + 24;
        const stop = radius + 32;
        const gradient = `radial-gradient(circle at ${centerX}px ${centerY}px, transparent ${radius}px, black ${stop}px)`;
        return {
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          maskImage: gradient,
          WebkitMaskImage: gradient,
          zIndex: OVERLAY_Z_INDEX,
          pointerEvents: "none",
        };
      })()
    : {
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        zIndex: OVERLAY_Z_INDEX,
        pointerEvents: "none",
      };

  return (
    <TourContext.Provider value={contextValue}>
      {children}
      {mounted && session && currentStep
        ? createPortal(
            <div
              className="fixed inset-0 pointer-events-none"
              style={{ zIndex: OVERLAY_Z_INDEX }}
              onPointerDownCapture={stopOverlayCapture}
              onMouseDownCapture={stopOverlayCapture}
              onTouchStartCapture={stopOverlayCapture}
            >
              <div
                className="absolute inset-0"
                style={overlayStyle}
              />
              {highlightRect ? (
                <>
                  {shouldBlockOutsideClicks ? (
                    <>
                      <div
                        className="pointer-events-auto absolute bg-transparent"
                        onMouseDown={handleOverlayMouseDown}
                        onPointerDown={handleOverlayPointerDown}
                        style={{
                          top: 0,
                          left: 0,
                          right: 0,
                          height: Math.max(0, highlightRect.top),
                          zIndex: OVERLAY_Z_INDEX,
                        }}
                      />
                      <div
                        className="pointer-events-auto absolute bg-transparent"
                        onMouseDown={handleOverlayMouseDown}
                        onPointerDown={handleOverlayPointerDown}
                        style={{
                          top: highlightRect.top,
                          left: 0,
                          width: Math.max(0, highlightRect.left),
                          height: Math.max(0, highlightRect.height),
                          zIndex: OVERLAY_Z_INDEX,
                        }}
                      />
                      <div
                        className="pointer-events-auto absolute bg-transparent"
                        onMouseDown={handleOverlayMouseDown}
                        onPointerDown={handleOverlayPointerDown}
                        style={{
                          top: highlightRect.top,
                          left: highlightRect.left + highlightRect.width,
                          right: 0,
                          height: Math.max(0, highlightRect.height),
                          zIndex: OVERLAY_Z_INDEX,
                        }}
                      />
                      <div
                        className="pointer-events-auto absolute bg-transparent"
                        onMouseDown={handleOverlayMouseDown}
                        onPointerDown={handleOverlayPointerDown}
                        style={{
                          left: 0,
                          right: 0,
                          bottom: 0,
                          top: highlightRect.top + highlightRect.height,
                          zIndex: OVERLAY_Z_INDEX,
                        }}
                      />
                    </>
                  ) : null}
                  <div
                    className="pointer-events-none absolute rounded-2xl border border-white/60 shadow-[0_0_0_12px_rgba(0,0,0,0.35)]"
                    style={{
                      top: highlightRect.top - 8,
                      left: highlightRect.left - 8,
                      width: highlightRect.width + 16,
                      height: highlightRect.height + 16,
                      zIndex: HIGHLIGHT_Z_INDEX,
                    }}
                  />
                </>
              ) : null}
              {missingTarget ? (
                <div
                  className="pointer-events-auto"
                  style={{ ...missingPanelStyle, zIndex: TOOLTIP_Z_INDEX }}
                >
                  <div className="w-full rounded-2xl border border-white/20 bg-[#05070E]/95 p-4 text-white shadow-[0_15px_60px_rgba(0,0,0,0.55)]">
                    <p className="text-xs leading-relaxed text-white/80">
                      I can’t find the highlighted element. The UI may not be ready.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={retryFindingTarget}
                        className="rounded-full border border-white/30 bg-transparent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70 transition hover:text-white"
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={handleContinueFromMissing}
                        disabled={isAdvancing}
                        className={`rounded-full bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition ${isAdvancing ? "cursor-not-allowed opacity-50" : "hover:bg-white/20"}`}
                      >
                        Continue
                      </button>
                      {showSkipButton ? (
                        <button
                          type="button"
                          onClick={finishTour}
                          className="rounded-full border border-white/30 bg-transparent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70 transition hover:text-white"
                        >
                          Skip
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="pointer-events-auto"
                  style={{ ...tooltipStyle, zIndex: TOOLTIP_Z_INDEX }}
                >
                  <div className="w-full rounded-2xl border border-white/20 bg-[#05070E]/95 p-4 text-white shadow-[0_15px_60px_rgba(0,0,0,0.55)]">
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                        Step {session.currentIndex + 1} of {session.steps.length}
                      </p>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-white">
                        {currentStep.title}
                      </h3>
                      <p className="text-xs leading-relaxed text-white/80">
                        {currentStep.body}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-2">
                      {showSkipButton ? (
                        <button
                          type="button"
                          onClick={finishTour}
                          className="rounded-full border border-white/30 bg-transparent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70 transition hover:text-white"
                        >
                          Skip
                        </button>
                      ) : null}
                      {showNextButton ? (
                        <button
                          type="button"
                          onClick={handleNextClick}
                          disabled={nextDisabled}
                          className={`rounded-full bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition ${nextDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-white/20"}`}
                        >
                          {isLastStep ? "Finish" : "Next"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </TourContext.Provider>
  );
}

export function useTour(steps: TourStep[], onFinish?: () => void) {
  const context = useContext(TourContext);
  const start = useCallback(() => {
    context?.startTour(steps, onFinish);
  }, [context, steps, onFinish]);
  return { start };
}
