import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import type { Database } from '../../../types/supabase'
import {
  fetchBacklogNeedingSchedule,
  fetchInstancesForRange,
  type ScheduleInstance,
} from './instanceRepo'
import { buildProjectItems } from './projects'
import {
  fetchReadyTasks,
  fetchWindowsForDate,
  fetchProjectsMap,
  type WindowLite,
} from './repo'
import { placeItemInWindows } from './placement'
import { ENERGY } from './config'
import type { TaskLite } from './weight'
import { taskWeight } from './weight'

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

function ensureClient(client?: Client): Client {
  if (client) return client
  throw new Error('Supabase client not available')
}

export async function markMissedAndQueue(
  userId: string,
  now = new Date(),
  client?: Client
) {
  const supabase = ensureClient(client)
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
  const supabase = ensureClient(client)
  const result: ScheduleBacklogResult = { placed: [], failures: [] }

  const missed = await fetchBacklogNeedingSchedule(userId, supabase)
  if (missed.error) {
    result.error = missed.error
    return result
  }

  const tasks = await fetchReadyTasks(supabase)
  const projectsMap = await fetchProjectsMap(supabase)
  const projectItems = buildProjectItems(Object.values(projectsMap), tasks)

  const taskMap: Record<string, TaskLite> = {}
  for (const task of tasks) taskMap[task.id] = task
  const projectItemMap: Record<string, (typeof projectItems)[number]> = {}
  for (const item of projectItems) projectItemMap[item.id] = item

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
    const project = projectItemMap[projectId]
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

  const baseStart = startOfDay(baseDate)

  for (const m of missed.data ?? []) {
    if (m.source_type === 'PROJECT') {
      const weight =
        typeof m.weight_snapshot === 'number' ? m.weight_snapshot : undefined
      pushProject(m.source_id, {
        duration: m.duration_min,
        energy: m.energy_resolved,
        weight,
      })
      continue
    }

    if (m.source_type === 'TASK') {
      const task = taskMap[m.source_id]
      const projectId = task?.project_id ?? null
      if (!projectId) continue
      pushProject(projectId, {
        duration: projectItemMap[projectId]?.duration_min ?? task?.duration_min,
        energy: projectItemMap[projectId]?.energy ?? task?.energy,
        weight:
          projectItemMap[projectId]?.weight ??
          (task ? taskWeight(task) : undefined),
      })
    }
  }

  if (queue.length === 0) {
    const rangeEnd = addDays(baseStart, 28)
    const future = await fetchInstancesForRange(
      userId,
      baseStart.toISOString(),
      rangeEnd.toISOString(),
      supabase
    )
    if (future.error) {
      result.error = future.error
      return result
    }

    const scheduledProjects = new Set<string>()
    for (const inst of future.data ?? []) {
      if (inst.status !== 'scheduled') continue
      if (inst.source_type === 'PROJECT') {
        scheduledProjects.add(inst.source_id)
      } else if (inst.source_type === 'TASK') {
        const projectId = taskMap[inst.source_id]?.project_id ?? null
        if (projectId) scheduledProjects.add(projectId)
      }
    }

    for (const project of projectItems) {
      if (scheduledProjects.has(project.id)) continue
      pushProject(project.id)
    }
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
      const day = addDays(baseStart, offset)
      const windows = await fetchCompatibleWindowsForItem(supabase, day, item)
      if (windows.length === 0) continue

      const placed = await placeItemInWindows({
        userId,
        item,
        windows,
        date: day,
        client: supabase,
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

async function fetchCompatibleWindowsForItem(
  supabase: Client,
  date: Date,
  item: { energy: string; duration_min: number }
) {
  const windows = await fetchWindowsForDate(date, supabase)
  const itemIdx = energyIndex(item.energy)
  const compatible = windows.filter(w => energyIndex(w.energy) >= itemIdx)
  return compatible.map(w => ({
    id: w.id,
    startLocal: resolveWindowStart(w, date),
    endLocal: resolveWindowEnd(w, date),
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
