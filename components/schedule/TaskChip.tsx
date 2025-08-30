"use client"

import clsx from 'clsx'
import { Task } from '@/lib/mock/schedule-ui'

interface Props {
  task: Task
  draggable?: boolean
}

export function TaskChip({ task, draggable = true }: Props) {
  return (
    <div
      className={clsx(
        'text-sm px-2 py-1 rounded-full select-none cursor-grab active:cursor-grabbing',
        'bg-[#2B2B2B] text-[#E0E0E0] border border-[#3C3C3C]',
        'hover:bg-[#353535] transition-colors'
      )}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
      }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (!draggable) return
        if (e.key === 'Enter' || e.key === ' ') {
          // allow keyboard pick up
          e.currentTarget.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }))
        }
      }}
      aria-grabbed="false"
    >
      {task.title}
    </div>
  )
}
