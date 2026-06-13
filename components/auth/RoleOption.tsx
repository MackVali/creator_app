"use client";
export default function RoleOption({
  title,
  desc,
  selected,
  disabled = false,
  onSelect,
}: {
  title: string;
  desc: string;
  selected: boolean;
  disabled?: boolean;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={[
        "w-full rounded-xl border p-4 text-left transition-all",
        disabled
          ? "cursor-not-allowed border-zinc-700/60 bg-zinc-800/40 text-zinc-500"
          : selected
          ? "border-zinc-500 bg-zinc-700 text-zinc-50 shadow-[0_10px_24px_rgba(0,0,0,0.20)]"
          : "border-zinc-700 bg-zinc-800/60 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-700/70",
      ].join(" ")}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={[
              "text-sm font-semibold tracking-wide",
              disabled ? "text-zinc-500" : selected ? "text-white" : "text-zinc-100",
            ].join(" ")}
          >
            {title}
          </div>
          {disabled && (
            <span className="rounded-full bg-zinc-700 px-2 py-1 text-xs text-zinc-300">
              Coming Soon
            </span>
          )}
        </div>
        <div
          className={[
            "h-4 w-4 rounded-full",
            selected
              ? "bg-zinc-300"
              : disabled
              ? "border border-zinc-600 bg-zinc-800"
              : "border border-zinc-500 bg-zinc-800",
          ].join(" ")}
        />
      </div>
      <div
        className={[
          "text-sm",
          disabled ? "text-zinc-500" : selected ? "text-zinc-200" : "text-zinc-400",
        ].join(" ")}
      >
        {desc}
      </div>
    </button>
  );
}
