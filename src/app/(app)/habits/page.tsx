"use client";

import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader, SectionHeader } from "@/components/ui";

const summaryCards = [
  {
    id: "streak",
    label: "Active streak",
    value: "24 days",
    detail: "Longest streak in progress",
    accent: "from-emerald-500/25 via-emerald-500/5 to-transparent",
    glow: "bg-emerald-500/40",
  },
  {
    id: "consistency",
    label: "Consistency",
    value: "86%",
    detail: "Completion over the last 30 days",
    accent: "from-sky-500/25 via-sky-500/5 to-transparent",
    glow: "bg-sky-500/40",
  },
  {
    id: "checkins",
    label: "Check-ins",
    value: "5 today",
    detail: "Moments of progress logged",
    accent: "from-amber-500/25 via-amber-500/5 to-transparent",
    glow: "bg-amber-500/40",
  },
];

const habitHighlights = [
  {
    id: "morning-reading",
    name: "Morning Reading",
    description: "Ease into the day with focused, intentional reading.",
    emoji: "📚",
    frequency: "Daily · Morning",
    streak: 12,
    bestStreak: 30,
    completionRate: 82,
    lastCompleted: "2 hours ago",
    tags: ["Mindset", "Focus"],
    iconBg: "bg-amber-500/15 text-amber-200",
    progressColor: "from-amber-400 via-amber-300 to-amber-200",
    ctaClass: "bg-amber-500/20 text-amber-100 hover:bg-amber-500/30",
  },
  {
    id: "deep-work",
    name: "Deep Work Sprint",
    description: "Protect 90 minutes for uninterrupted creation time.",
    emoji: "⚡",
    frequency: "Weekdays · 9am",
    streak: 7,
    bestStreak: 18,
    completionRate: 74,
    lastCompleted: "Yesterday",
    tags: ["Creation", "Distraction-free"],
    iconBg: "bg-purple-500/15 text-purple-200",
    progressColor: "from-purple-400 via-purple-300 to-purple-200",
    ctaClass: "bg-purple-500/20 text-purple-100 hover:bg-purple-500/30",
  },
  {
    id: "training",
    name: "Marathon Prep",
    description: "Stack endurance with alternating run and strength days.",
    emoji: "🏃",
    frequency: "5× weekly",
    streak: 9,
    bestStreak: 21,
    completionRate: 68,
    lastCompleted: "This morning",
    tags: ["Energy", "Discipline"],
    iconBg: "bg-emerald-500/15 text-emerald-200",
    progressColor: "from-emerald-400 via-emerald-300 to-emerald-200",
    ctaClass: "bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30",
  },
  {
    id: "language",
    name: "Spanish Sessions",
    description: "Practice with Duolingo and a five-minute voice note recap.",
    emoji: "🗣️",
    frequency: "Daily · Evening",
    streak: 16,
    bestStreak: 34,
    completionRate: 91,
    lastCompleted: "Last night",
    tags: ["Language", "Consistency"],
    iconBg: "bg-sky-500/15 text-sky-200",
    progressColor: "from-sky-400 via-sky-300 to-sky-200",
    ctaClass: "bg-sky-500/20 text-sky-100 hover:bg-sky-500/30",
  },
  {
    id: "recovery",
    name: "Wind-Down Ritual",
    description: "Low lights, reflection journal, and zero screens by 10pm.",
    emoji: "🌙",
    frequency: "Daily · Night",
    streak: 22,
    bestStreak: 40,
    completionRate: 88,
    lastCompleted: "10 hours ago",
    tags: ["Recovery", "Sleep"],
    iconBg: "bg-indigo-500/15 text-indigo-200",
    progressColor: "from-indigo-400 via-indigo-300 to-indigo-200",
    ctaClass: "bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30",
  },
  {
    id: "reflection",
    name: "Daily Reflection",
    description: "Capture one win, one lesson, and tomorrow's priority.",
    emoji: "📝",
    frequency: "Daily · Night",
    streak: 28,
    bestStreak: 45,
    completionRate: 94,
    lastCompleted: "Last night",
    tags: ["Clarity", "Momentum"],
    iconBg: "bg-rose-500/15 text-rose-200",
    progressColor: "from-rose-400 via-rose-300 to-rose-200",
    ctaClass: "bg-rose-500/20 text-rose-100 hover:bg-rose-500/30",
  },
];

export default function HabitsPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#05070c] pb-16 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageHeader
            title={<span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Habits</span>}
            description="Design your routines, track the streaks that matter, and celebrate the momentum you are building."
          >
            <Link
              href="/habits/new"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              <span className="text-lg leading-none">＋</span>
              <span>Create habit</span>
            </Link>
          </PageHeader>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <div
                key={card.id}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_35px_-25px_rgba(15,23,42,0.65)]"
              >
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.accent} opacity-80`}
                  aria-hidden
                />
                <div className="relative flex flex-col gap-4">
                  <div className="flex items-center gap-3 text-sm font-medium uppercase tracking-[0.2em] text-white/60">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_20px_6px_rgba(255,255,255,0.15)]" />
                    {card.label}
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-semibold tracking-tight text-white">{card.value}</span>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/70">{card.detail}</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full w-1/3 ${card.glow} blur-md`} aria-hidden />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <SectionHeader
            title="Your daily rhythm"
            description="Track streaks, consistency, and the rituals that keep you moving."
            className="text-white"
          />

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {habitHighlights.map((habit) => (
              <article
                key={habit.id}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_18px_45px_-25px_rgba(15,23,42,0.6)] transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_28px_55px_-20px_rgba(15,23,42,0.7)]"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),transparent_60%)] opacity-0 transition duration-300 group-hover:opacity-100" />
                <div className="relative flex items-start justify-between gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${habit.iconBg}`}>
                    <span role="img" aria-label="habit icon">
                      {habit.emoji}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white/70">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    {habit.frequency}
                  </div>
                </div>

                <div className="relative mt-6 space-y-2">
                  <h3 className="text-xl font-semibold tracking-tight text-white">{habit.name}</h3>
                  <p className="text-sm text-white/70">{habit.description}</p>
                </div>

                <div className="relative mt-6 space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-xs text-white/60">
                    <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                      <p className="font-medium text-white/80">{habit.streak} days</p>
                      <p>Current streak</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                      <p className="font-medium text-white/80">{habit.bestStreak} days</p>
                      <p>Best streak</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                      <p className="font-medium text-white/80">{habit.completionRate}%</p>
                      <p>Consistency</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>Progress this week</span>
                      <span className="font-semibold text-white/80">{habit.completionRate}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${habit.progressColor}`}
                        style={{ width: `${habit.completionRate}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {habit.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-white/60"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-5 text-xs text-white/60">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🕒</span>
                    <span>Last check-in {habit.lastCompleted}</span>
                  </div>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${habit.ctaClass}`}
                  >
                    <span>Mark complete</span>
                    <span aria-hidden>→</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
