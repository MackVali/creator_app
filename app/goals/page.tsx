"use client"

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { 
  PageHeader, 
  ContentCard, 
  ListContainer,
  ListSkeleton,
  GoalsEmptyState,
  useToastHelpers
} from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Plus, Target, Calendar, TrendingUp } from 'lucide-react'

interface Goal {
  id: string
  title: string
  description: string
  status: 'active' | 'completed' | 'paused'
  progress: number
  dueDate?: string
  category: string
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const { success, error } = useToastHelpers()

  useEffect(() => {
    const loadGoals = async () => {
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800))
        
        // In a real app, this would fetch from your database
        setGoals([
          {
            id: '1',
            title: 'Complete Book Manuscript',
            description: 'Finish writing the first draft of my novel about time travel',
            status: 'active',
            progress: 65,
            dueDate: '2024-12-31',
            category: 'Creative'
          },
          {
            id: '2',
            title: 'Learn Guitar',
            description: 'Master basic chords and play 5 songs proficiently',
            status: 'active',
            progress: 35,
            dueDate: '2024-06-30',
            category: 'Learning'
          },
          {
            id: '3',
            title: 'Run Marathon',
            description: 'Complete a full marathon in under 4 hours',
            status: 'active',
            progress: 45,
            dueDate: '2024-04-15',
            category: 'Fitness'
          }
        ])
      } catch (_err) {
        error('Failed to load goals', 'Please try refreshing the page', () => loadGoals())
      } finally {
        setLoading(false)
      }
    }

    loadGoals()
  }, [error])

  const handleCreateGoal = () => {
    success('Goal creation', 'Opening goal creation form...')
    // In a real app, this would open a modal
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'completed': return 'bg-blue-500'
      case 'paused': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active'
      case 'completed': return 'Completed'
      case 'paused': return 'Paused'
      default: return 'Unknown'
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="space-y-8">
          <PageHeader 
            title="Goals" 
            description="Set and track your personal goals"
          />
          <ListSkeleton count={5} />
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="space-y-8">
        <PageHeader 
          title="Goals" 
          description="Set and track your personal goals"
        >
          <Button onClick={handleCreateGoal} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Goal
          </Button>
        </PageHeader>
        
        {goals.length === 0 ? (
          <GoalsEmptyState onAction={handleCreateGoal} />
        ) : (
          <ListContainer gap="lg">
            {goals.map((goal) => (
              <ContentCard key={goal.id} className="hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                      <Target className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-foreground truncate">
                        {goal.title}
                      </h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(goal.status)} text-white`}>
                          {getStatusText(goal.status)}
                        </span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          {goal.category}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {goal.description}
                    </p>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {goal.progress}% complete
                        </span>
                      </div>
                      
                      {goal.dueDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Due {new Date(goal.dueDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-shrink-0 flex gap-2">
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </div>
                </div>
              </ContentCard>
            ))}
          </ListContainer>
        )}
      </div>
    </ProtectedRoute>
  )
}


