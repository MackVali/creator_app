'use server';

import { DbError, safeQuery } from '@/lib/db-utils';
import { createClient } from '@/lib/supabase-server';

export async function listSkills(): Promise<Array<{id:string;name:string;description?:string}>> {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  return safeQuery('listSkills', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('skills')
      .select('id,name,description')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new DbError('skills', error);
    return data || [];
  });
}

export async function getSkill(id: string): Promise<{id:string;name:string;description?:string}|null> {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  return safeQuery('getSkill', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('skills')
      .select('id,name,description')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new DbError('skills', error);
    return data as {id:string;name:string;description?:string} | null;
  });
}
