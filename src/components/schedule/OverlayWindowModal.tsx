"use client";

import { useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const OVERLAY_DURATION_MS = 3 * 60 * 60 * 1000;

type OverlayWindowModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start: Date;
  timeZone: string;
};

export function OverlayWindowModal({
  open,
  onOpenChange,
  start,
  timeZone,
}: OverlayWindowModalProps) {
  const normalizedStart = useMemo(() => new Date(start), [start]);
  const end = useMemo(
    () => new Date(normalizedStart.getTime() + OVERLAY_DURATION_MS),
    [normalizedStart]
  );
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

  const startLabel = timeFormatter.format(normalizedStart);
  const endLabel = timeFormatter.format(end);
  const dateLabel = dateFormatter.format(normalizedStart);

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
            <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-white/60">
                <span>Overlay span</span>
                <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/70">
                  3h
                </span>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-semibold text-white">
                  {startLabel} – {endLabel}
                </div>
                <div className="text-sm text-white/60">{dateLabel}</div>
              </div>
              <div className="h-48 rounded-3xl border border-dashed border-white/20 bg-gradient-to-b from-white/5 to-black/40 p-5 text-center text-[11px] uppercase tracking-[0.3em] text-white/40">
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <span>Overlay canvas</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Empty placeholder for three hours
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
