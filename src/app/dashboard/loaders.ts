// src/app/dashboard/loaders.ts
import { cookies as nextCookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabase'

export async function getUserStats(cookieStore = nextCookies()) {
  const supabase = getSupabaseServer(cookieStore as any)
  const { data, error } = await supabase
    .from('user_stats_v')
    .select('level,xp_current,xp_max')
    .single()
  if (error) return { level: 1, xp_current: 0, xp_max: 4000 }
  return data
}

export async function getMonumentsSummary(cookieStore = nextCookies()) {
  const supabase = getSupabaseServer(cookieStore as any)
  const { data, error } = await supabase
    .from('monuments_summary_v')
    .select('category,count')
  const base = { Achievement: 0, Legacy: 0, Triumph: 0, Pinnacle: 0 } as Record<string, number>
  if (!error && data) {
    for (const row of data) {
      if (row.category in base) base[row.category] = row.count
    }
  }
  return base
}

export async function getSkillsAndGoals(cookieStore = nextCookies()) {
  const supabase = getSupabaseServer(cookieStore as any)

  const [skillsRes, goalsRes] = await Promise.all([
    supabase.from('skills_progress_v').select('skill_id,name,progress').order('name'),
    supabase.from('goals_active_v').select('goal_id,name,updated_at').limit(3)
  ])

  return {
    skills: skillsRes.data ?? [],
    goals: (goalsRes.data ?? []).map(g => g.name),
  }
}
