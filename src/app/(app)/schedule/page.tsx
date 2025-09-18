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
import { fetchInstancesForRange, type ScheduleInstance } from '@/lib/scheduler/instanceRepo'
import { TaskLite, ProjectLite, taskWeight } from '@/lib/scheduler/weight'
import { buildProjectItems } from '@/lib/scheduler/projects'
import { windowRect } from '@/lib/scheduler/windowRect'
import { ENERGY } from '@/lib/scheduler/config'
import { toLocal } from '@/lib/time/tz'
import { getSupabaseBrowser } from '@/lib/supabase'

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

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
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
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [instancesRefreshToken, setInstancesRefreshToken] = useState(0)
  const [isRunningScheduler, setIsRunningScheduler] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [lastRunSummary, setLastRunSummary] = useState<
    | { placed: number; failures: number; ranAt: Date }
    | null
  >(null)
  const touchStartX = useRef<number | null>(null)
  const navLock = useRef(false)

  const startHour = 0
  const pxPerMin = 2
  const year = currentDate.getFullYear()

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('view', view)
    params.set('date', currentDate.toISOString().slice(0, 10))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [view, currentDate, router, pathname])

  useEffect(() => {
    async function load() {
      try {
        const [ws, ts, pm] = await Promise.all([
          fetchWindowsForDate(currentDate),
          fetchReadyTasks(),
          fetchProjectsMap(),
        ])
        setWindows(ws)
        setTasks(ts)
        setProjects(Object.values(pm))
      } catch (e) {
        console.error(e)
        setWindows([])
        setTasks([])
        setProjects([])
      }
    }
    load()
  }, [currentDate])
  const projectItems = useMemo(
    () => buildProjectItems(projects, tasks),
    [projects, tasks]
  )

  const projectMap = useMemo(() => {
    const map: Record<string, typeof projectItems[number]> = {}
    for (const p of projectItems) map[p.id] = p
    return map
  }, [projectItems])

  const dayEnergies = useMemo(() => {
    const map: Record<string, FlameLevel> = {}
    for (const inst of instances) {
      const start = toLocal(inst.start_utc)
      const key = start.toISOString().slice(0, 10)
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
        }
      })
      .filter((value): value is {
        instance: ScheduleInstance
        project: typeof projectItems[number]
        start: Date
        end: Date
      } => value !== null)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
  }, [instances, projectMap])

  const tasksByProject = useMemo(() => {
    const map: Record<string, TaskLite[]> = {}
    for (const task of tasks) {
      const projectId = task.project_id
      if (!projectId) continue
      const bucket = map[projectId] ?? []
      bucket.push(task)
      map[projectId] = bucket
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => taskWeight(b) - taskWeight(a))
    }
    return map
  }, [tasks])

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
      return
    }
    let active = true
    const load = async () => {
      try {
        const start = startOfDay(currentDate)
        const end = endOfDay(currentDate)
        const { data, error } = await fetchInstancesForRange(
          userId,
          start.toISOString(),
          end.toISOString()
        )
        if (!active) return
        if (error) {
          console.error(error)
          setInstances([])
          return
        }
        setInstances(data ?? [])
      } catch (e) {
        if (!active) return
        console.error(e)
        setInstances([])
      }
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [userId, currentDate, instancesRefreshToken])

  const handleRunScheduler = useCallback(async () => {
    if (!userId) {
      setRunError('You must be signed in to run the scheduler.')
      return
    }

    setIsRunningScheduler(true)
    setRunError(null)
    setLastRunSummary(null)

    try {
      const supabase = getSupabaseBrowser()
      if (!supabase) {
        throw new Error('Supabase client not available in this environment.')
      }

      type SchedulerResponse = {
        placed?: unknown[]
        failures?: unknown[]
        error?: { message?: string } | string | null
      }

      const { data, error } = await supabase.functions.invoke<SchedulerResponse>(
        'scheduler_cron',
        {
          body: { userId },
        }
      )

      if (error) {
        throw new Error(error.message ?? 'Failed to invoke scheduler.')
      }

      if (data && typeof data === 'object' && 'error' in data && data.error) {
        const message =
          typeof data.error === 'string'
            ? data.error
            : data.error?.message ?? 'Scheduler reported an error.'
        throw new Error(message)
      }

      const placedCount = Array.isArray(data?.placed)
        ? (data?.placed as unknown[]).length
        : 0
      const failureCount = Array.isArray(data?.failures)
        ? (data?.failures as unknown[]).length
        : 0

      setLastRunSummary({
        placed: placedCount,
        failures: failureCount,
        ranAt: new Date(),
      })
      setInstancesRefreshToken(prev => prev + 1)
    } catch (err) {
      console.error('Failed to trigger scheduler', err)
      setRunError(err instanceof Error ? err.message : 'Unknown error.')
    } finally {
      setIsRunningScheduler(false)
    }
  }, [userId])

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
        <div className="px-4">
          <button
            type="button"
            onClick={handleRunScheduler}
            disabled={isRunningScheduler || !userId}
            className="rounded-md bg-[var(--accent-red)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition disabled:opacity-60"
          >
            {isRunningScheduler ? 'Running…' : 'Run Scheduler'}
          </button>
          {runError ? (
            <p className="mt-2 text-xs text-red-300" role="alert" aria-live="polite">
              Failed to run scheduler: {runError}
            </p>
          ) : lastRunSummary ? (
            <p className="mt-2 text-xs text-emerald-300" aria-live="polite">
              Scheduler ran at {lastRunSummary.ranAt.toLocaleTimeString()} · placed{' '}
              {lastRunSummary.placed} item{lastRunSummary.placed === 1 ? '' : 's'} and
              {' '}
              {lastRunSummary.failures} failure{lastRunSummary.failures === 1 ? '' : 's'}.
            </p>
          ) : (
            <p className="mt-2 text-xs text-zinc-400" aria-live="polite">
              Temporary dev control to trigger the auto-scheduler for the current account.
            </p>
          )}
        </div>
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
                  {projectInstances.map(({ instance, project, start, end }, index) => {
                    const projectId = project.id
                    const startMin = start.getHours() * 60 + start.getMinutes()
                    const top = (startMin - startHour * 60) * pxPerMin
                    const height =
                      ((end.getTime() - start.getTime()) / 60000) * pxPerMin
                    const isExpanded = expandedProjects.has(projectId)
                    const tasksForProject = tasksByProject[projectId] || []
                    const hasTasks = tasksForProject.length > 0
                    const style: CSSProperties = {
                      top,
                      height,
                      boxShadow: 'var(--elev-card)',
                      outline: '1px solid var(--event-border)',
                      outlineOffset: '-1px',
                    }
                    const toggleExpansion = () => {
                      if (!hasTasks) return
                      setExpandedProjects(prev => {
                        const next = new Set(prev)
                        if (next.has(projectId)) next.delete(projectId)
                        else next.add(projectId)
                        return next
                      })
                    }
                    return (
                      <AnimatePresence key={instance.id} initial={false}>
                        {!isExpanded || !hasTasks ? (
                          <motion.div
                            key="project"
                            aria-label={`Project ${project.name}`}
                            onClick={toggleExpansion}
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
                            <div className="flex flex-col">
                              <span className="truncate text-sm font-medium">
                                {project.name}
                              </span>
                              <div className="text-xs text-zinc-200/70">
                                {Math.round(
                                  (end.getTime() - start.getTime()) / 60000
                                )}
                                m
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
                            key="project-expanded"
                            aria-label={`Project ${project.name}`}
                            className="absolute left-16 right-2 flex h-full flex-col justify-start rounded-[var(--radius-lg)] bg-[var(--event-bg)] px-3 py-2 text-white"
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
                            transition={
                              prefersReducedMotion
                                ? undefined
                                : { delay: index * 0.02 }
                            }
                          >
                            <button
                              type="button"
                              onClick={toggleExpansion}
                              className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-left text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                            >
                              <div className="flex flex-col">
                                <span className="truncate text-sm font-medium">
                                  {project.name}
                                </span>
                                <div className="text-xs text-zinc-200/70">
                                  {Math.round(
                                    (end.getTime() - start.getTime()) / 60000
                                  )}
                                  m · {tasksForProject.length} tasks
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
                                className="ml-2"
                              />
                            </button>
                            <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
                              {tasksForProject.map((task, taskIndex) => {
                                const progress =
                                  (task as { progress?: number }).progress ?? 0
                                return (
                                  <motion.div
                                    key={task.id}
                                    className="relative flex items-center justify-between rounded-md bg-white/10 px-3 py-2"
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
                                    transition={
                                      prefersReducedMotion
                                        ? undefined
                                        : { delay: taskIndex * 0.02 }
                                    }
                                  >
                                    <div className="flex flex-col">
                                      <span className="truncate text-xs font-medium">
                                        {task.name}
                                      </span>
                                      <div className="text-[11px] text-zinc-100/70">
                                        {Math.max(1, Math.round(task.duration_min || 0))}m
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      {task.skill_icon && (
                                        <span
                                          className="text-lg leading-none"
                                          aria-hidden
                                        >
                                          {task.skill_icon}
                                        </span>
                                      )}
                                      <FlameEmber
                                        level={(task.energy as FlameLevel) || 'NO'}
                                        size="xs"
                                      />
                                    </div>
                                    <div
                                      className="absolute left-0 bottom-0 h-[2px] bg-white/40"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </motion.div>
                                )
                              })}
                              {tasksForProject.length === 0 && (
                                <div className="rounded-md bg-white/5 px-3 py-2 text-xs text-zinc-200/70">
                                  No tasks linked to this project yet.
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
      </div>
    </ProtectedRoute>
  )
}
