"use client";

interface AllDayItem {
  id: string;
  title: string;
  color?: string;
}

interface AllDayRowProps {
  items: AllDayItem[];
}

export function AllDayRow({ items }: AllDayRowProps) {
  return (
    <div className="sticky top-0 z-10 bg-black">
      <div className="flex h-10 items-center gap-2 overflow-x-auto px-4">
        {items.map(item => (
          <span
            key={item.id}
            className="flex-shrink-0 rounded-full px-2 py-1 text-xs text-white"
            style={{ backgroundColor: item.color ?? "#27272a" }}
          >
            {item.title}
          </span>
        ))}
      </div>
    </div>
  );
}

export type { AllDayItem };
