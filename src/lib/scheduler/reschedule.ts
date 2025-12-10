import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type { Database } from '../../../types/supabase'
import {
  fetchBacklogNeedingSchedule,
  cleanupTransientInstances,
  fetchInstancesForRange,
  type ScheduleInstance,
} from './instanceRepo'
import { buildProjectItems, DEFAULT_PROJECT_DURATION_MIN } from './projects'
import {
  fetchReadyTasks,
  fetchWindowsForDate,
  fetchWindowsSnapshot,
  fetchProjectsMap,
  fetchProjectSkillsForProjects,
  fetchGoalsForUser,
  windowsForDateFromSnapshot,
  type WindowLite,
  type WindowKind,
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
import {
  normalizeCoordinates,
  resolveSunlightBounds,
  type GeoCoordinates,
  type SunlightBounds,
} from './sunlight'
import { normalizeSchedulerModePayload, type SchedulerModePayload } from './modes'

type Client = SupabaseClient<Database>

const START_GRACE_MIN = 1
const BASE_LOOKAHEAD_DAYS = 28
const LOOKAHEAD_PER_ITEM_DAYS = 7
const MAX_LOOKAHEAD_DAYS = 365
const HABIT_WRITE_LOOKAHEAD_DAYS = BASE_LOOKAHEAD_DAYS
const LOCATION_CLEANUP_DAYS = 7
const COMPLETED_RETENTION_DAYS = 3

const HABIT_TYPE_PRIORITY: Record<string, number> = {
  CHORE: 0,
  HABIT: 1,
  RELAXER: 1,
  PRACTICE: 1,
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
  locked?: boolean
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
  instanceId?: string
}

type ScheduleDraftPlacement = ProjectDraftPlacement | HabitDraftPlacement

type HabitScheduleDayResult = {
  placements: HabitDraftPlacement[]
  instances: ScheduleInstance[]
  failures: ScheduleFailure[]
}

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

const normalizeLocationContextValue = (value?: string | null) => {
  if (typeof value !== 'string') return null
  const normalized = value.toUpperCase().trim()
  if (!normalized || normalized === 'ANY') return null
  return normalized
}

const doesWindowMatchHabitLocation = (
  habit: HabitScheduleItem | undefined,
  windowRecord: WindowLite | null,
) => {
  if (!windowRecord) return true
  const windowLocationId =
    typeof windowRecord.location_context_id === 'string' &&
    windowRecord.location_context_id.trim().length > 0
      ? windowRecord.location_context_id.trim()
      : null
  const windowLocationValue = normalizeLocationContextValue(
    windowRecord.location_context_value ?? null,
  )
  const windowRequiresLocation = Boolean(windowLocationId || windowLocationValue)
  if (!windowRequiresLocation) return true
  if (!habit) return false
  const habitLocationId =
    typeof habit.locationContextId === 'string' && habit.locationContextId.trim().length > 0
      ? habit.locationContextId.trim()
      : null
  const habitLocationValue = normalizeLocationContextValue(habit.locationContextValue ?? null)
  const habitHasLocation = Boolean(habitLocationId || habitLocationValue)
  if (!habitHasLocation) return false
  if (habitLocationId) {
    return windowLocationId === habitLocationId
  }
  return habitLocationValue ? windowLocationValue === habitLocationValue : true
}

const normalizeHabitTypeValue = (value?: string | null) => {
  const raw = (value ?? 'HABIT').toUpperCase()
  return raw === 'ASYNC' ? 'SYNC' : raw
}

const doesWindowAllowHabitType = (
  habit: HabitScheduleItem | undefined,
  windowRecord: WindowLite | null,
) => {
  if (!windowRecord) return true
  const kind: WindowKind = windowRecord.window_kind ?? 'DEFAULT'
  if (kind === 'BREAK') {
    return normalizeHabitTypeValue(habit?.habitType) === 'RELAXER'
  }
  if (kind === 'PRACTICE') {
    return normalizeHabitTypeValue(habit?.habitType) === 'PRACTICE'
  }
  return true
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
    writeThroughDays?: number | null
    utcOffsetMinutes?: number | null
  }
): Promise<ScheduleBacklogResult> {
  const supabase = await ensureClient(client)
  const result: ScheduleBacklogResult = { placed: [], failures: [], timeline: [] }
  const timeZone = normalizeTimeZone(options?.timeZone)
  const location = normalizeCoordinates(options?.location ?? null)
  const mode = normalizeSchedulerModePayload(options?.mode ?? { type: 'REGULAR' })
  const isRushMode = mode.type === 'RUSH'
  const isRestMode = mode.type === 'REST'
  const restrictProjectsToToday = mode.type === 'SKILLED'
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
  const timeZoneOffsetMinutes =
    typeof options?.utcOffsetMinutes === 'number' && Number.isFinite(options.utcOffsetMinutes)
      ? options.utcOffsetMinutes
      : null

  const missed = await fetchBacklogNeedingSchedule(userId, supabase)
  if (missed.error) {
    result.error = missed.error
    return result
  }

  const tasks = await fetchReadyTasks(supabase)
  const projectsMap = await fetchProjectsMap(supabase)
  const goals = await fetchGoalsForUser(userId, supabase)
  const habits = await fetchHabitsForSchedule(userId, supabase)
  const habitAllowsOverlap = new Map<string, boolean>()
  const habitById = new Map<string, HabitScheduleItem>()
  for (const habit of habits) {
    const normalizedType = (habit.habitType ?? 'HABIT').toUpperCase()
    habitAllowsOverlap.set(habit.id, normalizedType === 'SYNC')
    habitById.set(habit.id, habit)
  }
  const habitLastScheduledStart = new Map<string, Date>()
  const recordHabitScheduledStart = (
    habitId: string | null | undefined,
    startInput: Date | string | null | undefined
  ) => {
    if (!habitId || !startInput) return
    const start =
      startInput instanceof Date ? new Date(startInput.getTime()) : new Date(startInput ?? '')
    if (Number.isNaN(start.getTime())) return
    const normalized = startOfDayInTimeZone(start, timeZone)
    const previous = habitLastScheduledStart.get(habitId)
    if (!previous || normalized.getTime() > previous.getTime()) {
      habitLastScheduledStart.set(habitId, normalized)
    }
  }
  const getHabitLastScheduledStart = (habitId: string) => habitLastScheduledStart.get(habitId) ?? null
  let windowSnapshot: WindowLite[] | null = null
  try {
    windowSnapshot = await fetchWindowsSnapshot(userId, supabase)
  } catch (_error) {
    windowSnapshot = null
  }
  const goalWeightsById = goals.reduce<Record<string, number>>((acc, goal) => {
    acc[goal.id] = goal.weight ?? 0
    return acc
  }, {})
  const projectItems = buildProjectItems(Object.values(projectsMap), tasks, goalWeightsById)

  const projectItemMap: Record<string, (typeof projectItems)[number]> = {}
  for (const item of projectItems) projectItemMap[item.id] = item

  const taskSkillsByProjectId = new Map<string, Set<string>>()
  for (const task of tasks) {
    const projectId = task.project_id ?? null
    if (!projectId) continue
    if (task.skill_id) {
      const existing = taskSkillsByProjectId.get(projectId) ?? new Set<string>()
      existing.add(task.skill_id)
      taskSkillsByProjectId.set(projectId, existing)
    }
  }

  let projectSkillsMap: Record<string, string[]> = {}
  if (mode.type === 'SKILLED') {
    try {
      const projectIds = Object.keys(projectsMap)
      if (projectIds.length > 0) {
        projectSkillsMap = await fetchProjectSkillsForProjects(projectIds, supabase)
      }
    } catch (error) {
      console.error('Failed to fetch project skill links for scheduler mode', error)
      projectSkillsMap = {}
    }
  }

  const projectSkillIdsCache = new Map<string, string[]>()
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
  const goalMonumentById = new Map<string, string | null>()
  for (const goal of goals) {
    goalMonumentById.set(goal.id, goal.monumentId ?? null)
  }
  const getProjectGoalMonumentId = (projectId: string): string | null => {
    const project = projectsMap[projectId]
    if (!project) return null
    const goalId = project.goal_id ?? null
    if (!goalId) return null
    return goalMonumentById.get(goalId) ?? null
  }
  const projectMatchesSelectedMonument = (projectId: string): boolean => {
    if (mode.type !== 'MONUMENTAL') return false
    if (!mode.monumentId) return false
    const monumentId = getProjectGoalMonumentId(projectId)
    if (!monumentId) return false
    return monumentId === mode.monumentId
  }

  const matchesMode = (projectId: string): boolean => {
    if (mode.type === 'MONUMENTAL') {
      return true
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
    goalWeight: number
    instanceId?: string | null
    preferred?: boolean
    eventName: string
  }

  const queue: QueueItem[] = []
  const baseStart = startOfDayInTimeZone(baseDate, timeZone)
  const completedRetentionStart = startOfDayInTimeZone(
    addDaysInTimeZone(baseDate, -COMPLETED_RETENTION_DAYS, timeZone),
    timeZone
  )
  const completedRetentionStartMs = completedRetentionStart.getTime()
  const nowMs = baseDate.getTime()
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
      goalWeight: def.goalWeight ?? 0,
      instanceId: m.id,
      eventName: def.name || def.id,
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
      goalWeight: def.goalWeight ?? 0,
      preferred: projectMatchesSelectedMonument(def.id),
      eventName: def.name || def.id,
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
  const requestedWriteThroughDays = options?.writeThroughDays ?? null
  const persistedDayLimit = (() => {
    if (requestedWriteThroughDays === null || requestedWriteThroughDays === undefined) {
      return lookaheadDays
    }
    const coerced = Math.floor(Number(requestedWriteThroughDays))
    if (!Number.isFinite(coerced) || coerced < 0) return lookaheadDays
    return Math.min(lookaheadDays, coerced)
  })()
  const habitWriteLookaheadDays = Math.min(lookaheadDays, HABIT_WRITE_LOOKAHEAD_DAYS)
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
  const lockedProjectInstances = dedupe.lockedProjectInstances
  if (lockedProjectInstances.size > 0) {
    for (const projectId of lockedProjectInstances.keys()) {
      queuedProjectIds.delete(projectId)
      finalQueueProjectIds.delete(projectId)
    }
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const item = queue[index]
      if (lockedProjectInstances.has(item.id)) {
        queue.splice(index, 1)
      }
    }
  }
  collectPrimaryReuseIds(dedupe.reusableByProject)
  collectReuseIds(dedupe.canceledByProject)
  const keptInstances = [...dedupe.keepers]
  const keptInstancesByProject = new Map<string, ScheduleInstance>()
  const habitScheduledDatesById = new Map<string, Date[]>()
  for (const instance of dedupe.allInstances) {
    if (!instance || instance.source_type !== 'HABIT') continue
    if (!instance.source_id) continue
    if (!instance.start_utc) continue
    const start = new Date(instance.start_utc)
    if (Number.isNaN(start.getTime())) continue
    const normalized = startOfDayInTimeZone(start, timeZone)
    const list = habitScheduledDatesById.get(instance.source_id)
    if (list) {
      list.push(normalized)
    } else {
      habitScheduledDatesById.set(instance.source_id, [normalized])
    }
  }
  for (const [habitId, dates] of habitScheduledDatesById) {
    dates.sort((a, b) => a.getTime() - b.getTime())
    const baseStartMs = baseStart.getTime()
    for (const start of dates) {
      const startMs = start.getTime()
      if (startMs >= baseStartMs) break
      recordHabitScheduledStart(habitId, start)
    }
  }

  const dayInstancesByOffset = new Map<number, ScheduleInstance[]>()

  const getDayInstances = (offset: number) => {
    let existing = dayInstancesByOffset.get(offset)
    if (!existing) {
      existing = []
      dayInstancesByOffset.set(offset, existing)
    }
    return existing
  }

  const removeInstanceFromBuckets = (id: string | null | undefined) => {
    if (!id) return
    for (const bucket of dayInstancesByOffset.values()) {
      const index = bucket.findIndex(inst => inst.id === id)
      if (index >= 0) {
        bucket.splice(index, 1)
      }
    }
  }


  const overlaps = (a: ScheduleInstance, b: ScheduleInstance) => {
    const aStart = new Date(a.start_utc ?? '').getTime()
    const aEnd = new Date(a.end_utc ?? '').getTime()
    const bStart = new Date(b.start_utc ?? '').getTime()
    const bEnd = new Date(b.end_utc ?? '').getTime()
    if (!Number.isFinite(aStart) || !Number.isFinite(aEnd) || !Number.isFinite(bStart) || !Number.isFinite(bEnd)) {
      return false
    }
    return aEnd > bStart && aStart < bEnd
  }

  const allowsOverlap = (
    a: ScheduleInstance,
    b: ScheduleInstance,
    habitOverlapMap: Map<string, boolean>
  ) => {
    if (a.source_type !== 'HABIT' || b.source_type !== 'HABIT') {
      return false
    }
    const aId = a.source_id ?? ''
    const bId = b.source_id ?? ''
    return habitOverlapMap.get(aId) === true && habitOverlapMap.get(bId) === true
  }

  const projectWeightForInstance = (instance: ScheduleInstance): number => {
    if (typeof instance?.weight_snapshot === 'number') {
      return instance.weight_snapshot
    }
    const projectId = instance?.source_id ?? ''
    if (!projectId) return 0
    const def = projectItemMap[projectId]
    return typeof def?.weight === 'number' ? def.weight : 0
  }

  const collectProjectOverlapConflicts = (
    instances: ScheduleInstance[],
    habitOverlapMap: Map<string, boolean>
  ) => {
    const conflicts: ScheduleInstance[] = []
    const seen = new Set<string>()
    const sorted = instances
      .filter(inst => inst && inst.status === 'scheduled')
      .sort(
        (a, b) => new Date(a.start_utc ?? '').getTime() - new Date(b.start_utc ?? '').getTime()
      )

    let last: ScheduleInstance | null = null
    for (const current of sorted) {
      if (!last) {
        last = current
        continue
      }
      if (!overlaps(last, current)) {
        last = current
        continue
      }
      if (allowsOverlap(last, current, habitOverlapMap)) {
        last = new Date(last.end_utc ?? '').getTime() >= new Date(current.end_utc ?? '').getTime()
          ? last
          : current
        continue
      }
      let removal: ScheduleInstance | null = null
      const lastIsProject = last.source_type === 'PROJECT'
      const currentIsProject = current.source_type === 'PROJECT'
      const lastLocked = last.locked === true
      const currentLocked = current.locked === true
      if (lastLocked && currentLocked) {
        last = new Date(last.end_utc ?? '').getTime() >= new Date(current.end_utc ?? '').getTime()
          ? last
          : current
        continue
      }
      if (lastLocked && currentIsProject) {
        removal = current
      } else if (currentLocked && lastIsProject) {
        removal = last
      } else {
        if (lastIsProject && !currentIsProject) {
          removal = last
        } else if (!lastIsProject && currentIsProject) {
          removal = current
        } else if (lastIsProject && currentIsProject) {
          const lastWeight = projectWeightForInstance(last)
          const currentWeight = projectWeightForInstance(current)
          if (lastWeight < currentWeight) {
            removal = last
          } else if (currentWeight < lastWeight) {
            removal = current
          } else {
            const lastStart = new Date(last.start_utc ?? '').getTime()
            const currentStart = new Date(current.start_utc ?? '').getTime()
            removal = currentStart < lastStart ? last : current
          }
        }
      }
      if (removal && removal.source_type === 'PROJECT' && !seen.has(removal.id)) {
        conflicts.push(removal)
        seen.add(removal.id)
        if (removal.id === last.id) {
          last = current
        }
      } else {
        last = new Date(last.end_utc ?? '').getTime() >= new Date(current.end_utc ?? '').getTime()
          ? last
          : current
      }
    }
    return conflicts
  }

  const buildProjectQueueItemFromInstance = (
    inst: ScheduleInstance
  ): QueueItem | null => {
    const projectId = inst.source_id ?? ''
    if (!projectId) return null
    const def = projectItemMap[projectId]
    if (!def) return null
    let duration = Number(inst.duration_min ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = Number(def.duration_min ?? 0)
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = DEFAULT_PROJECT_DURATION_MIN
    }
    const energyResolved =
      (inst.energy_resolved ?? def.energy ?? 'NO').toString().toUpperCase()
    return {
      id: projectId,
      sourceType: 'PROJECT',
      duration_min: duration,
      energy: energyResolved,
      weight: def.weight ?? 0,
      goalWeight: def.goalWeight ?? 0,
      instanceId: inst.id,
      preferred: projectMatchesSelectedMonument(projectId),
    }
  }

  const shouldRetainCompletedInstance = (instance: ScheduleInstance | null | undefined) => {
    if (!instance || instance.status !== 'completed') return false
    const startMs = new Date(instance.start_utc ?? '').getTime()
    const endMs = new Date(instance.end_utc ?? '').getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false
    if (startMs > nowMs && endMs > nowMs) {
      return false
    }
    if (endMs < completedRetentionStartMs) {
      return false
    }
    return true
  }

  const isBlockingInstance = (instance: ScheduleInstance | null | undefined) => {
    if (!instance) return false
    if (instance.status === 'scheduled') return true
    if (instance.status === 'completed') {
      return shouldRetainCompletedInstance(instance)
    }
    return false
  }

  const registerInstanceForOffsets = (instance: ScheduleInstance | null | undefined) => {
    if (!instance) return
    if (!instance.id) return

    removeInstanceFromBuckets(instance.id)

    if (!isBlockingInstance(instance)) {
      return
    }

    const start = new Date(instance.start_utc)
    const end = new Date(instance.end_utc)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return
    }

    const startDay = startOfDayInTimeZone(start, timeZone)
    const endReferenceMs = Math.max(start.getTime(), end.getTime() - 1)
    if (endReferenceMs < baseStart.getTime()) {
      return
    }
    const endReference = new Date(endReferenceMs)
    const endDay = startOfDayInTimeZone(endReference, timeZone)

    let startOffset = differenceInCalendarDaysInTimeZone(baseStart, startDay, timeZone)
    let endOffset = differenceInCalendarDaysInTimeZone(baseStart, endDay, timeZone)

    if (!Number.isFinite(startOffset)) startOffset = 0
    if (!Number.isFinite(endOffset)) endOffset = startOffset

    if (endOffset < startOffset) {
      endOffset = startOffset
    }

    if (startOffset < 0) {
      startOffset = 0
    }

    if (endOffset >= lookaheadDays) {
      endOffset = lookaheadDays - 1
    }

    for (let offset = startOffset; offset <= endOffset; offset += 1) {
      if (offset < 0 || offset >= lookaheadDays) continue
      const bucket = getDayInstances(offset)
      upsertInstance(bucket, instance)
    }
  }

  const completedProjectIds = new Set<string>()

  for (const inst of dedupe.allInstances) {
    if (
      inst?.source_type === 'PROJECT' &&
      inst.status === 'completed' &&
      typeof inst.source_id === 'string' &&
      inst.source_id &&
      shouldRetainCompletedInstance(inst)
    ) {
      completedProjectIds.add(inst.source_id)
    }
    registerInstanceForOffsets(inst)
  }

  if (completedProjectIds.size > 0) {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const item = queue[index]
      if (completedProjectIds.has(item.id)) {
        queue.splice(index, 1)
      }
    }
  }

  for (const inst of keptInstances) {
    const projectId = inst.source_id ?? ''
    if (!projectId) continue
    keptInstancesByProject.set(projectId, inst)
    if (inst.locked !== true) {
      registerReuseInstance(projectId, inst.id)
    }
  }

  for (const item of queue) {
    if (item.instanceId) continue
    const reuseId = reuseInstanceByProject.get(item.id)
    if (!reuseId) continue
    item.instanceId = reuseId
    reuseInstanceByProject.delete(item.id)
  }

  const compareQueueItems = (a: QueueItem, b: QueueItem) => {
    const preferredDiff =
      Number(b.preferred === true) - Number(a.preferred === true)
    if (preferredDiff !== 0) return preferredDiff
    const goalWeightDiff = b.goalWeight - a.goalWeight
    if (goalWeightDiff !== 0) return goalWeightDiff
    const weightDiff = b.weight - a.weight
    if (weightDiff !== 0) return weightDiff
    const energyDiff = energyIndex(b.energy) - energyIndex(a.energy)
    if (energyDiff !== 0) return energyDiff
    return a.id.localeCompare(b.id)
  }

  queue.sort(compareQueueItems)

  const windowAvailabilityByDay = new Map<
    number,
    Map<string, WindowAvailabilityBounds>
  >()
  const windowCache = new Map<string, WindowLite[]>()
  const pendingWindowLoads = new Map<string, Promise<void>>()
  const activeTimeZone = timeZone ?? 'UTC'
  const prepareWindowsForDay = async (day: Date) => {
    const cacheKey = dateCacheKey(day)
    if (windowCache.has(cacheKey)) return
    if (windowSnapshot !== null) {
      windowCache.set(
        cacheKey,
        windowsForDateFromSnapshot(windowSnapshot, day, activeTimeZone)
      )
      return
    }

    let pending = pendingWindowLoads.get(cacheKey)
    if (!pending) {
      pending = (async () => {
        const windows = await fetchWindowsForDate(day, supabase, activeTimeZone, {
          userId,
        })
        windowCache.set(cacheKey, windows)
      })()
      pendingWindowLoads.set(cacheKey, pending)
    }

    try {
      await pending
    } finally {
      pendingWindowLoads.delete(cacheKey)
    }
  }
  const getWindowsForDay = (day: Date) => {
    const cacheKey = dateCacheKey(day)
    const cached = windowCache.get(cacheKey)
    if (cached) return cached
    if (windowSnapshot !== null) {
      const windows = windowsForDateFromSnapshot(windowSnapshot, day, activeTimeZone)
      windowCache.set(cacheKey, windows)
      return windows
    }
    return []
  }
  const habitPlacementsByOffset = new Map<number, HabitScheduleDayResult>()

  const ensureHabitPlacementsForDay = async (
    offset: number,
    day: Date,
    availability: Map<string, WindowAvailabilityBounds>
  ) => {
    const cached = habitPlacementsByOffset.get(offset)
    if (cached) {
      return cached
    }

    await prepareWindowsForDay(day)
    const existingInstances = getDayInstances(offset)

    const dayResult = await scheduleHabitsForDay({
      userId,
      habits,
      day,
      offset,
      timeZone,
      availability,
      baseDate,
      windowCache,
      client: supabase,
      sunlightLocation: location,
      timeZoneOffsetMinutes,
      durationMultiplier,
      restMode: isRestMode,
      existingInstances,
        registerInstance: registerInstanceForOffsets,
        getWindowsForDay,
        getLastScheduledHabitStart: getHabitLastScheduledStart,
        recordHabitScheduledStart,
        habitMap: habitById,
      })

    if (dayResult.placements.length > 0) {
      result.timeline.push(...dayResult.placements)
    }
    if (dayResult.instances.length > 0) {
      result.placed.push(...dayResult.instances)
    }
    if (dayResult.failures.length > 0) {
      result.failures.push(...dayResult.failures)
    }

    habitPlacementsByOffset.set(offset, dayResult)
    return dayResult
  }

  const scheduledProjectIds = new Set<string>()
  const maxOffset = restrictProjectsToToday
    ? Math.min(Math.max(persistedDayLimit, 1), 1)
    : persistedDayLimit
  const cleanupOffsetLimit = Math.max(
    maxOffset,
    Math.min(persistedDayLimit, LOCATION_CLEANUP_DAYS),
  )

  for (let offset = 0; offset < cleanupOffsetLimit; offset += 1) {
    let windowAvailability = windowAvailabilityByDay.get(offset)
    if (!windowAvailability) {
      windowAvailability = new Map<string, WindowAvailabilityBounds>()
      windowAvailabilityByDay.set(offset, windowAvailability)
    }

    const day = offset === 0 ? baseStart : addDaysInTimeZone(baseStart, offset, timeZone)
    await prepareWindowsForDay(day)
    const dayInstances = getDayInstances(offset)
    const allowSchedulingToday = offset < maxOffset
    const shouldScheduleHabits =
      allowSchedulingToday &&
      offset < habitWriteLookaheadDays &&
      offset < persistedDayLimit
    if (shouldScheduleHabits) {
      await ensureHabitPlacementsForDay(offset, day, windowAvailability)
    } else {
      const hasHabitInstances = dayInstances.some(
        inst => inst?.source_type === 'HABIT' && inst.status === 'scheduled',
      )
      if (hasHabitInstances) {
        const cleanupResult = await scheduleHabitsForDay({
          userId,
          habits,
          day,
          offset,
          timeZone,
          availability: windowAvailability,
          baseDate,
          windowCache,
          client: supabase,
          sunlightLocation: location,
          timeZoneOffsetMinutes,
          durationMultiplier,
          restMode: isRestMode,
          existingInstances: dayInstances,
          registerInstance: registerInstanceForOffsets,
          getWindowsForDay,
          getLastScheduledHabitStart: getHabitLastScheduledStart,
          recordHabitScheduledStart,
          habitMap: habitById,
          allowScheduling: false,
        })
        if (cleanupResult.failures.length > 0) {
          result.failures.push(...cleanupResult.failures)
        }
      }
    }
    const dayWindows = getWindowsForDay(day)
    if (allowSchedulingToday) {
      const conflictProjects = collectProjectOverlapConflicts(dayInstances, habitAllowsOverlap)
      for (const conflict of conflictProjects) {
        const resolution = await attemptProjectConflictPlacement(conflict, {
          day,
          offset,
          dayInstances,
          dayWindows,
          windowAvailability,
          scheduledProjectIds,
          projectItemMap,
          supabase,
          timeZone,
          baseDate,
          restMode: isRestMode,
          windowCache,
          userId,
          result,
          dayOffsetFor,
          registerInstanceForOffsets,
          projectMatchesMonument: projectMatchesSelectedMonument,
        })
        if (resolution === 'NO_WINDOW' || resolution === 'NO_FIT') {
          result.failures.push({
            itemId: conflict.source_id ?? conflict.id,
            reason: resolution,
          })
        }
      }

      for (const item of queue) {
        if (scheduledProjectIds.has(item.id)) continue

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
            userId,
            preloadedWindows: dayWindows,
            allowedWindowKinds: ['DEFAULT'],
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
          ignoreProjectIds: new Set([item.id]),
          notBefore: offset === 0 ? baseDate : undefined,
          existingInstances: dayInstances.length > 0 ? dayInstances : undefined,
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
          keptInstancesByProject.delete(item.id)
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
            locked: placed.data.locked ?? undefined,
          })
          scheduledProjectIds.add(item.id)

          if (item.instanceId) {
            removeInstanceFromBuckets(item.instanceId)
          }
          upsertInstance(dayInstances, placed.data)
          registerInstanceForOffsets(placed.data)
        }
      }
    }
  }

  for (const [projectId, inst] of keptInstancesByProject) {
    scheduledProjectIds.add(projectId)
    result.timeline.push({
      type: 'PROJECT',
      instance: inst,
      projectId,
      decision: 'kept',
      scheduledDayOffset: dayOffsetFor(inst.start_utc) ?? undefined,
      locked: inst.locked ?? undefined,
    })
  }

  if (persistedDayLimit >= lookaheadDays) {
    for (const item of queue) {
      if (!scheduledProjectIds.has(item.id)) {
        result.failures.push({ itemId: item.id, reason: 'NO_WINDOW' })
      }
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

  if (typeof supabase.from === 'function') {
    const cleanupResult = await cleanupTransientInstances(userId, supabase)
    if (cleanupResult.error) {
      result.failures.push({
        itemId: 'cleanup-transient-instances',
        reason: 'error',
        detail: cleanupResult.error,
      })
    }
  }

  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.SCHEDULER_DEBUG === 'true'
  ) {
    const habitTimeline = result.timeline.filter(entry => entry.type === 'HABIT')
    if (result.failures.length > 0 || habitTimeline.length > 0) {
      console.info('scheduleBacklog result:', {
        failures: result.failures,
        habitTimeline,
      })
    }
  }

  return result
}

type DedupeResult = {
  scheduled: Set<string>
  keepers: ScheduleInstance[]
  failures: ScheduleFailure[]
  error: PostgrestError | null
  canceledByProject: Map<string, string[]>
  reusableByProject: Map<string, string>
  allInstances: ScheduleInstance[]
  lockedProjectInstances: Map<string, ScheduleInstance>
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
      allInstances: [],
      lockedProjectInstances: new Map(),
    }
  }

  const allInstances = ((response.data ?? []) as ScheduleInstance[]).filter(
    (inst): inst is ScheduleInstance => Boolean(inst)
  )

  const keepers = new Map<string, ScheduleInstance>()
  const reusableCandidates = new Map<string, ScheduleInstance>()
  const extras: ScheduleInstance[] = []
  const lockedProjectInstances = new Map<string, ScheduleInstance>()

  for (const inst of allInstances) {
    const isProject = inst.source_type === 'PROJECT'
    const projectId = inst.source_id ?? ''
    if (!isProject || !projectId) continue
    if (inst.status !== 'scheduled') continue
    const isLockedProject = inst.locked === true

    if (projectsToReset.has(projectId)) {
      if (isLockedProject) {
        lockedProjectInstances.set(projectId, inst)
        keepers.set(projectId, inst)
        continue
      }
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

    if (isLockedProject) {
      const existingLocked = lockedProjectInstances.get(projectId)
      if (existingLocked) {
        const existingStart = new Date(existingLocked.start_utc).getTime()
        const instStart = new Date(inst.start_utc).getTime()
        if (instStart < existingStart) {
          extras.push(existingLocked)
          lockedProjectInstances.set(projectId, inst)
          keepers.set(projectId, inst)
        } else {
          extras.push(inst)
        }
        continue
      }
      lockedProjectInstances.set(projectId, inst)
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
    extra.status = 'canceled'
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
    allInstances,
    lockedProjectInstances,
  }
}

async function scheduleHabitsForDay(params: {
  userId: string
  habits: HabitScheduleItem[]
  day: Date
  offset: number
  timeZone: string
  availability: Map<string, WindowAvailabilityBounds>
  baseDate: Date
  windowCache: Map<string, WindowLite[]>
  client: Client
  sunlightLocation?: GeoCoordinates | null
  timeZoneOffsetMinutes?: number | null
  durationMultiplier?: number
  restMode?: boolean
  existingInstances: ScheduleInstance[]
  registerInstance: (instance: ScheduleInstance) => void
  getWindowsForDay: (day: Date) => WindowLite[]
  getLastScheduledHabitStart: (habitId: string) => Date | null
  recordHabitScheduledStart: (habitId: string, start: Date | string) => void
  habitMap: Map<string, HabitScheduleItem>
  allowScheduling?: boolean
}): Promise<HabitScheduleDayResult> {
  const {
    userId,
    habits,
    day,
    offset,
    timeZone,
    availability,
    baseDate,
    windowCache,
    client,
    sunlightLocation,
    timeZoneOffsetMinutes = null,
    durationMultiplier = 1,
    restMode = false,
    existingInstances,
    registerInstance,
    getWindowsForDay,
    getLastScheduledHabitStart,
    recordHabitScheduledStart,
    habitMap,
    allowScheduling = true,
  } = params

  const result: HabitScheduleDayResult = {
    placements: [],
    instances: [],
    failures: [],
  }
  const overridesToClear = new Set<string>()
  const parseNextDueOverride = (value?: string | null) => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  }
  const clearHabitOverrides = async () => {
    if (!client || overridesToClear.size === 0) return
    const ids = Array.from(overridesToClear)
    if (ids.length === 0) return
    try {
      await client
        .from('habits')
        .update({ next_due_override: null })
        .in('id', ids)
        .eq('user_id', userId)
    } catch (error) {
      console.error('Failed to clear habit due overrides', error)
    } finally {
      overridesToClear.clear()
    }
  }
  if (!habits.length) {
    await clearHabitOverrides()
    return result
  }

  const canceledInstanceIds = new Set<string>()
  const cancelScheduledInstance = async (instance: ScheduleInstance) => {
    if (!instance?.id) return false
    try {
      const cancel = await client
        .from("schedule_instances")
        .update({ status: "canceled" })
        .eq("id", instance.id)
        .select("id")
        .single()
      if (cancel.error) {
        result.failures.push({
          itemId: instance.source_id ?? instance.id,
          reason: "error",
          detail: cancel.error,
        })
        return false
      }
      canceledInstanceIds.add(instance.id)
      return true
    } catch (error) {
      console.error("Failed to cancel habit instance during revalidation", error)
      result.failures.push({
        itemId: instance.source_id ?? instance.id,
        reason: "error",
        detail: error,
      })
      return false
    }
  }

  const zone = timeZone || 'UTC'
  const dayStart = startOfDayInTimeZone(day, zone)
  const defaultDueMs = dayStart.getTime()
  const baseNowMs = offset === 0 ? baseDate.getTime() : null
  const anchorStartsByWindowKey = new Map<string, number[]>()
  const dueInfoByHabitId = new Map<string, HabitDueEvaluation>()
  const existingByHabitId = new Map<string, ScheduleInstance>()
  const scheduledHabitBuckets = new Map<string, ScheduleInstance[]>()
  const carryoverInstances: ScheduleInstance[] = []
  const duplicatesToCancel: ScheduleInstance[] = []
  const syncUsageByWindow = new Map<string, { start: number; end: number }[]>()
  const anchorSegmentsByWindowKey = new Map<string, { start: number; end: number }[]>()
  const habitTypeById = new Map<string, string>()
  for (const habit of habits) {
    habitTypeById.set(habit.id, (habit.habitType ?? 'HABIT').toUpperCase())
  }

  const addSyncUsage = (key: string, startMs: number, endMs: number) => {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return
    const normalizedStart = Math.floor(startMs)
    const normalizedEnd = Math.floor(endMs)
    const existing = syncUsageByWindow.get(key)
    if (!existing) {
      syncUsageByWindow.set(key, [{ start: normalizedStart, end: normalizedEnd }])
      return
    }
    const nearDuplicate = existing.some(
      segment =>
        Math.abs(segment.start - normalizedStart) < 30 &&
        Math.abs(segment.end - normalizedEnd) < 30
    )
    if (nearDuplicate) return
    let inserted = false
    for (let index = 0; index < existing.length; index += 1) {
      if (normalizedStart < existing[index].start) {
        existing.splice(index, 0, { start: normalizedStart, end: normalizedEnd })
        inserted = true
        break
      }
    }
    if (!inserted) {
      existing.push({ start: normalizedStart, end: normalizedEnd })
    }
  }

  const addAnchorSegment = (
    key: string,
    startMs: number,
    endMs: number,
  ) => {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return
    const normalizedStart = Math.floor(startMs)
    const normalizedEnd = Math.floor(endMs)
    if (normalizedEnd <= normalizedStart) return
    const existing = anchorSegmentsByWindowKey.get(key)
    if (!existing) {
      anchorSegmentsByWindowKey.set(key, [{ start: normalizedStart, end: normalizedEnd }])
      return
    }
    const nearDuplicate = existing.some(
      segment =>
        Math.abs(segment.start - normalizedStart) < 30 &&
        Math.abs(segment.end - normalizedEnd) < 30
    )
    if (nearDuplicate) return
    let inserted = false
    for (let index = 0; index < existing.length; index += 1) {
      if (normalizedStart < existing[index].start) {
        existing.splice(index, 0, { start: normalizedStart, end: normalizedEnd })
        inserted = true
        break
      }
    }
    if (!inserted) {
      existing.push({ start: normalizedStart, end: normalizedEnd })
    }
  }

  const hasSyncOverlap = (
    startMs: number,
    endMs: number,
    segments: { start: number; end: number }[]
  ) => segments.some(segment => endMs > segment.start && startMs < segment.end)

  const findFirstSyncConflict = (
    startMs: number,
    endMs: number,
    segments: { start: number; end: number }[]
  ) => segments.find(segment => endMs > segment.start && startMs < segment.end) ?? null

  for (const inst of existingInstances) {
    if (!inst) continue
    if (inst.source_type !== 'HABIT' || inst.status !== 'scheduled') {
      carryoverInstances.push(inst)
      continue
    }
    const habitId = inst.source_id ?? null
    if (!habitId) {
      carryoverInstances.push(inst)
      continue
    }
    const bucket = scheduledHabitBuckets.get(habitId)
    if (bucket) {
      bucket.push(inst)
    } else {
      scheduledHabitBuckets.set(habitId, [inst])
    }
  }

  const startValueForInstance = (instance: ScheduleInstance) => {
    const time = new Date(instance.start_utc ?? '').getTime()
    return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
  }

  for (const [habitId, bucket] of scheduledHabitBuckets) {
    bucket.sort((a, b) => startValueForInstance(a) - startValueForInstance(b))
    const keeper = bucket.shift()
    if (keeper) {
      existingByHabitId.set(habitId, keeper)
      carryoverInstances.push(keeper)
    }
    for (const duplicate of bucket) {
      duplicatesToCancel.push(duplicate)
    }
  }

  existingInstances.length = 0
  for (const inst of carryoverInstances) {
    existingInstances.push(inst)
  }

  const dayInstances = existingInstances
    .map(inst => ({ ...inst }))
    .filter(inst => !canceledInstanceIds.has(inst?.id ?? ""))

  const cacheKey = dateCacheKey(day)
  let windows = windowCache.get(cacheKey)
  if (!windows) {
    windows = getWindowsForDay(day)
    windowCache.set(cacheKey, windows)
  }

  if (!windows || windows.length === 0) {
    await clearHabitOverrides()
    return result
  }

  const windowsById = new Map<string, WindowLite>()
  for (const win of windows) {
    windowsById.set(win.id, win)
  }

  const invalidHabitInstances: ScheduleInstance[] = []
  const locationMismatchInstances: ScheduleInstance[] = []
  const typeMismatchInstances: ScheduleInstance[] = []
  const seenInvalidIds = new Set<string>()
  for (let index = dayInstances.length - 1; index >= 0; index -= 1) {
    const instance = dayInstances[index]
    if (!instance) continue
    if (instance.source_type !== 'HABIT') continue
    if (instance.status !== 'scheduled') continue
    const habitId = instance.source_id ?? null
    if (!habitId) continue
    const habit = habitMap.get(habitId)
    if (!habit) continue
    const windowRecord = instance.window_id ? windowsById.get(instance.window_id) ?? null : null
    const hasLocationMatch = doesWindowMatchHabitLocation(habit, windowRecord)
    if (!hasLocationMatch) {
      if (!seenInvalidIds.has(instance.id ?? `${habitId}:location`)) {
        locationMismatchInstances.push(instance)
        seenInvalidIds.add(instance.id ?? `${habitId}:location`)
      }
      dayInstances.splice(index, 1)
      if (existingByHabitId.get(habitId)?.id === instance.id) {
        existingByHabitId.delete(habitId)
      }
      continue
    }
    const hasWindowTypeMatch = doesWindowAllowHabitType(habit, windowRecord)
    if (!hasWindowTypeMatch) {
      if (!seenInvalidIds.has(instance.id ?? `${habitId}:window_kind`)) {
        typeMismatchInstances.push(instance)
        seenInvalidIds.add(instance.id ?? `${habitId}:window_kind`)
      }
      dayInstances.splice(index, 1)
      if (existingByHabitId.get(habitId)?.id === instance.id) {
        existingByHabitId.delete(habitId)
      }
      continue
    }
    const nextDueOverride = parseNextDueOverride(habit.nextDueOverride)
    const instanceStart = new Date(instance.start_utc ?? '')
    if (Number.isNaN(instanceStart.getTime())) continue
    const instanceDayStart = startOfDayInTimeZone(instanceStart, zone)
    if (instanceDayStart.getTime() !== dayStart.getTime()) continue
    const windowDays = habit.window?.days ?? null
    const dueInfo = evaluateHabitDueOnDate({
      habit,
      date: instanceDayStart,
      timeZone: zone,
      windowDays,
      lastScheduledStart: getLastScheduledHabitStart(habitId),
      nextDueOverride,
    })
    if (!dueInfo.isDue) {
      if (!seenInvalidIds.has(instance.id ?? `${habitId}:${index}`)) {
        invalidHabitInstances.push(instance)
        seenInvalidIds.add(instance.id ?? `${habitId}:${index}`)
      }
      dayInstances.splice(index, 1)
      if (existingByHabitId.get(habitId)?.id === instance.id) {
        existingByHabitId.delete(habitId)
      }
      continue
    }
    recordHabitScheduledStart(habitId, instanceStart)
  }

  if (invalidHabitInstances.length > 0) {
    duplicatesToCancel.push(...invalidHabitInstances)
  }
  if (locationMismatchInstances.length > 0) {
    duplicatesToCancel.push(...locationMismatchInstances)
  }
  if (typeMismatchInstances.length > 0) {
    duplicatesToCancel.push(...typeMismatchInstances)
  }

  if (duplicatesToCancel.length > 0) {
    for (const duplicate of duplicatesToCancel) {
      if (!duplicate?.id) continue
      const cancel = await client
        .from('schedule_instances')
        .update({ status: 'canceled' })
        .eq('id', duplicate.id)
        .select('id')
        .single()

      if (cancel.error) {
        result.failures.push({
          itemId: duplicate.source_id ?? duplicate.id,
          reason: 'error',
          detail: cancel.error,
        })
      } else {
        duplicate.status = 'canceled'
      }
    }
  }

  if (!allowScheduling) {
    return result
  }

  const dueHabits: HabitScheduleItem[] = []
  for (const habit of habits) {
    const windowDays = habit.window?.days ?? null
    const nextDueOverride = parseNextDueOverride(habit.nextDueOverride)
    const overrideDayStart =
      nextDueOverride ? startOfDayInTimeZone(nextDueOverride, zone) : null
    const dueInfo = evaluateHabitDueOnDate({
      habit,
      date: day,
      timeZone: zone,
      windowDays,
      lastScheduledStart: getLastScheduledHabitStart(habit.id),
      nextDueOverride,
    })
    if (!dueInfo.isDue) continue
    if (
      overrideDayStart &&
      dayStart.getTime() >= overrideDayStart.getTime()
    ) {
      overridesToClear.add(habit.id)
    }
    dueInfoByHabitId.set(habit.id, dueInfo)
    dueHabits.push(habit)
  }

  if (dueHabits.length === 0) {
    await clearHabitOverrides()
    return result
  }

  const windowEntries = windows
    .map(win => {
      const startLocal = resolveWindowStart(win, day, zone)
      const endLocal = resolveWindowEnd(win, day, zone)
      const startMs = startLocal.getTime()
      const endMs = endLocal.getTime()
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return null
      }
      const key = windowKey(win.id, startLocal)
      return {
        window: win,
        startLocal,
        endLocal,
        startMs,
        endMs,
        key,
      }
    })
    .filter(
      (entry): entry is {
        window: WindowLite
        startLocal: Date
        endLocal: Date
        startMs: number
        endMs: number
        key: string
      } => entry !== null
    )

  const windowEntriesById = new Map<string, typeof windowEntries>()
  for (const entry of windowEntries) {
    addAnchorStart(anchorStartsByWindowKey, entry.key, entry.startMs)
    const existing = windowEntriesById.get(entry.window.id)
    if (existing) {
      existing.push(entry)
    } else {
      windowEntriesById.set(entry.window.id, [entry])
    }
  }

  if (windowEntries.length > 0 && dayInstances.length > 0) {
    const anchorableStatuses = new Set(['scheduled', 'completed', 'in_progress'])
    for (const instance of dayInstances) {
      if (!instance) continue
      if (!anchorableStatuses.has(instance.status ?? '')) continue
      const start = new Date(instance.start_utc ?? '')
      const end = new Date(instance.end_utc ?? '')
      const startMs = start.getTime()
      const endMs = end.getTime()
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        continue
      }
      const habitId = instance.source_id ?? null
      const habitType = habitId ? habitTypeById.get(habitId) ?? null : null
      const isSyncInstance = habitType === 'SYNC'
      const candidateEntries =
        (instance.window_id ? windowEntriesById.get(instance.window_id) : null) ?? windowEntries
      for (const entry of candidateEntries) {
        if (instance.window_id && entry.window.id !== instance.window_id) continue
        if (endMs <= entry.startMs || startMs >= entry.endMs) continue
        const anchorStart = Math.max(entry.startMs, startMs)
        if (anchorStart < entry.endMs) {
          addAnchorStart(anchorStartsByWindowKey, entry.key, anchorStart)
          if (isSyncInstance) {
            const segmentStart = Math.max(entry.startMs, startMs)
            const segmentEnd = Math.min(entry.endMs, endMs)
            addSyncUsage(entry.key, segmentStart, segmentEnd)
          } else {
            const segmentStart = Math.max(entry.startMs, startMs)
            const segmentEnd = Math.min(entry.endMs, endMs)
            addAnchorSegment(entry.key, segmentStart, segmentEnd)
          }
        }
      }
    }
  }

  const sunlightOptions =
    typeof timeZoneOffsetMinutes === 'number'
      ? { offsetMinutes: timeZoneOffsetMinutes }
      : undefined
  const sunlightToday = resolveSunlightBounds(day, zone, sunlightLocation, sunlightOptions)
  const previousDay = addDaysInTimeZone(day, -1, zone)
  const nextDay = addDaysInTimeZone(day, 1, zone)
  const sunlightPrevious = resolveSunlightBounds(
    previousDay,
    zone,
    sunlightLocation,
    sunlightOptions,
  )
  const sunlightNext = resolveSunlightBounds(
    nextDay,
    zone,
    sunlightLocation,
    sunlightOptions,
  )

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

  let existingInstance: ScheduleInstance | null = null
  for (const habit of sortedHabits) {
    existingInstance = existingByHabitId.get(habit.id) ?? null
    const rawDuration = Number(habit.durationMinutes ?? 0)
    let durationMin =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? rawDuration
        : DEFAULT_HABIT_DURATION_MIN
    if (durationMultiplier !== 1) {
      durationMin = Math.max(1, Math.round(durationMin * durationMultiplier))
    }
    const baseDurationMs = durationMin * 60000
    if (baseDurationMs <= 0) continue
    let scheduledDurationMs = baseDurationMs

    const resolvedEnergy = (habit.energy ?? habit.window?.energy ?? 'NO').toUpperCase()
    const locationContextSource = habit.locationContextValue ?? habit.window?.locationContextValue ?? null
    const normalizedLocationContext =
      locationContextSource && typeof locationContextSource === 'string'
        ? locationContextSource.toUpperCase().trim()
        : null
    const locationContext = normalizedLocationContext === 'ANY' ? null : normalizedLocationContext
    const locationContextIdRaw = habit.locationContextId ?? habit.window?.locationContextId ?? null
    const locationContextId =
      typeof locationContextIdRaw === 'string' && locationContextIdRaw.trim().length > 0
        ? locationContextIdRaw.trim()
        : null
    const hasExplicitLocationContext =
      (typeof habit.locationContextId === 'string' && habit.locationContextId.trim().length > 0) ||
      (typeof habit.locationContextValue === 'string' &&
        habit.locationContextValue.trim().length > 0 &&
        habit.locationContextValue.toUpperCase().trim() !== 'ANY')
    const existingWindowRecord = existingInstance?.window_id
      ? windowsById.get(existingInstance.window_id) ?? null
      : null
    const existingWindowLocationId =
      typeof existingWindowRecord?.location_context_id === 'string' &&
      existingWindowRecord.location_context_id.trim().length > 0
        ? existingWindowRecord.location_context_id.trim()
        : null
    const existingWindowLocationValue =
      existingWindowRecord?.location_context_value &&
      existingWindowRecord.location_context_value.length > 0
        ? existingWindowRecord.location_context_value.toUpperCase().trim()
        : null
    const existingWindowHasLocation =
      Boolean(existingWindowLocationId) || Boolean(existingWindowLocationValue)
    const hasLocationMismatch =
      existingInstance &&
      hasExplicitLocationContext &&
      ((locationContextId && existingWindowLocationId !== locationContextId) ||
        (!locationContextId &&
          locationContext &&
          existingWindowLocationValue !== locationContext))
    const hasLocationlessMismatch =
      existingInstance && !hasExplicitLocationContext && existingWindowHasLocation
    const hasWindowTypeMismatch =
      existingInstance && !doesWindowAllowHabitType(habit, existingWindowRecord)
    if (hasLocationMismatch || hasLocationlessMismatch || hasWindowTypeMismatch) {
      if (await cancelScheduledInstance(existingInstance)) {
        existingByHabitId.delete(habit.id)
        existingInstance = null
      }
    }
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
            previousSunset: sunlightPrevious.sunset ?? null,
            previousDusk: sunlightPrevious.dusk ?? null,
            nextDawn: sunlightNext.dawn ?? sunlightNext.sunrise ?? null,
            nextSunrise: sunlightNext.sunrise ?? null,
          }
    const nightSunlightBundle =
      daylightConstraint?.preference === 'NIGHT'
        ? { today: sunlightToday, previous: sunlightPrevious, next: sunlightNext }
        : null
    const normalizedType = normalizeHabitTypeValue(habit.habitType)
    const isSyncHabit = normalizedType === 'SYNC'
    const allowsHabitOverlap = isSyncHabit
    const anchorRaw = habit.windowEdgePreference
      ? String(habit.windowEdgePreference).toUpperCase().trim()
      : 'FRONT'
    const anchorPreference = anchorRaw === 'BACK' ? 'BACK' : 'FRONT'
    const allowedWindowKinds: WindowKind[] =
      normalizedType === 'RELAXER'
        ? ['DEFAULT', 'BREAK']
        : normalizedType === 'PRACTICE'
          ? ['DEFAULT', 'PRACTICE']
          : ['DEFAULT']

    const attemptKeys = new Set<string>()
    const attemptQueue: Array<{
      locationId: string | null
      locationValue: string | null
      daylight: DaylightConstraint | null
    }> = []
    const enqueueAttempt = (
      locationId: string | null,
      locationValue: string | null,
      daylight: DaylightConstraint | null,
    ) => {
      const normalizedId =
        locationId && locationId.trim().length > 0 ? locationId.trim() : null
      const normalizedValue =
        locationValue && locationValue.length > 0
          ? locationValue.toUpperCase().trim()
          : null
      const key = `${normalizedId ?? 'null'}|${normalizedValue ?? 'null'}|${daylight?.preference ?? 'null'}`
      if (attemptKeys.has(key)) return
      attemptKeys.add(key)
      attemptQueue.push({ locationId: normalizedId, locationValue: normalizedValue, daylight })
    }

    const hasLocationRequirement = Boolean(locationContextId || locationContext)
    enqueueAttempt(locationContextId, locationContext, daylightConstraint)
    if (hasLocationRequirement) {
      enqueueAttempt(locationContextId, null, daylightConstraint)
      enqueueAttempt(null, locationContext, daylightConstraint)
    } else {
      enqueueAttempt(null, null, daylightConstraint)
    }
    if (daylightConstraint) {
      enqueueAttempt(locationContextId, locationContext, null)
      if (hasLocationRequirement) {
        enqueueAttempt(locationContextId, null, null)
        enqueueAttempt(null, locationContext, null)
      } else {
        enqueueAttempt(null, null, null)
      }
    }
    if (!hasLocationRequirement && !daylightConstraint) {
      enqueueAttempt(null, null, null)
    }

    let compatibleWindows: Array<{
      id: string
      key: string
      startLocal: Date
      endLocal: Date
      availableStartLocal: Date
    }> = []

    const nightEligibleWindows =
      daylightConstraint?.preference === 'NIGHT'
        ? windows.filter((win) =>
            windowOverlapsNightSpan(
              win,
              day,
              zone,
              sunlightToday,
              sunlightPrevious,
              sunlightNext,
            ),
          )
        : windows

    for (const attempt of attemptQueue) {
      const clonedAvailability = cloneAvailabilityMap(availability)
      const windowsForAttempt = await fetchCompatibleWindowsForItem(
        client,
        day,
        { energy: resolvedEnergy, duration_min: durationMin },
        zone,
        {
          availability: clonedAvailability,
          cache: windowCache,
          now: offset === 0 ? baseDate : undefined,
          locationContextId: attempt.locationId,
          locationContextValue: attempt.locationValue,
          daylight: attempt.daylight,
          ignoreAvailability: allowsHabitOverlap,
          anchor: anchorPreference,
          restMode,
          userId,
          enforceNightSpan: daylightConstraint?.preference === 'NIGHT',
          nightSunlight: nightSunlightBundle,
          requireLocationContextMatch: true,
          hasExplicitLocationContext,
          preloadedWindows:
            attempt.daylight?.preference === 'NIGHT'
              ? nightEligibleWindows
              : windows,
          allowedWindowKinds,
        }
      )
      if (windowsForAttempt.length > 0) {
        adoptAvailabilityMap(availability, clonedAvailability)
        compatibleWindows = windowsForAttempt
        break
      }
    }

    if (compatibleWindows.length === 0) {
      result.failures.push({ itemId: habit.id, reason: 'NO_WINDOW' })
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

    const desiredDurationMs = scheduledDurationMs
    const syncSegments = syncUsageByWindow.get(target.key) ?? []
    const anchorSegments = anchorSegmentsByWindowKey.get(target.key) ?? []
    let startCandidate: number | null = null
    let endCandidate: number | null = null
    let clipped = false

    if (isSyncHabit && anchorSegments.length > 0) {
      const safeWindowStart = Number.isFinite(windowStartMs) ? windowStartMs : startMs
      const earliestStart = Math.max(safeWindowStart, constraintLowerBound)
      const searchStart =
        typeof baseNowMs === 'number'
          ? Math.max(earliestStart, baseNowMs)
          : earliestStart
      const segments = anchorSegments
        .filter(segment => segment.end > safeWindowStart && segment.start < endLimit)
      const GAP_TOLERANCE_MS = 60000
      let index = 0
      while (index < segments.length && segments[index].end <= searchStart) {
        index += 1
      }
      if (index < segments.length) {
        let alignedStart = Math.max(segments[index].start, safeWindowStart)
        if (typeof baseNowMs === 'number') {
          alignedStart = Math.max(alignedStart, baseNowMs)
        }
        if (alignedStart < segments[index].end) {
          let coverageEnd = Math.min(segments[index].end, endLimit)
          let totalCoverage = coverageEnd - alignedStart
          let cursor = index
          while (totalCoverage < desiredDurationMs && cursor + 1 < segments.length) {
            const nextSegment = segments[cursor + 1]
            if (nextSegment.start > coverageEnd + GAP_TOLERANCE_MS || nextSegment.start >= endLimit) {
              break
            }
            coverageEnd = Math.min(Math.max(coverageEnd, nextSegment.end), endLimit)
            totalCoverage = coverageEnd - alignedStart
            cursor += 1
          }
          if (coverageEnd > alignedStart && !hasSyncOverlap(alignedStart, coverageEnd, syncSegments)) {
            startCandidate = alignedStart
            endCandidate = coverageEnd
            if (totalCoverage + 1 < desiredDurationMs) {
              clipped = true
            }
          }
        }
      }
    }

    const latestStartAllowedFallback = endLimit - scheduledDurationMs

    if (startCandidate === null || endCandidate === null) {
      const latestStartAllowed = latestStartAllowedFallback
      let candidateStart = Math.max(startLimit, constraintLowerBound)
      if (isSyncHabit) {
        const safeWindowStart = Number.isFinite(windowStartMs) ? windowStartMs : startMs
        candidateStart = Math.max(candidateStart, safeWindowStart)
        if (typeof baseNowMs === 'number') {
          candidateStart = Math.max(candidateStart, baseNowMs)
        }
      } else if (
        typeof baseNowMs === 'number' &&
        baseNowMs > candidateStart &&
        baseNowMs < endLimit
      ) {
        if (anchorPreference === 'BACK') {
          const latestStart = endLimit - scheduledDurationMs
          const desiredStart = Math.min(latestStart, baseNowMs)
          candidateStart = Math.max(startLimit, desiredStart)
        } else {
          candidateStart = baseNowMs
        }
      }

      if (candidateStart >= endLimit) {
        if (!allowsHabitOverlap) {
          setAvailabilityBoundsForKey(availability, target.key, endLimit, endLimit)
        }
        continue
      }

      if (candidateStart > latestStartAllowed) {
        if (!allowsHabitOverlap) {
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
        }
        continue
      }

      let candidateEnd = candidateStart + scheduledDurationMs
      let candidateClipped = false
      if (candidateEnd > endLimit) {
        candidateEnd = endLimit
        candidateClipped = true
      }
      if (candidateEnd <= candidateStart) {
        if (!allowsHabitOverlap) {
          setAvailabilityBoundsForKey(availability, target.key, candidateEnd, candidateEnd)
          if (bounds) {
            if (anchorPreference === 'BACK') {
              bounds.back = new Date(Math.max(bounds.front.getTime(), candidateStart))
              if (bounds.back.getTime() < bounds.front.getTime()) {
                bounds.front = new Date(bounds.back)
              }
            } else {
              bounds.front = new Date(candidateEnd)
              if (bounds.back.getTime() < bounds.front.getTime()) {
                bounds.back = new Date(bounds.front)
              }
            }
          }
        }
        continue
      }

      if (isSyncHabit && hasSyncOverlap(candidateStart, candidateEnd, syncSegments)) {
        let adjustedStart = candidateStart
        let adjustedEnd = candidateEnd
        let guard = 0
        while (hasSyncOverlap(adjustedStart, adjustedEnd, syncSegments)) {
          const conflict = findFirstSyncConflict(adjustedStart, adjustedEnd, syncSegments)
          if (!conflict) break
          adjustedStart = Math.max(conflict.end, adjustedStart + 1)
          if (adjustedStart > latestStartAllowed) break
          adjustedEnd = adjustedStart + scheduledDurationMs
          if (adjustedEnd > endLimit) {
            adjustedEnd = endLimit
            candidateClipped = true
          }
          guard += 1
          if (guard > syncSegments.length + 4) break
        }
        if (
          adjustedStart > latestStartAllowed ||
          adjustedEnd <= adjustedStart ||
          hasSyncOverlap(adjustedStart, adjustedEnd, syncSegments)
        ) {
          continue
        }
        candidateStart = adjustedStart
        candidateEnd = adjustedEnd
      }

      startCandidate = candidateStart
      endCandidate = candidateEnd
      clipped = candidateClipped
    }

    if (startCandidate === null || endCandidate === null) {
      continue
    }

    scheduledDurationMs = endCandidate - startCandidate
    if (scheduledDurationMs <= 0) {
      continue
    }
    if (!clipped && scheduledDurationMs + 1 < desiredDurationMs) {
      clipped = true
    }

    if (startCandidate === null || endCandidate === null) {
      continue
    }

    const durationMinutes = Math.max(1, Math.round((endCandidate - startCandidate) / 60000))
    const windowLabel = window.label ?? null
    const windowStartLocal = resolveWindowStart(window, day, zone)
    const candidateStartUTC = new Date(startCandidate).toISOString()
    const candidateEndUTC = new Date(endCandidate).toISOString()
    const energyResolved = window.energy
      ? String(window.energy).toUpperCase()
      : resolvedEnergy

    existingInstance = existingByHabitId.get(habit.id) ?? null
    if (existingInstance && daylightConstraint) {
      const existingWindow = existingInstance.window_id
        ? windowsById.get(existingInstance.window_id) ?? null
        : null
      const withinDaylight = doesInstanceRespectDaylight(
        existingInstance,
        daylightConstraint,
        existingWindow,
        day,
        zone,
        nightSunlightBundle,
      )
      if (!withinDaylight) {
        if (await cancelScheduledInstance(existingInstance)) {
          existingByHabitId.delete(habit.id)
          existingInstance = null
        }
      }
    }

    let needsUpdate = existingInstance
      ? existingInstance.window_id !== window.id ||
        existingInstance.start_utc !== candidateStartUTC ||
        existingInstance.end_utc !== candidateEndUTC ||
        existingInstance.duration_min !== durationMinutes ||
        (existingInstance.energy_resolved ?? '').toUpperCase() !== energyResolved
      : true

    if (!needsUpdate && existingInstance) {
      const overlapsExisting = dayInstances.some(inst => {
        if (!inst) return false
        if (inst.id === existingInstance.id) return false
        if (inst.status !== 'scheduled') return false
        if (allowsHabitOverlap && inst.source_type === 'HABIT') return false
        const instStartMs = new Date(inst.start_utc ?? '').getTime()
        const instEndMs = new Date(inst.end_utc ?? '').getTime()
        if (!Number.isFinite(instStartMs) || !Number.isFinite(instEndMs)) return false
        return instEndMs > startCandidate && instStartMs < endCandidate
      })
      if (overlapsExisting) {
        needsUpdate = true
      }
    }

    let persisted: ScheduleInstance | null = null
    let decision: HabitDraftPlacement['decision'] = 'new'
    let instanceId: string | undefined

    if (existingInstance && !needsUpdate) {
      decision = 'kept'
      instanceId = existingInstance.id
      persisted = existingInstance
      registerInstance(existingInstance)
    } else {
      const placement = await placeItemInWindows({
        userId,
        item: {
          id: habit.id,
          sourceType: 'HABIT',
          duration_min: durationMinutes,
          energy: energyResolved,
          weight: 0,
          eventName: habit.name || 'Habit',
        },
        windows: [
          {
            id: window.id,
            startLocal: target.startLocal,
            endLocal: target.endLocal,
            availableStartLocal: new Date(startCandidate),
            key: target.key,
          },
        ],
        date: day,
        client,
        reuseInstanceId: existingInstance?.id,
        existingInstances: allowsHabitOverlap
          ? dayInstances.filter(inst => {
              if (!inst) return false
              if (inst.source_type !== 'HABIT') return true
              if (inst.id === existingInstance?.id) return true
              const instHabitType =
                inst.source_id && habitTypeById.size > 0
                  ? habitTypeById.get(inst.source_id) ?? 'HABIT'
                  : 'HABIT'
              return instHabitType === 'SYNC'
            })
          : dayInstances,
        allowHabitOverlap: allowsHabitOverlap,
      })

      if (!('status' in placement)) {
        if (placement.error !== 'NO_FIT') {
          result.failures.push({
            itemId: habit.id,
            reason: 'error',
            detail: placement.error,
          })
        }
        continue
      }

      if (placement.error || !placement.data) {
        result.failures.push({
          itemId: habit.id,
          reason: 'error',
          detail: placement.error ?? new Error('Failed to persist habit instance'),
        })
        continue
      }

      persisted = placement.data
      result.instances.push(persisted)
      existingByHabitId.set(habit.id, persisted)
      registerInstance(persisted)
      decision = existingInstance ? 'rescheduled' : 'new'
      instanceId = persisted.id
    }

    if (!persisted) {
      continue
    }

    const startDate = new Date(persisted.start_utc)
    const endDate = new Date(persisted.end_utc)
    recordHabitScheduledStart(habit.id, startDate)
    const startUTC = startDate.toISOString()
    const endUTC = endDate.toISOString()

    addAnchorStart(anchorStartsByWindowKey, target.key, startDate.getTime())
    if (isSyncHabit) {
      addSyncUsage(target.key, startDate.getTime(), endDate.getTime())
    }
    upsertInstance(dayInstances, persisted)
    if (!allowsHabitOverlap) {
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
    }

    const resolvedDuration = Number.isFinite(persisted.duration_min)
      ? persisted.duration_min
      : durationMinutes
    const persistedEnergy = (persisted.energy_resolved ?? energyResolved).toUpperCase()

    result.placements.push({
      type: 'HABIT',
      habit: {
        id: habit.id,
        name: habit.name,
        windowId: window.id,
        windowLabel,
        startUTC,
        endUTC,
        durationMin: resolvedDuration,
        energyResolved: persistedEnergy,
        clipped,
      },
      decision,
      scheduledDayOffset: offset,
      availableStartLocal: startUTC,
      windowStartLocal: windowStartLocal.toISOString(),
      instanceId,
    })
  }

  result.placements.sort((a, b) => {
    const aTime = new Date(a.habit.startUTC).getTime()
    const bTime = new Date(b.habit.startUTC).getTime()
    return aTime - bTime
  })

  return result
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

function upsertInstance(list: ScheduleInstance[], instance: ScheduleInstance) {
  const index = list.findIndex(existing => existing.id === instance.id)
  if (index >= 0) {
    list[index] = instance
    return
  }
  list.push(instance)
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

type NightSpan = {
  start: Date
  end: Date
}

type NightSunlightBundle = {
  today: SunlightBounds
  previous: SunlightBounds
  next: SunlightBounds
}

function nightSpanForWindowFromSunlight(
  win: WindowLite,
  todaySunlight: SunlightBounds,
  previousSunlight: SunlightBounds,
  nextSunlight: SunlightBounds,
): NightSpan | null {
  const startReference = win.fromPrevDay
    ? previousSunlight.sunset ?? previousSunlight.dusk
    : todaySunlight.sunset ?? todaySunlight.dusk
  const endReference = win.fromPrevDay
    ? todaySunlight.dawn ?? todaySunlight.sunrise
    : nextSunlight.dawn ?? nextSunlight.sunrise
  if (!startReference || !endReference) {
    return null
  }
  return { start: startReference, end: endReference }
}

function windowOverlapsNightSpan(
  win: WindowLite,
  date: Date,
  timeZone: string,
  todaySunlight: SunlightBounds,
  previousSunlight: SunlightBounds,
  nextSunlight: SunlightBounds,
) {
  const span = nightSpanForWindowFromSunlight(
    win,
    todaySunlight,
    previousSunlight,
    nextSunlight,
  )
  if (!span) return false
  const startLocal = resolveWindowStart(win, date, timeZone)
  const endLocal = resolveWindowEnd(win, date, timeZone)
  return (
    startLocal.getTime() < span.end.getTime() &&
    endLocal.getTime() > span.start.getTime()
  )
}

type DaylightConstraint = {
  preference: 'DAY' | 'NIGHT'
  sunrise: Date | null
  sunset: Date | null
  dawn: Date | null
  dusk: Date | null
  previousSunset: Date | null
  previousDusk: Date | null
  nextDawn: Date | null
  nextSunrise: Date | null
}

function nightSpanForWindowFromConstraint(
  win: WindowLite,
  daylight: DaylightConstraint,
): NightSpan | null {
  const startReference = win.fromPrevDay
    ? daylight.previousSunset ?? daylight.previousDusk
    : daylight.sunset ?? daylight.dusk
  const endReference = win.fromPrevDay
    ? daylight.sunrise ?? daylight.dawn
    : daylight.nextDawn ?? daylight.nextSunrise
  if (!startReference || !endReference) {
    return null
  }
  return { start: startReference, end: endReference }
}

function doesInstanceRespectDaylight(
  instance: ScheduleInstance,
  daylight: DaylightConstraint,
  window: WindowLite | null,
  date: Date,
  timeZone: string,
  nightSunlight: NightSunlightBundle | null,
) {
  const start = new Date(instance.start_utc ?? '')
  const end = new Date(instance.end_utc ?? '')
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return true
  }

  if (daylight.preference === 'DAY') {
    const sunriseMs = daylight.sunrise?.getTime() ?? daylight.dawn?.getTime()
    const sunsetMs = daylight.sunset?.getTime() ?? daylight.dusk?.getTime()
    if (typeof sunriseMs === 'number' && start.getTime() < sunriseMs) {
      return false
    }
    if (typeof sunsetMs === 'number' && end.getTime() > sunsetMs) {
      return false
    }
    return true
  }

  let span: NightSpan | null = null
  if (window) {
    span = nightSpanForWindowFromConstraint(window, daylight)
    if (!span && nightSunlight) {
      span = nightSpanForWindowFromSunlight(
        window,
        nightSunlight.today,
        nightSunlight.previous,
        nightSunlight.next,
      )
    }
  }

  let startBound: Date
  let endBound: Date

  if (span) {
    startBound = span.start
    endBound = span.end
  } else {
    const thresholdBase = window?.fromPrevDay
      ? addDaysInTimeZone(date, -1, timeZone)
      : date
    startBound = setTimeInTimeZone(thresholdBase, timeZone, 19, 0)
    const fallbackEnd =
      daylight.nextDawn ??
      daylight.nextSunrise ??
      nightSunlight?.next.dawn ??
      nightSunlight?.next.sunrise ??
      setTimeInTimeZone(addDaysInTimeZone(date, 1, timeZone), timeZone, 6, 0)
    endBound = fallbackEnd ?? new Date(startBound.getTime() + 6 * 60 * 60 * 1000)
  }

  const startMs = start.getTime()
  const endMs = end.getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return true
  if (startMs < startBound.getTime()) return false
  if (endMs > endBound.getTime()) return false
  return true
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
    locationContextId?: string | null
    locationContextValue?: string | null
    daylight?: DaylightConstraint | null
    matchEnergyLevel?: boolean
    ignoreAvailability?: boolean
    anchor?: 'FRONT' | 'BACK'
    restMode?: boolean
    userId?: string | null
    preloadedWindows?: WindowLite[]
    enforceNightSpan?: boolean
    nightSunlight?: NightSunlightBundle | null
    requireLocationContextMatch?: boolean
    hasExplicitLocationContext?: boolean
    allowedWindowKinds?: WindowKind[]
  }
) {
  const cacheKey = dateCacheKey(date)
  const cache = options?.cache
  let windows: WindowLite[]
  const userId = options?.userId ?? null
  if (options?.preloadedWindows) {
    windows = options.preloadedWindows
    cache?.set(cacheKey, windows)
  } else if (cache?.has(cacheKey)) {
    windows = cache.get(cacheKey) ?? []
  } else {
    windows = await fetchWindowsForDate(date, supabase, timeZone, { userId })
    cache?.set(cacheKey, windows)
  }
  const itemIdx = energyIndex(item.energy)
  const now = options?.now ? new Date(options.now) : null
  const nowMs = now?.getTime()
  const durationMs = Math.max(0, item.duration_min) * 60000
    const availability = options?.ignoreAvailability ? undefined : options?.availability

  const desiredLocationId =
    typeof options?.locationContextId === 'string' && options.locationContextId.trim().length > 0
      ? options.locationContextId.trim()
      : null
  const desiredLocationValueRaw =
    options?.locationContextValue && options.locationContextValue.length > 0
      ? options.locationContextValue.toUpperCase().trim()
      : null
  const desiredLocationValue = desiredLocationValueRaw === 'ANY' ? null : desiredLocationValueRaw
  const daylight = options?.daylight ?? null
  const anchorPreference = options?.anchor === 'BACK' ? 'BACK' : 'FRONT'
  const allowedWindowKindSet =
    options?.allowedWindowKinds && options.allowedWindowKinds.length > 0
      ? new Set(options.allowedWindowKinds)
      : null

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
    const windowKind: WindowKind = win.window_kind ?? 'DEFAULT'
    if (allowedWindowKindSet && !allowedWindowKindSet.has(windowKind)) {
      continue
    }
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

    const windowLocationId =
      typeof win.location_context_id === 'string' && win.location_context_id.trim().length > 0
        ? win.location_context_id.trim()
        : null
    const windowLocationValue =
      win.location_context_value && win.location_context_value.length > 0
        ? win.location_context_value.toUpperCase().trim()
        : null
    const windowHasLocation = Boolean(windowLocationId || windowLocationValue)
    const attemptHasLocation = Boolean(desiredLocationId || desiredLocationValue)

    if (options?.requireLocationContextMatch) {
      if (!attemptHasLocation && windowHasLocation) {
        continue
      }
    }

    if (desiredLocationId || windowLocationId) {
      if (!desiredLocationId || !windowLocationId) continue
      if (windowLocationId !== desiredLocationId) continue
    } else if (desiredLocationValue) {
      if (!windowLocationValue) continue
      if (windowLocationValue !== desiredLocationValue) continue
    }

    const startLocal = resolveWindowStart(win, date, timeZone)
    const endLocal = resolveWindowEnd(win, date, timeZone)
    const key = windowKey(win.id, startLocal)
    const startMs = startLocal.getTime()
    const endMs = endLocal.getTime()

    if (typeof nowMs === 'number' && endMs <= nowMs) continue

    let frontBoundMs = typeof nowMs === 'number' ? Math.max(startMs, nowMs) : startMs
    let backBoundMs = endMs

    const wantsNightSpan =
      daylight?.preference === 'NIGHT' || options?.enforceNightSpan === true
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
      }
    }
    if (wantsNightSpan) {
      let nightSpan: NightSpan | null = null
      if (daylight?.preference === 'NIGHT') {
        nightSpan = nightSpanForWindowFromConstraint(win, daylight)
      }
      if (!nightSpan && options?.nightSunlight) {
        nightSpan = nightSpanForWindowFromSunlight(
          win,
          options.nightSunlight.today,
          options.nightSunlight.previous,
          options.nightSunlight.next,
        )
      }
      if (nightSpan) {
        frontBoundMs = Math.max(frontBoundMs, nightSpan.start.getTime())
        backBoundMs = Math.min(backBoundMs, nightSpan.end.getTime())
      } else {
        const thresholdBase = win.fromPrevDay
          ? addDaysInTimeZone(date, -1, timeZone)
          : date
        const nightThreshold = setTimeInTimeZone(thresholdBase, timeZone, 19, 0)
        const nightThresholdMs = nightThreshold.getTime()
        if (Number.isFinite(nightThresholdMs)) {
          frontBoundMs = Math.max(frontBoundMs, nightThresholdMs)
        }
        const fallbackNextDawnMs =
          daylight?.nextDawn?.getTime() ??
          options?.nightSunlight?.next.dawn?.getTime() ??
          options?.nightSunlight?.next.sunrise?.getTime() ??
          null
        if (typeof fallbackNextDawnMs === 'number') {
          backBoundMs = Math.min(backBoundMs, fallbackNextDawnMs)
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

function cloneAvailabilityMap(
  source: Map<string, WindowAvailabilityBounds>,
) {
  const clone = new Map<string, WindowAvailabilityBounds>()
  for (const [key, bounds] of source) {
    clone.set(key, {
      front: new Date(bounds.front.getTime()),
      back: new Date(bounds.back.getTime()),
    })
  }
  return clone
}

function adoptAvailabilityMap(
  target: Map<string, WindowAvailabilityBounds>,
  source: Map<string, WindowAvailabilityBounds>,
) {
  target.clear()
  for (const [key, bounds] of source) {
    target.set(key, {
      front: new Date(bounds.front.getTime()),
      back: new Date(bounds.back.getTime()),
    })
  }
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
  const attemptProjectConflictPlacement = async (
    conflict: ScheduleInstance,
    options: {
      day: Date
      offset: number
      dayInstances: ScheduleInstance[]
      dayWindows: WindowLite[]
      windowAvailability: Map<string, WindowAvailabilityBounds>
      scheduledProjectIds: Set<string>
      projectItemMap: Record<string, (typeof projectItems)[number]>
      supabase: Client
      timeZone: string
      baseDate: Date
      restMode: boolean
      windowCache: Map<string, WindowLite[]>
      userId: string
      result: ScheduleBacklogResult
      dayOffsetFor: (startUTC: string) => number | undefined
      registerInstanceForOffsets: (instance: ScheduleInstance | null | undefined) => void
      projectMatchesMonument?: (projectId: string) => boolean
    }
  ): Promise<'PLACED' | 'NO_WINDOW' | 'NO_FIT' | 'FAILED' | 'SKIPPED'> => {
    const { result, dayOffsetFor, registerInstanceForOffsets } = options
    const projectId = conflict.source_id ?? ''
    if (!projectId) return 'SKIPPED'
    if (conflict.locked) {
      return 'SKIPPED'
    }
    const projectDef = options.projectItemMap[projectId]
    if (!projectDef) {
      result.failures.push({ itemId: projectId, reason: 'UNKNOWN_PROJECT' })
      return 'FAILED'
    }

    let duration = Number(conflict.duration_min ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = Number(projectDef.duration_min ?? 0)
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = DEFAULT_PROJECT_DURATION_MIN
    }

    const energy = (conflict.energy_resolved ?? projectDef.energy ?? 'NO')
      .toString()
      .toUpperCase()

    const item: QueueItem = {
      id: projectId,
      sourceType: 'PROJECT',
      duration_min: duration,
      energy,
      weight: projectDef.weight ?? 0,
      goalWeight: projectDef.goalWeight ?? 0,
      instanceId: conflict.id,
      preferred: options.projectMatchesMonument
        ? options.projectMatchesMonument(projectId)
        : false,
      eventName: projectDef.name || projectId,
    }

    const windows = await fetchCompatibleWindowsForItem(
      options.supabase,
      options.day,
      item,
      options.timeZone,
      {
        availability: options.windowAvailability,
        now: options.offset === 0 ? options.baseDate : undefined,
        cache: options.windowCache,
        restMode: options.restMode,
        userId: options.userId,
        preloadedWindows: options.dayWindows,
        allowedWindowKinds: ['DEFAULT'],
      }
    )

    if (windows.length === 0) {
      return 'NO_WINDOW'
    }

    const existingInstances = options.dayInstances.filter(inst => inst.id !== conflict.id)
    const placed = await placeItemInWindows({
      userId: options.userId,
      item,
      windows,
      date: options.day,
      client: options.supabase,
      reuseInstanceId: conflict.id,
      ignoreProjectIds: new Set([projectId]),
      notBefore: options.offset === 0 ? options.baseDate : undefined,
      existingInstances,
    })

    if (!('status' in placed)) {
      if (placed.error === 'NO_FIT') {
        return 'NO_FIT'
      }
      if (placed.error && placed.error !== 'NO_FIT') {
        result.failures.push({ itemId: projectId, reason: 'error', detail: placed.error })
      }
      return 'FAILED'
    }

    if (placed.error || !placed.data) {
      result.failures.push({
        itemId: projectId,
        reason: 'error',
        detail: placed.error ?? new Error('Failed to persist conflict placement'),
      })
      return 'FAILED'
    }

    result.placed.push(placed.data)
    const placementWindow = findPlacementWindow(windows, placed.data)
    if (placementWindow?.key) {
      const placementEnd = new Date(placed.data.end_utc)
      const existingBounds = options.windowAvailability.get(placementWindow.key)
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
        options.windowAvailability.set(placementWindow.key, {
          front: placementEnd,
          back: new Date(endLocal),
        })
      }
    }

    const decision: ScheduleDraftPlacement['decision'] = conflict.id ? 'rescheduled' : 'new'
    result.timeline.push({
      type: 'PROJECT',
      instance: placed.data,
      projectId,
      decision,
      scheduledDayOffset: dayOffsetFor(placed.data.start_utc) ?? options.offset,
      availableStartLocal: placementWindow?.availableStartLocal
        ? placementWindow.availableStartLocal.toISOString()
        : undefined,
      windowStartLocal: placementWindow?.startLocal
        ? placementWindow.startLocal.toISOString()
        : undefined,
      locked: placed.data.locked ?? undefined,
    })
    options.scheduledProjectIds.add(projectId)
    registerInstanceForOffsets(placed.data)

    const existingIndex = options.dayInstances.findIndex(inst => inst.id === conflict.id)
    if (existingIndex >= 0) {
      options.dayInstances.splice(existingIndex, 1, placed.data)
    } else {
      options.dayInstances.push(placed.data)
    }

    return 'PLACED'
  }
