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
  const baseStart = startOfDay(baseDate)

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
  const rangeEnd = addDays(baseStart, 28)
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
    if (scheduled.has(def.id)) return
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
    const weightDiff = b.weight - a.weight
    if (weightDiff !== 0) return weightDiff
    const energyDiff = energyIndex(b.energy) - energyIndex(a.energy)
    if (energyDiff !== 0) return energyDiff
    return a.id.localeCompare(b.id)
  })

  for (const item of queue) {
    let scheduled = false
    for (let offset = 0; offset < 28 && !scheduled; offset += 1) {
      const day = addDays(baseStart, offset)
      const windows = await fetchCompatibleWindowsForItem(
        supabase,
        day,
        item,
        offset === 0 ? { now: baseDate } : undefined
      )
      if (windows.length === 0) continue

      const placed = await placeItemInWindows({
        userId,
        item,
        windows,
        date: day,
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
  date: Date,
  item: { energy: string; duration_min: number },
  options?: { now?: Date }
) {
  const windows = await fetchWindowsForDate(date, supabase)
  const itemIdx = energyIndex(item.energy)
  const now = options?.now ? new Date(options.now) : null
  const nowMs = now?.getTime()
  const durationMs = Math.max(0, item.duration_min) * 60000

  const compatible = [] as Array<{
    id: string
    startLocal: Date
    endLocal: Date
    availableStartLocal: Date
    energyIdx: number
  }>

  for (const win of windows) {
    const energyIdx = energyIndex(win.energy)
    if (energyIdx < itemIdx) continue

    const startLocal = resolveWindowStart(win, date)
    const endLocal = resolveWindowEnd(win, date)
    const startMs = startLocal.getTime()
    const endMs = endLocal.getTime()

    if (typeof nowMs === 'number' && endMs <= nowMs) continue

    const availableStartMs = typeof nowMs === 'number' ? Math.max(startMs, nowMs) : startMs
    if (availableStartMs >= endMs) continue
    if (availableStartMs + durationMs > endMs) continue

    compatible.push({
      id: win.id,
      startLocal,
      endLocal,
      availableStartLocal: new Date(availableStartMs),
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
    startLocal: win.startLocal,
    endLocal: win.endLocal,
    availableStartLocal: win.availableStartLocal,
  }))
}

function energyIndex(level?: string | null) {
  if (!level) return -1
  const up = level.toUpperCase()
  return ENERGY.LIST.indexOf(up as (typeof ENERGY.LIST)[number])
}

function resolveWindowStart(win: WindowLite, date: Date) {
  const [hour = 0, minute = 0] = win.start_local.split(':').map(Number)
  const start = startOfDay(date)
  if (win.fromPrevDay) start.setDate(start.getDate() - 1)
  start.setHours(hour, minute, 0, 0)
  return start
}

function resolveWindowEnd(win: WindowLite, date: Date) {
  const [hour = 0, minute = 0] = win.end_local.split(':').map(Number)
  const base = win.fromPrevDay ? startOfDay(date) : startOfDay(date)
  const end = new Date(base)
  end.setHours(hour, minute, 0, 0)
  const start = resolveWindowStart(win, date)
  if (end <= start) {
    end.setDate(end.getDate() + 1)
  }
  return end
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, amount: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + amount)
  return d
}
