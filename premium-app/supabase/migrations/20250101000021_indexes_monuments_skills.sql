-- Migration: Add performance indexes for monuments and skills queries
-- Date: 2025-01-01
-- Description: Add indexes to improve performance of filtered goals queries

-- Index for monument goals queries
CREATE INDEX IF NOT EXISTS idx_goals_user_monument ON public.goals(user_id, monument_id);

-- Index for skill-related task queries
CREATE INDEX IF NOT EXISTS idx_tasks_skill ON public.tasks(skill_id);

-- Index for skill-related project_skills queries
CREATE INDEX IF NOT EXISTS idx_project_skills_skill ON public.project_skills(skill_id);

-- Index for user_id filtering on goals (if not already exists)
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);

-- Index for user_id filtering on tasks (if not already exists)
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);

-- Index for user_id filtering on projects (if not already exists)
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

-- Index for project_skills project_id (if not already exists)
CREATE INDEX IF NOT EXISTS idx_project_skills_project ON public.project_skills(project_id);

-- Success message
SELECT 'Performance indexes for monuments and skills queries added successfully!' as status;
