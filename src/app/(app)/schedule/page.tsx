"use client"

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { DayTimeline } from '@/components/schedule/DayTimeline'

export default function SchedulePage() {
  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
          <p className="text-muted-foreground">
            Plan and manage your time
          </p>
        </div>

        <div className="relative h-[600px] overflow-y-auto rounded-lg border bg-neutral-950">
          <DayTimeline />
        </div>
      </div>
    </ProtectedRoute>
  )
}
