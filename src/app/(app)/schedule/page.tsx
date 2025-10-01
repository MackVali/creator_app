"use client"

export const runtime = 'nodejs'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from 'framer-motion'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { useAuth } from '@/components/auth/AuthProvider'
import { DayTimeline } from '@/components/schedule/DayTimeline'
import { FocusTimeline, FocusTimelineFab } from '@/components/schedule/FocusTimeline'
import FlameEmber, { FlameLevel } from '@/components/FlameEmber'
import { YearView } from '@/components/schedule/YearView'
import { MonthView } from '@/components/schedule/MonthView'
import { ScheduleTopBar } from '@/components/schedule/ScheduleTopBar'
import {
  getChildView,
  getParentView,
  type ScheduleView,
} from '@/components/schedule/viewUtils'
import { RescheduleButton } from '@/components/schedule/RescheduleButton'
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
import { windowRect, timeToMin } from '@/lib/scheduler/windowRect'
import { ENERGY } from '@/lib/scheduler/config'
import { formatLocalDateKey, toLocal } from '@/lib/time/tz'
import { startOfDayInTimeZone, addDaysInTimeZone } from '@/lib/scheduler/timezone'
import {
  TIME_FORMATTER,
  describeEmptyWindowReport,
  energyIndexFromLabel,
  formatDurationLabel,
  type SchedulerRunFailure,
} from '@/lib/scheduler/windowReports'

type DayTransitionDirection = -1 | 0 | 1

type PeekState = {
  direction: DayTransitionDirection
  offset: number
}

const dayTimelineVariants = {
  enter: (direction: DayTransitionDirection) => ({
    opacity: direction === 0 ? 1 : 0.6,
    x: direction === 0 ? 0 : direction > 0 ? 40 : -40,
    scale: 0.995,
  }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (direction: DayTransitionDirection) => ({
    opacity: direction === 0 ? 0 : 0.6,
    x: direction === 0 ? 0 : direction > 0 ? -40 : 40,
    scale: 0.995,
  }),
}

const dayTimelineTransition = {
  x: { type: 'spring', stiffness: 280, damping: 28, mass: 0.9 },
  opacity: { duration: 0.22, ease: [0.33, 1, 0.68, 1] as const },
  scale: { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] as const },
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
  const safeHeight = Number.isFinite(availableHeight)
    ? Math.max(0, availableHeight)
    : 0

  const inlineSize = safeHeight > 0 ? safeHeight : undefined

  return (
    <span
      title={label}
      className="ml-1 text-[10px] leading-none text-zinc-500"
      style={{
        display: 'inline-flex',
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        overflow: 'hidden',
        maxInlineSize: inlineSize,
        inlineSize,
      }}
    >
      {label}
    </span>
  )
}

function formatDayViewLabel(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone,
    })
    return formatter.format(date)
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Unable to format day view label', error)
    }
    return date.toDateString()
  }
}

function resolveDayViewDetails(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone,
    })
    const parts = formatter.formatToParts(date)
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(part => part.type === type)?.value ?? ''
    const weekday = getPart('weekday') || formatDayViewLabel(date, timeZone)
    const month = getPart('month')
    const day = getPart('day')
    const year = getPart('year')
    const fullDate = [month, day].filter(Boolean).join(' ')
    const composed = fullDate && year ? `${fullDate}, ${year}` : fullDate || weekday
    return {
      weekday,
      fullDate: composed,
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Unable to resolve day view parts', error)
    }
    const fallback = formatDayViewLabel(date, timeZone)
    return {
      weekday: fallback,
      fullDate: fallback,
    }
  }
}

const TASK_INSTANCE_MATCH_TOLERANCE_MS = 60 * 1000
const MAX_FALLBACK_TASKS = 12

type LoadStatus = 'idle' | 'loading' | 'loaded'

type SchedulerTimelineEntry = {
  instanceId: string
  projectId: string
  windowId: string | null
  decision: 'kept' | 'new' | 'rescheduled'
  startUTC: string
  endUTC: string
  durationMin: number | null
  energyResolved: string | null
  scheduledDayOffset: number | null
  availableStartLocal: string | null
  windowStartLocal: string | null
}

type SchedulerTimelinePlacement = {
  projectId: string
  projectName: string
  start: Date
  end: Date
  durationMinutes: number | null
  energyLabel: (typeof ENERGY.LIST)[number]
  decision: SchedulerTimelineEntry['decision']
}

type SchedulerDebugState = {
  runAt: string
  failures: SchedulerRunFailure[]
  placedCount: number
  placedProjectIds: string[]
  timeline: SchedulerTimelineEntry[]
  error: unknown
}

type TaskInstanceInfo = {
  instance: ScheduleInstance
  task: TaskLite
  start: Date
  end: Date
}

type ProjectItem = ReturnType<typeof buildProjectItems>[number]
type DayTimelineModel = {
  date: Date
  isViewingToday: boolean
  dayViewDateKey: string
  dayViewDetails: ReturnType<typeof resolveDayViewDetails>
  timeZoneShortName: string
  friendlyTimeZone: string
  startHour: number
  pxPerMin: number
  windows: RepoWindow[]
  projectInstances: ReturnType<typeof computeProjectInstances>
  taskInstancesByProject: Record<string, TaskInstanceInfo[]>
  tasksByProjectId: Record<string, TaskLite[]>
  standaloneTaskInstances: TaskInstanceInfo[]
  windowReports: WindowReportEntry[]
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

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
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

function buildWindowMap(windows: RepoWindow[]) {
  const map: Record<string, RepoWindow> = {}
  for (const w of windows) {
    map[w.id] = w
  }
  return map
}

function computeProjectInstances(
  instances: ScheduleInstance[],
  projectMap: Record<string, ProjectItem>,
  windowMap: Record<string, RepoWindow>
) {
  return instances
    .filter(inst => inst.source_type === 'PROJECT')
    .map(inst => {
      const project = projectMap[inst.source_id]
      if (!project) return null
      const start = toLocal(inst.start_utc)
      const end = toLocal(inst.end_utc)
      if (!isValidDate(start) || !isValidDate(end)) return null
      return {
        instance: inst,
        project,
        start,
        end,
        assignedWindow: inst.window_id ? windowMap[inst.window_id] ?? null : null,
      }
    })
    .filter(
      (value): value is {
        instance: ScheduleInstance
        project: ProjectItem
        start: Date
        end: Date
        assignedWindow: RepoWindow | null
      } => value !== null
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

function collectProjectInstanceIds(projectInstances: ReturnType<typeof computeProjectInstances>) {
  const set = new Set<string>()
  for (const item of projectInstances) {
    set.add(item.project.id)
  }
  return set
}

function computeTaskInstancesByProjectForDay(
  instances: ScheduleInstance[],
  taskMap: Record<string, TaskLite>,
  projectInstanceIds: Set<string>
) {
  const map: Record<string, TaskInstanceInfo[]> = {}
  for (const inst of instances) {
    if (inst.source_type !== 'TASK') continue
    const task = taskMap[inst.source_id]
    const projectId = task?.project_id ?? null
    if (!task || !projectId) continue
    if (!projectInstanceIds.has(projectId)) continue
    const start = toLocal(inst.start_utc)
    const end = toLocal(inst.end_utc)
    if (!isValidDate(start) || !isValidDate(end)) continue
    const bucket = map[projectId] ?? []
    bucket.push({
      instance: inst,
      task,
      start,
      end,
    })
    map[projectId] = bucket
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => a.start.getTime() - b.start.getTime())
  }
  return map
}

function computeStandaloneTaskInstancesForDay(
  instances: ScheduleInstance[],
  taskMap: Record<string, TaskLite>,
  projectInstanceIds: Set<string>
) {
  const items: TaskInstanceInfo[] = []
  for (const inst of instances) {
    if (inst.source_type !== 'TASK') continue
    const task = taskMap[inst.source_id]
    if (!task) continue
    const projectId = task.project_id ?? undefined
    if (projectId && projectInstanceIds.has(projectId)) continue
    const start = toLocal(inst.start_utc)
    const end = toLocal(inst.end_utc)
    if (!isValidDate(start) || !isValidDate(end)) continue
    items.push({
      instance: inst,
      task,
      start,
      end,
    })
  }
  items.sort((a, b) => a.start.getTime() - b.start.getTime())
  return items
}

function computeWindowReportsForDay({
  windows,
  projectInstances,
  startHour,
  pxPerMin,
  unscheduledProjects,
  schedulerFailureByProjectId,
  schedulerDebug,
  schedulerTimelinePlacements,
  currentDate,
}: {
  windows: RepoWindow[]
  projectInstances: ReturnType<typeof computeProjectInstances>
  startHour: number
  pxPerMin: number
  unscheduledProjects: ProjectItem[]
  schedulerFailureByProjectId: Record<string, SchedulerRunFailure[]>
  schedulerDebug: SchedulerDebugState | null
  schedulerTimelinePlacements: SchedulerTimelinePlacement[]
  currentDate: Date
}): WindowReportEntry[] {
  if (windows.length === 0) return []
  const assignments = new Map<string, number>()
  const projectSpans = projectInstances
    .map(({ instance, start, end, assignedWindow }) => {
      if (!isValidDate(start) || !isValidDate(end)) return null
      const startMs = start.getTime()
      const endMs = end.getTime()
      const windowId = instance.window_id || assignedWindow?.id || null
      if (windowId) {
        assignments.set(windowId, (assignments.get(windowId) ?? 0) + 1)
      }
      return { windowId, start, end }
    })
    .filter((value): value is { windowId: string | null; start: Date; end: Date } => value !== null)

  const scheduledSpans = [
    ...projectSpans,
    ...schedulerTimelinePlacements
      .map(({ start, end }) => {
        if (!isValidDate(start) || !isValidDate(end)) return null
        const startMs = start.getTime()
        const endMs = end.getTime()
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
        return { windowId: null, start, end }
      })
      .filter((value): value is { windowId: string | null; start: Date; end: Date } => value !== null),
  ]

  const diagnosticsAvailable = Boolean(schedulerDebug)
  const runStartedAt = schedulerDebug ? new Date(schedulerDebug.runAt) : null
  const reports: WindowReportEntry[] = []

  for (const win of windows) {
    const { start: windowStart, end: windowEnd } = resolveWindowBoundsForDate(win, currentDate)
    const assigned = assignments.get(win.id) ?? 0
    if (assigned > 0) continue

    const windowHasScheduledProject = scheduledSpans.some(span => {
      if (span.windowId === win.id) return true
      return span.start < windowEnd && span.end > windowStart
    })
    if (windowHasScheduledProject) continue

    const { top, height } = windowRect(win, startHour, pxPerMin)
    if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) continue

    const durationMinutes = windowDurationForDay(win, startHour)
    const windowLabel = win.label?.trim() || 'Untitled window'
    const energyLabel = normalizeEnergyLabel(win.energy)
    const windowEnergyIndex = energyIndexFromLabel(energyLabel)
    const futurePlacements = schedulerTimelinePlacements
      .filter(entry => entry.start.getTime() >= windowEnd.getTime())
      .filter(entry => {
        const entryEnergyIndex = energyIndexFromLabel(entry.energyLabel)
        return entryEnergyIndex !== -1 && entryEnergyIndex <= windowEnergyIndex
      })
      .map(entry => ({
        projectId: entry.projectId,
        projectName: entry.projectName,
        start: entry.start,
        durationMinutes: entry.durationMinutes,
        sameDay: formatLocalDateKey(entry.start) === formatLocalDateKey(windowEnd),
        fits:
          typeof entry.durationMinutes === 'number' && Number.isFinite(entry.durationMinutes)
            ? entry.durationMinutes <= durationMinutes
            : null,
      }))

    const description = describeEmptyWindowReport({
      windowLabel,
      energyLabel,
      durationMinutes,
      unscheduledProjects,
      schedulerFailureByProjectId,
      diagnosticsAvailable,
      runStartedAt,
      futurePlacements,
    })

    reports.push({
      key: `${win.id}-${win.fromPrevDay ? 'prev' : 'curr'}-${win.start_local}-${win.end_local}`,
      top,
      height,
      windowLabel,
      summary: description.summary,
      details: description.details,
      energyLabel,
      durationLabel: formatDurationLabel(durationMinutes),
      rangeLabel: formatWindowRange(win),
    })
  }

  return reports
}
function buildDayTimelineModel({
  date,
  windows,
  instances,
  projectMap,
  taskMap,
  tasksByProjectId,
  startHour,
  pxPerMin,
  unscheduledProjects,
  schedulerFailureByProjectId,
  schedulerDebug,
  schedulerTimelinePlacements,
  timeZoneShortName,
  friendlyTimeZone,
  localTimeZone,
}: {
  date: Date
  windows: RepoWindow[]
  instances: ScheduleInstance[]
  projectMap: Record<string, ProjectItem>
  taskMap: Record<string, TaskLite>
  tasksByProjectId: Record<string, TaskLite[]>
  startHour: number
  pxPerMin: number
  unscheduledProjects: ProjectItem[]
  schedulerFailureByProjectId: Record<string, SchedulerRunFailure[]>
  schedulerDebug: SchedulerDebugState | null
  schedulerTimelinePlacements: SchedulerTimelinePlacement[]
  timeZoneShortName: string
  friendlyTimeZone: string
  localTimeZone: string
}): DayTimelineModel {
  const windowMap = buildWindowMap(windows)
  const projectInstances = computeProjectInstances(instances, projectMap, windowMap)
  const projectInstanceIds = collectProjectInstanceIds(projectInstances)
  const taskInstancesByProject = computeTaskInstancesByProjectForDay(
    instances,
    taskMap,
    projectInstanceIds
  )
  const standaloneTaskInstances = computeStandaloneTaskInstancesForDay(
    instances,
    taskMap,
    projectInstanceIds
  )
  const windowReports = computeWindowReportsForDay({
    windows,
    projectInstances,
    startHour,
    pxPerMin,
    unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    currentDate: date,
  })
  const dayViewDateKey = formatLocalDateKey(date)
  return {
    date,
    isViewingToday: formatLocalDateKey(new Date()) === dayViewDateKey,
    dayViewDateKey,
    dayViewDetails: resolveDayViewDetails(date, localTimeZone),
    timeZoneShortName,
    friendlyTimeZone,
    startHour,
    pxPerMin,
    windows,
    projectInstances,
    taskInstancesByProject,
    tasksByProjectId,
    standaloneTaskInstances,
    windowReports,
  }
}


function DayPeekOverlays({
  peekState,
  previousLabel,
  nextLabel,
  previousKey,
  nextKey,
  containerRef,
  previousModel,
  nextModel,
  renderPreview,
}: {
  peekState: PeekState
  previousLabel: string
  nextLabel: string
  previousKey: string
  nextKey: string
  containerRef: RefObject<HTMLDivElement | null>
  previousModel?: DayTimelineModel | null
  nextModel?: DayTimelineModel | null
  renderPreview: (model: DayTimelineModel, options?: { disableInteractions?: boolean }) => ReactNode
}) {
  const container = containerRef.current
  const containerWidth = container?.offsetWidth ?? 0
  const maxPeekWidth = containerWidth > 0 ? containerWidth * 0.45 : 0
  const offset = maxPeekWidth > 0 ? Math.min(peekState.offset, maxPeekWidth) : 0
  if (!offset || peekState.direction === 0) return null

  const progress = maxPeekWidth > 0 ? Math.min(1, offset / maxPeekWidth) : 0
  const translate = (1 - progress) * 35
  const opacity = 0.25 + progress * 0.6
  const scale = 0.94 + progress * 0.06
  const shadowOpacity = 0.45 + progress * 0.3

  const isNext = peekState.direction === 1
  const label = isNext ? nextLabel : previousLabel
  const keyLabel = isNext ? nextKey : previousKey
  const previewModel = isNext ? nextModel : previousModel
  const alignment = isNext ? 'items-end text-right' : 'items-start text-left'
  const cornerClass = isNext
    ? 'rounded-l-[var(--radius-lg)]'
    : 'rounded-r-[var(--radius-lg)]'
  const transformOrigin = isNext ? 'right center' : 'left center'

  let overlayCenter: number | null = null
  if (container) {
    const rect = container.getBoundingClientRect()
    const height = container.offsetHeight
    const viewportHeight =
      typeof window !== 'undefined' ? window.innerHeight : container.offsetHeight
    const visibleStart = Math.max(0, -rect.top)
    const visibleEnd = Math.min(height, viewportHeight - rect.top)
    const visibleHeight = Math.max(0, visibleEnd - visibleStart)
    if (visibleHeight > 0) {
      overlayCenter = visibleStart + visibleHeight / 2
    } else {
      overlayCenter = height / 2
    }
  }

  const overlayStyle: CSSProperties =
    overlayCenter !== null
      ? { top: overlayCenter, transform: 'translateY(-50%)' }
      : { top: '50%', transform: 'translateY(-50%)' }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex"
      style={overlayStyle}
    >
      <div className={`relative flex flex-1 ${isNext ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`pointer-events-none flex flex-col gap-3 border border-white/10 bg-white/8 px-5 py-4 text-white backdrop-blur-md ${alignment} ${cornerClass}`}
          style={{
            width: offset,
            opacity,
            transform: `translateX(${isNext ? translate : -translate}%) scale(${scale})`,
            transformOrigin,
            boxShadow: `0 28px 58px rgba(3, 3, 6, ${shadowOpacity})`,
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70">
              {isNext ? 'Next day' : 'Previous day'}
            </span>
            <span className="text-base font-semibold leading-tight drop-shadow">
              {label}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">
              {keyLabel}
            </span>
          </div>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-white/10 bg-black/40">
            {previewModel ? (
              <div
                className="pointer-events-none"
                style={{
                  transform: 'scale(0.94)',
                  transformOrigin,
                }}
              >
                {renderPreview(previewModel, { disableInteractions: true })}
              </div>
            ) : (
              <div className="flex h-36 items-center justify-center text-[11px] text-white/70">
                Loading schedule…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
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

function parseSchedulerTimeline(input: unknown): SchedulerTimelineEntry[] {
  if (!Array.isArray(input)) return []
  const results: SchedulerTimelineEntry[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue
    const value = entry as {
      instance?: unknown
      projectId?: unknown
      decision?: unknown
      scheduledDayOffset?: unknown
      availableStartLocal?: unknown
      windowStartLocal?: unknown
    }
    const instance = value.instance
    if (!instance || typeof instance !== 'object') continue
    const instanceValue = instance as {
      id?: unknown
      source_id?: unknown
      window_id?: unknown
      start_utc?: unknown
      end_utc?: unknown
      duration_min?: unknown
      energy_resolved?: unknown
    }
    const instanceId = typeof instanceValue.id === 'string' ? instanceValue.id : null
    const startUTC = typeof instanceValue.start_utc === 'string' ? instanceValue.start_utc : null
    const endUTC = typeof instanceValue.end_utc === 'string' ? instanceValue.end_utc : null
    if (!instanceId || !startUTC || !endUTC) continue
    const decision = value.decision
    if (decision !== 'kept' && decision !== 'new' && decision !== 'rescheduled') continue
    const projectId =
      typeof value.projectId === 'string' && value.projectId.trim().length > 0
        ? value.projectId
        : typeof instanceValue.source_id === 'string' && instanceValue.source_id.trim().length > 0
          ? (instanceValue.source_id as string)
          : null
    if (!projectId) continue
    const windowId = typeof instanceValue.window_id === 'string' ? instanceValue.window_id : null
    const durationMin =
      typeof instanceValue.duration_min === 'number' && Number.isFinite(instanceValue.duration_min)
        ? instanceValue.duration_min
        : null
    const energyResolved =
      typeof instanceValue.energy_resolved === 'string' && instanceValue.energy_resolved.trim().length > 0
        ? instanceValue.energy_resolved
        : null
    const scheduledDayOffset =
      typeof value.scheduledDayOffset === 'number' && Number.isFinite(value.scheduledDayOffset)
        ? value.scheduledDayOffset
        : null
    const availableStartLocal =
      typeof value.availableStartLocal === 'string' && value.availableStartLocal.length > 0
        ? value.availableStartLocal
        : null
    const windowStartLocal =
      typeof value.windowStartLocal === 'string' && value.windowStartLocal.length > 0
        ? value.windowStartLocal
        : null

    results.push({
      instanceId,
      projectId,
      windowId,
      decision,
      startUTC,
      endUTC,
      durationMin,
      energyResolved,
      scheduledDayOffset,
      availableStartLocal,
      windowStartLocal,
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
    timeline?: unknown
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
    timeline: parseSchedulerTimeline(scheduleValue.timeline),
    error: scheduleValue.error ?? null,
  }
}

type WindowReportEntry = {
  key: string
  top: number
  height: number
  windowLabel: string
  summary: string
  details: string[]
  energyLabel: (typeof ENERGY.LIST)[number]
  durationLabel: string
  rangeLabel: string
}

function normalizeEnergyLabel(level?: string | null): (typeof ENERGY.LIST)[number] {
  const raw = typeof level === 'string' ? level.trim().toUpperCase() : ''
  return ENERGY.LIST.includes(raw as (typeof ENERGY.LIST)[number])
    ? (raw as (typeof ENERGY.LIST)[number])
    : 'NO'
}

function windowDurationForDay(window: RepoWindow, startHour: number): number {
  const startMin = timeToMin(window.start_local)
  const endMin = timeToMin(window.end_local)
  const dayStartMin = startHour * 60
  if (window.fromPrevDay) {
    return Math.max(0, endMin - dayStartMin)
  }
  if (endMin <= startMin) {
    return Math.max(0, 24 * 60 - startMin)
  }
  return Math.max(0, endMin - startMin)
}

function formatClockLabel(localTime: string): string {
  const [hour = 0, minute = 0] = localTime.split(':').map(Number)
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return TIME_FORMATTER.format(d)
}

function formatWindowRange(window: RepoWindow): string {
  return `${formatClockLabel(window.start_local)} – ${formatClockLabel(window.end_local)}`
}

function resolveWindowBoundsForDate(window: RepoWindow, date: Date) {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  const start = new Date(dayStart)
  if (window.fromPrevDay) {
    start.setDate(start.getDate() - 1)
  }
  const [startHour = 0, startMinute = 0] = window.start_local.split(':').map(Number)
  start.setHours(startHour, startMinute, 0, 0)

  const end = new Date(dayStart)
  const [endHour = 0, endMinute = 0] = window.end_local.split(':').map(Number)
  end.setHours(endHour, endMinute, 0, 0)

  if (!window.fromPrevDay && end <= start) {
    end.setDate(end.getDate() + 1)
  }

  if (window.fromPrevDay && end <= start) {
    end.setDate(end.getDate() + 1)
  }

  return { start, end }
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
      : 'day'
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
  const [pendingInstanceStatuses, setPendingInstanceStatuses] = useState<
    Map<string, ScheduleInstance['status']>
  >(new Map())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [hasInteractedWithProjects, setHasInteractedWithProjects] = useState(false)
  const [isScheduling, setIsScheduling] = useState(false)
  const [hasAutoRunToday, setHasAutoRunToday] = useState<boolean | null>(null)
  const [dayTransitionDirection, setDayTransitionDirection] =
    useState<DayTransitionDirection>(0)
  const [isSwipingDayView, setIsSwipingDayView] = useState(false)
  const [skipNextDayAnimation, setSkipNextDayAnimation] = useState(false)
  const sliderControls = useAnimationControls()
  const [peekModels, setPeekModels] = useState<{
    previous?: DayTimelineModel | null
    next?: DayTimelineModel | null
  }>({})

  const [peekState, setPeekState] = useState<PeekState>({
    direction: 0,
    offset: 0,
  })

  const updateCurrentDate = useCallback(
    (
      nextDate: Date,
      options?: {
        direction?: DayTransitionDirection
        animate?: boolean
      }
    ) => {
      const shouldAnimate = options?.animate ?? true
      if (!prefersReducedMotion && view === 'day' && shouldAnimate) {
        const resolvedDirection = options?.direction ?? (() => {
          const diff = nextDate.getTime() - currentDate.getTime()
          if (diff === 0) return 0 as DayTransitionDirection
          return diff > 0 ? 1 : -1
        })()
        setDayTransitionDirection(resolvedDirection)
      } else {
        setDayTransitionDirection(0)
      }
      setCurrentDate(nextDate)
    },
    [prefersReducedMotion, view, currentDate]
  )

  useEffect(() => {
    if (view !== 'day') {
      setDayTransitionDirection(0)
    }
  }, [view])

  useEffect(() => {
    if (!skipNextDayAnimation) return
    const id = requestAnimationFrame(() => {
      setSkipNextDayAnimation(false)
    })
    return () => cancelAnimationFrame(id)
  }, [skipNextDayAnimation])
  const localTimeZone = useMemo(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (resolved && resolved.trim()) {
        return resolved
      }
    } catch (error) {
      console.warn('Unable to resolve local time zone', error)
    }
    return 'UTC'
  }, [])
  const dayViewLabel = useMemo(
    () => formatDayViewLabel(currentDate, localTimeZone),
    [currentDate, localTimeZone]
  )
  const dayViewDateKey = useMemo(
    () => formatLocalDateKey(currentDate),
    [currentDate]
  )
  const isViewingToday = useMemo(
    () => formatLocalDateKey(new Date()) === dayViewDateKey,
    [dayViewDateKey]
  )
  const dayViewDetails = useMemo(
    () => resolveDayViewDetails(currentDate, localTimeZone),
    [currentDate, localTimeZone]
  )
  const timeZoneShortName = useMemo(() => {
    try {
      const formatter = new Intl.DateTimeFormat(undefined, {
        timeZone: localTimeZone,
        timeZoneName: 'short',
      })
      const part = formatter
        .formatToParts(currentDate)
        .find(item => item.type === 'timeZoneName')
      return part?.value ?? ''
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Unable to format time zone name', error)
      }
      return ''
    }
  }, [currentDate, localTimeZone])
  const friendlyTimeZone = useMemo(() => {
    if (!localTimeZone) return 'UTC'
    const segments = localTimeZone.split('/')
    const city = segments.pop()
    const region = segments.length > 0 ? segments.join(' / ') : ''
    const readableCity = city?.replace(/_/g, ' ')
    const readableRegion = region.replace(/_/g, ' ')
    if (readableCity && readableRegion) {
      return `${readableCity} · ${readableRegion}`
    }
    if (readableCity) return readableCity
    if (readableRegion) return readableRegion
    return localTimeZone.replace(/_/g, ' ')
  }, [localTimeZone])
  const previousDayDate = useMemo(() => {
    const prev = new Date(currentDate)
    prev.setDate(currentDate.getDate() - 1)
    return prev
  }, [currentDate])
  const nextDayDate = useMemo(() => {
    const next = new Date(currentDate)
    next.setDate(currentDate.getDate() + 1)
    return next
  }, [currentDate])
  const previousDayLabel = useMemo(
    () => formatDayViewLabel(previousDayDate, localTimeZone),
    [previousDayDate, localTimeZone]
  )
  const nextDayLabel = useMemo(
    () => formatDayViewLabel(nextDayDate, localTimeZone),
    [nextDayDate, localTimeZone]
  )
  const previousDayKey = useMemo(
    () => formatLocalDateKey(previousDayDate),
    [previousDayDate]
  )
  const nextDayKey = useMemo(
    () => formatLocalDateKey(nextDayDate),
    [nextDayDate]
  )
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
  const touchStartWidth = useRef<number>(0)
  const swipeDeltaRef = useRef(0)
  const navLock = useRef(false)
  const loadInstancesRef = useRef<() => Promise<void>>(async () => {})
  const isSchedulingRef = useRef(false)
  const autoScheduledForRef = useRef<string | null>(null)

  const persistAutoRunDate = useCallback(
    (dateKey: string) => {
      if (!userId) return
      if (typeof window === 'undefined') return
      const storageKey = `schedule:lastAutoRun:${userId}`
      try {
        window.localStorage.setItem(storageKey, dateKey)
      } catch (error) {
        console.warn('Failed to store schedule auto-run timestamp', error)
      }
    },
    [userId]
  )

  const readLastAutoRunDate = useCallback((): string | null => {
    if (!userId) return null
    if (typeof window === 'undefined') return null
    const storageKey = `schedule:lastAutoRun:${userId}`
    try {
      return window.localStorage.getItem(storageKey)
    } catch (error) {
      console.warn('Failed to read schedule auto-run timestamp', error)
      return null
    }
  }, [userId])

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
    autoScheduledForRef.current = null
    setHasAutoRunToday(null)
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
          fetchWindowsForDate(currentDate, undefined, localTimeZone),
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
  }, [currentDate, userId, localTimeZone])
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

  const windowMap = useMemo(() => buildWindowMap(windows), [windows])

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

  const projectInstances = useMemo(
    () => computeProjectInstances(instances, projectMap, windowMap),
    [instances, projectMap, windowMap]
  )

  const projectInstanceIds = useMemo(
    () => collectProjectInstanceIds(projectInstances),
    [projectInstances]
  )

  const unscheduledProjects = useMemo(() => {
    return projectItems.filter(project => {
      if (scheduledProjectIds.has(project.id)) return false
      return !projectInstanceIds.has(project.id)
    })
  }, [projectItems, projectInstanceIds, scheduledProjectIds])

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

  const schedulerTimelinePlacements = useMemo(() => {
    if (!schedulerDebug) return [] as SchedulerTimelinePlacement[]

    const placements: SchedulerTimelinePlacement[] = []

    for (const entry of schedulerDebug.timeline) {
      if (!entry) continue
      const start = toLocal(entry.startUTC)
      const end = toLocal(entry.endUTC)
      if (!isValidDate(start) || !isValidDate(end)) continue
      const project = projectMap[entry.projectId]
      const durationMin =
        typeof entry.durationMin === 'number' && Number.isFinite(entry.durationMin)
          ? entry.durationMin
          : typeof project?.duration_min === 'number' && Number.isFinite(project.duration_min)
            ? project.duration_min
            : null
      const energySource =
        typeof entry.energyResolved === 'string' && entry.energyResolved.trim().length > 0
          ? entry.energyResolved
          : project?.energy ?? null
      const energyLabel = normalizeEnergyLabel(energySource)

      placements.push({
        projectId: entry.projectId,
        projectName: project?.name || 'Untitled project',
        start,
        end,
        durationMinutes: durationMin,
        energyLabel,
        decision: entry.decision,
      })
    }

    return placements
  }, [schedulerDebug, projectMap])

  const windowReports = useMemo<WindowReportEntry[]>(() => {
    if (windows.length === 0) return []
    const assignments = new Map<string, number>()
    const projectSpans = projectInstances
      .map(({ instance, start, end, assignedWindow }) => {
        if (!start || !end) return null
        const startMs = start.getTime()
        const endMs = end.getTime()
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
        const windowId = instance.window_id || assignedWindow?.id || null
        if (windowId) {
          assignments.set(windowId, (assignments.get(windowId) ?? 0) + 1)
        }
        return { windowId, start, end }
      })
      .filter((value): value is { windowId: string | null; start: Date; end: Date } => value !== null)

    const scheduledSpans = [
      ...projectSpans,
      ...schedulerTimelinePlacements
        .map(({ start, end }) => {
          if (!start || !end) return null
          const startMs = start.getTime()
          const endMs = end.getTime()
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
          return { windowId: null, start, end }
        })
        .filter((value): value is { windowId: string | null; start: Date; end: Date } => value !== null),
    ]

    const diagnosticsAvailable = Boolean(schedulerDebug)
    const runStartedAt = schedulerDebug ? new Date(schedulerDebug.runAt) : null
    const reports: WindowReportEntry[] = []

    for (const win of windows) {
      const { start: windowStart, end: windowEnd } = resolveWindowBoundsForDate(win, currentDate)
      const assigned = assignments.get(win.id) ?? 0
      if (assigned > 0) continue

      const windowHasScheduledProject = scheduledSpans.some(span => {
        if (span.windowId === win.id) return true
        return span.start < windowEnd && span.end > windowStart
      })
      if (windowHasScheduledProject) continue

      const { top, height } = windowRect(win, startHour, pxPerMin)
      if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) continue

      const durationMinutes = windowDurationForDay(win, startHour)
      const windowLabel = win.label?.trim() || 'Untitled window'
      const energyLabel = normalizeEnergyLabel(win.energy)
      const windowEnergyIndex = energyIndexFromLabel(energyLabel)
      const futurePlacements = schedulerTimelinePlacements
        .filter(entry => entry.start.getTime() >= windowEnd.getTime())
        .filter(entry => {
          const entryEnergyIndex = energyIndexFromLabel(entry.energyLabel)
          return entryEnergyIndex !== -1 && entryEnergyIndex <= windowEnergyIndex
        })
        .map(entry => ({
          projectId: entry.projectId,
          projectName: entry.projectName,
          start: entry.start,
          durationMinutes: entry.durationMinutes,
          sameDay: formatLocalDateKey(entry.start) === formatLocalDateKey(windowEnd),
          fits:
            typeof entry.durationMinutes === 'number' && Number.isFinite(entry.durationMinutes)
              ? entry.durationMinutes <= durationMinutes
              : null,
        }))

      const description = describeEmptyWindowReport({
        windowLabel,
        energyLabel,
        durationMinutes,
        unscheduledProjects,
        schedulerFailureByProjectId,
        diagnosticsAvailable,
        runStartedAt: runStartedAt && !Number.isNaN(runStartedAt.getTime()) ? runStartedAt : null,
        windowStart,
        windowEnd,
        futurePlacements,
      })

      reports.push({
        key: `${win.id}-${win.fromPrevDay ? 'prev' : 'curr'}-${win.start_local}-${win.end_local}`,
        top,
        height,
        windowLabel,
        summary: description.summary,
        details: description.details,
        energyLabel,
        durationLabel: formatDurationLabel(durationMinutes),
        rangeLabel: formatWindowRange(win),
      })
    }

    return reports
  }, [
    windows,
    projectInstances,
    startHour,
    pxPerMin,
    unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    currentDate,
  ])

  const taskInstancesByProject = useMemo(
    () =>
      computeTaskInstancesByProjectForDay(instances, taskMap, projectInstanceIds),
    [instances, taskMap, projectInstanceIds]
  )

  const standaloneTaskInstances = useMemo(
    () =>
      computeStandaloneTaskInstancesForDay(instances, taskMap, projectInstanceIds),
    [instances, taskMap, projectInstanceIds]
  )

  useEffect(() => {
    if (!userId || view !== 'day') {
      setPeekModels({})
      return
    }

    let cancelled = false
    const timeZone = localTimeZone ?? 'UTC'

    async function load(direction: 'previous' | 'next', date: Date) {
      setPeekModels(prev => ({ ...prev, [direction]: prev[direction] ?? null }))
      try {
        const dayStart = startOfDayInTimeZone(date, timeZone)
        const nextDayStart = addDaysInTimeZone(dayStart, 1, timeZone)
        const startUTC = dayStart.toISOString()
        const endUTC = nextDayStart.toISOString()
        const [ws, instanceResult] = await Promise.all([
          fetchWindowsForDate(date, undefined, localTimeZone),
          fetchInstancesForRange(userId, startUTC, endUTC),
        ])
        if (cancelled) return
        if (instanceResult.error) {
          console.error(instanceResult.error)
        }
        const instancesForDay = instanceResult.data ?? []
        const model = buildDayTimelineModel({
          date,
          windows: ws,
          instances: instancesForDay,
          projectMap,
          taskMap,
          tasksByProjectId,
          startHour,
          pxPerMin,
          unscheduledProjects,
          schedulerFailureByProjectId,
          schedulerDebug,
          schedulerTimelinePlacements,
          timeZoneShortName,
          friendlyTimeZone,
          localTimeZone,
        })
        setPeekModels(prev => ({ ...prev, [direction]: model }))
      } catch (error) {
        console.error('Failed to load adjacent day preview', error)
        if (cancelled) return
        setPeekModels(prev => ({ ...prev, [direction]: null }))
      }
    }

    void load('previous', previousDayDate)
    void load('next', nextDayDate)

    return () => {
      cancelled = true
    }
  }, [
    userId,
    view,
    previousDayDate,
    nextDayDate,
    localTimeZone,
    projectMap,
    taskMap,
    tasksByProjectId,
    startHour,
    pxPerMin,
    unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    timeZoneShortName,
    friendlyTimeZone,
  ])

  const instanceStatusById = useMemo(() => {
    const map: Record<string, ScheduleInstance['status'] | null> = {}
    for (const inst of instances) {
      map[inst.id] = inst.status ?? null
    }
    return map
  }, [instances])

  const handleToggleInstanceCompletion = useCallback(
    async (instanceId: string, nextStatus: 'completed' | 'scheduled') => {
      if (!userId) {
        console.warn('No user session available for status update')
        return
      }

      setPendingInstanceStatuses(prev => {
        const next = new Map(prev)
        next.set(instanceId, nextStatus)
        return next
      })

      try {
        const { error } = await updateInstanceStatus(instanceId, nextStatus)
        if (error) {
          console.error(error)
          return
        }

        setInstances(prev =>
          prev.map(inst =>
            inst.id === instanceId
              ? {
                  ...inst,
                  status: nextStatus,
                  completed_at:
                    nextStatus === 'completed'
                      ? new Date().toISOString()
                      : null,
                }
              : inst
          )
        )
      } catch (error) {
        console.error(error)
      } finally {
        setPendingInstanceStatuses(prev => {
          const next = new Map(prev)
          next.delete(instanceId)
          return next
        })
      }
    },
    [userId, setInstances]
  )

  const renderInstanceActions = (
    instanceId: string,
    options?: { appearance?: 'light' | 'dark'; className?: string }
  ) => {
    const pendingStatus = pendingInstanceStatuses.get(instanceId)
    const pending = pendingStatus !== undefined
    const appearance = options?.appearance ?? 'dark'
    const status = pendingStatus ?? instanceStatusById[instanceId] ?? null
    const effectiveStatus: ScheduleInstance['status'] = status ?? 'scheduled'
    const isCompleted = effectiveStatus === 'completed'
    const canToggle =
      effectiveStatus === 'completed' || effectiveStatus === 'scheduled'
    const containerClass =
      appearance === 'light'
        ? 'flex items-center gap-2 text-zinc-800/80'
        : 'flex items-center gap-2 text-white/70'
    const baseFocusClass =
      appearance === 'light'
        ? 'focus-visible:outline-black/40'
        : 'focus-visible:outline-white/60'
    const borderClass = 'border-black'
    const xColor = '#ffffff'
    const baseButtonClass =
      'relative flex h-6 w-6 items-center justify-center border rounded-none transition-[color,background,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-60'

    return (
      <div
        className={[containerClass, options?.className]
          .filter(Boolean)
          .join(' ')}
        onClick={event => {
          event.stopPropagation()
        }}
        title="Toggle project completion"
      >
        <motion.button
          type="button"
          role="checkbox"
          aria-checked={isCompleted}
          aria-label="Toggle project completion"
          disabled={pending || !canToggle}
          className={`${baseButtonClass} ${borderClass} ${baseFocusClass}`}
          initial={false}
          onClick={event => {
            event.stopPropagation()
            if (pending || !canToggle) return
            const nextStatus = isCompleted ? 'scheduled' : 'completed'
            void handleToggleInstanceCompletion(instanceId, nextStatus)
          }}
        >
          <motion.span
            className="pointer-events-none absolute inset-0"
            initial={false}
            animate={{
              backgroundColor: isCompleted ? '#000000' : 'transparent',
            }}
            transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
          />
          <motion.svg
            className="pointer-events-none relative h-3.5 w-3.5"
            viewBox="0 0 16 16"
            fill="none"
            initial={false}
          >
            <motion.path
              d="M3.5 3.5 L12.5 12.5"
              stroke={xColor}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              animate={{
                pathLength: isCompleted ? 1 : 0,
                opacity: isCompleted ? 1 : 0,
              }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            />
            <motion.path
              d="M12.5 3.5 L3.5 12.5"
              stroke={xColor}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              animate={{
                pathLength: isCompleted ? 1 : 0,
                opacity: isCompleted ? 1 : 0,
              }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            />
          </motion.svg>
        </motion.button>
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
    updateCurrentDate(next.date)
    if (next.view !== view) navigate(next.view)
  }

  const handleToday = () => {
    updateCurrentDate(new Date())
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
        const timeZone = localTimeZone ?? 'UTC'
        const dayStart = startOfDayInTimeZone(currentDate, timeZone)
        const nextDayStart = addDaysInTimeZone(dayStart, 1, timeZone)
        const startUTC = dayStart.toISOString()
        const endUTC = nextDayStart.toISOString()
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
  }, [userId, currentDate, localTimeZone])

  const runScheduler = useCallback(async () => {
    if (!userId) {
      console.warn('No user session available for scheduler run')
      return
    }
    const localNow = new Date()
    const timeZone: string | null = localTimeZone ?? null
    if (isSchedulingRef.current) return
    isSchedulingRef.current = true
    setIsScheduling(true)
    try {
      const response = await fetch('/api/scheduler/run', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          localTimeIso: localNow.toISOString(),
          timeZone,
        }),
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
          timeline: [],
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
        timeline: [],
        error,
      })
    } finally {
      isSchedulingRef.current = false
      setIsScheduling(false)
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
  }, [userId, refreshScheduledProjectIds, localTimeZone])

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
    const todayKey = formatLocalDateKey(new Date())
    const stored = readLastAutoRunDate()
    if (stored === todayKey) {
      if (hasAutoRunToday !== true) setHasAutoRunToday(true)
      return
    }
    if (hasAutoRunToday !== false) setHasAutoRunToday(false)
    if (isSchedulingRef.current) return
    if (autoScheduledForRef.current === todayKey) return
    autoScheduledForRef.current = todayKey
    void (async () => {
      await runScheduler()
      persistAutoRunDate(todayKey)
      setHasAutoRunToday(true)
    })()
  }, [
    userId,
    metaStatus,
    instancesStatus,
    runScheduler,
    readLastAutoRunDate,
    persistAutoRunDate,
    hasAutoRunToday,
  ])

  const handleRescheduleClick = useCallback(async () => {
    if (!userId) return
    const todayKey = formatLocalDateKey(new Date())
    await runScheduler()
    persistAutoRunDate(todayKey)
    setHasAutoRunToday(true)
  }, [userId, runScheduler, persistAutoRunDate])

  const swipeContainerRef = useRef<HTMLDivElement | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    if (view !== 'day' || prefersReducedMotion) {
      touchStartX.current = null
      return
    }
    touchStartX.current = e.touches[0].clientX
    touchStartWidth.current = swipeContainerRef.current?.offsetWidth ?? 0
    swipeDeltaRef.current = 0
    sliderControls.stop()
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (view !== 'day' || prefersReducedMotion) return
    if (touchStartX.current === null) return
    const width =
      touchStartWidth.current || swipeContainerRef.current?.offsetWidth || 1
    const diff = e.touches[0].clientX - touchStartX.current
    const clamped = Math.max(Math.min(diff, width), -width)
    swipeDeltaRef.current = clamped
    sliderControls.set({ x: clamped })
    if (!isSwipingDayView && Math.abs(clamped) > 4) {
      setIsSwipingDayView(true)
    }
    const direction: DayTransitionDirection =
      clamped === 0 ? 0 : clamped < 0 ? 1 : -1
    const offset = Math.abs(clamped)
    setPeekState(prev => {
      if (prev.direction === direction && Math.abs(prev.offset - offset) < 1) {
        return prev
      }
      return { direction, offset }
    })
  }

  async function handleTouchEnd() {
    if (view !== 'day' || prefersReducedMotion) {
      touchStartX.current = null
      setIsSwipingDayView(false)
      setPeekState({ direction: 0, offset: 0 })
      return
    }
    if (touchStartX.current === null) {
      setIsSwipingDayView(false)
      setPeekState({ direction: 0, offset: 0 })
      return
    }
    const width =
      touchStartWidth.current || swipeContainerRef.current?.offsetWidth || 1
    const diff = swipeDeltaRef.current
    const threshold = Math.min(140, width * 0.28)
    const absDiff = Math.abs(diff)
    if (absDiff > threshold) {
      const direction: DayTransitionDirection = diff < 0 ? 1 : -1
      const target = direction === 1 ? -width : width
      await sliderControls.start({
        x: target,
        transition: { type: 'spring', stiffness: 280, damping: 32 },
      })
      const nextDate = new Date(currentDate)
      nextDate.setDate(currentDate.getDate() + direction)
      setSkipNextDayAnimation(true)
      updateCurrentDate(nextDate, { direction, animate: false })
    } else {
      await sliderControls.start({
        x: 0,
        transition: { type: 'spring', stiffness: 280, damping: 32 },
      })
    }
    sliderControls.set({ x: 0 })
    swipeDeltaRef.current = 0
    touchStartX.current = null
    touchStartWidth.current = 0
    setPeekState({ direction: 0, offset: 0 })
    setIsSwipingDayView(false)
  }

  const handleTouchCancel = () => {
    void handleTouchEnd()
  }

  const dayTimelineModel = useMemo(
    () =>
      buildDayTimelineModel({
        date: currentDate,
        windows,
        instances,
        projectMap,
        taskMap,
        tasksByProjectId,
        startHour,
        pxPerMin,
        unscheduledProjects,
        schedulerFailureByProjectId,
        schedulerDebug,
        schedulerTimelinePlacements,
        timeZoneShortName,
        friendlyTimeZone,
        localTimeZone,
      }),
    [
      currentDate,
      windows,
      instances,
      projectMap,
      taskMap,
      tasksByProjectId,
      startHour,
      pxPerMin,
      unscheduledProjects,
      schedulerFailureByProjectId,
      schedulerDebug,
      schedulerTimelinePlacements,
      timeZoneShortName,
      friendlyTimeZone,
      localTimeZone,
    ]
  )

  const renderDayTimeline = useCallback(
    (model: DayTimelineModel, options?: { disableInteractions?: boolean }) => {
      const {
        isViewingToday,
        dayViewDateKey,
        dayViewDetails,
        timeZoneShortName: modelTimeZoneShortName,
        friendlyTimeZone: modelFriendlyTimeZone,
        date,
        startHour: modelStartHour,
        pxPerMin: modelPxPerMin,
        windows: modelWindows,
        projectInstances: modelProjectInstances,
        taskInstancesByProject: modelTaskInstancesByProject,
        tasksByProjectId: modelTasksByProjectId,
        standaloneTaskInstances: modelStandaloneTaskInstances,
        windowReports: modelWindowReports,
      } = model

      const containerClass = options?.disableInteractions
        ? 'pointer-events-none select-none'
        : ''

      return (
        <div className={containerClass}>
          <div className="pl-16 pr-6 pt-4 pb-3 text-white">
            <div className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 shadow-[0_10px_30px_rgba(8,8,12,0.28)] backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/60">
                    <span>{isViewingToday ? 'Today' : 'Selected Day'}</span>
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.12] px-2 py-0.5 text-[10px] font-medium tracking-[0.18em] text-white/75">
                      {dayViewDateKey}
                    </span>
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    {dayViewDetails.weekday}
                  </h2>
                  <p className="text-xs text-white/60 sm:text-sm">
                    {dayViewDetails.fullDate}
                  </p>
                </div>
                <div className="flex flex-col gap-1 text-left text-[11px] text-white/60 sm:items-end sm:text-right">
                  {modelTimeZoneShortName ? (
                    <span className="text-sm font-semibold tracking-wide text-white/80 sm:text-base">
                      {modelTimeZoneShortName}
                    </span>
                  ) : null}
                  <span className="text-[10px] uppercase tracking-[0.24em] text-white/50">
                    {modelFriendlyTimeZone}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <DayTimeline date={date} startHour={modelStartHour} pxPerMin={modelPxPerMin}>
            {modelWindows.map(w => {
              const { top, height } = windowRect(w, modelStartHour, modelPxPerMin)
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
            {modelWindowReports.map(report => (
              <div
                key={report.key}
                className="absolute left-16 right-2"
                style={{ top: report.top, height: report.height }}
              >
                <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-sky-100 shadow-[0_18px_38px_rgba(8,12,28,0.55)] backdrop-blur-sm">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-200/80">
                    Window report · {report.windowLabel}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-sky-200/70">
                    <span>{report.rangeLabel}</span>
                    <span>Energy: {report.energyLabel}</span>
                    <span>Duration: {report.durationLabel}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-sky-50">
                    {report.summary}
                  </p>
                  {report.details.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-sky-100/85">
                      {report.details.map((detail, index) => (
                        <li key={`${report.key}-detail-${index}`}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            {modelProjectInstances.map(({ instance, project, start, end }, index) => {
              if (!isValidDate(start) || !isValidDate(end)) return null
              const projectId = project.id
              const startMin = start.getHours() * 60 + start.getMinutes()
              const top = (startMin - modelStartHour * 60) * modelPxPerMin
              const height =
                ((end.getTime() - start.getTime()) / 60000) * modelPxPerMin
              const isExpanded = expandedProjects.has(projectId)
              const projectTaskCandidates =
                modelTaskInstancesByProject[projectId] ?? []
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
              const tasksLabel =
                project.taskCount > 0
                  ? `${project.taskCount} ${
                      project.taskCount === 1 ? 'task' : 'tasks'
                    }`
                  : null
              const detailParts = [`${durationMinutes}m`]
              if (tasksLabel) detailParts.push(tasksLabel)
              let detailText = detailParts.join(' · ')
              const positionStyle: CSSProperties = {
                top,
                height,
              }
              const sharedCardStyle: CSSProperties = {
                boxShadow:
                  '0 28px 58px rgba(3, 3, 6, 0.66), 0 10px 24px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                outline: '1px solid rgba(10, 10, 12, 0.85)',
                outlineOffset: '-1px',
              }
              const projectDurationMs = Math.max(
                end.getTime() - start.getTime(),
                1
              )
              const projectHeightPx = Math.max(
                typeof height === 'number' ? height : 0,
                1
              )
              const minHeightRatio = Math.min(1, 4 / projectHeightPx)
              const backlogTasks = modelTasksByProjectId[projectId] ?? []
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
              const pendingStatus = pendingInstanceStatuses.get(instance.id)
              const effectiveStatus =
                pendingStatus ?? instance.status ?? 'scheduled'
              const isCompleted = effectiveStatus === 'completed'
              const projectBackground = isCompleted
                ? 'radial-gradient(circle at 2% 0%, rgba(16, 185, 129, 0.28), transparent 58%), linear-gradient(140deg, rgba(6, 78, 59, 0.95) 0%, rgba(4, 120, 87, 0.92) 44%, rgba(16, 185, 129, 0.88) 100%)'
                : 'radial-gradient(circle at 0% 0%, rgba(120, 126, 138, 0.28), transparent 58%), linear-gradient(140deg, rgba(8, 8, 10, 0.96) 0%, rgba(22, 22, 26, 0.94) 42%, rgba(88, 90, 104, 0.6) 100%)'
              const projectCardStyle: CSSProperties = {
                ...sharedCardStyle,
                boxShadow: isCompleted
                  ? '0 26px 52px rgba(2, 32, 24, 0.6), 0 12px 28px rgba(1, 55, 34, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
                  : sharedCardStyle.boxShadow,
                outline: isCompleted
                  ? '1px solid rgba(16, 185, 129, 0.55)'
                  : sharedCardStyle.outline,
                background: projectBackground,
              }
              const projectBorderClass = isCompleted
                ? 'border-emerald-400/60'
                : 'border-black/70'
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
                        className={`relative flex h-full w-full items-center justify-between rounded-[var(--radius-lg)] px-3 py-2 text-white backdrop-blur-sm border ${projectBorderClass} transition-[background,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]${
                          canExpand ? ' cursor-pointer' : ''
                        }`}
                        style={projectCardStyle}
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
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {project.name}
                            </span>
                            <div className="text-xs text-zinc-200/70">
                              {detailText}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          {project.skill_icon && (
                            <span className="text-lg leading-none" aria-hidden>
                              {project.skill_icon}
                            </span>
                          )}
                          {renderInstanceActions(instance.id, {
                            className: 'flex-shrink-0',
                          })}
                          <FlameEmber
                            level={
                              (instance.energy_resolved?.toUpperCase() as FlameLevel) ||
                              'NO'
                            }
                            size="sm"
                            className="flex-shrink-0"
                          />
                        </div>
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
                        <motion.button
                          type="button"
                          className="absolute right-2 top-2 z-10 rounded-full border border-white/30 bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white shadow-[0_10px_18px_rgba(0,0,0,0.45)] backdrop-blur transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                          onClick={event => {
                            event.stopPropagation()
                            setProjectExpansion(projectId, false)
                          }}
                        >
                          Back
                        </motion.button>
                        <div className="absolute inset-0 overflow-hidden rounded-[var(--radius-lg)] border border-white/20 bg-white/10"
                          style={sharedCardStyle}
                        />
                        <div className="relative h-full w-full overflow-hidden p-2">
                          {displayCards.map(taskCard => {
                            const {
                              key,
                              task,
                              start: taskStart,
                              end: taskEnd,
                              kind,
                              instanceId,
                              displayDurationMinutes,
                            } = taskCard
                            if (!isValidDate(taskStart) || !isValidDate(taskEnd)) {
                              return null
                            }
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
                              ...sharedCardStyle,
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
                                      appearance: 'light',
                                      className:
                                        'absolute right-3 top-2',
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
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
            {modelStandaloneTaskInstances.map(({ instance, task, start, end }) => {
              if (!isValidDate(start) || !isValidDate(end)) return null
              const startMin = start.getHours() * 60 + start.getMinutes()
              const top = (startMin - modelStartHour * 60) * modelPxPerMin
              const height =
                ((end.getTime() - start.getTime()) / 60000) * modelPxPerMin
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
                  {renderInstanceActions(instance.id, {
                    appearance: 'light',
                    className: 'absolute right-3 top-2',
                  })}
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
        </div>
      )
    },
    [
      prefersReducedMotion,
      hasInteractedWithProjects,
      setProjectExpansion,
      expandedProjects,
      renderInstanceActions,
    ]
  )

  const dayTimelineNode = useMemo(
    () => renderDayTimeline(dayTimelineModel),
    [renderDayTimeline, dayTimelineModel]
  )

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
          ref={swipeContainerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => {
            void handleTouchEnd()
          }}
          onTouchCancel={handleTouchCancel}
        >
          <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
            <RescheduleButton
              onClick={handleRescheduleClick}
              disabled={isScheduling}
              isRunning={isScheduling}
            />
            {hasAutoRunToday === false && (
              <span className="text-[11px] font-medium text-white/75 drop-shadow">
                Auto-rescheduling now from your current time…
              </span>
            )}
            {hasAutoRunToday === true && (
              <span className="text-[11px] font-medium text-white/70 drop-shadow">
                Automatic reschedule already ran today. Use the button to refresh.
              </span>
            )}
          </div>
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
                {prefersReducedMotion ? (
                  dayTimelineNode
                ) : isSwipingDayView ? (
                  <div className="relative overflow-hidden">
                    <motion.div animate={sliderControls} initial={false}>
                      {dayTimelineNode}
                    </motion.div>
                    <DayPeekOverlays
                      peekState={peekState}
                      previousLabel={previousDayLabel}
                      nextLabel={nextDayLabel}
                      previousKey={previousDayKey}
                      nextKey={nextDayKey}
                      containerRef={swipeContainerRef}
                      previousModel={peekModels.previous}
                      nextModel={peekModels.next}
                      renderPreview={renderDayTimeline}
                    />
                  </div>
                ) : skipNextDayAnimation ? (
                  <div key={dayViewDateKey}>{dayTimelineNode}</div>
                ) : (
                  <AnimatePresence
                    mode="sync"
                    initial={false}
                    custom={dayTransitionDirection}
                  >
                    <motion.div
                      key={dayViewDateKey}
                      custom={dayTransitionDirection}
                      variants={dayTimelineVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={dayTimelineTransition}
                    >
                      {dayTimelineNode}
                    </motion.div>
                  </AnimatePresence>
                )}
                <FocusTimelineFab />
              </ScheduleViewShell>
            )}
            {view === 'focus' && (
              <ScheduleViewShell key="focus">
                <FocusTimeline />
              </ScheduleViewShell>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ProtectedRoute>
  )
}
