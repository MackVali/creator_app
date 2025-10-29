CREATE TABLE IF NOT EXISTS public.source_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  caption text,
  media_url text,
  media_alt text,
  link_url text,
  metadata jsonb,
  status text NOT NULL DEFAULT 'draft',
  publish_results jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.source_posts
  ADD CONSTRAINT source_posts_status_check CHECK (status IN ('draft', 'queued', 'published', 'needs_attention'));

CREATE INDEX IF NOT EXISTS source_posts_user_idx
  ON public.source_posts (user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS source_posts_set_updated_at ON public.source_posts;
CREATE TRIGGER source_posts_set_updated_at
  BEFORE UPDATE ON public.source_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.source_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "source_posts_select" ON public.source_posts;
CREATE POLICY "source_posts_select" ON public.source_posts
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_posts_insert" ON public.source_posts;
CREATE POLICY "source_posts_insert" ON public.source_posts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_posts_update" ON public.source_posts;
CREATE POLICY "source_posts_update" ON public.source_posts
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_posts_delete" ON public.source_posts;
CREATE POLICY "source_posts_delete" ON public.source_posts
  FOR DELETE
  USING (auth.uid() = user_id);

GRANT ALL ON public.source_posts TO authenticated;
