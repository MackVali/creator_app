'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

export async function createMonument(form: FormData) {
  const name = String(form.get('name') ?? '').trim()
  const description = String(form.get('description') ?? '').trim() || null
  if (!name) return
  const supabase = await createClient()
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('monuments').insert({ name, description, user_id: user.id })
  if (error) console.error('[createMonument]', error)
  revalidatePath('/monuments'); revalidatePath('/dashboard')
}

export async function updateMonument(form: FormData) {
  const id = String(form.get('id') ?? '')
  const name = String(form.get('name') ?? '').trim()
  const description = String(form.get('description') ?? '').trim() || null
  if (!id || !name) return
  const supabase = await createClient()
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('monuments')
    .update({ name, description }).eq('id', id).eq('user_id', user.id)
  if (error) console.error('[updateMonument]', error)
  revalidatePath(`/monuments/${id}`); revalidatePath('/monuments'); revalidatePath('/dashboard')
}

export async function deleteMonument(form: FormData) {
  const id = String(form.get('id') ?? '')
  if (!id) return
  const supabase = await createClient()
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('monuments').delete().eq('id', id).eq('user_id', user.id)
  if (error) console.error('[deleteMonument]', error)
  revalidatePath('/monuments'); revalidatePath('/dashboard')
}
