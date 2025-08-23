'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function createMonument(form: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error('No supabase client');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  const name = form.get('name') as string | null;
  const description = form.get('description') as string | null;
  const { error } = await supabase
    .from('monuments')
    .insert({ name, description, user_id: user.id });
  if (error) {
    console.error(error);
    throw new Error(error.message);
  }
  revalidatePath('/monuments');
  revalidatePath('/dashboard');
}

export async function updateMonument(id: string, form: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error('No supabase client');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  const name = form.get('name') as string | null;
  const description = form.get('description') as string | null;
  const { error } = await supabase
    .from('monuments')
    .update({ name, description })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) {
    console.error(error);
    throw new Error(error.message);
  }
  revalidatePath('/monuments');
  revalidatePath('/dashboard');
}

export async function deleteMonument(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error('No supabase client');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  const { error } = await supabase
    .from('monuments')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) {
    console.error(error);
    throw new Error(error.message);
  }
  revalidatePath('/monuments');
  revalidatePath('/dashboard');
}
