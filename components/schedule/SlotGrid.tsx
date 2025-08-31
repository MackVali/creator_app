"use client"

import { Window, Task } from '@/lib/mock/schedule-ui'
import { TaskChip } from './TaskChip'
import { NowLine } from './NowLine'

interface Props {
  window: Window
  assignments: Record<number, Task>
  onDrop: (index: number, taskId: string) => void
  onMove?: (from: number, to: number) => void
  view: 'day' | 'compact'
  filterEnergy?: string
}

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const minutesToTime = (m: number) => {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
}

export function SlotGrid({ window, assignments, onDrop, onMove, view, filterEnergy }: Props) {
  const start = timeToMinutes(window.start)
  const end = timeToMinutes(window.end)
  const totalSlots = (end - start) / 5
  const slotHeight = view === 'day' ? 24 : 16

  return (
    <div className="relative">
      {Array.from({ length: totalSlots }).map((_, i) => {
        const task = assignments[i]
        const timeLabel = start + i * 5
        const showLabel = view === 'day' && i % 3 === 0
        const hidden = filterEnergy && task && task.energy !== filterEnergy
        return (
          <div
            key={i}
            className="border-b border-[#3C3C3C] relative"
            style={{ height: slotHeight }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('text/plain')
              onDrop(i, id)
            }}
          >
            {showLabel && (
              <span className="absolute -left-14 text-xs text-[#A0A0A0]">{minutesToTime(timeLabel)}</span>
            )}
            {task && (
              <div
                className={hidden ? 'opacity-30' : ''}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (!onMove) return
                  if (e.key === 'ArrowUp') {
                    onMove(i, i - 1)
                    e.preventDefault()
                  }
                  if (e.key === 'ArrowDown') {
                    onMove(i, i + 1)
                    e.preventDefault()
                  }
                }}
              >
                <TaskChip task={task} draggable={false} />
              </div>
            )}
          </div>
        )
      })}
      <NowLine window={window} slotHeight={slotHeight} />
    </div>
  )
}
