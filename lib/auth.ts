import { supabase } from './supabase'
import { User } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string
  created_at: string
}

// Check if Supabase client is available
function checkSupabase() {
  if (!supabase) {
    throw new Error('Supabase client not initialized - check environment variables')
  }
}

export async function signInWithMagicLink(email: string) {
  checkSupabase()
  const { error } = await supabase!.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  return { error }
}

export async function signOut() {
  checkSupabase()
  const { error } = await supabase!.auth.signOut()
  return { error }
}

export async function getCurrentUser(): Promise<User | null> {
  checkSupabase()
  const { data: { user } } = await supabase!.auth.getUser()
  return user
}

export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser()
  return user?.id || null
}

export function onAuthStateChange(callback: (user: User | null) => void) {
  checkSupabase()
  return supabase!.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null)
  })
}
