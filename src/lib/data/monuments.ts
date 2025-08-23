'use server';

import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function listMonuments(): Promise<Array<{id:string;name:string;description?:string}>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error('No supabase client');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  const { data, error } = await supabase
    .from('monuments')
    .select('id,name,description')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Array<{id:string;name:string;description?:string}>) || [];
}

export async function getMonument(id: string): Promise<{id:string;name:string;description?:string}|null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error('No supabase client');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  const { data, error } = await supabase
    .from('monuments')
    .select('id,name,description')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data as {id:string;name:string;description?:string} | null;
}
