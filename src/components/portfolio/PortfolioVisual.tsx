import type { PortfolioVisualKey } from "@/lib/portfolio/types";

export default function PortfolioVisual({
  kind,
  className = "",
}: {
  kind: PortfolioVisualKey;
  className?: string;
}) {
  const shell =
    "relative overflow-hidden border border-white/[0.08] bg-[#0d0d0d]";

  if (kind === "creator") {
    return (
      <div className={`${shell} ${className}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(255,255,255,0.08),transparent_36%)]" />
        <div className="absolute inset-[9%] flex overflow-hidden rounded-[10px] border border-white/10 bg-[#090909] shadow-2xl">
          <div className="w-[24%] border-r border-white/[0.07] p-3">
            <p className="text-[9px] font-semibold tracking-[0.2em] text-white/90">
              CREATOR
            </p>
            <div className="mt-5 space-y-2">
              {["Home", "Goals", "Schedule", "Body", "Money", "Focus"].map(
                (label, index) => (
                  <div
                    key={label}
                    className={`rounded px-2 py-1.5 text-[7px] ${
                      index === 0
                        ? "bg-white/[0.08] text-white"
                        : "text-white/35"
                    }`}
                  >
                    {label}
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 p-4">
            <p className="text-[9px] text-white/35">Today</p>
            <p className="mt-1 max-w-[14rem] text-sm font-medium leading-tight text-white/90">
              A more intentional you.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {["Goals", "Schedule", "Health"].map((label) => (
                <div
                  key={label}
                  className="rounded-md border border-white/[0.06] bg-white/[0.035] p-2"
                >
                  <div className="mb-4 h-4 w-4 rounded border border-white/15" />
                  <p className="text-[7px] text-white/55">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 h-[30%] rounded-md border border-white/[0.06] bg-white/[0.025] p-3">
              <div className="h-1.5 w-2/5 rounded-full bg-white/10" />
              <div className="mt-3 h-1.5 w-4/5 rounded-full bg-white/[0.06]" />
              <div className="mt-2 h-1.5 w-3/5 rounded-full bg-white/[0.06]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "yump") {
    return (
      <div className={`${shell} ${className} flex items-center justify-center`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.13),transparent_46%)]" />
        <div className="relative flex h-[78%] w-[54%] flex-col items-center justify-center rounded-t-[38%] bg-[#111] shadow-2xl">
          <span className="text-2xl font-semibold tracking-tight text-white/75">
            Yump.
          </span>
          <span className="mt-3 text-[6px] uppercase tracking-[0.34em] text-white/25">
            A brighter everyday
          </span>
        </div>
      </div>
    );
  }

  if (kind === "abyssal") {
    return (
      <div className={`${shell} ${className} flex items-center justify-center`}>
        <div className="absolute h-32 w-32 rounded-full border border-white/20 bg-[radial-gradient(circle_at_40%_35%,rgba(255,255,255,0.18),rgba(255,255,255,0.02)_45%,transparent_70%)] shadow-[0_0_80px_rgba(255,255,255,0.08)]" />
        <div className="relative text-center">
          <p className="text-lg font-medium text-white/80">Abyssal Insight</p>
          <p className="mt-14 text-[7px] uppercase tracking-[0.36em] text-white/25">
            See deeper
          </p>
        </div>
      </div>
    );
  }

  if (kind === "studio") {
    return (
      <div className={`${shell} ${className}`}>
        <div className="absolute inset-x-[8%] bottom-[15%] h-[7%] bg-white/[0.08]" />
        <div className="absolute bottom-[22%] left-[15%] h-[34%] w-[12%] rounded-md border border-white/10 bg-[#151515]">
          <div className="absolute left-1/2 top-[30%] h-7 w-7 -translate-x-1/2 rounded-full border border-white/15" />
        </div>
        <div className="absolute bottom-[24%] left-[31%] h-[45%] w-[40%] rounded-md border border-white/10 bg-[#090909] p-3">
          <div className="h-full w-full bg-[linear-gradient(145deg,transparent_35%,rgba(255,255,255,0.08)_36%,transparent_38%),linear-gradient(25deg,transparent_55%,rgba(255,255,255,0.05)_56%,transparent_58%)]" />
        </div>
        <div className="absolute bottom-[22%] right-[14%] h-[34%] w-[12%] rounded-md border border-white/10 bg-[#151515]">
          <div className="absolute left-1/2 top-[30%] h-7 w-7 -translate-x-1/2 rounded-full border border-white/15" />
        </div>
        <div className="absolute bottom-[19%] left-[39%] h-[5%] w-[25%] rounded-sm border border-white/10 bg-white/[0.04]" />
      </div>
    );
  }

  if (kind === "business") {
    return (
      <div className={`${shell} ${className} p-[10%]`}>
        <div className="h-full overflow-hidden rounded-md border border-white/10 bg-[#f0efeb] text-black">
          <div className="flex h-6 items-center gap-1.5 border-b border-black/10 px-3">
            <span className="h-1.5 w-1.5 rounded-full bg-black/15" />
            <span className="h-1.5 w-1.5 rounded-full bg-black/15" />
            <span className="h-1.5 w-1.5 rounded-full bg-black/15" />
          </div>
          <div className="grid h-[calc(100%-1.5rem)] grid-cols-2 gap-3 p-4">
            <div>
              <div className="h-2 w-1/2 rounded bg-black/20" />
              <div className="mt-3 h-7 w-4/5 rounded bg-black/70" />
              <div className="mt-2 h-2 w-full rounded bg-black/10" />
              <div className="mt-1 h-2 w-3/4 rounded bg-black/10" />
            </div>
            <div className="rounded bg-black/10" />
          </div>
        </div>
      </div>
    );
  }

  const visualClasses: Record<string, string> = {
    "visual-one":
      "bg-[linear-gradient(145deg,#0a0a0a_20%,#282828_21%,#0d0d0d_45%,#333_46%,#090909_70%)]",
    "visual-two":
      "bg-[linear-gradient(90deg,transparent_49%,rgba(255,255,255,.14)_50%,transparent_51%),linear-gradient(35deg,#090909,#242424,#080808)]",
    "visual-three":
      "bg-[radial-gradient(circle_at_65%_35%,rgba(255,255,255,.18),transparent_14%),conic-gradient(from_210deg_at_50%_50%,#080808,#303030,#090909,#252525,#080808)]",
  };

  return (
    <div
      className={`${shell} ${visualClasses[kind] ?? ""} ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-black/10" />
    </div>
  );
}
