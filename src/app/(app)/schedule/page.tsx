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
    if (windows.length === 0) return
    const date = currentDate
    if (planning === 'TASK') {
      const result = placeByEnergyWeight(weightedTasks, windows, date)
      setPlacements(result.placements)
    } else {
      const result = placeByEnergyWeight(projectItems, windows, date)
      setPlacements(result.placements)
    }
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
          {(['month','week','day','focus'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-md py-1 text-sm capitalize ${view===v ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-400'}`}
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
                className={`rounded-full px-3 py-1 capitalize ${planning===m ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
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
          className="relative h-[600px] overflow-y-auto rounded-lg border bg-neutral-950"
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
              {placements.map(p => {
                const item = getItem(p.taskId)
                if (!item) return null
                const startMin =
                  p.start.getHours() * 60 + p.start.getMinutes()
                const top = (startMin - startHour * 60) * pxPerMin
                const height =
                  ((p.end.getTime() - p.start.getTime()) / 60000) * pxPerMin
                return (
                  <div
                    key={p.taskId}
                    className={`absolute left-0 right-2 overflow-hidden rounded p-1 text-xs text-white ${
                      planning === 'TASK'
                        ? 'bg-zinc-800'
                        : 'bg-purple-800'
                    }`}
                    style={{ top, height }}
                  >
                    {item.name}
                  </div>
                )
              })}
            </DayTimeline>
          )}
          {view === 'focus' && <FocusTimeline />}
        </div>
      </div>
    </ProtectedRoute>
  )
}
