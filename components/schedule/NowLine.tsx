"use client"

import { useEffect, useState } from 'react'
import { Window } from '@/lib/mock/schedule-ui'

interface Props {
  window: Window
  slotHeight: number
}

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function NowLine({ window, slotHeight }: Props) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const start = timeToMinutes(window.start)
  const end = timeToMinutes(window.end)
  const current = now.getHours() * 60 + now.getMinutes()
  if (current < start || current > end) return null

  const offset = ((current - start) / 5) * slotHeight

  return (
    <div
      className="absolute left-0 right-0 h-0.5 bg-red-500"
      style={{ top: offset }}
    />
  )
}
