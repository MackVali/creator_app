'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

export async function createSkill(form: FormData) {
  const name = String(form.get('name') ?? '').trim()
  const description = String(form.get('description') ?? '').trim() || null
  if (!name) return
  const supabase = await createClient()
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('skills').insert({ name, description, user_id: user.id })
  if (error) console.error('[createSkill]', error)
  revalidatePath('/skills'); revalidatePath('/dashboard')
}

export async function updateSkill(form: FormData) {
  const id = String(form.get('id') ?? '')
  const name = String(form.get('name') ?? '').trim()
  const description = String(form.get('description') ?? '').trim() || null
  if (!id || !name) return
  const supabase = await createClient()
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('skills')
    .update({ name, description }).eq('id', id).eq('user_id', user.id)
  if (error) console.error('[updateSkill]', error)
  revalidatePath(`/skills/${id}`); revalidatePath('/skills'); revalidatePath('/dashboard')
}

export async function deleteSkill(form: FormData) {
  const id = String(form.get('id') ?? '')
  if (!id) return
  const supabase = await createClient()
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('skills').delete().eq('id', id).eq('user_id', user.id)
  if (error) console.error('[deleteSkill]', error)
  revalidatePath('/skills'); revalidatePath('/dashboard')
}
