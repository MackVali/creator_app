"use client";

import { MonthView } from "@/components/schedule/MonthView";

export default function MonthViewPreview() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = (day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
  const eventCounts: Record<string, number> = {
    [d(2)]: 1,
    [d(5)]: 3,
    [d(12)]: 4,
    [d(21)]: 2,
  };
  return (
    <div className="p-4 text-white">
      <MonthView date={now} eventCounts={eventCounts} />
    </div>
  );
}

