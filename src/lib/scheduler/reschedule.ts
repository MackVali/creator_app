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
  fetchHabitsForSchedule,
  DEFAULT_HABIT_DURATION_MIN,
  type HabitScheduleItem,
} from './habits'
import { evaluateHabitDueOnDate, type HabitDueEvaluation } from './habitRecurrence'
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

type ProjectDraftPlacement = {
  type: 'PROJECT'
  instance: ScheduleInstance
  projectId: string
  decision: 'kept' | 'new' | 'rescheduled'
  scheduledDayOffset?: number
  availableStartLocal?: string | null
  windowStartLocal?: string | null
}

type HabitDraftPlacement = {
  type: 'HABIT'
  habit: {
    id: string
    name: string
    windowId: string | null
    windowLabel: string | null
    startUTC: string
    endUTC: string
    durationMin: number
    energyResolved: string | null
    clipped?: boolean
  }
  decision: 'kept' | 'new' | 'rescheduled'
  scheduledDayOffset?: number
  availableStartLocal?: string | null
  windowStartLocal?: string | null
}

type ScheduleDraftPlacement = ProjectDraftPlacement | HabitDraftPlacement

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
  const habits = await fetchHabitsForSchedule(supabase)
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
      type: 'PROJECT',
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
  const habitPlacementsByOffset = new Map<number, HabitDraftPlacement[]>()

  const ensureHabitPlacementsForDay = async (
    offset: number,
    day: Date,
    availability: Map<string, Date>
  ) => {
    if (habitPlacementsByOffset.has(offset)) {
      return habitPlacementsByOffset.get(offset) ?? []
    }

    const placements = await scheduleHabitsForDay({
      habits,
      day,
      offset,
      timeZone,
      availability,
      baseDate,
      windowCache,
      client: supabase,
    })

    if (placements.length > 0) {
      result.timeline.push(...placements)
    }

    habitPlacementsByOffset.set(offset, placements)
    return placements
  }

  if (habits.length > 0) {
    let availability = windowAvailabilityByDay.get(0)
    if (!availability) {
      availability = new Map<string, Date>()
      windowAvailabilityByDay.set(0, availability)
    }
    await ensureHabitPlacementsForDay(0, baseStart, availability)
  }
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
      await ensureHabitPlacementsForDay(offset, day, windowAvailability)
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
          type: 'PROJECT',
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
    const aTime = placementStartMs(a)
    const bTime = placementStartMs(b)
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return 0
    if (aTime === bTime) {
      return placementKey(a).localeCompare(placementKey(b))
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

async function scheduleHabitsForDay(params: {
  habits: HabitScheduleItem[]
  day: Date
  offset: number
  timeZone: string
  availability: Map<string, Date>
  baseDate: Date
  windowCache: Map<string, WindowLite[]>
  client: Client
}): Promise<HabitDraftPlacement[]> {
  const { habits, day, offset, timeZone, availability, baseDate, windowCache, client } = params
  if (!habits.length) return []

  const cacheKey = dateCacheKey(day)
  let windows = windowCache.get(cacheKey)
  if (!windows) {
    windows = await fetchWindowsForDate(day, client, timeZone)
    windowCache.set(cacheKey, windows)
  }

  if (!windows || windows.length === 0) return []

  const windowsById = new Map<string, WindowLite>()
  for (const win of windows) {
    windowsById.set(win.id, win)
  }

  const dueInfoByHabitId = new Map<string, HabitDueEvaluation>()
  const grouped = new Map<string, HabitScheduleItem[]>()
  for (const habit of habits) {
    if (!habit.windowId) continue
    const window = windowsById.get(habit.windowId)
    if (!window) continue
    const dueInfo = evaluateHabitDueOnDate({
      habit,
      date: day,
      timeZone,
      windowDays: window.days ?? habit.window?.days ?? null,
    })
    if (!dueInfo.isDue) continue
    dueInfoByHabitId.set(habit.id, dueInfo)
    const existing = grouped.get(window.id)
    if (existing) {
      existing.push(habit)
    } else {
      grouped.set(window.id, [habit])
    }
  }

  if (grouped.size === 0) return []
  const baseNowMs = offset === 0 ? baseDate.getTime() : null
  const placements: HabitDraftPlacement[] = []
  const dayStart = startOfDayInTimeZone(day, timeZone)
  const defaultDueMs = dayStart.getTime()

  for (const [windowId, group] of grouped) {
    const window = windowsById.get(windowId)
    if (!window) continue

    const startLocal = resolveWindowStart(window, day, timeZone)
    const endLocal = resolveWindowEnd(window, day, timeZone)
    const startMs = startLocal.getTime()
    const endMs = endLocal.getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
    if (endMs <= startMs) continue

    const key = windowKey(window.id, startLocal)
    const existingAvailability = availability.get(key)
    let cursorMs = existingAvailability?.getTime() ?? startMs
    if (cursorMs < startMs) {
      cursorMs = startMs
    }

    const sorted = [...group].sort((a, b) => {
      const dueA = dueInfoByHabitId.get(a.id)
      const dueB = dueInfoByHabitId.get(b.id)
      const dueDiff = (dueA?.dueStart?.getTime() ?? defaultDueMs) - (dueB?.dueStart?.getTime() ?? defaultDueMs)
      if (dueDiff !== 0) return dueDiff
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      if (aTime !== bTime) return aTime - bTime
      return a.name.localeCompare(b.name)
    })

    const forwardHabits = sorted.filter(habit => habit.windowPosition !== 'LAST')
    const lastHabits = sorted.filter(habit => habit.windowPosition === 'LAST')

    const reservedKey = `${key}::reserved-end`
    availability.delete(reservedKey)

    let availabilityUpdated = false

    for (const habit of forwardHabits) {
      if (cursorMs >= endMs) break
      const rawDuration = Number(habit.durationMinutes ?? 0)
      const durationMin =
        Number.isFinite(rawDuration) && rawDuration > 0
          ? rawDuration
          : DEFAULT_HABIT_DURATION_MIN
      const durationMs = durationMin * 60000
      if (durationMs <= 0) continue

      let startCandidate = cursorMs
      if (typeof baseNowMs === 'number' && baseNowMs > startCandidate && baseNowMs < endMs) {
        startCandidate = baseNowMs
      }
      if (startCandidate >= endMs) {
        cursorMs = endMs
        continue
      }

      let endCandidate = startCandidate + durationMs
      let clipped = false
      if (endCandidate > endMs) {
        endCandidate = endMs
        clipped = true
      }
      if (endCandidate <= startCandidate) {
        cursorMs = endCandidate
        continue
      }

      const startDate = new Date(startCandidate)
      const endDate = new Date(endCandidate)
      availability.set(key, endDate)
      availabilityUpdated = true
      cursorMs = endCandidate

      const durationMinutes = Math.max(1, Math.round((endCandidate - startCandidate) / 60000))

      placements.push({
        type: 'HABIT',
        habit: {
          id: habit.id,
          name: habit.name,
          windowId: window.id,
          windowLabel: window.label ?? null,
          startUTC: startDate.toISOString(),
          endUTC: endDate.toISOString(),
          durationMin: durationMinutes,
          energyResolved: window.energy ? String(window.energy).toUpperCase() : null,
          clipped,
        },
        decision: 'kept',
        scheduledDayOffset: offset,
        availableStartLocal: startDate.toISOString(),
        windowStartLocal: startLocal.toISOString(),
      })
    }

    const nextAvailableMs = Math.min(Math.max(cursorMs, startMs), endMs)
    const existingMs = availability.get(key)?.getTime()
    const desiredMs =
      typeof existingMs === 'number'
        ? Math.max(existingMs, nextAvailableMs)
        : nextAvailableMs
    if (!availabilityUpdated || desiredMs !== existingMs) {
      availability.set(key, new Date(desiredMs))
    }

    if (lastHabits.length > 0) {
      let backwardCursor = endMs
      let earliestLastStart: number | null = null
      const reversed = [...lastHabits].reverse()

      for (const habit of reversed) {
        if (backwardCursor <= nextAvailableMs) {
          break
        }

        const rawDuration = Number(habit.durationMinutes ?? 0)
        const durationMin =
          Number.isFinite(rawDuration) && rawDuration > 0
            ? rawDuration
            : DEFAULT_HABIT_DURATION_MIN
        const durationMs = durationMin * 60000
        if (durationMs <= 0) continue

        let minStart = Math.max(startMs, nextAvailableMs)
        if (typeof baseNowMs === 'number' && baseNowMs > minStart && baseNowMs < endMs) {
          minStart = baseNowMs
        }
        if (backwardCursor <= minStart) {
          continue
        }

        let startCandidate = backwardCursor - durationMs
        let clipped = false
        if (startCandidate < minStart) {
          startCandidate = minStart
          clipped = true
        }
        if (startCandidate >= backwardCursor) {
          continue
        }

        let endCandidate = backwardCursor
        if (endCandidate > endMs) {
          endCandidate = endMs
        }
        if (endCandidate <= startCandidate) {
          continue
        }

        const actualDurationMs = endCandidate - startCandidate
        if (actualDurationMs <= 0) {
          continue
        }
        if (actualDurationMs < durationMs) {
          clipped = true
        }

        const startDate = new Date(startCandidate)
        const endDate = new Date(endCandidate)
        const durationMinutes = Math.max(1, Math.round(actualDurationMs / 60000))

        placements.push({
          type: 'HABIT',
          habit: {
            id: habit.id,
            name: habit.name,
            windowId: window.id,
            windowLabel: window.label ?? null,
            startUTC: startDate.toISOString(),
            endUTC: endDate.toISOString(),
            durationMin: durationMinutes,
            energyResolved: window.energy ? String(window.energy).toUpperCase() : null,
            clipped,
          },
          decision: 'kept',
          scheduledDayOffset: offset,
          availableStartLocal: startDate.toISOString(),
          windowStartLocal: startLocal.toISOString(),
        })

        backwardCursor = startCandidate
        earliestLastStart =
          typeof earliestLastStart === 'number'
            ? Math.min(earliestLastStart, startCandidate)
            : startCandidate
      }

      if (typeof earliestLastStart === 'number') {
        availability.set(reservedKey, new Date(earliestLastStart))
      }
    }
  }

  placements.sort((a, b) => {
    const aTime = new Date(a.habit.startUTC).getTime()
    const bTime = new Date(b.habit.startUTC).getTime()
    return aTime - bTime
  })

  return placements
}

function placementStartMs(entry: ScheduleDraftPlacement) {
  if (entry.type === 'PROJECT') {
    return new Date(entry.instance.start_utc).getTime()
  }
  return new Date(entry.habit.startUTC).getTime()
}

function placementKey(entry: ScheduleDraftPlacement) {
  if (entry.type === 'PROJECT') {
    const id = entry.projectId || entry.instance.id
    return `PROJECT:${id}`
  }
  return `HABIT:${entry.habit.id}`
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
    let endMs = endLocal.getTime()
    const reservedEnd = availability?.get(`${key}::reserved-end`)
    const reservedEndMs = reservedEnd?.getTime()
    if (typeof reservedEndMs === 'number' && reservedEndMs < endMs) {
      endMs = reservedEndMs
    }

    if (typeof nowMs === 'number' && endMs <= nowMs) continue

    const baseAvailableStartMs =
      typeof nowMs === 'number' ? Math.max(startMs, nowMs) : startMs
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
