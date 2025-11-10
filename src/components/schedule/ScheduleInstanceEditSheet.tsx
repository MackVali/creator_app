"use client";

import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useId,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";
import { toLocal } from "@/lib/time/tz";
import { cn } from "@/lib/utils";

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
}: ScheduleInstanceEditSheetProps) {
  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  const startInputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();

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
    setPortalElement(document.body);
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
    if (!open) return;
    const focusTimeout = window.setTimeout(() => {
      startInputRef.current?.focus({ preventScroll: true });
    }, 90);
    return () => window.clearTimeout(focusTimeout);
  }, [open]);

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

  const dialogContent = (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="schedule-edit-dialog"
          className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          role="presentation"
        >
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 cursor-pointer bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 w-full max-w-lg origin-center rounded-2xl border border-white/12 bg-[var(--surface-elevated)] px-5 pb-6 pt-5 text-white shadow-[0_32px_80px_rgba(5,8,22,0.78)]"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 p-1 text-white transition hover:bg-white/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <XIcon className="size-4" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
            <div className="space-y-4">
              <div className="space-y-3 pr-8">
                <h2 id={titleId} className="text-lg font-semibold tracking-tight text-white">
                  Edit scheduled {eventTypeLabel.toLowerCase()}
                </h2>
                <p className="text-sm text-white/70">
                  Update the scheduled time for this entry. Times are interpreted in {timeZoneLabel ?? "your local time"}.
                </p>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-sm font-medium text-white">{eventTitle}</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/60">{eventTypeLabel}</p>
                </div>
              </div>
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
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (!portalElement) return null;

  return createPortal(dialogContent, portalElement);
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
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}
