"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createRecord, queryRecords, updateRecord, deleteRecord } from '@/lib/db'

interface Goal {
  id: string
  title: string
  description: string
  status: 'active' | 'completed'
  created_at: string
  updated_at: string
}

export function GoalsExample() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [newGoal, setNewGoal] = useState({ title: '', description: '' })
  const [loading, setLoading] = useState(false)

  // Load goals on component mount
  useEffect(() => {
    loadGoals()
  }, [])

  const loadGoals = async () => {
    setLoading(true)
    try {
      const { data, error } = await queryRecords<Goal>('goals', {
        orderBy: { column: 'created_at', ascending: false }
      })
      
      if (error) {
        console.error('Error loading goals:', error)
        return
      }
      
      setGoals(data || [])
    } catch (error) {
      console.error('Error loading goals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGoal.title.trim()) return

    setLoading(true)
    try {
      const { error } = await createRecord<Goal>('goals', {
        title: newGoal.title,
        description: newGoal.description,
        status: 'active'
      })

      if (error) {
        console.error('Error creating goal:', error)
        return
      }

      // Reset form and reload goals
      setNewGoal({ title: '', description: '' })
      await loadGoals()
    } catch (error) {
      console.error('Error creating goal:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateGoal = async (goalId: string, updates: Partial<Goal>) => {
    setLoading(true)
    try {
      const { error } = await updateRecord<Goal>('goals', goalId, updates)
      
      if (error) {
        console.error('Error updating goal:', error)
        return
      }

      await loadGoals()
    } catch (error) {
      console.error('Error updating goal:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return

    setLoading(true)
    try {
      const { error } = await deleteRecord('goals', goalId)
      
      if (error) {
        console.error('Error deleting goal:', error)
        return
      }

      await loadGoals()
    } catch (error) {
      console.error('Error deleting goal:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Goal</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateGoal} className="space-y-4">
            <div>
              <Input
                placeholder="Goal title"
                value={newGoal.title}
                onChange={(e) => setNewGoal(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <Input
                placeholder="Description (optional)"
                value={newGoal.description}
                onChange={(e) => setNewGoal(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Goal'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Goals</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : goals.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No goals created yet. Create your first goal above!
            </div>
          ) : (
            <div className="space-y-4">
              {goals.map((goal) => (
                <div key={goal.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <h3 className="font-semibold">{goal.title}</h3>
                    {goal.description && (
                      <p className="text-sm text-muted-foreground">{goal.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(goal.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateGoal(goal.id, { 
                        status: goal.status === 'active' ? 'completed' : 'active' 
                      })}
                    >
                      {goal.status === 'active' ? 'Mark Complete' : 'Mark Active'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteGoal(goal.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
