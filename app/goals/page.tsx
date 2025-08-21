import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export default function GoalsPage() {
  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Goals</h1>
          <p className="text-muted-foreground">
            Set and track your personal goals
          </p>
        </div>
        
        {/* Goals content will go here */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <h3 className="font-semibold">Your Goals</h3>
          <p className="text-sm text-muted-foreground">Manage your goals here</p>
        </div>
      </div>
    </ProtectedRoute>
  )
}


