import { getSupabaseBrowser } from '../../../lib/supabase';
import type { TaskLite, ProjectLite } from './weight';

export type WindowLite = {
  id: string;
  label: string;
  energy: string;
  start_local: string;
  end_local: string;
  days: number[] | null;
};

export async function fetchReadyTasks(): Promise<TaskLite[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error('Supabase client not available');

  const { data, error } = await supabase
    .from('tasks')
    .select('id, name, priority, stage, duration_min, energy, project_id, skill_id, skills(icon)');

  if (error) throw error;
  return (data ?? []).map(
    ({ id, name, priority, stage, duration_min, energy, project_id, skill_id, skills }) => ({
      id,
      name,
      priority,
      stage,
      duration_min,
      energy,
      project_id,
      skill_id,
      skill_icon: (skills as unknown as { icon?: string | null } | null)?.icon ?? null,
    })
  );
}

export async function fetchWindowsForDate(
  weekday0to6: number
): Promise<WindowLite[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error('Supabase client not available');

  const { data, error } = await supabase
    .from('windows')
    .select('id, label, energy, start_local, end_local, days')
    .contains('days', [weekday0to6]);

  if (error) throw error;
  return (data ?? []) as WindowLite[];
}

export async function fetchProjectsMap(): Promise<
  Record<string, ProjectLite>
> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error('Supabase client not available');

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, priority, stage, energy');

  if (error) throw error;
  const map: Record<string, ProjectLite> = {};
  for (const p of data ?? []) {
    map[p.id] = p as ProjectLite;
  }
  return map;
}

