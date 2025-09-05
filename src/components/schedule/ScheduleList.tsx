"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import { scheduleIcons, ScheduleIconName } from "@/lib/icons";
import {
  fetchScheduleItems,
  type ScheduleItem,
} from "@/lib/schedule/repo";
import { ScheduleEmptyState } from "@/components/ui/empty-state";

type Row = { hour: string; items: ScheduleItem[] };

function formatHour(iso: string) {
  const date = new Date(iso);
  const h = date.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${ampm}`;
}

export default function ScheduleList() {
  const [items, setItems] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    fetchScheduleItems().then(setItems).catch(console.error);
  }, []);

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const item of items) {
      const hour = formatHour(item.start_time);
      const arr = map.get(hour) || [];
      arr.push(item);
      map.set(hour, arr);
    }
    return Array.from(map.entries())
      .sort(
        (a, b) =>
          new Date(a[1][0].start_time).getTime() -
          new Date(b[1][0].start_time).getTime(),
      )
      .map(([hour, items]) => ({ hour, items }));
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="px-3 pb-24">
        <ScheduleEmptyState />
      </div>
    );
  }

  return (
    <div className="px-3 pb-24">
      {rows.map((row) => (
        <div key={row.hour} className="flex gap-3">
          {/* left rail hour */}
          <div className="w-14 shrink-0 text-[11px] text-white/45 pt-5 text-right">
            {row.hour}
          </div>

          {/* stack for that hour */}
          <div className="flex-1 space-y-3 pb-3">
            {row.items.map((it) => (
              <EventBar key={it.id} item={it} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventBar({ item }: { item: ScheduleItem }) {
  const ring =
    item.accent === "blue"
      ? "ring-1 ring-sky-400/40"
      : item.accent === "violet"
      ? "ring-1 ring-violet-400/40"
      : item.accent === "pink"
      ? "ring-1 ring-pink-400/40"
      : "ring-1 ring-white/8";

  const Icon = item.icon ? scheduleIcons[item.icon as ScheduleIconName] : Calendar;

  return (
    <div
      className={`relative rounded-card bg-app-panel shadow-elev-2 shadow-black/70 border border-white/6 ${ring} card-gloss`}
      onMouseDown={(e) =>
        (e.currentTarget.style.animation = "press .08s ease-out both")
      }
      onMouseUp={(e) => (e.currentTarget.style.animation = "")}
    >
      {/* inset line for 3D cut */}
      <div className="absolute inset-0 rounded-card shadow-inset-soft pointer-events-none" />

      {/* subtle body gradient */}
      <div className="absolute inset-0 rounded-card bg-gradient-to-b from-white/5 via-transparent to-black/20" />

      {/* content */}
      <div className="relative flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-black/20 border border-white/5 grid place-items-center text-white/80">
            <Icon size={18} />
          </div>
          <div className="text-[16px] font-medium tracking-tight">{item.title}</div>
        </div>

        {/* hollow circular check on right */}
        <button
          aria-label="Complete"
          className="h-7 w-7 rounded-full border border-white/12 bg-black/10 relative overflow-hidden active:scale-95 transition"
        >
          {/* faint gloss ring */}
          <span className="pointer-events-none absolute inset-0 rounded-full border border-white/5 opacity-30" />
        </button>
      </div>

      {/* optional shimmer on long bars (kept subtle) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[35%] -skew-x-6 opacity-[.05] bg-white animate-shimmer rounded-card" />
    </div>
  );
}

