'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase-server';
import { DbError, safeQuery } from '@/lib/db-utils';

export async function createMonument(form: FormData) {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  await safeQuery('createMonument', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const name = form.get('name') as string | null;
    const description = form.get('description') as string | null;
    const { error } = await supabase
      .from('monuments')
      .insert({ name, description, user_id: user.id });
    if (error) throw new DbError('monuments', error);
  });
  revalidatePath('/monuments');
  revalidatePath('/dashboard');
}

export async function updateMonument(id: string, form: FormData) {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  await safeQuery('updateMonument', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const name = form.get('name') as string | null;
    const description = form.get('description') as string | null;
    const { error } = await supabase
      .from('monuments')
      .update({ name, description })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw new DbError('monuments', error);
  });
  revalidatePath('/monuments');
  revalidatePath('/dashboard');
}

export async function deleteMonument(id: string) {
  const supabase = await createClient();
  if (!supabase) throw new Error('No supabase client');
  await safeQuery('deleteMonument', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('monuments')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw new DbError('monuments', error);
  });
  revalidatePath('/monuments');
  revalidatePath('/dashboard');
}
