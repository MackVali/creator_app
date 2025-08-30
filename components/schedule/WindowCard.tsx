"use client"

import { useState } from 'react'
import { Window, Task } from '@/lib/mock/schedule-ui'
import { SlotGrid } from './SlotGrid'

interface Props {
  window: Window
  assignments: Record<number, Task>
  onDropTask: (index: number, taskId: string) => void
  onMoveTask: (from: number, to: number) => void
  view: 'day' | 'compact'
  filterEnergy?: string
  conflict?: boolean
}

export function WindowCard({ window, assignments, onDropTask, onMoveTask, view, filterEnergy, conflict }: Props) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-4 border border-[#3C3C3C] rounded bg-[#2B2B2B]">
      <button
        className="w-full flex justify-between items-center px-4 py-2 text-left text-[#E0E0E0]"
        onClick={() => setOpen(o => !o)}
      >
        <span>{window.name}</span>
        <span className="text-sm text-[#A0A0A0]">{window.start} – {window.end}</span>
      </button>
      {open && (
        <div className="p-2">
          {conflict && <div className="text-red-400 text-sm mb-2">Conflict: Slot already filled</div>}
          <SlotGrid
            window={window}
            assignments={assignments}
            onDrop={onDropTask}
            onMove={onMoveTask}
            view={view}
            filterEnergy={filterEnergy}
          />
        </div>
      )}
    </div>
  )
}
