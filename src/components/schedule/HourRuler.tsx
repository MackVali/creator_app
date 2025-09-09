"use client";

interface HourRulerProps {
  startHour: number;
  endHour: number;
  pxPerMin: number;
}

export function HourRuler({ startHour, endHour, pxPerMin }: HourRulerProps) {
  const totalMinutes = (endHour - startHour) * 60;
  const height = totalMinutes * pxPerMin;

  const hours: number[] = [];
  for (let h = Math.ceil(startHour); h < endHour; h++) {
    hours.push(h);
  }

  return (
    <div className="relative w-16 select-none" style={{ height }}>
      {hours.map(h => {
        const top = (h - startHour) * 60 * pxPerMin;
        return (
          <div key={h} className="absolute right-2 text-right text-xs text-zinc-500" style={{ top }}>
            {formatHour(h)}
          </div>
        );
      })}
    </div>
  );
}

function formatHour(h: number) {
  const normalized = h % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${hour12} ${suffix}`;
}
