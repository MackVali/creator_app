import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2?dts'
import type { Database } from '../../../types/supabase.ts'

type Client = SupabaseClient<Database>
type ScheduleInstance = Database['public']['Tables']['schedule_instances']['Row']

const GRACE_MIN = 60
const ENERGY_ORDER = ['NO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'EXTREME'] as const

serve(async req => {
  try {
    const userId = await resolveUserId(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'missing userId' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    const supabaseUrl =
      Deno.env.get('DENO_ENV_SUPABASE_URL') ??
      Deno.env.get('SUPABASE_URL') ??
      ''
    const supabaseKey =
      Deno.env.get('DENO_ENV_SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('DENO_ENV_SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      ''

    if (!supabaseUrl || !supabaseKey) {
      return new Response('missing supabase credentials', { status: 500 })
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey)
    const now = new Date()

    const missedResult = await markMissedAndQueue(supabase, userId, now)
    if (missedResult.error) {
      console.error('markMissedAndQueue error', missedResult.error)
      return new Response(JSON.stringify(missedResult), { status: 500 })
    }

    const scheduleResult = await scheduleBacklog(supabase, userId, now)
    if (scheduleResult.error) {
      console.error('scheduleBacklog error', scheduleResult.error)
      return new Response(JSON.stringify(scheduleResult), { status: 500 })
    }

    return new Response(JSON.stringify(scheduleResult), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    console.error('scheduler_cron failure', error)
    return new Response('internal error', { status: 500 })
  }
})

async function resolveUserId(req: Request) {
  const { searchParams } = new URL(req.url)
  const fromQuery = searchParams.get('userId')
  if (fromQuery) return fromQuery

  if (req.method !== 'GET') {
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      try {
        const body = await req.json()
        const candidate =
          typeof body === 'object' && body && 'userId' in body
            ? (body as { userId?: string }).userId
            : null
        if (candidate && typeof candidate === 'string' && candidate.trim()) {
          return candidate
        }
      } catch (error) {
        console.warn('failed to parse request body for userId', error)
      }
    }
  }

  return null
}

async function markMissedAndQueue(client: Client, userId: string, now: Date) {
  const cutoff = new Date(now.getTime() - GRACE_MIN * 60_000).toISOString()
  return await client
    .from('schedule_instances')
    .update({ status: 'missed' })
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .lt('end_utc', cutoff)
}

async function scheduleBacklog(client: Client, userId: string, baseDate: Date) {
  const missed = await fetchMissedInstances(client, userId)
  if (missed.error) return { placed: [], failures: [], error: missed.error }

  const tasks = await fetchReadyTasks(client, userId)
  const projects = await fetchProjectsMap(client, userId)
  const projectItems = buildProjectItems(Object.values(projects), tasks)

  const taskMap = new Map(tasks.map(task => [task.id, task]))
  const projectMap = new Map(projectItems.map(project => [project.id, project]))

  type QueueItem = {
    id: string
    sourceType: 'PROJECT'
    duration_min: number
    energy: string
    weight: number
  }

  const queue: QueueItem[] = []
  const enqueuedProjects = new Set<string>()
  const pushProject = (
    projectId: string,
    fallback?: {
      duration?: number | null
      energy?: string | null
      weight?: number | null
    }
  ) => {
    if (!projectId || enqueuedProjects.has(projectId)) return
    const project = projectMap.get(projectId)
    const duration = Number(
      project?.duration_min ?? fallback?.duration ?? 0
    )
    if (!Number.isFinite(duration) || duration <= 0) return
    const energy = (
      project?.energy ?? fallback?.energy ?? 'NO'
    )
      .toString()
      .toUpperCase()
    const weight =
      project?.weight ??
      (typeof fallback?.weight === 'number' ? fallback.weight : 0)

    queue.push({
      id: projectId,
      sourceType: 'PROJECT',
      duration_min: duration,
      energy,
      weight,
    })
    enqueuedProjects.add(projectId)
  }

  for (const instance of missed.data ?? []) {
    if (instance.source_type === 'PROJECT') {
      const weight =
        typeof instance.weight_snapshot === 'number'
          ? instance.weight_snapshot
          : undefined
      pushProject(instance.source_id, {
        duration: instance.duration_min,
        energy: instance.energy_resolved,
        weight,
      })
      continue
    }

    if (instance.source_type === 'TASK') {
      const task = taskMap.get(instance.source_id)
      const projectId = task?.project_id ?? null
      if (!projectId) continue
      pushProject(projectId, {
        duration:
          projectMap.get(projectId)?.duration_min ?? task?.duration_min ?? undefined,
        energy: projectMap.get(projectId)?.energy ?? task?.energy ?? undefined,
        weight:
          projectMap.get(projectId)?.weight ??
          (task ? taskWeight(task) : undefined),
      })
    }
  }

  queue.sort((a, b) => b.weight - a.weight)

  const baseStart = startOfDay(baseDate)
  const placed: ScheduleInstance[] = []
  const failures: { itemId: string; reason: string; detail?: unknown }[] = []

  for (const item of queue) {
    let scheduled = false
    for (let offset = 0; offset < 28 && !scheduled; offset += 1) {
      const day = addDays(baseStart, offset)
      const windows = await fetchCompatibleWindowsForItem(client, userId, day, item)
      if (windows.length === 0) continue

      const placedInstance = await placeItemInWindows(client, userId, item, windows)
      if (placedInstance) {
        placed.push(placedInstance)
        scheduled = true
      }
    }

    if (!scheduled) {
      failures.push({ itemId: item.id, reason: 'NO_WINDOW' })
    }
  }

  return { placed, failures, error: null as const }
}

async function fetchMissedInstances(client: Client, userId: string) {
  return await client
    .from('schedule_instances')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'missed')
    .order('weight_snapshot', { ascending: false })
}

type TaskLite = {
  id: string
  name: string
  priority: string
  stage: string
  duration_min: number
  energy: string | null
  project_id?: string | null
  skill_icon?: string | null
}

type ProjectLite = {
  id: string
  name?: string
  priority: string
  stage: string
  energy?: string | null
}

type ProjectItem = ProjectLite & {
  name: string
  duration_min: number
  energy: string
  weight: number
  taskCount: number
  skill_icon?: string | null
}

async function fetchReadyTasks(client: Client, userId: string): Promise<TaskLite[]> {
  const { data, error } = await client
    .from('tasks')
    .select('id, name, priority, stage, duration_min, energy, project_id, skills(icon)')
    .eq('user_id', userId)

  if (error) {
    console.error('fetchReadyTasks error', error)
    return []
  }

  return (data ?? []).map(task => ({
    id: task.id,
    name: task.name ?? '',
    priority: task.priority ?? 'NO',
    stage: task.stage ?? 'PREPARE',
    duration_min: task.duration_min ?? 0,
    energy: task.energy ?? 'NO',
    project_id: task.project_id ?? null,
    skill_icon: ((task.skills as { icon?: string | null } | null)?.icon ?? null) as
      | string
      | null,
  }))
}

async function fetchProjectsMap(client: Client, userId: string): Promise<Record<string, ProjectLite>> {
  const { data, error } = await client
    .from('projects')
    .select('id, name, priority, stage, energy')
    .eq('user_id', userId)

  if (error) {
    console.error('fetchProjectsMap error', error)
    return {}
  }

  const map: Record<string, ProjectLite> = {}
  for (const project of data ?? []) {
    map[project.id] = {
      id: project.id,
      name: project.name ?? '',
      priority: project.priority ?? 'NO',
      stage: project.stage ?? 'RESEARCH',
      energy: project.energy ?? 'NO',
    }
  }
  return map
}

function buildProjectItems(projects: ProjectLite[], tasks: TaskLite[]): ProjectItem[] {
  const items: ProjectItem[] = []
  for (const project of projects) {
    const related = tasks.filter(task => task.project_id === project.id)
    const duration = related.reduce((sum, task) => sum + task.duration_min, 0) || 60

    const normalizeEnergy = (value?: string | null) => {
      const upper = (value ?? '').toUpperCase()
      return ENERGY_ORDER.includes(upper as (typeof ENERGY_ORDER)[number])
        ? (upper as string)
        : 'NO'
    }

    const energy = related.reduce<string>((current, task) => {
      const candidate = normalizeEnergy(task.energy)
      if (!current) return candidate
      return energyIndex(candidate) > energyIndex(current) ? candidate : current
    }, normalizeEnergy(project.energy))

    const weight = projectWeight(project, related.reduce((sum, task) => sum + taskWeight(task), 0))

    const skill_icon = related.find(task => task.skill_icon)?.skill_icon ?? null

    items.push({
      ...project,
      name: project.name ?? '',
      duration_min: duration,
      energy,
      weight,
      taskCount: related.length,
      skill_icon,
    })
  }
  return items
}

async function fetchCompatibleWindowsForItem(
  client: Client,
  userId: string,
  date: Date,
  item: { energy: string; duration_min: number }
) {
  const windows = await fetchWindowsForDate(client, userId, date)
  const itemIdx = energyIndex(item.energy)
  const compatible = windows.filter(window => energyIndex(window.energy) >= itemIdx)
  return compatible.map(window => ({
    id: window.id,
    startLocal: resolveWindowStart(window, date),
    endLocal: resolveWindowEnd(window, date),
  }))
}

type WindowRecord = {
  id: string
  label: string
  energy: string
  start_local: string
  end_local: string
  days: number[] | null
  fromPrevDay?: boolean
}

async function fetchWindowsForDate(client: Client, userId: string, date: Date) {
  const weekday = date.getDay()
  const prevWeekday = (weekday + 6) % 7

  const [{ data: today, error: errToday }, { data: prev, error: errPrev }] = await Promise.all([
    client
      .from('windows')
      .select('id, label, energy, start_local, end_local, days')
      .eq('user_id', userId)
      .contains('days', [weekday]),
    client
      .from('windows')
      .select('id, label, energy, start_local, end_local, days')
      .eq('user_id', userId)
      .contains('days', [prevWeekday]),
  ])

  if (errToday) console.error('fetchWindowsForDate error (today)', errToday)
  if (errPrev) console.error('fetchWindowsForDate error (prev)', errPrev)

  const crosses = (window: WindowRecord) => {
    const [sh = 0, sm = 0] = window.start_local.split(':').map(Number)
    const [eh = 0, em = 0] = window.end_local.split(':').map(Number)
    return eh < sh || (eh === sh && em < sm)
  }

  const prevCross = (prev ?? [])
    .filter(crosses)
    .map(window => ({ ...window, fromPrevDay: true as const }))

  return [...(today ?? []), ...prevCross]
}

async function placeItemInWindows(
  client: Client,
  userId: string,
  item: { id: string; sourceType: 'PROJECT' | 'TASK'; duration_min: number; energy: string; weight: number },
  windows: Array<{ id: string; startLocal: Date; endLocal: Date }>
): Promise<ScheduleInstance | null> {
  for (const window of windows) {
    const start = new Date(window.startLocal)
    const end = new Date(window.endLocal)

    const { data: taken, error } = await client
      .from('schedule_instances')
      .select('*')
      .eq('user_id', userId)
      .lt('start_utc', end.toISOString())
      .gt('end_utc', start.toISOString())
      .neq('status', 'canceled')

    if (error) {
      console.error('fetchInstancesForRange error', error)
      continue
    }

    const sorted = (taken ?? []).sort(
      (a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    )

    let cursor = start
    const durMin = item.duration_min

    for (const block of sorted) {
      const blockStart = new Date(block.start_utc)
      const blockEnd = new Date(block.end_utc)
      if (diffMin(cursor, blockStart) >= durMin) {
        return await createInstance(client, userId, item, window.id, cursor, durMin)
      }
      if (blockEnd > cursor) cursor = blockEnd
    }

    if (diffMin(cursor, end) >= durMin) {
      return await createInstance(client, userId, item, window.id, cursor, durMin)
    }
  }

  return null
}

async function createInstance(
  client: Client,
  userId: string,
  item: { id: string; sourceType: 'PROJECT' | 'TASK'; duration_min: number; energy: string; weight: number },
  windowId: string,
  start: Date,
  durationMin: number
) {
  const startUTC = start.toISOString()
  const endUTC = addMin(start, durationMin).toISOString()

  const { data, error } = await client
    .from('schedule_instances')
    .insert({
      user_id: userId,
      source_type: item.sourceType,
      source_id: item.id,
      window_id: windowId,
      start_utc: startUTC,
      end_utc: endUTC,
      duration_min: durationMin,
      status: 'scheduled',
      weight_snapshot: item.weight,
      energy_resolved: item.energy,
    })
    .select('*')
    .single()

  if (error) {
    console.error('createInstance error', error)
    return null
  }

  return data
}

function resolveWindowStart(window: WindowRecord, date: Date) {
  const [hour = 0, minute = 0] = window.start_local.split(':').map(Number)
  const base = startOfDay(date)
  if (window.fromPrevDay) base.setDate(base.getDate() - 1)
  const start = new Date(base)
  start.setHours(hour, minute, 0, 0)
  return start
}

function resolveWindowEnd(window: WindowRecord, date: Date) {
  const [hour = 0, minute = 0] = window.end_local.split(':').map(Number)
  const end = startOfDay(date)
  end.setHours(hour, minute, 0, 0)
  const start = resolveWindowStart(window, date)
  if (end <= start) {
    end.setDate(end.getDate() + 1)
  }
  return end
}

function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

function addMin(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000)
}

function diffMin(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 60_000)
}

function energyIndex(level?: string | null) {
  if (!level) return -1
  const upper = level.toUpperCase()
  return ENERGY_ORDER.indexOf(upper as (typeof ENERGY_ORDER)[number])
}

const TASK_PRIORITY_WEIGHT: Record<string, number> = {
  NO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  Critical: 4,
  'Ultra-Critical': 5,
}

const TASK_STAGE_WEIGHT: Record<string, number> = {
  Prepare: 30,
  Produce: 20,
  Perfect: 10,
}

const PROJECT_PRIORITY_WEIGHT: Record<string, number> = {
  NO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  Critical: 4,
  'Ultra-Critical': 5,
}

const PROJECT_STAGE_WEIGHT: Record<string, number> = {
  RESEARCH: 50,
  TEST: 40,
  BUILD: 30,
  REFINE: 20,
  RELEASE: 10,
}

function taskWeight(task: TaskLite) {
  const priority = TASK_PRIORITY_WEIGHT[task.priority] ?? 0
  const stage = TASK_STAGE_WEIGHT[task.stage] ?? 0
  return priority + stage
}

function projectWeight(project: ProjectLite, relatedTaskWeightsSum: number) {
  const priority = PROJECT_PRIORITY_WEIGHT[project.priority] ?? 0
  const stage = PROJECT_STAGE_WEIGHT[project.stage] ?? 0
  return relatedTaskWeightsSum / 1000 + priority + stage
}
