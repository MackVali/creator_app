import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to your personal performance OS
          </p>
        </div>
        
        {/* Dashboard content will go here */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
            <h3 className="font-semibold">Quick Stats</h3>
            <p className="text-sm text-muted-foreground">Your performance overview</p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
