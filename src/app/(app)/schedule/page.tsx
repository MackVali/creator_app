"use client"

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { DayTimeline } from '@/components/schedule/DayTimeline'
import { MonthView } from '@/components/schedule/MonthView'
import { WeekView } from '@/components/schedule/WeekView'
import { FocusTimeline } from '@/components/schedule/FocusTimeline'
import { Button } from '@/components/ui/button'

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week' | 'day' | 'focus'>('day')
  const [planning, setPlanning] = useState<'TASK' | 'PROJECT'>(() => {
    if (typeof window === 'undefined') return 'TASK'
    return (localStorage.getItem('planning-mode') as 'TASK' | 'PROJECT') || 'TASK'
  })
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    localStorage.setItem('planning-mode', planning)
  }, [planning])

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
          {view === 'day' && <DayTimeline date={currentDate} />}
          {view === 'focus' && <FocusTimeline />}
        </div>
      </div>
    </ProtectedRoute>
  )
}
