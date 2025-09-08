"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { DayTimeline } from '@/components/schedule/DayTimeline'
import { MonthView } from '@/components/schedule/MonthView'
import { WeekView } from '@/components/schedule/WeekView'
import { FocusTimeline } from '@/components/schedule/FocusTimeline'
import FlameEmber, { FlameLevel } from '@/components/FlameEmber'
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

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week' | 'day' | 'focus'>('day')
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

  function timeToMin(t: string) {
    const [h = 0, m = 0] = t.split(':').map(Number)
    return h * 60 + m
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
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Plan and manage your time</p>

        <div className="flex gap-2">
          <div className="flex flex-1 rounded-md bg-zinc-900 p-1 text-xs">
            {(['month','week','day','focus'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 h-9 rounded-md capitalize ${view===v ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
              >
                {v}
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

        <div className="text-center text-sm text-gray-200">
          {formatFullDate(view === 'focus' ? new Date() : currentDate)}
        </div>

        <div
          className="relative rounded-xl border border-zinc-800 bg-[#1b1b1d]"
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
              {placements.map(p => {
                const item = getItem(p.taskId)
                if (!item) return null
                const startMin =
                  p.start.getHours() * 60 + p.start.getMinutes()
                const top = (startMin - startHour * 60) * pxPerMin
                const height =
                  ((p.end.getTime() - p.start.getTime()) / 60000) * pxPerMin
                const catColor = (item as { cat_color_hex?: string }).cat_color_hex || '#3b82f6'
                const progress = (item as { progress?: number }).progress ?? 0
                const style: CSSProperties & { '--cat': string } = {
                  top,
                  height,
                  '--cat': catColor,
                }
                return (
                  <div
                    key={p.taskId}
                    aria-label={`${planning === 'TASK' ? 'Task' : 'Project'} ${item.name}`}
                    className="absolute left-16 right-2 flex items-center justify-between rounded-xl px-3 py-2 text-white card3d"
                    style={style}
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
