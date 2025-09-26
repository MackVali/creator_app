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
import { formatLocalDateKey, toLocal } from '@/lib/time/tz'

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
  const safeHeight = Number.isFinite(availableHeight)
    ? Math.max(0, availableHeight)
    : 0

  useLayoutEffect(() => {
    const el = spanRef.current
    if (!el) return

    if (!label || safeHeight <= 0) {
      setShouldWrap(prev => (prev ? false : prev))
      return
    }

    const previousWhiteSpace = el.style.whiteSpace
    const previousWordBreak = el.style.wordBreak
    const previousMaxHeight = el.style.maxHeight
    const previousMaxWidth = el.style.maxWidth
    const previousMaxInlineSize = el.style.maxInlineSize
    if (safeHeight > 0) {
      el.style.maxHeight = ''
      el.style.maxWidth = ''
      el.style.maxInlineSize = ''
    }
    el.style.whiteSpace = 'nowrap'
    el.style.wordBreak = 'keep-all'
    const measuredHeight = Math.ceil(el.getBoundingClientRect().height)
    el.style.whiteSpace = previousWhiteSpace
    el.style.wordBreak = previousWordBreak
    el.style.maxHeight = previousMaxHeight
    el.style.maxWidth = previousMaxWidth
    el.style.maxInlineSize = previousMaxInlineSize

    const nextShouldWrap = measuredHeight - safeHeight > 1
    setShouldWrap(prev => (prev === nextShouldWrap ? prev : nextShouldWrap))
  }, [label, safeHeight])

  return (
    <span
      ref={spanRef}
      title={label}
      className="ml-1 text-[10px] leading-none text-zinc-500"
      style={{
        display: 'inline-block',
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        whiteSpace: shouldWrap ? 'normal' : 'nowrap',
        wordBreak: shouldWrap ? 'break-word' : 'keep-all',
        overflowWrap: shouldWrap ? 'anywhere' : undefined,
        overflow: 'hidden',
        maxHeight: safeHeight || undefined,
        maxWidth: safeHeight || undefined,
        maxInlineSize: safeHeight || undefined,
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

const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const TASK_INSTANCE_MATCH_TOLERANCE_MS = 60 * 1000
const MAX_FALLBACK_TASKS = 12

function formatTimeRangeLabel(start: Date, end: Date) {
  return `${TIME_FORMATTER.format(start)} – ${TIME_FORMATTER.format(end)}`
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

type TaskInstanceInfo = {
  instance: ScheduleInstance
  task: TaskLite
  start: Date
  end: Date
}

type ProjectTaskCard = {
  key: string
  task: TaskLite
  start: Date
  end: Date
  kind: 'scheduled' | 'fallback'
  instanceId?: string
  displayDurationMinutes: number
}

function taskMatchesProjectInstance(
  taskInfo: TaskInstanceInfo,
  projectInstance: ScheduleInstance,
  projectStart: Date,
  projectEnd: Date
) {
  const projectWindowId = projectInstance.window_id
  const taskWindowId = taskInfo.instance.window_id
  if (projectWindowId && taskWindowId && projectWindowId !== taskWindowId) {
    return false
  }

  const tolerance = TASK_INSTANCE_MATCH_TOLERANCE_MS
  const taskStart = taskInfo.start.getTime()
  const taskEnd = taskInfo.end.getTime()
  const instanceStart = projectStart.getTime()
  const instanceEnd = projectEnd.getTime()

  if (taskEnd <= instanceStart - tolerance) return false
  if (taskStart >= instanceEnd + tolerance) return false
  if (taskStart < instanceStart - tolerance) return false
  if (taskEnd > instanceEnd + tolerance) return false

  return true
}

function buildFallbackTaskCards({
  tasks,
  projectStart,
  projectEnd,
  instanceId,
  maxCount,
}: {
  tasks: TaskLite[]
  projectStart: Date
  projectEnd: Date
  instanceId: string
  maxCount: number
}): ProjectTaskCard[] {
  if (!tasks.length || maxCount <= 0) return []

  const projectDurationMs = Math.max(projectEnd.getTime() - projectStart.getTime(), 1)
  const limited = tasks.slice(0, maxCount)
  const durations = limited.map(task => {
    const raw = Number(task.duration_min ?? 0)
    return Number.isFinite(raw) && raw > 0 ? raw : 0
  })
  const totalDuration = durations.reduce((sum, value) => sum + value, 0)

  let accumulatedRatio = 0
  const fallbackCards: ProjectTaskCard[] = []

  for (let index = 0; index < limited.length; index += 1) {
    const task = limited[index]
    const availableRatio = Math.max(0, 1 - accumulatedRatio)
    if (availableRatio <= 0) break

    const durationValue = durations[index]
    let ratioShare: number
    if (totalDuration > 0 && durationValue > 0) {
      ratioShare = (durationValue / totalDuration) * (1 - accumulatedRatio)
    } else {
      const remaining = limited.length - index
      ratioShare = remaining > 0 ? availableRatio / remaining : availableRatio
    }

    if (index === limited.length - 1) {
      ratioShare = availableRatio
    } else if (ratioShare > availableRatio) {
      ratioShare = availableRatio
    }

    const startRatio = accumulatedRatio
    const endRatio = Math.min(1, startRatio + ratioShare)
    accumulatedRatio = endRatio

    const startTime = new Date(projectStart.getTime() + startRatio * projectDurationMs)
    const endTime = new Date(projectStart.getTime() + endRatio * projectDurationMs)
    const fallbackDuration =
      durationValue > 0
        ? durationValue
        : (ratioShare * projectDurationMs) / 60000

    fallbackCards.push({
      key: `fallback:${instanceId}:${task.id}:${index}`,
      kind: 'fallback',
      task,
      start: startTime,
      end: endTime,
      displayDurationMinutes: Math.max(1, Math.round(fallbackDuration || 0)),
    })
  }

  if (fallbackCards.length > 0) {
    const last = fallbackCards[fallbackCards.length - 1]
    last.end = new Date(projectEnd.getTime())
  }

  return fallbackCards
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

  const initialViewParam = searchParams.get('view') as ScheduleView | null
  const initialView: ScheduleView =
    initialViewParam && ['year', 'month', 'day', 'focus'].includes(initialViewParam)
      ? initialViewParam
      : 'year'
  const initialDate = searchParams.get('date')

  const [currentDate, setCurrentDate] = useState(
    () => (initialDate ? new Date(initialDate) : new Date())
  )
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
  const [hasInteractedWithProjects, setHasInteractedWithProjects] = useState(false)
  const setProjectExpansion = useCallback(
    (projectId: string, nextState?: boolean) => {
      setHasInteractedWithProjects(true)
      setExpandedProjects(prev => {
        const next = new Set(prev)
        const shouldExpand =
          typeof nextState === 'boolean' ? nextState : !next.has(projectId)
        if (shouldExpand) next.add(projectId)
        else next.delete(projectId)
        return next
      })
    },
    [setExpandedProjects, setHasInteractedWithProjects]
  )
  const touchStartX = useRef<number | null>(null)
  const navLock = useRef(false)
  const loadInstancesRef = useRef<() => Promise<void>>(async () => {})
  const isSchedulingRef = useRef(false)
  const autoScheduledForRef = useRef<string | null>(null)

  const startHour = 0
  const pxPerMin = 2
  const year = currentDate.getFullYear()

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
    params.set('date', formatLocalDateKey(currentDate))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [view, currentDate, router, pathname])

  useEffect(() => {
    if (!userId) {
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
  }, [currentDate, userId])
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

  const windowMap = useMemo(() => {
    const map: Record<string, RepoWindow> = {}
    for (const w of windows) map[w.id] = w
    return map
  }, [windows])

  const dayEnergies = useMemo(() => {
    const map: Record<string, FlameLevel> = {}
    for (const inst of instances) {
      const start = toLocal(inst.start_utc)
      const key = formatLocalDateKey(start)
      const level = (inst.energy_resolved?.toUpperCase() as FlameLevel) || 'NO'
      const current = map[key]
      if (!current || ENERGY.LIST.indexOf(level) > ENERGY.LIST.indexOf(current)) {
        map[key] = level
      }
    }
    return map
  }, [instances])

  const projectInstances = useMemo(() => {
    return instances
      .filter(inst => inst.source_type === 'PROJECT')
      .map(inst => {
        const project = projectMap[inst.source_id]
        if (!project) return null
        return {
          instance: inst,
          project,
          start: toLocal(inst.start_utc),
          end: toLocal(inst.end_utc),
          assignedWindow: inst.window_id
            ? windowMap[inst.window_id] ?? null
            : null,
        }
      })
      .filter((value): value is {
        instance: ScheduleInstance
        project: typeof projectItems[number]
        start: Date
        end: Date
        assignedWindow: RepoWindow | null
      } => value !== null)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
  }, [instances, projectMap, projectItems, windowMap])

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
    const map: Record<string, TaskInstanceInfo[]> = {}
    for (const inst of instances) {
      if (inst.source_type !== 'TASK') continue
      const task = taskMap[inst.source_id]
      const projectId = task?.project_id ?? null
      if (!task || !projectId) continue
      if (!projectInstanceIds.has(projectId)) continue
      const bucket = map[projectId] ?? []
      bucket.push({
        instance: inst,
        task,
        start: toLocal(inst.start_utc),
        end: toLocal(inst.end_utc),
      })
      map[projectId] = bucket
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.start.getTime() - b.start.getTime())
    }
    return map
  }, [instances, taskMap, projectInstanceIds])

  const standaloneTaskInstances = useMemo(() => {
    const items: TaskInstanceInfo[] = []
    for (const inst of instances) {
      if (inst.source_type !== 'TASK') continue
      const task = taskMap[inst.source_id]
      if (!task) continue
      const projectId = task.project_id ?? undefined
      if (projectId && projectInstanceIds.has(projectId)) continue
      items.push({
        instance: inst,
        task,
        start: toLocal(inst.start_utc),
        end: toLocal(inst.end_utc),
      })
    }
    items.sort((a, b) => a.start.getTime() - b.start.getTime())
    return items
  }, [instances, taskMap, projectInstanceIds])

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
          setProjectExpansion(options.projectId, false)
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
    [userId, setInstances, setProjectExpansion]
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
    options?: { projectId?: string; appearance?: 'light' | 'dark' }
  ) => {
    const pending = pendingInstanceIds.has(instanceId)
    const appearance = options?.appearance ?? 'dark'
    const projectOptions = options?.projectId
      ? { projectId: options.projectId }
      : undefined
    const containerClass =
      appearance === 'light'
        ? 'absolute top-1 right-8 flex gap-1 text-[10px] uppercase text-zinc-800/80'
        : 'absolute top-1 right-8 flex gap-1 text-[10px] uppercase text-white/70'
    const buttonClass =
      appearance === 'light'
        ? 'rounded bg-black/10 px-2 py-0.5 tracking-wide hover:bg-black/20 disabled:cursor-not-allowed disabled:opacity-40'
        : 'rounded bg-white/10 px-2 py-0.5 tracking-wide hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40'

    return (
      <div className={containerClass}>
        <button
          type="button"
          className={buttonClass}
          disabled={pending}
          onClick={event => {
            event.stopPropagation()
            if (pending) return
            void handleMarkCompleted(instanceId, projectOptions)
          }}
        >
          done
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={pending}
          onClick={event => {
            event.stopPropagation()
            if (pending) return
            void handleCancelInstance(instanceId, projectOptions)
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
    setCurrentDate(next.date)
    if (next.view !== view) navigate(next.view)
  }

  const handleToday = () => {
    setCurrentDate(new Date())
    navigate('day')
  }
  useEffect(() => {
    if (!userId) {
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
  }, [userId, currentDate])

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
  }, [userId, currentDate])

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
    if (!userId) return
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
      setCurrentDate(prev => {
        const d = new Date(prev)
        d.setDate(prev.getDate() + (diff < 0 ? 1 : -1))
        return d
      })
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
                  selectedDate={currentDate}
                  onSelectDate={handleDrillDown}
                />
              </ScheduleViewShell>
            )}
            {view === 'month' && (
              <ScheduleViewShell key="month">
                <MonthView
                  date={currentDate}
                  energies={dayEnergies}
                  selectedDate={currentDate}
                  onSelectDate={handleDrillDown}
                />
              </ScheduleViewShell>
            )}
            {view === 'day' && (
              <ScheduleViewShell key="day">
                {/* source of truth: schedule_instances */}
                <div className="text-[10px] opacity-60 px-2">data source: schedule_instances</div>
                <DayTimeline
                  date={currentDate}
                  startHour={startHour}
                  pxPerMin={pxPerMin}
                >
                  {windows.map(w => {
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
                  {projectInstances.map(({ instance, project, start, end, assignedWindow }, index) => {
                    const projectId = project.id
                    const startMin = start.getHours() * 60 + start.getMinutes()
                    const top = (startMin - startHour * 60) * pxPerMin
                    const height =
                      ((end.getTime() - start.getTime()) / 60000) * pxPerMin
                    const isExpanded = expandedProjects.has(projectId)
                    const projectTaskCandidates =
                      taskInstancesByProject[projectId] ?? []
                    const scheduledCards: ProjectTaskCard[] =
                      projectTaskCandidates
                        .filter(taskInfo =>
                          taskMatchesProjectInstance(
                            taskInfo,
                            instance,
                            start,
                            end
                          )
                        )
                        .map(taskInfo => ({
                          key: `scheduled:${taskInfo.instance.id}`,
                          kind: 'scheduled' as const,
                          task: taskInfo.task,
                          start: taskInfo.start,
                          end: taskInfo.end,
                          instanceId: taskInfo.instance.id,
                          displayDurationMinutes: Math.max(
                            1,
                            Math.round(
                              (taskInfo.end.getTime() - taskInfo.start.getTime()) /
                                60000
                            )
                          ),
                        }))
                    const hasScheduledBreakdown = scheduledCards.length > 0
                    const durationMinutes = Math.round(
                      (end.getTime() - start.getTime()) / 60000
                    )
                    const timeRangeLabel = formatTimeRangeLabel(start, end)
                    const trimmedWindowLabel =
                      typeof assignedWindow?.label === 'string'
                        ? assignedWindow.label.trim()
                        : ''
                    const hasWindow = Boolean(instance.window_id)
                    let windowDescriptor = `Window: ${
                      trimmedWindowLabel.length > 0
                        ? trimmedWindowLabel
                        : assignedWindow
                          ? 'Unnamed'
                          : hasWindow
                            ? 'Unknown'
                            : 'Unassigned'
                    }`
                    if (assignedWindow?.fromPrevDay) {
                      windowDescriptor = `${windowDescriptor} (previous day)`
                    }
                    const tasksLabel =
                      project.taskCount > 0
                        ? `${project.taskCount} ${
                            project.taskCount === 1 ? 'task' : 'tasks'
                          }`
                        : null
                    const detailParts = [
                      windowDescriptor,
                      timeRangeLabel,
                      `${durationMinutes}m`,
                    ]
                    if (tasksLabel) detailParts.push(tasksLabel)
                    let detailText = detailParts.join(' · ')
                    const positionStyle: CSSProperties = {
                      top,
                      height,
                    }
                    const cardStyle: CSSProperties = {
                      boxShadow:
                        '0 28px 58px rgba(3, 3, 6, 0.66), 0 10px 24px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                      outline: '1px solid rgba(10, 10, 12, 0.85)',
                      outlineOffset: '-1px',
                    }
                    const projectDurationMs = Math.max(
                      end.getTime() - start.getTime(),
                      1
                    )
                    const projectHeightPx = Math.max(typeof height === 'number' ? height : 0, 1)
                    const minHeightRatio = Math.min(1, 4 / projectHeightPx)
                    const backlogTasks = tasksByProjectId[projectId] ?? []
                    const safeMinHeightRatio = minHeightRatio > 0 ? minHeightRatio : 1
                    const fallbackLimit = Math.min(
                      MAX_FALLBACK_TASKS,
                      Math.max(1, Math.floor(1 / safeMinHeightRatio)),
                      backlogTasks.length
                    )
                    const fallbackCards =
                      !hasScheduledBreakdown && fallbackLimit > 0
                        ? buildFallbackTaskCards({
                            tasks: backlogTasks,
                            projectStart: start,
                            projectEnd: end,
                            instanceId: instance.id,
                            maxCount: fallbackLimit,
                          })
                        : []
                    const displayCards =
                      hasScheduledBreakdown ? scheduledCards : fallbackCards
                    const usingFallback =
                      !hasScheduledBreakdown && displayCards.length > 0
                    if (usingFallback) {
                      detailText = `${detailText} · Backlog preview`
                    }
                    const hiddenFallbackCount = usingFallback
                      ? Math.max(0, backlogTasks.length - displayCards.length)
                      : 0
                    const canExpand = displayCards.length > 0
                    return (
                      <motion.div
                        key={instance.id}
                        className="absolute left-16 right-2"
                        style={positionStyle}
                        layout={!prefersReducedMotion}
                        transition={
                          prefersReducedMotion
                            ? undefined
                            : { type: 'spring', stiffness: 320, damping: 32 }
                        }
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {!isExpanded || !canExpand ? (
                            <motion.div
                              key="project"
                              aria-label={`Project ${project.name}`}
                              onClick={() => {
                                if (!canExpand) return
                                setProjectExpansion(projectId)
                              }}
                              className={`relative flex h-full w-full items-center justify-between rounded-[var(--radius-lg)] px-3 py-2 text-white backdrop-blur-sm border border-black/70 shadow-[0_28px_54px_rgba(0,0,0,0.62)]${
                                canExpand ? ' cursor-pointer' : ''
                              }`}
                              style={{
                                ...cardStyle,
                                background:
                                  'radial-gradient(circle at 0% 0%, rgba(120, 126, 138, 0.28), transparent 58%), linear-gradient(140deg, rgba(8, 8, 10, 0.96) 0%, rgba(22, 22, 26, 0.94) 42%, rgba(88, 90, 104, 0.6) 100%)',
                              }}
                              initial={
                                prefersReducedMotion ? false : { opacity: 0, y: 4 }
                              }
                              animate={
                                prefersReducedMotion
                                  ? undefined
                                  : {
                                      opacity: 1,
                                      y: 0,
                                      transition: {
                                        delay: hasInteractedWithProjects
                                          ? 0
                                          : index * 0.02,
                                        duration: 0.18,
                                        ease: [0.4, 0, 0.2, 1],
                                      },
                                    }
                              }
                              exit={
                                prefersReducedMotion
                                  ? undefined
                                  : {
                                      opacity: 0,
                                      y: 4,
                                      transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] },
                                    }
                              }
                            >
                              {renderInstanceActions(instance.id, { projectId })}
                              <div className="flex flex-col">
                                <span className="truncate text-sm font-medium">
                                  {project.name}
                                </span>
                                <div className="text-xs text-zinc-200/70">
                                  {detailText}
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
                              className="relative h-full w-full"
                              initial={
                                prefersReducedMotion
                                  ? false
                                  : { opacity: 0, y: 4 }
                              }
                              animate={
                                prefersReducedMotion
                                  ? undefined
                                  : {
                                      opacity: 1,
                                      y: 0,
                                      transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
                                    }
                              }
                              exit={
                                prefersReducedMotion
                                  ? undefined
                                  : {
                                      opacity: 0,
                                      y: 4,
                                      transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] },
                                    }
                              }
                            >
                              {displayCards.map(taskCard => {
                                const {
                                  task,
                                  start: taskStart,
                                  end: taskEnd,
                                  kind,
                                  key,
                                  instanceId,
                                  displayDurationMinutes,
                                } = taskCard
                                const startOffsetMs =
                                  taskStart.getTime() - start.getTime()
                                const endOffsetMs = taskEnd.getTime() - start.getTime()
                                const rawStartRatio = startOffsetMs / projectDurationMs
                                const rawEndRatio = endOffsetMs / projectDurationMs
                                const clampRatio = (value: number) =>
                                  Number.isFinite(value)
                                    ? Math.min(Math.max(value, 0), 1)
                                    : 0
                                let startRatio = clampRatio(rawStartRatio)
                                let endRatio = clampRatio(rawEndRatio)
                                if (endRatio <= startRatio) {
                                  endRatio = Math.min(1, startRatio + minHeightRatio)
                                }
                                let heightRatio = Math.max(endRatio - startRatio, 0)
                                if (heightRatio < minHeightRatio) {
                                  heightRatio = minHeightRatio
                                }
                                if (startRatio + heightRatio > 1) {
                                  const overflow = startRatio + heightRatio - 1
                                  startRatio = Math.max(0, startRatio - overflow)
                                  heightRatio = Math.min(heightRatio, 1 - startRatio)
                                }
                                const topPercent = startRatio * 100
                                const heightPercent = Math.max(
                                  heightRatio * 100,
                                  minHeightRatio * 100
                                )
                                const tStyle: CSSProperties = {
                                  top: `${topPercent}%`,
                                  height: `${heightPercent}%`,
                                  ...cardStyle,
                                }
                                const baseTaskClasses =
                                  'absolute left-0 right-0 flex items-center justify-between rounded-[var(--radius-lg)] px-3 py-2'
                                const shinyTaskClasses =
                                  'bg-[linear-gradient(135deg,_rgba(52,52,60,0.95)_0%,_rgba(82,84,94,0.92)_40%,_rgba(158,162,174,0.88)_100%)] text-zinc-50 shadow-[0_18px_38px_rgba(8,8,12,0.55)] ring-1 ring-white/20 backdrop-blur'
                                const fallbackTaskClasses =
                                  'bg-[linear-gradient(135deg,_rgba(44,44,52,0.9)_0%,_rgba(68,70,80,0.88)_38%,_rgba(120,126,138,0.82)_100%)] text-zinc-100 shadow-[0_16px_32px_rgba(10,10,14,0.5)] ring-1 ring-white/15 backdrop-blur-[2px]'
                                const cardClasses =
                                  kind === 'scheduled'
                                    ? `${baseTaskClasses} ${shinyTaskClasses}`
                                    : `${baseTaskClasses} ${fallbackTaskClasses}`
                                const progressValue =
                                  kind === 'scheduled'
                                    ? Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          (task as { progress?: number }).progress ?? 0
                                        )
                                      )
                                    : 0
                                const durationLabel =
                                  kind === 'fallback'
                                    ? `~${displayDurationMinutes}m`
                                    : `${displayDurationMinutes}m`
                                const metaTextClass = 'text-xs text-zinc-200/75'
                                const progressBarClass =
                                  kind === 'scheduled'
                                    ? 'absolute left-0 bottom-0 h-[3px] bg-white/40'
                                    : 'absolute left-0 bottom-0 h-[3px] bg-white/25'
                                const resolvedEnergyRaw = (
                                  task.energy ?? project.energy ?? 'NO'
                                ).toString()
                                const resolvedEnergyUpper = resolvedEnergyRaw.toUpperCase()
                                const energyLevel = ENERGY.LIST.includes(
                                  resolvedEnergyUpper as FlameLevel
                                )
                                  ? (resolvedEnergyUpper as FlameLevel)
                                  : 'NO'
                                return (
                                  <motion.div
                                    key={key}
                                    aria-label={`Task ${task.name}`}
                                    className={cardClasses}
                                    style={tStyle}
                                    onClick={() =>
                                      setProjectExpansion(projectId, false)
                                    }
                                    initial={
                                      prefersReducedMotion
                                        ? false
                                        : { opacity: 0, y: 6 }
                                    }
                                    animate={
                                      prefersReducedMotion
                                        ? undefined
                                        : {
                                            opacity: 1,
                                            y: 0,
                                            transition: {
                                              duration: 0.18,
                                              ease: [0.4, 0, 0.2, 1],
                                            },
                                          }
                                    }
                                    exit={
                                      prefersReducedMotion
                                        ? undefined
                                        : {
                                            opacity: 0,
                                            y: 6,
                                            transition: {
                                              duration: 0.14,
                                              ease: [0.4, 0, 0.2, 1],
                                            },
                                          }
                                    }
                                  >
                                    {kind === 'scheduled' && instanceId
                                      ? renderInstanceActions(instanceId, {
                                          projectId,
                                          appearance: 'light',
                                        })
                                      : null}
                                    <div className="flex flex-col">
                                      <span className="truncate text-sm font-medium">
                                        {task.name}
                                      </span>
                                      <div className={metaTextClass}>
                                        {durationLabel}
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
                                      level={energyLevel}
                                      size="sm"
                                      className="absolute -top-1 -right-1"
                                    />
                                    {progressValue > 0 && (
                                      <div
                                        className={progressBarClass}
                                        style={{ width: `${progressValue}%` }}
                                      />
                                    )}
                                  </motion.div>
                                )
                              })}
                              {usingFallback && hiddenFallbackCount > 0 && (
                                <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
                                  <span className="rounded-full border border-white/50 bg-white/80 px-2 py-[2px] text-[10px] text-zinc-700 shadow-sm backdrop-blur-sm">
                                    +{hiddenFallbackCount} more task{hiddenFallbackCount === 1 ? '' : 's'} in backlog
                                  </span>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )
                  })}
                  {standaloneTaskInstances.map(({ instance, task, start, end }) => {
                    const startMin = start.getHours() * 60 + start.getMinutes()
                    const top = (startMin - startHour * 60) * pxPerMin
                    const height =
                      ((end.getTime() - start.getTime()) / 60000) * pxPerMin
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
                        className="absolute left-16 right-2 flex items-center justify-between rounded-[var(--radius-lg)] px-3 py-2 text-zinc-900 shadow-[0_12px_28px_rgba(24,24,27,0.35)] ring-1 ring-white/60 bg-[linear-gradient(135deg,_rgba(255,255,255,0.95)_0%,_rgba(229,231,235,0.92)_45%,_rgba(148,163,184,0.88)_100%)]"
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
                        {renderInstanceActions(instance.id, { appearance: 'light' })}
                        <div className="flex flex-col">
                          <span className="truncate text-sm font-medium">
                            {task.name}
                          </span>
                          <div className="text-xs text-zinc-700/80">
                            {Math.round((end.getTime() - start.getTime()) / 60000)}m
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
                          className="absolute left-0 bottom-0 h-[3px] bg-zinc-900/25"
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
                <FocusTimeline />
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
