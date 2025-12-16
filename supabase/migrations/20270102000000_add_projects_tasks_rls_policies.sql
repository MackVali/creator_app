-- Add missing UPDATE and DELETE RLS policies for projects and tasks tables
-- This enables client-side editing and deletion of projects and tasks

-- Projects table policies
CREATE POLICY "projects_update_own" ON public.projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "projects_delete_own" ON public.projects FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Tasks table policies
CREATE POLICY "tasks_update_own" ON public.tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tasks_delete_own" ON public.tasks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
