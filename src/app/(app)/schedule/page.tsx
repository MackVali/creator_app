"use client"

export const runtime = 'nodejs'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  AnimatePresence,
  LayoutGroup,
  animate,
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
} from 'framer-motion'
import type { AnimationPlaybackControls } from 'framer-motion'
import { Lock } from 'lucide-react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { useAuth } from '@/components/auth/AuthProvider'
import {
  DayTimeline,
  TIMELINE_CARD_LEFT_FALLBACK,
  TIMELINE_CARD_RIGHT_FALLBACK,
  TIMELINE_GRID_LEFT_FALLBACK,
  TIMELINE_GRID_RIGHT_FALLBACK,
  TIMELINE_LABEL_COLUMN_FALLBACK,
  TIMELINE_RIGHT_GUTTER_FALLBACK,
} from '@/components/schedule/DayTimeline'
import { FocusTimeline, FocusTimelineFab } from '@/components/schedule/FocusTimeline'
import FlameEmber, { FlameLevel, type FlameEmberProps } from '@/components/FlameEmber'
import { ScheduleTopBar } from '@/components/schedule/ScheduleTopBar'
import { JumpToDateSheet } from '@/components/schedule/JumpToDateSheet'
import { ScheduleSearchSheet } from '@/components/schedule/ScheduleSearchSheet'
import { ProjectEditSheet } from '@/components/schedule/ProjectEditSheet'
import { HabitEditSheet } from '@/components/schedule/HabitEditSheet'
import { type ScheduleEditOrigin } from '@/components/schedule/ScheduleMorphDialog'
import { scheduleInstanceLayoutTokens } from '@/components/schedule/sharedLayout'
import { SchedulerModeSheet } from '@/components/schedule/SchedulerModeSheet'
import { type ScheduleView } from '@/components/schedule/viewUtils'
import {
  updateTaskStage,
  windowsForDateFromSnapshot,
  type WindowLite as RepoWindow,
} from '@/lib/scheduler/repo'
import {
  fetchScheduledProjectIds,
  updateInstanceStatus,
  type ScheduleInstance,
} from '@/lib/scheduler/instanceRepo'
import { TaskLite, ProjectLite } from '@/lib/scheduler/weight'
import { buildProjectItems } from '@/lib/scheduler/projects'
import { windowRectMinutes, timeToMin } from '@/lib/scheduler/windowRect'
import { ENERGY } from '@/lib/scheduler/config'
import {
  DEFAULT_HABIT_DURATION_MIN,
  type HabitScheduleItem,
} from '@/lib/scheduler/habits'
import {
  mergeHabitCompletionStateFromInstances,
} from '@/lib/scheduler/habitCompletionState'
import {
  computeTimelineLayoutForSyncHabits,
  type TimelineCardLayoutMode,
} from '@/lib/scheduler/syncLayout'
import type { ScheduleEventDataset } from '@/lib/scheduler/dataset'
import { formatLocalDateKey, toLocal } from '@/lib/time/tz'
import { startOfDayInTimeZone, addDaysInTimeZone, makeDateInTimeZone } from '@/lib/scheduler/timezone'
import {
  TIME_FORMATTER,
  describeEmptyWindowReport,
  energyIndexFromLabel,
  formatDurationLabel,
  type SchedulerRunFailure,
} from '@/lib/scheduler/windowReports'
import type { SkillRow } from '@/lib/types/skill'
import type { Monument } from '@/lib/queries/monuments'
import {
  selectionToSchedulerModePayload,
  type SchedulerModeSelection,
  type SchedulerModeType,
} from '@/lib/scheduler/modes'
import { createMemoNoteForHabit } from '@/lib/notesStorage'
import { MemoNoteSheet } from '@/components/schedule/MemoNoteSheet'
import { useProfile } from '@/lib/hooks/useProfile'

type DayTransitionDirection = -1 | 0 | 1

type PeekState = {
  direction: DayTransitionDirection
  offset: number
}

type HabitCompletionStatus = 'scheduled' | 'completed'

const HABIT_COMPLETION_STORAGE_PREFIX = 'schedule-habit-completions'
const DAY_PEEK_SAFE_GAP_PX = 24
const MIN_PX_PER_MIN = 0.9
const MAX_PX_PER_MIN = 3.2
const PX_PER_MIN_STOPS = [
  0.9,
  1.1,
  1.25,
  1.4,
  1.6,
  1.8,
  2,
  2.2,
  2.4,
  2.6,
  2.8,
  3,
  3.2,
] as const
const VERTICAL_SCROLL_THRESHOLD_PX = 20
const VERTICAL_SCROLL_BIAS_PX = 8
const VERTICAL_SCROLL_SLOPE = 1.35
const SCHEDULE_CARD_LONG_PRESS_MS = 650
const LONG_PRESS_FEEDBACK_DURATION_MS = 280
const LONG_PRESS_ACTION_DELAY_MS = 120
const HABIT_STREAK_BADGE_BASE_HEIGHT_PX = 22
const HABIT_STREAK_BADGE_TOP_MARGIN_PX = 8
const HABIT_STREAK_BADGE_BOTTOM_MARGIN_PX = 2
const HABIT_COMPACT_SHADOW_HEIGHT_PX = 96
const HABIT_COMPACT_SHADOW =
  '0 14px 32px rgba(6, 8, 20, 0.52), 0 6px 16px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
const TIMELINE_COMPACT_CARD_HEIGHT_PX = 56
const TIMELINE_COMPACT_CARD_SHADOW =
  '0 14px 28px rgba(6, 8, 20, 0.45), 0 8px 18px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
const TIMELINE_COMPACT_CARD_COMPLETED_SHADOW =
  '0 16px 32px rgba(2, 32, 24, 0.5), 0 8px 18px rgba(1, 55, 34, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
const TIMELINE_STACK_BASE_Z_INDEX = 30
const TIMELINE_STACK_SCALE = 10

const TIMELINE_CSS_VARIABLES: CSSProperties = {
  '--timeline-label-column': TIMELINE_LABEL_COLUMN_FALLBACK,
  '--timeline-right-gutter': TIMELINE_RIGHT_GUTTER_FALLBACK,
  '--timeline-grid-left': TIMELINE_GRID_LEFT_FALLBACK,
  '--timeline-grid-right': TIMELINE_GRID_RIGHT_FALLBACK,
  '--timeline-card-left': TIMELINE_CARD_LEFT_FALLBACK,
  '--timeline-card-right': TIMELINE_CARD_RIGHT_FALLBACK,
}

const TIMELINE_FULL_BLEED_STYLE: CSSProperties = {
  width: '100vw',
  marginLeft: 'calc(50% - 50vw)',
  marginRight: 'calc(50% - 50vw)',
  '--timeline-label-column': 'clamp(1.75rem, 5vw, 2.5rem)',
  '--timeline-grid-left': '0px',
}

const TIMELINE_HEADER_PADDING: CSSProperties = {
  paddingLeft: `var(--timeline-card-left, ${TIMELINE_CARD_LEFT_FALLBACK})`,
  paddingRight: `var(--timeline-grid-right, ${TIMELINE_GRID_RIGHT_FALLBACK})`,
}

const TIMELINE_CARD_BOUNDS: CSSProperties = {
  left: `var(--timeline-card-left, ${TIMELINE_CARD_LEFT_FALLBACK})`,
  right: `var(--timeline-card-right, ${TIMELINE_CARD_RIGHT_FALLBACK})`,
}

const getScheduleInstanceLayoutId = (instanceId: string) =>
  `schedule-instance-${instanceId}`

function computeDayTimelineHeightPx(
  startHour: number,
  pxPerMin: number,
  endHour = 24
) {
  const safeStart = Number.isFinite(startHour) ? startHour : 0
  const safeEnd = Number.isFinite(endHour) ? endHour : 24
  const normalizedEnd = Math.max(safeStart, safeEnd)
  const durationMinutes = Math.max(0, (normalizedEnd - safeStart) * 60)
  const safePxPerMin = Number.isFinite(pxPerMin) ? pxPerMin : MIN_PX_PER_MIN
  return durationMinutes * safePxPerMin
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

function clampPxPerMin(value: number) {
  if (!Number.isFinite(value)) return MIN_PX_PER_MIN
  return Math.min(MAX_PX_PER_MIN, Math.max(MIN_PX_PER_MIN, value))
}

function snapPxPerMin(value: number) {
  const clamped = clampPxPerMin(value)
  let closest = PX_PER_MIN_STOPS[0]
  let minDelta = Math.abs(clamped - closest)
  for (let index = 1; index < PX_PER_MIN_STOPS.length; index += 1) {
    const stop = PX_PER_MIN_STOPS[index]
    const delta = Math.abs(clamped - stop)
    if (delta < minDelta) {
      closest = stop
      minDelta = delta
    }
  }
  return closest
}

function getTouchDistance(a: Touch, b: Touch) {
  const dx = a.clientX - b.clientX
  const dy = a.clientY - b.clientY
  return Math.hypot(dx, dy)
}

function isTouchWithinElement(touch: Touch, element: HTMLElement) {
  const target = touch.target
  if (target && target instanceof Node && element.contains(target)) {
    return true
  }
  const rect = element.getBoundingClientRect()
  const x = touch.clientX
  const y = touch.clientY
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function parseScheduleDateParam(value: string | null) {
  if (!value) {
    return { date: new Date(), wasValid: false }
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value)
  if (dateMatch) {
    const [, yearStr, monthStr, dayStr] = dateMatch
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day)
    ) {
      const localDate = new Date(year, month - 1, day)
      const isSameDate =
        localDate.getFullYear() === year &&
        localDate.getMonth() === month - 1 &&
        localDate.getDate() === day
      if (!Number.isNaN(localDate.getTime()) && isSameDate) {
        return { date: localDate, wasValid: true }
      }
    }
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return { date: new Date(), wasValid: false }
  }

  return { date: parsed, wasValid: true }
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

function SkillEnergyBadge({
  energyLevel,
  skillIcon,
  size = 'sm',
  className = '',
  iconClassName = 'text-lg leading-none',
  flameClassName,
}: {
  energyLevel: FlameLevel
  skillIcon?: string | null
  size?: FlameEmberProps['size']
  className?: string
  iconClassName?: string
  flameClassName?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {skillIcon ? (
        <span className={iconClassName} aria-hidden>
          {skillIcon}
        </span>
      ) : null}
      <FlameEmber level={energyLevel} size={size} className={flameClassName} />
    </span>
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

type SchedulerTimelineEntry =
  | {
      type: 'PROJECT'
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
      locked: boolean
    }
  | {
      type: 'HABIT'
      habitId: string
      habitName: string | null
      windowId: string | null
      decision: 'kept' | 'new' | 'rescheduled'
      startUTC: string
      endUTC: string
      durationMin: number | null
      energyResolved: string | null
      scheduledDayOffset: number | null
      availableStartLocal: string | null
      windowStartLocal: string | null
      clipped: boolean
      practiceContextId?: string | null
    }

type SchedulerTimelinePlacement =
  | {
      type: 'PROJECT'
      projectId: string
      projectName: string
      locked: boolean
      start: Date
      end: Date
      durationMinutes: number | null
      energyLabel: (typeof ENERGY.LIST)[number]
      decision: SchedulerTimelineEntry['decision']
    }
  | {
      type: 'HABIT'
      habitId: string
      habitName: string
      start: Date
      end: Date
      durationMinutes: number | null
      energyLabel: (typeof ENERGY.LIST)[number]
      decision: SchedulerTimelineEntry['decision']
      clipped: boolean
      practiceContextId: string | null
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
  habitPlacements: HabitTimelinePlacement[]
  windowReports: WindowReportEntry[]
}


type DayTimelineRenderOptions = {
  disableInteractions?: boolean
  containerRef?: RefObject<HTMLDivElement | null>
  fullBleed?: boolean
}


// Project task cards are rendered when a scheduled project tile is expanded.
// "scheduled" cards correspond to concrete instances returned by the scheduler
// while "fallback" cards are synthesized previews drawn from the project's
// backlog when no scheduled breakdown exists for the block.
type ProjectTaskCard = {
  key: string
  task: TaskLite
  start: Date
  end: Date
  kind: 'scheduled' | 'fallback'
  instanceId?: string
  displayDurationMinutes: number
}

type HabitTimelinePlacement = {
  habitId: string
  habitName: string
  habitType: HabitScheduleItem['habitType']
  skillId: string | null
  practiceContextId: string | null
  currentStreakDays: number
  instanceId: string | null
  start: Date
  end: Date
  durationMinutes: number
  window: RepoWindow
  truncated: boolean
}

type MemoNoteDraftState = {
  habitId: string
  habitName: string
  skillId: string | null
  dateKey: string
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function getDayMinuteOffset(date: Date) {
  const timestamp = date.getTime()
  if (!Number.isFinite(timestamp)) return 0
  const baseMinutes = date.getHours() * 60 + date.getMinutes()
  return baseMinutes + date.getSeconds() / 60 + date.getMilliseconds() / 60000
}

function computeTimelineStackingIndex(startOffsetMinutes: number) {
  if (!Number.isFinite(startOffsetMinutes)) return TIMELINE_STACK_BASE_Z_INDEX
  const safeOffset = Math.max(0, startOffsetMinutes)
  return Math.round(TIMELINE_STACK_BASE_Z_INDEX + safeOffset * TIMELINE_STACK_SCALE)
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

function computeHabitPlacementsForDay({
  habits: allHabits,
  windows,
  date,
  timeZone,
  projectInstances,
  schedulerTimelinePlacements,
  instances,
}: {
  habits: HabitScheduleItem[]
  windows: RepoWindow[]
  date: Date
  timeZone: string
  projectInstances?: ReturnType<typeof computeProjectInstances>
  schedulerTimelinePlacements?: SchedulerTimelinePlacement[]
  instances?: ScheduleInstance[]
}): HabitTimelinePlacement[] {
  if (allHabits.length === 0) return []

  const zone = timeZone || 'UTC'
  const availability = new Map<string, number>()

  const habitMap = new Map(allHabits.map(habit => [habit.id, habit]))

  const windowEntries = windows
    .map((window) => {
      const { start: windowStart, end: windowEnd } = resolveWindowBoundsForDate(window, date)
      if (!isValidDate(windowStart) || !isValidDate(windowEnd)) {
        return null
      }
      const startMs = windowStart.getTime()
      const endMs = windowEnd.getTime()
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return null
      }
      const energyIdx = energyIndexFromLabel(window.energy)
      const key = `${window.id}:${windowStart.toISOString()}`
      return { window, windowStart, windowEnd, startMs, endMs, energyIdx, key }
    })
    .filter((entry): entry is {
      window: RepoWindow
      windowStart: Date
      windowEnd: Date
      startMs: number
      endMs: number
      energyIdx: number
      key: string
    } => entry !== null)
    .sort((a, b) => a.startMs - b.startMs)

  const anchorStartsByWindowKey = new Map<string, number[]>()

  for (const entry of windowEntries) {
    addAnchorStart(anchorStartsByWindowKey, entry.key, entry.startMs)
  }

  if (projectInstances && projectInstances.length > 0) {
    for (const instance of projectInstances) {
      const instanceStart = instance.start.getTime()
      const instanceEnd = instance.end.getTime()
      if (!Number.isFinite(instanceStart) || !Number.isFinite(instanceEnd)) continue

      for (const entry of windowEntries) {
        const overlaps = instanceEnd > entry.startMs && instanceStart < entry.endMs
        if (!overlaps) continue
        const anchor = Math.max(entry.startMs, instanceStart)
        addAnchorStart(anchorStartsByWindowKey, entry.key, anchor)
      }
    }
  }

  const timelineHabitPlacements = new Map<string, Extract<SchedulerTimelinePlacement, { type: 'HABIT' }>>()
  if (schedulerTimelinePlacements && schedulerTimelinePlacements.length > 0) {
    for (const placement of schedulerTimelinePlacements) {
      if (placement.type !== 'HABIT') continue
      const key = habitTimelinePlacementKey(placement.habitId, placement.start)
      if (!timelineHabitPlacements.has(key)) {
        timelineHabitPlacements.set(key, placement)
      }
    }
    for (const placement of schedulerTimelinePlacements) {
      if (placement.type !== 'HABIT' && placement.type !== 'PROJECT') continue
      const startMs = placement.start.getTime()
      const endMs = placement.end.getTime()
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue

      for (const entry of windowEntries) {
        const overlaps = endMs > entry.startMs && startMs < entry.endMs
        if (!overlaps) continue
        const anchor = Math.max(entry.startMs, startMs)
        addAnchorStart(anchorStartsByWindowKey, entry.key, anchor)
      }
    }
  }

  const placements: HabitTimelinePlacement[] = []
  const placedHabitKeys = new Set<string>()

  if (instances && instances.length > 0) {
    for (const instance of instances) {
      if (instance.source_type !== 'HABIT') continue
      if (instance.status !== 'scheduled' && instance.status !== 'completed') continue
      const habit = habitMap.get(instance.source_id)
      if (!habit) continue
      const start = toLocal(instance.start_utc)
      const end = toLocal(instance.end_utc)
      if (!isValidDate(start) || !isValidDate(end)) continue
      const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))
      const assignedEntry = windowEntries.find(entry => entry.window.id === instance.window_id)
      const window = assignedEntry
        ? assignedEntry.window
        : createFallbackWindowForHabitInstance({
            habit,
            instance,
            start,
            end,
            timeZone: zone,
          })
      const timelineKey = habitTimelinePlacementKey(habit.id, start)
      if (placedHabitKeys.has(timelineKey)) {
        continue
      }
      const timelinePlacement = timelineHabitPlacements.get(timelineKey)
      const rawPlacementHabitType = habit.habitType ?? 'HABIT'
      const normalizedHabitType = rawPlacementHabitType === 'ASYNC' ? 'SYNC' : rawPlacementHabitType
      const preferredPracticeContextId = habit.skillMonumentId ?? null
      let resolvedPracticeContextId = preferredPracticeContextId
      if (!resolvedPracticeContextId) {
        resolvedPracticeContextId = instance.practice_context_monument_id ?? null
      }
      if (!resolvedPracticeContextId && timelinePlacement?.practiceContextId) {
        resolvedPracticeContextId = timelinePlacement.practiceContextId
      }
      placements.push({
        habitId: habit.id,
        habitName: habit.name,
        habitType: habit.habitType,
        skillId: habit.skillId ?? null,
        practiceContextId:
          normalizedHabitType === 'PRACTICE' ? resolvedPracticeContextId ?? null : null,
        currentStreakDays: Math.max(
          0,
          Number.isFinite(habit.currentStreakDays)
            ? Math.round(habit.currentStreakDays)
            : 0
        ),
        instanceId: instance.id ?? null,
        start,
        end,
        durationMinutes,
        window,
        truncated: timelinePlacement?.clipped ?? false,
      })
      placedHabitKeys.add(timelineKey)

      if (assignedEntry) {
        const normalizedEnd = Math.min(
          assignedEntry.endMs,
          Math.max(assignedEntry.startMs, end.getTime()),
        )
        const previous = availability.get(assignedEntry.key) ?? assignedEntry.startMs
        availability.set(assignedEntry.key, Math.max(previous, normalizedEnd))
        addAnchorStart(anchorStartsByWindowKey, assignedEntry.key, start.getTime())
      }
    }
  }

  placements.sort((a, b) => a.start.getTime() - b.start.getTime())
  return placements
}

function habitTimelinePlacementKey(habitId: string, start: Date) {
  return `${habitId}:${formatLocalDateKey(start)}`
}

const windowTimeFormatterCache = new Map<string, Intl.DateTimeFormat>()

function formatTimeForWindow(date: Date, timeZone: string) {
  const key = timeZone || 'UTC'
  let formatter = windowTimeFormatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: key,
    })
    windowTimeFormatterCache.set(key, formatter)
  }
  return formatter.format(date)
}

function createFallbackWindowForHabitInstance({
  habit,
  instance,
  start,
  end,
  timeZone,
}: {
  habit: HabitScheduleItem
  instance: ScheduleInstance
  start: Date
  end: Date
  timeZone: string
}): RepoWindow {
  const startLocal = formatTimeForWindow(start, timeZone)
  const endLocal = formatTimeForWindow(end, timeZone)
  const dayStart = startOfDayInTimeZone(end, timeZone)
  const fromPrevDay = start.getTime() < dayStart.getTime()
  const energySource =
    instance.energy_resolved || habit.energy || habit.window?.energy || 'NO'

  return {
    id: instance.window_id ?? `habit-${habit.id}`,
    label: habit.window?.label ?? 'Anytime',
    energy: energySource,
    start_local: startLocal,
    end_local: endLocal,
    days: null,
    location_context_id:
      habit.locationContextId ?? habit.window?.locationContextId ?? null,
    location_context_value:
      habit.locationContextValue ?? habit.window?.locationContextValue ?? null,
    location_context_name:
      habit.locationContextName ?? habit.window?.locationContextName ?? null,
    fromPrevDay,
  }
}

function addAnchorStart(map: Map<string, number[]>, key: string, startMs: number) {
  if (!Number.isFinite(startMs)) return
  const existing = map.get(key)
  if (!existing) {
    map.set(key, [startMs])
    return
  }
  const alreadyPresent = existing.some((value) => Math.abs(value - startMs) < 30)
  if (alreadyPresent) return
  let inserted = false
  for (let index = 0; index < existing.length; index += 1) {
    if (startMs < existing[index]) {
      existing.splice(index, 0, startMs)
      inserted = true
      break
    }
  }
  if (!inserted) {
    existing.push(startMs)
  }
}

function computeWindowReportsForDay({
  windows,
  projectInstances,
  startHour,
  unscheduledProjects,
  schedulerFailureByProjectId,
  schedulerDebug,
  schedulerTimelinePlacements,
  habitPlacements,
  currentDate,
}: {
  windows: RepoWindow[]
  projectInstances: ReturnType<typeof computeProjectInstances>
  startHour: number
  unscheduledProjects: ProjectItem[]
  schedulerFailureByProjectId: Record<string, SchedulerRunFailure[]>
  schedulerDebug: SchedulerDebugState | null
  schedulerTimelinePlacements: SchedulerTimelinePlacement[]
  habitPlacements: HabitTimelinePlacement[]
  currentDate: Date
}): WindowReportEntry[] {
  if (windows.length === 0) return []
  const assignments = new Map<string, number>()
    const projectSpans = projectInstances
      .map(({ instance, start, end, assignedWindow }) => {
        if (!isValidDate(start) || !isValidDate(end)) return null
        const windowId = instance.window_id || assignedWindow?.id || null
        if (windowId) {
          assignments.set(windowId, (assignments.get(windowId) ?? 0) + 1)
        }
        return { windowId, start, end }
    })
    .filter(
      (value): value is {
        windowId: string | null
        start: Date
        end: Date
      } => value !== null
    )

  for (const habit of habitPlacements) {
    assignments.set(habit.window.id, (assignments.get(habit.window.id) ?? 0) + 1)
  }

  const scheduledSpans = [
    ...projectSpans,
    ...habitPlacements.map(placement => ({
      windowId: placement.window.id,
      start: placement.start,
      end: placement.end,
    })),
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
    if (!isValidDate(windowStart) || !isValidDate(windowEnd)) {
      continue
    }
    const assigned = assignments.get(win.id) ?? 0
    if (assigned > 0) continue

    const windowHasScheduledProject = scheduledSpans.some(span => {
      if (span.windowId === win.id) return true
      return span.start < windowEnd && span.end > windowStart
    })
    if (windowHasScheduledProject) continue

    const durationMinutes = windowDurationForDay(win, startHour)
    if (durationMinutes <= 0) continue
    const windowLabel = win.label?.trim() || 'Untitled window'
    const energyLabel = normalizeEnergyLabel(win.energy)
    const windowEnergyIndex = energyIndexFromLabel(energyLabel)
    const futurePlacements = schedulerTimelinePlacements
      .filter(
        (entry): entry is Extract<SchedulerTimelinePlacement, { type: 'PROJECT' }> =>
          entry.type === 'PROJECT'
      )
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
      window: win,
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

const TIMELINE_LEFT_OFFSET = '4rem'
const TIMELINE_RIGHT_OFFSET = '0.5rem'
const TIMELINE_PAIR_WIDTH = `calc((100% - ${TIMELINE_LEFT_OFFSET} - ${TIMELINE_RIGHT_OFFSET}) / 2)`
const TIMELINE_PAIR_RIGHT_LEFT = `calc(${TIMELINE_LEFT_OFFSET} + ${TIMELINE_PAIR_WIDTH})`

function applyTimelineLayoutStyle(
  style: CSSProperties,
  mode: TimelineCardLayoutMode,
  options?: { animate?: boolean }
): CSSProperties {
  const baseStyle: CSSProperties = { ...style }
  if (mode === 'paired-left') {
    baseStyle.left = TIMELINE_LEFT_OFFSET
    baseStyle.width = TIMELINE_PAIR_WIDTH
    baseStyle.right = undefined
  } else if (mode === 'paired-right') {
    baseStyle.left = TIMELINE_PAIR_RIGHT_LEFT
    baseStyle.width = TIMELINE_PAIR_WIDTH
    baseStyle.right = undefined
  } else {
    baseStyle.left = TIMELINE_LEFT_OFFSET
    baseStyle.right = TIMELINE_RIGHT_OFFSET
  }

  if (options?.animate) {
    const duration = 280
    const easing = 'cubic-bezier(0.33, 1, 0.68, 1)'
    baseStyle.transition = `left ${duration}ms ${easing}, right ${duration}ms ${easing}, width ${duration}ms ${easing}`
  }

  return baseStyle
}

function getTimelineCardCornerClass(mode: TimelineCardLayoutMode) {
  if (mode === 'paired-left') {
    return 'rounded-l-[var(--schedule-instance-radius)] rounded-r-none'
  }
  if (mode === 'paired-right') {
    return 'rounded-r-[var(--schedule-instance-radius)] rounded-l-none'
  }
  return 'rounded-[var(--schedule-instance-radius)]'
}

function buildDayTimelineModel({
  date,
  windows,
  instances,
  projectMap,
  taskMap,
  tasksByProjectId,
  habits,
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
  habits: HabitScheduleItem[]
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
  const dayViewDateKey = formatLocalDateKey(date)
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
  const habitPlacements = computeHabitPlacementsForDay({
    habits,
    windows,
    date,
    timeZone: localTimeZone ?? 'UTC',
    projectInstances,
    schedulerTimelinePlacements,
    instances,
  })
  const windowReports = computeWindowReportsForDay({
    windows,
    projectInstances,
    startHour,
    unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    habitPlacements,
    currentDate: date,
  })
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
    habitPlacements,
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
  scrollProgress,
  baseTimelineHeight,
  timelineChromeHeight,
  pxPerMin,
}: {
  peekState: PeekState
  previousLabel: string
  nextLabel: string
  previousKey: string
  nextKey: string
  containerRef: RefObject<HTMLDivElement | null>
  previousModel?: DayTimelineModel | null
  nextModel?: DayTimelineModel | null
  renderPreview: (
    model: DayTimelineModel,
    options?: DayTimelineRenderOptions
  ) => ReactNode
  scrollProgress: number | null
  baseTimelineHeight: number
  timelineChromeHeight: number
  pxPerMin: number
}) {
  const container = containerRef.current
  const containerWidth = container?.offsetWidth ?? 0
  const maxPeekWidth = containerWidth > 0 ? containerWidth * 0.45 : 0
  const safeGap = Math.min(DAY_PEEK_SAFE_GAP_PX, maxPeekWidth)
  const maxVisiblePeekWidth = Math.max(0, maxPeekWidth - safeGap)
  const limitedOffset = maxPeekWidth > 0 ? Math.min(peekState.offset, maxPeekWidth) : 0
  const offset =
    maxVisiblePeekWidth > 0
      ? Math.min(Math.max(0, limitedOffset - safeGap), maxVisiblePeekWidth)
      : 0
  if (!offset || peekState.direction === 0) return null

  const progress =
    maxVisiblePeekWidth > 0 ? Math.min(1, offset / maxVisiblePeekWidth) : 0
  const translate = (1 - progress) * 35
  const opacity = 0.25 + progress * 0.6
  const shadowOpacity = 0.45 + progress * 0.3

  const isNext = peekState.direction === 1
  const label = isNext ? nextLabel : previousLabel
  const keyLabel = isNext ? nextKey : previousKey
  const previewModel = isNext ? nextModel : previousModel
  const expectedKey = isNext ? nextKey : previousKey
  const isModelForDirection = previewModel?.dayViewDateKey === expectedKey
  const resolvedPreviewModel = isModelForDirection ? previewModel : null
  const previewTimelineHeight = resolvedPreviewModel
    ? computeDayTimelineHeightPx(resolvedPreviewModel.startHour, pxPerMin)
    : baseTimelineHeight
  const previewContainerHeight = previewTimelineHeight + timelineChromeHeight
  const alignment = isNext ? 'items-end text-right' : 'items-start text-left'
  const cornerClass = isNext
    ? 'rounded-l-[var(--radius-lg)]'
    : 'rounded-r-[var(--radius-lg)]'
  const transformOrigin = isNext ? 'right center' : 'left center'

  let overlayCenter: number | null = null
  let visibleHeight: number | null = null
  if (container) {
    const rect = container.getBoundingClientRect()
    const height = container.offsetHeight
    const viewportHeightRaw =
      typeof window !== 'undefined'
        ? window.visualViewport?.height ?? window.innerHeight
        : container.offsetHeight
    const viewportHeight = Number.isFinite(viewportHeightRaw)
      ? viewportHeightRaw
      : container.offsetHeight
    const visibleStart = Math.max(0, -rect.top)
    const visibleEnd = Math.min(height, viewportHeight - rect.top)
    visibleHeight = Math.max(0, visibleEnd - visibleStart)
    if (visibleHeight > 0) {
      overlayCenter = visibleStart + visibleHeight / 2
    } else {
      overlayCenter = height / 2
    }
  }

  const fallbackContainerHeight =
    container?.offsetHeight ?? (previewContainerHeight > 0 ? previewContainerHeight : null)
  const anchorProgressRaw =
    scrollProgress !== null
      ? scrollProgress
      : overlayCenter !== null && fallbackContainerHeight
        ? overlayCenter / fallbackContainerHeight
        : 0.5
  const anchorProgress = Math.min(Math.max(anchorProgressRaw, 0), 1)
  const overlayAnchor =
    fallbackContainerHeight !== null
      ? fallbackContainerHeight * anchorProgress
      : overlayCenter ?? 0
  const overlayStyle: CSSProperties =
    fallbackContainerHeight !== null
      ? { top: overlayAnchor, transform: 'translateY(-50%)' }
      : { top: '50%', transform: 'translateY(-50%)' }

  const viewportHeight =
    visibleHeight && visibleHeight > 0
      ? visibleHeight
      : fallbackContainerHeight ?? previewContainerHeight
  const safeViewportHeight = viewportHeight && viewportHeight > 0 ? viewportHeight : previewContainerHeight
  const previewAnchorOffset = previewContainerHeight * anchorProgress
  const halfViewport = safeViewportHeight / 2
  const translateYRaw = halfViewport - previewAnchorOffset
  const minTranslate = Math.min(0, safeViewportHeight - previewContainerHeight)
  const maxTranslate = 0
  const previewTranslateY = Math.min(Math.max(translateYRaw, minTranslate), maxTranslate)
  const clampedPreviewHeight = safeViewportHeight > 0 ? safeViewportHeight : undefined

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex"
      style={overlayStyle}
    >
      <div
        className={`relative flex flex-1 ${isNext ? 'justify-end' : 'justify-start'}`}
        style={{
          paddingRight: isNext ? safeGap : 0,
          paddingLeft: isNext ? 0 : safeGap,
        }}
      >
        <div
          className={`pointer-events-none flex flex-col gap-3 border border-white/10 bg-white/8 px-5 py-4 text-white backdrop-blur-md ${alignment} ${cornerClass}`}
          style={{
            width: offset,
            opacity,
            transform: `translateX(${isNext ? translate : -translate}%)`,
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
          <div
            className="overflow-hidden rounded-[var(--radius-lg)] border border-white/10 bg-black/40"
            style={{ height: clampedPreviewHeight }}
          >
            {resolvedPreviewModel ? (
              <div
                className="pointer-events-none"
                style={{
                  height: previewContainerHeight,
                  transform: `translateY(${previewTranslateY}px)`,
                }}
              >
                {renderPreview(resolvedPreviewModel, { disableInteractions: true })}
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
      type?: unknown
      instance?: unknown
      projectId?: unknown
      decision?: unknown
      scheduledDayOffset?: unknown
      availableStartLocal?: unknown
      windowStartLocal?: unknown
      habit?: unknown
    }
    const typeRaw = typeof value.type === 'string' ? value.type.toUpperCase() : null

    if (typeRaw === 'HABIT') {
      const habitValue = value.habit
      if (!habitValue || typeof habitValue !== 'object') continue
      const habitEntry = habitValue as {
        id?: unknown
        name?: unknown
        windowId?: unknown
        startUTC?: unknown
        endUTC?: unknown
        durationMin?: unknown
        energyResolved?: unknown
        clipped?: unknown
      }
      const habitId = typeof habitEntry.id === 'string' ? habitEntry.id : null
      const startUTC = typeof habitEntry.startUTC === 'string' ? habitEntry.startUTC : null
      const endUTC = typeof habitEntry.endUTC === 'string' ? habitEntry.endUTC : null
      if (!habitId || !startUTC || !endUTC) continue
      const decision = value.decision
      if (decision !== 'kept' && decision !== 'new' && decision !== 'rescheduled') continue
      const windowId = typeof habitEntry.windowId === 'string' ? habitEntry.windowId : null
      const durationMin =
        typeof habitEntry.durationMin === 'number' && Number.isFinite(habitEntry.durationMin)
          ? habitEntry.durationMin
          : null
      const energyResolved =
        typeof habitEntry.energyResolved === 'string' && habitEntry.energyResolved.trim().length > 0
          ? habitEntry.energyResolved
          : null
      const practiceContextId =
        typeof habitEntry.practiceContextId === 'string' && habitEntry.practiceContextId.length > 0
          ? habitEntry.practiceContextId
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
      const habitName =
        typeof habitEntry.name === 'string' && habitEntry.name.trim().length > 0
          ? habitEntry.name
          : null
      const clipped = habitEntry.clipped === true

      results.push({
        type: 'HABIT',
        habitId,
        habitName,
        windowId,
        decision,
        startUTC,
        endUTC,
        durationMin,
        energyResolved,
        scheduledDayOffset,
        availableStartLocal,
        windowStartLocal,
        clipped,
        practiceContextId,
      })
      continue
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
      locked?: unknown
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
      type: 'PROJECT',
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
      locked: instanceValue.locked === true,
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
              const typedEntry = entry as {
                source_id?: unknown
                source_type?: unknown
              }
              const rawType = typedEntry.source_type
              const normalizedType =
                typeof rawType === 'string' ? rawType.toUpperCase() : null
              if (normalizedType !== 'PROJECT') return null
              const id = typedEntry.source_id
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
  window: RepoWindow
  windowLabel: string
  summary: string
  details: string[]
  energyLabel: (typeof ENERGY.LIST)[number]
  durationLabel: string
  rangeLabel: string
}

const ENERGY_LABEL_SET = new Set<(typeof ENERGY.LIST)[number]>(ENERGY.LIST)
const DEFAULT_ENERGY_ID_LOOKUP: Record<string, (typeof ENERGY.LIST)[number]> = ENERGY.LIST.reduce(
  (map, label, index) => {
    map[String(index + 1)] = label
    map[label] = label
    return map
  },
  {} as Record<string, (typeof ENERGY.LIST)[number]>
)
let scheduleEnergyLookupMap: Record<string, (typeof ENERGY.LIST)[number]> = {
  ...DEFAULT_ENERGY_ID_LOOKUP,
}

function normalizeEnergyLabel(level?: string | null): (typeof ENERGY.LIST)[number] {
  return resolveEnergyLevel(level) ?? 'NO'
}

function resolveEnergyLevel(value?: unknown): (typeof ENERGY.LIST)[number] | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const direct = scheduleEnergyLookupMap[trimmed]
    if (direct) return direct
    const upper = trimmed.toUpperCase()
    const normalized = scheduleEnergyLookupMap[upper]
    if (normalized) return normalized
    return ENERGY_LABEL_SET.has(upper as (typeof ENERGY.LIST)[number])
      ? (upper as (typeof ENERGY.LIST)[number])
      : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const direct = scheduleEnergyLookupMap[String(value)]
    if (direct) return direct
    return resolveEnergyLevel(String(value))
  }
  if (
    value &&
    typeof value === 'object' &&
    'name' in (value as { name?: string | null })
  ) {
    const candidate = (value as { name?: string | null }).name ?? null
    return resolveEnergyLevel(candidate)
  }
  return null
}

function updateScheduleEnergyLookup(
  lookup?: Record<string, (typeof ENERGY.LIST)[number]> | null
) {
  scheduleEnergyLookupMap = { ...DEFAULT_ENERGY_ID_LOOKUP }
  if (!lookup) return
  for (const [key, value] of Object.entries(lookup)) {
    if (!key) continue
    const normalized = normalizeEnergyLabel(value)
    scheduleEnergyLookupMap[key] = normalized
    scheduleEnergyLookupMap[normalized] = normalized
  }
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
  const { user } = useAuth()
  const userId = user?.id ?? null
  const habitCompletionStorageKey = useMemo(
    () => (userId ? `${HABIT_COMPLETION_STORAGE_PREFIX}:${userId}` : null),
    [userId]
  )

  const initialViewParam = searchParams.get('view') as ScheduleView | null
  const initialView: ScheduleView =
    initialViewParam && ['day', 'focus'].includes(initialViewParam)
      ? initialViewParam
      : 'day'
  const initialDate = searchParams.get('date')

  const initialDateResult = useMemo(
    () => parseScheduleDateParam(initialDate),
    [initialDate]
  )
  const initialDateWasValid = initialDateResult.wasValid

  const [currentDate, setCurrentDate] = useState(
    () => initialDateResult.date
  )
  const [view, setView] = useState<ScheduleView>(initialView)
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [monuments, setMonuments] = useState<Monument[]>([])
  const [projectSkillIds, setProjectSkillIds] = useState<Record<string, string[]>>({})
  const [projectGoalRelations, setProjectGoalRelations] = useState<
    ScheduleEventDataset['projectGoalRelations']
  >({})
  const [habits, setHabits] = useState<HabitScheduleItem[]>([])
  const [habitCompletionByDate, setHabitCompletionByDate] = useState<
    Record<string, Record<string, HabitCompletionStatus>>
  >({})
  const [windowSnapshot, setWindowSnapshot] = useState<RepoWindow[]>([])
  const [windows, setWindows] = useState<RepoWindow[]>([])
  const [allInstances, setAllInstances] = useState<ScheduleInstance[]>([])
  const [instances, setInstances] = useState<ScheduleInstance[]>([])
  const instancesById = useMemo(() => {
    const map = new Map<string, ScheduleInstance>()
    for (const instance of instances) {
      if (instance?.id) {
        map.set(instance.id, instance)
      }
    }
    return map
  }, [instances])
  const [scheduledProjectIds, setScheduledProjectIds] = useState<Set<string>>(new Set())
  const [metaStatus, setMetaStatus] = useState<LoadStatus>('idle')
  const [instancesStatus, setInstancesStatus] = useState<LoadStatus>('idle')
  const [schedulerDebug, setSchedulerDebug] = useState<SchedulerDebugState | null>(null)
  const [pendingInstanceStatuses, setPendingInstanceStatuses] = useState<
    Map<string, ScheduleInstance['status']>
  >(new Map())
  const [pendingBacklogTaskIds, setPendingBacklogTaskIds] = useState<Set<string>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [hasInteractedWithProjects, setHasInteractedWithProjects] = useState(false)
  const [isScheduling, setIsScheduling] = useState(false)
  const [hasAutoRunToday, setHasAutoRunToday] = useState<boolean | null>(null)
  const [dayTransitionDirection, setDayTransitionDirection] =
    useState<DayTransitionDirection>(0)
  const [isSwipingDayView, setIsSwipingDayView] = useState(false)
  const [skipNextDayAnimation, setSkipNextDayAnimation] = useState(false)
  const [isJumpToDateOpen, setIsJumpToDateOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [focusInstanceId, setFocusInstanceId] = useState<string | null>(null)
  const [editInstanceId, setEditInstanceId] = useState<string | null>(null)
  const [editOrigin, setEditOrigin] = useState<ScheduleEditOrigin | null>(null)
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [topBarHeight, setTopBarHeight] = useState<number | null>(null)
  const sliderControls = useAnimationControls()
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  const activePressRef = useRef<{
    instanceId: string
    shortPress: (() => void) | null
  } | null>(null)
  const shortPressHandledRef = useRef(false)
  const [longPressBounceId, setLongPressBounceId] = useState<string | null>(null)
  const longPressBounceTimeoutRef = useRef<number | null>(null)
  const longPressOriginRef = useRef<HTMLElement | null>(null)
  const [peekModels, setPeekModels] = useState<{
    previous?: DayTimelineModel | null
    next?: DayTimelineModel | null
  }>({})
  const [modeType, setModeType] = useState<SchedulerModeType>('REGULAR')
  const [modeMonumentId, setModeMonumentId] = useState<string | null>(null)
  const [modeSkillIds, setModeSkillIds] = useState<string[]>([])
  const [isModeSheetOpen, setIsModeSheetOpen] = useState(false)
  const modeSelection = useMemo<SchedulerModeSelection>(() => {
    switch (modeType) {
      case 'MONUMENTAL':
        return { type: 'MONUMENTAL', monumentId: modeMonumentId }
      case 'SKILLED':
        return { type: 'SKILLED', skillIds: modeSkillIds }
      case 'RUSH':
        return { type: 'RUSH' }
      case 'REST':
        return { type: 'REST' }
      default:
        return { type: 'REGULAR' }
    }
  }, [modeType, modeMonumentId, modeSkillIds])
  const resolvedModePayload = useMemo(
    () => selectionToSchedulerModePayload(modeSelection),
    [modeSelection]
  )
  const modeIsActive = resolvedModePayload.type !== 'REGULAR'
  const modeLabel = useMemo(() => {
    switch (modeSelection.type) {
      case 'RUSH':
        return 'Rush mode'
      case 'REST':
        return 'Rest mode'
      case 'MONUMENTAL': {
        if (!modeSelection.monumentId) return 'Monumental mode'
        const monument = monuments.find(m => m.id === modeSelection.monumentId)
        if (!monument) return 'Monumental mode'
        const detail = monument.emoji ? `${monument.emoji} ${monument.title}` : monument.title
        return `Monumental – ${detail}`.trim()
      }
      case 'SKILLED': {
        if (modeSelection.skillIds.length === 0) return 'Skilled mode'
        const selected = skills.filter(skill => modeSelection.skillIds.includes(skill.id))
        if (selected.length === 0) return 'Skilled mode'
        if (selected.length === 1) {
          return `Skilled – ${selected[0].name}`
        }
        if (selected.length === 2) {
          return `Skilled – ${selected[0].name}, ${selected[1].name}`
        }
        return `Skilled – ${selected[0].name} +${selected.length - 1}`
      }
      default:
        return 'Regular mode'
    }
  }, [modeSelection, monuments, skills])
  const handleModeTypeChange = useCallback(
    (type: SchedulerModeType) => {
      setModeType(type)
      if (type === 'MONUMENTAL') {
        setModeMonumentId(prev => {
          if (prev && monuments.some(monument => monument.id === prev)) {
            return prev
          }
          return monuments[0]?.id ?? null
        })
      }
    },
    [monuments]
  )
  const handleMonumentChange = useCallback((id: string | null) => {
    setModeMonumentId(id)
  }, [])
  const handleSkillToggle = useCallback((skillId: string) => {
    setModeSkillIds(prev => {
      const next = new Set(prev)
      if (next.has(skillId)) {
        next.delete(skillId)
      } else {
        next.add(skillId)
      }
      return Array.from(next)
    })
  }, [])
  const handleClearSkills = useCallback(() => {
    setModeSkillIds([])
  }, [])

  const peekDataDepsRef = useRef<{
    projectMap: typeof projectMap
    taskMap: typeof taskMap
    tasksByProjectId: typeof tasksByProjectId
    habits: typeof habits
    unscheduledProjects: typeof unscheduledProjects
    schedulerFailureByProjectId: typeof schedulerFailureByProjectId
    schedulerDebug: typeof schedulerDebug
    schedulerTimelinePlacements: typeof schedulerTimelinePlacements
    timeZoneShortName: string
    friendlyTimeZone: string
    localTimeZone: string | null
  } | null>(null)

  const [peekState, setPeekState] = useState<PeekState>({
    direction: 0,
    offset: 0,
  })
  const backlogTaskPreviousStageRef = useRef<Map<string, TaskLite['stage']>>(new Map())
  const editingInstance = useMemo(() => {
    if (!editInstanceId) return null
    return instances.find(instance => instance.id === editInstanceId) ?? null
  }, [editInstanceId, instances])

  useEffect(() => {
    setPendingInstanceStatuses(prev => {
      if (prev.size === 0) return prev
      const activeIds = new Set(instances.map(instance => instance.id))
      let changed = false
      const next = new Map(prev)
      for (const key of prev.keys()) {
        if (!activeIds.has(key)) {
          next.delete(key)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [instances])
  const clearScheduleData = useCallback(() => {
    setWindowSnapshot([])
    setWindows([])
    setAllInstances([])
    setInstances([])
    setTasks([])
    setProjects([])
    setSkills([])
    setMonuments([])
    setProjectSkillIds({})
    setProjectGoalRelations({})
    setHabits([])
    setScheduledProjectIds(new Set())
    setPendingInstanceStatuses(new Map())
    setPendingBacklogTaskIds(new Set())
    backlogTaskPreviousStageRef.current = new Map()
    scheduleDatasetRef.current = null
  }, [])
  const [pxPerMin, setPxPerMin] = useState(() => snapPxPerMin(2))
  const animatedPxPerMin = useMotionValue(pxPerMin)
  const zoomAnimationRef = useRef<AnimationPlaybackControls | null>(null)
  const basePxPerMinRef = useRef(pxPerMin)
  const pinchStateRef = useRef<{
    initialDistance: number
    initialPxPerMin: number
    initialHeight: number
    anchorProgress: number
    initialScrollY: number
  } | null>(null)
  const pinchActiveRef = useRef(false)
  const stopZoomAnimation = useCallback(() => {
    zoomAnimationRef.current?.stop()
    zoomAnimationRef.current = null
  }, [])

  const animateZoomTo = useCallback(
    (target: number) => {
      const clamped = clampPxPerMin(target)
      if (prefersReducedMotion) {
        stopZoomAnimation()
        animatedPxPerMin.set(clamped)
        return
      }
      if (Math.abs(animatedPxPerMin.get() - clamped) < 0.0005) {
        return
      }
      stopZoomAnimation()
      zoomAnimationRef.current = animate(animatedPxPerMin, clamped, {
        type: 'spring',
        stiffness: 140,
        damping: 26,
        mass: 0.9,
      })
    },
    [animatedPxPerMin, prefersReducedMotion, stopZoomAnimation]
  )

  const commitPinchToSnap = useCallback(() => {
    const snapped = snapPxPerMin(animatedPxPerMin.get())
    setPxPerMin(prev => (Math.abs(prev - snapped) < 0.001 ? prev : snapped))
  }, [animatedPxPerMin])

  useEffect(() => {
    if (pinchActiveRef.current) return
    animateZoomTo(pxPerMin)
  }, [pxPerMin, animateZoomTo])

  useEffect(() => {
    return () => {
      stopZoomAnimation()
    }
  }, [stopZoomAnimation])

  useEffect(() => {
    basePxPerMinRef.current = pxPerMin
  }, [pxPerMin])
  const hasLoadedHabitCompletionState = useRef(false)
  const lastTimelineChromeHeightRef = useRef(0)
  const [memoNoteState, setMemoNoteState] = useState<MemoNoteDraftState | null>(null)
  const [memoNoteSaving, setMemoNoteSaving] = useState(false)
  const [memoNoteError, setMemoNoteError] = useState<string | null>(null)

  useEffect(() => {
    if (modeType !== 'MONUMENTAL') return
    if (monuments.length === 0) {
      if (modeMonumentId !== null) setModeMonumentId(null)
      return
    }
    const hasCurrent = modeMonumentId
      ? monuments.some(monument => monument.id === modeMonumentId)
      : false
    if (!hasCurrent) {
      setModeMonumentId(monuments[0]?.id ?? null)
    }
  }, [modeType, monuments, modeMonumentId])

  useEffect(() => {
    setModeSkillIds(prev => {
      if (prev.length === 0) return prev
      const valid = new Set(skills.map(skill => skill.id))
      const filtered = prev.filter(id => valid.has(id))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [skills])

  useEffect(() => {
    if (userId) return
    setModeType('REGULAR')
    setModeMonumentId(null)
    setModeSkillIds([])
  }, [userId])

  useEffect(() => {
    if (!habitCompletionStorageKey) {
      setHabitCompletionByDate({})
      hasLoadedHabitCompletionState.current = false
      return
    }
    if (typeof window === 'undefined') return

    try {
      const raw = window.localStorage.getItem(habitCompletionStorageKey)
      if (!raw) {
        setHabitCompletionByDate({})
        hasLoadedHabitCompletionState.current = true
        return
      }
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object') {
        setHabitCompletionByDate({})
        hasLoadedHabitCompletionState.current = true
        return
      }
      const next: Record<string, Record<string, HabitCompletionStatus>> = {}
      for (const [dateKey, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof dateKey !== 'string' || dateKey.length === 0) continue
        if (!value || typeof value !== 'object') continue
        const dayMap: Record<string, HabitCompletionStatus> = {}
        for (const [habitId, status] of Object.entries(value as Record<string, unknown>)) {
          if (typeof habitId !== 'string' || habitId.length === 0) continue
          if (status === 'completed') {
            dayMap[habitId] = 'completed'
          }
        }
        if (Object.keys(dayMap).length > 0) {
          next[dateKey] = dayMap
        }
      }
      setHabitCompletionByDate(next)
    } catch (error) {
      console.error('Failed to load habit completion state', error)
      setHabitCompletionByDate({})
    } finally {
      hasLoadedHabitCompletionState.current = true
    }
  }, [habitCompletionStorageKey])

  useEffect(() => {
    if (!habitCompletionStorageKey) return
    if (!hasLoadedHabitCompletionState.current) return
    if (typeof window === 'undefined') return
    try {
      if (Object.keys(habitCompletionByDate).length === 0) {
        window.localStorage.removeItem(habitCompletionStorageKey)
      } else {
        window.localStorage.setItem(
          habitCompletionStorageKey,
          JSON.stringify(habitCompletionByDate)
        )
      }
    } catch (error) {
      console.error('Failed to persist habit completion state', error)
    }
  }, [habitCompletionByDate, habitCompletionStorageKey])

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

  const { profile, loading: profileLoading } = useProfile()
  const profileTimeZone = useMemo(() => {
    const raw = profile?.timezone
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
    return null
  }, [profile?.timezone])

  useEffect(() => {
    if (!skipNextDayAnimation) return
    const id = requestAnimationFrame(() => {
      setSkipNextDayAnimation(false)
    })
    return () => cancelAnimationFrame(id)
  }, [skipNextDayAnimation])
  const [localTimeZone, setLocalTimeZone] = useState(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (resolved && resolved.trim()) {
        return resolved
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Unable to resolve local time zone', error)
      }
    }
    return 'UTC'
  })

  useEffect(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (
        !profileTimeZone &&
        resolved &&
        resolved.trim() &&
        resolved !== localTimeZone
      ) {
        setLocalTimeZone(resolved)
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Unable to resolve local time zone', error)
      }
    }
  }, [localTimeZone, profileTimeZone])

  useEffect(() => {
    if (!profileTimeZone) return
    if (profileTimeZone === localTimeZone) return
    setLocalTimeZone(profileTimeZone)
  }, [profileTimeZone, localTimeZone])

  useEffect(() => {
    if (initialDateWasValid) return
    setCurrentDate(new Date())
  }, [initialDateWasValid])
  const dayViewDateKey = useMemo(
    () => formatLocalDateKey(currentDate),
    [currentDate]
  )

  useEffect(() => {
    setMemoNoteState(null)
    setMemoNoteError(null)
    setMemoNoteSaving(false)
  }, [dayViewDateKey])
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
  const scheduleContentPaddingTop = useMemo(() => {
    if (topBarHeight !== null && Number.isFinite(topBarHeight)) {
      const clamped = Math.max(0, topBarHeight)
      return `calc(${clamped}px + 1rem)`
    }
    return 'calc(4rem + env(safe-area-inset-top, 0px))'
  }, [topBarHeight])
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
  const recordHabitCompletionRemote = useCallback(
    async (params: { habitId: string; completedAt: string; action: 'complete' | 'undo' }) => {
      if (!userId) return
      const completionDate = new Date(params.completedAt)
      const completedAtISO = Number.isNaN(completionDate.getTime())
        ? new Date().toISOString()
        : completionDate.toISOString()
      try {
        const response = await fetch('/api/habits/completion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            habitId: params.habitId,
            completedAt: completedAtISO,
            timeZone: localTimeZone ?? 'UTC',
            action: params.action,
          }),
        })
        if (!response.ok) {
          console.error('Failed to sync habit completion metadata', await response.text())
        }
      } catch (error) {
        console.error('Failed to sync habit completion metadata', error)
      }
    },
    [localTimeZone, userId]
  )
  const completionTimestampForDateKey = useCallback(
    (dateKey: string) => {
      const [yearStr, monthStr, dayStr] = dateKey.split('-')
      const year = Number(yearStr)
      const month = Number(monthStr)
      const day = Number(dayStr)
      if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day)
      ) {
        return new Date().toISOString()
      }
      try {
        const base = makeDateInTimeZone(
          { year, month, day, hour: 12, minute: 0 },
          localTimeZone ?? 'UTC'
        )
        return base.toISOString()
      } catch {
        return new Date().toISOString()
      }
    },
    [localTimeZone]
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
  const touchStartY = useRef<number | null>(null)
  const touchStartWidth = useRef<number>(0)
  const hasVerticalTouchMovement = useRef<boolean>(false)
  const swipeDeltaRef = useRef(0)
  const swipeScrollProgressRef = useRef<number | null>(null)
  const navLock = useRef(false)
  const loadInstancesRef = useRef<() => Promise<void>>(async () => {})
  const refreshScheduleData = useCallback(async () => {
    await loadInstancesRef.current()
  }, [])
  const scheduleDatasetRef = useRef<ScheduleEventDataset | null>(null)
  const PRIMARY_WRITE_WINDOW_DAYS = 7
  const FULL_WRITE_WINDOW_DAYS = 365
  const isSchedulingRef = useRef(false)

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

  const determineDensity = useCallback((viewportHeight?: number | null) => {
    const height =
      typeof viewportHeight === 'number' && Number.isFinite(viewportHeight)
        ? viewportHeight
        : null
    if (!height) return 2
    if (height <= 640) return 1.25
    if (height <= 780) return 1.4
    if (height <= 920) return 1.55
    return 2
  }, [])

  const applyDensity = useCallback(
    (next: number) => {
      setPxPerMin(prev => {
        const prevBase = basePxPerMinRef.current
        const prevZoom = prevBase > 0 ? prev / prevBase : 1
        basePxPerMinRef.current = next
        const nextValue = snapPxPerMin(next * prevZoom)
        return Math.abs(prev - nextValue) < 0.001 ? prev : nextValue
      })
    },
    [basePxPerMinRef]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const viewport = window.visualViewport

    const recompute = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const density = determineDensity(viewportHeight)
      applyDensity(density)
    }

    recompute()

    window.addEventListener('resize', recompute)
    window.addEventListener('orientationchange', recompute)
    viewport?.addEventListener('resize', recompute)

    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('orientationchange', recompute)
      viewport?.removeEventListener('resize', recompute)
    }
  }, [determineDensity, applyDensity])

  const startHour = 0
  const year = currentDate.getFullYear()

  const refreshScheduledProjectIds = useCallback(async () => {
    if (!userId) return
    const ids = await fetchScheduledProjectIds(userId)
    setScheduledProjectIds(new Set(ids))
  }, [userId])

  useEffect(() => {
    setSchedulerDebug(null)
    setHasAutoRunToday(null)
  }, [userId])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('view', view)
    if (!Number.isNaN(currentDate.getTime())) {
      params.set('date', formatLocalDateKey(currentDate))
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [view, currentDate, router, pathname])

  useEffect(() => {
    if (!userId) {
      clearScheduleData()
      setMetaStatus('idle')
      setInstancesStatus('idle')
      loadInstancesRef.current = async () => {}
      return
    }

    let active = true

    const applyDataset = (payload: ScheduleEventDataset) => {
      updateScheduleEnergyLookup(payload.energyLookup)
      setWindowSnapshot(payload.windowSnapshot)
      setTasks(payload.tasks)
      setPendingBacklogTaskIds(new Set())
      backlogTaskPreviousStageRef.current = new Map()
      setProjects(payload.projects)
      setSkills(payload.skills)
      setMonuments(payload.monuments)
      setProjectSkillIds(payload.projectSkillIds)
      setProjectGoalRelations(payload.projectGoalRelations)
      setHabits(payload.habits)
      setAllInstances(payload.instances ?? [])
      setScheduledProjectIds(new Set(payload.scheduledProjectIds))
    }

    const load = async () => {
      if (!active) return
      setMetaStatus('loading')
      setInstancesStatus('loading')
      try {
        const params = new URLSearchParams()
        params.set('lookaheadDays', String(FULL_WRITE_WINDOW_DAYS))
        if (localTimeZone) {
          params.set('timeZone', localTimeZone)
        }
        const response = await fetch(`/api/schedule/events?${params.toString()}`, {
          cache: 'no-store',
        })
        if (!active) return
        if (!response.ok) {
          throw new Error(`Failed to load schedule data (${response.status})`)
        }
        const payload = (await response.json()) as ScheduleEventDataset
        if (!active) return
        scheduleDatasetRef.current = payload
        applyDataset(payload)
      } catch (error) {
        if (!active) return
        console.error('Failed to load schedule dataset', error)
        scheduleDatasetRef.current = null
        clearScheduleData()
      } finally {
        if (!active) return
        setMetaStatus('loaded')
        setInstancesStatus('loaded')
      }
    }

    loadInstancesRef.current = load
    void load()

    return () => {
      active = false
    }
  }, [userId, localTimeZone, clearScheduleData, FULL_WRITE_WINDOW_DAYS])

  useEffect(() => {
    if (!userId) {
      setWindows([])
      return
    }
    if (windowSnapshot.length === 0) {
      setWindows([])
      return
    }
    const derived = windowsForDateFromSnapshot(
      windowSnapshot,
      currentDate,
      localTimeZone ?? 'UTC'
    )
    setWindows(derived)
  }, [windowSnapshot, currentDate, localTimeZone, userId])

  const filterInstancesForDate = useCallback(
    (date: Date) => {
      if (allInstances.length === 0) {
        return []
      }
      const timeZone = localTimeZone ?? 'UTC'
      const dayStart = startOfDayInTimeZone(date, timeZone)
      const nextDay = addDaysInTimeZone(dayStart, 1, timeZone)
      const startMs = dayStart.getTime()
      const endMs = nextDay.getTime()
      return allInstances.filter(instance => {
        const start = new Date(instance.start_utc ?? '').getTime()
        const end = new Date(instance.end_utc ?? '').getTime()
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          return false
        }
        return end > startMs && start < endMs
      })
    },
    [allInstances, localTimeZone]
  )

  useEffect(() => {
    if (!userId) {
      setInstances([])
      return
    }
    const nextInstances = filterInstancesForDate(currentDate)
    setInstances(nextInstances)
  }, [filterInstancesForDate, currentDate, userId])

  useEffect(() => {
    setHabitCompletionByDate(prev =>
      mergeHabitCompletionStateFromInstances(prev, instances)
    )
  }, [instances])
  const projectItems = useMemo(
    () => buildProjectItems(projects, tasks),
    [projects, tasks]
  )

  const taskMap = useMemo(() => {
    const map: Record<string, TaskLite> = {}
    for (const t of tasks) map[t.id] = t
    return map
  }, [tasks])

  const skillMonumentMap = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const skill of skills) {
      map[skill.id] = skill.monument_id ?? null
    }
    return map
  }, [skills])

  const practiceContextDisplayById = useMemo(() => {
    const map = new Map<string, string>()
    for (const monument of monuments) {
      if (!monument?.id) continue
      const title = monument.title ?? 'Practice context'
      const display = monument.emoji ? `${monument.emoji} ${title}` : title
      map.set(monument.id, display)
    }
    return map
  }, [monuments])

  useEffect(() => {
    const snapshots = backlogTaskPreviousStageRef.current
    for (const [taskId] of snapshots) {
      const task = taskMap[taskId]
      if (!task || task.stage !== 'PERFECT') {
        snapshots.delete(taskId)
      }
    }
  }, [taskMap])

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

  const habitMap = useMemo(() => {
    const map: Record<string, HabitScheduleItem> = {}
    for (const habit of habits) map[habit.id] = habit
    return map
  }, [habits])

  const editingEventTitle = useMemo(() => {
    if (!editingInstance) return 'Scheduled event'
    const sourceId = editingInstance.source_id ?? ''
    if (editingInstance.source_type === 'TASK') {
      const task = taskMap[sourceId]
      if (task?.name?.trim()) {
        return task.name
      }
      const parent =
        task?.project_id && projectMap[task.project_id]
          ? projectMap[task.project_id]
          : null
      if (parent?.name?.trim()) {
        return parent.name
      }
    } else if (editingInstance.source_type === 'PROJECT') {
      const project = projectMap[sourceId]
      if (project?.name?.trim()) {
        return project.name
      }
    } else if (editingInstance.source_type === 'HABIT') {
      const habit = habitMap[sourceId]
      if (habit?.name?.trim()) {
        return habit.name
      }
    }
    return sourceId || 'Scheduled event'
  }, [editingInstance, taskMap, projectMap, habitMap])

  const editingEventTypeLabel = useMemo(() => {
    if (!editingInstance) return 'Event'
    switch (editingInstance.source_type) {
      case 'PROJECT':
        return 'Project'
      case 'TASK':
        return 'Task'
      case 'HABIT':
        return 'Habit'
      default:
        return 'Event'
    }
  }, [editingInstance])

  const editingTimeRangeLabel = useMemo(() => {
    if (!editingInstance) return null
    const startDate = toLocal(editingInstance.start_utc)
    const endDate = toLocal(editingInstance.end_utc)
    if (
      !(startDate instanceof Date) ||
      Number.isNaN(startDate.getTime()) ||
      !(endDate instanceof Date) ||
      Number.isNaN(endDate.getTime())
    ) {
      return null
    }
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
    const startLabel = formatter.format(startDate)
    const endLabel = formatter.format(endDate)
    const zoneLabel = friendlyTimeZone ? ` • ${friendlyTimeZone}` : ''
    return `${startLabel} – ${endLabel}${zoneLabel}`
  }, [editingInstance, friendlyTimeZone])

  const editingProjectId = useMemo(() => {
    if (!editingInstance) return null
    if (editingInstance.source_type !== 'PROJECT') return null
    const sourceId = editingInstance.source_id ?? ''
    return sourceId && sourceId.length > 0 ? sourceId : null
  }, [editingInstance])

  const editingHabitId = useMemo(() => {
    if (!editingInstance) return null
    if (editingInstance.source_type !== 'HABIT') return null
    const sourceId = editingInstance.source_id ?? ''
    return sourceId && sourceId.length > 0 ? sourceId : null
  }, [editingInstance])

  const editingLayoutId = useMemo(
    () => (editInstanceId ? getScheduleInstanceLayoutId(editInstanceId) : undefined),
    [editInstanceId]
  )

  const windowMap = useMemo(() => buildWindowMap(windows), [windows])

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
      if (entry.type === 'PROJECT') {
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
          type: 'PROJECT',
          projectId: entry.projectId,
          projectName: project?.name || 'Untitled project',
          locked: entry.locked ?? false,
          start,
          end,
          durationMinutes: durationMin,
          energyLabel,
          decision: entry.decision,
        })
      } else if (entry.type === 'HABIT') {
        const habit = habitMap[entry.habitId]
        const habitName = entry.habitName?.trim() || habit?.name || 'Habit'
        const durationSource =
          typeof entry.durationMin === 'number' && Number.isFinite(entry.durationMin)
            ? entry.durationMin
            : typeof habit?.durationMinutes === 'number' && Number.isFinite(habit.durationMinutes)
              ? habit.durationMinutes
              : DEFAULT_HABIT_DURATION_MIN
        const energySource =
          typeof entry.energyResolved === 'string' && entry.energyResolved.trim().length > 0
            ? entry.energyResolved
            : habit?.window?.energy ?? null
        const energyLabel = normalizeEnergyLabel(energySource)
        const habitTypeValue = (habit?.habitType ?? 'HABIT').toUpperCase()
        const normalizedHabitType = habitTypeValue === 'ASYNC' ? 'SYNC' : habitTypeValue
        let placementPracticeContextId = entry.practiceContextId ?? null
        if (normalizedHabitType === 'PRACTICE' && habit?.skillMonumentId) {
          placementPracticeContextId = habit.skillMonumentId
        }

        placements.push({
          type: 'HABIT',
          habitId: entry.habitId,
          habitName,
          start,
          end,
          durationMinutes: durationSource,
          energyLabel,
          decision: entry.decision,
          clipped: entry.clipped ?? false,
          practiceContextId: placementPracticeContextId,
        })
      }
    }

    return placements
  }, [schedulerDebug, projectMap, habitMap])

  useEffect(() => {
    if (!userId || view !== 'day') {
      setPeekModels({})
      peekDataDepsRef.current = null
      return
    }

    const previousDeps = peekDataDepsRef.current
    const shouldForceReload = Boolean(
      previousDeps &&
        (
          previousDeps.projectMap !== projectMap ||
          previousDeps.taskMap !== taskMap ||
          previousDeps.tasksByProjectId !== tasksByProjectId ||
          previousDeps.habits !== habits ||
          previousDeps.unscheduledProjects !== unscheduledProjects ||
          previousDeps.schedulerFailureByProjectId !== schedulerFailureByProjectId ||
          previousDeps.schedulerDebug !== schedulerDebug ||
      previousDeps.schedulerTimelinePlacements !== schedulerTimelinePlacements ||
      previousDeps.timeZoneShortName !== timeZoneShortName ||
      previousDeps.friendlyTimeZone !== friendlyTimeZone ||
      previousDeps.localTimeZone !== localTimeZone
    )
)

peekDataDepsRef.current = {
  projectMap,
      taskMap,
      tasksByProjectId,
      habits,
      unscheduledProjects,
      schedulerFailureByProjectId,
      schedulerDebug,
  schedulerTimelinePlacements,
  timeZoneShortName,
  friendlyTimeZone,
  localTimeZone,
}

    let cancelled = false

    async function load(direction: 'previous' | 'next', date: Date, forceReload: boolean) {
      const targetKey = formatLocalDateKey(date)
      let shouldFetch = true
      setPeekModels(prev => {
        const prevModel = prev[direction]
        if (!forceReload && prevModel && prevModel.dayViewDateKey === targetKey) {
          shouldFetch = false
          return prev
        }
        shouldFetch = true
        return { ...prev, [direction]: null }
      })
      if (!shouldFetch) return

      try {
        const dayWindows =
          windowSnapshot.length > 0
            ? windowsForDateFromSnapshot(windowSnapshot, date, localTimeZone ?? 'UTC')
            : []
        const instancesForDay = filterInstancesForDate(date)
        if (cancelled) {
          return
        }
        const model = buildDayTimelineModel({
          date,
          windows: dayWindows,
          instances: instancesForDay,
          projectMap,
          taskMap,
          tasksByProjectId,
          habits,
          startHour,
          pxPerMin,
          unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    windowSnapshot,
    filterInstancesForDate,
    timeZoneShortName,
    friendlyTimeZone,
    localTimeZone,
        })
        if (cancelled) return
        if (model.dayViewDateKey !== targetKey) return
        setPeekModels(prev => ({ ...prev, [direction]: model }))
      } catch (error) {
        console.error('Failed to load adjacent day preview', error)
        if (cancelled) return
        setPeekModels(prev => ({ ...prev, [direction]: null }))
      }
    }

    void load('previous', previousDayDate, shouldForceReload)
    void load('next', nextDayDate, shouldForceReload)

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
    habits,
    unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    windowSnapshot,
    filterInstancesForDate,
    timeZoneShortName,
    friendlyTimeZone,
    pxPerMin,
  ])

  useEffect(() => {
    if (!userId || view !== 'day') return

    setPeekModels(prev => {
      let changed = false
      const nextState: typeof prev = { ...prev }
      for (const direction of ['previous', 'next'] as const) {
        const entry = prev[direction]
        if (!entry) continue
        const windowReports = computeWindowReportsForDay({
          windows: entry.windows,
          projectInstances: entry.projectInstances,
          startHour,
          unscheduledProjects,
          schedulerFailureByProjectId,
          schedulerDebug,
          schedulerTimelinePlacements,
          habitPlacements: entry.habitPlacements,
          currentDate: entry.date,
        })
        nextState[direction] = {
          ...entry,
          startHour,
          windowReports,
        }
        changed = true
      }
      return changed ? nextState : prev
    })
  }, [
    pxPerMin,
    startHour,
    unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    userId,
    view,
  ])

  const instanceStatusById = useMemo(() => {
    const map: Record<string, ScheduleInstance['status'] | null> = {}
    for (const inst of instances) {
      map[inst.id] = inst.status ?? null
    }
    return map
  }, [instances])

  const buildXpAwardPayload = useCallback(
    (instance: ScheduleInstance) => {
      const collectSkillIds = (ids: (string | null | undefined)[]) =>
        Array.from(
          new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))
        )

      if (instance.source_type === 'TASK') {
        const task = taskMap[instance.source_id]
        if (!task) return null
        const uniqueSkillIds = collectSkillIds([task.skill_id])
        const monumentIds = uniqueSkillIds
          .map(id => skillMonumentMap[id])
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
        return {
          kind: 'task' as const,
          amount: 1,
          skillIds: uniqueSkillIds,
          monumentIds,
        }
      }

      if (instance.source_type === 'PROJECT') {
        const linkedSkillIds = projectSkillIds[instance.source_id] ?? []
        const taskDerivedSkillIds = (tasksByProjectId[instance.source_id] ?? []).map(
          task => task.skill_id
        )
        const uniqueSkillIds = collectSkillIds([...linkedSkillIds, ...taskDerivedSkillIds])
        const monumentIds = uniqueSkillIds
          .map(id => skillMonumentMap[id])
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
        return {
          kind: 'project' as const,
          amount: 3,
          skillIds: uniqueSkillIds,
          monumentIds,
        }
      }

      if (instance.source_type === 'HABIT') {
        const habit = habitMap[instance.source_id]
        const skillId = habit?.skillId ?? null
        if (!skillId) return null
        const monumentId = skillMonumentMap[skillId]
        const monumentIds = monumentId && monumentId.length > 0 ? [monumentId] : []
        return {
          kind: 'habit' as const,
          amount: 1,
          skillIds: [skillId],
          monumentIds,
        }
      }

      return null
    },
    [habitMap, projectSkillIds, skillMonumentMap, taskMap, tasksByProjectId]
  )

  const computeTrimmedHabitTiming = useCallback((instance: ScheduleInstance | undefined) => {
    if (!instance) return null
    if (instance.source_type !== 'HABIT') return null
    const start = instance.start_utc ? new Date(instance.start_utc) : null
    const end = instance.end_utc ? new Date(instance.end_utc) : null
    if (!start || !end) return null
    const startMs = start.getTime()
    const endMs = end.getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
    const nowMs = Date.now()
    if (nowMs <= startMs || nowMs >= endMs) return null
    const trimmedDurationMin = Math.max(1, Math.round((nowMs - startMs) / 60000))
    const completionIso = new Date(nowMs).toISOString()
    return {
      completionIso,
      endUTC: completionIso,
      durationMin: trimmedDurationMin,
    }
  }, [])

  const handleToggleInstanceCompletion = useCallback(
    async (instanceId: string, nextStatus: 'completed' | 'scheduled') => {
      if (!userId) {
        console.warn('No authenticated user available for status update')
        return
      }

      setPendingInstanceStatuses(prev => {
        const next = new Map(prev)
        next.set(instanceId, nextStatus)
        return next
      })

      try {
        const instance = instancesById.get(instanceId)
        const trimResult =
          nextStatus === 'completed' ? computeTrimmedHabitTiming(instance) : null
        const completionIso =
          nextStatus === 'completed'
            ? trimResult?.completionIso ?? new Date().toISOString()
            : undefined

        const { error } = await updateInstanceStatus(
          instanceId,
          nextStatus,
          nextStatus === 'completed'
            ? {
                completedAtUTC: completionIso,
                updates: trimResult
                  ? {
                      endUTC: trimResult.endUTC,
                      durationMin: trimResult.durationMin,
                    }
                  : undefined,
              }
            : undefined
        )
        if (error) {
          console.error(error)
          return
        }

        const previousStatus = instance?.status ?? null
        const isUndo = nextStatus === 'scheduled' && previousStatus === 'completed'
        const shouldAwardXp = nextStatus === 'completed' || isUndo

        if (shouldAwardXp && instance) {
          const payload = buildXpAwardPayload(instance)
          if (payload) {
            const baseAwardKey = `sched:${instance.id}:${payload.kind}`
            const body: Record<string, unknown> = {
              scheduleInstanceId: instance.id,
              kind: payload.kind,
              amount: isUndo ? -payload.amount : payload.amount,
              awardKeyBase: isUndo ? `${baseAwardKey}:undo` : baseAwardKey,
            }
            if (payload.skillIds.length > 0) {
              body.skillIds = payload.skillIds
            }
            if (payload.monumentIds.length > 0) {
              body.monumentIds = payload.monumentIds
            }
            try {
              const response = await fetch('/api/xp/award', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              })
              if (!response.ok) {
                console.error('Failed to award XP for schedule completion', await response.text())
              }
            } catch (awardError) {
              console.error('Failed to award XP for schedule completion', awardError)
            }
          }
        }

        if (instance?.source_type === 'HABIT' && instance.source_id) {
          const completionTimestamp =
            (nextStatus === 'completed'
              ? trimResult?.endUTC ?? completionIso
              : null) ??
            instance.end_utc ??
            instance.start_utc ??
            new Date().toISOString()
          const action = nextStatus === 'completed' ? 'complete' : 'undo'
          void recordHabitCompletionRemote({
            habitId: instance.source_id,
            completedAt: completionTimestamp,
            action,
          })
        }

        setInstances(prev =>
          prev.map(inst =>
            inst.id === instanceId
              ? {
                  ...inst,
                  status: nextStatus,
                  completed_at:
                    nextStatus === 'completed'
                      ? completionIso ?? new Date().toISOString()
                      : null,
                  end_utc:
                    nextStatus === 'completed' && trimResult?.endUTC
                      ? trimResult.endUTC
                      : inst.end_utc,
                  duration_min:
                    nextStatus === 'completed' && typeof trimResult?.durationMin === 'number'
                      ? trimResult.durationMin
                      : inst.duration_min,
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
    [
      userId,
      setInstances,
      instancesById,
      buildXpAwardPayload,
      recordHabitCompletionRemote,
      computeTrimmedHabitTiming,
    ]
  )

  const getHabitCompletionStatus = useCallback(
    (dateKey: string, habitId: string): HabitCompletionStatus => {
      const dayMap = habitCompletionByDate[dateKey]
      if (!dayMap) return 'scheduled'
      return dayMap[habitId] ?? 'scheduled'
    },
    [habitCompletionByDate]
  )

  const updateHabitCompletionStatus = useCallback(
    (dateKey: string, habitId: string, status: HabitCompletionStatus | null) => {
      setHabitCompletionByDate(prev => {
        const prevDay = prev[dateKey]
        if (status === null || status === 'scheduled') {
          if (!prevDay || !(habitId in prevDay)) {
            return prev
          }
          const next = { ...prev }
          const nextDay = { ...prevDay }
          delete nextDay[habitId]
          if (Object.keys(nextDay).length === 0) {
            delete next[dateKey]
          } else {
            next[dateKey] = nextDay
          }
          return next
        }
        if (prevDay?.[habitId] === status) {
          return prev
        }
        const next = { ...prev }
        const nextDay = { ...(prevDay ?? {}) }
        nextDay[habitId] = status
        next[dateKey] = nextDay
        return next
      })
    },
    []
  )

  const toggleHabitCompletionStatus = useCallback(
    (dateKey: string, habitId: string): HabitCompletionStatus => {
      const current = getHabitCompletionStatus(dateKey, habitId)
      const nextStatus: HabitCompletionStatus =
        current === 'completed' ? 'scheduled' : 'completed'
      updateHabitCompletionStatus(dateKey, habitId, nextStatus)
      return nextStatus
    },
    [getHabitCompletionStatus, updateHabitCompletionStatus]
  )

  const handleHabitCardActivation = useCallback(
    (placement: HabitTimelinePlacement, dateKey: string) => {
      if (placement.habitType === 'MEMO') {
        setMemoNoteError(null)
        setMemoNoteState({
          habitId: placement.habitId,
          habitName: placement.habitName,
          skillId: placement.skillId,
          dateKey,
        })
        return
      }
      const nextStatus = toggleHabitCompletionStatus(dateKey, placement.habitId)
      const instanceId = placement.instanceId
      if (instanceId) {
        const targetStatus: 'completed' | 'scheduled' =
          nextStatus === 'completed' ? 'completed' : 'scheduled'
        void handleToggleInstanceCompletion(instanceId, targetStatus)
      } else {
        const completionTimestamp =
          isValidDate(placement.end) && typeof placement.end.toISOString === 'function'
            ? placement.end.toISOString()
            : completionTimestampForDateKey(dateKey)
        const action = nextStatus === 'completed' ? 'complete' : 'undo'
        void recordHabitCompletionRemote({
          habitId: placement.habitId,
          completedAt: completionTimestamp,
          action,
        })
      }
    },
    [
      toggleHabitCompletionStatus,
      handleToggleInstanceCompletion,
      completionTimestampForDateKey,
      recordHabitCompletionRemote,
    ]
  )

  const handleCloseEditSheet = useCallback(() => {
    setIsEditSheetOpen(false)
    setEditInstanceId(null)
    setEditOrigin(null)
  }, [])

  useEffect(() => {
    if (!memoNoteState) {
      setMemoNoteError(null)
    }
  }, [memoNoteState])

  const handleCloseMemoSheet = useCallback(() => {
    if (memoNoteSaving) return
    setMemoNoteState(null)
  }, [memoNoteSaving])

  const handleMemoSave = useCallback(
    async (content: string) => {
      if (!memoNoteState) return
      const skillId = memoNoteState.skillId
      if (!skillId) {
        setMemoNoteError('Assign a skill to this memo habit to save notes.')
        return
      }

      const trimmedContent = content.trim()
      if (!trimmedContent) {
        setMemoNoteError('Write a note before saving this memo.')
        return
      }

      setMemoNoteSaving(true)
      setMemoNoteError(null)
      try {
        const note = await createMemoNoteForHabit(
          skillId,
          memoNoteState.habitId,
          memoNoteState.habitName,
          trimmedContent
        )
        if (!note) {
          setMemoNoteError('Unable to save your memo right now. Please try again.')
          return
        }

        updateHabitCompletionStatus(
          memoNoteState.dateKey,
          memoNoteState.habitId,
          'completed'
        )
        const completionIso = completionTimestampForDateKey(memoNoteState.dateKey)
        void recordHabitCompletionRemote({
          habitId: memoNoteState.habitId,
          completedAt: completionIso,
          action: 'complete',
        })
        setMemoNoteState(null)
      } catch (error) {
        console.error('Failed to save memo note', error)
        setMemoNoteError('Something went wrong while saving this memo. Please try again.')
      } finally {
        setMemoNoteSaving(false)
      }
    },
    [memoNoteState, updateHabitCompletionStatus, completionTimestampForDateKey, recordHabitCompletionRemote]
  )

  const handleToggleBacklogTaskCompletion = useCallback(
    async (taskId: string) => {
      const task = taskMap[taskId]
      if (!task) return
      if (pendingBacklogTaskIds.has(taskId)) return

      const currentStage = task.stage
      const isCurrentlyCompleted = currentStage === 'PERFECT'
      const snapshots = backlogTaskPreviousStageRef.current

      let nextStage: TaskLite['stage']
      if (isCurrentlyCompleted) {
        nextStage = snapshots.get(taskId) ?? 'PRODUCE'
      } else {
        snapshots.set(taskId, currentStage)
        nextStage = 'PERFECT'
      }

      if (nextStage === currentStage) {
        if (!isCurrentlyCompleted) {
          snapshots.delete(taskId)
        }
        return
      }

      setPendingBacklogTaskIds(prev => {
        const next = new Set(prev)
        next.add(taskId)
        return next
      })

      setTasks(prev =>
        prev.map(t => (t.id === taskId ? { ...t, stage: nextStage } : t))
      )

      try {
        const { error } = await updateTaskStage(taskId, nextStage)
        if (error) {
          throw error
        }

        if (isCurrentlyCompleted) {
          snapshots.delete(taskId)
        }

        const shouldAwardXp = isCurrentlyCompleted || nextStage === 'PERFECT'
        if (shouldAwardXp && userId) {
          const isUndo = isCurrentlyCompleted
          const skillIdsRaw = task.skill_id ? [task.skill_id] : []
          const uniqueSkillIds = Array.from(
            new Set(
              skillIdsRaw.filter(
                (id): id is string => typeof id === 'string' && id.length > 0
              )
            )
          )
          const monumentIds = uniqueSkillIds
            .map(id => skillMonumentMap[id])
            .filter((id): id is string => typeof id === 'string' && id.length > 0)

          const baseAwardKey = `backlog:${taskId}:task`
          const body: Record<string, unknown> = {
            kind: 'task',
            amount: isUndo ? -1 : 1,
            awardKeyBase: isUndo ? `${baseAwardKey}:undo` : baseAwardKey,
          }
          if (uniqueSkillIds.length > 0) {
            body.skillIds = uniqueSkillIds
          }
          if (monumentIds.length > 0) {
            body.monumentIds = monumentIds
          }

          try {
            const response = await fetch('/api/xp/award', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            if (!response.ok) {
              console.error(
                'Failed to award XP for backlog task completion',
                await response.text()
              )
            }
          } catch (awardError) {
            console.error('Failed to award XP for backlog task completion', awardError)
          }
        }
      } catch (error) {
        console.error('Failed to toggle backlog task completion', error)
        setTasks(prev =>
          prev.map(t => (t.id === taskId ? { ...t, stage: currentStage } : t))
        )
        if (!isCurrentlyCompleted) {
          snapshots.delete(taskId)
        }
      } finally {
        setPendingBacklogTaskIds(prev => {
          const next = new Set(prev)
          next.delete(taskId)
          return next
        })
      }
    },
    [
      taskMap,
      pendingBacklogTaskIds,
      setTasks,
      skillMonumentMap,
      userId,
    ]
  )
  function navigate(next: ScheduleView) {
    if (navLock.current) return
    navLock.current = true
    setView(next)
    setTimeout(() => {
      navLock.current = false
    }, 300)
  }

  function handleBack() {
    router.push('/dashboard')
  }

  const handleToday = () => {
    updateCurrentDate(new Date())
    navigate('day')
  }

  const runScheduler = useCallback(
    async (
      args?: {
        writeThroughDays?: number | null
        background?: boolean
      }
    ) => {
      const background = args?.background ?? false
      if (!userId) {
        if (!background) {
          console.warn('No authenticated user available for scheduler run')
        }
        return
      }

      const localNow = new Date()
      const utcOffsetMinutes = -localNow.getTimezoneOffset()
      const timeZone: string | null = profileTimeZone ?? null

      if (!background) {
        if (isSchedulingRef.current) return
        isSchedulingRef.current = true
        setIsScheduling(true)
      }

      try {
        const response = await fetch('/api/scheduler/run', {
          method: 'POST',
          cache: 'no-store',
          keepalive: background,
          headers: {
            'Content-Type': 'application/json',
          },
        body: JSON.stringify({
          localTimeIso: localNow.toISOString(),
          timeZone,
          utcOffsetMinutes,
          mode: resolvedModePayload,
          writeThroughDays: args?.writeThroughDays ?? null,
        }),
        })

        if (background) {
          if (!response.ok) {
            console.error('Background scheduler run failed', response.status)
          }
          return
        }

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
        if (!background) {
          console.error('Failed to run scheduler', error)
          setSchedulerDebug({
            runAt: new Date().toISOString(),
            failures: [],
            placedCount: 0,
            placedProjectIds: [],
            timeline: [],
            error,
          })
        } else {
          console.error('Background scheduler run failed', error)
        }
      } finally {
        if (!background) {
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
      }
    },
    [
      userId,
      refreshScheduledProjectIds,
      profileTimeZone,
      resolvedModePayload,
      loadInstancesRef,
    ]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const globalWithScheduler = window as typeof window & {
      __runScheduler?: (options?: { writeThroughDays?: number | null }) => Promise<void>
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
    } else if (hasAutoRunToday !== false) {
      setHasAutoRunToday(false)
    }
  }, [
    userId,
    metaStatus,
    instancesStatus,
    readLastAutoRunDate,
    hasAutoRunToday,
  ])

  const handleRescheduleClick = useCallback(async () => {
    if (!userId) return
    const todayKey = formatLocalDateKey(new Date())
    await runScheduler({ writeThroughDays: PRIMARY_WRITE_WINDOW_DAYS })
    if (PRIMARY_WRITE_WINDOW_DAYS < FULL_WRITE_WINDOW_DAYS) {
      void runScheduler({
        writeThroughDays: FULL_WRITE_WINDOW_DAYS,
        background: true,
      }).then(async () => {
        try {
          await loadInstancesRef.current()
        } catch (error) {
          console.error(
            'Failed to reload schedule data after background scheduler run',
            error,
          )
        }
        try {
          await refreshScheduledProjectIds()
        } catch (error) {
          console.error(
            'Failed to refresh scheduled project history after background scheduler run',
            error,
          )
        }
      })
    }
    persistAutoRunDate(todayKey)
    setHasAutoRunToday(true)
  }, [
    userId,
    runScheduler,
    persistAutoRunDate,
    refreshScheduledProjectIds,
    loadInstancesRef,
  ])

  const dayTimelineContainerRef = useRef<HTMLDivElement | null>(null)
  const swipeContainerRef = useRef<HTMLDivElement | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    swipeScrollProgressRef.current = null

    const touches = e.touches
    if (view === 'day' && touches.length >= 2) {
      const container = dayTimelineContainerRef.current
      if (container) {
        const firstTouch = touches[0]
        const secondTouch = touches[1]
        if (
          firstTouch &&
          secondTouch &&
          isTouchWithinElement(firstTouch, container) &&
          isTouchWithinElement(secondTouch, container)
        ) {
          const distance = getTouchDistance(firstTouch, secondTouch)
          if (distance > 0) {
            const height = container.offsetHeight
            if (height > 0 && typeof window !== 'undefined') {
              const scrollY = window.scrollY ?? window.pageYOffset ?? 0
              const rect = container.getBoundingClientRect()
              const containerTop = rect.top + scrollY
              const centerClientY = (firstTouch.clientY + secondTouch.clientY) / 2
              const anchorPageY = centerClientY + scrollY
              const anchorOffset = anchorPageY - containerTop
              const progressRaw = anchorOffset / height
              const anchorProgress = Number.isFinite(progressRaw)
                ? Math.min(Math.max(progressRaw, 0), 1)
                : 0.5
              stopZoomAnimation()
              const currentZoom = clampPxPerMin(animatedPxPerMin.get())
              animatedPxPerMin.set(currentZoom)
              pinchStateRef.current = {
                initialDistance: distance,
                initialPxPerMin: currentZoom,
                initialHeight: height,
                anchorProgress,
                initialScrollY: scrollY,
              }
              pinchActiveRef.current = true
              touchStartX.current = null
              touchStartY.current = null
              touchStartWidth.current = 0
              hasVerticalTouchMovement.current = false
              swipeDeltaRef.current = 0
              sliderControls.stop()
              setIsSwipingDayView(false)
              setPeekState(prev => {
                if (prev.direction === 0 && prev.offset === 0) {
                  return prev
                }
                return { direction: 0, offset: 0 }
              })
            }
            return
          }
        }
      }
    }

    if (touches.length > 1) {
      touchStartX.current = null
      touchStartY.current = null
      hasVerticalTouchMovement.current = false
      return
    }

    if (view !== 'day' || prefersReducedMotion || pinchActiveRef.current) {
      touchStartX.current = null
      touchStartY.current = null
      hasVerticalTouchMovement.current = false
      return
    }

    const firstTouch = touches[0]
    if (!firstTouch) {
      touchStartX.current = null
      touchStartY.current = null
      hasVerticalTouchMovement.current = false
      return
    }

    touchStartX.current = firstTouch.clientX
    touchStartY.current = firstTouch.clientY
    touchStartWidth.current = swipeContainerRef.current?.offsetWidth ?? 0
    hasVerticalTouchMovement.current = false
    swipeDeltaRef.current = 0
    sliderControls.stop()
    if (typeof window !== 'undefined') {
      const container = dayTimelineContainerRef.current
      const viewportHeightRaw =
        window.visualViewport?.height ?? window.innerHeight ?? 0
      const viewportHeight = Number.isFinite(viewportHeightRaw)
        ? viewportHeightRaw
        : 0
      if (container) {
        const height = container.offsetHeight
        if (height > 0) {
          const scrollY = window.scrollY ?? window.pageYOffset ?? 0
          const rect = container.getBoundingClientRect()
          const containerTop = rect.top + scrollY
          const anchorOffset = viewportHeight > 0 ? viewportHeight / 2 : 0
          const anchorPosition = scrollY + anchorOffset
          const relative = anchorPosition - containerTop
          const clamped = Math.min(Math.max(relative, 0), height)
          swipeScrollProgressRef.current = clamped / height
        }
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (pinchActiveRef.current) {
      const pinchState = pinchStateRef.current
      if (!pinchState) {
        pinchActiveRef.current = false
        return
      }
      if (e.touches.length < 2) {
        commitPinchToSnap()
        pinchStateRef.current = null
        pinchActiveRef.current = false
        return
      }
      const firstTouch = e.touches[0]
      const secondTouch = e.touches[1]
      if (!firstTouch || !secondTouch) return
      const distance = getTouchDistance(firstTouch, secondTouch)
      if (!(distance > 0) || !(pinchState.initialDistance > 0)) return
      e.preventDefault()
      const scale = distance / pinchState.initialDistance
      const target = clampPxPerMin(pinchState.initialPxPerMin * scale)
      animatedPxPerMin.set(target)
      if (typeof window !== 'undefined') {
        const base = pinchState.initialPxPerMin
        const baseHeight = pinchState.initialHeight
        if (base > 0 && baseHeight > 0) {
          const heightScale = target / base
          if (Number.isFinite(heightScale)) {
            const newHeight = baseHeight * heightScale
            const deltaHeight = newHeight - baseHeight
            let targetScroll =
              pinchState.initialScrollY + deltaHeight * pinchState.anchorProgress
            const viewportHeightRaw =
              window.visualViewport?.height ?? window.innerHeight ?? 0
            const viewportHeight = Number.isFinite(viewportHeightRaw)
              ? viewportHeightRaw
              : 0
            const doc = typeof document !== 'undefined' ? document.documentElement : null
            if (doc && Number.isFinite(viewportHeight)) {
              const maxScroll = doc.scrollHeight - viewportHeight
              if (Number.isFinite(maxScroll)) {
                targetScroll = Math.min(
                  Math.max(targetScroll, 0),
                  Math.max(0, maxScroll)
                )
              } else {
                targetScroll = Math.max(targetScroll, 0)
              }
            } else {
              targetScroll = Math.max(targetScroll, 0)
            }
            window.scrollTo({ top: targetScroll, behavior: 'auto' })
          }
        }
      }
      return
    }

    if (e.touches.length > 1) return
    if (view !== 'day' || prefersReducedMotion) return
    const touch = e.touches[0]
    if (!touch) return

    if (touchStartY.current === null) {
      touchStartY.current = touch.clientY
    }

    if (!hasVerticalTouchMovement.current && touchStartY.current !== null) {
      const verticalDiff = Math.abs(touch.clientY - touchStartY.current)
      if (verticalDiff > VERTICAL_SCROLL_THRESHOLD_PX) {
        const horizontalDiff =
          touchStartX.current !== null
            ? Math.abs(touch.clientX - touchStartX.current)
            : 0
        if (
          verticalDiff > horizontalDiff * VERTICAL_SCROLL_SLOPE +
            VERTICAL_SCROLL_BIAS_PX
        ) {
          hasVerticalTouchMovement.current = true
        }
      }
    }

    if (hasVerticalTouchMovement.current) {
      if (touchStartX.current !== null || isSwipingDayView) {
        touchStartX.current = null
        touchStartWidth.current = 0
        swipeDeltaRef.current = 0
        swipeScrollProgressRef.current = null
        sliderControls.set({ x: 0 })
        if (isSwipingDayView) {
          setIsSwipingDayView(false)
        }
        setPeekState(prev => {
          if (prev.direction === 0 && prev.offset === 0) {
            return prev
          }
          return { direction: 0, offset: 0 }
        })
      }
      return
    }

    if (touchStartX.current === null) return
    const width =
      touchStartWidth.current || swipeContainerRef.current?.offsetWidth || 1
    const diff = touch.clientX - touchStartX.current
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
    if (pinchActiveRef.current) {
      pinchActiveRef.current = false
      pinchStateRef.current = null
      commitPinchToSnap()
      sliderControls.set({ x: 0 })
      swipeDeltaRef.current = 0
      touchStartX.current = null
      touchStartWidth.current = 0
      swipeScrollProgressRef.current = null
      setIsSwipingDayView(false)
      touchStartY.current = null
      hasVerticalTouchMovement.current = false
      setPeekState(prev => {
        if (prev.direction === 0 && prev.offset === 0) {
          return prev
        }
        return { direction: 0, offset: 0 }
      })
      return
    }

    if (view !== 'day' || prefersReducedMotion) {
      touchStartX.current = null
      setIsSwipingDayView(false)
      setPeekState({ direction: 0, offset: 0 })
      swipeScrollProgressRef.current = null
      touchStartY.current = null
      hasVerticalTouchMovement.current = false
      return
    }
    if (touchStartX.current === null) {
      setIsSwipingDayView(false)
      setPeekState({ direction: 0, offset: 0 })
      swipeScrollProgressRef.current = null
      touchStartY.current = null
      hasVerticalTouchMovement.current = false
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
      swipeScrollProgressRef.current = null
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
    touchStartY.current = null
    hasVerticalTouchMovement.current = false
  }

  const handleTouchCancel = () => {
    void handleTouchEnd()
  }

  const handleJumpToDateSelect = (date: Date) => {
    setIsJumpToDateOpen(false)
    setSkipNextDayAnimation(true)
    updateCurrentDate(date, { animate: false })
    navigate('day')
  }

  const handleSearchResultSelect = ({
    instanceId,
    date,
  }: {
    instanceId: string
    date: Date
  }) => {
    setIsSearchOpen(false)
    setSkipNextDayAnimation(true)
    updateCurrentDate(date, { animate: false })
    navigate('day')
    setFocusInstanceId(instanceId)
  }

  const openInstanceEditor = useCallback(
    (instanceId: string, origin?: ScheduleEditOrigin | null) => {
      setEditInstanceId(instanceId)
      setEditOrigin(origin ?? null)
      setIsEditSheetOpen(true)
    },
    []
  )

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const cancelLongPress = useCallback(() => {
    clearLongPressTimer()
  }, [clearLongPressTimer])

  const triggerLongPressFeedback = useCallback((instanceId: string) => {
    if (!instanceId) return
    setLongPressBounceId(instanceId)
    if (longPressBounceTimeoutRef.current !== null) {
      window.clearTimeout(longPressBounceTimeoutRef.current)
      longPressBounceTimeoutRef.current = null
    }
    longPressBounceTimeoutRef.current = window.setTimeout(() => {
      setLongPressBounceId(current => (current === instanceId ? null : current))
      longPressBounceTimeoutRef.current = null
    }, LONG_PRESS_FEEDBACK_DURATION_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (longPressBounceTimeoutRef.current !== null) {
        window.clearTimeout(longPressBounceTimeoutRef.current)
        longPressBounceTimeoutRef.current = null
      }
    }
  }, [])

  const handleInstancePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      instanceId?: string | null,
      onShortPress?: () => void,
      onLongPress?: () => void
    ) => {
      if (!instanceId) return
      const pointerType = event.pointerType
      const isTouchLike =
        pointerType === 'touch' ||
        pointerType === 'pen' ||
        pointerType === 'mouse' ||
        pointerType === '' ||
        pointerType === undefined
      if (pointerType === 'mouse' && event.button !== 0) {
        return
      }
      if (!isTouchLike) {
        activePressRef.current = null
        longPressTriggeredRef.current = false
        shortPressHandledRef.current = false
        clearLongPressTimer()
        longPressOriginRef.current = null
        return
      }
      longPressOriginRef.current = event.currentTarget
      activePressRef.current = {
        instanceId,
        shortPress: onShortPress ?? null,
      }
      longPressTriggeredRef.current = false
      shortPressHandledRef.current = false
      clearLongPressTimer()
      const timerId = window.setTimeout(() => {
        longPressTimerRef.current = null
        const element = longPressOriginRef.current
        let originData: ScheduleEditOrigin | null = null
        if (element) {
          const rect = element.getBoundingClientRect()
          const computed = window.getComputedStyle(element)
          const fallbackRadius = [
            computed.borderTopLeftRadius,
            computed.borderTopRightRadius,
            computed.borderBottomRightRadius,
            computed.borderBottomLeftRadius,
          ]
            .filter(Boolean)
            .join(' ')
            .trim()
          const radius =
            (computed.borderRadius && computed.borderRadius.trim().length > 0
              ? computed.borderRadius
              : fallbackRadius) || '0px'
          const backgroundImage =
            computed.backgroundImage && computed.backgroundImage !== 'none'
              ? computed.backgroundImage
              : undefined
          const backgroundColorRaw = computed.backgroundColor
          const backgroundColor =
            backgroundColorRaw &&
            backgroundColorRaw !== 'rgba(0, 0, 0, 0)' &&
            backgroundColorRaw.toLowerCase() !== 'transparent'
              ? backgroundColorRaw
              : undefined
          const boxShadow =
            computed.boxShadow && computed.boxShadow !== 'none'
              ? computed.boxShadow
              : undefined
          originData = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            borderRadius: radius,
            backgroundColor,
            backgroundImage,
            boxShadow,
          }
        }
        triggerLongPressFeedback(instanceId)
        longPressTriggeredRef.current = true
        const runLongPressAction = () => {
          if (onLongPress) {
            onLongPress()
          } else {
            openInstanceEditor(instanceId, originData)
          }
          longPressOriginRef.current = null
        }
        if (LONG_PRESS_ACTION_DELAY_MS > 0) {
          window.setTimeout(runLongPressAction, LONG_PRESS_ACTION_DELAY_MS)
        } else {
          runLongPressAction()
        }
      }, SCHEDULE_CARD_LONG_PRESS_MS)
      longPressTimerRef.current = timerId
    },
    [
      clearLongPressTimer,
      openInstanceEditor,
      triggerLongPressFeedback,
    ]
  )

  const handleInstancePointerUp = useCallback(() => {
    const pending = activePressRef.current
    const longPressTriggered = longPressTriggeredRef.current
    cancelLongPress()
    activePressRef.current = null
    longPressOriginRef.current = null
    if (!longPressTriggered && pending?.shortPress) {
      shortPressHandledRef.current = true
      pending.shortPress()
    }
  }, [cancelLongPress])

  const handleInstancePointerCancel = useCallback(() => {
    activePressRef.current = null
    cancelLongPress()
    longPressOriginRef.current = null
  }, [cancelLongPress])

  const shouldBlockClickFromLongPress = useCallback(() => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return true
    }
    if (shortPressHandledRef.current) {
      shortPressHandledRef.current = false
      return true
    }
    return false
  }, [])

  const dayTimelineModel = useMemo(
    () =>
      buildDayTimelineModel({
        date: currentDate,
        windows,
        instances,
        projectMap,
        taskMap,
        tasksByProjectId,
        habits,
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
      habits,
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

  useEffect(() => {
    return () => {
      clearLongPressTimer()
    }
  }, [clearLongPressTimer])

  useEffect(() => {
    if (!isEditSheetOpen) return
    if (editInstanceId && !editingInstance) {
      setIsEditSheetOpen(false)
      setEditInstanceId(null)
      setEditOrigin(null)
    }
  }, [isEditSheetOpen, editInstanceId, editingInstance])

  useEffect(() => {
    if (!isEditSheetOpen) return
    if (!editingProjectId && !editingHabitId) {
      setIsEditSheetOpen(false)
      setEditInstanceId(null)
      setEditOrigin(null)
    }
  }, [isEditSheetOpen, editingProjectId, editingHabitId])

  const baseTimelineHeight = useMemo(
    () =>
      computeDayTimelineHeightPx(dayTimelineModel.startHour, pxPerMin),
    [dayTimelineModel.startHour, pxPerMin]
  )

  const measuredTimelineContainerHeight =
    dayTimelineContainerRef.current?.offsetHeight ?? null

  const timelineChromeHeight = useMemo(() => {
    if (
      measuredTimelineContainerHeight !== null &&
      Number.isFinite(measuredTimelineContainerHeight)
    ) {
      const chrome = Math.max(
        0,
        measuredTimelineContainerHeight - baseTimelineHeight
      )
      if (!Number.isNaN(chrome)) {
        lastTimelineChromeHeightRef.current = chrome
        return chrome
      }
    }
    return lastTimelineChromeHeightRef.current
  }, [measuredTimelineContainerHeight, baseTimelineHeight])

  const renderDayTimeline = useCallback(
    (model: DayTimelineModel, options?: DayTimelineRenderOptions) => {
      const {
        isViewingToday,
        dayViewDateKey,
        dayViewDetails,
        date,
        startHour: modelStartHour,
        windows: modelWindows,
        projectInstances: modelProjectInstances,
        taskInstancesByProject: modelTaskInstancesByProject,
        tasksByProjectId: modelTasksByProjectId,
        standaloneTaskInstances: modelStandaloneTaskInstances,
        habitPlacements: modelHabitPlacements,
        windowReports: modelWindowReports,
      } = model

      const modelPxPerMin = pxPerMin
      const todayDateKey = formatLocalDateKey(new Date())
      const viewDateComparison = dayViewDateKey.localeCompare(todayDateKey)
      const viewIsPastDay = viewDateComparison < 0
      const viewIsFutureDay = viewDateComparison > 0
      const currentTimeMs = Date.now()

      const toTimelinePosition = (minutes: number) => {
        if (!Number.isFinite(minutes)) return '0px'
        if (minutes <= 0) return '0px'
        return `calc(var(--timeline-minute-unit) * ${minutes})`
      }

      const containerClass = options?.disableInteractions
        ? 'pointer-events-none select-none'
        : ''

      const containerStyle: CSSProperties = options?.fullBleed
        ? {
            ...TIMELINE_CSS_VARIABLES,
            ...TIMELINE_FULL_BLEED_STYLE,
          }
        : TIMELINE_CSS_VARIABLES

      const { habitLayouts, projectLayouts, syncHabitAlignment } =
        computeTimelineLayoutForSyncHabits({
          habitPlacements: modelHabitPlacements,
          projectInstances: modelProjectInstances,
        })

      return (
        <div
          className={containerClass}
          ref={options?.containerRef ?? undefined}
          style={containerStyle}
        >
          <div className="pb-3 text-white" style={TIMELINE_HEADER_PADDING}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/60">
                {isViewingToday ? 'Today' : 'Selected Day'}
              </span>
              <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {dayViewDetails.weekday}
              </h2>
              <p className="text-xs text-white/60 sm:text-sm">{dayViewDetails.fullDate}</p>
            </div>
          </div>
          <DayTimeline
            date={date}
            startHour={modelStartHour}
            pxPerMin={modelPxPerMin}
            zoomPxPerMin={animatedPxPerMin}
            style={TIMELINE_CSS_VARIABLES}
          >
            {modelWindows.map(w => {
              const { topMinutes, heightMinutes } = windowRectMinutes(
                w,
                modelStartHour
              )
              const windowHeightPx = Math.max(0, heightMinutes * modelPxPerMin)
              return (
                <div
                  key={w.id}
                  aria-label={w.label}
                  className="absolute left-0 flex"
                  style={{
                    top: toTimelinePosition(topMinutes),
                    height: toTimelinePosition(heightMinutes),
                  }}
                >
                  <div className="w-0.5 bg-zinc-700 opacity-50" />
                  <WindowLabel
                    label={w.label ?? ''}
                    availableHeight={windowHeightPx}
                  />
                </div>
              )
            })}
            {modelWindowReports.map(report => {
              const { topMinutes, heightMinutes } = windowRectMinutes(
                report.window,
                modelStartHour
              )
              if (!Number.isFinite(heightMinutes) || heightMinutes <= 0) {
                return null
              }
              return (
                <div
                  key={report.key}
                  className="absolute"
                  style={{
                    ...TIMELINE_CARD_BOUNDS,
                    top: toTimelinePosition(topMinutes),
                    height: toTimelinePosition(heightMinutes),
                  }}
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
              )
            })}
            {modelHabitPlacements.map((placement, index) => {
              if (!isValidDate(placement.start) || !isValidDate(placement.end)) return null
              const rawHabitType = placement.habitType || 'HABIT'
              const normalizedHabitType =
                rawHabitType === 'ASYNC' ? 'SYNC' : rawHabitType
              let displayStart = placement.start
              let displayEnd = placement.end
              const alignment =
                normalizedHabitType === 'SYNC'
                  ? syncHabitAlignment.get(index)
                  : undefined
              if (alignment) {
                const alignedStartMs = Math.min(
                  alignment.startMs,
                  placement.start.getTime()
                )
                const alignedEndMs = Math.max(
                  alignment.endMs,
                  placement.end.getTime()
                )
                const alignedStart = new Date(alignedStartMs)
                const alignedEnd = new Date(alignedEndMs)
                if (isValidDate(alignedStart) && isValidDate(alignedEnd)) {
                  displayStart = alignedStart
                  displayEnd = alignedEnd
                }
              }
              const startMin = getDayMinuteOffset(displayStart)
              const startOffsetMinutes = startMin - modelStartHour * 60
              let durationMinutes = Math.max(
                0,
                (displayEnd.getTime() - displayStart.getTime()) / 60000
              )
              if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
                durationMinutes = placement.durationMinutes
              }
              const topStyle = toTimelinePosition(startOffsetMinutes)
              const heightStyle = toTimelinePosition(durationMinutes)
              const habitHeightPx = Math.max(durationMinutes * modelPxPerMin, 0)
              const shouldWrapHabitTitle = Number(durationMinutes) >= 30
              const habitTitleClass = shouldWrapHabitTitle
                ? 'pr-8 text-sm font-medium leading-snug line-clamp-2 sm:line-clamp-1 sm:truncate'
                : 'truncate pr-8 text-sm font-medium leading-snug'
              const habitStatus = getHabitCompletionStatus(
                dayViewDateKey,
                placement.habitId
              )
              const isHabitCompleted = habitStatus === 'completed'
              let shouldHideHabit = false
              if (isHabitCompleted) {
                if (viewIsFutureDay) {
                  shouldHideHabit = true
                } else if (!viewIsPastDay) {
                  const placementIsBeforeNow = placement.end.getTime() <= currentTimeMs
                  if (!placementIsBeforeNow) {
                    shouldHideHabit = true
                  }
                }
              }
              if (shouldHideHabit) {
                return null
              }
              const streakDays = Math.max(0, Math.round(placement.currentStreakDays ?? 0))
              const showHabitStreakBadge = streakDays >= 2
              const streakLabel = `${streakDays}x`
              let streakBadgeStyle: CSSProperties | undefined
              if (showHabitStreakBadge) {
                const availableHeight =
                  habitHeightPx - HABIT_STREAK_BADGE_BOTTOM_MARGIN_PX
                let streakBadgeHeightPx = HABIT_STREAK_BADGE_BASE_HEIGHT_PX
                if (
                  availableHeight <
                  HABIT_STREAK_BADGE_BASE_HEIGHT_PX + HABIT_STREAK_BADGE_TOP_MARGIN_PX
                ) {
                  streakBadgeHeightPx = Math.max(
                    0,
                    availableHeight - HABIT_STREAK_BADGE_TOP_MARGIN_PX
                  )
                }
                let streakBadgeScale = 1
                if (
                  streakBadgeHeightPx > 0 &&
                  streakBadgeHeightPx < HABIT_STREAK_BADGE_BASE_HEIGHT_PX
                ) {
                  streakBadgeScale =
                    streakBadgeHeightPx / HABIT_STREAK_BADGE_BASE_HEIGHT_PX
                } else if (streakBadgeHeightPx <= 0) {
                  streakBadgeScale = 0
                }
                let streakBadgeTopPx = HABIT_STREAK_BADGE_TOP_MARGIN_PX
                const overflow =
                  streakBadgeTopPx +
                  streakBadgeHeightPx +
                  HABIT_STREAK_BADGE_BOTTOM_MARGIN_PX -
                  habitHeightPx
                if (overflow > 0) {
                  streakBadgeTopPx = Math.max(
                    HABIT_STREAK_BADGE_BOTTOM_MARGIN_PX,
                    streakBadgeTopPx - overflow
                  )
                }
                streakBadgeStyle = {
                  top: `${streakBadgeTopPx}px`,
                  transform:
                    streakBadgeScale < 0.999
                      ? `scale(${streakBadgeScale})`
                      : undefined,
                  transformOrigin: 'top right',
                }
              }
              const scheduledCardBackground =
                'radial-gradient(circle at 0% 0%, rgba(120, 126, 138, 0.28), transparent 58%), linear-gradient(140deg, rgba(8, 8, 10, 0.96) 0%, rgba(22, 22, 26, 0.94) 42%, rgba(88, 90, 104, 0.6) 100%)'
              const choreCardBackground =
                'radial-gradient(circle at 10% -25%, rgba(248, 113, 113, 0.32), transparent 58%), linear-gradient(135deg, rgba(67, 26, 26, 0.9) 0%, rgba(127, 29, 29, 0.85) 45%, rgba(220, 38, 38, 0.72) 100%)'
              const relaxerCardBackground =
                'radial-gradient(circle at 8% -18%, rgba(16, 185, 129, 0.32), transparent 60%), linear-gradient(138deg, rgba(4, 56, 33, 0.94) 0%, rgba(4, 120, 87, 0.88) 46%, rgba(16, 185, 129, 0.78) 100%)'
              const syncCardBackground =
                'radial-gradient(circle at 12% -20%, rgba(209, 213, 219, 0.32), transparent 58%), linear-gradient(135deg, rgba(39, 42, 48, 0.92) 0%, rgba(107, 114, 128, 0.82) 45%, rgba(209, 213, 219, 0.7) 100%)'
              const practiceCardBackground =
                'radial-gradient(circle at 6% -14%, rgba(54, 57, 66, 0.38), transparent 60%), linear-gradient(142deg, rgba(4, 4, 6, 0.98) 0%, rgba(18, 18, 22, 0.95) 44%, rgba(68, 72, 92, 0.72) 100%)'
              const memoCardBackground =
                'radial-gradient(circle at 8% -18%, rgba(192, 132, 252, 0.34), transparent 60%), linear-gradient(138deg, rgba(59, 7, 100, 0.94) 0%, rgba(99, 37, 141, 0.88) 46%, rgba(168, 85, 247, 0.74) 100%)'
              const memoCompletedBackground =
                'radial-gradient(circle at 10% -18%, rgba(216, 180, 254, 0.4), transparent 60%), linear-gradient(138deg, rgba(76, 29, 149, 0.95) 0%, rgba(124, 58, 237, 0.88) 48%, rgba(192, 132, 252, 0.78) 100%)'
              const completedCardBackground =
                'radial-gradient(circle at 2% 0%, rgba(16, 185, 129, 0.28), transparent 58%), linear-gradient(140deg, rgba(6, 78, 59, 0.95) 0%, rgba(4, 120, 87, 0.92) 44%, rgba(16, 185, 129, 0.88) 100%)'
              const scheduledShadow = [
                '0 28px 58px rgba(3, 3, 6, 0.66)',
                '0 10px 24px rgba(0, 0, 0, 0.45)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              ].join(', ')
              const choreShadow = [
                '0 18px 36px rgba(56, 16, 24, 0.38)',
                '0 8px 18px rgba(76, 20, 32, 0.26)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
              ].join(', ')
              const relaxerShadow = [
                '0 20px 40px rgba(3, 47, 39, 0.52)',
                '0 10px 22px rgba(2, 119, 84, 0.32)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
              ].join(', ')
              const syncShadow = [
                '0 18px 36px rgba(58, 44, 14, 0.32)',
                '0 8px 18px rgba(82, 62, 18, 0.24)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
              ].join(', ')
              const practiceShadow = [
                '0 30px 60px rgba(2, 2, 6, 0.72)',
                '0 12px 28px rgba(0, 0, 0, 0.48)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              ].join(', ')
              const memoShadow = [
                '0 22px 44px rgba(76, 29, 149, 0.42)',
                '0 10px 24px rgba(59, 7, 100, 0.36)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.14)',
              ].join(', ')
              const memoCompletedShadow = [
                '0 24px 48px rgba(124, 58, 237, 0.42)',
                '0 12px 28px rgba(88, 28, 135, 0.34)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.16)',
              ].join(', ')
              const completedShadow = [
                '0 26px 52px rgba(2, 32, 24, 0.6)',
                '0 12px 28px rgba(1, 55, 34, 0.45)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
              ].join(', ')
              let cardBackground = scheduledCardBackground
              let cardShadow = scheduledShadow
              let cardOutline = '1px solid rgba(10, 10, 12, 0.85)'
              let habitBorderClass = 'border-black/70'

              if (normalizedHabitType === 'MEMO') {
                if (isHabitCompleted) {
                  cardBackground = memoCompletedBackground
                  cardShadow = memoCompletedShadow
                  cardOutline = '1px solid rgba(216, 180, 254, 0.55)'
                  habitBorderClass = 'border-purple-200/65'
                } else {
                  cardBackground = memoCardBackground
                  cardShadow = memoShadow
                  cardOutline = '1px solid rgba(147, 51, 234, 0.5)'
                  habitBorderClass = 'border-purple-300/55'
                }
              } else if (isHabitCompleted) {
                cardBackground = completedCardBackground
                cardShadow = completedShadow
                cardOutline = '1px solid rgba(16, 185, 129, 0.55)'
                habitBorderClass = 'border-emerald-400/60'
              } else if (normalizedHabitType === 'CHORE') {
                cardBackground = choreCardBackground
                cardShadow = choreShadow
                cardOutline = '1px solid rgba(0, 0, 0, 0.85)'
                habitBorderClass = 'border-rose-200/45'
              } else if (normalizedHabitType === 'RELAXER') {
                cardBackground = relaxerCardBackground
                cardShadow = relaxerShadow
                cardOutline = '1px solid rgba(52, 211, 153, 0.55)'
                habitBorderClass = 'border-emerald-200/60'
              } else if (normalizedHabitType === 'PRACTICE') {
                cardBackground = practiceCardBackground
                cardShadow = practiceShadow
                cardOutline = '1px solid rgba(8, 8, 12, 0.92)'
                habitBorderClass = 'border-slate-500/50'
              } else if (normalizedHabitType === 'SYNC') {
                cardBackground = syncCardBackground
                cardShadow = syncShadow
                cardOutline = '1px solid rgba(0, 0, 0, 0.85)'
                habitBorderClass = 'border-amber-200/45'
              }
              const practiceContextIdForPlacement =
                normalizedHabitType === 'PRACTICE' ? placement.practiceContextId ?? null : null
              const practiceContextLabel =
                practiceContextIdForPlacement
                  ? practiceContextDisplayById.get(practiceContextIdForPlacement) ?? null
                  : null
              const habitPaddingClass = practiceContextLabel ? 'pt-4 pb-2' : 'py-2'
              const layoutMode = habitLayouts[index] ?? 'full'
              const habitCornerClass = getTimelineCardCornerClass(layoutMode)
              const useCompactShadow =
                habitHeightPx <= HABIT_COMPACT_SHADOW_HEIGHT_PX
              const habitCardShadow = useCompactShadow
                ? HABIT_COMPACT_SHADOW
                : cardShadow
              const stackingZIndex = computeTimelineStackingIndex(startOffsetMinutes)
              const cardStyle: CSSProperties = applyTimelineLayoutStyle(
                {
                  ...TIMELINE_CARD_BOUNDS,
                  top: topStyle,
                  height: heightStyle,
                  boxShadow: habitCardShadow,
                  outline: cardOutline,
                  outlineOffset: '-1px',
                  background: cardBackground,
                },
                layoutMode,
                { animate: !prefersReducedMotion }
              )
              const hasHabitInstance = Boolean(placement.instanceId)
              const habitBounceActive =
                hasHabitInstance && placement.instanceId
                  ? longPressBounceId === placement.instanceId
                  : false
              const handleHabitPrimaryAction = () => {
                if (options?.disableInteractions) return
                handleHabitCardActivation(placement, dayViewDateKey)
              }
              const habitPointerHandlers = hasHabitInstance
                ? {
                    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
                      if (options?.disableInteractions) return
                      if (!placement.instanceId) return
                      handleInstancePointerDown(
                        event,
                        placement.instanceId,
                        handleHabitPrimaryAction
                      )
                    },
                    onPointerUp: handleInstancePointerUp,
                    onPointerCancel: handleInstancePointerCancel,
                  }
                : {}

              const habitLayoutId = placement.instanceId
                ? getScheduleInstanceLayoutId(placement.instanceId)
                : null
              const habitLayoutTokens = habitLayoutId
                ? scheduleInstanceLayoutTokens(habitLayoutId)
                : null
              const hideForEdit =
                hasHabitInstance &&
                Boolean(
                  isEditSheetOpen &&
                    editInstanceId &&
                    editInstanceId === placement.instanceId &&
                    !editingProjectId &&
                    !editingHabitId
                )

              if (hideForEdit) {
                return null
              }

              const layeredCardStyle = { ...cardStyle, zIndex: stackingZIndex }

              return (
                <motion.div
                  key={`habit-${placement.habitId}-${index}`}
                  layoutId={habitLayoutTokens?.card}
                  className={`absolute flex h-full items-center justify-between gap-3 ${habitCornerClass} border px-3 ${habitPaddingClass} text-white shadow-[0_18px_38px_rgba(8,12,32,0.52)] backdrop-blur transition-[background,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${habitBorderClass} cursor-pointer select-none`}
                  role="button"
                  tabIndex={options?.disableInteractions ? -1 : 0}
                  aria-pressed={isHabitCompleted}
                  aria-disabled={options?.disableInteractions ?? false}
                  style={layeredCardStyle}
                  onClick={() => {
                    if (shouldBlockClickFromLongPress()) return
                    handleHabitPrimaryAction()
                  }}
                  onKeyDown={event => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                      return
                    }
                    event.preventDefault()
                    handleHabitPrimaryAction()
                  }}
                  {...habitPointerHandlers}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                  animate={
                    prefersReducedMotion
                      ? undefined
                      : {
                          opacity: 1,
                          y: 0,
                          scale: habitBounceActive ? 1.04 : 1,
                        }
                  }
                  exit={prefersReducedMotion ? undefined : { opacity: 0, y: 4 }}
                >
                  {practiceContextLabel ? (
                    <div className="pointer-events-none absolute right-3 top-0 max-w-[60%] text-right leading-tight">
                      <span className="truncate text-[9px] font-semibold text-white/80">
                        {practiceContextLabel}
                      </span>
                    </div>
                  ) : null}
                  <motion.span
                    layoutId={habitLayoutTokens?.title}
                    className={habitTitleClass}
                  >
                    {placement.habitName}
                  </motion.span>
                  {showHabitStreakBadge ? (
                    <span
                      className="pointer-events-none absolute right-3 top-2 flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-amber-100"
                      style={streakBadgeStyle}
                    >
                      <FlameEmber
                        level={streakDays >= 7 ? 'HIGH' : streakDays >= 4 ? 'MEDIUM' : 'LOW'}
                        size="xs"
                        className="drop-shadow-[0_0_6px_rgba(0,0,0,0.4)]"
                      />
                      <span className="tracking-normal">{streakLabel}</span>
                    </span>
                  ) : null}
                </motion.div>
              )
            })}
            {modelProjectInstances.map(({ instance, project, start, end }, index) => {
              if (!isValidDate(start) || !isValidDate(end)) return null
              const projectId = project.id
              const startMin = getDayMinuteOffset(start)
              const startOffsetMinutes = startMin - modelStartHour * 60
              const durationMinutes = Math.max(
                0,
                (end.getTime() - start.getTime()) / 60000
              )
              const shouldWrapProjectTitle = Number(durationMinutes) >= 30
              const topStyle = toTimelinePosition(startOffsetMinutes)
              const heightStyle = toTimelinePosition(durationMinutes)
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
              const tasksLabel =
                project.taskCount > 0
                  ? `${project.taskCount} ${
                      project.taskCount === 1 ? 'task' : 'tasks'
                    }`
                  : null
              const layoutMode = projectLayouts[index] ?? 'full'
              const projectCornerClass = getTimelineCardCornerClass(layoutMode)
              const goalRelationInfo = projectGoalRelations[projectId]
              const goalRelationName = goalRelationInfo?.goalName?.trim()
              const goalRelationText =
                goalRelationName && goalRelationName.length > 0 ? goalRelationName : null
              const collapsedCardPaddingClass = goalRelationText ? 'pt-4 pb-2' : 'py-2'
              const projectDurationMs = Math.max(
                end.getTime() - start.getTime(),
                1
              )
              const projectHeightPx = Math.max(
                durationMinutes * modelPxPerMin,
                1
              )
              const positionStyle: CSSProperties = applyTimelineLayoutStyle(
                {
                  ...TIMELINE_CARD_BOUNDS,
                  top: topStyle,
                  height: heightStyle,
                },
                layoutMode,
                { animate: !prefersReducedMotion }
              )
              const stackingZIndex = computeTimelineStackingIndex(startOffsetMinutes)
              const layeredPositionStyle = { ...positionStyle, zIndex: stackingZIndex }
              const useCompactProjectShadow =
                projectHeightPx <= TIMELINE_COMPACT_CARD_HEIGHT_PX
              const sharedCardShadow = useCompactProjectShadow
                ? TIMELINE_COMPACT_CARD_SHADOW
                : '0 28px 58px rgba(3, 3, 6, 0.66), 0 10px 24px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
              const sharedCardStyle: CSSProperties = {
                boxShadow: sharedCardShadow,
                outline: '1px solid rgba(10, 10, 12, 0.85)',
                outlineOffset: '-1px',
              }
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
              const detailParts: string[] = []
              if (tasksLabel) detailParts.push(tasksLabel)
              const detailText = detailParts.join(' · ')
              const weightValue =
                typeof instance.weight_snapshot === 'number'
                  ? instance.weight_snapshot
                  : project.weight
              const weightDisplay =
                typeof weightValue === 'number' && Number.isFinite(weightValue)
                  ? weightValue % 1 === 0
                    ? weightValue.toString()
                    : weightValue.toFixed(2).replace(/\.00$/, '')
                  : null
              const hiddenFallbackCount = usingFallback
                ? Math.max(0, backlogTasks.length - displayCards.length)
                : 0
              const canExpand = displayCards.length > 0
              const pendingStatus = pendingInstanceStatuses.get(instance.id)
              const isPending = pendingStatus !== undefined
              const effectiveStatus =
                pendingStatus ?? instance.status ?? 'scheduled'
              const canToggle =
                effectiveStatus === 'completed' ||
                effectiveStatus === 'scheduled'
              const isCompleted = effectiveStatus === 'completed'
              const projectLongPressActive = longPressBounceId === instance.id

              const hideForEdit = Boolean(
                isEditSheetOpen &&
                  editInstanceId &&
                  editInstanceId === instance.id &&
                  !editingProjectId &&
                  !editingHabitId
              )

              const instanceLayoutId = getScheduleInstanceLayoutId(instance.id)
              const layoutTokens = scheduleInstanceLayoutTokens(instanceLayoutId)
              const isLockedProject = instance.locked === true

              const handleProjectToggle = () => {
                if (!canToggle || isPending) return
                const nextStatus = isCompleted ? 'scheduled' : 'completed'
                void handleToggleInstanceCompletion(instance.id, nextStatus)
              }
              const handleProjectExpand = () => {
                if (!canExpand) return
                setProjectExpansion(projectId)
              }
              const handleProjectPrimaryAction = handleProjectToggle
              const projectBackground = isCompleted
                ? 'radial-gradient(circle at 2% 0%, rgba(16, 185, 129, 0.28), transparent 58%), linear-gradient(140deg, rgba(6, 78, 59, 0.95) 0%, rgba(4, 120, 87, 0.92) 44%, rgba(16, 185, 129, 0.88) 100%)'
                : 'radial-gradient(circle at 0% 0%, rgba(120, 126, 138, 0.28), transparent 58%), linear-gradient(140deg, rgba(8, 8, 10, 0.96) 0%, rgba(22, 22, 26, 0.94) 42%, rgba(88, 90, 104, 0.6) 100%)'
              const resolvedProjectShadow = isCompleted
                ? useCompactProjectShadow
                  ? TIMELINE_COMPACT_CARD_COMPLETED_SHADOW
                  : '0 26px 52px rgba(2, 32, 24, 0.6), 0 12px 28px rgba(1, 55, 34, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
                : sharedCardShadow
              const projectCardStyle: CSSProperties = {
                ...sharedCardStyle,
                boxShadow: resolvedProjectShadow,
                outline: isCompleted
                  ? '1px solid rgba(16, 185, 129, 0.55)'
                  : sharedCardStyle.outline,
                background: projectBackground,
              }
              const projectBorderClass = isCompleted
                ? 'border-emerald-400/60'
                : 'border-black/70'
              const instanceEnergyLevel = resolveEnergyLevel(instance.energy_resolved)
              const projectEnergyLevel = resolveEnergyLevel(project.energy)
              const cardEnergyLevel: FlameLevel =
                instanceEnergyLevel ?? projectEnergyLevel ?? 'NO'
              const projectTitleInnerClass = shouldWrapProjectTitle
                ? 'min-w-0 leading-tight line-clamp-2 sm:line-clamp-1 sm:truncate'
                : 'min-w-0 leading-tight truncate'
              return (
                <motion.div
                  key={instance.id}
                  data-schedule-instance-id={instance.id}
                  className="absolute"
                  style={layeredPositionStyle}
                  layout={!prefersReducedMotion}
                  transition={
                    prefersReducedMotion
                      ? undefined
                      : { type: 'spring', stiffness: 320, damping: 32 }
                  }
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {!isExpanded || !canExpand ? (
                      hideForEdit ? null : (
                        <motion.div
                          key="project"
                          layout="position"
                          layoutId={layoutTokens.card}
                          aria-label={`Project ${project.name}`}
                          role="button"
                          tabIndex={0}
                          aria-expanded={canExpand ? isExpanded : undefined}
                          aria-pressed={isCompleted}
                        aria-disabled={!canToggle || isPending}
                        onPointerDown={event => {
                          if (options?.disableInteractions) return
                          handleInstancePointerDown(event, instance.id, handleProjectPrimaryAction)
                        }}
                        onPointerUp={handleInstancePointerUp}
                        onPointerCancel={handleInstancePointerCancel}
                        onDoubleClick={event => {
                          event.preventDefault()
                          if (options?.disableInteractions) return
                          handleProjectExpand()
                        }}
                        onClick={() => {
                          if (shouldBlockClickFromLongPress()) return
                          handleProjectPrimaryAction()
                        }}
                        onKeyDown={event => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          handleProjectPrimaryAction()
                        }}
                        className={`relative flex h-full w-full items-center justify-between ${projectCornerClass} px-3 ${collapsedCardPaddingClass} text-white backdrop-blur-sm border ${projectBorderClass} transition-[background,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] select-none${
                          canExpand || (canToggle && !isPending)
                            ? ' cursor-pointer'
                            : ''
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
                                scale: projectLongPressActive ? 1.03 : 1,
                                transition: {
                                  delay: hasInteractedWithProjects
                                    ? 0
                                    : index * 0.02,
                                  duration: 0.18,
                                  ease: [0.4, 0, 0.2, 1],
                                  scale: {
                                    delay: 0,
                                    type: 'spring',
                                    stiffness: 520,
                                    damping: 32,
                                  },
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
                          {goalRelationText ? (
                            <div className="pointer-events-none absolute right-3 top-0 max-w-[60%] text-right leading-tight">
                              <span className="truncate text-[9px] font-semibold text-white/80">
                                {goalRelationText}
                              </span>
                            </div>
                          ) : null}
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="min-w-0 space-y-1">
                            <motion.span
                              layoutId={layoutTokens.title}
                              className="block text-sm font-medium"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span className={projectTitleInnerClass}>
                                  {project.name}
                                </span>
                                {isLockedProject ? (
                                  <Lock className="h-3.5 w-3.5 text-white/80" aria-label="Locked project" />
                                ) : null}
                                {weightDisplay ? (
                                  <span className="text-xs font-normal text-white/70">
                                    ({weightDisplay})
                                  </span>
                                ) : null}
                              </span>
                            </motion.span>
                            {detailText ? (
                              <motion.div
                                layoutId={layoutTokens.meta}
                                className="text-xs text-zinc-200/70"
                              >
                                {detailText}
                              </motion.div>
                            ) : null}
                          </div>
                        </div>
                        <SkillEnergyBadge
                          energyLevel={cardEnergyLevel}
                          skillIcon={project.skill_icon}
                          className="flex flex-shrink-0 items-center gap-2"
                          iconClassName="text-lg leading-none"
                          flameClassName="flex-shrink-0"
                        />
                        </motion.div>
                      )
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
                        <div
                          className={`relative h-full w-full overflow-hidden p-2 ${projectCornerClass}`}
                        >
                          <AnimatePresence initial={false}>
                            {displayCards.map(taskCard => {
                              const {
                                key,
                                task,
                                start: taskStart,
                                end: taskEnd,
                                kind,
                                instanceId,
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
                            const allowTaskTitleWrap =
                              taskCard.displayDurationMinutes >= 30
                            const taskTitleClass = allowTaskTitleWrap
                              ? 'text-sm font-medium leading-tight line-clamp-2 sm:line-clamp-1 sm:truncate'
                              : 'text-sm font-medium leading-tight truncate'
                            const baseTaskClasses =
                              'absolute left-0 right-0 flex items-center justify-between rounded-[var(--schedule-instance-radius)] px-3 py-2 select-none'
                            const shinyTaskClasses =
                              'bg-[linear-gradient(135deg,_rgba(52,52,60,0.95)_0%,_rgba(82,84,94,0.92)_40%,_rgba(158,162,174,0.88)_100%)] text-zinc-50 shadow-[0_18px_38px_rgba(8,8,12,0.55)] ring-1 ring-white/20 backdrop-blur'
                            const completedTaskClasses =
                              'bg-[linear-gradient(135deg,_rgba(6,78,59,0.96)_0%,_rgba(4,120,87,0.94)_42%,_rgba(16,185,129,0.88)_100%)] text-emerald-50 shadow-[0_22px_42px_rgba(4,47,39,0.55)] ring-1 ring-emerald-300/60 backdrop-blur'
                            const fallbackTaskClasses =
                              'bg-[linear-gradient(135deg,_rgba(44,44,52,0.9)_0%,_rgba(68,70,80,0.88)_38%,_rgba(120,126,138,0.82)_100%)] text-zinc-100 shadow-[0_16px_32px_rgba(10,10,14,0.5)] ring-1 ring-white/15 backdrop-blur-[2px]'
                            const isFallbackCard = kind === 'fallback'
                            const fallbackStage = task.stage
                              ? task.stage.toString().toUpperCase()
                              : ''
                            const fallbackCompleted =
                              isFallbackCard && fallbackStage === 'PERFECT'
                            const fallbackPending = isFallbackCard
                              ? pendingBacklogTaskIds.has(task.id)
                              : false
                            const fallbackTaskEnergy =
                              resolveEnergyLevel(task.energy) ??
                              resolveEnergyLevel(project.energy) ??
                              'NO'
                            const energyLevel: FlameLevel = fallbackTaskEnergy
                            const pendingStatus =
                              kind === 'scheduled' && instanceId
                                ? pendingInstanceStatuses.get(instanceId)
                                : undefined
                            const scheduledIsPending = pendingStatus !== undefined
                            const status =
                              kind === 'scheduled' && instanceId
                                ? pendingStatus ??
                                  instanceStatusById[instanceId] ??
                                  'scheduled'
                                : null
                            const scheduledCanToggle =
                              kind === 'scheduled' &&
                              !!instanceId &&
                              (status === 'completed' || status === 'scheduled')
                            const scheduledCompleted = status === 'completed'
                            const canToggle = isFallbackCard ? true : scheduledCanToggle
                            const isPending = isFallbackCard
                              ? fallbackPending
                              : scheduledIsPending
                            const isCompleted = isFallbackCard
                              ? fallbackCompleted
                              : scheduledCompleted
                            const cardClasses = `${baseTaskClasses} ${
                              isCompleted
                                ? completedTaskClasses
                                : isFallbackCard
                                  ? fallbackTaskClasses
                                  : shinyTaskClasses
                            }`
                            const progressValue =
                              kind === 'scheduled'
                                ? Math.max(
                                    0,
                                    Math.min(
                                      100,
                                      (task as { progress?: number }).progress ?? 0
                                    )
                                  )
                                : isCompleted
                                  ? 100
                                  : 0
                            const progressBarClass = isCompleted
                              ? 'absolute left-0 bottom-0 h-[3px] bg-emerald-300/80'
                              : kind === 'scheduled'
                                ? 'absolute left-0 bottom-0 h-[3px] bg-white/40'
                                : 'absolute left-0 bottom-0 h-[3px] bg-white/25'
                            const hasInteractiveRole =
                              isFallbackCard || (kind === 'scheduled' && !!instanceId)
                            const taskLongPressActive =
                              kind === 'scheduled' && instanceId
                                ? longPressBounceId === instanceId
                                : false

                            const hideForEdit = Boolean(
                              isEditSheetOpen &&
                                editInstanceId &&
                                instanceId &&
                                editInstanceId === instanceId &&
                                !editingProjectId &&
                                !editingHabitId
                            )

                            if (hideForEdit) {
                              return null
                            }

                            const nestedLayoutTokens =
                              kind === 'scheduled' && instanceId
                                ? scheduleInstanceLayoutTokens(
                                    getScheduleInstanceLayoutId(instanceId)
                                  )
                                : null

                            const handleTaskCardPrimaryAction = () => {
                              if (isFallbackCard) {
                                if (!canToggle || isPending) return
                                handleToggleBacklogTaskCompletion(task.id)
                                return
                              }
                              if (!instanceId) return
                              if (!canToggle || isPending) return
                              const nextStatus = isCompleted
                                ? 'scheduled'
                                : 'completed'
                              void handleToggleInstanceCompletion(
                                instanceId,
                                nextStatus
                              )
                            }

                              return (
                                <motion.div
                                key={key}
                                layout={instanceId ? 'position' : false}
                                layoutId={nestedLayoutTokens?.card}
                                data-schedule-instance-id={
                                  kind === 'scheduled' && instanceId ? instanceId : undefined
                                }
                                data-backlog-task-id={
                                  isFallbackCard ? task.id : undefined
                                }
                                aria-label={`Task ${task.name}`}
                                role={hasInteractiveRole ? 'button' : undefined}
                                tabIndex={canToggle ? 0 : -1}
                                aria-pressed={
                                  hasInteractiveRole ? isCompleted : undefined
                                }
                                aria-disabled={
                                  hasInteractiveRole ? !canToggle || isPending : undefined
                                }
                                data-completed={isCompleted ? 'true' : 'false'}
                                className={`${cardClasses}${
                                  canToggle && !isPending ? ' cursor-pointer' : ''
                                }`}
                                style={tStyle}
                                onPointerDown={event => {
                                  if (!instanceId) return
                                  handleInstancePointerDown(event, instanceId, handleTaskCardPrimaryAction)
                                }}
                                onPointerUp={handleInstancePointerUp}
                                onPointerCancel={handleInstancePointerCancel}
                                onClick={() => {
                                  if (shouldBlockClickFromLongPress()) return
                                  handleTaskCardPrimaryAction()
                                }}
                                onKeyDown={event => {
                                  if (event.key !== 'Enter' && event.key !== ' ') {
                                    return
                                  }
                                  event.preventDefault()
                                  if (isFallbackCard) {
                                    if (!canToggle || isPending) return
                                    handleToggleBacklogTaskCompletion(task.id)
                                    return
                                  }
                                  if (!instanceId) return
                                  if (!canToggle || isPending) return
                                  const nextStatus = isCompleted
                                    ? 'scheduled'
                                    : 'completed'
                                  void handleToggleInstanceCompletion(
                                    instanceId,
                                    nextStatus
                                  )
                                }}
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
                                        scale: taskLongPressActive ? 1.03 : 1,
                                        transition: {
                                          duration: 0.18,
                                          ease: [0.4, 0, 0.2, 1],
                                          scale: {
                                            delay: 0,
                                            type: 'spring',
                                            stiffness: 500,
                                            damping: 30,
                                          },
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
                                <div className="flex flex-col">
                                  <motion.span
                                    layoutId={nestedLayoutTokens?.title}
                                    className={taskTitleClass}
                                  >
                                    {task.name}
                                  </motion.span>
                                </div>
                                <SkillEnergyBadge
                                  energyLevel={energyLevel}
                                  skillIcon={task.skill_icon}
                                  className="pointer-events-none absolute -top-1 -right-1 flex items-center gap-1 rounded-full bg-zinc-950/70 px-1.5 py-[1px]"
                                  iconClassName="text-base leading-none"
                                  flameClassName="drop-shadow-[0_0_6px_rgba(0,0,0,0.45)]"
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
                          </AnimatePresence>
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
            <AnimatePresence initial={false}>
              {modelStandaloneTaskInstances.map(({ instance, task, start, end }) => {
                if (!isValidDate(start) || !isValidDate(end)) return null
                const startMin = getDayMinuteOffset(start)
                const startOffsetMinutes = startMin - modelStartHour * 60
                const durationMinutes = Math.max(
                  0,
                  (end.getTime() - start.getTime()) / 60000
                )
                const progress = (task as { progress?: number }).progress ?? 0
                const standaloneEnergyLevel: FlameLevel =
                  resolveEnergyLevel(task.energy) ?? 'NO'
                const pendingStatus = pendingInstanceStatuses.get(instance.id)
                const isPending = pendingStatus !== undefined
                const status = pendingStatus ?? instance.status ?? 'scheduled'
                const canToggle =
                  status === 'completed' || status === 'scheduled'
                const isCompleted = status === 'completed'
                const standaloneHeightPx = Math.max(durationMinutes * modelPxPerMin, 0)
                const useCompactStandaloneShadow =
                  standaloneHeightPx <= TIMELINE_COMPACT_CARD_HEIGHT_PX
                const baseStandaloneShadow = useCompactStandaloneShadow
                  ? TIMELINE_COMPACT_CARD_SHADOW
                  : 'var(--elev-card)'
                const completedStandaloneShadow = useCompactStandaloneShadow
                  ? TIMELINE_COMPACT_CARD_COMPLETED_SHADOW
                  : '0 22px 42px rgba(4, 47, 39, 0.55)'
                const style: CSSProperties = {
                  ...TIMELINE_CARD_BOUNDS,
                  top: toTimelinePosition(startOffsetMinutes),
                  height: toTimelinePosition(durationMinutes),
                  boxShadow: isCompleted
                    ? completedStandaloneShadow
                    : baseStandaloneShadow,
                  outline: '1px solid var(--event-border)',
                  outlineOffset: '-1px',
                }
                const stackingZIndex = computeTimelineStackingIndex(startOffsetMinutes)
                const layeredStyle = { ...style, zIndex: stackingZIndex }
                const shouldWrapStandaloneTitle = Number(durationMinutes) >= 30
                const standaloneTitleClass = shouldWrapStandaloneTitle
                  ? 'text-sm font-medium leading-tight line-clamp-2 sm:line-clamp-1 sm:truncate'
                  : 'text-sm font-medium leading-tight truncate'
              const standaloneBaseClass =
                'absolute flex items-center justify-between rounded-[var(--schedule-instance-radius)] px-3 py-2'
              const standaloneScheduledClass =
                `${standaloneBaseClass} text-zinc-900 shadow-[0_12px_28px_rgba(24,24,27,0.35)] ring-1 ring-white/60 bg-[linear-gradient(135deg,_rgba(255,255,255,0.95)_0%,_rgba(229,231,235,0.92)_45%,_rgba(148,163,184,0.88)_100%)]`
              const standaloneCompletedClass =
                `${standaloneBaseClass} text-emerald-50 shadow-[0_22px_42px_rgba(4,47,39,0.55)] ring-1 ring-emerald-300/60 bg-[linear-gradient(135deg,_rgba(6,78,59,0.96)_0%,_rgba(4,120,87,0.94)_42%,_rgba(16,185,129,0.9)_100%)]`
              const standaloneClassName = [
                isCompleted ? standaloneCompletedClass : standaloneScheduledClass,
                canToggle && !isPending ? 'cursor-pointer' : '',
              ]
                  .filter(Boolean)
                  .join(' ')
                const standaloneLongPressActive = longPressBounceId === instance.id

                const hideForEdit = Boolean(
                  isEditSheetOpen &&
                    editInstanceId &&
                    editInstanceId === instance.id &&
                    !editingProjectId &&
                    !editingHabitId
                )

                const instanceLayoutId = getScheduleInstanceLayoutId(instance.id)
                const layoutTokens = scheduleInstanceLayoutTokens(instanceLayoutId)

                if (hideForEdit) {
                  return null
                }

                const handleStandaloneTaskPrimaryAction = () => {
                  if (!canToggle || isPending) return
                  const nextStatus = isCompleted ? 'scheduled' : 'completed'
                  void handleToggleInstanceCompletion(instance.id, nextStatus)
                }

                return (
                  <motion.div
                    key={instance.id}
                    layout="position"
                    layoutId={layoutTokens.card}
                    data-schedule-instance-id={instance.id}
                    aria-label={`Task ${task.name}`}
                    role="button"
                    tabIndex={canToggle ? 0 : -1}
                    aria-pressed={isCompleted}
                  aria-disabled={!canToggle || isPending}
                  data-completed={isCompleted ? 'true' : 'false'}
                  className={standaloneClassName}
                  style={layeredStyle}
                  onPointerDown={event => {
                    handleInstancePointerDown(event, instance.id, handleStandaloneTaskPrimaryAction)
                  }}
                  onPointerUp={handleInstancePointerUp}
                  onPointerCancel={handleInstancePointerCancel}
                  onClick={() => {
                    if (shouldBlockClickFromLongPress()) return
                    handleStandaloneTaskPrimaryAction()
                  }}
                  onKeyDown={event => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                      return
                    }
                    event.preventDefault()
                    if (!canToggle || isPending) return
                    const nextStatus = isCompleted ? 'scheduled' : 'completed'
                    void handleToggleInstanceCompletion(instance.id, nextStatus)
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
                          scale: standaloneLongPressActive ? 1.03 : 1,
                        }
                  }
                  exit={
                    prefersReducedMotion ? undefined : { opacity: 0, y: 4 }
                  }
                >
                  <div className="flex flex-col">
                    <motion.span
                      layoutId={layoutTokens.title}
                      className={standaloneTitleClass}
                    >
                      {task.name}
                    </motion.span>
                    <motion.div
                      layoutId={layoutTokens.meta}
                      className={
                        isCompleted
                          ? 'text-xs text-emerald-100/80'
                          : 'text-xs text-zinc-700/80'
                      }
                    >
                      {Math.round((end.getTime() - start.getTime()) / 60000)}m
                    </motion.div>
                  </div>
                  <SkillEnergyBadge
                    energyLevel={standaloneEnergyLevel}
                    skillIcon={task.skill_icon}
                    className="pointer-events-none absolute -top-1 -right-1 flex items-center gap-1 rounded-full bg-zinc-950/70 px-1.5 py-[1px]"
                    iconClassName="text-base leading-none"
                    flameClassName="drop-shadow-[0_0_6px_rgba(0,0,0,0.45)]"
                  />
                  <div
                    className={
                      isCompleted
                        ? 'absolute left-0 bottom-0 h-[3px] bg-emerald-300/80'
                        : 'absolute left-0 bottom-0 h-[3px] bg-zinc-900/25'
                    }
                    style={{ width: `${progress}%` }}
                  />
                </motion.div>
                )
              })}
            </AnimatePresence>
          </DayTimeline>
        </div>
      )
    },
      [
        pxPerMin,
        animatedPxPerMin,
        prefersReducedMotion,
        hasInteractedWithProjects,
        setProjectExpansion,
        expandedProjects,
        pendingInstanceStatuses,
        pendingBacklogTaskIds,
        projectGoalRelations,
        getHabitCompletionStatus,
        handleToggleInstanceCompletion,
        handleToggleBacklogTaskCompletion,
        instanceStatusById,
        handleHabitCardActivation,
        handleInstancePointerDown,
        handleInstancePointerUp,
        handleInstancePointerCancel,
        shouldBlockClickFromLongPress,
        longPressBounceId,
        isEditSheetOpen,
        editInstanceId,
        editingProjectId,
        editingHabitId,
      ]
    )

  const dayTimelineNode = useMemo(
    () =>
      renderDayTimeline(dayTimelineModel, {
        containerRef: dayTimelineContainerRef,
        fullBleed: true,
      }),
    [renderDayTimeline, dayTimelineModel]
  )

  useEffect(() => {
    if (view !== 'day') {
      swipeScrollProgressRef.current = null
      return
    }
    if (typeof window === 'undefined') return
    const snapshot = swipeScrollProgressRef.current
    if (snapshot === null) return

    let frame = 0
    let attempts = 0
    const maxAttempts = 12

    const applyScroll = () => {
      const container = dayTimelineContainerRef.current
      if (!container) {
        if (attempts < maxAttempts) {
          attempts += 1
          frame = requestAnimationFrame(applyScroll)
          return
        }
        swipeScrollProgressRef.current = null
        return
      }
      const height = container.offsetHeight
      if (!(height > 0)) {
        if (attempts < maxAttempts) {
          attempts += 1
          frame = requestAnimationFrame(applyScroll)
          return
        }
        swipeScrollProgressRef.current = null
        return
      }

      const clampedProgress = Math.min(Math.max(snapshot, 0), 1)
      const viewportHeightRaw =
        window.visualViewport?.height ?? window.innerHeight ?? 0
      const viewportHeight = Number.isFinite(viewportHeightRaw)
        ? viewportHeightRaw
        : 0
      const anchorOffset = viewportHeight > 0 ? viewportHeight / 2 : 0
      const rect = container.getBoundingClientRect()
      const scrollY = window.scrollY ?? window.pageYOffset ?? 0
      const containerTop = rect.top + scrollY
      const targetRelative = clampedProgress * height
      let targetScroll = containerTop + targetRelative - anchorOffset
      if (!Number.isFinite(targetScroll)) {
        swipeScrollProgressRef.current = null
        return
      }
      if (targetScroll < 0) targetScroll = 0
      const doc = typeof document !== 'undefined' ? document.documentElement : null
      if (doc) {
        const maxScroll = doc.scrollHeight - viewportHeight
        if (Number.isFinite(maxScroll)) {
          targetScroll = Math.min(targetScroll, Math.max(0, maxScroll))
        }
      }
      window.scrollTo({ top: targetScroll, behavior: 'auto' })
      swipeScrollProgressRef.current = null
    }

    frame = requestAnimationFrame(applyScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [view, dayTimelineModel.dayViewDateKey])

  useEffect(() => {
    if (!focusInstanceId) return
    const raf = requestAnimationFrame(() => {
      const escapeId = (value: string) => {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
          return CSS.escape(value)
        }
        return value.replace(/"/g, '\\"')
      }
      const target = document.querySelector<HTMLElement>(
        `[data-schedule-instance-id="${escapeId(focusInstanceId)}"]`
      )
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      setFocusInstanceId(null)
    })
    return () => cancelAnimationFrame(raf)
  }, [focusInstanceId, dayTimelineModel.dayViewDateKey])

  return (
    <LayoutGroup id="schedule-shared-layout">
      <ProtectedRoute>
        <ScheduleTopBar
          year={year}
          onBack={handleBack}
          onToday={handleToday}
          onOpenJumpToDate={() => setIsJumpToDateOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
        onReschedule={handleRescheduleClick}
        canReschedule={!isScheduling}
        isRescheduling={isScheduling}
        onOpenModes={() => setIsModeSheetOpen(true)}
        modeLabel={modeLabel}
        modeIsActive={modeIsActive}
        onHeightChange={setTopBarHeight}
      />
        <div
          className="text-zinc-100 space-y-4"
          style={{ paddingTop: scheduleContentPaddingTop }}
        >
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
          <AnimatePresence mode="wait" initial={false}>
            {view === 'day' && (
              <ScheduleViewShell key="day">
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
                      containerRef={dayTimelineContainerRef}
                      previousModel={peekModels.previous}
                      nextModel={peekModels.next}
                      renderPreview={renderDayTimeline}
                      scrollProgress={swipeScrollProgressRef.current}
                      baseTimelineHeight={baseTimelineHeight}
                      timelineChromeHeight={timelineChromeHeight}
                      pxPerMin={pxPerMin}
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
      <MemoNoteSheet
        open={Boolean(memoNoteState)}
        habitName={memoNoteState?.habitName ?? ''}
        skillId={memoNoteState?.skillId ?? null}
        saving={memoNoteSaving}
        error={memoNoteError}
        onClose={handleCloseMemoSheet}
        onSubmit={handleMemoSave}
      />
      <JumpToDateSheet
        open={isJumpToDateOpen}
        onOpenChange={open => setIsJumpToDateOpen(open)}
        currentDate={currentDate}
        timeZone={localTimeZone}
        onSelectDate={handleJumpToDateSelect}
      />
      <ScheduleSearchSheet
        open={isSearchOpen}
        onOpenChange={open => setIsSearchOpen(open)}
        instances={instances}
        taskMap={taskMap}
        projectMap={projectMap}
        onSelectResult={handleSearchResultSelect}
      />
      <SchedulerModeSheet
        open={isModeSheetOpen}
        onOpenChange={setIsModeSheetOpen}
        modeType={modeType}
        onModeTypeChange={handleModeTypeChange}
        monumentId={modeMonumentId}
        onMonumentChange={handleMonumentChange}
        skillIds={modeSkillIds}
        onSkillToggle={handleSkillToggle}
        onClearSkills={handleClearSkills}
        monuments={monuments}
        skills={skills}
      />
      <ProjectEditSheet
        open={isEditSheetOpen && Boolean(editingProjectId)}
        projectId={editingProjectId}
        eventTitle={editingEventTitle}
        eventTypeLabel={editingEventTypeLabel}
        timeRangeLabel={editingTimeRangeLabel}
        origin={editOrigin}
        layoutId={editingLayoutId}
        onClose={handleCloseEditSheet}
        onSaved={refreshScheduleData}
      />
      <HabitEditSheet
        open={isEditSheetOpen && Boolean(editingHabitId)}
        habitId={editingHabitId}
        eventTitle={editingEventTitle}
        eventTypeLabel={editingEventTypeLabel}
        timeRangeLabel={editingTimeRangeLabel}
        origin={editOrigin}
        layoutId={editingLayoutId}
        onClose={handleCloseEditSheet}
        onSaved={refreshScheduleData}
      />
    </LayoutGroup>
  )
}
