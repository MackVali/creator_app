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
  updateInstanceStatus,
  type ScheduleInstance,
} from '@/lib/scheduler/instanceRepo'
import { TaskLite, ProjectLite } from '@/lib/scheduler/weight'
import { buildProjectItems } from '@/lib/scheduler/projects'
import { windowRect } from '@/lib/scheduler/windowRect'
import { ENERGY } from '@/lib/scheduler/config'
import { toLocal } from '@/lib/time/tz'

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
  const [metaStatus, setMetaStatus] = useState<LoadStatus>('idle')
  const [instancesStatus, setInstancesStatus] = useState<LoadStatus>('idle')
  const [pendingInstanceIds, setPendingInstanceIds] = useState<Set<string>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const touchStartX = useRef<number | null>(null)
  const navLock = useRef(false)
  const loadInstancesRef = useRef<() => Promise<void>>(async () => {})
  const isSchedulingRef = useRef(false)
  const autoScheduledForRef = useRef<string | null>(null)

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
    if (!userId) {
      setWindows([])
      setTasks([])
      setProjects([])
      setMetaStatus('idle')
      return
    }

    let active = true
    setMetaStatus('loading')

    async function load() {
      try {
        const [ws, ts, pm] = await Promise.all([
          fetchWindowsForDate(currentDate),
          fetchReadyTasks(),
          fetchProjectsMap(),
        ])
        if (!active) return
        setWindows(ws)
        setTasks(ts)
        setProjects(Object.values(pm))
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
  }, [instances, projectMap, projectItems])

  const projectInstanceIds = useMemo(() => {
    const set = new Set<string>()
    for (const item of projectInstances) {
      set.add(item.project.id)
    }
    return set
  }, [projectInstances])

  const taskInstancesByProject = useMemo(() => {
    const map: Record<
      string,
      Array<{ instance: ScheduleInstance; task: TaskLite; start: Date; end: Date }>
    > = {}
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
    const items: Array<{
      instance: ScheduleInstance
      task: TaskLite
      start: Date
      end: Date
    }> = []
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
      if (!response.ok) {
        let payload: unknown = null
        try {
          payload = await response.json()
        } catch (err) {
          console.error('Failed to parse scheduler response', err)
        }
        console.error('Scheduler run failed', response.status, payload)
      }
    } catch (error) {
      console.error('Failed to run scheduler', error)
    } finally {
      isSchedulingRef.current = false
      try {
        await loadInstancesRef.current()
      } catch (error) {
        console.error('Failed to reload schedule instances', error)
      }
    }
  }, [userId])

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
                  {projectInstances.map(({ instance, project, start, end }, index) => {
                    const projectId = project.id
                    const startMin = start.getHours() * 60 + start.getMinutes()
                    const top = (startMin - startHour * 60) * pxPerMin
                    const height =
                      ((end.getTime() - start.getTime()) / 60000) * pxPerMin
                    const isExpanded = expandedProjects.has(projectId)
                    const tasksForProject = taskInstancesByProject[projectId] || []
                    const style: CSSProperties = {
                      top,
                      height,
                      boxShadow: 'var(--elev-card)',
                      outline: '1px solid var(--event-border)',
                      outlineOffset: '-1px',
                    }
                    return (
                      <AnimatePresence key={instance.id} initial={false}>
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
                            className="absolute left-16 right-2 flex items-center justify-between rounded-[var(--radius-lg)] bg-[var(--event-bg)] px-3 py-2 text-white relative"
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
                          tasksForProject.map(taskInfo => {
                            const { instance: taskInstance, task, start, end } = taskInfo
                            const tStartMin = start.getHours() * 60 + start.getMinutes()
                            const tTop = (tStartMin - startHour * 60) * pxPerMin
                            const tHeight =
                              ((end.getTime() - start.getTime()) / 60000) * pxPerMin
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
                            className="absolute left-16 right-2 flex items-center justify-between rounded-[var(--radius-lg)] bg-stone-700 px-3 py-2 text-white relative"
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
                                    {Math.round(
                                      (end.getTime() - start.getTime()) / 60000
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
                          })
                        )}
                      </AnimatePresence>
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
                        className="absolute left-16 right-2 flex items-center justify-between rounded-[var(--radius-lg)] bg-stone-700 px-3 py-2 text-white relative"
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
                <FocusTimeline />
              </ScheduleViewShell>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ProtectedRoute>
  )
}
