"use client"

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { 
  PageHeader, 
  ContentCard, 
  GridContainer,
  GridSkeleton,
  ProjectsEmptyState,
  useToastHelpers
} from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Plus, FolderKanban, Calendar, Target, TrendingUp } from 'lucide-react'

interface Project {
  id: string
  title: string
  description: string
  status: 'planning' | 'in_progress' | 'completed' | 'on_hold'
  progress: number
  startDate: string
  endDate: string
  goalTitle?: string
  category: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const { success, error } = useToastHelpers()

  useEffect(() => {
    const loadProjects = async () => {
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 750))
        
        // In a real app, this would fetch from your database
        setProjects([
          {
            id: '1',
            title: 'Novel Writing Project',
            description: 'Complete the first draft of my time travel novel',
            status: 'in_progress',
            progress: 65,
            startDate: '2024-01-01',
            endDate: '2024-12-31',
            goalTitle: 'Complete Book Manuscript',
            category: 'Creative'
          },
          {
            id: '2',
            title: 'Guitar Learning Journey',
            description: 'Learn guitar from beginner to intermediate level',
            status: 'in_progress',
            progress: 35,
            startDate: '2024-01-01',
            endDate: '2024-06-30',
            goalTitle: 'Learn Guitar',
            category: 'Learning'
          },
          {
            id: '3',
            title: 'Marathon Training',
            description: '16-week training program for marathon',
            status: 'in_progress',
            progress: 45,
            startDate: '2024-01-01',
            endDate: '2024-04-15',
            goalTitle: 'Run Marathon',
            category: 'Fitness'
          },
          {
            id: '4',
            title: 'Business Launch',
            description: 'Setup consulting business infrastructure',
            status: 'planning',
            progress: 15,
            startDate: '2024-03-01',
            endDate: '2024-08-31',
            goalTitle: 'Start Business',
            category: 'Business'
          }
        ])
      } catch (_err) {
        error('Failed to load projects', 'Please try refreshing the page', () => loadProjects())
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [error])

  const handleCreateProject = () => {
    success('Project creation', 'Opening project creation form...')
    // In a real app, this would open a modal
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-blue-500'
      case 'in_progress': return 'bg-green-500'
      case 'completed': return 'bg-purple-500'
      case 'on_hold': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'planning': return 'Planning'
      case 'in_progress': return 'In Progress'
      case 'completed': return 'Completed'
      case 'on_hold': return 'On Hold'
      default: return 'Unknown'
    }
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      'Creative': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
      'Learning': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      'Fitness': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      'Business': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400'
    }
    return colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="space-y-8">
          <PageHeader 
            title="Projects" 
            description="Manage your ongoing projects"
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
          title="Projects" 
          description="Manage your ongoing projects"
        >
          <Button onClick={handleCreateProject} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Project
          </Button>
        </PageHeader>
        
        {projects.length === 0 ? (
          <ProjectsEmptyState onAction={handleCreateProject} />
        ) : (
          <GridContainer cols={2} gap="lg">
            {projects.map((project) => (
              <ContentCard key={project.id} className="hover:shadow-md transition-shadow">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                        <FolderKanban className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{project.title}</h3>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(project.category)}`}>
                          {project.category}
                        </span>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)} text-white`}>
                      {getStatusText(project.status)}
                    </span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {project.description}
                  </p>
                  
                  {project.goalTitle && (
                    <div className="flex items-center gap-2 text-sm">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Goal: {project.goalTitle}
                      </span>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium text-blue-600">
                        {project.progress}%
                      </span>
                    </div>
                    
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Start: {new Date(project.startDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        End: {new Date(project.endDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      View Details
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      Edit
                    </Button>
                  </div>
                </div>
              </ContentCard>
            ))}
          </GridContainer>
        )}
      </div>
    </ProtectedRoute>
  )
}


