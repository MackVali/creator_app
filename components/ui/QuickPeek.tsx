"use client"

import { CheckCircle, Edit, Trash2, X } from 'lucide-react'
import { ScheduleItem } from '@/lib/mock/schedule'
import { scheduleIcons } from '@/lib/icons'

interface QuickPeekProps {
  event: ScheduleItem | null
  isOpen: boolean
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
  onMarkDone?: () => void
}

export function QuickPeek({ event, isOpen, onClose, onEdit, onDelete, onMarkDone }: QuickPeekProps) {
  if (!isOpen || !event) return null

  const Icon = scheduleIcons[event.icon]
  
  const formatTime = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const timeRange = `${formatTime(event.start)} - ${formatTime(event.end)}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-[#17181C] rounded-t-3xl w-full max-w-md mx-4 mb-6 p-6 border border-white/5 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/6 flex items-center justify-center">
              <Icon className="w-5 h-5 text-white/70" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-200">{event.title}</h2>
              <p className="text-sm text-zinc-400">{timeRange}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-zinc-400 text-sm">
            Description placeholder - add your event details here
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={onMarkDone}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 transition-colors text-left"
          >
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-green-400 font-medium">Mark Done</span>
          </button>
          
          <button
            onClick={onEdit}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-accent/10 hover:bg-accent/20 border border-accent/20 transition-colors text-left"
          >
            <Edit className="w-5 h-5 text-accent" />
            <span className="text-accent font-medium">Edit</span>
          </button>
          
          <button
            onClick={onDelete}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors text-left"
          >
            <Trash2 className="w-5 h-5 text-red-400" />
            <span className="text-red-400 font-medium">Delete</span>
          </button>
        </div>
      </div>
    </div>
  )
}
