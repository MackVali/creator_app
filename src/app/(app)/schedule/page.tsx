"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { DayTimeline } from '@/components/schedule/DayTimeline'
import { MonthView } from '@/components/schedule/MonthView'
import { WeekView } from '@/components/schedule/WeekView'
import { FocusTimeline } from '@/components/schedule/FocusTimeline'
import { Button } from '@/components/ui/button'
import {
  fetchReadyTasks,
  fetchWindowsForDate,
  fetchProjectsMap,
  type WindowLite,
} from '@/lib/scheduler/repo'
import { placeByEnergyWeight } from '@/lib/scheduler/placer'
import { ENERGY } from '@/lib/scheduler/config'
import {
  TaskLite,
  ProjectLite,
  taskWeight,
  projectWeight,
} from '@/lib/scheduler/weight'
import { Filter } from 'lucide-react'

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week' | 'day' | 'focus'>('day')
  const [planning, setPlanning] = useState<'TASK' | 'PROJECT'>(() => {
    if (typeof window === 'undefined') return 'TASK'
    return (localStorage.getItem('planning-mode') as 'TASK' | 'PROJECT') || 'TASK'
  })
  const [filtersActive, setFiltersActive] = useState(false)
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [windows, setWindows] = useState<WindowLite[]>([])
  const [placements, setPlacements] = useState<
    ReturnType<typeof placeByEnergyWeight>['placements']
  >([])
  const [unplaced, setUnplaced] = useState<
    ReturnType<typeof placeByEnergyWeight>['unplaced']
  >([])
  const [taskPlacements, setTaskPlacements] = useState<
    ReturnType<typeof placeByEnergyWeight>['placements']
  >([])
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const touchStartX = useRef<number | null>(null)

  const startHour = 0
  const pxPerMin = 2

  useEffect(() => {
    localStorage.setItem('planning-mode', planning)
  }, [planning])

  useEffect(() => {
    async function load() {
      try {
        const weekday = currentDate.getDay()
        const [ws, ts, pm] = await Promise.all([
          fetchWindowsForDate(weekday),
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

  const projectItems = useMemo(() => {
    type Energy = (typeof ENERGY.LIST)[number]
    const items: (
      ProjectLite & {
        name: string
        duration_min: number
        energy: Energy | null
        weight: number
        taskCount: number
      }
    )[] = []
    for (const p of projects) {
      const related = tasks.filter(t => t.project_id === p.id)
      if (related.length === 0) continue
      const duration_min = related.reduce((sum, t) => sum + t.duration_min, 0)
      const energy = related.reduce<Energy | null>((acc, t) => {
        if (!t.energy) return acc
        const current = t.energy as Energy
        if (!acc) return current
        return ENERGY.LIST.indexOf(current) > ENERGY.LIST.indexOf(acc)
          ? current
          : acc
      }, null)
      const relatedWeightSum = related.reduce(
        (sum, t) => sum + taskWeight(t),
        0
      )
      const weight = projectWeight(p, relatedWeightSum)
      items.push({
        ...p,
        name: p.name ?? '',
        duration_min,
        energy,
        weight,
        taskCount: related.length,
      })
    }
    return items
  }, [projects, tasks])

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
    if (planning !== 'PROJECT') setExpandedProject(null)
  }, [planning])

  useEffect(() => {
    function run() {
      if (windows.length === 0) return
      const date = currentDate
      const taskResult = placeByEnergyWeight(weightedTasks, windows, date)
      const projectResult = placeByEnergyWeight(projectItems, windows, date)
      setTaskPlacements(taskResult.placements)
      if (planning === 'TASK') {
        setPlacements(taskResult.placements)
        setUnplaced(taskResult.unplaced)
      } else {
        setPlacements(projectResult.placements)
        setUnplaced(projectResult.unplaced)
      }
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

  function timeToMin(t: string) {
    const [h = 0, m = 0] = t.split(':').map(Number)
    return h * 60 + m
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div className="relative">
          <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
          <div className="absolute right-0 top-0 flex gap-2">
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
          </div>
          <p className="text-muted-foreground">
            Plan and manage your time
          </p>
        </div>

        <div className="flex gap-2">
          {(['month', 'week', 'day', 'focus'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`relative flex-1 rounded-full px-3 py-1.5 text-xs capitalize transition-colors ${
                view === v
                  ? "bg-zinc-800 text-white after:absolute after:left-2 after:right-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[#9966CC] after:content-['']"
                  : 'border border-zinc-700/40 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/60'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex justify-center">
          <div className="flex rounded-full bg-zinc-900 p-1 text-xs">
            {(['TASK','PROJECT'] as const).map(m => (
              <button
                key={m}
                onClick={() => setPlanning(m)}
                aria-label={`Switch to ${m === 'TASK' ? 'task' : 'project'} planning`}
                className={`h-11 rounded-full px-4 capitalize ${planning===m ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
              >
                {m === 'TASK' ? 'Tasks' : 'Projects'}
              </button>
            ))}
          </div>
        </div>

        <div className="text-center text-sm text-gray-200">
          {formatFullDate(view === 'focus' ? new Date() : currentDate)}
        </div>

        <div
          className="relative h-[600px] overflow-y-auto bg-[#0f0f12]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {view === 'month' && <MonthView date={currentDate} />}
          {view === 'week' && <WeekView date={currentDate} />}
          {view === 'day' && (
            <DayTimeline
              date={currentDate}
              startHour={startHour}
              pxPerMin={pxPerMin}
            >
              {windows.map(w => {
                const startMin = timeToMin(w.start_local)
                const endMin = timeToMin(w.end_local)
                const top = (startMin - startHour * 60) * pxPerMin
                const height = (endMin - startMin) * pxPerMin
                return (
                  <div
                    key={w.id}
                    aria-label={w.label}
                    className="absolute left-0 right-0 rounded-md bg-zinc-800/50"
                    style={{ top, height, opacity: 0.3 }}
                  />
                )
              })}
              {placements.map(p => {
                const item = getItem(p.taskId)
                if (!item) return null
                const startMin =
                  p.start.getHours() * 60 + p.start.getMinutes()
                const top = (startMin - startHour * 60) * pxPerMin
                const height =
                  ((p.end.getTime() - p.start.getTime()) / 60000) * pxPerMin
                const expanded =
                  planning === 'PROJECT' && expandedProject === item.id
                const relatedTasks = expanded
                  ? taskPlacements.filter(
                      tp => taskMap[tp.taskId]?.project_id === item.id
                    )
                  : []
                return (
                  <div
                    key={p.taskId}
                    aria-label={`${planning === 'TASK' ? 'Task' : 'Project'} ${item.name}`}
                    onClick={() =>
                      planning === 'PROJECT' &&
                      setExpandedProject(prev =>
                        prev === item.id ? null : item.id
                      )
                    }
                    className="group absolute left-2 right-2 rounded-md border-2 border-zinc-700 bg-gradient-to-br from-zinc-800 to-zinc-900 p-2 text-xs text-white shadow-xl transition-transform active:scale-95"
                    style={{ top, height }}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-20" />
                    <div className="relative h-full w-full">
                      <div
                        className={`absolute left-0 top-0 h-full w-1 ${
                          planning === 'TASK' ? 'bg-[#9966CC]' : 'bg-zinc-500'
                        }`}
                      />
                      <div className="ml-2 flex h-full flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-sm font-medium">
                            {item.name}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400">
                              {item.duration_min}m
                            </span>
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-700 text-[#9966CC]"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        <div className="mb-1 mt-1 h-1 w-full rounded bg-zinc-700">
                          <div
                            className="h-full rounded bg-[#9966CC]"
                            style={{ width: '0%' }}
                          />
                        </div>
                        {planning === 'PROJECT' && 'taskCount' in item && (
                          <div className="text-[10px] text-zinc-400">
                            {item.taskCount} tasks
                          </div>
                        )}
                        {expanded && relatedTasks.length > 0 && (
                          <div className="relative mt-2 h-6 w-full rounded bg-zinc-800">
                            {relatedTasks.map(tp => {
                              const task = taskMap[tp.taskId]
                              if (!task) return null
                              const taskStart =
                                tp.start.getHours() * 60 + tp.start.getMinutes()
                              const left =
                                ((taskStart - startMin) / item.duration_min) * 100
                              const width =
                                (task.duration_min / item.duration_min) * 100
                              return (
                                <div
                                  key={tp.taskId}
                                  title={task.name}
                                  className="absolute top-1 h-4 rounded bg-[#9966CC]"
                                  style={{
                                    left: `${left}%`,
                                    width: `${width}%`,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    className="absolute right-0 top-0 h-3 w-3 translate-x-1/2 -translate-y-1/2 rounded border-zinc-600 bg-zinc-700 text-[#9966CC]"
                                    onClick={e => e.stopPropagation()}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </DayTimeline>
          )}
          {view === 'focus' && <FocusTimeline />}
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
                    className="group relative rounded-md border-2 border-zinc-700 bg-gradient-to-br from-zinc-800 to-zinc-900 p-3 text-xs text-white shadow-lg transition-transform active:scale-95"
                  >
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-20" />
                    <div className="relative flex items-center justify-between">
                      <span>{item?.name ?? u.taskId}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">{reason}</span>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-700 text-[#9966CC]"
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <button
          aria-label="Toggle filters"
          onClick={() => setFiltersActive(prev => !prev)}
          className={`fixed bottom-6 right-6 z-20 rounded-full border border-zinc-600/40 bg-zinc-800/60 p-3 backdrop-blur-md shadow-lg transition ${filtersActive ? 'animate-pulse' : 'hover:bg-zinc-700/60'}`}
        >
          <Filter className="h-5 w-5 text-white" />
        </button>
      </div>
    </ProtectedRoute>
  )
}
