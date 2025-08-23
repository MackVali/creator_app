import { createClient } from '@/lib/supabase-server'

export type Skill = { id: string; name: string; description?: string | null }

export async function listSkills(): Promise<Skill[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('skills')
    .select('id,name,description')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) { console.error('[listSkills]', error); return [] }
  return data ?? []
}

export async function getSkill(id: string): Promise<Skill | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('skills')
    .select('id,name,description')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()
  if (error) { console.error('[getSkill]', error); return null }
  return data
}
