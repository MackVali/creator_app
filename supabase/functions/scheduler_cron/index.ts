import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2?dts'
import type { Database } from '../../../types/supabase.ts'

type Client = SupabaseClient<Database>
type ScheduleInstance = Database['public']['Tables']['schedule_instances']['Row']

const GRACE_MIN = 60
const DEFAULT_PROJECT_DURATION_MIN = 60
const ENERGY_ORDER = ['NO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'EXTREME'] as const

serve(async req => {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) {
      return new Response('missing userId', { status: 400 })
    }

    const supabaseUrl =
      Deno.env.get('DENO_ENV_SUPABASE_URL') ??
      Deno.env.get('SUPABASE_URL') ??
      ''
    const serviceRoleKey =
      Deno.env.get('DENO_ENV_SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response('missing supabase credentials', { status: 500 })
    }

    const supabase = createClient<Database>(supabaseUrl, serviceRoleKey)
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

  const projectMap = new Map(projectItems.map(project => [project.id, project]))

  type QueueItem = {
    id: string
    sourceType: 'PROJECT'
    duration_min: number
    energy: string
    weight: number
    instanceId?: string | null
  }

  const baseStart = startOfDay(baseDate)
  const queue: QueueItem[] = []
  const failures: { itemId: string; reason: string; detail?: unknown }[] = []
  const seenMissedProjects = new Set<string>()
  const queueProjectIds = new Set<string>()

  for (const instance of missed.data ?? []) {
    if (instance.source_type !== 'PROJECT') continue
    if (seenMissedProjects.has(instance.source_id)) {
      const cancel = await client
        .from('schedule_instances')
        .update({ status: 'canceled' })
        .eq('id', instance.id)

      if (cancel.error) {
        failures.push({
          itemId: instance.source_id,
          reason: 'error',
          detail: cancel.error,
        })
      }

      continue
    }

    seenMissedProjects.add(instance.source_id)
    const def = projectMap.get(instance.source_id)
    if (!def) continue
    queueProjectIds.add(def.id)

    let duration = Number(def.duration_min ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) {
      const fallback = Number(instance.duration_min ?? 0)
      if (Number.isFinite(fallback) && fallback > 0) {
        duration = fallback
      } else {
        duration = DEFAULT_PROJECT_DURATION_MIN
      }
    }

    const resolvedEnergy = def.energy ? String(def.energy) : instance.energy_resolved ?? 'NO'

    const weight =
      typeof instance.weight_snapshot === 'number'
        ? instance.weight_snapshot
        : def.weight ?? 0

    queue.push({
      id: def.id,
      sourceType: 'PROJECT',
      duration_min: duration,
      energy: (resolvedEnergy ?? 'NO').toUpperCase(),
      weight,
      instanceId: instance.id,
    })
  }

  const rangeEnd = addDays(baseStart, 28)
  const dedupe = await dedupeScheduledProjects(
    client,
    userId,
    baseStart,
    rangeEnd,
    queueProjectIds
  )

  if (dedupe.error) {
    return { placed: [], failures, error: dedupe.error }
  }

  if (dedupe.failures.length > 0) {
    failures.push(...dedupe.failures)
  }

  const scheduled = dedupe.scheduled

  if (queue.length === 0) {
    for (const project of projectItems) {
      const duration = Number(project.duration_min ?? 0)
      if (!Number.isFinite(duration) || duration <= 0) continue
      if (scheduled.has(project.id)) continue
      const energy = (project.energy ?? 'NO').toString().toUpperCase()
      queue.push({
        id: project.id,
        sourceType: 'PROJECT',
        duration_min: duration,
        energy,
        weight: project.weight ?? 0,
      })
    }
  }

  queue.sort((a, b) => {
    const weightDiff = b.weight - a.weight
    if (weightDiff !== 0) return weightDiff
    const energyDiff = energyIndex(b.energy) - energyIndex(a.energy)
    if (energyDiff !== 0) return energyDiff
    return a.id.localeCompare(b.id)
  })

  const placed: ScheduleInstance[] = []

  for (const item of queue) {
    let scheduled = false
    for (let offset = 0; offset < 28 && !scheduled; offset += 1) {
      const day = addDays(baseStart, offset)
      const windows = await fetchCompatibleWindowsForItem(client, userId, day, item)
      if (windows.length === 0) continue

      const placedInstance = await placeItemInWindows(
        client,
        userId,
        item,
        windows,
        item.instanceId
      )
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
  duration_min?: number | null
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
    .select('id, name, priority, stage, energy, duration_min')
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
      duration_min: project.duration_min ?? null,
    }
  }
  return map
}

function buildProjectItems(projects: ProjectLite[], tasks: TaskLite[]): ProjectItem[] {
  const items: ProjectItem[] = []
  for (const project of projects) {
    const related = tasks.filter(task => task.project_id === project.id)
    const projectDuration = Number(project.duration_min ?? 0)
    let duration = Number.isFinite(projectDuration) && projectDuration > 0
      ? projectDuration
      : 0

    if (!duration && related.length > 0) {
      const relatedDuration = related.reduce((sum, task) => sum + task.duration_min, 0)
      if (relatedDuration > 0) {
        duration = relatedDuration
      }
    }

    if (!duration) {
      duration = DEFAULT_PROJECT_DURATION_MIN
    }

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

async function fetchInstancesForRange(
  client: Client,
  userId: string,
  startUTC: string,
  endUTC: string
) {
  return await client
    .from('schedule_instances')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'canceled')
    .or(
      `and(start_utc.gte.${startUTC},start_utc.lt.${endUTC}),and(start_utc.lt.${startUTC},end_utc.gt.${startUTC})`
    )
    .order('start_utc', { ascending: true })
}

async function dedupeScheduledProjects(
  client: Client,
  userId: string,
  baseStart: Date,
  rangeEnd: Date,
  projectsToReset: Set<string>
): Promise<{
  scheduled: Set<string>
  failures: { itemId: string; reason: string; detail?: unknown }[]
  error: PostgrestError | null
}> {
  const response = await fetchInstancesForRange(
    client,
    userId,
    baseStart.toISOString(),
    rangeEnd.toISOString()
  )

  if (response.error) {
    return { scheduled: new Set<string>(), failures: [], error: response.error }
  }

  const keepers = new Map<string, ScheduleInstance>()
  const extras: ScheduleInstance[] = []

  for (const inst of response.data ?? []) {
    if (inst.source_type !== 'PROJECT') continue

    if (projectsToReset.has(inst.source_id) && inst.status === 'scheduled') {
      extras.push(inst)
      continue
    }

    if (inst.status !== 'scheduled') continue

    const existing = keepers.get(inst.source_id)
    if (!existing) {
      keepers.set(inst.source_id, inst)
      continue
    }

    const existingStart = new Date(existing.start_utc).getTime()
    const instStart = new Date(inst.start_utc).getTime()

    if (instStart < existingStart) {
      extras.push(existing)
      keepers.set(inst.source_id, inst)
    } else {
      extras.push(inst)
    }
  }

  const failures: { itemId: string; reason: string; detail?: unknown }[] = []

  for (const extra of extras) {
    const { error } = await client
      .from('schedule_instances')
      .update({ status: 'canceled' })
      .eq('id', extra.id)

    if (error) {
      failures.push({ itemId: extra.source_id, reason: 'error', detail: error })
    }
  }

  const scheduled = new Set<string>()
  for (const key of keepers.keys()) {
    scheduled.add(key)
  }

  return { scheduled, failures, error: null }
}

async function fetchCompatibleWindowsForItem(
  client: Client,
  userId: string,
  date: Date,
  item: { energy: string; duration_min: number }
) {
  const windows = await fetchWindowsForDate(client, userId, date)
  const itemIdx = energyIndex(item.energy)
  const compatible = windows
    .map(window => {
      const energyIdx = energyIndex(window.energy)
      return {
        id: window.id,
        startLocal: resolveWindowStart(window, date),
        endLocal: resolveWindowEnd(window, date),
        energyIdx,
      }
    })
    .filter(window => window.energyIdx >= itemIdx)

  compatible.sort((a, b) => {
    const aDiff = a.energyIdx - itemIdx
    const bDiff = b.energyIdx - itemIdx
    if (aDiff !== bDiff) return aDiff - bDiff
    const startDiff = a.startLocal.getTime() - b.startLocal.getTime()
    if (startDiff !== 0) return startDiff
    return a.id.localeCompare(b.id)
  })

  return compatible.map(window => ({
    id: window.id,
    startLocal: window.startLocal,
    endLocal: window.endLocal,
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
  item: { id: string; sourceType: 'PROJECT'; duration_min: number; energy: string; weight: number },
  windows: Array<{ id: string; startLocal: Date; endLocal: Date }>,
  reuseInstanceId?: string | null
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
        return await persistPlacement(
          client,
          userId,
          item,
          window.id,
          cursor,
          durMin,
          reuseInstanceId
        )
      }
      if (blockEnd > cursor) cursor = blockEnd
    }

    if (diffMin(cursor, end) >= durMin) {
      return await persistPlacement(
        client,
        userId,
        item,
        window.id,
        cursor,
        durMin,
        reuseInstanceId
      )
    }
  }

  return null
}

async function persistPlacement(
  client: Client,
  userId: string,
  item: { id: string; sourceType: 'PROJECT'; duration_min: number; energy: string; weight: number },
  windowId: string,
  start: Date,
  durationMin: number,
  reuseInstanceId?: string | null
): Promise<ScheduleInstance | null> {
  const startUTC = start.toISOString()
  const endUTC = addMin(start, durationMin).toISOString()

  if (reuseInstanceId) {
    return await rescheduleInstance(client, reuseInstanceId, {
      windowId,
      startUTC,
      endUTC,
      durationMin,
      weightSnapshot: item.weight,
      energyResolved: item.energy,
    })
  }

  return await createInstance(client, userId, item, windowId, startUTC, endUTC, durationMin)
}

async function createInstance(
  client: Client,
  userId: string,
  item: { id: string; sourceType: 'PROJECT'; duration_min: number; energy: string; weight: number },
  windowId: string,
  startUTC: string,
  endUTC: string,
  durationMin: number
) {
  const { data, error } = await client
    .from('schedule_instances')
    .insert({
      user_id: userId,
      source_type: 'PROJECT',
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

async function rescheduleInstance(
  client: Client,
  id: string,
  input: {
    windowId: string
    startUTC: string
    endUTC: string
    durationMin: number
    weightSnapshot: number
    energyResolved: string
  }
): Promise<ScheduleInstance | null> {
  const { data, error } = await client
    .from('schedule_instances')
    .update({
      window_id: input.windowId,
      start_utc: input.startUTC,
      end_utc: input.endUTC,
      duration_min: input.durationMin,
      status: 'scheduled',
      weight_snapshot: input.weightSnapshot,
      energy_resolved: input.energyResolved,
      completed_at: null,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('rescheduleInstance error', error)
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
