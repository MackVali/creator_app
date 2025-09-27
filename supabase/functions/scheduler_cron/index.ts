import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2?dts'
import type { Database } from '../../../types/supabase.ts'
import {
  addDaysInTimeZone,
  getWeekdayInTimeZone,
  normalizeTimeZone,
  setTimeInTimeZone,
  toZonedDate,
} from '../../../src/lib/scheduler/timezone.ts'

type Client = SupabaseClient<Database>
type ScheduleInstance = Database['public']['Tables']['schedule_instances']['Row']

const GRACE_MIN = 60
const DEFAULT_PROJECT_DURATION_MIN = 60
const ENERGY_ORDER = ['NO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'EXTREME'] as const
const BASE_LOOKAHEAD_DAYS = 28
const LOOKAHEAD_PER_ITEM_DAYS = 7
const MAX_LOOKAHEAD_DAYS = 365

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
    const rawNow = new Date()

    const timeZoneValue = await resolveUserTimeZone(supabase, userId)
    const timeZone = normalizeTimeZone(timeZoneValue)
    const now = toZonedDate(rawNow, timeZone)

    const missedResult = await markMissedAndQueue(supabase, userId, now)
    if (missedResult.error) {
      console.error('markMissedAndQueue error', missedResult.error)
      return new Response(JSON.stringify(missedResult), { status: 500 })
    }

    const scheduleResult = await scheduleBacklog(
      supabase,
      userId,
      now,
      timeZone,
    )
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

async function resolveUserTimeZone(client: Client, userId: string) {
  try {
    const { data, error } = await client.auth.admin.getUserById(userId)
    if (error) {
      console.error('resolveUserTimeZone error', error)
      return null
    }
    const user = data?.user ?? null
    if (!user) return null
    const meta =
      ((user.user_metadata ?? user.raw_user_meta_data) as
        | Record<string, unknown>
        | null
        | undefined) ?? {}
    const candidates = [meta?.timezone, meta?.timeZone, meta?.tz]
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }
  } catch (error) {
    console.error('resolveUserTimeZone failure', error)
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

async function scheduleBacklog(
  client: Client,
  userId: string,
  baseDate: Date,
  timeZoneValue?: string | null,
) {
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

  const timeZone = normalizeTimeZone(timeZoneValue)
  const localNow = toZonedDate(baseDate, timeZone)
  const baseStart = localNow
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

  const rangeEnd = addDaysInTimeZone(baseStart, 28, timeZone)
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

  const queueByProject = new Map(queue.map(item => [item.id, item]))

  for (const project of projectItems) {
    const duration = Number(project.duration_min ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) continue
    const energy = (project.energy ?? 'NO').toString().toUpperCase()
    const weight = project.weight ?? 0
    const existing = queueByProject.get(project.id)
    const reuse = dedupe.keepers.get(project.id)
    if (existing) {
      existing.duration_min = duration
      existing.energy = energy
      existing.weight = weight
      if (!existing.instanceId && reuse) {
        existing.instanceId = reuse.id
      }
    } else {
      const entry = {
        id: project.id,
        sourceType: 'PROJECT' as const,
        duration_min: duration,
        energy,
        weight,
        instanceId: reuse?.id,
      }
      queue.push(entry)
      queueByProject.set(project.id, entry)
    }
  }

  for (const [projectId, inst] of dedupe.keepers) {
    if (queueByProject.has(projectId)) continue
    const duration = Number(inst.duration_min ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) continue
    const energy = (inst.energy_resolved ?? 'NO').toString().toUpperCase()
    const weight =
      typeof inst.weight_snapshot === 'number' ? inst.weight_snapshot : 0
    const fallbackProject = projectMap.get(projectId)
    const entry = {
      id: projectId,
      sourceType: 'PROJECT' as const,
      duration_min: duration,
      energy,
      weight: fallbackProject?.weight ?? weight,
      instanceId: inst.id,
    }
    queue.push(entry)
    queueByProject.set(projectId, entry)
  }

  const instanceIdToProject = new Map<string, string>()
  for (const item of queue) {
    if (item.instanceId) {
      instanceIdToProject.set(item.instanceId, item.id)
    }
  }

  const failedInstanceIds = new Set<string>()
  for (const [instanceId, projectId] of instanceIdToProject) {
    const { error } = await client
      .from('schedule_instances')
      .update({ status: 'canceled' })
      .eq('id', instanceId)

    if (error) {
      failures.push({ itemId: projectId, reason: 'error', detail: error })
      failedInstanceIds.add(instanceId)
    }
  }

  if (failedInstanceIds.size > 0) {
    const filteredQueue = queue.filter(
      item => !item.instanceId || !failedInstanceIds.has(item.instanceId)
    )
    queue.length = 0
    queue.push(...filteredQueue)
  }

  const lookaheadItemCount = queue.length
  const lookaheadDays = Math.min(
    MAX_LOOKAHEAD_DAYS,
    BASE_LOOKAHEAD_DAYS + lookaheadItemCount * LOOKAHEAD_PER_ITEM_DAYS,
  )

  const buckets = new Map<number, QueueItem[]>()
  for (const item of queue) {
    const idx = Math.max(0, energyIndex(item.energy))
    const bucket = buckets.get(idx)
    if (bucket) {
      bucket.push(item)
    } else {
      buckets.set(idx, [item])
    }
  }

  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => {
      const weightDiff = b.weight - a.weight
      if (weightDiff !== 0) return weightDiff
      return a.id.localeCompare(b.id)
    })
  }

  const pending = new Map<string, { item: QueueItem; energyIdx: number }>()
  for (const [energyIdx, bucket] of buckets.entries()) {
    for (const item of bucket) {
      pending.set(item.id, { item, energyIdx })
    }
  }

  const placed: ScheduleInstance[] = []
  const windowAvailabilityByDay = new Map<number, Map<string, Date>>()
  const windowCache = new Map<string, WindowRecord[]>()

  for (let offset = 0; offset < lookaheadDays; offset += 1) {
    if (pending.size === 0) break

    let dayAvailability = windowAvailabilityByDay.get(offset)
    if (!dayAvailability) {
      dayAvailability = new Map<string, Date>()
      windowAvailabilityByDay.set(offset, dayAvailability)
    }

    const day = addDaysInTimeZone(baseStart, offset, timeZone)
    const windowDate = setTimeInTimeZone(day, timeZone, 12, 0)
    const windows = await resolveWindowsForDay({
      availability: dayAvailability,
      cache: windowCache,
      client,
      date: windowDate,
      now: offset === 0 ? localNow : undefined,
      timeZone,
      userId,
    })

    for (const window of windows) {
      if (pending.size === 0) break

      const attempted = new Set<string>()
      let exhausted = false

      while (!exhausted && pending.size > 0) {
        const availableStart = dayAvailability.get(window.key) ?? window.initialAvailableStartLocal
        if (availableStart.getTime() >= window.endLocal.getTime()) {
          exhausted = true
          break
        }

        const candidate = pickCandidateForWindow({
          attempted,
          buckets,
          windowEnergyIdx: window.energyIdx,
        })

        if (!candidate) {
          exhausted = true
          break
        }

        const placedInstance = await placeItemInWindows(
          client,
          userId,
          candidate.item,
          [
            {
              id: window.id,
              key: window.key,
              startLocal: window.startLocal,
              endLocal: window.endLocal,
              availableStartLocal: availableStart,
            },
          ],
          candidate.item.instanceId,
        )

        if (!placedInstance) {
          attempted.add(candidate.item.id)
          if (allCandidatesAttempted(window.energyIdx, buckets, attempted)) {
            exhausted = true
          }
          continue
        }

        removeItemFromBucket(buckets, candidate)
        pending.delete(candidate.item.id)
        placed.push(placedInstance)

        const placementWindow = findPlacementWindow(
          [
            {
              id: window.id,
              key: window.key,
              startLocal: window.startLocal,
              endLocal: window.endLocal,
              availableStartLocal: availableStart,
            },
          ],
          placedInstance,
        )

        if (placementWindow?.key) {
          dayAvailability.set(placementWindow.key, new Date(placedInstance.end_utc))
        }
      }
    }
  }

  for (const pendingItem of pending.values()) {
    failures.push({ itemId: pendingItem.item.id, reason: 'NO_WINDOW' })
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
  keepers: Map<string, ScheduleInstance>
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
    return {
      scheduled: new Set<string>(),
      keepers: new Map<string, ScheduleInstance>(),
      failures: [],
      error: response.error,
    }
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

  return { scheduled, keepers, failures, error: null }
}

async function resolveWindowsForDay(params: {
  availability: Map<string, Date>
  cache?: Map<string, WindowRecord[]>
  client: Client
  date: Date
  now?: Date
  timeZone: string
  userId: string
}) {
  const { availability, cache, client, date, now, timeZone, userId } = params
  const cacheKey = dateCacheKey(date)
  let windows: WindowRecord[]
  if (cache?.has(cacheKey)) {
    windows = cache.get(cacheKey) ?? []
  } else {
    windows = await fetchWindowsForDate(client, userId, date, timeZone)
    cache?.set(cacheKey, windows)
  }

  const nowMs = now?.getTime()

  const resolved: Array<{
    id: string
    key: string
    energyIdx: number
    startLocal: Date
    endLocal: Date
    initialAvailableStartLocal: Date
  }> = []

  for (const window of windows) {
    const energyIdx = Math.max(0, energyIndex(window.energy))
    const startLocal = resolveWindowStart(window, date, timeZone)
    const endLocal = resolveWindowEnd(window, date, timeZone)
    const key = windowKey(window.id, startLocal)
    const startMs = startLocal.getTime()
    const endMs = endLocal.getTime()

    if (typeof nowMs === 'number' && endMs <= nowMs) continue

    const baseAvailableStartMs =
      typeof nowMs === 'number' ? Math.max(startMs, nowMs) : startMs
    const carriedStartMs = availability.get(key)?.getTime()
    const availableStartMs =
      typeof carriedStartMs === 'number'
        ? Math.max(baseAvailableStartMs, carriedStartMs)
        : baseAvailableStartMs

    if (availableStartMs >= endMs) continue

    const existing = availability.get(key)
    if (!existing || existing.getTime() !== availableStartMs) {
      const initial = new Date(availableStartMs)
      availability.set(key, initial)
      resolved.push({
        id: window.id,
        key,
        energyIdx,
        startLocal,
        endLocal,
        initialAvailableStartLocal: initial,
      })
      continue
    }

    resolved.push({
      id: window.id,
      key,
      energyIdx,
      startLocal,
      endLocal,
      initialAvailableStartLocal: existing,
    })
  }

  resolved.sort((a, b) => {
    const startDiff =
      a.initialAvailableStartLocal.getTime() - b.initialAvailableStartLocal.getTime()
    if (startDiff !== 0) return startDiff
    const startLocalDiff = a.startLocal.getTime() - b.startLocal.getTime()
    if (startLocalDiff !== 0) return startLocalDiff
    return a.id.localeCompare(b.id)
  })

  return resolved
}

function pickCandidateForWindow(params: {
  buckets: Map<number, QueueItem[]>
  windowEnergyIdx: number
  attempted: Set<string>
}) {
  const { attempted, buckets, windowEnergyIdx } = params

  for (let idx = windowEnergyIdx; idx >= 0; idx -= 1) {
    const bucket = buckets.get(idx)
    if (!bucket || bucket.length === 0) continue
    for (let position = 0; position < bucket.length; position += 1) {
      const item = bucket[position]
      if (attempted.has(item.id)) continue
      return { bucketIdx: idx, item, position }
    }
  }

  return null
}

function removeItemFromBucket(
  buckets: Map<number, QueueItem[]>,
  candidate: { bucketIdx: number; position: number }
) {
  const bucket = buckets.get(candidate.bucketIdx)
  if (!bucket) return
  bucket.splice(candidate.position, 1)
}

function allCandidatesAttempted(
  windowEnergyIdx: number,
  buckets: Map<number, QueueItem[]>,
  attempted: Set<string>,
) {
  for (let idx = windowEnergyIdx; idx >= 0; idx -= 1) {
    const bucket = buckets.get(idx)
    if (!bucket || bucket.length === 0) continue
    const hasUnattempted = bucket.some(item => !attempted.has(item.id))
    if (hasUnattempted) return false
  }
  return true
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

async function fetchWindowsForDate(
  client: Client,
  userId: string,
  date: Date,
  timeZoneValue: string,
) {
  const timeZone = normalizeTimeZone(timeZoneValue)
  const weekday = getWeekdayInTimeZone(date, timeZone)
  const prevDate = addDaysInTimeZone(date, -1, timeZone)
  const prevWeekday = getWeekdayInTimeZone(prevDate, timeZone)

  const columns = 'id, label, energy, start_local, end_local, days'

  const [
    { data: today, error: errToday },
    { data: prev, error: errPrev },
    { data: recurring, error: errRecurring },
  ] = await Promise.all([
    client
      .from('windows')
      .select(columns)
      .eq('user_id', userId)
      .contains('days', [weekday]),
    client
      .from('windows')
      .select(columns)
      .eq('user_id', userId)
      .contains('days', [prevWeekday]),
    client
      .from('windows')
      .select(columns)
      .eq('user_id', userId)
      .is('days', null),
  ])

  if (errToday) console.error('fetchWindowsForDate error (today)', errToday)
  if (errPrev) console.error('fetchWindowsForDate error (prev)', errPrev)
  if (errRecurring) console.error('fetchWindowsForDate error (recurring)', errRecurring)

  const crosses = (window: WindowRecord) => {
    const [sh = 0, sm = 0] = window.start_local.split(':').map(Number)
    const [eh = 0, em = 0] = window.end_local.split(':').map(Number)
    return eh < sh || (eh === sh && em < sm)
  }

  const always = recurring ?? []

  const base = new Map<string, WindowRecord>()
  for (const window of [...(today ?? []), ...always]) {
    if (!base.has(window.id)) {
      base.set(window.id, window)
    }
  }

  const prevCross = [...(prev ?? []), ...always]
    .filter(crosses)
    .map(window => ({ ...window, fromPrevDay: true as const }))

  return [...base.values(), ...prevCross]
}

async function placeItemInWindows(
  client: Client,
  userId: string,
  item: { id: string; sourceType: 'PROJECT'; duration_min: number; energy: string; weight: number },
  windows: Array<{
    id: string
    startLocal: Date
    endLocal: Date
    availableStartLocal?: Date
    key?: string
  }>,
  reuseInstanceId?: string | null
): Promise<ScheduleInstance | null> {
  for (const window of windows) {
    const start = new Date(window.availableStartLocal ?? window.startLocal)
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

    const filtered = (taken ?? []).filter(instance => instance.id !== reuseInstanceId)

    const sorted = filtered.sort(
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

function findPlacementWindow(
  windows: Array<{
    id: string
    startLocal: Date
    endLocal: Date
    key?: string
  }>,
  placement: ScheduleInstance
) {
  if (!placement.window_id) return null
  const start = new Date(placement.start_utc)
  const match = windows.find(
    window => window.id === placement.window_id && isWithinWindow(start, window)
  )
  if (match) return match
  return windows.find(window => window.id === placement.window_id) ?? null
}

function isWithinWindow(
  start: Date,
  window: { startLocal: Date; endLocal: Date }
) {
  return start >= window.startLocal && start < window.endLocal
}

function windowKey(windowId: string, startLocal: Date) {
  return `${windowId}:${startLocal.toISOString()}`
}

function dateCacheKey(date: Date) {
  return date.toISOString()
}

function resolveWindowStart(window: WindowRecord, date: Date, timeZone: string) {
  const [hour = 0, minute = 0] = window.start_local.split(':').map(Number)
  const base = window.fromPrevDay
    ? addDaysInTimeZone(date, -1, timeZone)
    : date
  return setTimeInTimeZone(base, timeZone, hour, minute)
}

function resolveWindowEnd(window: WindowRecord, date: Date, timeZone: string) {
  const [hour = 0, minute = 0] = window.end_local.split(':').map(Number)
  let end = setTimeInTimeZone(date, timeZone, hour, minute)
  const start = resolveWindowStart(window, date, timeZone)
  if (end <= start) {
    const nextDay = addDaysInTimeZone(date, 1, timeZone)
    end = setTimeInTimeZone(nextDay, timeZone, hour, minute)
  }
  return end
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
