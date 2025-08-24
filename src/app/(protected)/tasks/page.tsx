import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export default function TasksPage() {
  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            Organize and track your tasks
          </p>
        </div>
        
        {/* Tasks content will go here */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <h3 className="font-semibold">Your Tasks</h3>
          <p className="text-sm text-muted-foreground">Manage your tasks here</p>
        </div>
      </div>
    </ProtectedRoute>
  )
}


