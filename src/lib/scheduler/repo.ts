import { getSupabaseBrowser } from '../../../lib/supabase';
import type { TaskLite, ProjectLite } from './weight';

export type WindowLite = {
  id: string;
  label: string;
  energy_cap: string;
  start_local: string;
  end_local: string;
  days_of_week: number[] | null;
};

export async function fetchReadyTasks(): Promise<TaskLite[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error('Supabase client not available');

  type TaskRow = TaskLite & { status: string };
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, priority, stage, duration_min, energy, project_id, status'
    )
    .in('status', ['backlog', 'ready']);

  if (error) throw error;
  return ((data ?? []) as TaskRow[]).map((row) => {
    const { status, ...task } = row;
    void status;
    return task;
  });
}

export async function fetchWindowsForDate(
  weekday0to6: number
): Promise<WindowLite[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error('Supabase client not available');

  const { data, error } = await supabase
    .from('windows')
    .select(
      'id, label, energy_cap, start_local, end_local, days_of_week'
    )
    .contains('days_of_week', [weekday0to6]);

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
    .select('id, priority, stage');

  if (error) throw error;
  const map: Record<string, ProjectLite> = {};
  for (const p of data ?? []) {
    map[p.id] = p as ProjectLite;
  }
  return map;
}

