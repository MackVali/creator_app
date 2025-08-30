"use client"

import { Task } from '@/lib/mock/schedule-ui'
import { TaskChip } from './TaskChip'
import { useState } from 'react'

interface Props {
  tasks: Task[]
  open: boolean
  onClose: () => void
}

export function InboxDrawer({ tasks, open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const filtered = tasks.filter(t => t.title.toLowerCase().includes(query.toLowerCase()))

  return (
    <div
      className={`fixed inset-x-0 bottom-0 bg-[#2B2B2B] border-t border-[#3C3C3C] transition-transform ${open ? 'translate-y-0' : 'translate-y-full'} p-4`}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex justify-between items-center mb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="flex-1 mr-2 px-2 py-1 rounded bg-[#1E1E1E] text-[#E0E0E0] border border-[#3C3C3C]"
        />
        <button onClick={onClose} className="px-2 py-1 bg-[#1E1E1E] text-[#E0E0E0] rounded border border-[#3C3C3C]">Close</button>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto max-h-60">
        {filtered.map(task => (
          <TaskChip key={task.id} task={task} />
        ))}
        {filtered.length === 0 && <div className="text-center text-[#A0A0A0]">No tasks</div>}
      </div>
    </div>
  )
}
