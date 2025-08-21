import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export default function MonumentsPage() {
  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monuments</h1>
          <p className="text-muted-foreground">
            Celebrate your achievements and milestones
          </p>
        </div>
        
        {/* Monuments content will go here */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <h3 className="font-semibold">Your Monuments</h3>
          <p className="text-sm text-muted-foreground">View your achievements here</p>
        </div>
      </div>
    </ProtectedRoute>
  )
}


