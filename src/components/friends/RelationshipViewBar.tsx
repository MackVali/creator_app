"use client";

import clsx from "clsx";

export const RELATIONSHIP_VIEWS = ["friends", "following", "followers"] as const;
export type RelationshipView = (typeof RELATIONSHIP_VIEWS)[number];
export type RelationshipViewCounts = Partial<Record<RelationshipView | "offers", number>>;

export type RelationshipStatItem<TValue extends string = RelationshipView> = {
  value: TValue;
  label: string;
};

const DEFAULT_RELATIONSHIP_ITEMS: readonly RelationshipStatItem<RelationshipView>[] = [
  { value: "friends", label: "Friends" },
  { value: "following", label: "Following" },
  { value: "followers", label: "Followers" },
];

interface RelationshipViewBarProps<TValue extends string = RelationshipView> {
  value?: TValue | null;
  onChange?: (value: TValue) => void;
  className?: string;
  itemClassName?: string;
  countClassName?: string;
  labelClassName?: string;
  uppercaseLabels?: boolean;
  counts?: Partial<Record<TValue, number>>;
  items?: readonly RelationshipStatItem<TValue>[];
}

export default function RelationshipViewBar<TValue extends string = RelationshipView>({
  value,
  onChange,
  className,
  itemClassName,
  countClassName,
  labelClassName,
  uppercaseLabels = true,
  counts,
  items,
}: RelationshipViewBarProps<TValue>) {
  const statItems =
    items ?? (DEFAULT_RELATIONSHIP_ITEMS as readonly RelationshipStatItem<TValue>[]);

  return (
    <div
      className={clsx(
        "flex w-full items-center gap-1 rounded-[16px] bg-black/80 px-2 py-1 text-xs text-white/70",
        className,
      )}
    >
      {statItems.map((item) => {
        const count = counts?.[item.value];
        const isActive = value != null && value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange?.(item.value)}
            aria-pressed={value == null ? undefined : isActive}
            className={clsx(
              "flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 rounded-[12px] px-3 py-2 text-sm font-semibold transition duration-200",
              isActive
                ? "bg-white/10 text-white"
                : "text-white/70 hover:bg-white/5 hover:text-white",
              itemClassName,
            )}
          >
            {typeof count === "number" ? (
              <span
                className={clsx(
                  "text-[0.6rem] font-semibold tracking-wide text-white tabular-nums",
                  countClassName,
                )}
              >
                {count.toLocaleString()}
              </span>
            ) : (
              <span className="h-2" aria-hidden="true" />
            )}
            <span
              className={
                labelClassName
                  ? clsx(uppercaseLabels && "uppercase", labelClassName)
                  : clsx("text-[0.75rem] tracking-[0.25em] text-white/70", uppercaseLabels && "uppercase")
              }
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
