"use client"

export const runtime = 'nodejs'

import {
  useEffect,
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
import EnergyPager from '@/components/schedule/EnergyPager'
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
  const [unplaced, setUnplaced] = useState<
    ReturnType<typeof placeByEnergyWeight>['unplaced']
  >([])
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
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

  const dayEnergies = useMemo(() => {
    const map: Record<string, FlameLevel> = {}
    for (const p of placements) {
      const key = p.start.toISOString().slice(0, 10)
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
      if (windows.length === 0) return
      const date = currentDate
      const projResult = placeByEnergyWeight(projectItems, windows, date)
      setPlacements(projResult.placements)
      setUnplaced(projResult.unplaced)
    }
    run()
    const id = setInterval(run, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [projectItems, windows, currentDate])

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

  function formatFullDate(d: Date) {
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
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
        <p className="text-sm text-muted-foreground">Plan and manage your time</p>

        <div className="space-y-2">
          <EnergyPager
            activeIndex={{ year: 0, month: 1, day: 2, focus: 3 }[view]}
            className="justify-center"
          />
        </div>

        <div className="text-center text-sm text-gray-200">
          {formatFullDate(view === 'focus' ? new Date() : currentDate)}
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
                    return (
                      <div
                        key={w.id}
                        aria-label={w.label}
                        className="absolute left-0 flex"
                        style={{ top, height }}
                      >
                        <div className="w-0.5 bg-zinc-700 opacity-50" />
                        <span
                          className="ml-1 text-[10px] text-zinc-500"
                          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                        >
                          {w.label}
                        </span>
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

        {unplaced.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-200">Unplaced</h2>
            <ul className="space-y-2">
              {unplaced.map(u => {
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
