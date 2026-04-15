"use client";

import clsx from "clsx";

export const RELATIONSHIP_VIEWS = ["friends", "following", "followers"] as const;
export type RelationshipView = (typeof RELATIONSHIP_VIEWS)[number];
export type RelationshipViewCounts = Partial<Record<RelationshipView, number>>;

interface RelationshipViewBarProps {
  value: RelationshipView;
  onChange?: (value: RelationshipView) => void;
  className?: string;
  counts?: RelationshipViewCounts;
}

export default function RelationshipViewBar({
  value,
  onChange,
  className,
  counts,
}: RelationshipViewBarProps) {
  const formatValue = (view: RelationshipView) =>
    view === "friends" ? "Friends" : view === "following" ? "Following" : "Followers";

  return (
    <div
      className={clsx(
        "flex w-full items-center gap-1 rounded-[16px] bg-black/80 px-2 py-1 text-xs text-white/70",
        className,
      )}
    >
      {RELATIONSHIP_VIEWS.map((view) => {
        const count = counts?.[view];
        const isActive = value === view;
        return (
          <button
            key={view}
            type="button"
            onClick={() => onChange?.(view)}
            className={clsx(
              "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[12px] px-3 py-2 text-sm font-semibold transition duration-200",
              isActive
                ? "bg-white/10 text-white"
                : "text-white/70 hover:bg-white/5 hover:text-white",
            )}
          >
            {typeof count === "number" ? (
              <span className="text-[0.6rem] font-semibold tracking-wide text-white/60 tabular-nums">
                {count.toLocaleString()}
              </span>
            ) : (
              <span className="h-2" aria-hidden="true" />
            )}
            <span className="text-[0.75rem] uppercase tracking-[0.25em] text-white/70">
              {formatValue(view)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
