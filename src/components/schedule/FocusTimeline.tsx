"use client";

import { DayTimeline } from "./DayTimeline";

export function FocusTimeline() {
  const now = new Date();
  const startHour = now.getHours() + now.getMinutes() / 60;
  const endHour = startHour + 3;
  return <DayTimeline startHour={startHour} endHour={endHour} date={now} />;
}
