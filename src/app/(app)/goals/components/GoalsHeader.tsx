"use client";

import { Plus } from "lucide-react";

interface GoalsHeaderProps {
  onCreate(): void;
  stats: {
    total: number;
    active: number;
    completed: number;
    momentum: number;
    xp: number;
  };
}

export function GoalsHeader({ onCreate, stats }: GoalsHeaderProps) {
  const statCards = [
    { label: "Total Goals", value: stats.total, hint: "tracked" },
    { label: "Active Now", value: stats.active, hint: "in play" },
    { label: "Completed", value: stats.completed, hint: "shipped" },
  ];

  return (
    <header className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_40px_120px_-60px_rgba(239,68,68,0.85)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.25),_transparent_65%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 mix-blend-screen">
        <div className="h-full w-full bg-[linear-gradient(120deg,rgba(255,255,255,0.18),transparent)]" />
      </div>
      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">Goals hub</p>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-[46px]">
              MY GOALS
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Plan, prioritize, and swipe through every goal with just enough neon to stay inspired,
              not overwhelmed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={onCreate}
              className="inline-flex items-center gap-3 rounded-full border border-red-500/60 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_15px_45px_rgba(239,68,68,0.45)] transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              style={{
                background: "linear-gradient(120deg, #ff4d4d, #c40000, #040404)",
              }}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white">
                <Plus className="h-4 w-4" />
              </span>
              add GOAL
            </button>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-white/60">
              Momentum {stats.momentum}%
            </div>
          </div>
        </div>
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-white/50">
            <span>Squad XP</span>
            <span className="text-white">
              {stats.xp.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {statCards.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-white/[0.08] p-3 text-center"
              >
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{stat.value}</p>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                  {stat.hint}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
