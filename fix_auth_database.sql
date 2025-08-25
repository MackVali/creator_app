-- Run this in your Supabase Dashboard SQL Editor to fix auth
-- This recreates the basic structure needed for authentication to work

-- 1. Create profiles table (required for auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  name text,
  bio text,
  dob date,
  city text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create skills table (for the skills feature)
CREATE TABLE IF NOT EXISTS public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL,
  monument_id uuid NULL,
  level int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create monuments table
CREATE TABLE IF NOT EXISTS public.monuments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create goals table
CREATE TABLE IF NOT EXISTS public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text DEFAULT 'planning',
  goal_id uuid REFERENCES public.goals(id),
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text DEFAULT 'todo',
  priority text DEFAULT 'medium',
  project_id uuid REFERENCES public.projects(id),
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Create habits table
CREATE TABLE IF NOT EXISTS public.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  frequency text DEFAULT 'daily',
  target_count int DEFAULT 1,
  current_streak int DEFAULT 0,
  longest_streak int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Create monument_skills join table
CREATE TABLE IF NOT EXISTS public.monument_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monument_id uuid NOT NULL REFERENCES public.monuments(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  skill_level_at_time int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Create schedule_items table
CREATE TABLE IF NOT EXISTS public.schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  category text DEFAULT 'personal',
  priority text DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monuments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monument_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;

-- 11. Create RLS policies for profiles
CREATE POLICY "select my profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "update my profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "insert my profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 12. Create RLS policies for skills
CREATE POLICY "select my skills" ON public.skills FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert my skills" ON public.skills FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 13. Create RLS policies for monuments
CREATE POLICY "select my monuments" ON public.monuments FOR SELECT USING (auth.uid() = user_id);

-- 14. Create RLS policies for goals
CREATE POLICY "select my goals" ON public.goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert my goals" ON public.goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update my goals" ON public.goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete my goals" ON public.goals FOR DELETE USING (auth.uid() = user_id);

-- 15. Create RLS policies for projects
CREATE POLICY "select my projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert my projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update my projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete my projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- 16. Create RLS policies for tasks
CREATE POLICY "select my tasks" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert my tasks" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update my tasks" ON public.tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete my tasks" ON public.tasks FOR DELETE USING (auth.uid() = user_id);

-- 17. Create RLS policies for habits
CREATE POLICY "select my habits" ON public.habits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert my habits" ON public.habits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update my habits" ON public.habits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete my habits" ON public.habits FOR DELETE USING (auth.uid() = user_id);

-- 18. Create RLS policies for monument_skills
CREATE POLICY "select my monument_skills" ON public.monument_skills FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.monuments m 
    WHERE m.id = monument_skills.monument_id 
    AND m.user_id = auth.uid()
  )
);

-- 19. Create RLS policies for schedule_items
CREATE POLICY "select my schedule_items" ON public.schedule_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert my schedule_items" ON public.schedule_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update my schedule_items" ON public.schedule_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete my schedule_items" ON public.schedule_items FOR DELETE USING (auth.uid() = user_id);

-- 20. Grant permissions to authenticated users
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.skills TO authenticated;
GRANT ALL ON public.monuments TO authenticated;
GRANT ALL ON public.goals TO authenticated;
GRANT ALL ON public.projects TO authenticated;
GRANT ALL ON public.tasks TO authenticated;
GRANT ALL ON public.habits TO authenticated;
GRANT ALL ON public.monument_skills TO authenticated;
GRANT ALL ON public.schedule_items TO authenticated;

-- 21. Create function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 22. Create trigger for auto-creating profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Success message
SELECT 'Database structure restored successfully! Auth should now work.' as message;
