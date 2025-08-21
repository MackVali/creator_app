"use client"

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { 
  PageHeader, 
  ContentCard, 
  GridContainer,
  GridSkeleton,
  HabitsEmptyState,
  useToastHelpers
} from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Plus, CheckCircle, Flame, Calendar, Target } from 'lucide-react'

interface Habit {
  id: string
  title: string
  description: string
  frequency: 'daily' | 'weekly' | 'monthly'
  targetCount: number
  currentStreak: number
  longestStreak: number
  category: string
  lastCompleted?: string
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const { success, error } = useToastHelpers()

  useEffect(() => {
    const loadHabits = async () => {
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 600))
        
        // In a real app, this would fetch from your database
        setHabits([
          {
            id: '1',
            title: 'Morning Reading',
            description: 'Read for 30 minutes every morning',
            frequency: 'daily',
            targetCount: 1,
            currentStreak: 12,
            longestStreak: 45,
            category: 'Learning',
            lastCompleted: '2024-01-15'
          },
          {
            id: '2',
            title: 'Exercise',
            description: 'Workout for at least 45 minutes',
            frequency: 'daily',
            targetCount: 1,
            currentStreak: 8,
            longestStreak: 23,
            category: 'Fitness',
            lastCompleted: '2024-01-15'
          },
          {
            id: '3',
            title: 'Guitar Practice',
            description: 'Practice guitar for 20 minutes',
            frequency: 'daily',
            targetCount: 1,
            currentStreak: 15,
            longestStreak: 67,
            category: 'Creative',
            lastCompleted: '2024-01-15'
          },
          {
            id: '4',
            title: 'Meditation',
            description: 'Meditate for 10 minutes',
            frequency: 'daily',
            targetCount: 1,
            currentStreak: 5,
            longestStreak: 12,
            category: 'Wellness',
            lastCompleted: '2024-01-14'
          }
        ])
      } catch (err) {
        error('Failed to load habits', 'Please try refreshing the page', () => loadHabits())
      } finally {
        setLoading(false)
      }
    }

    loadHabits()
  }, [error])

  const handleCreateHabit = () => {
    success('Habit creation', 'Opening habit creation form...')
    // In a real app, this would open a modal
  }

  const handleCompleteHabit = (habitId: string) => {
    success('Habit completed!', 'Great job maintaining your streak!')
    // In a real app, this would update the database
  }

  const getFrequencyText = (frequency: string) => {
    switch (frequency) {
      case 'daily': return 'Daily'
      case 'weekly': return 'Weekly'
      case 'monthly': return 'Monthly'
      default: return frequency
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="space-y-8">
          <PageHeader 
            title="Habits" 
            description="Build and track your daily habits"
          />
          <GridSkeleton cols={2} rows={2} />
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="space-y-8">
        <PageHeader 
          title="Habits" 
          description="Build and track your daily habits"
        >
          <Button onClick={handleCreateHabit} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Habit
          </Button>
        </PageHeader>
        
        {habits.length === 0 ? (
          <HabitsEmptyState onAction={handleCreateHabit} />
        ) : (
          <GridContainer cols={2} gap="lg">
            {habits.map((habit) => (
              <ContentCard key={habit.id} className="hover:shadow-md transition-shadow">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{habit.title}</h3>
                        <p className="text-sm text-muted-foreground">{habit.category}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCompleteHabit(habit.id)}
                      className="flex-shrink-0"
                    >
                      Complete
                    </Button>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {habit.description}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {getFrequencyText(habit.frequency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {habit.targetCount}x per {habit.frequency}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-medium">
                        {habit.currentStreak} day streak
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Best: {habit.longestStreak} days
                    </div>
                  </div>
                  
                  {habit.lastCompleted && (
                    <div className="text-xs text-muted-foreground">
                      Last completed: {new Date(habit.lastCompleted).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </ContentCard>
            ))}
          </GridContainer>
        )}
      </div>
    </ProtectedRoute>
  )
}


