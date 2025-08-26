-- Migration: Create Goals, Projects, Tasks, and Habits system
-- Date: 2025-01-01
-- Description: Core productivity system with user ownership and RLS

-- 1. Create ENUMs in specified order
CREATE TYPE priority_enum AS ENUM ('NO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'ULTRA-CRITICAL');
CREATE TYPE energy_enum AS ENUM ('NO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'EXTREME');
CREATE TYPE project_stage_enum AS ENUM ('RESEARCH', 'TEST', 'BUILD', 'REFINE', 'RELEASE');
CREATE TYPE task_stage_enum AS ENUM ('PREPARE', 'PRODUCE', 'PERFECT');
CREATE TYPE habit_type_enum AS ENUM ('HABIT', 'CHORE');
CREATE TYPE recurrence_enum AS ENUM ('daily', 'weekly', 'bi-weekly', 'monthly', 'bi-monthly', 'yearly', 'every x days');

-- 2. Create core tables
CREATE TABLE IF NOT EXISTS public.goals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    monument_id uuid REFERENCES public.monuments(id) ON DELETE SET NULL,
    priority priority_enum NOT NULL DEFAULT 'NO',
    energy energy_enum NOT NULL DEFAULT 'NO',
    why text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
    name text NOT NULL,
    priority priority_enum NOT NULL DEFAULT 'NO',
    energy energy_enum NOT NULL DEFAULT 'NO',
    stage project_stage_enum NOT NULL DEFAULT 'RESEARCH',
    why text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
    name text NOT NULL,
    priority priority_enum NOT NULL DEFAULT 'NO',
    energy energy_enum NOT NULL DEFAULT 'NO',
    stage task_stage_enum NOT NULL DEFAULT 'PREPARE',
    skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
    why text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.habits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    type habit_type_enum NOT NULL,
    energy energy_enum NOT NULL DEFAULT 'NO',
    recurrence recurrence_enum NOT NULL,
    skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- 3. Create optional join table for multi-skill projects
CREATE TABLE IF NOT EXISTS public.project_skills (
    project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    skill_id uuid REFERENCES public.skills(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, skill_id)
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_priority ON public.goals(priority);
CREATE INDEX IF NOT EXISTS idx_goals_energy ON public.goals(energy);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_goal_id ON public.projects(goal_id);
CREATE INDEX IF NOT EXISTS idx_projects_stage ON public.projects(stage);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON public.tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_stage ON public.tasks(stage);

CREATE INDEX IF NOT EXISTS idx_habits_user_id ON public.habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_type ON public.habits(type);

-- 5. Enable Row Level Security
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_skills ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for all tables
-- Goals policies
CREATE POLICY "goals_select_own" ON public.goals
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "goals_insert_own" ON public.goals
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "goals_update_own" ON public.goals
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "goals_delete_own" ON public.goals
    FOR DELETE USING (user_id = auth.uid());

-- Projects policies
CREATE POLICY "projects_select_own" ON public.projects
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "projects_insert_own" ON public.projects
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "projects_update_own" ON public.projects
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "projects_delete_own" ON public.projects
    FOR DELETE USING (user_id = auth.uid());

-- Tasks policies
CREATE POLICY "tasks_select_own" ON public.tasks
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tasks_insert_own" ON public.tasks
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tasks_update_own" ON public.tasks
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "tasks_delete_own" ON public.tasks
    FOR DELETE USING (user_id = auth.uid());

-- Habits policies
CREATE POLICY "habits_select_own" ON public.habits
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "habits_insert_own" ON public.habits
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "habits_update_own" ON public.habits
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "habits_delete_own" ON public.habits
    FOR DELETE USING (user_id = auth.uid());

-- Project skills policies (users can only see skills for their own projects)
CREATE POLICY "project_skills_select_own" ON public.project_skills
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_skills.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "project_skills_insert_own" ON public.project_skills
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_skills.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "project_skills_delete_own" ON public.project_skills
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_skills.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- 7. Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.project_skills TO authenticated;

-- 8. Grant usage on sequences (if using serial IDs)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
