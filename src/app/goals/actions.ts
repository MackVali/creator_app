'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

export async function createGoal(form: FormData) {
  const name = String(form.get('name') ?? '').trim()
  const description = String(form.get('description') ?? '').trim() || null
  if (!name) return
  const supabase = await createClient()
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('goals').insert({ name, description, user_id: user.id })
  if (error) console.error('[createGoal]', error)
  revalidatePath('/goals'); revalidatePath('/dashboard')
}

export async function updateGoal(form: FormData) {
  const id = String(form.get('id') ?? '')
  const name = String(form.get('name') ?? '').trim()
  const description = String(form.get('description') ?? '').trim() || null
  if (!id || !name) return
  const supabase = await createClient()
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('goals')
    .update({ name, description }).eq('id', id).eq('user_id', user.id)
  if (error) console.error('[updateGoal]', error)
  revalidatePath(`/goals/${id}`); revalidatePath('/goals'); revalidatePath('/dashboard')
}

export async function deleteGoal(form: FormData) {
  const id = String(form.get('id') ?? '')
  if (!id) return
  const supabase = await createClient()
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', user.id)
  if (error) console.error('[deleteGoal]', error)
  revalidatePath('/goals'); revalidatePath('/dashboard')
}
