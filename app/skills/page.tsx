"use client"

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { 
  PageHeader, 
  ContentCard, 
  GridContainer,
  GridSkeleton,
  SkillsEmptyState,
  useToastHelpers
} from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Plus, Star, TrendingUp, Target, Award } from 'lucide-react'

interface Skill {
  id: string
  name: string
  description: string
  currentLevel: number
  targetLevel: number
  category: string
  lastPracticed?: string
  totalPracticeHours: number
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const { success, error } = useToastHelpers()

  useEffect(() => {
    const loadSkills = async () => {
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 700))
        
        // In a real app, this would fetch from your database
        setSkills([
          {
            id: '1',
            name: 'Writing',
            description: 'Creative writing and storytelling',
            currentLevel: 65,
            targetLevel: 85,
            category: 'Creative',
            lastPracticed: '2024-01-15',
            totalPracticeHours: 120
          },
          {
            id: '2',
            name: 'Guitar',
            description: 'Acoustic and electric guitar playing',
            currentLevel: 35,
            targetLevel: 70,
            category: 'Music',
            lastPracticed: '2024-01-15',
            totalPracticeHours: 85
          },
          {
            id: '3',
            name: 'Running',
            description: 'Long-distance running and endurance',
            currentLevel: 55,
            targetLevel: 80,
            category: 'Fitness',
            lastPracticed: '2024-01-15',
            totalPracticeHours: 200
          },
          {
            id: '4',
            name: 'Spanish',
            description: 'Spanish language proficiency',
            currentLevel: 25,
            targetLevel: 75,
            category: 'Language',
            lastPracticed: '2024-01-14',
            totalPracticeHours: 45
          },
          {
            id: '5',
            name: 'Programming',
            description: 'Web development and coding',
            currentLevel: 55,
            targetLevel: 80,
            category: 'Technical',
            lastPracticed: '2024-01-15',
            totalPracticeHours: 300
          },
          {
            id: '6',
            name: 'Public Speaking',
            description: 'Confident public presentation skills',
            currentLevel: 45,
            targetLevel: 80,
            category: 'Communication',
            lastPracticed: '2024-01-12',
            totalPracticeHours: 75
          }
        ])
      } catch (err) {
        error('Failed to load skills', 'Please try refreshing the page', () => loadSkills())
      } finally {
        setLoading(false)
      }
    }

    loadSkills()
  }, [error])

  const handleCreateSkill = () => {
    success('Skill creation', 'Opening skill creation form...')
    // In a real app, this would open a modal
  }

  const handlePracticeSkill = (skillId: string) => {
    success('Practice session started!', 'Keep up the great work!')
    // In a real app, this would start a practice timer
  }

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'text-green-600'
    if (progress >= 60) return 'text-blue-600'
    if (progress >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      'Creative': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
      'Music': 'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-400',
      'Fitness': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      'Language': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      'Technical': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
      'Communication': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400'
    }
    return colors[category as keyof typeof colors] || colors['Technical']
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="space-y-8">
          <PageHeader 
            title="Skills" 
            description="Track and develop your skills"
          />
          <GridSkeleton cols={3} rows={2} />
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="space-y-8">
        <PageHeader 
          title="Skills" 
          description="Track and develop your skills"
        >
          <Button onClick={handleCreateSkill} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Skill
          </Button>
        </PageHeader>
        
        {skills.length === 0 ? (
          <SkillsEmptyState onAction={handleCreateSkill} />
        ) : (
          <GridContainer cols={3} gap="lg">
            {skills.map((skill) => {
              const progress = (skill.currentLevel / skill.targetLevel) * 100
              
              return (
                <ContentCard key={skill.id} className="hover:shadow-md transition-shadow">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                          <Star className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{skill.name}</h3>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(skill.category)}`}>
                            {skill.category}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePracticeSkill(skill.id)}
                        className="flex-shrink-0"
                      >
                        Practice
                      </Button>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      {skill.description}
                    </p>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className={`font-medium ${getProgressColor(progress)}`}>
                          {skill.currentLevel}/{skill.targetLevel}
                        </span>
                      </div>
                      
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {progress.toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {skill.totalPracticeHours}h
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {skill.lastPracticed && (
                      <div className="text-xs text-muted-foreground pt-2 border-t">
                        Last practiced: {new Date(skill.lastPracticed).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </ContentCard>
              )
            })}
          </GridContainer>
        )}
      </div>
    </ProtectedRoute>
  )
}


