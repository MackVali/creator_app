import type { PostgrestError } from '@supabase/supabase-js'
import type { Database } from '../../types/supabase'
import {
  getServiceSupabaseClient,
  type ServiceSupabaseClient,
} from './service_client'

type Client = ServiceSupabaseClient

type WindowRow = Database['public']['Tables']['windows']['Row']
type ProjectRow = Database['public']['Tables']['projects']['Row']
type ScheduleInstanceRow = Database['public']['Tables']['schedule_instances']['Row']

type QueueItem = {
  id: string
  durationMin: number
  energy: Energy
  weight: number
}

type WindowState = {
  id: string
  start: Date
  end: Date
  cursor: Date
}

type ExistingInstance = Pick<ScheduleInstanceRow, 'source_id' | 'window_id' | 'start_utc' | 'end_utc'>

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const ENERGY_ORDER = ['NO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'EXTREME'] as const

type Energy = (typeof ENERGY_ORDER)[number]

function energyIndex(value: string | null | undefined): number {
  const normalized = (value ?? 'NO').toString().toUpperCase()
  const idx = ENERGY_ORDER.indexOf(normalized as Energy)
  return idx >= 0 ? idx : 0
}

function normalizeEnergy(value: string | null | undefined): Energy {
  const normalized = (value ?? 'NO').toString().toUpperCase()
  return ENERGY_ORDER.includes(normalized as Energy)
    ? (normalized as Energy)
    : 'NO'
}

function parseTime(base: Date, value: string | null | undefined): Date | null {
  if (!value) return null
  const [rawHours = '', rawMinutes = ''] = value.split(':')
  const hours = Number(rawHours)
  const minutes = Number(rawMinutes)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const result = new Date(base)
  result.setHours(hours, minutes, 0, 0)
  return result
}

function clampDate(value: Date, min: Date, max: Date): Date {
  const time = Math.min(Math.max(value.getTime(), min.getTime()), max.getTime())
  return new Date(time)
}

async function fetchWindowsForDay(
  client: Client,
  userId: string,
  dayStart: Date,
  dayEnd: Date
): Promise<WindowState[]> {
  const weekday = dayStart.getDay()
  const { data, error } = await client
    .from('windows')
    .select('id,start_local,end_local,energy')
    .eq('user_id', userId)
    .contains('days', [weekday])

  if (error) throw error

  const windows: WindowState[] = []
  for (const row of (data ?? []) as Array<WindowRow & { energy?: string | null }>) {
    if (!row.id) continue
    const start = parseTime(dayStart, row.start_local)
    const rawEnd = parseTime(dayStart, row.end_local)
    if (!start || !rawEnd) continue
    let end = rawEnd
    if (end.getTime() <= start.getTime()) {
      end = new Date(dayEnd)
    }

    const clampedStart = clampDate(start, dayStart, new Date(dayEnd.getTime() - MINUTE))
    const clampedEnd = clampDate(end, new Date(clampedStart.getTime() + MINUTE), dayEnd)
    if (clampedEnd.getTime() <= clampedStart.getTime()) continue

    windows.push({
      id: row.id,
      start: clampedStart,
      end: clampedEnd,
      cursor: new Date(clampedStart),
    })
  }

  windows.sort((a, b) => a.start.getTime() - b.start.getTime())
  return windows
}

async function buildProjectQueue(client: Client, userId: string): Promise<QueueItem[]> {
  const { data, error } = await client
    .from('projects')
    .select('id,duration_min,energy,weight')
    .eq('user_id', userId)

  if (error) throw error

  const queue: QueueItem[] = []
  for (const row of (data ?? []) as Array<ProjectRow & { energy?: string | null; weight?: number | null }>) {
    if (!row.id) continue
    const duration = Number(row.duration_min ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) continue
    const energy = normalizeEnergy(row.energy)
    const weightValue = Number(row.weight ?? 0)
    queue.push({
      id: row.id,
      durationMin: Math.round(duration),
      energy,
      weight: Number.isFinite(weightValue) ? weightValue : 0,
    })
  }

  queue.sort((a, b) => {
    const energyDiff = energyIndex(b.energy) - energyIndex(a.energy)
    if (energyDiff !== 0) return energyDiff
    const weightDiff = b.weight - a.weight
    if (weightDiff !== 0) return weightDiff
    return a.id.localeCompare(b.id)
  })

  return queue
}

async function fetchExistingInstances(
  client: Client,
  userId: string,
  dayStart: Date,
  dayEnd: Date
): Promise<{
  alreadyScheduled: Set<string>
  lastEndByWindow: Map<string, number>
}> {
  const startISO = dayStart.toISOString()
  const endISO = dayEnd.toISOString()
  const { data, error } = await client
    .from('schedule_instances')
    .select('source_id,window_id,start_utc,end_utc,status')
    .eq('user_id', userId)
    .eq('source_type', 'PROJECT')
    .in('status', ['scheduled', 'completed', 'missed'])
    .or(
      `and(start_utc.gte.${startISO},start_utc.lt.${endISO}),and(start_utc.lt.${startISO},end_utc.gt.${startISO})`
    )

  if (error) throw error

  const alreadyScheduled = new Set<string>()
  const lastEndByWindow = new Map<string, number>()

  for (const row of (data ?? []) as Array<ExistingInstance & { status?: string | null }>) {
    if (row.source_id) {
      alreadyScheduled.add(row.source_id)
    }
    if (!row.window_id) continue
    const end = row.end_utc ? Date.parse(row.end_utc) : NaN
    if (!Number.isFinite(end)) continue
    const previous = lastEndByWindow.get(row.window_id) ?? 0
    if (end > previous) {
      lastEndByWindow.set(row.window_id, end)
    }
  }

  return { alreadyScheduled, lastEndByWindow }
}

function toISOString(date: Date): string {
  return new Date(date.getTime()).toISOString()
}

async function insertScheduleInstance(
  client: Client,
  input: {
    userId: string
    project: QueueItem
    windowId: string
    start: Date
    end: Date
  }
): Promise<ScheduleInstanceRow> {
  const { data, error } = await client
    .from('schedule_instances')
    .insert({
      user_id: input.userId,
      source_type: 'PROJECT',
      source_id: input.project.id,
      window_id: input.windowId,
      start_utc: toISOString(input.start),
      end_utc: toISOString(input.end),
      duration_min: input.project.durationMin,
      status: 'scheduled',
      weight_snapshot: input.project.weight,
      energy_resolved: input.project.energy,
    })
    .select('*')
    .single()

  if (error) throw error as PostgrestError
  if (!data) {
    throw new Error('Failed to create schedule instance')
  }
  return data
}

export async function planTodaySimple(
  userId: string,
  dateLocal: Date
): Promise<ScheduleInstanceRow[]> {
  if (!userId) throw new Error('userId is required')
  if (!(dateLocal instanceof Date) || Number.isNaN(dateLocal.getTime())) {
    throw new Error('dateLocal must be a valid Date')
  }

  const client = await getServiceSupabaseClient()
  const dayStart = new Date(dateLocal)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart.getTime() + DAY)

  const windows = await fetchWindowsForDay(client, userId, dayStart, dayEnd)
  if (windows.length === 0) return []

  const queue = await buildProjectQueue(client, userId)
  if (queue.length === 0) return []

  const { alreadyScheduled, lastEndByWindow } = await fetchExistingInstances(
    client,
    userId,
    dayStart,
    dayEnd
  )

  for (const window of windows) {
    const existingEnd = lastEndByWindow.get(window.id)
    if (existingEnd) {
      const capped = Math.min(existingEnd, window.end.getTime())
      if (capped > window.cursor.getTime()) {
        window.cursor = new Date(capped)
      }
    }
    if (window.cursor.getTime() < window.start.getTime()) {
      window.cursor = new Date(window.start)
    }
    if (window.cursor.getTime() > window.end.getTime()) {
      window.cursor = new Date(window.end)
    }
  }

  const created: ScheduleInstanceRow[] = []

  for (const project of queue) {
    if (alreadyScheduled.has(project.id)) continue

    for (const window of windows) {
      if (window.cursor.getTime() >= window.end.getTime()) continue

      const start =
        window.cursor.getTime() < window.start.getTime()
          ? new Date(window.start)
          : new Date(window.cursor)
      const end = new Date(start.getTime() + project.durationMin * MINUTE)

      if (end.getTime() > window.end.getTime()) {
        continue
      }

      const instance = await insertScheduleInstance(client, {
        userId,
        project,
        windowId: window.id,
        start,
        end,
      })

      created.push(instance)
      alreadyScheduled.add(project.id)
      window.cursor = new Date(end)
      break
    }
  }

  return created
}
