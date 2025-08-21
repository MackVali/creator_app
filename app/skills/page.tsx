import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export default function SkillsPage() {
  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Skills</h1>
          <p className="text-muted-foreground">
            Track and develop your skills
          </p>
        </div>
        
        {/* Skills content will go here */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <h3 className="font-semibold">Your Skills</h3>
          <p className="text-sm text-muted-foreground">Manage your skills here</p>
        </div>
      </div>
    </ProtectedRoute>
  )
}


