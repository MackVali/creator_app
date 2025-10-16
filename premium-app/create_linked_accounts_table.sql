-- Create linked_accounts table for storing external social links
CREATE TABLE IF NOT EXISTS public.linked_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform text NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure one link per user per platform
CREATE UNIQUE INDEX IF NOT EXISTS linked_accounts_user_platform_idx
  ON public.linked_accounts (user_id, platform);

-- Trigger to update updated_at automatically
DROP TRIGGER IF EXISTS linked_accounts_set_updated_at ON public.linked_accounts;
CREATE TRIGGER linked_accounts_set_updated_at
  BEFORE UPDATE ON public.linked_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.linked_accounts ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "linked_accounts read" ON public.linked_accounts;
CREATE POLICY "linked_accounts read" ON public.linked_accounts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "linked_accounts insert self" ON public.linked_accounts;
CREATE POLICY "linked_accounts insert self" ON public.linked_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "linked_accounts update self" ON public.linked_accounts;
CREATE POLICY "linked_accounts update self" ON public.linked_accounts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "linked_accounts delete self" ON public.linked_accounts;
CREATE POLICY "linked_accounts delete self" ON public.linked_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Permissions
GRANT ALL ON public.linked_accounts TO authenticated;
