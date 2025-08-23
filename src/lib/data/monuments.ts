import { createClient } from '@/lib/supabase-server'

export type Monument = { id: string; name: string; description?: string | null }

export async function listMonuments(): Promise<Monument[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('monuments')
    .select('id,name,description')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) { console.error('[listMonuments]', error); return [] }
  return data ?? []
}

export async function getMonument(id: string): Promise<Monument | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('monuments')
    .select('id,name,description')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()
  if (error) { console.error('[getMonument]', error); return null }
  return data
}
