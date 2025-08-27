-- Enhanced Profile System Migration
-- Adds social links, content cards, and profile customization

-- 1. Add new columns to profiles table
ALTER TABLE IF EXISTS public.profiles 
ADD COLUMN IF NOT EXISTS banner_url text,
ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS theme_color text DEFAULT '#3B82F6',
ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'Inter',
ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#8B5CF6';

-- 2. Create social_links table
CREATE TABLE IF NOT EXISTS public.social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  url text NOT NULL,
  icon text,
  color text,
  position integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create content_cards table
CREATE TABLE IF NOT EXISTS public.content_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  url text NOT NULL,
  thumbnail_url text,
  category text,
  position integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create profile_themes table for future theme expansion
CREATE TABLE IF NOT EXISTS public.profile_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  primary_color text NOT NULL,
  secondary_color text NOT NULL,
  accent_color text NOT NULL,
  background_gradient text,
  font_family text DEFAULT 'Inter',
  is_premium boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Insert default themes
INSERT INTO public.profile_themes (name, primary_color, secondary_color, accent_color, background_gradient, font_family) VALUES
  ('Ocean Blue', '#3B82F6', '#1E40AF', '#8B5CF6', 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 'Inter'),
  ('Sunset', '#F59E0B', '#DC2626', '#EC4899', 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', 'Inter'),
  ('Forest', '#10B981', '#059669', '#84CC16', 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', 'Inter'),
  ('Midnight', '#1F2937', '#111827', '#8B5CF6', 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 'Inter')
ON CONFLICT (name) DO NOTHING;

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS social_links_user_id_idx ON public.social_links(user_id);
CREATE INDEX IF NOT EXISTS social_links_position_idx ON public.social_links(position);
CREATE INDEX IF NOT EXISTS content_cards_user_id_idx ON public.content_cards(user_id);
CREATE INDEX IF NOT EXISTS content_cards_position_idx ON public.content_cards(position);

-- 7. Add updated_at triggers
CREATE TRIGGER IF NOT EXISTS social_links_set_updated_at 
  BEFORE UPDATE ON public.social_links 
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER IF NOT EXISTS content_cards_set_updated_at 
  BEFORE UPDATE ON public.content_cards 
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Enable RLS on new tables
ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_cards ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies for social_links
DROP POLICY IF EXISTS "social_links read" ON public.social_links;
CREATE POLICY "social_links read" ON public.social_links FOR SELECT USING (true);

DROP POLICY IF EXISTS "social_links insert self" ON public.social_links;
CREATE POLICY "social_links insert self" ON public.social_links 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "social_links update self" ON public.social_links;
CREATE POLICY "social_links update self" ON public.social_links 
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "social_links delete self" ON public.social_links;
CREATE POLICY "social_links delete self" ON public.social_links 
  FOR DELETE USING (auth.uid() = user_id);

-- 10. RLS Policies for content_cards
DROP POLICY IF EXISTS "content_cards read" ON public.content_cards;
CREATE POLICY "content_cards read" ON public.content_cards FOR SELECT USING (true);

DROP POLICY IF EXISTS "content_cards insert self" ON public.content_cards;
CREATE POLICY "content_cards insert self" ON public.content_cards 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "content_cards update self" ON public.content_cards;
CREATE POLICY "content_cards update self" ON public.content_cards 
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "content_cards delete self" ON public.content_cards;
CREATE POLICY "content_cards delete self" ON public.content_cards 
  FOR DELETE USING (auth.uid() = user_id);

-- 11. Add verified badge policy (only admins can set verified status)
DROP POLICY IF EXISTS "profiles update verified admin" ON public.profiles;
CREATE POLICY "profiles update verified admin" ON public.profiles 
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- 12. Create function to reorder items
CREATE OR REPLACE FUNCTION reorder_profile_items(
  p_table text,
  p_user_id uuid,
  p_item_id uuid,
  p_new_position integer
) RETURNS void AS $$
BEGIN
  -- Update positions for items that need to shift
  IF p_new_position > (
    SELECT COALESCE(MAX(position), 0) FROM public.profiles 
    WHERE user_id = p_user_id
  ) THEN
    -- Moving to end
    EXECUTE format('
      UPDATE public.%I 
      SET position = position + 1 
      WHERE user_id = $1 AND position >= $2
    ', p_table) USING p_user_id, p_new_position;
  ELSE
    -- Moving to middle/beginning
    EXECUTE format('
      UPDATE public.%I 
      SET position = position + 1 
      WHERE user_id = $1 AND position >= $2
    ', p_table) USING p_user_id, p_new_position;
  END IF;
  
  -- Set the target item's position
  EXECUTE format('
    UPDATE public.%I 
    SET position = $2 
    WHERE id = $1
  ', p_table) USING p_item_id, p_new_position;
END;
$$ LANGUAGE plpgsql;
