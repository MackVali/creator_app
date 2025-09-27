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

export async function fetchReadyTasks(
  client?: Client,
  options?: { userId?: string | null }
): Promise<TaskLite[]> {
  const supabase = ensureClient(client);

  let query = supabase
    .from('tasks')
    .select('id, name, priority, stage, duration_min, energy, project_id, skill_id, skills(icon)');

  if (options?.userId) {
    query = query.eq('user_id', options.userId);
  }

  const { data, error } = await query;

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

  const weekday = date.getUTCDay();
  const prevWeekday = (weekday + 6) % 7;
  const columns = 'id, label, energy, start_local, end_local, days';

  const [
    { data: today, error: errToday },
    { data: prev, error: errPrev },
    { data: recurring, error: errRecurring },
  ] = await Promise.all([
    supabase
      .from('windows')
      .select(columns)
      .contains('days', [weekday]),
    supabase
      .from('windows')
      .select(columns)
      .contains('days', [prevWeekday]),
    supabase.from('windows').select(columns).is('days', null),
  ]);

  if (errToday || errPrev || errRecurring) {
    throw errToday ?? errPrev ?? errRecurring;
  }

  const always = recurring ?? [];

  const crosses = (w: WindowLite) => {
    const [sh = 0, sm = 0] = w.start_local.split(':').map(Number);
    const [eh = 0, em = 0] = w.end_local.split(':').map(Number);
    return eh < sh || (eh === sh && em < sm);
  };

  const base = new Map<string, WindowLite>();
  for (const window of [...(today ?? []), ...always]) {
    if (!base.has(window.id)) {
      base.set(window.id, window as WindowLite);
    }
  }

  const prevCross = [...(prev ?? []), ...always]
    .filter(crosses)
    .map((w) => ({ ...w, fromPrevDay: true }));

  return [...base.values(), ...prevCross] as WindowLite[];
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
  client?: Client,
  options?: { userId?: string | null }
): Promise<Record<string, ProjectLite>> {
  const supabase = ensureClient(client);

  let query = supabase
    .from('projects')
    .select('id, name, priority, stage, energy, duration_min');

  if (options?.userId) {
    query = query.eq('user_id', options.userId);
  }

  const { data, error } = await query;

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

