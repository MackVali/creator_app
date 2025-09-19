import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  addDaysToKey,
  getLocalDateKey,
  getUTCDateRangeForKey,
  parseDateKey,
  zonedDateTimeToUTC,
  normalizeTimeZone,
} from '../time/tz'
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

type Client = SupabaseClient<Database>

const GRACE_MIN = 60

type ScheduleFailure = {
  itemId: string
  reason: string
  detail?: unknown
}

type ScheduleBacklogResult = {
  placed: ScheduleInstance[]
  failures: ScheduleFailure[]
  error?: PostgrestError | null
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
  const cutoff = new Date(now.getTime() - GRACE_MIN * 60000).toISOString()
  return await supabase
    .from('schedule_instances')
    .update({ status: 'missed' })
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .lt('end_utc', cutoff)
}

export async function scheduleBacklog(
  userId: string,
  baseDate = new Date(),
  client?: Client
): Promise<ScheduleBacklogResult> {
  const supabase = await ensureClient(client)
  const result: ScheduleBacklogResult = { placed: [], failures: [] }

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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle()

  if (profileError) {
    console.error('Failed to fetch profile timezone', profileError)
  }

  const userTimeZone = normalizeTimeZone(profile?.timezone)
  const tzOption = userTimeZone ?? undefined

  const baseKey = getLocalDateKey(baseDate.toISOString(), tzOption)
  const { startUTC: baseStartUTC } = getUTCDateRangeForKey(baseKey, tzOption)
  const baseStart = new Date(baseStartUTC)

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

  const initialQueueProjectIds = new Set(queue.map(item => item.id))
  const rangeEndKey = addDaysToKey(baseKey, 28, tzOption)
  const { startUTC: rangeEndUTC } = getUTCDateRangeForKey(rangeEndKey, tzOption)
  const rangeEnd = new Date(rangeEndUTC)
  const dedupe = await dedupeScheduledProjects(
    supabase,
    userId,
    baseStart,
    rangeEnd,
    initialQueueProjectIds
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
  const scheduled = dedupe.scheduled

  if (queue.length === 0) {
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
      if (scheduled.has(def.id)) return
      const energy = (def.energy ?? 'NO').toString().toUpperCase()
      queue.push({
        id: def.id,
        sourceType: 'PROJECT',
        duration_min: duration,
        energy,
        weight: def.weight ?? 0,
      })
    }

    for (const project of projectItems) {
      enqueue(project)
    }
  }

  const finalQueueProjectIds = new Set(queue.map(item => item.id))
  let needsSecondDedupe = finalQueueProjectIds.size !== initialQueueProjectIds.size
  if (!needsSecondDedupe) {
    for (const id of finalQueueProjectIds) {
      if (!initialQueueProjectIds.has(id)) {
        needsSecondDedupe = true
        break
      }
    }
  }

  if (needsSecondDedupe) {
    const fallbackDedupe = await dedupeScheduledProjects(
      supabase,
      userId,
      baseStart,
      rangeEnd,
      finalQueueProjectIds
    )
    if (fallbackDedupe.error) {
      result.error = fallbackDedupe.error
      return result
    }
    if (fallbackDedupe.failures.length > 0) {
      result.failures.push(...fallbackDedupe.failures)
    }
    collectPrimaryReuseIds(fallbackDedupe.reusableByProject)
    collectReuseIds(fallbackDedupe.canceledByProject)
  }

  for (const item of queue) {
    if (item.instanceId) continue
    const reuseId = reuseInstanceByProject.get(item.id)
    if (!reuseId) continue
    item.instanceId = reuseId
    reuseInstanceByProject.delete(item.id)
  }

  queue.sort((a, b) => {
    const energyDiff = energyIndex(b.energy) - energyIndex(a.energy)
    if (energyDiff !== 0) return energyDiff
    const weightDiff = b.weight - a.weight
    if (weightDiff !== 0) return weightDiff
    return a.id.localeCompare(b.id)
  })

  for (const item of queue) {
    let scheduled = false
    for (let offset = 0; offset < 28 && !scheduled; offset += 1) {
      const dayKey = addDaysToKey(baseKey, offset, tzOption)
      const { startUTC: dayStartUTC } = getUTCDateRangeForKey(dayKey, tzOption)
      const dayDate = new Date(dayStartUTC)
      const windows = await fetchCompatibleWindowsForItem(
        supabase,
        dayKey,
        item,
        userTimeZone
      )
      if (windows.length === 0) continue

      const placed = await placeItemInWindows({
        userId,
        item,
        windows,
        date: dayDate,
        client: supabase,
        reuseInstanceId: item.instanceId,
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
        scheduled = true
      }
    }

    if (!scheduled) {
      result.failures.push({ itemId: item.id, reason: 'NO_WINDOW' })
    }
  }

  return result
}

type DedupeResult = {
  scheduled: Set<string>
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

  return { scheduled, failures, error: null, canceledByProject, reusableByProject }
}

async function fetchCompatibleWindowsForItem(
  supabase: Client,
  dayKey: string,
  item: { energy: string; duration_min: number },
  timeZone: string | null,
) {
  const tzOption = timeZone ?? undefined
  const parsedDate = parseDateKey(dayKey, tzOption)
  const dayDate = Number.isNaN(parsedDate.getTime())
    ? new Date(`${dayKey}T00:00:00Z`)
    : parsedDate
  const windows = await fetchWindowsForDate(dayDate, supabase, { timeZone })
  const itemIdx = energyIndex(item.energy)
  const compatible = windows.filter(w => energyIndex(w.energy) >= itemIdx)
  const { startUTC: dayStartISO, endUTC: dayEndISO } = getUTCDateRangeForKey(
    dayKey,
    tzOption,
  )
  const dayStart = new Date(dayStartISO)
  const dayEnd = new Date(dayEndISO)

  return compatible
    .map(w => {
      const start = resolveWindowStart(w, dayKey, timeZone)
      const end = resolveWindowEnd(w, dayKey, timeZone)
      const clampedStart = start < dayStart ? dayStart : start
      const clampedEnd = end > dayEnd ? dayEnd : end
      if (clampedEnd <= clampedStart) return null
      return {
        id: w.id,
        startLocal: clampedStart,
        endLocal: clampedEnd,
      }
    })
    .filter(
      (
        value,
      ): value is { id: string; startLocal: Date; endLocal: Date } =>
        value !== null,
    )
}

function energyIndex(level?: string | null) {
  if (!level) return -1
  const up = level.toUpperCase()
  return ENERGY.LIST.indexOf(up as (typeof ENERGY.LIST)[number])
}

function resolveWindowStart(
  win: WindowLite,
  dayKey: string,
  timeZone: string | null,
) {
  const tzOption = timeZone ?? undefined
  const targetKey = win.fromPrevDay
    ? addDaysToKey(dayKey, -1, tzOption)
    : dayKey
  return makeUTCDate(targetKey, win.start_local, timeZone)
}

function resolveWindowEnd(
  win: WindowLite,
  dayKey: string,
  timeZone: string | null,
) {
  const tzOption = timeZone ?? undefined
  const baseKey = dayKey
  let end = makeUTCDate(baseKey, win.end_local, timeZone)
  const start = resolveWindowStart(win, dayKey, timeZone)
  if (end <= start) {
    const nextKey = addDaysToKey(baseKey, 1, tzOption)
    end = makeUTCDate(nextKey, win.end_local, timeZone)
  }
  return end
}

function makeUTCDate(
  dateKey: string,
  timeValue: string,
  timeZone: string | null,
) {
  const { year, month, day } = parseDateKeyParts(dateKey)
  const [hour, minute, second] = parseTimeSegments(timeValue)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(NaN)
  }

  if (timeZone) {
    try {
      return zonedDateTimeToUTC(
        {
          year,
          month,
          day,
          hour,
          minute,
          second,
          millisecond: 0,
        },
        timeZone,
      )
    } catch (error) {
      console.warn('Failed to convert zoned time to UTC', {
        dateKey,
        timeValue,
        timeZone,
        error,
      })
    }
  }

  return new Date(
    Date.UTC(
      year,
      (Number.isFinite(month) ? month : 1) - 1,
      Number.isFinite(day) ? day : 1,
      hour,
      minute,
      second,
      0,
    ),
  )
}

function parseDateKeyParts(dateKey: string) {
  const [yearStr, monthStr, dayStr] = dateKey.split('-')
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  }
}

function parseTimeSegments(value: string): [number, number, number] {
  const [hourStr = '0', minuteStr = '0', secondStr = '0'] = value.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const second = Number(secondStr)
  return [Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, Number.isFinite(second) ? second : 0]
}
