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
  fetchProjectSkillsForProjects,
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
import { normalizeCoordinates, resolveSunlightBounds, type GeoCoordinates } from './sunlight'
import { normalizeSchedulerModePayload, type SchedulerModePayload } from './modes'

type Client = SupabaseClient<Database>

const START_GRACE_MIN = 1
const BASE_LOOKAHEAD_DAYS = 28
const LOOKAHEAD_PER_ITEM_DAYS = 7
const MAX_LOOKAHEAD_DAYS = 365

const HABIT_TYPE_PRIORITY: Record<string, number> = {
  CHORE: 0,
  HABIT: 1,
  TEMP: 1,
  MEMO: 2,
  SYNC: 3,
}

function habitTypePriority(value?: string | null) {
  const normalized = (value ?? 'HABIT').toUpperCase()
  if (normalized === 'ASYNC') return HABIT_TYPE_PRIORITY.SYNC
  return HABIT_TYPE_PRIORITY[normalized] ?? Number.MAX_SAFE_INTEGER
}

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

type WindowAvailabilityBounds = {
  front: Date
  back: Date
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
  options?: {
    timeZone?: string | null
    location?: GeoCoordinates | null
    mode?: SchedulerModePayload | null
  }
): Promise<ScheduleBacklogResult> {
  const supabase = await ensureClient(client)
  const result: ScheduleBacklogResult = { placed: [], failures: [], timeline: [] }
  const timeZone = normalizeTimeZone(options?.timeZone)
  const location = normalizeCoordinates(options?.location ?? null)
  const mode = normalizeSchedulerModePayload(options?.mode ?? { type: 'REGULAR' })
  const isRushMode = mode.type === 'RUSH'
  const isRestMode = mode.type === 'REST'
  const restrictProjectsToToday =
    mode.type === 'MONUMENTAL' || mode.type === 'SKILLED'
  const durationMultiplier = isRushMode ? 0.8 : 1
  const filteredProjectIds = new Set<string>()
  const noteModeFiltered = (projectId: string) => {
    if (!projectId || filteredProjectIds.has(projectId)) return
    filteredProjectIds.add(projectId)
    result.failures.push({ itemId: projectId, reason: 'MODE_FILTERED' })
  }
  const adjustDuration = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) return value
    if (durationMultiplier === 1) return value
    return Math.max(1, Math.round(value * durationMultiplier))
  }

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

  const taskSkillsByProjectId = new Map<string, Set<string>>()
  const taskMonumentsByProjectId = new Map<string, Set<string>>()
  for (const task of tasks) {
    const projectId = task.project_id ?? null
    if (!projectId) continue
    if (task.skill_id) {
      const existing = taskSkillsByProjectId.get(projectId) ?? new Set<string>()
      existing.add(task.skill_id)
      taskSkillsByProjectId.set(projectId, existing)
    }
    if (task.skill_monument_id) {
      const existing = taskMonumentsByProjectId.get(projectId) ?? new Set<string>()
      existing.add(task.skill_monument_id)
      taskMonumentsByProjectId.set(projectId, existing)
    }
  }

  let projectSkillsMap: Record<string, string[]> = {}
  let skillMonumentMap: Record<string, string | null> = {}
  if (mode.type === 'MONUMENTAL' || mode.type === 'SKILLED') {
    try {
      const projectIds = Object.keys(projectsMap)
      if (projectIds.length > 0) {
        projectSkillsMap = await fetchProjectSkillsForProjects(projectIds, supabase)
      }
    } catch (error) {
      console.error('Failed to fetch project skill links for scheduler mode', error)
      projectSkillsMap = {}
    }
    try {
      skillMonumentMap = await fetchSkillMonumentMap(supabase, userId)
    } catch (error) {
      console.error('Failed to fetch skill monuments for scheduler mode', error)
      skillMonumentMap = {}
    }
  }

  const projectSkillIdsCache = new Map<string, string[]>()
  const projectMonumentIdsCache = new Map<string, string[]>()
  const getProjectSkillIds = (projectId: string): string[] => {
    const cached = projectSkillIdsCache.get(projectId)
    if (cached) return cached
    const set = new Set<string>()
    for (const id of projectSkillsMap[projectId] ?? []) {
      if (id) set.add(id)
    }
    const taskSkillIds = taskSkillsByProjectId.get(projectId)
    if (taskSkillIds) {
      for (const id of taskSkillIds) {
        if (id) set.add(id)
      }
    }
    const ids = Array.from(set)
    projectSkillIdsCache.set(projectId, ids)
    return ids
  }
  const getProjectMonumentIds = (projectId: string): string[] => {
    const cached = projectMonumentIdsCache.get(projectId)
    if (cached) return cached
    const set = new Set<string>()
    for (const skillId of getProjectSkillIds(projectId)) {
      const monumentId = skillMonumentMap[skillId] ?? null
      if (monumentId) set.add(monumentId)
    }
    const taskMonuments = taskMonumentsByProjectId.get(projectId)
    if (taskMonuments) {
      for (const monumentId of taskMonuments) {
        if (monumentId) set.add(monumentId)
      }
    }
    const ids = Array.from(set)
    projectMonumentIdsCache.set(projectId, ids)
    return ids
  }
  const matchesMode = (projectId: string): boolean => {
    if (mode.type === 'MONUMENTAL') {
      return getProjectMonumentIds(projectId).includes(mode.monumentId)
    }
    if (mode.type === 'SKILLED') {
      const required = new Set(mode.skillIds)
      if (required.size === 0) return false
      return getProjectSkillIds(projectId).some(id => required.has(id))
    }
    return true
  }

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
    if (!matchesMode(def.id)) {
      noteModeFiltered(def.id)
      continue
    }

    let duration = Number(def.duration_min ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) {
      const fallback = Number(m.duration_min ?? 0)
      if (Number.isFinite(fallback) && fallback > 0) {
        duration = fallback
      } else {
        duration = DEFAULT_PROJECT_DURATION_MIN
      }
    }
    duration = adjustDuration(duration)

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
    if (!matchesMode(def.id)) {
      noteModeFiltered(def.id)
      return
    }
    let duration = Number(def.duration_min ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) return
    duration = adjustDuration(duration)
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
  const lookaheadDays = Math.min(
    MAX_LOOKAHEAD_DAYS,
    BASE_LOOKAHEAD_DAYS + queue.length * LOOKAHEAD_PER_ITEM_DAYS,
  )
  const dedupeWindowDays = Math.max(lookaheadDays, 28)
  const rangeEnd = addDaysInTimeZone(baseStart, dedupeWindowDays, timeZone)
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

  const windowAvailabilityByDay = new Map<
    number,
    Map<string, WindowAvailabilityBounds>
  >()
  const windowCache = new Map<string, WindowLite[]>()
  const habitPlacementsByOffset = new Map<number, HabitDraftPlacement[]>()

  const ensureHabitPlacementsForDay = async (
    offset: number,
    day: Date,
    availability: Map<string, WindowAvailabilityBounds>
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
      sunlightLocation: location,
      durationMultiplier,
      restMode: isRestMode,
    })

    if (placements.length > 0) {
      result.timeline.push(...placements)
    }

    habitPlacementsByOffset.set(offset, placements)
    return placements
  }

  if (habits.length > 0) {
    for (let offset = 0; offset < lookaheadDays; offset += 1) {
      let availability = windowAvailabilityByDay.get(offset)
      if (!availability) {
        availability = new Map<string, WindowAvailabilityBounds>()
        windowAvailabilityByDay.set(offset, availability)
      }
      const day = offset === 0 ? baseStart : addDaysInTimeZone(baseStart, offset, timeZone)
      await ensureHabitPlacementsForDay(offset, day, availability)
    }
  }

  for (const item of queue) {
    let scheduled = false
    const maxOffset = restrictProjectsToToday ? 1 : lookaheadDays
    for (let offset = 0; offset < maxOffset && !scheduled; offset += 1) {
      let windowAvailability = windowAvailabilityByDay.get(offset)
      if (!windowAvailability) {
        windowAvailability = new Map<string, WindowAvailabilityBounds>()
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
          restMode: isRestMode,
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
          const placementEnd = new Date(placed.data.end_utc)
          const existingBounds = windowAvailability.get(placementWindow.key)
          if (existingBounds) {
            const nextFront = Math.min(
              placementEnd.getTime(),
              existingBounds.back.getTime(),
            )
            existingBounds.front = new Date(nextFront)
            if (existingBounds.front.getTime() > existingBounds.back.getTime()) {
              existingBounds.back = new Date(existingBounds.front)
            }
          } else {
            const endLocal = placementWindow.endLocal ?? placementEnd
            windowAvailability.set(placementWindow.key, {
              front: placementEnd,
              back: new Date(endLocal),
            })
          }
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
  availability: Map<string, WindowAvailabilityBounds>
  baseDate: Date
  windowCache: Map<string, WindowLite[]>
  client: Client
  sunlightLocation?: GeoCoordinates | null
  durationMultiplier?: number
  restMode?: boolean
}): Promise<HabitDraftPlacement[]> {
  const {
    habits,
    day,
    offset,
    timeZone,
    availability,
    baseDate,
    windowCache,
    client,
    sunlightLocation,
    durationMultiplier = 1,
    restMode = false,
  } = params
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
  const dueHabits: HabitScheduleItem[] = []
  const zone = timeZone || 'UTC'
  const sunlightToday = resolveSunlightBounds(day, zone, sunlightLocation)
  const previousDay = addDaysInTimeZone(day, -1, zone)
  const nextDay = addDaysInTimeZone(day, 1, zone)
  const sunlightPrevious = resolveSunlightBounds(previousDay, zone, sunlightLocation)
  const sunlightNext = resolveSunlightBounds(nextDay, zone, sunlightLocation)
  const dayStart = startOfDayInTimeZone(day, zone)
  const defaultDueMs = dayStart.getTime()
  const baseNowMs = offset === 0 ? baseDate.getTime() : null
  const placements: HabitDraftPlacement[] = []
  const anchorStartsByWindowKey = new Map<string, number[]>()

  for (const habit of habits) {
    const windowDays = habit.window?.days ?? null
    const dueInfo = evaluateHabitDueOnDate({
      habit,
      date: day,
      timeZone: zone,
      windowDays,
    })
    if (!dueInfo.isDue) continue
    dueInfoByHabitId.set(habit.id, dueInfo)
    dueHabits.push(habit)
  }

  if (dueHabits.length === 0) return []

  const sortedHabits = dueHabits.sort((a, b) => {
    const dueA = dueInfoByHabitId.get(a.id)
    const dueB = dueInfoByHabitId.get(b.id)
    const dueDiff = (dueA?.dueStart?.getTime() ?? defaultDueMs) - (dueB?.dueStart?.getTime() ?? defaultDueMs)
    if (dueDiff !== 0) return dueDiff
    const typeDiff = habitTypePriority(a.habitType) - habitTypePriority(b.habitType)
    if (typeDiff !== 0) return typeDiff
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
    if (aTime !== bTime) return aTime - bTime
    return a.name.localeCompare(b.name)
  })

  for (const habit of sortedHabits) {
    const rawDuration = Number(habit.durationMinutes ?? 0)
    let durationMin =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? rawDuration
        : DEFAULT_HABIT_DURATION_MIN
    if (durationMultiplier !== 1) {
      durationMin = Math.max(1, Math.round(durationMin * durationMultiplier))
    }
    const durationMs = durationMin * 60000
    if (durationMs <= 0) continue

    const resolvedEnergy = (habit.energy ?? habit.window?.energy ?? 'NO').toUpperCase()
    const locationContext = habit.locationContextValue
      ? String(habit.locationContextValue).toUpperCase().trim()
      : null
    const rawDaylight = habit.daylightPreference
      ? String(habit.daylightPreference).toUpperCase().trim()
      : 'ALL_DAY'
    const daylightPreference =
      rawDaylight === 'DAY' || rawDaylight === 'NIGHT' ? rawDaylight : 'ALL_DAY'
    const daylightConstraint =
      daylightPreference === 'ALL_DAY'
        ? null
        : {
            preference: daylightPreference as 'DAY' | 'NIGHT',
            sunrise: sunlightToday.sunrise ?? null,
            sunset: sunlightToday.sunset ?? null,
            dawn: sunlightToday.dawn ?? null,
            dusk: sunlightToday.dusk ?? null,
            previousDusk:
              sunlightPrevious.dusk ?? sunlightPrevious.sunset ?? null,
            nextDawn: sunlightNext.dawn ?? sunlightNext.sunrise ?? null,
          }
    const normalizedType = (habit.habitType ?? 'HABIT').toUpperCase()
    const isSyncHabit = normalizedType === 'SYNC' || normalizedType === 'ASYNC'
    const anchorRaw = habit.windowEdgePreference
      ? String(habit.windowEdgePreference).toUpperCase().trim()
      : 'FRONT'
    const anchorPreference = anchorRaw === 'BACK' ? 'BACK' : 'FRONT'

    const compatibleWindows = await fetchCompatibleWindowsForItem(
      client,
      day,
      { energy: resolvedEnergy, duration_min: durationMin },
      zone,
      {
        availability,
        cache: windowCache,
        now: offset === 0 ? baseDate : undefined,
        locationContextValue: locationContext,
        daylight: daylightConstraint,
        matchEnergyLevel: true,
        ignoreAvailability: isSyncHabit,
        anchor: anchorPreference,
        restMode,
      }
    )

    if (compatibleWindows.length === 0) {
      continue
    }

    const target = compatibleWindows[0]
    const window = windowsById.get(target.id)
    if (!window) {
      continue
    }

    const bounds = availability.get(target.key)
    const startLimit = target.availableStartLocal.getTime()
    const endLimit = target.endLocal.getTime()
    const windowStartMs = target.startLocal.getTime()
    const startMs = Number.isFinite(startLimit)
      ? startLimit
      : Number.isFinite(windowStartMs)
        ? windowStartMs
        : defaultDueMs
    let constraintLowerBound = startMs
    const dueStart = dueInfoByHabitId.get(habit.id)?.dueStart ?? null
    const dueStartMs = dueStart ? dueStart.getTime() : null
    if (typeof dueStartMs === 'number' && Number.isFinite(dueStartMs)) {
      constraintLowerBound = Math.max(constraintLowerBound, dueStartMs)
    }
    if (
      typeof baseNowMs === 'number' &&
      baseNowMs > constraintLowerBound &&
      baseNowMs < endLimit
    ) {
      constraintLowerBound = baseNowMs
    }

    let startCandidate: number
    if (isSyncHabit) {
      const anchors = anchorStartsByWindowKey.get(target.key) ?? null
      const safeWindowStart = Number.isFinite(windowStartMs) ? windowStartMs : startMs
      const fallbackStart = Math.max(safeWindowStart, startMs)
      let anchorStartMs: number | null = null

      if (anchors && anchors.length > 0) {
        anchorStartMs =
          anchors.find(value => value >= constraintLowerBound && value < endLimit) ?? null
        if (anchorStartMs === null) {
          anchorStartMs = anchors.find(value => value >= startMs && value < endLimit) ?? null
        }
        if (anchorStartMs === null) {
          anchorStartMs = anchors[0]
        }
      }

      if (typeof anchorStartMs === 'number' && Number.isFinite(anchorStartMs)) {
        startCandidate = Math.max(anchorStartMs, constraintLowerBound)
      } else {
        startCandidate = Math.max(fallbackStart, constraintLowerBound)
      }
    } else {
      startCandidate = Math.max(startLimit, constraintLowerBound)
      if (
        typeof baseNowMs === 'number' &&
        baseNowMs > startCandidate &&
        baseNowMs < endLimit
      ) {
        if (anchorPreference === 'BACK') {
          const latestStart = endLimit - durationMs
          const desiredStart = Math.min(latestStart, baseNowMs)
          startCandidate = Math.max(startLimit, desiredStart)
        } else {
          startCandidate = baseNowMs
        }
      }
    }

    if (startCandidate >= endLimit) {
      setAvailabilityBoundsForKey(availability, target.key, endLimit, endLimit)
      continue
    }

    const latestStartAllowed = endLimit - durationMs
    if (startCandidate > latestStartAllowed) {
      if (bounds) {
        if (anchorPreference === 'BACK') {
          const clamped = Math.max(bounds.front.getTime(), latestStartAllowed)
          bounds.back = new Date(clamped)
          if (bounds.back.getTime() < bounds.front.getTime()) {
            bounds.front = new Date(bounds.back)
          }
        } else {
          bounds.front = new Date(endLimit)
          if (bounds.back.getTime() < bounds.front.getTime()) {
            bounds.back = new Date(bounds.front)
          }
        }
      } else {
        setAvailabilityBoundsForKey(availability, target.key, endLimit, endLimit)
      }
      continue
    }

    let endCandidate = startCandidate + durationMs
    let clipped = false
    if (endCandidate > endLimit) {
      endCandidate = endLimit
      clipped = true
    }
    if (endCandidate <= startCandidate) {
      setAvailabilityBoundsForKey(availability, target.key, endCandidate, endCandidate)
      if (bounds) {
        if (anchorPreference === 'BACK') {
          bounds.back = new Date(Math.max(bounds.front.getTime(), startCandidate))
          if (bounds.back.getTime() < bounds.front.getTime()) {
            bounds.front = new Date(bounds.back)
          }
        } else {
          bounds.front = new Date(endCandidate)
          if (bounds.back.getTime() < bounds.front.getTime()) {
            bounds.back = new Date(bounds.front)
          }
        }
      }
      continue
    }

    const startDate = new Date(startCandidate)
    const endDate = new Date(endCandidate)
    addAnchorStart(anchorStartsByWindowKey, target.key, startCandidate)
    if (bounds) {
      if (anchorPreference === 'BACK') {
        bounds.back = new Date(startDate)
        if (bounds.front.getTime() > bounds.back.getTime()) {
          bounds.front = new Date(bounds.back)
        }
      } else {
        bounds.front = new Date(endDate)
        if (bounds.back.getTime() < bounds.front.getTime()) {
          bounds.back = new Date(bounds.front)
        }
      }
    } else if (anchorPreference === 'BACK') {
      setAvailabilityBoundsForKey(availability, target.key, startDate.getTime(), startDate.getTime())
    } else {
      setAvailabilityBoundsForKey(availability, target.key, endDate.getTime(), endDate.getTime())
    }

    const durationMinutes = Math.max(1, Math.round((endCandidate - startCandidate) / 60000))
    const windowLabel = window.label ?? null
    const windowStartLocal = resolveWindowStart(window, day, zone)

    placements.push({
      type: 'HABIT',
      habit: {
        id: habit.id,
        name: habit.name,
        windowId: window.id,
        windowLabel,
        startUTC: startDate.toISOString(),
        endUTC: endDate.toISOString(),
        durationMin: durationMinutes,
        energyResolved: window.energy ? String(window.energy).toUpperCase() : resolvedEnergy,
        clipped,
      },
      decision: 'kept',
      scheduledDayOffset: offset,
      availableStartLocal: startDate.toISOString(),
      windowStartLocal: windowStartLocal.toISOString(),
    })
  }

  placements.sort((a, b) => {
    const aTime = new Date(a.habit.startUTC).getTime()
    const bTime = new Date(b.habit.startUTC).getTime()
    return aTime - bTime
  })

  return placements
}

async function fetchSkillMonumentMap(
  client: Client,
  userId: string
): Promise<Record<string, string | null>> {
  const { data, error } = await client
    .from('skills')
    .select('id, monument_id')
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  const map: Record<string, string | null> = {}
  for (const row of (data ?? []) as Array<{
    id: string | null
    monument_id: string | null
  }>) {
    if (!row?.id) continue
    map[row.id] = row.monument_id ?? null
  }
  return map
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

function addAnchorStart(map: Map<string, number[]>, key: string, startMs: number) {
  if (!Number.isFinite(startMs)) return
  const existing = map.get(key)
  if (!existing) {
    map.set(key, [startMs])
    return
  }
  if (existing.includes(startMs)) {
    return
  }
  let insertIndex = 0
  while (insertIndex < existing.length && existing[insertIndex] < startMs) {
    insertIndex += 1
  }
  existing.splice(insertIndex, 0, startMs)
}

type DaylightConstraint = {
  preference: 'DAY' | 'NIGHT'
  sunrise: Date | null
  sunset: Date | null
  dawn: Date | null
  dusk: Date | null
  previousDusk: Date | null
  nextDawn: Date | null
}

async function fetchCompatibleWindowsForItem(
  supabase: Client,
  date: Date,
  item: { energy: string; duration_min: number },
  timeZone: string,
  options?: {
    now?: Date
    availability?: Map<string, WindowAvailabilityBounds>
    cache?: Map<string, WindowLite[]>
    locationContextValue?: string | null
    daylight?: DaylightConstraint | null
    matchEnergyLevel?: boolean
    ignoreAvailability?: boolean
    anchor?: 'FRONT' | 'BACK'
    restMode?: boolean
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
  const availability = options?.ignoreAvailability ? undefined : options?.availability

  const desiredLocation = options?.locationContextValue
    ? String(options.locationContextValue).toUpperCase().trim()
    : null
  const daylight = options?.daylight ?? null
  const anchorPreference = options?.anchor === 'BACK' ? 'BACK' : 'FRONT'

  const compatible = [] as Array<{
    id: string
    key: string
    startLocal: Date
    endLocal: Date
    availableStartLocal: Date
    energyIdx: number
  }>

  const restMode = options?.restMode ?? false

  for (const win of windows) {
    let energyRaw = win.energy ? String(win.energy).toUpperCase().trim() : ''
    if (restMode) {
      energyRaw = energyRaw === 'NO' ? 'NO' : 'LOW'
    }
    const hasEnergyLabel = energyRaw.length > 0
    const energyLabel = hasEnergyLabel ? energyRaw : null
    const energyIdx = hasEnergyLabel
      ? energyIndex(energyLabel, { fallback: ENERGY.LIST.length })
      : ENERGY.LIST.length
    if (hasEnergyLabel && energyIdx >= ENERGY.LIST.length) continue
    const requireExactEnergy = options?.matchEnergyLevel ?? false
    if (requireExactEnergy) {
      if (!hasEnergyLabel) continue
      if (energyIdx !== itemIdx) continue
    } else if (energyIdx < itemIdx) {
      continue
    }

    const windowLocationRaw = win.location_context_value
      ? String(win.location_context_value).toUpperCase().trim()
      : null
    if (desiredLocation) {
      if (!windowLocationRaw) continue
      if (windowLocationRaw !== desiredLocation) continue
    }

    const startLocal = resolveWindowStart(win, date, timeZone)
    const endLocal = resolveWindowEnd(win, date, timeZone)
    const key = windowKey(win.id, startLocal)
    const startMs = startLocal.getTime()
    const endMs = endLocal.getTime()

    if (typeof nowMs === 'number' && endMs <= nowMs) continue

    let frontBoundMs = typeof nowMs === 'number' ? Math.max(startMs, nowMs) : startMs
    let backBoundMs = endMs

    if (daylight) {
      if (daylight.preference === 'DAY') {
        const sunriseMs = daylight.sunrise?.getTime()
        const sunsetMs = daylight.sunset?.getTime()
        if (typeof sunriseMs === 'number') {
          frontBoundMs = Math.max(frontBoundMs, sunriseMs)
        }
        if (typeof sunsetMs === 'number') {
          backBoundMs = Math.min(backBoundMs, sunsetMs)
        }
      } else if (daylight.preference === 'NIGHT') {
        const sunriseMs = daylight.sunrise?.getTime() ?? null
        const duskMs = daylight.dusk?.getTime() ?? daylight.sunset?.getTime() ?? null
        const previousDuskMs =
          daylight.previousDusk?.getTime() ?? duskMs ?? null
        const nextDawnMs = daylight.nextDawn?.getTime() ?? sunriseMs ?? null
        const isEarlyMorning =
          typeof sunriseMs === 'number' ? startMs < sunriseMs : false

        if (isEarlyMorning) {
          if (typeof previousDuskMs === 'number') {
            frontBoundMs = Math.max(frontBoundMs, previousDuskMs)
          }
          if (typeof sunriseMs === 'number') {
            backBoundMs = Math.min(backBoundMs, sunriseMs)
          }
        } else {
          if (typeof duskMs === 'number') {
            frontBoundMs = Math.max(frontBoundMs, duskMs)
          }
          if (typeof nextDawnMs === 'number') {
            backBoundMs = Math.min(backBoundMs, nextDawnMs)
          }
        }
      }
    }

    if (frontBoundMs >= backBoundMs) continue

    const existingBounds = availability?.get(key) ?? null
    if (existingBounds) {
      const nextFront = Math.max(frontBoundMs, existingBounds.front.getTime())
      const nextBack = Math.min(backBoundMs, existingBounds.back.getTime())
      if (nextFront >= nextBack) {
        existingBounds.front = new Date(nextBack)
        existingBounds.back = new Date(nextBack)
        continue
      }
      existingBounds.front = new Date(nextFront)
      existingBounds.back = new Date(nextBack)
      frontBoundMs = existingBounds.front.getTime()
      backBoundMs = existingBounds.back.getTime()
    } else if (availability) {
      setAvailabilityBoundsForKey(availability, key, frontBoundMs, backBoundMs)
    }

    if (frontBoundMs >= backBoundMs) continue

    const endLimitMs = backBoundMs
    const endLimitLocal = new Date(endLimitMs)

    let candidateStartMs: number
    if (anchorPreference === 'BACK') {
      candidateStartMs = backBoundMs - durationMs
      if (candidateStartMs < startMs) {
        candidateStartMs = startMs
      }
    } else {
      candidateStartMs = frontBoundMs
    }

    if (candidateStartMs < frontBoundMs) {
      candidateStartMs = frontBoundMs
    }

    const candidateEndMs = candidateStartMs + durationMs
    if (candidateEndMs > backBoundMs) continue

    const availableStartLocal = new Date(candidateStartMs)

    compatible.push({
      id: win.id,
      key,
      startLocal,
      endLocal: endLimitLocal,
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

function setAvailabilityBoundsForKey(
  availability: Map<string, WindowAvailabilityBounds>,
  key: string,
  frontMs: number,
  backMs: number,
) {
  const safeFront = Number.isFinite(frontMs) ? frontMs : backMs
  const safeBack = Number.isFinite(backMs) ? backMs : frontMs
  const normalizedFront = Math.min(safeFront, safeBack)
  const normalizedBack = Math.max(safeFront, safeBack)
  const front = new Date(normalizedFront)
  const back = new Date(normalizedBack)
  const existing = availability.get(key)
  if (existing) {
    existing.front = front
    existing.back = back
  } else {
    availability.set(key, { front, back })
  }
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
