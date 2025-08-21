import { supabase } from './supabase'
import { getCurrentUserId } from './auth'
import { PostgrestError } from '@supabase/supabase-js'

// Helper function to get the current user's ID
export async function getUserId() {
  const userId = await getCurrentUserId()
  if (!userId) {
    throw new Error('User not authenticated')
  }
  return userId
}

// Check if Supabase client is available
function checkSupabase() {
  if (!supabase) {
    throw new Error('Supabase client not initialized - check environment variables')
  }
}

// Generic create function that automatically adds user_id
export async function createRecord<T>(
  table: string,
  data: Omit<T, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<{ data: T | null; error: PostgrestError | null }> {
  checkSupabase()
  const userId = await getUserId()
  
  const recordData = {
    ...data,
    user_id: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data: result, error } = await supabase!
    .from(table)
    .insert(recordData)
    .select()
    .single()

  return { data: result as T | null, error }
}

// Generic update function that ensures user_id matches
export async function updateRecord<T>(
  table: string,
  id: string,
  data: Partial<Omit<T, 'id' | 'user_id' | 'created_at'>>
): Promise<{ data: T | null; error: PostgrestError | null }> {
  checkSupabase()
  const userId = await getUserId()
  
  const updateData = {
    ...data,
    updated_at: new Date().toISOString(),
  }

  const { data: result, error } = await supabase!
    .from(table)
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId) // Ensure user can only update their own records
    .select()
    .single()

  return { data: result as T | null, error }
}

// Generic delete function that ensures user_id matches
export async function deleteRecord(
  table: string,
  id: string
): Promise<{ error: PostgrestError | null }> {
  checkSupabase()
  const userId = await getUserId()
  
  const { error } = await supabase!
    .from(table)
    .delete()
    .eq('id', id)
    .eq('user_id', userId) // Ensure user can only delete their own records

  return { error }
}

// Generic query function that automatically filters by user_id
export async function queryRecords<T>(
  table: string,
  options: {
    select?: string
    filters?: Record<string, string | number | boolean | null>
    orderBy?: { column: string; ascending?: boolean }
    limit?: number
  } = {}
): Promise<{ data: T[] | null; error: PostgrestError | null }> {
  checkSupabase()
  const userId = await getUserId()
  
  let query = supabase!
    .from(table)
    .select(options.select || '*')
    .eq('user_id', userId)

  // Apply additional filters
  if (options.filters) {
    Object.entries(options.filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        query = query.eq(key, value)
      }
    })
  }

  // Apply ordering
  if (options.orderBy) {
    query = query.order(options.orderBy.column, {
      ascending: options.orderBy.ascending ?? true
    })
  }

  // Apply limit
  if (options.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  return { data: data as T[] | null, error }
}

// Get a single record by ID, ensuring user_id matches
export async function getRecord<T>(
  table: string,
  id: string
): Promise<{ data: T | null; error: PostgrestError | null }> {
  checkSupabase()
  const userId = await getUserId()
  
  const { data: result, error } = await supabase!
    .from(table)
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  return { data: result as T | null, error }
}
