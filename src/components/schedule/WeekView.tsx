"use client";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WeekViewProps {
  date?: Date;
}

export function WeekView({ date = new Date() }: WeekViewProps) {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  return (
    <div className="grid grid-cols-7 text-center text-xs text-gray-300">
      {days.map((d) => (
        <div key={d.toISOString()} className="p-2 border border-gray-800/40">
          <div className="font-medium">{dayNames[d.getDay()]}</div>
          <div>{d.getDate()}</div>
        </div>
      ))}
    </div>
  );
}
