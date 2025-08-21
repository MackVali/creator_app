"use client"

import { Target, FolderOpen, CheckSquare, Repeat, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface CreateSheetProps {
  isOpen: boolean
  onClose: () => void
  selectedTime?: { hour: number; start: string; end: string } | null
}

const createActions = [
  { name: 'Add Goal', icon: Target, href: '/goals/new', color: 'bg-blue-500' },
  { name: 'Add Project', icon: FolderOpen, href: '/projects/new', color: 'bg-purple-500' },
  { name: 'Add Task', icon: CheckSquare, href: '/tasks/new', color: 'bg-green-500' },
  { name: 'Add Habit', icon: Repeat, href: '/habits/new', color: 'bg-orange-500' }
]

export function CreateSheet({ isOpen, onClose, selectedTime }: CreateSheetProps) {
  const router = useRouter()

  if (!isOpen) return null

  const handleActionClick = (href: string) => {
    if (selectedTime) {
      const queryParams = new URLSearchParams({
        start: selectedTime.start,
        end: selectedTime.end
      })
      router.push(`${href}?${queryParams.toString()}`)
    } else {
      router.push(href)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-[#17181C] rounded-t-3xl w-full max-w-md mx-4 mb-6 p-6 border border-white/5 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-zinc-200">
            {selectedTime ? `Add at ${selectedTime.hour > 12 ? selectedTime.hour - 12 : selectedTime.hour}${selectedTime.hour >= 12 ? 'PM' : 'AM'}` : 'Create New'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="space-y-3">
          {createActions.map((action) => (
            <button
              key={action.name}
              onClick={() => handleActionClick(action.href)}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-left"
            >
              <div className={`w-12 h-12 rounded-lg ${action.color} flex items-center justify-center flex-shrink-0`}>
                <action.icon className="w-6 h-6 text-white" aria-hidden="true" />
              </div>
              <div>
                <div className="text-zinc-200 font-medium">{action.name}</div>
                {selectedTime && (
                  <div className="text-sm text-zinc-400">
                    {new Date(selectedTime.start).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit',
                      hour12: true 
                    })} - {new Date(selectedTime.end).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit',
                      hour12: true 
                    })}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
