'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase-server';
import { DbError, safeQuery } from '@/lib/db-utils';

export async function createGoal(form: FormData) {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  await safeQuery('createGoal', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const name = form.get('name') as string | null;
    const description = form.get('description') as string | null;
    const { error } = await supabase
      .from('goals')
      .insert({ name, description, user_id: user.id });
    if (error) throw new DbError('goals', error);
  });
  revalidatePath('/goals');
  revalidatePath('/dashboard');
}

export async function updateGoal(id: string, form: FormData) {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  await safeQuery('updateGoal', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const name = form.get('name') as string | null;
    const description = form.get('description') as string | null;
    const { error } = await supabase
      .from('goals')
      .update({ name, description })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw new DbError('goals', error);
  });
  revalidatePath('/goals');
  revalidatePath('/dashboard');
}

export async function deleteGoal(id: string) {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  await safeQuery('deleteGoal', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw new DbError('goals', error);
  });
  revalidatePath('/goals');
  revalidatePath('/dashboard');
}
