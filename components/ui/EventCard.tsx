"use client"

import { scheduleIcons, ScheduleIconName } from '@/lib/icons'

interface EventCardProps {
  title: string
  start: string
  end: string
  icon: ScheduleIconName
  muted?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}

export function EventCard({ title, start, end, icon, muted = false, onClick, style }: EventCardProps) {
  const Icon = scheduleIcons[icon]
  
  const formatTime = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const timeRange = `${formatTime(start)} - ${formatTime(end)}`
  
  return (
    <div
      role="button"
      aria-label={`${title}, ${timeRange}`}
      onClick={onClick}
      style={style}
      className={`
        absolute left-0 right-0 bg-[#17181C] rounded-2xl border border-white/5 
        shadow-[0_8px_24px_rgba(0,0,0,0.35)] px-5 py-4
        hover:translate-y-[-1px] hover:shadow-[0_10px_28px_rgba(0,0,0,0.45)] 
        transition-transform cursor-pointer
        ${muted ? 'text-zinc-400' : 'text-zinc-200'}
      `}
    >
      <div className="flex items-center justify-between h-full">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-white/6 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-white/70" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-[17px] font-medium tracking-tight truncate ${
              muted ? 'text-zinc-400' : 'text-zinc-200'
            }`}>
              {title}
            </h3>
          </div>
        </div>
        
        <div className="w-6 h-6 rounded-full bg-white/4 border border-white/10 flex-shrink-0" />
      </div>
    </div>
  )
}
