import { useMemo } from 'react'

interface TimeGridConfig {
  startHour: number
  endHour: number
  pxPerMinute: number
}

interface TimePosition {
  top: number
  height: number
}

export function useTimeGrid({ startHour, endHour, pxPerMinute }: TimeGridConfig) {
  const totalMinutes = (endHour - startHour) * 60
  const totalHeight = totalMinutes * pxPerMinute

  const timeToPosition = useMemo(() => {
    return (start: string, end: string): TimePosition => {
      const startDate = new Date(start)
      const endDate = new Date(end)
      
      const startHour = startDate.getHours()
      const startMinute = startDate.getMinutes()
      const endHour = endDate.getHours()
      const endMinute = endDate.getMinutes()
      
      const startMinutes = (startHour - startHour) * 60 + startMinute
      const durationMinutes = (endHour - startHour) * 60 + (endMinute - startMinute)
      
      const top = startMinutes * pxPerMinute
      const height = durationMinutes * pxPerMinute
      
      return { top, height }
    }
  }, [pxPerMinute])

  const generateHourMarkers = useMemo(() => {
    const hours = []
    for (let hour = startHour; hour <= endHour; hour++) {
      hours.push({
        hour,
        label: hour === 0 ? '12 AM' : 
               hour === 12 ? '12 PM' : 
               hour > 12 ? `${hour - 12} PM` : `${hour} AM`,
        top: (hour - startHour) * 60 * pxPerMinute
      })
    }
    return hours
  }, [startHour, endHour, pxPerMinute])

  return {
    totalHeight,
    timeToPosition,
    generateHourMarkers,
    pxPerMinute
  }
}
