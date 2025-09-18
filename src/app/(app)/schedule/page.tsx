"use client"

export const runtime = 'nodejs'

import {
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
  placeByEnergyWeight,
  type WindowLite as PlacerWindow,
} from '@/lib/scheduler/placer'
import { TaskLite, ProjectLite, taskWeight } from '@/lib/scheduler/weight'
import { buildProjectItems } from '@/lib/scheduler/projects'
import { windowRect } from '@/lib/scheduler/windowRect'
import { ENERGY } from '@/lib/scheduler/config'

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

const isoDateKey = (date: Date) => date.toISOString().slice(0, 10)

function shallowEqualAssignments(
  a: Record<string, string>,
  b: Record<string, string>,
) {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

type UnplacedReason = ReturnType<
  typeof placeByEnergyWeight
>['unplaced'][number]['reason']

export default function SchedulePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const prefersReducedMotion = useReducedMotion()

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
  const [placements, setPlacements] = useState<
    ReturnType<typeof placeByEnergyWeight>['placements']
  >([])
  const [unplacedReasons, setUnplacedReasons] = useState<
    Record<string, UnplacedReason>
  >({})
  const [projectAssignments, setProjectAssignments] = useState<
    Record<string, string>
  >({})
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const touchStartX = useRef<number | null>(null)
  const navLock = useRef(false)

  const startHour = 0
  const pxPerMin = 2
  const year = currentDate.getFullYear()

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('view', view)
    params.set('date', isoDateKey(currentDate))
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


  const weightedTasks = useMemo(
    () => tasks.map(t => ({ ...t, weight: taskWeight(t) })),
    [tasks]
  )

  const projectItems = useMemo(
    () => buildProjectItems(projects, tasks),
    [projects, tasks]
  )

  const taskMap = useMemo(() => {
    const map: Record<string, typeof weightedTasks[number]> = {}
    for (const t of weightedTasks) map[t.id] = t
    return map
  }, [weightedTasks])

  const projectMap = useMemo(() => {
    const map: Record<string, typeof projectItems[number]> = {}
    for (const p of projectItems) map[p.id] = p
    return map
  }, [projectItems])

  const unplacedList = useMemo(
    () =>
      Object.entries(unplacedReasons).map(([taskId, reason]) => ({
        taskId,
        reason,
      })),
    [unplacedReasons],
  )

  const dayEnergies = useMemo(() => {
    const map: Record<string, FlameLevel> = {}
    for (const p of placements) {
      const key = isoDateKey(p.start)
      const item = projectMap[p.taskId]
      const level = (item?.energy?.toUpperCase() as FlameLevel) || 'NO'
      const current = map[key]
      if (!current || ENERGY.LIST.indexOf(level) > ENERGY.LIST.indexOf(current)) {
        map[key] = level
      }
    }
    return map
  }, [placements, projectMap])

  const taskPlacementsByProject = useMemo(() => {
    const map: Record<string, ReturnType<typeof placeByEnergyWeight>['placements']> = {}
    for (const p of placements) {
      const tasksForProj = weightedTasks.filter(t => t.project_id === p.taskId)
      if (tasksForProj.length === 0) continue
      const proj = projectMap[p.taskId]
      const win: PlacerWindow = {
        id: p.taskId,
        label: proj?.name ?? '',
        energy: proj?.energy ?? '',
        start_local: p.start.toTimeString().slice(0, 5),
        end_local: p.end.toTimeString().slice(0, 5),
      }
      map[p.taskId] = placeByEnergyWeight(tasksForProj, [win], p.start).placements
    }
    return map
  }, [placements, weightedTasks, projectMap])

  function navigate(next: ScheduleView) {
    if (navLock.current) return
    navLock.current = true
    setView(next)
    setTimeout(() => {
      navLock.current = false
    }, 300)
  }

  function handleBack() {
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
    function run() {
      const dateKey = isoDateKey(currentDate)
      const todayKey = isoDateKey(new Date())
      const validProjectIds = new Set(projectItems.map(p => p.id))

      const baseAssignments: Record<string, string> = {}
      for (const [projectId, assignedDate] of Object.entries(projectAssignments)) {
        if (!validProjectIds.has(projectId)) continue
        if (assignedDate < todayKey) continue
        baseAssignments[projectId] = assignedDate
      }

      const cleanedUnplaced: Record<string, UnplacedReason> = {}
      for (const [projectId, reason] of Object.entries(unplacedReasons)) {
        if (!validProjectIds.has(projectId)) continue
        const assigned = baseAssignments[projectId]
        if (assigned && assigned !== dateKey) continue
        cleanedUnplaced[projectId] = reason
      }

      if (windows.length === 0) {
        if (!shallowEqualAssignments(projectAssignments, baseAssignments)) {
          setProjectAssignments(baseAssignments)
        }
        if (!shallowEqualAssignments(unplacedReasons, cleanedUnplaced)) {
          setUnplacedReasons(cleanedUnplaced)
        }
        return
      }

      const eligibleProjects = projectItems.filter(item => {
        const assigned = baseAssignments[item.id]
        return !assigned || assigned === dateKey
      })

      const projResult = placeByEnergyWeight(eligibleProjects, windows, currentDate)
      setPlacements(projResult.placements)

      const updatedAssignments: Record<string, string> = { ...baseAssignments }
      for (const placement of projResult.placements) {
        updatedAssignments[placement.taskId] = dateKey
      }

      const nextUnplaced: Record<string, UnplacedReason> = { ...cleanedUnplaced }
      for (const entry of projResult.unplaced) {
        const assigned = updatedAssignments[entry.taskId]
        if (assigned && assigned !== dateKey) continue
        nextUnplaced[entry.taskId] = entry.reason as UnplacedReason
      }

      if (!shallowEqualAssignments(unplacedReasons, nextUnplaced)) {
        setUnplacedReasons(nextUnplaced)
      }

      if (!shallowEqualAssignments(projectAssignments, updatedAssignments)) {
        setProjectAssignments(updatedAssignments)
      }
    }
    run()
    const id = setInterval(run, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [
    projectItems,
    windows,
    currentDate,
    projectAssignments,
    unplacedReasons,
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
          canGoBack={view !== 'year'}
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
                  {placements.map((p, i) => {
                    const item = projectMap[p.taskId]
                    if (!item) return null
                    const startMin =
                      p.start.getHours() * 60 + p.start.getMinutes()
                    const top = (startMin - startHour * 60) * pxPerMin
                    const height =
                      ((p.end.getTime() - p.start.getTime()) / 60000) * pxPerMin
                    const isExpanded = expandedProjects.has(p.taskId)
                    const taskPs = taskPlacementsByProject[p.taskId] || []
                    const style: CSSProperties = {
                      top,
                      height,
                      boxShadow: 'var(--elev-card)',
                      outline: '1px solid var(--event-border)',
                      outlineOffset: '-1px',
                    }
                    return (
                      <AnimatePresence key={p.taskId} initial={false}>
                        {!isExpanded || taskPs.length === 0 ? (
                          <motion.div
                            key="project"
                            aria-label={`Project ${item.name}`}
                            onClick={() => {
                              if (taskPs.length === 0) return
                              setExpandedProjects(prev => {
                                const next = new Set(prev)
                                if (next.has(p.taskId)) next.delete(p.taskId)
                                else next.add(p.taskId)
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
                              prefersReducedMotion ? undefined : { delay: i * 0.02 }
                            }
                          >
                            <div className="flex flex-col">
                              <span className="truncate text-sm font-medium">
                                {item.name}
                              </span>
                              <div className="text-xs text-zinc-200/70">
                                {item.duration_min}m
                                {"taskCount" in item && (
                                  <span> · {item.taskCount} tasks</span>
                                )}
                              </div>
                            </div>
                            {item.skill_icon && (
                              <span
                                className="ml-2 text-lg leading-none flex-shrink-0"
                                aria-hidden
                              >
                                {item.skill_icon}
                              </span>
                            )}
                            <FlameEmber
                              level={(item.energy as FlameLevel) || "NO"}
                              size="sm"
                              className="absolute -top-1 -right-1"
                            />
                          </motion.div>
                        ) : (
                          taskPs.map(tp => {
                            const tItem = taskMap[tp.taskId]
                            if (!tItem) return null
                            const tStartMin =
                              tp.start.getHours() * 60 + tp.start.getMinutes()
                            const tTop = (tStartMin - startHour * 60) * pxPerMin
                            const tHeight =
                              ((tp.end.getTime() - tp.start.getTime()) / 60000) * pxPerMin
                            const tStyle: CSSProperties = {
                              top: tTop,
                              height: tHeight,
                              boxShadow: 'var(--elev-card)',
                              outline: '1px solid var(--event-border)',
                              outlineOffset: '-1px',
                            }
                            const progress =
                              (tItem as { progress?: number }).progress ?? 0
                            return (
                              <motion.div
                                key={tp.taskId}
                                aria-label={`Task ${tItem.name}`}
                                className="absolute left-16 right-2 flex items-center justify-between rounded-[var(--radius-lg)] bg-stone-700 px-3 py-2 text-white"
                                style={tStyle}
                                onClick={() =>
                                  setExpandedProjects(prev => {
                                    const next = new Set(prev)
                                    next.delete(p.taskId)
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
                                <div className="flex flex-col">
                                  <span className="truncate text-sm font-medium">
                                    {tItem.name}
                                  </span>
                                  <div className="text-xs text-zinc-200/70">
                                    {tItem.duration_min}m
                                  </div>
                                </div>
                                {tItem.skill_icon && (
                                  <span
                                    className="ml-2 text-lg leading-none flex-shrink-0"
                                    aria-hidden
                                  >
                                    {tItem.skill_icon}
                                  </span>
                                )}
                                <FlameEmber
                                  level={(tItem.energy as FlameLevel) || "NO"}
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

        {unplacedList.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-200">Unplaced</h2>
            <ul className="space-y-2">
              {unplacedList.map(u => {
                const item = projectMap[u.taskId]
                const reason =
                  u.reason === 'no-window'
                    ? 'No window fits'
                    : 'No slot available'
                return (
                  <li
                    key={u.taskId}
                    aria-label={`Project ${item?.name ?? u.taskId} unplaced: ${reason}`}
                    className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-800 p-3 text-sm text-white"
                  >
                    <span>{item?.name ?? u.taskId}</span>
                    <span className="text-zinc-400">{reason}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
