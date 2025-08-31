"use client"

import { useState } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { ScheduleHeader } from '@/components/schedule/ScheduleHeader'
import { WindowCard } from '@/components/schedule/WindowCard'
import { InboxDrawer } from '@/components/schedule/InboxDrawer'
import { ConflictToast } from '@/components/schedule/ConflictToast'
import { EmptyState } from '@/components/schedule/EmptyState'
import { mockWindows, mockTasks, Task } from '@/lib/mock/schedule-ui'

export default function SchedulePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [view, setView] = useState<'day' | 'compact'>('day')
  const [filters, setFilters] = useState<{ energy?: string }>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [unscheduled, setUnscheduled] = useState<Task[]>(mockTasks)
  const [assignments, setAssignments] = useState<Record<string, Record<number, Task>>>({})
  const [conflict, setConflict] = useState<string | null>(null)

  const handleDrop = (windowId: string) => (index: number, taskId: string) => {
    const task = unscheduled.find(t => t.id === taskId)
    if (!task) return
    const slots = task.duration / 5
    const windowAssignments = assignments[windowId] || {}
    for (let i = 0; i < slots; i++) {
      if (windowAssignments[index + i]) {
        setConflict(windowId)
        return
      }
    }
    setConflict(null)
    const newAssignments = { ...assignments }
    const newWindowAssign = { ...windowAssignments }
    for (let i = 0; i < slots; i++) {
      newWindowAssign[index + i] = task
    }
    newAssignments[windowId] = newWindowAssign
    setAssignments(newAssignments)
    setUnscheduled(unscheduled.filter(t => t.id !== taskId))
  }

  const handleMove = (windowId: string) => (from: number, to: number) => {
    const windowAssignments = assignments[windowId]
    if (!windowAssignments) return
    if (to < 0) return
    if (windowAssignments[to]) return // prevent conflict
    const task = windowAssignments[from]
    if (!task) return
    const newWindow = { ...windowAssignments }
    delete newWindow[from]
    newWindow[to] = task
    setAssignments({ ...assignments, [windowId]: newWindow })
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#1E1E1E] text-[#E0E0E0]">
        <ScheduleHeader
          date={date}
          onDateChange={setDate}
          filters={filters}
          onFilterChange={setFilters}
          view={view}
          onViewChange={setView}
        />
        <div className="p-4 pb-24">
          {mockWindows.length === 0 ? (
            <EmptyState />
          ) : (
            mockWindows.map(w => (
              <WindowCard
                key={w.id}
                window={w}
                assignments={assignments[w.id] || {}}
                onDropTask={handleDrop(w.id)}
                onMoveTask={handleMove(w.id)}
                view={view}
                filterEnergy={filters.energy}
                conflict={conflict === w.id}
              />
            ))
          )}
        </div>
        <button
          className="fixed bottom-4 right-4 px-4 py-2 rounded-full bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0]"
          onClick={() => setDrawerOpen(true)}
        >Inbox</button>
        <InboxDrawer tasks={unscheduled} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        {conflict && <ConflictToast message="Slot already filled" />}
      </div>
    </ProtectedRoute>
  )
}
