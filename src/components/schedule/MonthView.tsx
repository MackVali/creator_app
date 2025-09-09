"use client";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthViewProps {
  date?: Date;
  /**
   * Optional map of ISO date (yyyy-mm-dd) to event counts.
   * Used to render a tiny density indicator for each day.
   */
  eventCounts?: Record<string, number>;
}

export function MonthView({ date = new Date(), eventCounts }: MonthViewProps) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const label = date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="text-xs text-gray-300">
      <div className="mb-2 text-center text-sm text-gray-200">{label}</div>
      <div className="grid grid-cols-7 text-center">
        {dayNames.map((d) => (
          <div key={d} className="p-1 font-medium">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null)
            return (
              <div
                key={i}
                className="h-12 border border-gray-800/40 p-1 text-center"
              />
            )
          const key = new Date(year, month, day)
            .toISOString()
            .slice(0, 10)
          const count = Math.min(4, eventCounts?.[key] ?? 0)
          return (
            <div
              key={i}
              className="h-12 border border-gray-800/40 p-1 text-center flex flex-col items-center justify-center"
            >
              <div>{day}</div>
              {eventCounts && (
                <div className="mt-1 flex gap-0.5">
                  {Array.from({ length: count }).map((_, j) => (
                    <span
                      key={j}
                      className="h-1 w-1 rounded-full bg-zinc-500"
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  );
}
