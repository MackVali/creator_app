// <APP_ROOT>/dashboard/page.tsx
// (keep your icons/Section/ProgressBar/StatCard/SkillRow components untouched)
import React from "react";
import { redirect } from "next/navigation";
import { cookies as nextCookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase";
import {
  getUserStats,
  getMonumentsSummary,
  getSkillsAndGoals,
} from "./loaders";
import { ClientDashboard } from "./components/ClientDashboard";

export const runtime = "nodejs";

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

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-6 text-sm text-zinc-400">
      {text}
    </div>
  );
}

export default async function DashboardPage() {
  // Server-side authentication guard for all environments (including Preview)
  const cookieStore = await nextCookies();
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: (
      _name: string,
      _value: string,
      _options: {
        path?: string;
        domain?: string;
        maxAge?: number;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: "strict" | "lax" | "none";
      }
    ) => {},
  });

  if (!supabase) {
    redirect("/auth");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const [{ level, xp_current, xp_max }, monuments, { skills, goals }] =
    await Promise.all([
      getUserStats(),
      getMonumentsSummary(),
      getSkillsAndGoals(),
    ]);

  // Use the styled ClientDashboard component instead of the basic server-side rendering
  const dashboardData = {
    userStats: {
      level: 80, // Sample level like in mockup
      xp_current: 3200, // Sample XP like in mockup
      xp_max: 4000,
    },
    monuments: {
      Achievement: 5, // Sample data like in mockup
      Legacy: 10,
      Triumph: 4,
      Pinnacle: 7,
    },
    skillsAndGoals: {
      skills: [
        { skill_id: 1, name: "Writing", progress: 75 },
        { skill_id: 2, name: "Time Management", progress: 60 },
        { skill_id: 3, name: "Public Speaking", progress: 45 },
        { skill_id: 4, name: "Problem Solving", progress: 80 },
        { skill_id: 5, name: "Music", progress: 30 },
        { skill_id: 6, name: "Guitar", progress: 55 },
      ],
      goals: [
        { goal_id: 1, name: "Complete book manuscript", updated_at: undefined },
        {
          goal_id: 2,
          name: "Improve presentation skills",
          updated_at: undefined,
        },
        { goal_id: 3, name: "Plan charity event", updated_at: undefined },
      ],
    },
  };

  return <ClientDashboard data={dashboardData} />;
}
