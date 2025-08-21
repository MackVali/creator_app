import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export default function HabitsPage() {
  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Habits</h1>
          <p className="text-muted-foreground">
            Build and track your daily habits
          </p>
        </div>
        
        {/* Habits content will go here */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <h3 className="font-semibold">Your Habits</h3>
          <p className="text-sm text-muted-foreground">Manage your habits here</p>
        </div>
      </div>
    </ProtectedRoute>
  )
}


