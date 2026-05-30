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
        "w-full rounded-lg border border-transparent p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all",
        disabled
          ? "cursor-not-allowed bg-[#0B0C0F]/70 text-zinc-500 opacity-75"
          : selected
          ? "bg-zinc-800/90 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_18px_rgba(0,0,0,0.25)]"
          : "bg-[#0B0C0F] hover:bg-[#111216]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={[
              "text-sm font-semibold tracking-wide",
              disabled ? "text-zinc-500" : "text-white",
            ].join(" ")}
          >
            {title}
          </div>
          {disabled && (
            <span className="px-2 py-1 text-xs bg-zinc-700 text-zinc-300 rounded-full">
              Coming Soon
            </span>
          )}
        </div>
        <div
          className={[
            "h-4 w-4 rounded-full",
            selected
              ? "bg-white"
              : disabled
              ? "border border-zinc-600"
              : "border border-zinc-500",
          ].join(" ")}
        />
      </div>
      <div
        className={[
          "text-sm",
          disabled ? "text-zinc-500" : "text-zinc-300",
        ].join(" ")}
      >
        {desc}
      </div>
    </button>
  );
}
