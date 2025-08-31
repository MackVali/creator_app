"use client";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthViewProps {
  date?: Date;
}

export function MonthView({ date = new Date() }: MonthViewProps) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="text-xs text-gray-300">
      <div className="grid grid-cols-7 text-center">
        {dayNames.map((d) => (
          <div key={d} className="p-1 font-medium">
            {d}
          </div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className="h-10 border border-gray-800/40 p-1 text-center">
            {day}
          </div>
        ))}
      </div>
    </div>
  );
}
