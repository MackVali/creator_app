"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

  return (
    <Sheet open={open} onOpenChange={next => (!next ? onClose() : null)}>
      <SheetContent
        side="bottom"
        className="bg-[var(--surface-elevated)] border-t border-white/10 text-white sm:max-w-lg"
      >
        <SheetHeader className="gap-2">
          <SheetTitle className="text-lg font-semibold text-white">
            Edit scheduled {eventTypeLabel.toLowerCase()}
          </SheetTitle>
          <SheetDescription className="text-sm text-white/70">
            Update the scheduled time for this entry. Times are interpreted in{" "}
            {timeZoneLabel ?? "your local time"}.
          </SheetDescription>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <p className="text-sm font-medium text-white">{eventTitle}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">
              {eventTypeLabel}
            </p>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="schedule-edit-start" className="text-xs uppercase tracking-[0.2em] text-white/60">
              Start
            </Label>
            <Input
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
          <SheetFooter className="gap-3 px-0 pb-4">
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
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
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
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}
