import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { getSupabaseBrowser } from '@/lib/supabase'
import type { Database } from '../../../types/supabase'
import {
  placeItemInWindows as placeItemInWindowsCore,
} from './core/placement.js'
import type { ScheduleInstance } from './core/instanceRepo'

type Client = SupabaseClient<Database>

type PlacementResult =
  | PostgrestSingleResponse<ScheduleInstance>
  | { error: 'NO_FIT' | Error }

type PlaceParams = {
  userId: string
  item: {
    id: string
    sourceType: 'PROJECT'
    duration_min: number
    energy: string
    weight: number
  }
  windows: Array<{
    id: string
    startLocal: Date
    endLocal: Date
    availableStartLocal?: Date
    key?: string
  }>
  date: Date
  client?: Client
  reuseInstanceId?: string | null
  ignoreProjectIds?: Set<string>
  notBefore?: Date
}

function ensureClient(client?: Client): Client {
  if (client) return client
  const supabase = getSupabaseBrowser()
  if (!supabase) {
    throw new Error('Supabase client not available')
  }
  return supabase as Client
}

export async function placeItemInWindows(params: PlaceParams): Promise<PlacementResult> {
  const { client, ...rest } = params
  const supabase = ensureClient(client)
  return await placeItemInWindowsCore({ ...rest, client: supabase })
}
