"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getDateTimeParts, setTimeInTimeZone } from "@/lib/scheduler/timezone";

export const OVERLAY_DURATION_MS = 3 * 60 * 60 * 1000;
const MIN_OVERLAY_DURATION_MS = 5 * 60 * 1000;
const TIME_NUDGE_MINUTES = 15;

type OverlayWindowModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start: Date;
  end: Date;
  timeZone: string;
  onStartChange?: (nextStart: Date) => void;
  onEndChange?: (nextEnd: Date) => void;
};

export function OverlayWindowModal({
  open,
  onOpenChange,
  start,
  end,
  timeZone,
  onStartChange,
  onEndChange,
}: OverlayWindowModalProps) {
  const normalizedStart = useMemo(() => new Date(start), [start]);
  const normalizedEnd = useMemo(() => new Date(end), [end]);
  const [localStart, setLocalStart] = useState(normalizedStart);
  const [localEnd, setLocalEnd] = useState(normalizedEnd);

  useEffect(() => {
    setLocalStart(normalizedStart);
  }, [normalizedStart]);

  useEffect(() => {
    setLocalEnd(normalizedEnd);
  }, [normalizedEnd]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [timeZone]
  );
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
      }),
    [timeZone]
  );

  const startLabel = timeFormatter.format(localStart);
  const endLabel = timeFormatter.format(localEnd);
  const dateLabel = dateFormatter.format(localStart);
  const durationMs = Math.max(
    MIN_OVERLAY_DURATION_MS,
    localEnd.getTime() - localStart.getTime()
  );
  const durationMinutes = Math.round(durationMs / 60000);
  const durationHours = Math.floor(durationMinutes / 60);
  const durationMinutesOnly = durationMinutes % 60;
  const durationLabel =
    durationHours > 0
      ? `${durationHours}h${durationMinutesOnly ? ` ${durationMinutesOnly}m` : ""}`
      : `${durationMinutesOnly}m`;

  const formatTimeValue = (date: Date) => {
    const parts = getDateTimeParts(date, timeZone);
    const hours = String(parts.hour).padStart(2, "0");
    const minutes = String(parts.minute).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const handleStartTimeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      if (!value) return;
      const [hourStr, minuteStr] = value.split(":");
      const hour = Number(hourStr);
      const minute = Number(minuteStr);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
      const nextStart = setTimeInTimeZone(localStart, timeZone, hour, minute);
      const nextEnd = new Date(nextStart.getTime() + durationMs);
      setLocalStart(nextStart);
      setLocalEnd(nextEnd);
      onStartChange?.(nextStart);
      onEndChange?.(nextEnd);
    },
    [durationMs, localStart, onEndChange, onStartChange, timeZone]
  );

  const adjustEndForMinimum = useCallback(
    (candidate: Date) => {
      const minimum = localStart.getTime() + MIN_OVERLAY_DURATION_MS;
      if (candidate.getTime() < minimum) {
        return new Date(minimum);
      }
      return candidate;
    },
    [localStart]
  );

  const handleEndTimeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      if (!value) return;
      const [hourStr, minuteStr] = value.split(":");
      const hour = Number(hourStr);
      const minute = Number(minuteStr);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
      let nextEnd = setTimeInTimeZone(localStart, timeZone, hour, minute);
      if (nextEnd.getTime() <= localStart.getTime()) {
        nextEnd = new Date(nextEnd.getTime() + 24 * 60 * 60 * 1000);
      }
      nextEnd = adjustEndForMinimum(nextEnd);
      setLocalEnd(nextEnd);
      onEndChange?.(nextEnd);
    },
    [adjustEndForMinimum, localStart, onEndChange, timeZone]
  );

  const handleStartNudge = useCallback(
    (minutes: number) => {
      const nextStart = new Date(localStart.getTime() + minutes * 60_000);
      const delta = nextStart.getTime() - localStart.getTime();
      const nextEnd = new Date(localEnd.getTime() + delta);
      setLocalStart(nextStart);
      setLocalEnd(nextEnd);
      onStartChange?.(nextStart);
      onEndChange?.(nextEnd);
    },
    [localEnd, localStart, onEndChange, onStartChange]
  );

  const handleEndNudge = useCallback(
    (minutes: number) => {
      const candidate = new Date(localEnd.getTime() + minutes * 60_000);
      const nextEnd = adjustEndForMinimum(candidate);
      setLocalEnd(nextEnd);
      onEndChange?.(nextEnd);
    },
    [adjustEndForMinimum, localEnd, onEndChange]
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "relative fixed left-1/2 top-1/2 z-[210] w-[min(90vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#05070c] p-6 shadow-[0_40px_80px_rgba(0,0,0,0.65)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <Dialog.Title className="text-lg font-semibold text-white">
                Overlay Window
              </Dialog.Title>
              <Dialog.Description className="text-sm text-white/70">
                Temporary block that overrides time blocks for its span.
              </Dialog.Description>
            </div>
            <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-white/60">
                <span>Overlay span</span>
                <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/70">
                  {durationLabel}
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="text-2xl font-semibold text-white">
                  {startLabel} – {endLabel}
                </div>
                <div className="text-sm text-white/60">{dateLabel}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">
                    Start
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      step={900}
                      value={formatTimeValue(localStart)}
                      onChange={handleStartTimeChange}
                      className="flex-1 rounded-2xl border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-white/60 focus-visible:border-white/40"
                    />
                    <div className="flex flex-col overflow-hidden rounded-lg border border-white/12 bg-white/5 shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
                      <button
                        type="button"
                        onClick={() => handleStartNudge(TIME_NUDGE_MINUTES)}
                        className="flex h-8 items-center justify-center px-2 text-white/85 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                        aria-label="Move start time forward 15 minutes"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <div className="h-px bg-white/10" />
                      <button
                        type="button"
                        onClick={() => handleStartNudge(-TIME_NUDGE_MINUTES)}
                        className="flex h-8 items-center justify-center px-2 text-white/70 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                        aria-label="Move start time backward 15 minutes"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">
                    End
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      step={900}
                      value={formatTimeValue(localEnd)}
                      onChange={handleEndTimeChange}
                      className="flex-1 rounded-2xl border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-white/60 focus-visible:border-white/40"
                    />
                    <div className="flex flex-col overflow-hidden rounded-lg border border-white/12 bg-white/5 shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
                      <button
                        type="button"
                        onClick={() => handleEndNudge(TIME_NUDGE_MINUTES)}
                        className="flex h-8 items-center justify-center px-2 text-white/85 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                        aria-label="Move end time forward 15 minutes"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <div className="h-px bg-white/10" />
                      <button
                        type="button"
                        onClick={() => handleEndNudge(-TIME_NUDGE_MINUTES)}
                        className="flex h-8 items-center justify-center px-2 text-white/70 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                        aria-label="Move end time backward 15 minutes"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-48 rounded-3xl border border-dashed border-white/20 bg-gradient-to-b from-white/5 to-black/40 p-5 text-center text-[11px] uppercase tracking-[0.3em] text-white/40">
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <span>Overlay canvas</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Empty placeholder for overlay span
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/60">
                Constraints
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                Placeholder constraints will live here once overlays are tuned.
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/60">
                Search events (coming soon)
              </div>
              <Input
                disabled
                placeholder="Search events (coming soon)"
                className="text-white placeholder:text-white/50"
              />
            </div>
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute top-4 right-4 rounded-full border border-white/15 bg-white/5 p-2 text-white/70 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label="Close overlay window modal"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
