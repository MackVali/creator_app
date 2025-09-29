import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type { Database } from '../../../types/supabase'
import {
  fetchBacklogNeedingSchedule,
  fetchInstancesForRange,
  type ScheduleInstance,
} from './instanceRepo'
import { buildProjectItems, DEFAULT_PROJECT_DURATION_MIN } from './projects'
import {
  fetchReadyTasks,
  fetchWindowsForDate,
  fetchProjectsMap,
  type WindowLite,
} from './repo'
import { placeItemInWindows } from './placement'
import { ENERGY } from './config'
import {
  addDaysInTimeZone,
  differenceInCalendarDaysInTimeZone,
  normalizeTimeZone,
  setTimeInTimeZone,
  startOfDayInTimeZone,
} from './timezone'

type Client = SupabaseClient<Database>

const START_GRACE_MIN = 1
const BASE_LOOKAHEAD_DAYS = 28
const LOOKAHEAD_PER_ITEM_DAYS = 7
const MAX_LOOKAHEAD_DAYS = 365

type ScheduleFailure = {
  itemId: string
  reason: string
  detail?: unknown
}

type ScheduleDraftPlacement = {
  instance: ScheduleInstance
  projectId: string
  decision: 'kept' | 'new' | 'rescheduled'
  scheduledDayOffset?: number
  availableStartLocal?: string | null
  windowStartLocal?: string | null
}

type ScheduleBacklogResult = {
  placed: ScheduleInstance[]
  failures: ScheduleFailure[]
  error?: PostgrestError | null
  timeline: ScheduleDraftPlacement[]
}

async function ensureClient(client?: Client): Promise<Client> {
  if (client) return client

  if (typeof window === 'undefined') {
    const supabase = await createServerClient()
    if (!supabase) {
      throw new Error('Supabase server client not available')
    }
    return supabase as Client
  }

  throw new Error('Supabase client not available')
}

export async function markMissedAndQueue(
  userId: string,
  now = new Date(),
  client?: Client
) {
  const supabase = await ensureClient(client)
  const cutoff = new Date(now.getTime() - START_GRACE_MIN * 60000).toISOString()
  return await supabase
    .from('schedule_instances')
    .update({ status: 'missed' })
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .lt('start_utc', cutoff)
}

export async function scheduleBacklog(
  userId: string,
  baseDate = new Date(),
  client?: Client,
  options?: { timeZone?: string | null }
): Promise<ScheduleBacklogResult> {
  const supabase = await ensureClient(client)
  const result: ScheduleBacklogResult = { placed: [], failures: [], timeline: [] }
  const timeZone = normalizeTimeZone(options?.timeZone)

  const missed = await fetchBacklogNeedingSchedule(userId, supabase)
  if (missed.error) {
    result.error = missed.error
    return result
  }

  const tasks = await fetchReadyTasks(supabase)
  const projectsMap = await fetchProjectsMap(supabase)
  const projectItems = buildProjectItems(Object.values(projectsMap), tasks)

  const projectItemMap: Record<string, (typeof projectItems)[number]> = {}
  for (const item of projectItems) projectItemMap[item.id] = item

  type QueueItem = {
    id: string
    sourceType: 'PROJECT'
    duration_min: number
    energy: string
    weight: number
    instanceId?: string | null
  }

  const queue: QueueItem[] = []
  const baseStart = startOfDayInTimeZone(baseDate, timeZone)
  const dayOffsetFor = (startUTC: string): number | undefined => {
    const start = new Date(startUTC)
    if (Number.isNaN(start.getTime())) return undefined
    const diff = differenceInCalendarDaysInTimeZone(baseStart, start, timeZone)
    return Number.isFinite(diff) ? diff : undefined
  }

  const seenMissedProjects = new Set<string>()

  for (const m of missed.data ?? []) {
    if (m.source_type !== 'PROJECT') continue
    if (seenMissedProjects.has(m.source_id)) {
      const dedupe = await supabase
        .from('schedule_instances')
        .update({ status: 'canceled' })
        .eq('id', m.id)
        .select('id, source_id')
        .single()
      if (dedupe.error) {
        result.failures.push({ itemId: m.source_id, reason: 'error', detail: dedupe.error })
      }
      continue
    }
    seenMissedProjects.add(m.source_id)
    const def = projectItemMap[m.source_id]
    if (!def) continue

    let duration = Number(def.duration_min ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) {
      const fallback = Number(m.duration_min ?? 0)
      if (Number.isFinite(fallback) && fallback > 0) {
        duration = fallback
      } else {
        duration = DEFAULT_PROJECT_DURATION_MIN
      }
    }

    const resolvedEnergy =
      ('energy' in def && def.energy)
        ? String(def.energy)
        : m.energy_resolved
    const weight =
      typeof m.weight_snapshot === 'number'
        ? m.weight_snapshot
        : (def as { weight?: number }).weight ?? 0

    queue.push({
      id: def.id,
      sourceType: 'PROJECT',
      duration_min: duration,
      energy: (resolvedEnergy ?? 'NO').toUpperCase(),
      weight,
      instanceId: m.id,
    })
  }

  const reuseInstanceByProject = new Map<string, string>()

  const registerReuseInstance = (projectId: string, reuseId?: string | null) => {
    if (!reuseId) return
    if (reuseInstanceByProject.has(projectId)) return
    reuseInstanceByProject.set(projectId, reuseId)
  }

  const collectReuseIds = (source: Map<string, string[]>) => {
    for (const [projectId, ids] of source) {
      const reuseId = ids.find(Boolean)
      registerReuseInstance(projectId, reuseId)
    }
  }

  const collectPrimaryReuseIds = (source: Map<string, string>) => {
    for (const [projectId, reuseId] of source) {
      registerReuseInstance(projectId, reuseId)
    }
  }

  const queuedProjectIds = new Set(queue.map(item => item.id))

  const enqueue = (
    def:
      | {
          id: string
          duration_min: number
          energy: string | null | undefined
          weight: number
        }
      | null
  ) => {
    if (!def) return
    const duration = Number(def.duration_min ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) return
    if (queuedProjectIds.has(def.id)) return
    const energy = (def.energy ?? 'NO').toString().toUpperCase()
    queue.push({
      id: def.id,
      sourceType: 'PROJECT',
      duration_min: duration,
      energy,
      weight: def.weight ?? 0,
    })
    queuedProjectIds.add(def.id)
  }

  for (const project of projectItems) {
    enqueue(project)
  }

  const finalQueueProjectIds = new Set(queuedProjectIds)
  const rangeEnd = addDaysInTimeZone(baseStart, 28, timeZone)
  const dedupe = await dedupeScheduledProjects(
    supabase,
    userId,
    baseStart,
    rangeEnd,
    finalQueueProjectIds
  )
  if (dedupe.error) {
    result.error = dedupe.error
    return result
  }
  if (dedupe.failures.length > 0) {
    result.failures.push(...dedupe.failures)
  }
  collectPrimaryReuseIds(dedupe.reusableByProject)
  collectReuseIds(dedupe.canceledByProject)
  const keptInstances = [...dedupe.keepers]

  for (const inst of keptInstances) {
    const projectId = inst.source_id ?? ''
    if (!projectId) continue
    result.timeline.push({
      instance: inst,
      projectId,
      decision: 'kept',
      scheduledDayOffset: dayOffsetFor(inst.start_utc) ?? undefined,
    })
  }

  for (const item of queue) {
    if (item.instanceId) continue
    const reuseId = reuseInstanceByProject.get(item.id)
    if (!reuseId) continue
    item.instanceId = reuseId
    reuseInstanceByProject.delete(item.id)
  }

  const ignoreProjectIds = new Set(finalQueueProjectIds)

  queue.sort((a, b) => {
    const energyDiff = energyIndex(b.energy) - energyIndex(a.energy)
    if (energyDiff !== 0) return energyDiff
    const weightDiff = b.weight - a.weight
    if (weightDiff !== 0) return weightDiff
    return a.id.localeCompare(b.id)
  })

  const windowAvailabilityByDay = new Map<number, Map<string, Date>>()
  const windowCache = new Map<string, WindowLite[]>()
  const lookaheadDays = Math.min(
    MAX_LOOKAHEAD_DAYS,
    BASE_LOOKAHEAD_DAYS + queue.length * LOOKAHEAD_PER_ITEM_DAYS,
  )

  for (const item of queue) {
    let scheduled = false
    for (let offset = 0; offset < lookaheadDays && !scheduled; offset += 1) {
      let windowAvailability = windowAvailabilityByDay.get(offset)
      if (!windowAvailability) {
        windowAvailability = new Map<string, Date>()
        windowAvailabilityByDay.set(offset, windowAvailability)
      }
      const day = addDaysInTimeZone(baseStart, offset, timeZone)
      const windows = await fetchCompatibleWindowsForItem(
        supabase,
        day,
        item,
        timeZone,
        {
          availability: windowAvailability,
          now: offset === 0 ? baseDate : undefined,
          cache: windowCache,
        }
      )
      if (windows.length === 0) continue

      const placed = await placeItemInWindows({
        userId,
        item,
        windows,
        date: day,
        client: supabase,
        reuseInstanceId: item.instanceId,
        ignoreProjectIds,
        notBefore: offset === 0 ? baseDate : undefined,
      })

      if (!('status' in placed)) {
        if (placed.error !== 'NO_FIT') {
          result.failures.push({ itemId: item.id, reason: 'error', detail: placed.error })
        }
        continue
      }

      if (placed.error) {
        result.failures.push({ itemId: item.id, reason: 'error', detail: placed.error })
        continue
      }

      if (placed.data) {
        result.placed.push(placed.data)
        const placementWindow = findPlacementWindow(
          windows,
          placed.data
        )
        if (placementWindow?.key) {
          windowAvailability.set(
            placementWindow.key,
            new Date(placed.data.end_utc)
          )
        }
        const decision: ScheduleDraftPlacement['decision'] = item.instanceId
          ? 'rescheduled'
          : 'new'
        result.timeline.push({
          instance: placed.data,
          projectId: placed.data.source_id ?? item.id,
          decision,
          scheduledDayOffset: dayOffsetFor(placed.data.start_utc) ?? offset,
          availableStartLocal: placementWindow?.availableStartLocal
            ? placementWindow.availableStartLocal.toISOString()
            : undefined,
          windowStartLocal: placementWindow?.startLocal
            ? placementWindow.startLocal.toISOString()
            : undefined,
        })
        scheduled = true
      }
    }

    if (!scheduled) {
      result.failures.push({ itemId: item.id, reason: 'NO_WINDOW' })
    }
  }

  result.timeline.sort((a, b) => {
    const aTime = new Date(a.instance.start_utc).getTime()
    const bTime = new Date(b.instance.start_utc).getTime()
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
    if (aTime === bTime) {
      return (a.projectId ?? '').localeCompare(b.projectId ?? '')
    }
    return aTime - bTime
  })

  return result
}

type DedupeResult = {
  scheduled: Set<string>
  keepers: ScheduleInstance[]
  failures: ScheduleFailure[]
  error: PostgrestError | null
  canceledByProject: Map<string, string[]>
  reusableByProject: Map<string, string>
}

async function dedupeScheduledProjects(
  supabase: Client,
  userId: string,
  baseStart: Date,
  rangeEnd: Date,
  projectsToReset: Set<string>
): Promise<DedupeResult> {
  const response = await fetchInstancesForRange(
    userId,
    baseStart.toISOString(),
    rangeEnd.toISOString(),
    supabase
  )

  if (response.error) {
    return {
      scheduled: new Set<string>(),
      keepers: [],
      failures: [],
      error: response.error,
      canceledByProject: new Map(),
      reusableByProject: new Map(),
    }
  }

  const keepers = new Map<string, ScheduleInstance>()
  const reusableCandidates = new Map<string, ScheduleInstance>()
  const extras: ScheduleInstance[] = []

  for (const inst of response.data ?? []) {
    if (inst.source_type !== 'PROJECT') continue
    if (inst.status !== 'scheduled') continue

    const projectId = inst.source_id

    if (projectsToReset.has(projectId)) {
      const existing = reusableCandidates.get(projectId)
      if (!existing) {
        reusableCandidates.set(projectId, inst)
        continue
      }

      const existingStart = new Date(existing.start_utc).getTime()
      const instStart = new Date(inst.start_utc).getTime()

      if (instStart < existingStart) {
        extras.push(existing)
        reusableCandidates.set(projectId, inst)
      } else {
        extras.push(inst)
      }
      continue
    }

    const existing = keepers.get(projectId)
    if (!existing) {
      keepers.set(projectId, inst)
      continue
    }

    const existingStart = new Date(existing.start_utc).getTime()
    const instStart = new Date(inst.start_utc).getTime()

    if (instStart < existingStart) {
      extras.push(existing)
      keepers.set(projectId, inst)
    } else {
      extras.push(inst)
    }
  }

  const failures: ScheduleFailure[] = []

  const canceledByProject = new Map<string, string[]>()

  for (const extra of extras) {
    const cancel = await supabase
      .from('schedule_instances')
      .update({ status: 'canceled' })
      .eq('id', extra.id)
      .select('id')
      .single()

    if (cancel.error) {
      failures.push({
        itemId: extra.source_id,
        reason: 'error',
        detail: cancel.error,
      })
      continue
    }

    const id = cancel.data?.id ?? extra.id
    const existing = canceledByProject.get(extra.source_id) ?? []
    existing.push(id)
    canceledByProject.set(extra.source_id, existing)
  }

  const scheduled = new Set<string>()
  for (const key of keepers.keys()) {
    scheduled.add(key)
  }

  const reusableByProject = new Map<string, string>()
  for (const [projectId, inst] of reusableCandidates) {
    reusableByProject.set(projectId, inst.id)
  }

  return {
    scheduled,
    keepers: Array.from(keepers.values()),
    failures,
    error: null,
    canceledByProject,
    reusableByProject,
  }
}

async function fetchCompatibleWindowsForItem(
  supabase: Client,
  date: Date,
  item: { energy: string; duration_min: number },
  timeZone: string,
  options?: {
    now?: Date
    availability?: Map<string, Date>
    cache?: Map<string, WindowLite[]>
  }
) {
  const cacheKey = dateCacheKey(date)
  const cache = options?.cache
  let windows: WindowLite[]
  if (cache?.has(cacheKey)) {
    windows = cache.get(cacheKey) ?? []
  } else {
    windows = await fetchWindowsForDate(date, supabase, timeZone)
    cache?.set(cacheKey, windows)
  }
  const itemIdx = energyIndex(item.energy)
  const now = options?.now ? new Date(options.now) : null
  const nowMs = now?.getTime()
  const durationMs = Math.max(0, item.duration_min) * 60000
  const availability = options?.availability

  const compatible = [] as Array<{
    id: string
    key: string
    startLocal: Date
    endLocal: Date
    availableStartLocal: Date
    energyIdx: number
  }>

  for (const win of windows) {
    const energyRaw = win.energy ? String(win.energy).toUpperCase().trim() : ''
    const hasEnergyLabel = energyRaw.length > 0
    const energyLabel = hasEnergyLabel ? energyRaw : null
    const energyIdx = hasEnergyLabel
      ? energyIndex(energyLabel, { fallback: ENERGY.LIST.length })
      : ENERGY.LIST.length
    if (hasEnergyLabel && energyIdx >= ENERGY.LIST.length) continue
    if (energyIdx < itemIdx) continue

    const startLocal = resolveWindowStart(win, date, timeZone)
    const endLocal = resolveWindowEnd(win, date, timeZone)
    const key = windowKey(win.id, startLocal)
    const startMs = startLocal.getTime()
    const endMs = endLocal.getTime()

    if (typeof nowMs === 'number' && endMs <= nowMs) continue

    let baseAvailableStartMs =
      typeof nowMs === 'number' ? Math.max(startMs, nowMs) : startMs
    if (win.fromPrevDay) {
      const dayStartMs = startOfDayInTimeZone(date, timeZone).getTime()
      if (baseAvailableStartMs < dayStartMs) {
        baseAvailableStartMs = dayStartMs
      }
    }
    const carriedStartMs = availability?.get(key)?.getTime()
    const availableStartMs =
      typeof carriedStartMs === 'number'
        ? Math.max(baseAvailableStartMs, carriedStartMs)
        : baseAvailableStartMs
    if (availableStartMs >= endMs) continue
    if (availableStartMs + durationMs > endMs) continue

    const availableStartLocal = new Date(availableStartMs)
    if (availability) {
      const existing = availability.get(key)
      if (!existing || existing.getTime() !== availableStartMs) {
        availability.set(key, availableStartLocal)
      }
    }

    compatible.push({
      id: win.id,
      key,
      startLocal,
      endLocal,
      availableStartLocal,
      energyIdx,
    })
  }

  compatible.sort((a, b) => {
    const startDiff = a.availableStartLocal.getTime() - b.availableStartLocal.getTime()
    if (startDiff !== 0) return startDiff
    const energyDiff = a.energyIdx - b.energyIdx
    if (energyDiff !== 0) return energyDiff
    const rawStartDiff = a.startLocal.getTime() - b.startLocal.getTime()
    if (rawStartDiff !== 0) return rawStartDiff
    return a.id.localeCompare(b.id)
  })

  return compatible.map(win => ({
    id: win.id,
    key: win.key,
    startLocal: win.startLocal,
    endLocal: win.endLocal,
    availableStartLocal: win.availableStartLocal,
  }))
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
  const match = windows.find(win =>
    win.id === placement.window_id && isWithinWindow(start, win)
  )
  if (match) return match
  return windows.find(win => win.id === placement.window_id) ?? null
}

function isWithinWindow(
  start: Date,
  win: { startLocal: Date; endLocal: Date }
) {
  return start >= win.startLocal && start < win.endLocal
}

function windowKey(windowId: string, startLocal: Date) {
  return `${windowId}:${startLocal.toISOString()}`
}

function dateCacheKey(date: Date) {
  return date.toISOString()
}

function energyIndex(level?: string | null, options?: { fallback?: number }) {
  const fallback = options?.fallback ?? -1
  if (!level) return fallback
  const up = level.toUpperCase()
  const index = ENERGY.LIST.indexOf(up as (typeof ENERGY.LIST)[number])
  return index === -1 ? fallback : index
}

function resolveWindowStart(win: WindowLite, date: Date, timeZone: string) {
  const [hour = 0, minute = 0] = win.start_local.split(':').map(Number)
  const baseDay = win.fromPrevDay
    ? addDaysInTimeZone(date, -1, timeZone)
    : date
  return setTimeInTimeZone(baseDay, timeZone, hour, minute)
}

function resolveWindowEnd(win: WindowLite, date: Date, timeZone: string) {
  const [hour = 0, minute = 0] = win.end_local.split(':').map(Number)
  let end = setTimeInTimeZone(date, timeZone, hour, minute)
  const start = resolveWindowStart(win, date, timeZone)
  if (end <= start) {
    const nextDay = addDaysInTimeZone(date, 1, timeZone)
    end = setTimeInTimeZone(nextDay, timeZone, hour, minute)
  }
  return end
}
