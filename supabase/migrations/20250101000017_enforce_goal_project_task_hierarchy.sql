-- Migration: Enforce Goal → Project → Task Hierarchy
-- This migration ensures proper relationship constraints and backfills orphan data

-- 1. Backfill orphan projects (projects without goal_id)
-- First, create "Inbox Goal" for each user who has orphan projects
INSERT INTO public.goals (id, user_id, name, priority, energy, why, created_at)
SELECT 
    gen_random_uuid(),
    user_id,
    'Inbox Goal',
    'NO',
    'NO',
    'Auto-created goal for orphaned projects',
    now()
FROM (
    SELECT DISTINCT user_id 
    FROM public.projects 
    WHERE goal_id IS NULL
) AS orphan_projects
ON CONFLICT DO NOTHING;

-- Update orphan projects to use their user's "Inbox Goal"
UPDATE public.projects 
SET goal_id = (
    SELECT id 
    FROM public.goals 
    WHERE user_id = projects.user_id 
    AND name = 'Inbox Goal'
    LIMIT 1
)
WHERE goal_id IS NULL;

-- 2. Backfill orphan tasks (tasks without project_id)
-- First, create "Inbox Project" under each user's "Inbox Goal" for orphan tasks
INSERT INTO public.projects (id, user_id, goal_id, name, priority, energy, stage, why, created_at)
SELECT 
    gen_random_uuid(),
    user_id,
    goal_id,
    'Inbox Project',
    'NO',
    'NO',
    'RESEARCH',
    'Auto-created project for orphaned tasks',
    now()
FROM (
    SELECT DISTINCT t.user_id, g.id as goal_id
    FROM public.tasks t
    JOIN public.goals g ON g.user_id = t.user_id AND g.name = 'Inbox Goal'
    WHERE t.project_id IS NULL
) AS orphan_tasks
ON CONFLICT DO NOTHING;

-- Update orphan tasks to use their user's "Inbox Project"
UPDATE public.tasks 
SET project_id = (
    SELECT p.id 
    FROM public.projects p
    JOIN public.goals g ON g.id = p.goal_id
    WHERE g.user_id = tasks.user_id 
    AND g.name = 'Inbox Goal'
    AND p.name = 'Inbox Project'
    LIMIT 1
)
WHERE project_id IS NULL;

-- 3. Drop tasks.goal_id column if it exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'goal_id'
    ) THEN
        ALTER TABLE public.tasks DROP COLUMN goal_id;
    END IF;
END $$;

-- 4. Drop existing foreign key constraints if they exist
DO $$ 
BEGIN
    -- Drop projects.goal_id FK if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'projects' 
        AND constraint_name LIKE '%goal_id%'
        AND constraint_type = 'FOREIGN KEY'
    ) THEN
        ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_goal_id_fkey;
    END IF;
    
    -- Drop tasks.project_id FK if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'tasks' 
        AND constraint_name LIKE '%project_id%'
        AND constraint_type = 'FOREIGN KEY'
    ) THEN
        ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;
    END IF;
END $$;

-- 5. Make projects.goal_id NOT NULL and add FK with CASCADE
ALTER TABLE public.projects ALTER COLUMN goal_id SET NOT NULL;
ALTER TABLE public.projects ADD CONSTRAINT projects_goal_id_fkey 
    FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

-- 6. Make tasks.project_id NOT NULL and add FK with CASCADE
ALTER TABLE public.tasks ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- 7. Create useful composite indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_goal ON public.projects(user_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_project ON public.tasks(user_id, project_id);

-- 8. Ensure RLS is enabled and policies exist
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Goals policies (idempotent)
DROP POLICY IF EXISTS "goals_select_own" ON public.goals;
CREATE POLICY "goals_select_own" ON public.goals
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "goals_insert_own" ON public.goals;
CREATE POLICY "goals_insert_own" ON public.goals
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "goals_update_own" ON public.goals;
CREATE POLICY "goals_update_own" ON public.goals
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "goals_delete_own" ON public.goals;
CREATE POLICY "goals_delete_own" ON public.goals
    FOR DELETE USING (user_id = auth.uid());

-- Projects policies (idempotent)
DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
CREATE POLICY "projects_select_own" ON public.projects
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "projects_insert_own" ON public.projects;
CREATE POLICY "projects_insert_own" ON public.projects
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "projects_update_own" ON public.projects;
CREATE POLICY "projects_update_own" ON public.projects
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "projects_delete_own" ON public.projects;
CREATE POLICY "projects_delete_own" ON public.projects
    FOR DELETE USING (user_id = auth.uid());

-- Tasks policies (idempotent)
DROP POLICY IF EXISTS "tasks_select_own" ON public.tasks;
CREATE POLICY "tasks_select_own" ON public.tasks
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tasks_insert_own" ON public.tasks;
CREATE POLICY "tasks_insert_own" ON public.tasks
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tasks_update_own" ON public.tasks;
CREATE POLICY "tasks_update_own" ON public.tasks
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tasks_delete_own" ON public.tasks;
CREATE POLICY "tasks_delete_own" ON public.tasks
    FOR DELETE USING (user_id = auth.uid());

-- 9. Add helpful comments
COMMENT ON TABLE public.goals IS 'User goals - top level planning items';
COMMENT ON TABLE public.projects IS 'Projects must belong to exactly one goal';
COMMENT ON TABLE public.tasks IS 'Tasks must belong to exactly one project (goal derived via project)';
COMMENT ON COLUMN public.projects.goal_id IS 'Required reference to parent goal';
COMMENT ON COLUMN public.tasks.project_id IS 'Required reference to parent project';
