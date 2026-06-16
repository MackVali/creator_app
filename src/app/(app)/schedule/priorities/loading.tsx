const priorityBuckets = [
  { label: "P0", rows: ["w-9/12", "w-6/12", "w-8/12"] },
  { label: "P1", rows: ["w-7/12", "w-10/12"] },
  { label: "P2", rows: ["w-8/12", "w-5/12", "w-7/12"] },
  { label: "P3", rows: ["w-6/12"] },
];

function PulseBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-white/[0.075] ${className}`} />;
}

function PriorityRowSkeleton({ widthClass }: { widthClass: string }) {
  return (
    <div className="border-b border-black/40 bg-white/[0.026] last:border-b-0">
      <div className="flex min-h-10 items-center gap-2 px-2 py-1.5 sm:px-2.5">
        <PulseBlock className="size-7 shrink-0 rounded-lg border border-black/60 bg-black/30" />
        <PulseBlock className="size-7 shrink-0 rounded-lg border border-black/60 bg-white/[0.04]" />
        <PulseBlock className={`h-3.5 min-w-0 max-w-full ${widthClass}`} />
        <PulseBlock className="h-3 w-8 shrink-0 rounded-full bg-white/[0.045]" />
      </div>
    </div>
  );
}

function PriorityBucketSkeleton({
  label,
  rows,
}: {
  label: string;
  rows: string[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[10px] font-semibold uppercase leading-none tracking-normal text-zinc-600">
        {label}
      </p>
      <div className="min-h-8 overflow-hidden rounded-[16px] border border-black/60 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        {rows.map((widthClass, index) => (
          <PriorityRowSkeleton key={`${label}-${index}`} widthClass={widthClass} />
        ))}
      </div>
    </div>
  );
}

export default function PriorityEditorLoading() {
  return (
    <main
      className="min-h-screen bg-[#050507] text-white"
      aria-label="Loading Priority Editor"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-0 sm:px-6 sm:pb-12 sm:pt-2">
        <section className="overflow-hidden rounded-[18px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_32%,rgba(39,39,42,0.28)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.30)] sm:rounded-[20px]">
          <div className="overflow-hidden rounded-[17px] border border-black/60 bg-zinc-950/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-18px_30px_rgba(0,0,0,0.32)] sm:rounded-[19px]">
            <div className="border-b border-black/40 bg-black/20 px-2.5 py-1.5 sm:px-3 sm:py-2">
              <div className="inline-flex min-h-7 w-full items-center justify-center gap-2 rounded-lg border border-black/60 bg-white/[0.025] px-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500 sm:min-h-8 sm:text-[10px] sm:tracking-[0.14em]">
                <PulseBlock className="size-3 rounded-sm bg-white/[0.08]" />
                Adjust
              </div>
            </div>
            <div className="relative flex min-w-0 items-center gap-2 border border-black/60 bg-white/[0.035] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_18px_rgba(255,255,255,0.018),inset_0_-12px_20px_rgba(0,0,0,0.18)] sm:gap-3 sm:px-4 sm:py-3">
              <PulseBlock className="size-7 shrink-0 rounded-md border border-black/60 bg-white/[0.04] sm:size-8 sm:rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <PulseBlock className="h-2.5 w-24 rounded-full bg-white/[0.055]" />
                <PulseBlock className="h-3.5 w-36 max-w-full rounded-full bg-white/[0.09]" />
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5">
            <h2 className="text-[11px] font-semibold uppercase text-white/35">
              Global Goal Roadmap
            </h2>
          </div>
          <section className="overflow-hidden rounded-[20px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_30%,rgba(24,24,27,0.34)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.34)] sm:rounded-[22px]">
            <div className="rounded-[19px] border border-black/60 bg-zinc-950/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.018),inset_0_-18px_30px_rgba(0,0,0,0.34)] sm:rounded-[21px] sm:p-4">
              <div className="space-y-3">
                {priorityBuckets.map((bucket) => (
                  <PriorityBucketSkeleton
                    key={bucket.label}
                    label={bucket.label}
                    rows={bucket.rows}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
