"use client";

import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { scheduleInstanceLayoutTokens } from "@/components/schedule/sharedLayout";

type LayoutPhase = "idle" | "morphing" | "modal";

export type ScheduleEditOrigin = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: string;
  backgroundColor?: string;
  backgroundImage?: string;
  boxShadow?: string;
};

type ScheduleMorphDialogProps = {
  open: boolean;
  title: string;
  subtitle?: string | null;
  typeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
  origin?: ScheduleEditOrigin | null;
  layoutId?: string;
  focusRef?: RefObject<HTMLElement>;
};

console.log("[ScheduleMorphDialog] MODULE LOADED");

export function ScheduleMorphDialog({
  open,
  title,
  subtitle,
  typeLabel,
  onClose,
  children,
  origin,
  layoutId,
  focusRef,
}: ScheduleMorphDialogProps) {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const effectiveLayoutId =
    layoutId && layoutId.length > 0 ? layoutId : undefined;
  const hasMorph = Boolean(effectiveLayoutId && origin);

  const [originSnapshot, setOriginSnapshot] =
    useState<ScheduleEditOrigin | null>(hasMorph && origin ? origin : null);
  const [layoutPhase, setLayoutPhase] = useState<LayoutPhase>(() => {
    if (!open) return "idle";
    return hasMorph ? "morphing" : "modal";
  });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bodyProbeRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  console.log("[ScheduleMorphDialog] RENDER", {
    open,
    hasMorph,
    layoutPhase,
    originProvided: Boolean(origin),
  });

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    console.log("[ScheduleMorphDialog] open effect", { open, hasMorph });
    if (!open) {
      setLayoutPhase("idle");
      return;
    }
    setLayoutPhase(hasMorph ? "morphing" : "modal");
  }, [open, hasMorph]);

  useEffect(() => {
    if (hasMorph && origin) {
      setOriginSnapshot(origin);
    }
  }, [hasMorph, origin]);

  useEffect(() => {
    if (!open || layoutPhase !== "modal") return;
    const timer = window.setTimeout(() => {
      focusRef?.current?.focus({ preventScroll: true });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [open, layoutPhase, focusRef]);

  useEffect(() => {
    if (!open) return;
    const target = scrollContainerRef.current;
    let frame = 0;
    const logMetrics = () => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const styles = window.getComputedStyle(target);
      console.log("[ScheduleMorphDialog] SCROLL METRICS", {
        layoutPhase,
        clientHeight: target.clientHeight,
        scrollHeight: target.scrollHeight,
        rectHeight: rect.height,
        rectTop: rect.top,
        overflowY: styles.overflowY,
      });
    };
    frame = window.requestAnimationFrame(logMetrics);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [open, layoutPhase]);

  useEffect(() => {
    if (!open) return;
    const probeNode = bodyProbeRef.current;
    let probeFrame = 0;
    const logProbeRect = () => {
      if (!probeNode) return;
      const rect = probeNode.getBoundingClientRect();
      console.log("[ScheduleMorphDialog] BODY PROBE RECT", {
        layoutPhase,
        height: rect.height,
        width: rect.width,
        top: rect.top,
        left: rect.left,
      });
    };
    probeFrame = window.requestAnimationFrame(logProbeRect);
    return () => {
      if (probeFrame) window.cancelAnimationFrame(probeFrame);
    };
  }, [open, layoutPhase]);

  const targetMetrics = useMemo(() => {
    const width = viewport.width || 520;
    const height = viewport.height || 720;
    const horizontalMargin = Math.min(80, Math.max(20, width * 0.07));
    const verticalMargin = Math.min(96, Math.max(56, height * 0.08));
    const usableWidth = Math.max(320, width - horizontalMargin * 2);
    const targetWidth = Math.min(560, usableWidth);
    const maxHeight = Math.max(420, Math.min(740, height - verticalMargin * 2));
    const preferredHeight = Math.min(
      maxHeight,
      Math.max(360, height - verticalMargin * 2)
    );
    return {
      width: targetWidth,
      maxWidth: Math.min(600, usableWidth),
      maxHeight,
      height: preferredHeight,
      marginX: horizontalMargin,
    };
  }, [viewport.width, viewport.height]);

  const layoutTokens = useMemo(
    () =>
      effectiveLayoutId
        ? scheduleInstanceLayoutTokens(effectiveLayoutId)
        : null,
    [effectiveLayoutId]
  );

  const handleLayoutComplete = () => {
    if (open) {
      setLayoutPhase("modal");
      console.log("[ScheduleMorphDialog] layout animation complete", {
        hasMorph,
        originSnapshot: Boolean(originSnapshot),
      });
    }
  };

  const scrimTransition = { duration: 0.24, ease: [0.4, 0, 0.2, 1] as const };

  return (
    <AnimatePresence
      mode="wait"
      onExitComplete={() => {
        setLayoutPhase("idle");
        setOriginSnapshot(null);
      }}
    >
      {open ? (
        <motion.div
          key="schedule-morph-dialog"
          className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-8 sm:px-6 md:px-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={scrimTransition}
          role="presentation"
        >
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 cursor-pointer bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={scrimTransition}
            onClick={onClose}
          />
          <motion.div
            {...(hasMorph ? { layout: true, layoutId: effectiveLayoutId } : {})}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-phase={layoutPhase}
            className={cn(
              "relative z-10 w-full rounded-[32px] border border-white/10 bg-[var(--surface-elevated)] text-white shadow-[0_32px_80px_rgba(5,8,22,0.78)] backdrop-blur",
              layoutPhase !== "modal" && "pointer-events-none"
            )}
            style={{
              width: targetMetrics.width,
              maxWidth: `min(${targetMetrics.maxWidth}px, calc(100vw - ${
                targetMetrics.marginX * 2
              }px))`,
              height: targetMetrics.height,
              maxHeight: targetMetrics.maxHeight,
            }}
            transition={{
              type: "spring",
              stiffness: 150,
              damping: 22,
              mass: 0.9,
            }}
            onLayoutAnimationComplete={handleLayoutComplete}
          >
            <div className="relative flex h-full w-full min-h-0 flex-col overflow-hidden rounded-[inherit]">
              {originSnapshot ? (
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
                  style={{
                    backgroundColor: originSnapshot.backgroundColor,
                    backgroundImage: originSnapshot.backgroundImage,
                    boxShadow: originSnapshot.boxShadow,
                  }}
                  initial={false}
                  animate={{ opacity: layoutPhase === "modal" ? 0 : 1 }}
                  transition={{
                    duration: 0.36,
                    ease: [0.33, 1, 0.68, 1] as const,
                  }}
                />
              ) : null}
              <div className="relative z-10 flex max-h-full flex-1 flex-col min-h-0">
                <AnimatePresence initial={false} mode="wait">
                  {layoutPhase !== "modal" ? (
                    <motion.div
                      key="card-chrome"
                      className="px-4 py-4 sm:px-5 sm:py-5"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{
                        opacity: 0,
                        y: -8,
                        transition: {
                          duration: 0.24,
                          ease: [0.4, 0, 0.2, 1] as const,
                        },
                      }}
                    >
                      <motion.p
                        layoutId={layoutTokens?.title}
                        id={layoutPhase !== "modal" ? titleId : undefined}
                        className="text-sm font-medium leading-tight sm:text-base"
                      >
                        {title}
                      </motion.p>
                      {subtitle ? (
                        <motion.p
                          layoutId={layoutTokens?.meta}
                          className="mt-1 text-xs text-white/70 sm:text-sm"
                        >
                          {subtitle}
                        </motion.p>
                      ) : null}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <AnimatePresence initial={false} mode="wait">
                  {layoutPhase === "modal" ? (
                    <motion.div
                      key="modal-content"
                      className="relative flex flex-1 min-h-0 flex-col"
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 18 }}
                      transition={{
                        duration: 0.32,
                        ease: [0.2, 0.8, 0.2, 1] as const,
                      }}
                    >
                      <div
                        ref={scrollContainerRef}
                        className="flex-1 overflow-y-auto px-4 pb-5 pt-2 sm:px-5 sm:pb-6 sm:pt-3 touch-pan-y overscroll-contain min-h-0"
                      >
                        <motion.div
                          className="sticky top-0 z-10 bg-[var(--surface-elevated)]/92 pb-3 backdrop-blur"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 12 }}
                          transition={{
                            duration: 0.26,
                            ease: [0.2, 0.8, 0.2, 1] as const,
                          }}
                        >
                          <motion.p
                            layoutId={layoutTokens?.title}
                            id={titleId}
                            className="text-lg font-semibold leading-tight text-white sm:text-xl"
                          >
                            {title}
                          </motion.p>
                          {subtitle ? (
                            <motion.p
                              layoutId={layoutTokens?.meta}
                              className="mt-1 text-sm text-white/70"
                            >
                              {subtitle}
                            </motion.p>
                          ) : null}
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{
                              duration: 0.24,
                              ease: [0.33, 1, 0.68, 1] as const,
                              delay: 0.08,
                            }}
                            className="mt-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/60"
                          >
                            {typeLabel}
                          </motion.p>
                        </motion.div>
                        <div
                          ref={bodyProbeRef}
                          className="relative flex flex-col gap-4 pt-3 pb-4"
                          onClick={() =>
                            console.log(
                              "[ScheduleMorphDialog] body click received",
                              {
                                layoutPhase,
                              }
                            )
                          }
                        >
                          {children}
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
