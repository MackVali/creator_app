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
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { DayTimeline } from '@/components/schedule/DayTimeline'
import { WeekView } from '@/components/schedule/WeekView'
import { FocusTimeline } from '@/components/schedule/FocusTimeline'
import FlameEmber, { FlameLevel } from '@/components/FlameEmber'
import { YearView } from '@/components/schedule/YearView'
import EnergyPager from '@/components/schedule/EnergyPager'
import { Button } from '@/components/ui/button'
import {
  fetchReadyTasks,
  fetchWindowsForDate,
  fetchProjectsMap,
  type WindowLite,
} from '@/lib/scheduler/repo'
import { placeByEnergyWeight } from '@/lib/scheduler/placer'
import { TaskLite, ProjectLite, taskWeight } from '@/lib/scheduler/weight'
import { buildProjectItems } from '@/lib/scheduler/projects'
import { windowRect } from '@/lib/scheduler/windowRect'
import { ENERGY, type Energy } from '@/lib/scheduler/config'

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
  const prefersReducedMotion = useReducedMotion()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week' | 'day' | 'focus'>('month')
  const [planning, setPlanning] = useState<'TASK' | 'PROJECT'>(() => {
    if (typeof window === 'undefined') return 'TASK'
    return (localStorage.getItem('planning-mode') as 'TASK' | 'PROJECT') || 'TASK'
  })
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [windows, setWindows] = useState<WindowLite[]>([])
  const [placements, setPlacements] = useState<
    ReturnType<typeof placeByEnergyWeight>['placements']
  >([])
  const [unplaced, setUnplaced] = useState<
    ReturnType<typeof placeByEnergyWeight>['unplaced']
  >([])
  const [dayEnergyMap, setDayEnergyMap] = useState<Record<string, FlameLevel>>({})
  const touchStartX = useRef<number | null>(null)

  const startHour = 0
  const pxPerMin = 2
  const year = currentDate.getFullYear()

  useEffect(() => {
    localStorage.setItem('planning-mode', planning)
  }, [planning])

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

  useEffect(() => {
    async function loadEnergies() {
      try {
        const base = new Date(year, 0, 1)
        const sunday = new Date(base)
        sunday.setDate(base.getDate() - base.getDay())
        const weekPromises: Promise<WindowLite[]>[] = []
        for (let i = 0; i < 7; i++) {
          const d = new Date(sunday)
          d.setDate(sunday.getDate() + i)
          weekPromises.push(fetchWindowsForDate(d))
        }
        const weekly = await Promise.all(weekPromises)
        const byDow: Record<number, WindowLite[]> = {}
        weekly.forEach((wins, i) => {
          byDow[i] = wins
        })
        const map: Record<string, FlameLevel> = {}
        for (let m = 0; m < 12; m++) {
          const days = new Date(year, m + 1, 0).getDate()
          for (let d = 1; d <= days; d++) {
            const date = new Date(year, m, d)
            const dow = date.getDay()
            const wins = byDow[dow] || []
            let top: FlameLevel = 'NO'
            for (const w of wins) {
              const e = (w.energy || 'NO').toUpperCase() as Energy
              if (ENERGY.LIST.indexOf(e) > ENERGY.LIST.indexOf(top as Energy)) {
                top = e as FlameLevel
              }
            }
            if (top !== 'NO') {
              map[date.toISOString().slice(0, 10)] = top
            }
          }
        }
        setDayEnergyMap(map)
      } catch (e) {
        console.error(e)
        setDayEnergyMap({})
      }
    }
    loadEnergies()
  }, [year])

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

  const getItem = (id: string) =>
    planning === 'TASK' ? taskMap[id] : projectMap[id]


  useEffect(() => {
    function run() {
      if (windows.length === 0) return
      const date = currentDate
      const result =
        planning === 'TASK'
          ? placeByEnergyWeight(weightedTasks, windows, date)
          : placeByEnergyWeight(projectItems, windows, date)
      setPlacements(result.placements)
      setUnplaced(result.unplaced)
    }
    run()
    const id = setInterval(run, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [planning, weightedTasks, projectItems, windows, currentDate])

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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <div className="flex gap-2">
            <Link href="/tasks">
              <Button
                size="sm"
                className="bg-gray-800 text-gray-100 hover:bg-gray-700"
              >
                Tasks
              </Button>
            </Link>
            <Link href="/schedule/draft">
              <Button
                size="sm"
                className="bg-gray-800 text-gray-100 hover:bg-gray-700"
              >
                Draft
              </Button>
            </Link>
            <Link href="/windows">
              <Button
                size="sm"
                className="bg-gray-800 text-gray-100 hover:bg-gray-700"
              >
                Windows
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => {
                setCurrentDate(new Date())
                setView('day')
              }}
              className="bg-gray-800 text-gray-100 hover:bg-gray-700"
            >
              Today
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Plan and manage your time</p>

        <div className="space-y-2">
          <div className="flex gap-2">
            <div
              role="tablist"
              className="flex flex-1 rounded-md bg-zinc-900 p-1 text-xs"
            >
              {(['month', 'week', 'day', 'focus'] as const).map(v => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`relative flex-1 h-11 rounded-md capitalize ${view === v ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
                >
                  {v}
                  {view === v && (
                    <motion.span
                      layoutId="view-underline"
                      className="absolute left-1 right-1 bottom-0 h-0.5 rounded-full bg-[var(--accent)]"
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { type: 'spring', bounce: 0, duration: 0.2 }
                      }
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="flex rounded-full bg-zinc-900 p-1 text-xs">
              {(['TASK','PROJECT'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setPlanning(m)}
                  aria-label={`Switch to ${m === 'TASK' ? 'task' : 'project'} planning`}
                  className={`h-9 rounded-full px-3 capitalize ${planning===m ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
                >
                  {m === 'TASK' ? 'Tasks' : 'Projects'}
                </button>
              ))}
            </div>
          </div>
          <EnergyPager
            activeIndex={{ month: 0, week: 1, day: 2, focus: 3 }[view]}
            className="justify-center"
          />
        </div>

        <div className="text-center text-sm text-gray-200">
          {formatFullDate(view === 'focus' ? new Date() : currentDate)}
        </div>

        <div
          className="relative rounded-xl border border-zinc-800 bg-[#1b1b1d]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <AnimatePresence mode="wait" initial={false}>
            {view === 'month' && (
              <ScheduleViewShell key="month">
                <YearView
                  selectedDate={currentDate}
                  onSelectDate={d => {
                    setCurrentDate(d)
                    setView('day')
                  }}
                />
              </ScheduleViewShell>
            )}
            {view === 'week' && (
              <ScheduleViewShell key="week">
                <WeekView
                  date={currentDate}
                  selectedDate={currentDate}
                  onSelectDate={d => {
                    setCurrentDate(d)
                    setView('day')
                  }}
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
                    const item = getItem(p.taskId)
                    if (!item) return null
                    const startMin =
                      p.start.getHours() * 60 + p.start.getMinutes()
                    const top = (startMin - startHour * 60) * pxPerMin
                    const height =
                      ((p.end.getTime() - p.start.getTime()) / 60000) * pxPerMin
                    const progress = (item as { progress?: number }).progress ?? 0
                    const style: CSSProperties = {
                      top,
                      height,
                      boxShadow: 'var(--elev-card)',
                      outline: '1px solid var(--event-border)',
                      outlineOffset: '-1px',
                    }
                    return (
                      <motion.div
                        key={p.taskId}
                        aria-label={`${planning === 'TASK' ? 'Task' : 'Project'} ${item.name}`}
                        className="absolute left-16 right-2 flex items-center justify-between rounded-[var(--radius-lg)] bg-[var(--event-bg)] px-3 py-2 text-white"
                        style={style}
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                        transition={prefersReducedMotion ? undefined : { delay: i * 0.02 }}
                      >
                        <div className="flex flex-col">
                          <span className="truncate text-sm font-medium">
                            {item.name}
                          </span>
                          <div className="text-xs text-zinc-200/70">
                            {item.duration_min}m
                            {planning === 'PROJECT' && 'taskCount' in item && (
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
                          level={(item.energy as FlameLevel) || 'NO'}
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

        {unplaced.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-200">Unplaced</h2>
            <ul className="space-y-2">
              {unplaced.map(u => {
                const item = getItem(u.taskId)
                const reason =
                  u.reason === 'no-window'
                    ? 'No window fits'
                    : 'No slot available'
                return (
                  <li
                    key={u.taskId}
                    aria-label={`${planning === 'TASK' ? 'Task' : 'Project'} ${item?.name ?? u.taskId} unplaced: ${reason}`}
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
