"use client";

import { WeekView } from "@/components/schedule/WeekView";

export default function WeekViewPreview() {
  return (
    <div className="p-4 text-white">
      <WeekView date={new Date()} />
    </div>
  );
}

