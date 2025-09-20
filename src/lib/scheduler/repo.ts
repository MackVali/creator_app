import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '../../../lib/supabase';
import type { Database } from '../../../types/supabase';
import type { TaskLite, ProjectLite } from './weight';

export type WindowLite = {
  id: string;
  label: string;
  energy: string;
  start_local: string;
  end_local: string;
  days: number[] | null;
  fromPrevDay?: boolean;
};

type Client = SupabaseClient<Database>;

function ensureClient(client?: Client): Client {
  if (client) return client;
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error('Supabase client not available');
  return supabase as Client;
}

export async function fetchReadyTasks(client?: Client): Promise<TaskLite[]> {
  const supabase = ensureClient(client);

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
  date: Date,
  client?: Client
): Promise<WindowLite[]> {
  const supabase = ensureClient(client);

  const weekday = date.getDay();
  const prevWeekday = (weekday + 6) % 7;

  const { data: today, error: err1 } = await supabase
    .from('windows')
    .select('id, label, energy, start_local, end_local, days')
    .contains('days', [weekday]);

  const { data: prev, error: err2 } = await supabase
    .from('windows')
    .select('id, label, energy, start_local, end_local, days')
    .contains('days', [prevWeekday]);

  if (err1 || err2) throw err1 ?? err2;

  const crosses = (w: WindowLite) => {
    const [sh = 0, sm = 0] = w.start_local.split(':').map(Number);
    const [eh = 0, em = 0] = w.end_local.split(':').map(Number);
    return eh < sh || (eh === sh && em < sm);
  };

  const prevCross = (prev ?? [])
    .filter(crosses)
    .map((w) => ({ ...w, fromPrevDay: true }));

  return [...(today ?? []), ...prevCross] as WindowLite[];
}

export async function fetchAllWindows(client?: Client): Promise<WindowLite[]> {
  const supabase = ensureClient(client);

  const { data, error } = await supabase
    .from('windows')
    .select('id, label, energy, start_local, end_local, days');

  if (error) throw error;

  return (data ?? []) as WindowLite[];
}

export async function fetchProjectsMap(
  client?: Client
): Promise<Record<string, ProjectLite>> {
  const supabase = ensureClient(client);

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, priority, stage, energy, duration_min');

  if (error) throw error;
  const map: Record<string, ProjectLite> = {};
  type ProjectRecord = {
    id: string;
    name?: string | null;
    priority: string;
    stage: string;
    energy?: string | null;
    duration_min?: number | null;
  };

  for (const p of (data ?? []) as ProjectRecord[]) {
    map[p.id] = {
      id: p.id,
      name: p.name ?? undefined,
      priority: p.priority,
      stage: p.stage,
      energy: p.energy ?? null,
      duration_min: p.duration_min ?? null,
    };
  }
  return map;
}

