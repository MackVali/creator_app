'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function createGoal(form: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error('No supabase client');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  const name = form.get('name') as string | null;
  const description = form.get('description') as string | null;
  const { error } = await supabase
    .from('goals')
    .insert({ name, description, user_id: user.id });
  if (error) {
    console.error(error);
    throw new Error(error.message);
  }
  revalidatePath('/goals');
  revalidatePath('/dashboard');
}

export async function updateGoal(id: string, form: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error('No supabase client');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  const name = form.get('name') as string | null;
  const description = form.get('description') as string | null;
  const { error } = await supabase
    .from('goals')
    .update({ name, description })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) {
    console.error(error);
    throw new Error(error.message);
  }
  revalidatePath('/goals');
  revalidatePath('/dashboard');
}

export async function deleteGoal(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error('No supabase client');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) {
    console.error(error);
    throw new Error(error.message);
  }
  revalidatePath('/goals');
  revalidatePath('/dashboard');
}
