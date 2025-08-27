import { createClient } from '@/lib/supabase/browser';

export type SkillRow = {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  cat_id: string | null;
  monument_id: string | null;
  level: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const selectColumns = 'id,name,icon,cat_id,monument_id,level,created_at,updated_at,user_id';

export async function getSkillsForUser(userId: string) {
  const sb = createClient();
  const { data, error } = await sb
    .from('skills')
    .select(selectColumns)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

export async function getSkillsByCat(userId: string, catId?: string | null) {
  const sb = createClient();
  let query = sb
    .from('skills')
    .select(selectColumns)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (catId) {
    query = query.eq('cat_id', catId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

export function groupSkillsByCat(rows: SkillRow[]): Record<string, SkillRow[]> {
  return rows.reduce((acc, row) => {
    const key = row.cat_id ?? 'null';
    (acc[key] ||= []).push(row);
    return acc;
  }, {} as Record<string, SkillRow[]>);
}
