import { Button } from "./button"
import { Plus, Target, Mountain, CheckCircle, Star, Calendar } from "lucide-react"

interface EmptyStateProps {
  title: string
  description: string
  icon?: React.ComponentType<{ className?: string }>
  actionLabel?: string
  onAction?: () => void
  variant?: 'default' | 'goals' | 'habits' | 'skills' | 'monuments' | 'schedule'
}

export function EmptyState({ 
  title, 
  description, 
  icon: Icon, 
  actionLabel = "Create New", 
  onAction,
  variant = 'default'
}: EmptyStateProps) {
  const getDefaultIcon = () => {
    switch (variant) {
      case 'goals': return Target
      case 'habits': return CheckCircle
      case 'skills': return Star
      case 'monuments': return Mountain
      case 'schedule': return Calendar
      default: return Plus
    }
  }

  const DefaultIcon = Icon || getDefaultIcon()

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <DefaultIcon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">{description}</p>
      {onAction && (
        <Button onClick={onAction} className="gap-2">
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

// Predefined empty states for common scenarios
export function GoalsEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No goals yet"
      description="Create your first goal to start tracking your progress and achievements."
      variant="goals"
      actionLabel="Create Goal"
      onAction={onAction}
    />
  )
}

export function HabitsEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No habits yet"
      description="Build positive habits to improve your daily routine and productivity."
      variant="habits"
      actionLabel="Create Habit"
      onAction={onAction}
    />
  )
}

export function SkillsEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No skills yet"
      description="Track your skills and set targets to continuously improve and grow."
      variant="skills"
      actionLabel="Add Skill"
      onAction={onAction}
    />
  )
}

export function MonumentsEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No monuments yet"
      description="Celebrate your achievements and milestones by creating monuments."
      variant="monuments"
      actionLabel="Create Monument"
      onAction={onAction}
    />
  )
}

export function ScheduleEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No events scheduled"
      description="Plan your day by adding events and tasks to your schedule."
      variant="schedule"
      actionLabel="Add Event"
      onAction={onAction}
    />
  )
}

export function TasksEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No tasks yet"
      description="Organize your work by creating tasks and setting priorities."
      variant="default"
      actionLabel="Create Task"
      onAction={onAction}
    />
  )
}

export function ProjectsEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No projects yet"
      description="Start managing your projects and track their progress over time."
      variant="default"
      actionLabel="Create Project"
      onAction={onAction}
    />
  )
}
