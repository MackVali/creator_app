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
        "w-full rounded-lg border p-4 text-left transition-all",
        disabled
          ? "border-[#333] text-zinc-500 bg-[#2C2C2C] cursor-not-allowed"
          : selected
          ? "border-[#333] bg-[#1E1E1E]"
          : "border-[#333] bg-[#2C2C2C] hover:border-zinc-500 hover:bg-[#1E1E1E]",
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
