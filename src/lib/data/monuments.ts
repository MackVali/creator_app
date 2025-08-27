import { getSupabaseBrowser } from '@/lib/supabase/browser';

export type MonumentRow = {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  created_at?: string | null;
};

export async function getMonumentById(userId: string, id: string): Promise<MonumentRow | null> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from('monuments')
    .select('id, user_id, name, emoji, created_at')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as MonumentRow | null;
}

export async function updateMonument(
  userId: string,
  id: string,
  patch: { name?: string; emoji?: string }
): Promise<MonumentRow> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from('monuments')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', id)
    .select('id, user_id, name, emoji, created_at')
    .single();
  if (error) throw error;
  return data as MonumentRow;
}
