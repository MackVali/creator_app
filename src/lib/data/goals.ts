'use server';

import { DbError, safeQuery } from '@/lib/db-utils';
import { createClient } from '@/lib/supabase-server';

export async function listGoals(): Promise<Array<{id:string;name:string;description?:string}>> {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  return safeQuery('listGoals', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('goals')
      .select('id,name,description')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new DbError('goals', error);
    return data || [];
  });
}

export async function getGoal(id: string): Promise<{id:string;name:string;description?:string}|null> {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  return safeQuery('getGoal', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('goals')
      .select('id,name,description')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new DbError('goals', error);
    return data as {id:string;name:string;description?:string} | null;
  });
}
