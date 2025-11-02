import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '../../../lib/supabase';
import type { Database } from '../../../types/supabase';
import { normalizeTimeZone, weekdayInTimeZone } from './timezone';
import type { TaskLite, ProjectLite } from './weight';

export type WindowLite = {
  id: string;
  label: string;
  energy: string;
  start_local: string;
  end_local: string;
  days: number[] | null;
  location_context_id: string | null;
  location_context: string | null;
  fromPrevDay?: boolean;
};

type WindowRecord = {
  id: string;
  label?: string | null;
  energy?: string | null;
  start_local?: string | null;
  end_local?: string | null;
  days?: number[] | null;
  location_context_id?: string | null;
  location_context?: {
    id?: string | null;
    value?: string | null;
    label?: string | null;
  } | null;
};

function mapWindowRecord(record: WindowRecord): WindowLite {
  const value = record.location_context?.value
    ? String(record.location_context.value).toUpperCase().trim()
    : null;
  const label = record.location_context?.label ?? (value ? value : null);

  return {
    id: record.id,
    label: record.label ?? '',
    energy: record.energy ?? '',
    start_local: record.start_local ?? '00:00',
    end_local: record.end_local ?? '00:00',
    days: record.days ?? null,
    location_context_id: record.location_context_id ?? null,
    location_context_value: value,
    location_context_name: label,
  };
}

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
    .select(
      'id, name, priority, stage, duration_min, energy, project_id, skill_id, skills(icon, monument_id)'
    );

  if (error) throw error;
  return (data ?? []).map(
    ({
      id,
      name,
      priority,
      stage,
      duration_min,
      energy,
      project_id,
      skill_id,
      skills,
    }) => ({
      id,
      name,
      priority,
      stage,
      duration_min,
      energy,
      project_id,
      skill_id,
      skill_icon: (skills as unknown as { icon?: string | null } | null)?.icon ?? null,
      skill_monument_id:
        (skills as unknown as { monument_id?: string | null } | null)?.monument_id ?? null,
    })
  );
}

export async function updateTaskStage(
  taskId: string,
  stage: TaskLite['stage'],
  client?: Client,
) {
  const supabase = ensureClient(client);
  return await supabase
    .from('tasks')
    .update({ stage })
    .eq('id', taskId);
}

const crossesMidnight = (w: WindowLite) => {
  const [sh = 0, sm = 0] = w.start_local.split(':').map(Number);
  const [eh = 0, em = 0] = w.end_local.split(':').map(Number);
  return eh < sh || (eh === sh && em < sm);
};

function buildWindowsForDateFromSnapshot(
  snapshot: WindowLite[],
  date: Date,
  timeZone: string,
): WindowLite[] {
  const weekday = weekdayInTimeZone(date, timeZone);
  const prevWeekday = (weekday + 6) % 7;

  const today: WindowLite[] = [];
  const prev: WindowLite[] = [];
  const always: WindowLite[] = [];

  for (const window of snapshot) {
    const days = window.days ?? null;
    const crosses = crossesMidnight(window);

    if (days === null) {
      always.push({ ...window, fromPrevDay: false });
    } else if (days.includes(weekday)) {
      today.push({ ...window, fromPrevDay: false });
    }

    const appliesToPrev = days === null || (days?.includes(prevWeekday) ?? false);
    if (crosses && appliesToPrev) {
      prev.push({ ...window, fromPrevDay: true });
    }
  }

  const base = new Map<string, WindowLite>();
  for (const window of [...today, ...always]) {
    if (!base.has(window.id)) {
      base.set(window.id, { ...window, fromPrevDay: false });
    }
  }

  const prevCross = [...prev, ...always.filter(crossesMidnight).map((w) => ({ ...w, fromPrevDay: true }))];

  return [...base.values(), ...prevCross];
}

export async function fetchWindowsForDate(
  date: Date,
  client?: Client,
  timeZone?: string | null,
  options?: { userId?: string | null; snapshot?: WindowLite[] },
): Promise<WindowLite[]> {
  const normalizedTimeZone = normalizeTimeZone(timeZone);

  if (options?.snapshot) {
    return buildWindowsForDateFromSnapshot(options.snapshot, date, normalizedTimeZone);
  }

  const supabase = ensureClient(client);

  const weekday = weekdayInTimeZone(date, normalizedTimeZone);
  const prevWeekday = (weekday + 6) % 7;
  const columnVariants = [
    'id, label, energy, start_local, end_local, days, location_context_id, location_context:location_contexts!windows_location_context_id_fkey(value)',
    'id, label, energy, start_local, end_local, days, location_context',
  ] as const;

  type RawWindowRecord = {
    id: string;
    label: string;
    energy: string;
    start_local: string;
    end_local: string;
    days: number[] | null;
    location_context_id?: string | null;
    location_context?: unknown;
    fromPrevDay?: boolean;
  };

  const fetchVariant = async (columns: string) =>
    Promise.all([
      supabase
        .from('windows')
        .select(columns)
        .contains('days', [weekday]),
      supabase
        .from('windows')
        .select(columns)
        .contains('days', [prevWeekday]),
      supabase
        .from('windows')
        .select(columns)
        .is('days', null),
    ]);

  let today: RawWindowRecord[] | null = null;
  let prev: RawWindowRecord[] | null = null;
  let recurring: RawWindowRecord[] | null = null;
  let matchedColumns: string | null = null;
  let lastError: PostgrestError | null = null;

  for (const columns of columnVariants) {
    const responses = await fetchVariant(columns);
    const error =
      responses.find((result) => result.error)?.error ?? null;
    if (error) {
      lastError = error;
      if (error.code === '42703') {
        continue;
      }
      throw error;
    }

    today = responses[0].data as RawWindowRecord[] | null;
    prev = responses[1].data as RawWindowRecord[] | null;
    recurring = responses[2].data as RawWindowRecord[] | null;
    matchedColumns = columns;
    break;
  }

  if (!matchedColumns) {
    if (lastError) throw lastError;
    return [];
  }

  const normalizeWindow = (window: RawWindowRecord): WindowLite => ({
    id: window.id,
    label: window.label,
    energy: window.energy,
    start_local: window.start_local,
    end_local: window.end_local,
    days: window.days ?? null,
    location_context_id: window.location_context_id ?? null,
    location_context: extractLocationContext(window.location_context),
  });

  const todayWindows = (today ?? []).map(normalizeWindow);
  const prevWindows = (prev ?? []).map(normalizeWindow);
  const recurringWindows = (recurring ?? []).map(normalizeWindow);

  const always = recurringWindows;

  const todayWindows = mapWindows(today);
  const prevWindows = mapWindows(prev);
  const alwaysWindows = mapWindows(recurring);

  const base = new Map<string, WindowLite>();
  for (const window of [...todayWindows, ...always]) {
    if (!base.has(window.id)) {
      base.set(window.id, window);
    }
  }

  const prevCross = [...prevWindows, ...always]
    .filter(crosses)
    .map((w) => ({ ...w, fromPrevDay: true }));

  return [...base.values(), ...prevCross];
}

export async function fetchWindowsSnapshot(
  userId: string,
  client?: Client,
): Promise<WindowLite[]> {
  const supabase = ensureClient(client);
  const contextJoin = 'location_context:location_contexts(id, value, label)';
  const { data, error } = await supabase
    .from('windows')
    .select(`id, label, energy, start_local, end_local, days, location_context_id, ${contextJoin}`)
    .eq('user_id', userId);

  if (error) throw error;

  return ((data ?? []) as WindowRecord[]).map(mapWindowRecord);
}

export function windowsForDateFromSnapshot(
  snapshot: WindowLite[],
  date: Date,
  timeZone: string,
): WindowLite[] {
  return buildWindowsForDateFromSnapshot(snapshot, date, timeZone);
}

export async function fetchAllWindows(client?: Client): Promise<WindowLite[]> {
  const supabase = ensureClient(client);

  const columnVariants = [
    'id, label, energy, start_local, end_local, days, location_context_id, location_context:location_contexts!windows_location_context_id_fkey(value)',
    'id, label, energy, start_local, end_local, days, location_context',
  ] as const;

  type RawWindowRecord = {
    id: string;
    label?: string | null;
    energy?: string | null;
    start_local?: string | null;
    end_local?: string | null;
    days?: number[] | null;
    location_context_id?: string | null;
    location_context?: unknown;
  };

  let data: RawWindowRecord[] | null = null;
  let lastError: PostgrestError | null = null;

  for (const columns of columnVariants) {
    const response = await supabase.from('windows').select(columns);
    if (response.error) {
      lastError = response.error;
      if (response.error.code === '42703') {
        continue;
      }
      throw response.error;
    }

    data = response.data as RawWindowRecord[] | null;
    break;
  }

  if (!data) {
    if (lastError) throw lastError;
    return [];
  }

  return (data ?? []).map((window) => ({
    id: window.id,
    label: window.label ?? '',
    energy: window.energy ?? '',
    start_local: window.start_local ?? '00:00',
    end_local: window.end_local ?? '00:00',
    days: window.days ?? null,
    location_context_id: window.location_context_id ?? null,
    location_context: extractLocationContext(window.location_context),
  }));
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

function extractLocationContext(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const value = raw.trim();
    return value.length > 0 ? value : null;
  }

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const value = extractLocationContext(entry);
      if (value) return value;
    }
    return null;
  }

  if (raw && typeof raw === 'object') {
    const candidate = (raw as { value?: unknown }).value;
    if (typeof candidate === 'string') {
      const value = candidate.trim();
      return value.length > 0 ? value : null;
    }
  }

  return null;
}
export async function fetchProjectSkillsForProjects(
  projectIds: string[],
  client?: Client
): Promise<Record<string, string[]>> {
  if (projectIds.length === 0) return {};

  const supabase = ensureClient(client);
  const { data, error } = await supabase
    .from('project_skills')
    .select('project_id, skill_id')
    .in('project_id', projectIds);

  if (error) throw error;

  const map: Record<string, string[]> = {};
  for (const entry of (data ?? []) as {
    project_id: string | null;
    skill_id: string | null;
  }[]) {
    const projectId = entry.project_id;
    const skillId = entry.skill_id;
    if (!projectId || !skillId) continue;
    const existing = map[projectId] ?? [];
    if (!existing.includes(skillId)) {
      existing.push(skillId);
      map[projectId] = existing;
    } else if (!map[projectId]) {
      map[projectId] = existing;
    }
  }

  return map;
}
