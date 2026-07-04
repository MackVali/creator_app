"use client";

function classNames(
  ...classes: (string | boolean | null | undefined)[]
): string {
  return classes.filter(Boolean).join(" ");
}

export function AnalyticsDashboardSkeleton({
  includeHeader = false,
}: {
  includeHeader?: boolean;
}) {
  const content = (
    <section
      aria-label="Analytics"
      className={classNames(
        "relative overflow-hidden rounded-[20px] border border-zinc-900/80 bg-zinc-950/35 p-0.5 min-[480px]:p-1.5 sm:rounded-[26px]",
        !includeHeader && "border-0 bg-transparent p-0 min-[480px]:p-0"
      )}
    >
      <div className="space-y-7 p-3 sm:space-y-8 sm:p-4 lg:p-5">
        <OverviewSkeleton />
        <SkillContributionSkeleton />
        <HabitSkeleton />
      </div>
    </section>
  );

  if (!includeHeader) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading analytics</span>
        {content}
        <SkeletonStyles />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="relative overflow-hidden text-[#E6E6EB]"
    >
      <span className="sr-only">Loading analytics</span>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[-35%] h-[420px] bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_68%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl space-y-4 pb-6 sm:space-y-8 sm:pb-8">
        <HeaderSkeleton />
        {content}
      </div>
      <SkeletonStyles />
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-20 mb-2 -mx-4 bg-black px-4 py-1.5 sm:static sm:mx-0 sm:mb-4 sm:bg-transparent sm:px-0 sm:py-0">
      <div className="flex min-w-0 justify-end">
        <div className="min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex min-w-max items-center gap-px rounded-full border border-zinc-800 bg-zinc-950/80 p-px">
            {["w-8", "w-8", "w-8"].map((width, index) => (
              <SkeletonBlock
                key={index}
                className={classNames(
                  "h-[17px] rounded-full sm:h-5",
                  index === 1 ? "w-10" : width
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-3 xl:space-y-4">
      <section className="rounded-[22px] border border-zinc-800/90 bg-[radial-gradient(circle_at_top_left,rgba(63,63,70,0.18),transparent_34%),linear-gradient(145deg,rgba(9,9,11,0.96),rgba(24,24,27,0.88))] p-3 shadow-[0_22px_54px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur sm:rounded-[26px] sm:p-4 lg:p-5">
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SkeletonBlock className="h-3 w-32 rounded-full" />
            </div>
            <SkeletonBlock className="h-3 w-28 shrink-0 rounded-full" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
            {["w-8", "w-16", "w-20", "w-16"].map((labelWidth, index) => (
              <KpiRailSkeleton key={index} labelWidth={labelWidth} />
            ))}
          </div>

          <div className="overflow-hidden rounded-[18px] border border-zinc-700/50 bg-[linear-gradient(145deg,rgba(9,9,11,0.9),rgba(24,24,27,0.72))] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:rounded-[20px]">
            <div className="flex flex-col gap-3 border-b border-white/[0.06] px-3 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <SkeletonBlock className="h-4 w-36 rounded-full sm:h-5" />
                  <SkeletonBlock className="h-3 w-28 rounded-full" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <SkeletonBlock className="h-1.5 w-4 rounded-full" />
                    <SkeletonBlock className="h-2.5 w-16 rounded-full" />
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2.5 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
              <div className="relative h-[214px] w-full overflow-hidden rounded-xl sm:h-[230px] md:h-[238px]">
                <SkeletonLineChart />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiRailSkeleton({ labelWidth }: { labelWidth: string }) {
  return (
    <div className="relative min-h-[92px] min-w-0 overflow-hidden rounded-2xl border border-zinc-700/45 bg-[linear-gradient(135deg,rgba(39,39,42,0.68),rgba(9,9,11,0.78))] p-2.5 pl-3 shadow-[0_14px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.035)] before:absolute before:inset-y-3.5 before:left-0 before:w-0.5 before:rounded-full before:bg-emerald-400/35 sm:min-h-[100px] sm:p-3.5 sm:pl-4">
      <SkeletonBlock className={classNames("h-2.5 rounded-full", labelWidth)} />
      <SkeletonBlock className="mt-3 h-7 w-20 rounded-lg sm:h-8" />
      <div className="mt-3 flex items-center justify-between gap-2">
        <SkeletonBlock className="h-2.5 w-24 rounded-full" />
        <SkeletonBlock className="h-4 w-10 rounded-full" />
      </div>
    </div>
  );
}

function SkillContributionSkeleton() {
  return (
    <div className="space-y-4 xl:space-y-6">
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/85 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur sm:rounded-2xl sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-3">
          <div>
            <SkeletonBlock className="h-4 w-32 rounded-full sm:h-5" />
          </div>
        </div>
        <div className="mt-3 space-y-3 sm:mt-4">
          <div className="grid grid-cols-3 gap-1 sm:gap-2">
            {[0, 1, 2].map((index) => (
              <ContributionChipSkeleton key={index} compact={index !== 0} />
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[390px_minmax(0,1fr)]">
            <div className="rounded-xl border border-zinc-800 bg-[#070a0f] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-3">
              <div className="relative mx-auto aspect-[420/380] max-w-[420px]">
                <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-[46%] rounded-full border-[18px] border-zinc-700/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:h-40 sm:w-40" />
                <SkeletonBlock className="absolute left-[11%] top-[21%] h-2 w-20 rounded-full" />
                <SkeletonBlock className="absolute right-[10%] top-[19%] h-2 w-24 rounded-full" />
                <SkeletonBlock className="absolute left-[7%] top-[42%] h-2 w-24 rounded-full" />
                <SkeletonBlock className="absolute right-[7%] top-[44%] h-2 w-20 rounded-full" />
                <SkeletonBlock className="absolute bottom-[21%] left-[16%] h-2 w-20 rounded-full" />
                <SkeletonBlock className="absolute bottom-[20%] right-[14%] h-2 w-24 rounded-full" />
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-[#080b11] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="min-w-0">
                  <SkeletonBlock className="h-2.5 w-28 rounded-full" />
                  <SkeletonBlock className="mt-2 h-5 w-44 rounded-full" />
                </div>
                <div className="text-right">
                  <SkeletonBlock className="ml-auto h-5 w-20 rounded-full" />
                  <SkeletonBlock className="ml-auto mt-2 h-3 w-16 rounded-full" />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {[0, 1, 2, 3, 4].map((index) => (
                  <SkillRowSkeleton key={index} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContributionChipSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-[#080b11] px-1.5 py-2 sm:px-3">
      <SkeletonBlock className="h-2 w-16 rounded-full" />
      <div className="mt-1 flex min-w-0 items-baseline gap-1 sm:gap-1.5">
        <SkeletonBlock
          className={classNames("h-3.5 rounded-full", compact ? "w-20" : "w-16")}
        />
        {!compact ? <SkeletonBlock className="h-4 w-8 rounded-full" /> : null}
      </div>
    </div>
  );
}

function SkillRowSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <SkeletonBlock className="h-7 w-7 shrink-0 rounded-lg" />
        <div className="min-w-0">
          <SkeletonBlock className="h-3 w-28 rounded-full" />
          <SkeletonBlock className="mt-1.5 h-2.5 w-36 rounded-full" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-1">
        <SkeletonSparkline />
        <SkeletonBlock className="h-3 w-12 rounded-full" />
      </div>
    </div>
  );
}

function HabitSkeleton() {
  return (
    <div className="space-y-4 xl:space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] xl:gap-6">
        <DailyConsistencySkeleton />
        <StreakTrendSkeleton />
      </div>
    </div>
  );
}

function DailyConsistencySkeleton() {
  return (
    <div className="rounded-2xl border border-emerald-400/10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_32%),linear-gradient(145deg,rgba(9,9,11,0.96),rgba(24,24,27,0.88))] p-3.5 shadow-[0_18px_44px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SkeletonBlock className="h-3 w-36 rounded-full" />
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/55 text-center text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {[0, 1].map((index) => (
            <div
              key={index}
              className={classNames(
                "px-3 py-2",
                index === 0 && "border-r border-white/10"
              )}
            >
              <SkeletonBlock className="mx-auto h-3.5 w-5 rounded-full" />
              <SkeletonBlock className="mx-auto mt-1.5 h-2.5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 pb-1">
        <div className="grid w-full grid-cols-10 gap-1.5 sm:gap-2">
          {Array.from({ length: 30 }).map((_, index) => (
            <SkeletonBlock
              key={index}
              className="aspect-square w-full rounded-[5px] border-zinc-800/80 bg-zinc-950/80"
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <SkeletonBlock className="h-3 w-14 rounded-full" />
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((step) => (
            <SkeletonBlock key={step} className="h-3.5 w-3.5 rounded-[4px]" />
          ))}
        </div>
        <SkeletonBlock className="h-3 w-9 rounded-full" />
      </div>
    </div>
  );
}

function StreakTrendSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.08),transparent_38%),linear-gradient(145deg,rgba(9,9,11,0.94),rgba(24,24,27,0.82))] p-2.5 text-xs text-zinc-400 shadow-[0_18px_40px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-2xl sm:p-4 sm:text-sm">
      <SkeletonBlock className="h-3 w-32 rounded-full" />

      <div className="mt-3 rounded-xl border border-white/[0.07] bg-zinc-950/55 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBlock className="h-3 w-32 rounded-full" />
          <SkeletonBlock className="h-6 w-20 shrink-0 rounded-full" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 px-0.5">
        <SkeletonBlock className="h-2.5 w-32 rounded-full" />
        <SkeletonBlock className="h-2.5 w-16 shrink-0 rounded-full" />
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-1.5 rounded-xl border border-white/[0.06] bg-black/25 p-1.5 sm:gap-2 sm:p-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="flex h-9 min-w-0 items-center justify-center rounded-lg border border-white/[0.06] bg-zinc-950/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:h-10"
          >
            <SkeletonBlock className="h-3 w-2.5 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonLineChart() {
  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 640 238"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="analytics-skeleton-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.01)" />
        </linearGradient>
      </defs>
      {[52, 98, 144, 190].map((y) => (
        <line
          key={y}
          x1="0"
          x2="640"
          y1={y}
          y2={y}
          stroke="rgba(255,255,255,0.045)"
          strokeWidth="1"
        />
      ))}
      <path
        d="M 0 188 C 76 176 98 136 154 144 C 220 154 242 86 314 96 C 390 106 414 62 486 74 C 548 84 588 42 640 54 L 640 238 L 0 238 Z"
        fill="url(#analytics-skeleton-area)"
      />
      <path
        d="M 0 188 C 76 176 98 136 154 144 C 220 154 242 86 314 96 C 390 106 414 62 486 74 C 548 84 588 42 640 54"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SkeletonSparkline() {
  return (
    <svg
      viewBox="0 0 24 12"
      className="h-3 w-6 shrink-0 grow-0 basis-auto"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M1.5,9 L7,6.5 L12,7.2 L17,3.8 L22.5,5"
        fill="none"
        stroke="rgba(113,113,122,0.45)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
    </svg>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        "analytics-skeleton-block relative block overflow-hidden rounded-xl border border-white/[0.035] bg-white/[0.055] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] after:absolute after:inset-y-0 after:left-0 after:w-1/2 after:bg-gradient-to-r after:from-transparent after:via-white/[0.055] after:to-transparent",
        className
      )}
    />
  );
}

function SkeletonStyles() {
  return (
    <style jsx global>{`
      @keyframes analyticsSkeletonSheen {
        0% {
          transform: translateX(-120%);
          opacity: 0;
        }
        28% {
          opacity: 0.34;
        }
        68% {
          opacity: 0.14;
        }
        100% {
          transform: translateX(120%);
          opacity: 0;
        }
      }

      .analytics-skeleton-block::after {
        animation: analyticsSkeletonSheen 3.4s ease-in-out infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        .analytics-skeleton-block::after {
          animation: none;
        }
      }
    `}</style>
  );
}
