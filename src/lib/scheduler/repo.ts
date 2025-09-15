import { getSupabaseBrowser } from '../../../lib/supabase';
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

export async function fetchWindowsForDate(date: Date): Promise<WindowLite[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error('Supabase client not available');

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

const AUTO_SCHEDULE_CATEGORY = 'auto_schedule';
const AUTO_SCHEDULE_MARKER = '__auto_schedule__';

type AutoScheduleDescription = {
  [AUTO_SCHEDULE_MARKER]: true;
  taskId: string;
  windowId: string | null;
};

export type SchedulePlacement = {
  id: string;
  taskId: string;
  windowId: string | null;
  start: Date;
  end: Date;
  title: string;
};

export type SchedulePlacementInput = {
  id?: string;
  taskId: string;
  windowId: string | null;
  start: Date;
  end: Date;
  title: string;
};

function parseAutoDescription(value: string | null): {
  taskId: string;
  windowId: string | null;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AutoScheduleDescription> | null;
    if (!parsed || parsed[AUTO_SCHEDULE_MARKER] !== true) return null;
    const taskId = typeof parsed.taskId === 'string' ? parsed.taskId : null;
    if (!taskId) return null;
    const windowId = typeof parsed.windowId === 'string' ? parsed.windowId : null;
    return { taskId, windowId };
  } catch {
    return null;
  }
}

function buildAutoDescription(taskId: string, windowId: string | null) {
  const payload: AutoScheduleDescription = {
    [AUTO_SCHEDULE_MARKER]: true,
    taskId,
    windowId: windowId ?? null,
  };
  return JSON.stringify(payload);
}

function getDateRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function fetchSchedulePlacements(
  date: Date
): Promise<SchedulePlacement[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error('Supabase client not available');

  const { start, end } = getDateRange(date);
  const { data, error } = await supabase
    .from('schedule_items')
    .select('id, title, description, start_time, end_time, category')
    .eq('category', AUTO_SCHEDULE_CATEGORY)
    .gte('end_time', start.toISOString())
    .lt('start_time', end.toISOString())
    .order('start_time', { ascending: true });

  if (error) throw error;

  const placements: SchedulePlacement[] = [];
  for (const row of data ?? []) {
    const meta = parseAutoDescription(row.description);
    if (!meta) continue;
    placements.push({
      id: row.id,
      taskId: meta.taskId,
      windowId: meta.windowId ?? null,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      title: row.title ?? '',
    });
  }
  return placements;
}

export async function syncSchedulePlacements(
  date: Date,
  placements: SchedulePlacementInput[],
  existing: SchedulePlacement[] = []
): Promise<SchedulePlacement[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error('Supabase client not available');

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('User not authenticated');

  const currentExisting = existing.length
    ? existing
    : await fetchSchedulePlacements(date);
  const existingByTask = new Map(currentExisting.map(item => [item.taskId, item]));

  const nowIso = new Date().toISOString();
  const seenTasks = new Set<string>();

  const inserts: Array<{
    user_id: string;
    title: string;
    description: string;
    start_time: string;
    end_time: string;
    category: string;
    priority: string;
    updated_at: string;
  }> = [];
  const updates: Array<{
    id: string;
    payload: {
      title: string;
      description: string;
      start_time: string;
      end_time: string;
      category: string;
      priority: string;
      updated_at: string;
    };
  }> = [];

  for (const placement of placements) {
    seenTasks.add(placement.taskId);
    const description = buildAutoDescription(
      placement.taskId,
      placement.windowId
    );
    const startIso = placement.start.toISOString();
    const endIso = placement.end.toISOString();
    const existingItem = existingByTask.get(placement.taskId);
    if (existingItem) {
      updates.push({
        id: existingItem.id,
        payload: {
          title: placement.title,
          description,
          start_time: startIso,
          end_time: endIso,
          category: AUTO_SCHEDULE_CATEGORY,
          priority: 'medium',
          updated_at: nowIso,
        },
      });
    } else {
      inserts.push({
        user_id: user.id,
        title: placement.title,
        description,
        start_time: startIso,
        end_time: endIso,
        category: AUTO_SCHEDULE_CATEGORY,
        priority: 'medium',
        updated_at: nowIso,
      });
    }
  }

  const deleteIds = currentExisting
    .filter(item => !seenTasks.has(item.taskId))
    .map(item => item.id);

  if (inserts.length) {
    const { error } = await supabase.from('schedule_items').insert(inserts);
    if (error) throw error;
  }

  if (updates.length) {
    for (const { id, payload } of updates) {
      const { error } = await supabase
        .from('schedule_items')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
    }
  }

  if (deleteIds.length) {
    const { error } = await supabase
      .from('schedule_items')
      .delete()
      .in('id', deleteIds);
    if (error) throw error;
  }

  return fetchSchedulePlacements(date);
}

