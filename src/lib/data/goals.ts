import { createClient } from '@/lib/supabase-server'

export type Goal = { id: string; name: string; description?: string | null }

export async function listGoals(): Promise<Goal[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('goals')
    .select('id,name,description')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) { console.error('[listGoals]', error); return [] }
  return data ?? []
}

export async function getGoal(id: string): Promise<Goal | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('goals')
    .select('id,name,description')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()
  if (error) { console.error('[getGoal]', error); return null }
  return data
}
