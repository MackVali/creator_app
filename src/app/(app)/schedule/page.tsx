"use client"

export const runtime = 'nodejs'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { useAuth } from '@/components/auth/AuthProvider'
import { useProfileContext } from '@/components/ProfileProvider'
import { DayTimeline } from '@/components/schedule/DayTimeline'
import { FocusTimeline } from '@/components/schedule/FocusTimeline'
import FlameEmber, { FlameLevel } from '@/components/FlameEmber'
import { YearView } from '@/components/schedule/YearView'
import { MonthView } from '@/components/schedule/MonthView'
import { ScheduleTopBar } from '@/components/schedule/ScheduleTopBar'
import {
  getChildView,
  getParentView,
  type ScheduleView,
} from '@/components/schedule/viewUtils'
import TimezoneSelect from '@/components/TimezoneSelect'
import {
  fetchReadyTasks,
  fetchWindowsForDate,
  fetchProjectsMap,
  type WindowLite as RepoWindow,
} from '@/lib/scheduler/repo'
import {
  fetchInstancesForRange,
  fetchScheduledProjectIds,
  updateInstanceStatus,
  type ScheduleInstance,
} from '@/lib/scheduler/instanceRepo'
import { TaskLite, ProjectLite } from '@/lib/scheduler/weight'
import { buildProjectItems } from '@/lib/scheduler/projects'
import { windowRect } from '@/lib/scheduler/windowRect'
import { ENERGY } from '@/lib/scheduler/config'
import {
  getZonedDateTimeParts,
  zonedTimeToUtc,
  getTimezoneOptions,
  type ZonedDateTimeParts,
} from '@/lib/time/tz'

const MINUTES_IN_DAY = 24 * 60
const DAY_MS = 24 * 60 * 60 * 1000

type ResolvedWindow = RepoWindow & {
  startMinutes: number
  endMinutes: number
  visibleStart: number
  visibleEnd: number
}

function pad2(value: number) {
  return value.toString().padStart(2, '0')
}

function parseDateKey(key: string | null | undefined) {
  if (!key) return null
  const [yearStr, monthStr, dayStr] = key.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }
  return { year, month, day }
}

function formatDateKey(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

function diffDaysBetween(a: ZonedDateTimeParts, b: ZonedDateTimeParts) {
  const utcA = Date.UTC(a.year, a.month - 1, a.day)
  const utcB = Date.UTC(b.year, b.month - 1, b.day)
  return Math.round((utcA - utcB) / DAY_MS)
}

function minutesFromParts(parts: ZonedDateTimeParts) {
  return (
    parts.hour * 60 +
    parts.minute +
    parts.second / 60 +
    parts.millisecond / 60000
  )
}

function getDayKeyForDate(date: Date, timeZone: string) {
  return getZonedDateTimeParts(date, timeZone).dayKey
}

function shiftDateKey(key: string, days: number, timeZone: string) {
  const parts = parseDateKey(key)
  if (!parts) return key
  const base = zonedTimeToUtc(parts, timeZone)
  base.setUTCDate(base.getUTCDate() + days)
  return getDayKeyForDate(base, timeZone)
}

function timeStringToMinutes(value?: string | null) {
  const [hour = 0, minute = 0] = (value ?? '0:0')
    .split(':')
    .map(Number)
  return hour * 60 + minute
}

function ScheduleViewShell({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion()
  if (prefersReducedMotion) return <div>{children}</div>
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}

function WindowLabel({
  label,
  availableHeight,
}: {
  label: string
  availableHeight: number
}) {
  const spanRef = useRef<HTMLSpanElement | null>(null)
  const [shouldWrap, setShouldWrap] = useState(false)

  useLayoutEffect(() => {
    const el = spanRef.current
    if (!el) return

    const safeHeight = Number.isFinite(availableHeight)
      ? Math.max(0, availableHeight)
      : 0

    if (!label || safeHeight <= 0) {
      setShouldWrap(prev => (prev ? false : prev))
      return
    }

    const previousWhiteSpace = el.style.whiteSpace
    el.style.whiteSpace = 'nowrap'
    const measuredHeight = Math.ceil(el.getBoundingClientRect().height)
    el.style.whiteSpace = previousWhiteSpace

    const nextShouldWrap = measuredHeight - safeHeight > 1
    setShouldWrap(prev => (prev === nextShouldWrap ? prev : nextShouldWrap))
  }, [label, availableHeight])

  return (
    <span
      ref={spanRef}
      className="ml-1 text-[10px] leading-none text-zinc-500"
      style={{
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        whiteSpace: shouldWrap ? 'normal' : 'nowrap',
        wordBreak: 'keep-all',
      }}
    >
      {label}
    </span>
  )
}

function utcDayRange(d: Date) {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  const startUTC = new Date(Date.UTC(y, m, day, 0, 0, 0, 0))
  const endUTC = new Date(Date.UTC(y, m, day + 1, 0, 0, 0, 0))
  return { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString() }
}

type LoadStatus = 'idle' | 'loading' | 'loaded'

type SchedulerRunFailure = {
  itemId: string
  reason: string
  detail?: unknown
}

type SchedulerDebugState = {
  runAt: string
  failures: SchedulerRunFailure[]
  placedCount: number
  placedProjectIds: string[]
  error: unknown
}

function parseSchedulerFailures(input: unknown): SchedulerRunFailure[] {
  if (!Array.isArray(input)) return []
  const results: SchedulerRunFailure[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue
    const value = entry as { itemId?: unknown; reason?: unknown; detail?: unknown }
    const itemId = value.itemId
    if (typeof itemId !== 'string' || itemId.length === 0) continue
    const reason = value.reason
    results.push({
      itemId,
      reason: typeof reason === 'string' && reason.length > 0 ? reason : 'unknown',
      detail: value.detail,
    })
  }
  return results
}

function parseSchedulerDebugPayload(
  payload: unknown
): Omit<SchedulerDebugState, 'runAt'> | null {
  if (!payload || typeof payload !== 'object') return null
  const schedule = (payload as { schedule?: unknown }).schedule
  if (!schedule || typeof schedule !== 'object') return null
  const scheduleValue = schedule as {
    placed?: unknown
    failures?: unknown
    error?: unknown
  }
  const placedCount = Array.isArray(scheduleValue.placed)
    ? scheduleValue.placed.length
    : 0
  const placedProjectIds = Array.isArray(scheduleValue.placed)
    ? Array.from(
        new Set(
          scheduleValue.placed
            .map(entry => {
              if (!entry || typeof entry !== 'object') return null
              const value = entry as { source_id?: unknown }
              const id = value.source_id
              return typeof id === 'string' && id.length > 0 ? id : null
            })
            .filter((value): value is string => Boolean(value))
        )
      )
    : []
  return {
    failures: parseSchedulerFailures(scheduleValue.failures),
    placedCount,
    placedProjectIds,
    error: scheduleValue.error ?? null,
  }
}

function formatSchedulerDetail(detail: unknown): string | null {
  if (detail === null || detail === undefined) return null
  if (detail instanceof Error) return detail.message
  if (typeof detail === 'string') return detail
  if (typeof detail === 'number' || typeof detail === 'boolean') {
    return String(detail)
  }
  if (typeof detail === 'object') {
    const obj = detail as Record<string, unknown>
    const candidates = ['message', 'details', 'hint', 'code'] as const
    const parts: string[] = []
    for (const key of candidates) {
      const value = obj[key]
      if (typeof value === 'string' && value.trim().length > 0) {
        parts.push(value.trim())
      }
    }
    if (parts.length > 0) return parts.join(' · ')
    try {
      return JSON.stringify(detail)
    } catch (error) {
      console.error('Failed to serialize scheduler detail', error)
    }
  }
  try {
    return JSON.stringify(detail)
  } catch (error) {
    console.error('Failed to stringify scheduler detail', error)
  }
  return String(detail)
}

function describeSchedulerFailure(
  failure: SchedulerRunFailure,
  context: { durationMinutes: number; energy: string }
): { message: string; detail?: string } {
  const duration = Math.max(0, Math.round(context.durationMinutes))
  const energy = context.energy.toUpperCase()
  const detail = formatSchedulerDetail(failure.detail) ?? undefined
  switch (failure.reason) {
    case 'NO_WINDOW': {
      const energyDescription =
        energy === 'NO'
          ? 'any available window'
          : `a window with ${energy} energy or higher`
      return {
        message: `Scheduler could not find ${energyDescription} long enough (≥ ${duration}m) within the next 28 days.`,
        detail,
      }
    }
    case 'error':
      return {
        message: 'Scheduler encountered an error while trying to book this project.',
        detail,
      }
    default:
      return {
        message: `Scheduler reported "${failure.reason}" for this project.`,
        detail,
      }
  }
}

export default function SchedulePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const prefersReducedMotion = useReducedMotion()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const { profile, loading: profileLoading, refreshProfile } = useProfileContext()
  const timezone = profile?.timezone ?? null
  const timezoneOptions = useMemo(() => getTimezoneOptions(), [])
  const browserTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch (error) {
      console.warn('Failed to resolve browser timezone', error)
      return 'UTC'
    }
  }, [])
  const [timezoneInput, setTimezoneInput] = useState('')
  const [timezoneSaving, setTimezoneSaving] = useState(false)
  const [timezoneMessage, setTimezoneMessage] = useState<string | null>(null)
  const [timezoneError, setTimezoneError] = useState<string | null>(null)

  const initialViewParam = searchParams.get('view') as ScheduleView | null
  const initialView: ScheduleView =
    initialViewParam && ['year', 'month', 'day', 'focus'].includes(initialViewParam)
      ? initialViewParam
      : 'year'
  const initialDate = searchParams.get('date')

  const [currentDateKey, setCurrentDateKey] = useState<string | null>(initialDate)
  const [view, setView] = useState<ScheduleView>(initialView)
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [windows, setWindows] = useState<RepoWindow[]>([])
  const [instances, setInstances] = useState<ScheduleInstance[]>([])
  const [scheduledProjectIds, setScheduledProjectIds] = useState<Set<string>>(new Set())
  const [metaStatus, setMetaStatus] = useState<LoadStatus>('idle')
  const [instancesStatus, setInstancesStatus] = useState<LoadStatus>('idle')
  const [schedulerDebug, setSchedulerDebug] = useState<SchedulerDebugState | null>(null)
  const [pendingInstanceIds, setPendingInstanceIds] = useState<Set<string>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const touchStartX = useRef<number | null>(null)
  const navLock = useRef(false)
  const loadInstancesRef = useRef<() => Promise<void>>(async () => {})
  const isSchedulingRef = useRef(false)
  const autoScheduledForRef = useRef<string | null>(null)

  const startHour = 0
  const pxPerMin = 2
  const timelineStartMinutes = startHour * 60
  const currentDate = useMemo(() => {
    if (!timezone || !currentDateKey) return null
    const parts = parseDateKey(currentDateKey)
    if (!parts) return null
    return zonedTimeToUtc(parts, timezone)
  }, [currentDateKey, timezone])

  const currentDayParts = useMemo(() => {
    if (!timezone || !currentDate) return null
    return getZonedDateTimeParts(currentDate, timezone)
  }, [currentDate, timezone])

  const currentDayKey = currentDayParts?.dayKey ?? currentDateKey
  const year = currentDayParts?.year ?? new Date().getFullYear()

  useEffect(() => {
    const next = profile?.timezone ?? ''
    setTimezoneInput(prev => (prev === next ? prev : next))
  }, [profile?.timezone])

  useEffect(() => {
    if (!timezone) return
    setCurrentDateKey(prev => {
      if (prev && parseDateKey(prev)) return prev
      return getDayKeyForDate(new Date(), timezone)
    })
  }, [timezone])

  const refreshScheduledProjectIds = useCallback(async () => {
    if (!userId) return
    const ids = await fetchScheduledProjectIds(userId)
    setScheduledProjectIds(new Set(ids))
  }, [userId])

  useEffect(() => {
    setSchedulerDebug(null)
  }, [userId])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('view', view)
    if (currentDateKey) {
      params.set('date', currentDateKey)
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [view, currentDateKey, router, pathname])

  useEffect(() => {
    if (!userId || !timezone || !currentDate) {
      setWindows([])
      setTasks([])
      setProjects([])
      setScheduledProjectIds(new Set())
      setMetaStatus('idle')
      return
    }

    let active = true
    setMetaStatus('loading')

    async function load() {
      try {
        const [ws, ts, pm, scheduledIds] = await Promise.all([
          fetchWindowsForDate(currentDate),
          fetchReadyTasks(),
          fetchProjectsMap(),
          fetchScheduledProjectIds(userId),
        ])
        if (!active) return
        setWindows(ws)
        setTasks(ts)
        setProjects(Object.values(pm))
        setScheduledProjectIds(prev => {
          const next = new Set(prev)
          for (const id of scheduledIds) {
            if (id) next.add(id)
          }
          return next
        })
      } catch (e) {
        if (!active) return
        console.error(e)
        setWindows([])
        setTasks([])
        setProjects([])
      } finally {
        if (!active) return
        setMetaStatus('loaded')
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [currentDate, timezone, userId])
  const projectItems = useMemo(
    () => buildProjectItems(projects, tasks),
    [projects, tasks]
  )

  const taskMap = useMemo(() => {
    const map: Record<string, TaskLite> = {}
    for (const t of tasks) map[t.id] = t
    return map
  }, [tasks])

  const tasksByProjectId = useMemo(() => {
    const map: Record<string, TaskLite[]> = {}
    for (const task of tasks) {
      const projectId = task.project_id
      if (!projectId) continue
      const existing = map[projectId]
      if (existing) {
        existing.push(task)
      } else {
        map[projectId] = [task]
      }
    }
    return map
  }, [tasks])

  const projectMap = useMemo(() => {
    const map: Record<string, typeof projectItems[number]> = {}
    for (const p of projectItems) map[p.id] = p
    return map
  }, [projectItems])

  const dayEnergies = useMemo(() => {
    if (!timezone) return {}
    const map: Record<string, FlameLevel> = {}
    for (const inst of instances) {
      const startParts = getZonedDateTimeParts(new Date(inst.start_utc), timezone)
      const key = formatDateKey(startParts)
      const level = (inst.energy_resolved?.toUpperCase() as FlameLevel) || 'NO'
      const current = map[key]
      if (!current || ENERGY.LIST.indexOf(level) > ENERGY.LIST.indexOf(current)) {
        map[key] = level
      }
    }
    return map
  }, [instances, timezone])

  const resolvedWindows = useMemo<ResolvedWindow[]>(() => {
    return windows
      .map(window => {
        const startLocal = timeStringToMinutes(window.start_local)
        const endLocal = timeStringToMinutes(window.end_local)
        const startMinutes =
          (window.fromPrevDay ? -MINUTES_IN_DAY : 0) + startLocal
        let endMinutes = (window.fromPrevDay ? 0 : 0) + endLocal
        if (!window.fromPrevDay && endLocal <= startLocal) {
          endMinutes += MINUTES_IN_DAY
        }
        const visibleStart = Math.max(startMinutes, 0)
        const visibleEnd = Math.min(endMinutes, MINUTES_IN_DAY)
        if (visibleEnd <= visibleStart) return null
        return {
          ...window,
          startMinutes,
          endMinutes,
          visibleStart,
          visibleEnd,
        }
      })
      .filter((value): value is ResolvedWindow => Boolean(value))
  }, [windows])

  const windowById = useMemo(() => {
    const map = new Map<string, ResolvedWindow>()
    for (const window of resolvedWindows) {
      map.set(window.id, window)
    }
    return map
  }, [resolvedWindows])

  const projectInstances = useMemo(() => {
    if (!timezone || !currentDayParts) return []
    const items: Array<{
      instance: ScheduleInstance
      project: typeof projectItems[number]
      startParts: ZonedDateTimeParts
      endParts: ZonedDateTimeParts
      startMinutes: number
      endMinutes: number
      clampedStart: number
      clampedEnd: number
      visibleStart: number
      visibleEnd: number
      window?: ResolvedWindow
    }> = []
    for (const inst of instances) {
      if (inst.source_type !== 'PROJECT') continue
      const project = projectMap[inst.source_id]
      if (!project) continue
      const startParts = getZonedDateTimeParts(new Date(inst.start_utc), timezone)
      const endParts = getZonedDateTimeParts(new Date(inst.end_utc), timezone)
      const startMinutes =
        diffDaysBetween(startParts, currentDayParts) * MINUTES_IN_DAY +
        minutesFromParts(startParts)
      const endMinutes =
        diffDaysBetween(endParts, currentDayParts) * MINUTES_IN_DAY +
        minutesFromParts(endParts)
      const windowInfo = inst.window_id ? windowById.get(inst.window_id) : undefined
      const windowStart = windowInfo ? windowInfo.startMinutes : -Infinity
      const windowEnd = windowInfo ? windowInfo.endMinutes : Infinity
      const clampedStart = Math.max(startMinutes, windowStart)
      const clampedEnd = Math.min(endMinutes, windowEnd)
      const visibleStart = Math.max(clampedStart, 0)
      const visibleEnd = Math.min(clampedEnd, MINUTES_IN_DAY)
      if (visibleEnd <= visibleStart) continue
      items.push({
        instance: inst,
        project,
        startParts,
        endParts,
        startMinutes,
        endMinutes,
        clampedStart,
        clampedEnd,
        visibleStart,
        visibleEnd,
        window: windowInfo,
      })
    }
    items.sort((a, b) => a.startMinutes - b.startMinutes)
    return items
  }, [
    instances,
    projectMap,
    projectItems,
    timezone,
    currentDayParts,
    windowById,
  ])

  const projectInstanceIds = useMemo(() => {
    const set = new Set<string>()
    for (const item of projectInstances) {
      set.add(item.project.id)
    }
    return set
  }, [projectInstances])

  const unscheduledProjects = useMemo(() => {
    return projectItems.filter(project => {
      if (scheduledProjectIds.has(project.id)) return false
      return !projectInstanceIds.has(project.id)
    })
  }, [projectItems, projectInstanceIds, scheduledProjectIds])

  const unscheduledTaskCount = useMemo(() => {
    return unscheduledProjects.reduce((sum, project) => {
      const relatedTasks = tasksByProjectId[project.id] ?? []
      return sum + relatedTasks.length
    }, 0)
  }, [unscheduledProjects, tasksByProjectId])

  const schedulerFailureByProjectId = useMemo(() => {
    if (!schedulerDebug) return {}
    return schedulerDebug.failures.reduce<Record<string, SchedulerRunFailure[]>>(
      (acc, failure) => {
        const id = failure.itemId
        if (!id) return acc
        if (!acc[id]) acc[id] = []
        acc[id].push(failure)
        return acc
      },
      {}
    )
  }, [schedulerDebug])

  const schedulerRunSummary = useMemo(() => {
    if (!schedulerDebug) return null
    const runAt = new Date(schedulerDebug.runAt)
    const timestamp = Number.isNaN(runAt.getTime())
      ? null
      : runAt.toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
    const parts: string[] = []
    if (timestamp) parts.push(`Last run ${timestamp}`)
    parts.push(
      `${schedulerDebug.placedCount} placement${
        schedulerDebug.placedCount === 1 ? '' : 's'
      }`
    )
    parts.push(
      `${schedulerDebug.failures.length} failure${
        schedulerDebug.failures.length === 1 ? '' : 's'
      }`
    )
    return parts.join(' · ')
  }, [schedulerDebug])

  const schedulerErrorMessage = useMemo(() => {
    if (!schedulerDebug) return null
    const text = formatSchedulerDetail(schedulerDebug.error)
    return text && text.length > 0 ? text : null
  }, [schedulerDebug])

  const taskInstancesByProject = useMemo(() => {
    if (!timezone || !currentDayParts) return {}
    const map: Record<
      string,
      Array<{
        instance: ScheduleInstance
        task: TaskLite
        startParts: ZonedDateTimeParts
        endParts: ZonedDateTimeParts
        startMinutes: number
        endMinutes: number
        clampedStart: number
        clampedEnd: number
        visibleStart: number
        visibleEnd: number
        window?: ResolvedWindow
      }>
    > = {}
    for (const inst of instances) {
      if (inst.source_type !== 'TASK') continue
      const task = taskMap[inst.source_id]
      const projectId = task?.project_id ?? null
      if (!task || !projectId) continue
      if (!projectInstanceIds.has(projectId)) continue
      const startParts = getZonedDateTimeParts(new Date(inst.start_utc), timezone)
      const endParts = getZonedDateTimeParts(new Date(inst.end_utc), timezone)
      const startMinutes =
        diffDaysBetween(startParts, currentDayParts) * MINUTES_IN_DAY +
        minutesFromParts(startParts)
      const endMinutes =
        diffDaysBetween(endParts, currentDayParts) * MINUTES_IN_DAY +
        minutesFromParts(endParts)
      const windowInfo = inst.window_id ? windowById.get(inst.window_id) : undefined
      const windowStart = windowInfo ? windowInfo.startMinutes : -Infinity
      const windowEnd = windowInfo ? windowInfo.endMinutes : Infinity
      const clampedStart = Math.max(startMinutes, windowStart)
      const clampedEnd = Math.min(endMinutes, windowEnd)
      const visibleStart = Math.max(clampedStart, 0)
      const visibleEnd = Math.min(clampedEnd, MINUTES_IN_DAY)
      if (visibleEnd <= visibleStart) continue
      const bucket = map[projectId] ?? []
      bucket.push({
        instance: inst,
        task,
        startParts,
        endParts,
        startMinutes,
        endMinutes,
        clampedStart,
        clampedEnd,
        visibleStart,
        visibleEnd,
        window: windowInfo,
      })
      map[projectId] = bucket
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.startMinutes - b.startMinutes)
    }
    return map
  }, [
    instances,
    taskMap,
    projectInstanceIds,
    timezone,
    currentDayParts,
    windowById,
  ])

  const standaloneTaskInstances = useMemo(() => {
    if (!timezone || !currentDayParts) return []
    const items: Array<{
      instance: ScheduleInstance
      task: TaskLite
      startParts: ZonedDateTimeParts
      endParts: ZonedDateTimeParts
      startMinutes: number
      endMinutes: number
      clampedStart: number
      clampedEnd: number
      visibleStart: number
      visibleEnd: number
      window?: ResolvedWindow
    }> = []
    for (const inst of instances) {
      if (inst.source_type !== 'TASK') continue
      const task = taskMap[inst.source_id]
      if (!task) continue
      const projectId = task.project_id ?? undefined
      if (projectId && projectInstanceIds.has(projectId)) continue
      const startParts = getZonedDateTimeParts(new Date(inst.start_utc), timezone)
      const endParts = getZonedDateTimeParts(new Date(inst.end_utc), timezone)
      const startMinutes =
        diffDaysBetween(startParts, currentDayParts) * MINUTES_IN_DAY +
        minutesFromParts(startParts)
      const endMinutes =
        diffDaysBetween(endParts, currentDayParts) * MINUTES_IN_DAY +
        minutesFromParts(endParts)
      const windowInfo = inst.window_id ? windowById.get(inst.window_id) : undefined
      const windowStart = windowInfo ? windowInfo.startMinutes : -Infinity
      const windowEnd = windowInfo ? windowInfo.endMinutes : Infinity
      const clampedStart = Math.max(startMinutes, windowStart)
      const clampedEnd = Math.min(endMinutes, windowEnd)
      const visibleStart = Math.max(clampedStart, 0)
      const visibleEnd = Math.min(clampedEnd, MINUTES_IN_DAY)
      if (visibleEnd <= visibleStart) continue
      items.push({
        instance: inst,
        task,
        startParts,
        endParts,
        startMinutes,
        endMinutes,
        clampedStart,
        clampedEnd,
        visibleStart,
        visibleEnd,
        window: windowInfo,
      })
    }
    items.sort((a, b) => a.startMinutes - b.startMinutes)
    return items
  }, [
    instances,
    taskMap,
    projectInstanceIds,
    timezone,
    currentDayParts,
    windowById,
  ])

  const handleInstanceStatusChange = useCallback(
    async (
      instanceId: string,
      status: 'completed' | 'canceled',
      options?: { projectId?: string }
    ) => {
      if (!userId) {
        console.warn('No user session available for status update')
        return
      }

      setPendingInstanceIds(prev => {
        const next = new Set(prev)
        next.add(instanceId)
        return next
      })

      try {
        const { error } = await updateInstanceStatus(instanceId, status)
        if (error) {
          console.error(error)
          return
        }

        setInstances(prev => {
          const updated = prev.map(inst =>
            inst.id === instanceId
              ? {
                  ...inst,
                  status,
                  completed_at:
                    status === 'completed' ? new Date().toISOString() : null,
                }
              : inst
          )
          return status === 'canceled'
            ? updated.filter(inst => inst.id !== instanceId)
            : updated
        })

        if (status === 'canceled' && options?.projectId) {
          setExpandedProjects(prev => {
            if (!prev.has(options.projectId)) return prev
            const next = new Set(prev)
            next.delete(options.projectId)
            return next
          })
        }
      } catch (error) {
        console.error(error)
      } finally {
        setPendingInstanceIds(prev => {
          const next = new Set(prev)
          next.delete(instanceId)
          return next
        })
      }
    },
    [userId, setInstances, setExpandedProjects]
  )

  const handleMarkCompleted = useCallback(
    (instanceId: string, options?: { projectId?: string }) =>
      handleInstanceStatusChange(instanceId, 'completed', options),
    [handleInstanceStatusChange]
  )

  const handleCancelInstance = useCallback(
    (instanceId: string, options?: { projectId?: string }) =>
      handleInstanceStatusChange(instanceId, 'canceled', options),
    [handleInstanceStatusChange]
  )

  const renderInstanceActions = (
    instanceId: string,
    options?: { projectId?: string }
  ) => {
    const pending = pendingInstanceIds.has(instanceId)
    return (
      <div className="absolute top-1 right-8 flex gap-1 text-[10px] uppercase text-white/70">
        <button
          type="button"
          className="rounded bg-white/10 px-2 py-0.5 tracking-wide hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={pending}
          onClick={event => {
            event.stopPropagation()
            if (pending) return
            void handleMarkCompleted(instanceId, options)
          }}
        >
          done
        </button>
        <button
          type="button"
          className="rounded bg-white/10 px-2 py-0.5 tracking-wide hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={pending}
          onClick={event => {
            event.stopPropagation()
            if (pending) return
            void handleCancelInstance(instanceId, options)
          }}
        >
          cancel
        </button>
      </div>
    )
  }

  function navigate(next: ScheduleView) {
    if (navLock.current) return
    navLock.current = true
    setView(next)
    setTimeout(() => {
      navLock.current = false
    }, 300)
  }

  function handleBack() {
    if (view === 'year') {
      router.push('/dashboard')
      return
    }

    const parent = getParentView(view)
    if (parent !== view) navigate(parent)
  }

  function handleDrillDown(date: Date) {
    const next = getChildView(view, date)
    if (timezone) {
      setCurrentDateKey(getDayKeyForDate(next.date, timezone))
    }
    if (next.view !== view) navigate(next.view)
  }

  const handleToday = () => {
    if (timezone) {
      setCurrentDateKey(getDayKeyForDate(new Date(), timezone))
    }
    navigate('day')
  }

  const handleSaveTimezonePreference = async () => {
    const trimmed = timezoneInput.trim()
    setTimezoneSaving(true)
    setTimezoneMessage(null)
    setTimezoneError(null)
    try {
      const response = await fetch('/api/profile/timezone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timezone: trimmed.length > 0 ? trimmed : null,
        }),
      })
      const result = (await response.json()) as {
        success: boolean
        timezone?: string | null
        error?: string
      }
      if (!response.ok || !result.success) {
        setTimezoneError(result.error ?? 'Failed to update timezone')
        return
      }
      const normalized = typeof result.timezone === 'string' ? result.timezone : ''
      setTimezoneInput(normalized)
      setTimezoneMessage(
        normalized
          ? `Timezone saved as ${normalized}.`
          : 'Timezone cleared. Choose a timezone to unlock the schedule.'
      )
      await refreshProfile()
    } catch (error) {
      console.error('Failed to update timezone', error)
      setTimezoneError('Failed to update timezone')
    } finally {
      setTimezoneSaving(false)
    }
  }

  const handleUseBrowserTimezone = () => {
    setTimezoneInput(browserTimezone)
    setTimezoneMessage(null)
    setTimezoneError(null)
  }

  const handleClearTimezonePreference = () => {
    setTimezoneInput('')
    setTimezoneMessage(null)
    setTimezoneError(null)
  }

  if (profileLoading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-400">
          Loading profile…
        </div>
      </ProtectedRoute>
    )
  }

  if (!timezone) {
    return (
      <ProtectedRoute>
        <div className="px-4 py-10">
          <div className="mx-auto max-w-md rounded-lg border border-white/10 bg-[var(--surface)]/90 p-6 text-center text-zinc-100 shadow-[var(--elev-overlay)]">
            <h1 className="text-xl font-semibold text-[var(--text)]">Set your timezone</h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              We need your timezone before showing the scheduler so project windows align with their Supabase timestamps.
            </p>
            <div className="mt-5 space-y-3 text-left">
              <TimezoneSelect
                label="Preferred timezone"
                value={timezoneInput}
                onChange={(value) => {
                  setTimezoneInput(value)
                  setTimezoneMessage(null)
                  setTimezoneError(null)
                }}
                options={timezoneOptions}
                placeholder={browserTimezone}
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveTimezonePreference}
                  disabled={timezoneSaving}
                  className="inline-flex items-center rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {timezoneSaving ? 'Saving…' : 'Save timezone'}
                </button>
                <button
                  type="button"
                  onClick={handleUseBrowserTimezone}
                  disabled={timezoneSaving}
                  className="inline-flex items-center rounded-md border border-white/10 px-3 py-2 text-sm text-[var(--text)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Use browser timezone
                </button>
                <button
                  type="button"
                  onClick={handleClearTimezonePreference}
                  disabled={timezoneSaving || timezoneInput.trim().length === 0}
                  className="inline-flex items-center rounded-md px-2 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
              <div aria-live="polite" className="min-h-[1.25rem] text-sm">
                {timezoneMessage && <span className="text-emerald-400">{timezoneMessage}</span>}
                {timezoneError && <span className="text-red-400">{timezoneError}</span>}
              </div>
              <p className="text-xs text-[var(--muted)]">
                Browser timezone: <span className="font-mono text-[var(--text)]">{browserTimezone}</span>
              </p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }
  useEffect(() => {
    if (!userId || !timezone || !currentDate) {
      setInstances([])
      setInstancesStatus('idle')
      loadInstancesRef.current = async () => {}
      return
    }

    let active = true

    const load = async () => {
      if (!active) return
      setInstancesStatus('loading')
      try {
        const { startUTC, endUTC } = utcDayRange(currentDate)
        const { data, error } = await fetchInstancesForRange(
          userId,
          startUTC,
          endUTC
        )
        if (!active) return
        if (error) {
          console.error(error)
          setInstances([])
        } else {
          setInstances(data ?? [])
        }
      } catch (e) {
        if (!active) return
        console.error(e)
        setInstances([])
      } finally {
        if (!active) return
        setInstancesStatus('loaded')
      }
    }

    loadInstancesRef.current = load
    void load()
    const id = setInterval(() => {
      void load()
    }, 5 * 60 * 1000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [userId, currentDate, timezone])

  const runScheduler = useCallback(async () => {
    if (!userId) {
      console.warn('No user session available for scheduler run')
      return
    }
    if (isSchedulingRef.current) return
    isSchedulingRef.current = true
    try {
      const response = await fetch('/api/scheduler/run', {
        method: 'POST',
        cache: 'no-store',
      })
      let payload: unknown = null
      let parseError: unknown = null
      try {
        payload = await response.json()
      } catch (err) {
        parseError = err
      }

      if (!response.ok) {
        console.error('Scheduler run failed', response.status, payload ?? parseError)
      }

      const parsed = parseSchedulerDebugPayload(payload)
      if (parsed) {
        setSchedulerDebug({
          runAt: new Date().toISOString(),
          ...parsed,
        })
        if (parsed.placedProjectIds.length > 0) {
          setScheduledProjectIds(prev => {
            let changed = false
            const next = new Set(prev)
            for (const id of parsed.placedProjectIds) {
              if (!next.has(id)) {
                next.add(id)
                changed = true
              }
            }
            return changed ? next : prev
          })
        }
      } else {
        if (parseError) {
          console.error('Failed to parse scheduler response', parseError)
        }
        const fallbackError =
          parseError ??
          (!response.ok
            ? payload
            : { message: 'Scheduler response missing schedule payload' })
        setSchedulerDebug({
          runAt: new Date().toISOString(),
          failures: [],
          placedCount: 0,
          placedProjectIds: [],
          error: fallbackError,
        })
      }
    } catch (error) {
      console.error('Failed to run scheduler', error)
      setSchedulerDebug({
        runAt: new Date().toISOString(),
        failures: [],
        placedCount: 0,
        placedProjectIds: [],
        error,
      })
    } finally {
      isSchedulingRef.current = false
      try {
        await loadInstancesRef.current()
      } catch (error) {
        console.error('Failed to reload schedule instances', error)
      }
      try {
        await refreshScheduledProjectIds()
      } catch (error) {
        console.error('Failed to refresh scheduled project history', error)
      }
    }
  }, [userId, refreshScheduledProjectIds])

  useEffect(() => {
    autoScheduledForRef.current = null
  }, [userId, currentDayKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const globalWithScheduler = window as typeof window & {
      __runScheduler?: () => Promise<void>
    }
    globalWithScheduler.__runScheduler = runScheduler
    return () => {
      delete globalWithScheduler.__runScheduler
    }
  }, [runScheduler])

  useEffect(() => {
    if (!userId || !timezone || !currentDate) return
    if (metaStatus !== 'loaded' || instancesStatus !== 'loaded') return
    if (instances.length > 0) return
    if (isSchedulingRef.current) return
    const { startUTC } = utcDayRange(currentDate)
    const key = `${userId}:${startUTC}`
    if (autoScheduledForRef.current === key) return
    autoScheduledForRef.current = key
    void runScheduler()
  }, [
    userId,
    timezone,
    currentDate,
    metaStatus,
    instancesStatus,
    instances.length,
    runScheduler,
  ])

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (view !== 'day') return
    if (touchStartX.current === null) return
    const diff = e.changedTouches[0].clientX - touchStartX.current
    const threshold = 50
    if (Math.abs(diff) > threshold) {
      if (timezone) {
        setCurrentDateKey(prev => {
          if (!prev) return prev
          return shiftDateKey(prev, diff < 0 ? 1 : -1, timezone)
        })
      }
    }
    touchStartX.current = null
  }

  return (
    <ProtectedRoute>
      <div className="space-y-4 text-zinc-100">
        <ScheduleTopBar
          year={year}
          onBack={handleBack}
          onToday={handleToday}
        />
        <div
          className="relative bg-[var(--surface)]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <AnimatePresence mode="wait" initial={false}>
            {view === 'year' && (
              <ScheduleViewShell key="year">
                <YearView
                  energies={dayEnergies}
                  timeZone={timezone}
                  selectedDayKey={currentDayKey ?? null}
                  onSelectDate={handleDrillDown}
                />
              </ScheduleViewShell>
            )}
            {view === 'month' && (
              <ScheduleViewShell key="month">
                <MonthView
                  timeZone={timezone}
                  anchorDayKey={currentDayKey ?? null}
                  energies={dayEnergies}
                  selectedDayKey={currentDayKey ?? null}
                  onSelectDate={handleDrillDown}
                />
              </ScheduleViewShell>
            )}
            {view === 'day' && (
              <ScheduleViewShell key="day">
                {/* source of truth: schedule_instances */}
                <div className="text-[10px] opacity-60 px-2">data source: schedule_instances</div>
                <DayTimeline
                  startHour={startHour}
                  pxPerMin={pxPerMin}
                  timeZone={timezone}
                  dayKey={currentDayKey ?? null}
                >
                  {resolvedWindows.map(w => {
                    const { top, height } = windowRect(w, startHour, pxPerMin)
                    const windowHeightPx =
                      typeof height === 'number' ? Math.max(0, height) : 0
                    return (
                      <div
                        key={w.id}
                        aria-label={w.label}
                        className="absolute left-0 flex"
                        style={{ top, height }}
                      >
                        <div className="w-0.5 bg-zinc-700 opacity-50" />
                        <WindowLabel
                          label={w.label ?? ''}
                          availableHeight={windowHeightPx}
                        />
                      </div>
                    )
                  })}
                  {projectInstances.map(
                    (
                      {
                        instance,
                        project,
                        clampedStart,
                        clampedEnd,
                        visibleStart,
                        visibleEnd,
                      },
                      index,
                    ) => {
                    const projectId = project.id
                    const displayStart = Math.max(
                      visibleStart,
                      timelineStartMinutes,
                    )
                    const displayEnd = Math.max(displayStart, visibleEnd)
                    const top = (displayStart - timelineStartMinutes) * pxPerMin
                    const height = Math.max(
                      0,
                      (displayEnd - displayStart) * pxPerMin,
                    )
                    if (height <= 0) return null
                    const isExpanded = expandedProjects.has(projectId)
                    const tasksForProject = taskInstancesByProject[projectId] || []
                    const durationMinutes = Math.max(
                      0,
                      Math.round(clampedEnd - clampedStart),
                    )
                    const style: CSSProperties = {
                      top,
                      height,
                      boxShadow: 'var(--elev-card)',
                      outline: '1px solid var(--event-border)',
                      outlineOffset: '-1px',
                    }
                    return (
                      <AnimatePresence
                        key={instance.id}
                        initial={false}
                        mode="wait"
                      >
                        {!isExpanded || tasksForProject.length === 0 ? (
                          <motion.div
                            key="project"
                            aria-label={`Project ${project.name}`}
                            onClick={() => {
                              if (tasksForProject.length === 0) return
                              setExpandedProjects(prev => {
                                const next = new Set(prev)
                                if (next.has(projectId)) next.delete(projectId)
                                else next.add(projectId)
                                return next
                              })
                            }}
                            className="absolute left-16 right-2 flex items-center justify-between rounded-[var(--radius-lg)] bg-[var(--event-bg)] px-3 py-2 text-white"
                            style={style}
                            initial={
                              prefersReducedMotion ? false : { opacity: 0, y: 4 }
                            }
                            animate={
                              prefersReducedMotion ? undefined : { opacity: 1, y: 0 }
                            }
                            exit={
                              prefersReducedMotion
                                ? undefined
                                : { opacity: 0, y: 4 }
                            }
                            transition={
                              prefersReducedMotion
                                ? undefined
                                : { delay: index * 0.02 }
                            }
                          >
                            {renderInstanceActions(instance.id, { projectId })}
                            <div className="flex flex-col">
                              <span className="truncate text-sm font-medium">
                                {project.name}
                              </span>
                              <div className="text-xs text-zinc-200/70">
                                {durationMinutes}m
                                {project.taskCount > 0 && (
                                  <span> · {project.taskCount} tasks</span>
                                )}
                              </div>
                            </div>
                            {project.skill_icon && (
                              <span
                                className="ml-2 text-lg leading-none flex-shrink-0"
                                aria-hidden
                              >
                                {project.skill_icon}
                              </span>
                            )}
                            <FlameEmber
                              level={
                                (instance.energy_resolved?.toUpperCase() as FlameLevel) ||
                                'NO'
                              }
                              size="sm"
                              className="absolute -top-1 -right-1"
                            />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="tasks"
                            initial={
                              prefersReducedMotion
                                ? false
                                : { opacity: 0, y: 4 }
                            }
                            animate={
                              prefersReducedMotion
                                ? undefined
                                : { opacity: 1, y: 0 }
                            }
                            exit={
                              prefersReducedMotion
                                ? undefined
                                : { opacity: 0, y: 4 }
                            }
                            transition={
                              prefersReducedMotion
                                ? undefined
                                : { delay: index * 0.02 }
                            }
                          >
                            {tasksForProject.map(taskInfo => {
                              const {
                                instance: taskInstance,
                                task,
                                clampedStart: taskClampedStart,
                                clampedEnd: taskClampedEnd,
                                visibleStart: taskVisibleStart,
                                visibleEnd: taskVisibleEnd,
                              } = taskInfo
                              const taskDisplayStart = Math.max(
                                taskVisibleStart,
                                timelineStartMinutes,
                              )
                              const taskDisplayEnd = Math.max(
                                taskDisplayStart,
                                taskVisibleEnd,
                              )
                              const tTop =
                                (taskDisplayStart - timelineStartMinutes) * pxPerMin
                              const tHeight = Math.max(
                                0,
                                (taskDisplayEnd - taskDisplayStart) * pxPerMin,
                              )
                              if (tHeight <= 0) return null
                              const taskDurationMinutes = Math.max(
                                0,
                                Math.round(taskClampedEnd - taskClampedStart),
                              )
                              const tStyle: CSSProperties = {
                                top: tTop,
                                height: tHeight,
                                boxShadow: 'var(--elev-card)',
                                outline: '1px solid var(--event-border)',
                                outlineOffset: '-1px',
                              }
                              const progress =
                                (task as { progress?: number }).progress ?? 0
                              return (
                                <motion.div
                                  key={taskInstance.id}
                                  aria-label={`Task ${task.name}`}
                                  className="absolute left-16 right-2 flex items-center justify-between rounded-[var(--radius-lg)] bg-stone-700 px-3 py-2 text-white"
                                  style={tStyle}
                                  onClick={() =>
                                    setExpandedProjects(prev => {
                                      const next = new Set(prev)
                                      next.delete(projectId)
                                      return next
                                    })
                                  }
                                  initial={
                                    prefersReducedMotion
                                      ? false
                                      : { opacity: 0, y: 4 }
                                  }
                                  animate={
                                    prefersReducedMotion
                                      ? undefined
                                      : { opacity: 1, y: 0 }
                                  }
                                  exit={
                                    prefersReducedMotion
                                      ? undefined
                                      : { opacity: 0, y: 4 }
                                  }
                                >
                                  {renderInstanceActions(taskInstance.id, { projectId })}
                                  <div className="flex flex-col">
                                    <span className="truncate text-sm font-medium">
                                      {task.name}
                                    </span>
                                    <div className="text-xs text-zinc-200/70">
                                      {taskDurationMinutes}m
                                    </div>
                                  </div>
                                  {task.skill_icon && (
                                    <span
                                      className="ml-2 text-lg leading-none flex-shrink-0"
                                      aria-hidden
                                    >
                                      {task.skill_icon}
                                    </span>
                                  )}
                                  <FlameEmber
                                    level={(task.energy as FlameLevel) || 'NO'}
                                    size="sm"
                                    className="absolute -top-1 -right-1"
                                  />
                                  <div
                                    className="absolute left-0 bottom-0 h-[3px] bg-white/30"
                                    style={{ width: `${progress}%` }}
                                  />
                                </motion.div>
                              )
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )
                  })}
                  {standaloneTaskInstances.map(
                    ({
                      instance,
                      task,
                      clampedStart: standaloneClampedStart,
                      clampedEnd: standaloneClampedEnd,
                      visibleStart: standaloneVisibleStart,
                      visibleEnd: standaloneVisibleEnd,
                    }) => {
                    const displayStart = Math.max(
                      standaloneVisibleStart,
                      timelineStartMinutes,
                    )
                    const displayEnd = Math.max(
                      displayStart,
                      standaloneVisibleEnd,
                    )
                    const top =
                      (displayStart - timelineStartMinutes) * pxPerMin
                    const height = Math.max(
                      0,
                      (displayEnd - displayStart) * pxPerMin,
                    )
                    if (height <= 0) return null
                    const style: CSSProperties = {
                      top,
                      height,
                      boxShadow: 'var(--elev-card)',
                      outline: '1px solid var(--event-border)',
                      outlineOffset: '-1px',
                    }
                    const progress = (task as { progress?: number }).progress ?? 0
                    return (
                      <motion.div
                        key={instance.id}
                        aria-label={`Task ${task.name}`}
                        className="absolute left-16 right-2 flex items-center justify-between rounded-[var(--radius-lg)] bg-stone-700 px-3 py-2 text-white"
                        style={style}
                        initial={
                          prefersReducedMotion ? false : { opacity: 0, y: 4 }
                        }
                        animate={
                          prefersReducedMotion ? undefined : { opacity: 1, y: 0 }
                        }
                        exit={
                          prefersReducedMotion ? undefined : { opacity: 0, y: 4 }
                        }
                      >
                        {renderInstanceActions(instance.id)}
                        <div className="flex flex-col">
                          <span className="truncate text-sm font-medium">
                            {task.name}
                          </span>
                          <div className="text-xs text-zinc-200/70">
                            {Math.max(
                              0,
                              Math.round(
                                standaloneClampedEnd - standaloneClampedStart,
                              ),
                            )}
                            m
                          </div>
                        </div>
                        {task.skill_icon && (
                          <span
                            className="ml-2 text-lg leading-none flex-shrink-0"
                            aria-hidden
                          >
                            {task.skill_icon}
                          </span>
                        )}
                        <FlameEmber
                          level={(task.energy as FlameLevel) || 'NO'}
                          size="sm"
                          className="absolute -top-1 -right-1"
                        />
                        <div
                          className="absolute left-0 bottom-0 h-[3px] bg-white/30"
                          style={{ width: `${progress}%` }}
                        />
                      </motion.div>
                    )
                  })}
                </DayTimeline>
              </ScheduleViewShell>
            )}
            {view === 'focus' && (
              <ScheduleViewShell key="focus">
                <FocusTimeline timeZone={timezone} dayKey={currentDayKey ?? null} />
              </ScheduleViewShell>
            )}
          </AnimatePresence>
        </div>
        {metaStatus === 'loaded' && instancesStatus === 'loaded' && (
          <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 p-4 text-[11px] text-amber-100">
            <div className="flex flex-wrap items-center justify-between gap-2 text-amber-200">
              <span className="font-semibold uppercase tracking-wide">
                Unscheduled projects (debug)
              </span>
              <span>
                {unscheduledProjects.length} project
                {unscheduledProjects.length === 1 ? '' : 's'}
                {unscheduledTaskCount > 0 && (
                  <>
                    {' '}
                    · {unscheduledTaskCount} task
                    {unscheduledTaskCount === 1 ? '' : 's'}
                  </>
                )}
              </span>
            </div>
            {schedulerDebug ? (
              <div className="mt-2 space-y-1 text-[10px] text-amber-200/70">
                {schedulerRunSummary && <div>{schedulerRunSummary}</div>}
                {schedulerErrorMessage && (
                  <div className="text-amber-200/60">
                    Scheduler error: {schedulerErrorMessage}
                  </div>
                )}
              </div>
            ) : (
              unscheduledProjects.length > 0 && (
                <p className="mt-2 text-[10px] text-amber-200/60">
                  Run the scheduler (call{' '}
                  <code className="rounded bg-amber-500/20 px-1 py-[1px]">
                    window.__runScheduler()
                  </code>
                  ) to capture failure diagnostics for these projects.
                </p>
              )
            )}
            {unscheduledProjects.length === 0 ? (
              <p className="mt-2 text-amber-200/80">
                All projects currently have at least one scheduled instance.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {unscheduledProjects.map(project => {
                  const relatedTasks = tasksByProjectId[project.id] ?? []
                  const failures = schedulerFailureByProjectId[project.id] ?? []
                  const diagnostics = failures.map(failure =>
                    describeSchedulerFailure(failure, {
                      durationMinutes: project.duration_min,
                      energy: project.energy,
                    })
                  )
                  return (
                    <li
                      key={project.id}
                      className="rounded-md bg-amber-500/5 p-3 text-amber-100"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="text-sm font-medium text-amber-50">
                          {project.name || 'Untitled project'}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-amber-200/70">
                          {project.id}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-amber-200/70">
                        <span>Stage: {project.stage}</span>
                        <span>Priority: {project.priority}</span>
                        <span>Duration: {Math.round(project.duration_min)}m</span>
                        <span>Energy: {project.energy}</span>
                      </div>
                      {relatedTasks.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-50">
                          {relatedTasks.map(task => (
                            <li key={task.id}>
                              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                                <span className="font-medium">{task.name}</span>
                                <span className="text-[10px] text-amber-200/70">
                                  {task.duration_min}m · {task.priority} · {task.stage}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-[10px] text-amber-200/70">
                          No ready tasks linked to this project.
                        </p>
                      )}
                      <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/10 p-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                          Scheduler diagnostics
                        </div>
                        {diagnostics.length > 0 ? (
                          <ul className="mt-1 space-y-1 text-[10px] text-amber-200/80">
                            {diagnostics.map((diag, index) => (
                              <li key={`${project.id}-diag-${index}`}>
                                <span>{diag.message}</span>
                                {diag.detail && (
                                  <div className="text-amber-200/60">{diag.detail}</div>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : schedulerDebug ? (
                          <p className="mt-1 text-[10px] text-amber-200/70">
                            {schedulerErrorMessage
                              ? `Scheduler run ended with an error: ${schedulerErrorMessage}`
                              : 'Last scheduler run did not report a project-specific failure.'}
                          </p>
                        ) : (
                          <p className="mt-1 text-[10px] text-amber-200/70">
                            Diagnostics unavailable until the scheduler runs.
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
