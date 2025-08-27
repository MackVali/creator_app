-- Add performance indexes for profile links (content_cards table)
-- This migration optimizes queries for profile link display

-- Add index for user_id + order_index for efficient profile link queries
CREATE INDEX IF NOT EXISTS idx_content_cards_user_order 
ON public.content_cards(user_id, position);

-- Add index for user_id + is_active for filtering active links
CREATE INDEX IF NOT EXISTS idx_content_cards_user_active 
ON public.content_cards(user_id, is_active);

-- Add index for username lookups in profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_username_lookup 
ON public.profiles(lower(username));

-- Add index for verified profiles (for potential future features)
CREATE INDEX IF NOT EXISTS idx_profiles_verified 
ON public.profiles(verified) WHERE verified = true;
