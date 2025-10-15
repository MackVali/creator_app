import { cn } from "@/lib/utils"
import { ReactNode } from "react"

interface ContentCardProps {
  children: ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  shadow?: 'none' | 'sm' | 'md' | 'lg'
}

export function ContentCard({ 
  children, 
  className, 
  padding = 'md',
  shadow = 'sm'
}: ContentCardProps) {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  }

  const shadowClasses = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg'
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground",
        paddingClasses[padding],
        shadowClasses[shadow],
        "transition-all duration-200 hover:shadow-md",
        className
      )}
    >
      {children}
    </div>
  )
}

interface PageHeaderProps {
  title: ReactNode
  description?: string
  children?: ReactNode
  className?: string
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-8", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-2">{description}</p>
          )}
        </div>
        {children && (
          <div className="flex-shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

interface SectionHeaderProps {
  title: string
  description?: string
  children?: ReactNode
  className?: string
}

export function SectionHeader({ title, description, children, className }: SectionHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {children && (
          <div className="flex-shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

interface GridContainerProps {
  children: ReactNode
  className?: string
  cols?: 1 | 2 | 3 | 4
  gap?: 'sm' | 'md' | 'lg'
}

export function GridContainer({ 
  children, 
  className, 
  cols = 3,
  gap = 'md'
}: GridContainerProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  }

  const gapClasses = {
    sm: 'gap-3',
    md: 'gap-4',
    lg: 'gap-6'
  }

  return (
    <div className={cn("grid", gridCols[cols], gapClasses[gap], className)}>
      {children}
    </div>
  )
}

interface ListContainerProps {
  children: ReactNode
  className?: string
  gap?: 'sm' | 'md' | 'lg'
}

export function ListContainer({ children, className, gap = 'md' }: ListContainerProps) {
  const gapClasses = {
    sm: 'space-y-3',
    md: 'space-y-4',
    lg: 'space-y-6'
  }

  return (
    <div className={cn(gapClasses[gap], className)}>
      {children}
    </div>
  )
}
