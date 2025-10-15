-- Base schema migration that creates all necessary tables
-- This runs before the remote schema migration to ensure tables exist

-- Create basic tables that the remote schema expects to exist
CREATE TABLE IF NOT EXISTS public.goals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_current boolean DEFAULT false NOT NULL,
    priority_id bigint NOT NULL,
    energy_id bigint NOT NULL,
    stage_id bigint NOT NULL,
    monument_id uuid NOT NULL,
    Title text DEFAULT 'NEW GOAL' NOT NULL,
    user_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.habits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recurrence bigint,
    Title text,
    type_id bigint DEFAULT 1,
    skill_id uuid,
    user_id uuid
);

CREATE TABLE IF NOT EXISTS public.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    energy_id bigint,
    priority_id bigint,
    goal_id uuid,
    stage_id bigint NOT NULL,
    Title text DEFAULT 'NEW PROJECT' NOT NULL,
    user_id uuid
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    priority_id bigint DEFAULT 2,
    energy_id bigint DEFAULT 2,
    stage_id bigint DEFAULT 1 NOT NULL,
    project_id uuid NOT NULL,
    Title text DEFAULT 'NEW TASK' NOT NULL,
    user_id uuid
);

CREATE TABLE IF NOT EXISTS public.skills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    Title text,
    cat_id uuid,
    user_id uuid
);

CREATE TABLE IF NOT EXISTS public.monuments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    Title text,
    description text,
    user_id uuid
);

-- Create lookup tables
CREATE TABLE IF NOT EXISTS public.energy (
    id bigint PRIMARY KEY,
    name text NOT NULL,
    order_index numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS public.priority (
    id bigint PRIMARY KEY,
    name text NOT NULL,
    order_index numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS public.goal_stage (
    id bigint PRIMARY KEY,
    name text,
    order_index numeric
);

CREATE TABLE IF NOT EXISTS public.project_stage (
    id bigint PRIMARY KEY,
    name text NOT NULL,
    order_index numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS public.task_stage (
    id bigint PRIMARY KEY,
    name text,
    order_index numeric
);

CREATE TABLE IF NOT EXISTS public.habit_types (
    id bigint PRIMARY KEY,
    name text
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    username text NOT NULL
);

-- Create monument_skills join table
CREATE TABLE IF NOT EXISTS public.monument_skills (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    monument_id uuid,
    skill_id uuid
);

-- Enable RLS on all tables
ALTER TABLE public.energy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monument_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monuments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priority ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies
CREATE POLICY "energy_read_all" ON public.energy FOR SELECT USING (true);
CREATE POLICY "goal_stage_read_all" ON public.goal_stage FOR SELECT USING (true);
CREATE POLICY "goals_select_own" ON public.goals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "habit_types_read_all" ON public.habit_types FOR SELECT USING (true);
CREATE POLICY "habits_select_own" ON public.habits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "monuments_select_own" ON public.monuments FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "priority_read_all" ON public.priority FOR SELECT USING (true);
CREATE POLICY "project_stage_read_all" ON public.project_stage FOR SELECT USING (true);
CREATE POLICY "projects_select_own" ON public.projects FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "skills_select_own" ON public.skills FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "task_stage_read_all" ON public.task_stage FOR SELECT USING (true);
CREATE POLICY "tasks_select_own" ON public.tasks FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Grant permissions
GRANT ALL ON public.energy TO anon, authenticated, service_role;
GRANT ALL ON public.goal_stage TO anon, authenticated, service_role;
GRANT ALL ON public.goals TO anon, authenticated, service_role;
GRANT ALL ON public.habit_types TO anon, authenticated, service_role;
GRANT ALL ON public.habits TO anon, authenticated, service_role;
GRANT ALL ON public.monument_skills TO anon, authenticated, service_role;
GRANT ALL ON public.monuments TO anon, authenticated, service_role;
GRANT ALL ON public.priority TO anon, authenticated, service_role;
GRANT ALL ON public.profiles TO anon, authenticated, service_role;
GRANT ALL ON public.project_stage TO anon, authenticated, service_role;
GRANT ALL ON public.projects TO anon, authenticated, service_role;
GRANT ALL ON public.skills TO anon, authenticated, service_role;
GRANT ALL ON public.task_stage TO anon, authenticated, service_role;
GRANT ALL ON public.tasks TO anon, authenticated, service_role;
