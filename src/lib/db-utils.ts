type SupabaseErrorLike = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

export class DbError extends Error {
  table: string
  code?: string
  details?: string | null
  hint?: string | null
  constructor(table: string, supaErr: SupabaseErrorLike) {
    super(`[DB:${table}] ${supaErr?.message || 'Unknown DB error'}`)
    this.name = 'DbError'
    this.table = table
    this.code = supaErr?.code
    this.details = supaErr?.details ?? null
    this.hint = supaErr?.hint ?? null
  }
}

export async function safeQuery<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.error('safeQuery error', { label, error: e })
    throw e
  }
}
