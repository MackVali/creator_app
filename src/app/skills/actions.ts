'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase-server';
import { DbError, safeQuery } from '@/lib/db-utils';

export async function createSkill(form: FormData) {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  await safeQuery('createSkill', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const name = form.get('name') as string | null;
    const description = form.get('description') as string | null;
    const { error } = await supabase
      .from('skills')
      .insert({ name, description, user_id: user.id });
    if (error) throw new DbError('skills', error);
  });
  revalidatePath('/skills');
  revalidatePath('/dashboard');
}

export async function updateSkill(id: string, form: FormData) {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  await safeQuery('updateSkill', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const name = form.get('name') as string | null;
    const description = form.get('description') as string | null;
    const { error } = await supabase
      .from('skills')
      .update({ name, description })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw new DbError('skills', error);
  });
  revalidatePath('/skills');
  revalidatePath('/dashboard');
}

export async function deleteSkill(id: string) {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  await safeQuery('deleteSkill', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('skills')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw new DbError('skills', error);
  });
  revalidatePath('/skills');
  revalidatePath('/dashboard');
}
