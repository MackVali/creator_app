"use client";

import React from "react";
import { useEffect, useMemo, useRef, useState, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";
import { toLocal } from "@/lib/time/tz";
import { cn } from "@/lib/utils";
import { scheduleInstanceLayoutTokens } from "@/components/schedule/sharedLayout";

type LayoutPhase = "idle" | "morphing" | "modal";

type ScheduleInstanceEditSheetProps = {
  open: boolean;
  instance: ScheduleInstance | null;
  eventTitle: string;
  eventTypeLabel: string;
  timeZoneLabel?: string | null;
  onClose: () => void;
  onSubmit: (payload: { startLocal: string; endLocal: string }) => void;
  saving?: boolean;
  error?: string | null;
  origin?: ScheduleEditOrigin | null;
  layoutId?: string;
};

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

const INPUT_PLACEHOLDER = "Select date & time";

export function ScheduleInstanceEditSheet({
  open,
  instance,
  eventTitle,
  eventTypeLabel,
  timeZoneLabel,
  onClose,
  onSubmit,
  saving = false,
  error,
  origin,
  layoutId,
}: ScheduleInstanceEditSheetProps) {
  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const startInputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const [originSnapshot, setOriginSnapshot] = useState<ScheduleEditOrigin | null>(
    origin ?? null,
  );
  const [layoutPhase, setLayoutPhase] = useState<LayoutPhase>(
    open ? "morphing" : "idle",
  );

  useEffect(() => {
    if (!instance) {
      setStartValue("");
      setEndValue("");
      return;
    }
    const startDate = toLocal(instance.start_utc);
    const endDate = toLocal(instance.end_utc);
    setStartValue(formatLocalInput(startDate));
    setEndValue(formatLocalInput(endDate));
  }, [instance]);

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
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
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setLayoutPhase("idle");
      return;
    }
    setLayoutPhase("morphing");
  }, [open]);

  useEffect(() => {
    if (origin) {
      setOriginSnapshot(origin);
    }
  }, [origin]);

  useEffect(() => {
    if (open && layoutPhase === "modal") {
      const focusTimeout = window.setTimeout(() => {
        startInputRef.current?.focus({ preventScroll: true });
      }, 90);
      return () => window.clearTimeout(focusTimeout);
    }
    return undefined;
  }, [open, layoutPhase]);

  const durationLabel = useMemo(() => {
    if (!startValue || !endValue) return null;
    const start = Date.parse(startValue);
    const end = Date.parse(endValue);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return null;
    }
    const minutes = Math.round((end - start) / 60000);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return null;
    }
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }, [startValue, endValue]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!startValue || !endValue || !instance) return;
    onSubmit({ startLocal: startValue, endLocal: endValue });
  };

  const disableSubmit =
    saving ||
    !instance ||
    !startValue ||
    !endValue ||
    !isValidDateInput(startValue) ||
    !isValidDateInput(endValue);

  const targetWidth = useMemo(() => {
    if (!viewport.width) return 520;
    const padded = viewport.width - 32;
    return Math.min(Math.max(320, padded), 560);
  }, [viewport.width]);

  const maxDialogHeight = useMemo(() => {
    if (!viewport.height) return 640;
    const capped = viewport.height - 80;
    return Math.min(Math.max(360, capped), 640);
  }, [viewport.height]);

  const effectiveLayoutId = layoutId ?? (instance ? `schedule-instance-${instance.id}` : undefined);
  const layoutTokens = useMemo(
    () => (effectiveLayoutId ? scheduleInstanceLayoutTokens(effectiveLayoutId) : null),
    [effectiveLayoutId],
  );

  const handleLayoutComplete = () => {
    if (!open) return;
    setLayoutPhase("modal");
  };

  const scrimTransition = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };

  const timeRangeLabel = useMemo(() => {
    if (!instance) return null;
    const startDate = toLocal(instance.start_utc);
    const endDate = toLocal(instance.end_utc);
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return null;
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) return null;
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const startLabel = formatter.format(startDate);
    const endLabel = formatter.format(endDate);
    const zoneLabel = timeZoneLabel ? ` • ${timeZoneLabel}` : "";
    return `${startLabel} – ${endLabel}${zoneLabel}`;
  }, [instance, timeZoneLabel]);

  const dynamicStyle = useMemo(() => {
    if (!open) return undefined;
    const targetRadius =
      layoutPhase === "modal"
        ? "28px"
        : originSnapshot?.borderRadius ?? "24px";
    return {
      width: targetWidth,
      maxWidth: "min(560px, calc(100vw - 32px))",
      maxHeight: maxDialogHeight,
      borderRadius: targetRadius,
    } as React.CSSProperties;
  }, [open, layoutPhase, maxDialogHeight, originSnapshot, targetWidth]);

  return (
    <AnimatePresence
      mode="wait"
      onExitComplete={() => {
        setLayoutPhase("idle");
        setOriginSnapshot(null);
      }}
    >
      {open && instance ? (
        <motion.div
          key="schedule-edit-dialog"
          className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-8"
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
            ref={dialogRef}
            layout
            layoutId={effectiveLayoutId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-phase={layoutPhase}
            className={cn(
              "relative z-10 w-full max-w-lg rounded-3xl border border-white/12 bg-[var(--surface-elevated)] text-white shadow-[0_32px_80px_rgba(5,8,22,0.78)]",
              layoutPhase !== "modal" && "pointer-events-none"
            )}
            style={dynamicStyle}
            transition={{ type: "spring", stiffness: 150, damping: 22, mass: 0.9 }}
            onLayoutAnimationComplete={handleLayoutComplete}
          >
            <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[inherit]">
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
                  transition={{ duration: 0.36, ease: [0.33, 1, 0.68, 1] as const }}
                />
              ) : null}
              <div className="relative z-10 flex flex-1 flex-col">
                <AnimatePresence initial={false} mode="wait">
                  {layoutPhase !== "modal" ? (
                    <motion.div
                      key="card-chrome"
                      className="px-4 py-4 sm:px-5 sm:py-5"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const } }}
                    >
                      <motion.p
                        layoutId={layoutTokens?.title}
                        id={titleId}
                        className="text-sm font-medium leading-tight sm:text-base"
                      >
                        {eventTitle}
                      </motion.p>
                      {timeRangeLabel ? (
                        <motion.p
                          layoutId={layoutTokens?.meta}
                          className="mt-1 text-xs text-white/70 sm:text-sm"
                        >
                          {timeRangeLabel}
                        </motion.p>
                      ) : null}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="modal-chrome"
                      className="px-4 pt-4 pb-2 sm:px-5 sm:pt-5 sm:pb-4"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 12, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const } }}
                      transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] as const }}
                    >
                      <motion.p
                        layoutId={layoutTokens?.title}
                        id={titleId}
                        className="text-lg font-semibold leading-tight text-white sm:text-xl"
                      >
                        {eventTitle}
                      </motion.p>
                      {timeRangeLabel ? (
                        <motion.p
                          layoutId={layoutTokens?.meta}
                          className="mt-1 text-sm text-white/70"
                        >
                          {timeRangeLabel}
                        </motion.p>
                      ) : null}
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.24, ease: [0.33, 1, 0.68, 1] as const, delay: 0.08 }}
                        className="mt-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/60"
                      >
                        {eventTypeLabel}
                      </motion.p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence mode="wait">
                  {layoutPhase === "modal" ? (
                    <motion.div
                      key="modal-body"
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 18 }}
                      transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] as const }}
                      className="relative z-10 flex flex-1 flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-6"
                    >
                      <button
                        type="button"
                        onClick={onClose}
                        className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 p-1 text-white transition hover:bg-white/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/80"
                      >
                        <XIcon className="size-4" aria-hidden="true" />
                        <span className="sr-only">Close</span>
                      </button>
                      <h2 className="text-lg font-semibold tracking-tight text-white">
                        Edit scheduled {eventTypeLabel.toLowerCase()}
                      </h2>
                      <p className="text-sm text-white/70">
                        Update the scheduled time for this entry. Times are interpreted in {timeZoneLabel ?? "your local time"}.
                      </p>
                      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="schedule-edit-start" className="text-xs uppercase tracking-[0.2em] text-white/60">
                            Start
                          </Label>
                          <Input
                            ref={startInputRef}
                            id="schedule-edit-start"
                            type="datetime-local"
                            value={startValue}
                            onChange={event => setStartValue(event.target.value)}
                            className="border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
                            required
                            disabled={!instance}
                            placeholder={INPUT_PLACEHOLDER}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="schedule-edit-end" className="text-xs uppercase tracking-[0.2em] text-white/60">
                            End
                          </Label>
                          <Input
                            id="schedule-edit-end"
                            type="datetime-local"
                            value={endValue}
                            onChange={event => setEndValue(event.target.value)}
                            className="border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
                            required
                            disabled={!instance}
                            placeholder={INPUT_PLACEHOLDER}
                          />
                          <p className="text-xs text-white/50">
                            {durationLabel
                              ? `Duration: ${durationLabel}`
                              : "Ensure end time is after the start time."}
                          </p>
                        </div>
                        {error ? (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                            {error}
                          </div>
                        ) : null}
                        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
                            onClick={onClose}
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            className={cn(
                              "bg-white text-zinc-900 hover:bg-white/90",
                              disableSubmit && "opacity-50"
                            )}
                            disabled={disableSubmit}
                          >
                            {saving ? "Saving…" : "Save changes"}
                          </Button>
                        </div>
                      </form>
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

function formatLocalInput(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function isValidDateInput(value: string) {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}
