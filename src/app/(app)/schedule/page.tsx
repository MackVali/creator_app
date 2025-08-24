"use client"

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

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
        
        {/* Schedule content will go here */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <h3 className="font-semibold">Your Schedule</h3>
          <p className="text-sm text-muted-foreground">Manage your schedule here</p>
        </div>
      </div>
    </ProtectedRoute>
  )
}
