// <APP_ROOT>/dashboard/page.tsx
import React from "react";
import { getUserStats, getMonumentsSummary, getSkillsAndGoals } from './loaders'

// minimal inline icons
const Trophy = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M17 4H7v3a5 5 0 0 0 5 5 5 5 0 0 0 5-5V4Z" />
    <path d="M7 7H5a3 3 0 0 0 0 6h2" />
    <path d="M17 7h2a3 3 0 0 1 0 6h-2" />
  </svg>
);
const Ribbon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M8.5 12 7 22l5-3 5 3-1.5-10" />
  </svg>
);
const Target = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <path d="M22 12h-2M4 12H2M12 2v2M12 20v2" />
  </svg>
);
const Peak = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M3 20 12 4l9 16H3Z" />
    <path d="M12 4v6l3-2" />
  </svg>
);
const Pen = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="m12 20-3 1 1-3 8-8 2 2-8 8Z" />
    <path d="M18 6l2 2" />
  </svg>
);
const Clock = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const Mic = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8" />
  </svg>
);
const Spark = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="m12 2 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />
  </svg>
);
const Music = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M9 18a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm6-12v10a3 3 0 1 0 2 2V6l5-1V3l-7 2Z" />
  </svg>
);
const Guitar = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M11 11 3 19a4 4 0 1 0 6 6l8-8" />
    <circle cx="19" cy="5" r="2" />
    <path d="m17 7 4 4" />
  </svg>
);

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-md shadow-black/20">
      <header className="px-6 pt-5 pb-3 text-[13px] font-semibold tracking-[0.14em] text-zinc-300/90">
        {title}
      </header>
      <div className="px-6 pb-6">{children}</div>
    </section>
  );
}
function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-7 w-full rounded-lg bg-zinc-800/80 p-1">
      <div
        className="h-full rounded-md bg-zinc-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
function StatCard({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-5 text-zinc-200 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-800/70 text-zinc-300">
        {icon}
      </div>
      <div className="text-[13.5px] text-zinc-300/90">{label}</div>
      <div className="text-[15px] font-semibold text-zinc-100">{count}</div>
    </div>
  );
}
function SkillRow({
  icon,
  name,
  value,
}: {
  icon: React.ReactNode;
  name: string;
  value: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-4">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-zinc-800/70 text-zinc-300">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-[14px] text-zinc-200">{name}</div>
        <div className="mt-2 h-2 rounded-full bg-zinc-800/80">
          <div
            className="h-full rounded-full bg-zinc-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
function GoalsList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-[15px] leading-6 text-zinc-200">
      {items.map((g, i) => (
        <li key={i}>{g}</li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const [{ level, xp_current, xp_max }, monuments, { skills, goals }] = await Promise.all([
    getUserStats(),
    getMonumentsSummary(),
    getSkillsAndGoals(),
  ])

  const lvlTitle = `LEVEL ${level ?? 1}`
  const xp = { current: xp_current ?? 0, max: xp_max ?? 4000 }

  const M = {
    Achievement: monuments.Achievement ?? 0,
    Legacy: monuments.Legacy ?? 0,
    Triumph: monuments.Triumph ?? 0,
    Pinnacle: monuments.Pinnacle ?? 0,
  }

  const safeSkills = skills?.length
    ? skills
    : [
        { skill_id: 'w', name: 'Writing', progress: 60 },
        { skill_id: 'tm', name: 'Time Management', progress: 45 },
        { skill_id: 'ps', name: 'Public Speaking', progress: 35 },
        { skill_id: 'pb', name: 'Problem Solving', progress: 55 },
        { skill_id: 'm1', name: 'Music', progress: 40 },
        { skill_id: 'm2', name: 'Music', progress: 30 },
        { skill_id: 'm3', name: 'Music', progress: 50 },
        { skill_id: 'g', name: 'Guitar', progress: 25 },
      ]

  const safeGoals = goals?.length
    ? goals
    : ['Complete book manuscript', 'Improve presentation skills', 'Plan charity event']

  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10 text-zinc-100">
      <Section title={lvlTitle}>
        <div className="flex items-center justify-between text-sm text-zinc-300/90">
          <div className="w-full">
            <ProgressBar value={xp.current} max={xp.max} />
            <div className="mt-2 text-right text-[13px] text-zinc-400">
              {xp.current} / {xp.max}
            </div>
          </div>
        </div>
      </Section>

      <div className="h-6" />
      <Section title="MONUMENTS">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={<Trophy className="h-5 w-5" />} label="Achievement" count={M.Achievement} />
          <StatCard icon={<Ribbon className="h-5 w-5" />} label="Legacy" count={M.Legacy} />
          <StatCard icon={<Target className="h-5 w-5" />} label="Triumph" count={M.Triumph} />
          <StatCard icon={<Peak className="h-5 w-5" />} label="Pinnacle" count={M.Pinnacle} />
        </div>
      </Section>

      <div className="h-6" />
      <Section title="SKILLS">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {safeSkills.map(s => (
            <SkillRow key={s.skill_id} icon={<Pen className="h-4 w-4" />} name={s.name} value={s.progress} />
          ))}
        </div>
      </Section>

      <div className="h-6" />
      <Section title="CURRENT GOALS">
        <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-5">
          <GoalsList items={safeGoals} />
        </div>
      </Section>
    </main>
  )
}
