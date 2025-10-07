import { ReactNode } from "react";
import { Button } from "./button";
import {
  Plus,
  Target,
  Mountain,
  CheckCircle,
  Star,
  Calendar,
} from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description: string;
  cta?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, cta, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && (
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          {icon}
        </div>
      )}
      {title && <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>}
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">{description}</p>
      {cta}
    </div>
  );
}

export function GoalsEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No goals yet"
      description="Create your first goal to start tracking your progress and achievements."
      icon={<Target className="h-8 w-8 text-muted-foreground" />}
      cta={
        onAction ? (
          <Button onClick={onAction} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Goal
          </Button>
        ) : null
      }
    />
  );
}

export function HabitsEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No habits yet"
      description="Build positive habits and routines to improve your daily rhythm and productivity."
      icon={<CheckCircle className="h-8 w-8 text-muted-foreground" />}
      cta={
        onAction ? (
          <Button onClick={onAction} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Habit
          </Button>
        ) : null
      }
    />
  );
}

export function SkillsEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No skills yet"
      description="Track your skills and set targets to continuously improve and grow."
      icon={<Star className="h-8 w-8 text-muted-foreground" />}
      cta={
        onAction ? (
          <Button onClick={onAction} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Skill
          </Button>
        ) : null
      }
    />
  );
}

export function MonumentsEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No monuments yet"
      description="Celebrate your achievements and milestones by creating monuments."
      icon={<Mountain className="h-8 w-8 text-muted-foreground" />}
      cta={
        onAction ? (
          <Button onClick={onAction} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Monument
          </Button>
        ) : null
      }
    />
  );
}

export function ScheduleEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No events scheduled"
      description="Plan your day by adding events and tasks to your schedule."
      icon={<Calendar className="h-8 w-8 text-muted-foreground" />}
      cta={
        onAction ? (
          <Button onClick={onAction} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Event
          </Button>
        ) : null
      }
    />
  );
}

export function TasksEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No tasks yet"
      description="Organize your work by creating tasks and setting priorities."
      icon={<Plus className="h-8 w-8 text-muted-foreground" />}
      cta={
        onAction ? (
          <Button onClick={onAction} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Task
          </Button>
        ) : null
      }
    />
  );
}

export function ProjectsEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      title="No projects yet"
      description="Start managing your projects and track their progress over time."
      icon={<Plus className="h-8 w-8 text-muted-foreground" />}
      cta={
        onAction ? (
          <Button onClick={onAction} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Project
          </Button>
        ) : null
      }
    />
  );
}
