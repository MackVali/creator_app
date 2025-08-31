"use client";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WeekViewProps {
  date?: Date;
}

export function WeekView({ date = new Date() }: WeekViewProps) {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  return (
    <div className="text-xs text-gray-300">
      <div className="mb-2 text-center text-sm text-gray-200">
        {formatRange(start, end)}
      </div>
      <div className="grid grid-cols-7 text-center">
        {days.map((d) => (
          <div key={d.toISOString()} className="p-2 border border-gray-800/40">
            <div className="font-medium">{dayNames[d.getDay()]}</div>
            <div>{d.getDate()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatRange(start: Date, end: Date) {
  const startStr = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endStr = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const yearStr = end.getFullYear();
  return `${startStr} – ${endStr}, ${yearStr}`;
}
