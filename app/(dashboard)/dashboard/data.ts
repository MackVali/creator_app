import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase";

export type Level = { level: number; xp: number; next: number };
export type Monument = { label: string; count: number };
export type Skill = { name: string; percent: number };

const mockLevel: Level = { level: 80, xp: 3200, next: 4000 };
const mockMonuments: Monument[] = [
  { label: "Achievement", count: 5 },
  { label: "Legacy", count: 10 },
  { label: "Triumph", count: 4 },
  { label: "Pinnacle", count: 7 },
];
const mockSkills: Skill[] = [
  { name: "Writing", percent: 72 },
  { name: "Time Management", percent: 65 },
  { name: "Public Speaking", percent: 40 },
  { name: "Problem Solving", percent: 55 },
  { name: "Music", percent: 35 },
  { name: "Guitar", percent: 28 },
];
const mockGoals = [
  "Complete book manuscript",
  "Improve presentation skills",
  "Plan charity event",
];

async function createClient() {
  const c = await cookies();
  return getSupabaseServer(c);
}

export async function fetchLevel(): Promise<Level> {
  const supabase = await createClient();
  if (!supabase) return mockLevel;
  try {
    const { data } = await supabase
      .from("user_level_v")
      .select("level,xp,next")
      .single();
    if (!data) return mockLevel;
    return {
      level: data.level ?? mockLevel.level,
      xp: data.xp ?? mockLevel.xp,
      next: data.next ?? mockLevel.next,
    };
  } catch {
    return mockLevel;
  }
}

export async function fetchMonuments(): Promise<Monument[]> {
  const supabase = await createClient();
  if (!supabase) return mockMonuments;
  try {
    const { data } = await supabase
      .from("monuments_summary_v")
      .select("label,count");
    return (
      data?.map((m) => ({ label: m.label, count: m.count })) || mockMonuments
    );
  } catch {
    return mockMonuments;
  }
}

export async function fetchSkills(): Promise<Skill[]> {
  const supabase = await createClient();
  if (!supabase) return mockSkills;
  try {
    const { data } = await supabase
      .from("skills_progress_v")
      .select("name,percent");
    return (
      data?.map((s) => ({ name: s.name, percent: s.percent })) || mockSkills
    );
  } catch {
    return mockSkills;
  }
}

export async function fetchGoals(): Promise<string[]> {
  const supabase = await createClient();
  if (!supabase) return mockGoals;
  try {
    const { data } = await supabase
      .from("goals_active_v")
      .select("name")
      .limit(3);
    return data?.map((g) => g.name) || mockGoals;
  } catch {
    return mockGoals;
  }
}

export async function fetchDashboardData() {
  const [level, monuments, skills, goals] = await Promise.all([
    fetchLevel(),
    fetchMonuments(),
    fetchSkills(),
    fetchGoals(),
  ]);
  return { level, monuments, skills, goals };
}
