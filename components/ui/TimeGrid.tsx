"use client"

import { ReactNode } from 'react'
import { useTimeGrid } from '@/lib/hooks/useTimeGrid'

interface TimeGridProps {
  startHour: number
  endHour: number
  pxPerMinute: number
  children: ReactNode
  onTimeSlotClick?: (hour: number) => void
}

export function TimeGrid({ startHour, endHour, pxPerMinute, children, onTimeSlotClick }: TimeGridProps) {
  const { totalHeight, generateHourMarkers } = useTimeGrid({ startHour, endHour, pxPerMinute })
  const hourMarkers = generateHourMarkers

  return (
    <div className="flex">
      {/* Left Gutter - Hour Markers */}
      <div className="w-16 flex-shrink-0">
        <div className="relative" style={{ height: totalHeight }}>
          {hourMarkers.map((marker) => (
            <div
              key={marker.hour}
              className="absolute right-3 text-zinc-500 text-sm font-medium"
              style={{ top: marker.top - 12 }} // Center text vertically
            >
              {marker.label}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline Column */}
      <div className="flex-1 relative">
        <div 
          className="relative"
          style={{ height: totalHeight }}
        >
          {/* Hour Row Dividers */}
          {hourMarkers.slice(0, -1).map((marker) => (
            <div
              key={`divider-${marker.hour}`}
              className="absolute left-0 right-0 after:block after:h-px after:bg-white/5"
              style={{ top: marker.top }}
            />
          ))}

          {/* Time Slot Click Areas */}
          {hourMarkers.map((marker) => (
            <button
              key={`slot-${marker.hour}`}
              className="absolute left-0 right-0 min-h-[72px] md:min-h-[72px] hover:bg-white/8 transition-colors"
              style={{ top: marker.top }}
              onClick={() => onTimeSlotClick?.(marker.hour)}
              aria-label={`Add event at ${marker.label}`}
            />
          ))}

          {/* Events */}
          {children}
        </div>
      </div>
    </div>
  )
}
