import { getSupabaseBrowser } from '@/lib/supabase/browser';

export type GoalRow = {
  id: string;
  name: string;
  priority: string;
  energy: string;
  monument_id: string | null;
  created_at?: string | null;
};

export async function getGoalsByMonument(
  userId: string,
  monumentId: string,
  limit = 12
): Promise<GoalRow[]> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from('goals')
    .select('id, name:Title, priority:priority_id, energy:energy_id, monument_id, created_at')
    .eq('user_id', userId)
    .eq('monument_id', monumentId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as GoalRow[];
}
