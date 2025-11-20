"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";

export type Task = {
  id: string;
  title: string;
  start: string; // ISO time
  end: string; // ISO time
  color?: string;
  energy?: "NO" | "LOW" | "MEDIUM" | "HIGH" | "ULTRA" | "EXTREME";
  meta?: string;
};

export type Window = {
  id: string;
  title: string;
  startHour: number;
  endHour: number;
};

export type Props = {
  date?: string; // ISO date
  tasks: Task[];
  windows?: Window[];
  startHour?: number;
  endHour?: number;
  pxPerMin?: number;
  onTaskPress?: (id: string) => void;
};

// helpers -------------------------------------------------------------
export const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export const parseISOToLocalDate = (iso: string) => new Date(iso);

export const minutesSinceStartOfDay = (d: Date) =>
  d.getHours() * 60 + d.getMinutes();

export const formatRange = (start: Date, end: Date) => {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(
    end.getHours()
  )}:${pad(end.getMinutes())}`;
};

// component -----------------------------------------------------------
export const ScheduleTimeline: React.FC<Props> = ({
  date,
  tasks,
  windows,
  startHour = 5,
  endHour = 24,
  pxPerMin = 2,
  onTaskPress,
}) => {
  const dayStr = date || new Date().toISOString().split("T")[0];
  const dayStart = useMemo(() => {
    const d = new Date(dayStr);
    d.setHours(startHour, 0, 0, 0);
    return d;
  }, [dayStr, startHour]);
  const dayEnd = useMemo(() => {
    const d = new Date(dayStr);
    d.setHours(endHour, 0, 0, 0);
    return d;
  }, [dayStr, endHour]);

  const totalMins = (endHour - startHour) * 60;
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useRef(false);

  useEffect(() => {
    prefersReduced.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowTop = useMemo(() => {
    if (now < dayStart || now > dayEnd) return null;
    const mins = minutesSinceStartOfDay(now) - startHour * 60;
    return mins * pxPerMin;
  }, [now, dayStart, dayEnd, startHour, pxPerMin]);

  type LayoutTask = Task & {
    startDate: Date;
    endDate: Date;
    top: number;
    height: number;
    lane: number;
    cluster: number;
    laneCount: number;
  };

  const layoutTasks = useMemo(() => {
    const withDates = tasks
      .map((t) => ({
        ...t,
        startDate: parseISOToLocalDate(t.start),
        endDate: parseISOToLocalDate(t.end),
      }))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    const clusters: LayoutTask[][] = [];
    let cluster: LayoutTask[] = [];
    let clusterEnd = 0;

    withDates.forEach((t) => {
      const startMs = t.startDate.getTime();
      const endMs = t.endDate.getTime();
      if (cluster.length === 0 || startMs < clusterEnd) {
        cluster.push({ ...t } as LayoutTask);
        clusterEnd = Math.max(clusterEnd, endMs);
      } else {
        clusters.push(cluster);
        cluster = [{ ...t } as LayoutTask];
        clusterEnd = endMs;
      }
    });
    if (cluster.length) clusters.push(cluster);

    const laidOut: LayoutTask[] = [];
    clusters.forEach((group, cIdx) => {
      const laneEnds: number[] = [];
      group.forEach((task) => {
        let lane = laneEnds.findIndex((e) => e <= task.startDate.getTime());
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = task.endDate.getTime();
        const top =
          (minutesSinceStartOfDay(task.startDate) - startHour * 60) * pxPerMin;
        const height =
          ((task.endDate.getTime() - task.startDate.getTime()) / 60000) *
          pxPerMin;
        laidOut.push({
          ...task,
          top,
          height,
          lane,
          cluster: cIdx,
          laneCount: laneEnds.length,
        });
      });
    });
    return laidOut;
  }, [tasks, startHour, pxPerMin]);

  const scrollToNow = () => {
    if (!containerRef.current || nowTop === null) return;
    const el = containerRef.current;
    const target = clamp(
      nowTop - el.clientHeight * 0.25,
      0,
      el.scrollHeight - el.clientHeight
    );
    el.scrollTo({
      top: target,
      behavior: prefersReduced.current ? "auto" : "smooth",
    });
  };

  const energyColors: Record<NonNullable<Task["energy"]>, string> = {
    NO: "#666666",
    LOW: "#88B04B",
    MEDIUM: "#4D9DE0",
    HIGH: "#9966CC",
    ULTRA: "#FF8C00",
    EXTREME: "#FF3860",
  };

  return (
    <div className="h-full flex flex-col bg-[#1E1E1E] text-[#E6E6E6]">
      <div className="sticky top-0 z-20 flex justify-end px-2 py-1 bg-[#1E1E1E] border-b border-[#353535]">
        <button
          onClick={scrollToNow}
          className="text-xs text-[#9966CC] px-2 py-1 border border-[#353535] rounded"
        >
          Now
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 relative overflow-y-auto"
        style={{ height: totalMins * pxPerMin }}
      >
        {/* windows */}
        {windows?.map((w) => {
          const top = (w.startHour - startHour) * 60 * pxPerMin;
          const height = (w.endHour - w.startHour) * 60 * pxPerMin;
          return (
            <div
              key={w.id}
              className="absolute left-0 right-0 bg-[#9966CC]/10"
              style={{ top, height }}
            >
              <span className="absolute left-0 top-0 text-[10px] text-[#9966CC] px-2">
                {w.title}
              </span>
            </div>
          );
        })}

        {/* grid lines */}
        {Array.from({ length: Math.floor(totalMins / 5) + 1 }, (_, i) => {
          const m = i * 5;
          const top = m * pxPerMin;
          const isHour = m % 60 === 0;
          return (
            <div
              key={m}
              className={`absolute left-0 right-0 border-t ${
                isHour ? "border-[#353535]" : "border-[#2A2A2A]"
              }`}
              style={{ top }}
            />
          );
        })}

        {/* now line */}
        {nowTop !== null && (
          <div
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: nowTop }}
          >
            <div className="border-t border-[#9966CC]" />
          </div>
        )}

        {/* tasks */}
        {layoutTasks.map((t) => {
          const laneWidth = 100 / t.laneCount;
          const width = `calc(${laneWidth}% - ${(6 * (t.laneCount - 1)) / t.laneCount}px)`;
          const left = `calc(${laneWidth * t.lane}% + ${t.lane * 6}px)`;
          const active = now >= t.startDate && now < t.endDate;
          return (
            <div
              key={t.id}
              role="button"
              aria-label={`${t.title}, ${formatRange(t.startDate, t.endDate)}`}
              aria-current={active ? "true" : undefined}
              onClick={() => onTaskPress?.(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTaskPress?.(t.id);
                }
              }}
              tabIndex={0}
              className="absolute overflow-hidden rounded-xl border border-[#353535] shadow-sm bg-[#242424] text-xs"
              style={{
                top: t.top,
                height: t.height,
                width,
                left,
                boxShadow: active
                  ? "0 0 10px rgba(153,102,204,.35)"
                  : undefined,
              }}
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: t.color || "#3A3A3A" }}
              />
              {t.energy && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 rounded-full"
                  style={{ background: energyColors[t.energy] }}
                />
              )}
              {active && (
                <span
                  className="absolute top-1 left-1 w-2 h-2 rounded-full bg-[#9966CC]"
                />
              )}
              <div className="pl-2 pr-1 py-1 h-full flex flex-col">
                <span className="font-bold text-[13px] truncate">{t.title}</span>
                <span className="text-[12px] text-[#A6A6A6]">
                  {formatRange(t.startDate, t.endDate)}
                </span>
                {t.meta && (
                  <span className="text-[11px] text-[#A6A6A6] truncate">
                    {t.meta}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// demo ---------------------------------------------------------------
export const demoTasks: Task[] = [
  {
    id: "1",
    title: "Breakfast",
    start: "2025-05-21T07:00:00",
    end: "2025-05-21T07:30:00",
    color: "#FF5555",
    energy: "LOW",
    meta: "Kitchen",
  },
  {
    id: "2",
    title: "Work Session",
    start: "2025-05-21T09:00:00",
    end: "2025-05-21T11:00:00",
    color: "#55AAFF",
    energy: "HIGH",
    meta: "Coding",
  },
  {
    id: "3",
    title: "Standup",
    start: "2025-05-21T09:30:00",
    end: "2025-05-21T10:00:00",
    color: "#22CC88",
    energy: "MEDIUM",
  },
  {
    id: "4",
    title: "Lunch",
    start: "2025-05-21T12:30:00",
    end: "2025-05-21T13:15:00",
    color: "#FFCC00",
    energy: "MEDIUM",
  },
  {
    id: "5",
    title: "Design Review",
    start: "2025-05-21T14:00:00",
    end: "2025-05-21T15:30:00",
    color: "#AA66CC",
    energy: "HIGH",
    meta: "Zoom",
  },
  {
    id: "6",
    title: "Gym",
    start: "2025-05-21T18:00:00",
    end: "2025-05-21T19:15:00",
    color: "#FF8888",
    energy: "EXTREME",
  },
];

export const demoWindows: Window[] = [
  { id: "w1", title: "Morning", startHour: 5, endHour: 9 },
  { id: "w2", title: "Work", startHour: 9, endHour: 17 },
  { id: "w3", title: "Evening", startHour: 17, endHour: 24 },
];

// Example demo component (uncomment to use locally)
// export const DemoScheduleTimeline = () => (
//   <div className="h-[600px]">
//     <ScheduleTimeline tasks={demoTasks} windows={demoWindows} />
//   </div>
// );

// Usage:
// <ScheduleTimeline tasks={myTasks} windows={myWindows} onTaskPress={(id)=>{}} />

export default ScheduleTimeline;

