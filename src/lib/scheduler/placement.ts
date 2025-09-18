import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import type { Database } from '../../../types/supabase'
import { fetchInstancesForRange, createInstance, type ScheduleInstance } from './instanceRepo'
import { addMin } from './placer'

type Client = SupabaseClient<Database>

type PlacementResult =
  | PostgrestSingleResponse<ScheduleInstance>
  | { error: 'NO_FIT' | Error }

type PlaceParams = {
  userId: string
  item: {
    id: string
    sourceType: 'PROJECT' | 'TASK'
    duration_min: number
    energy: string
    weight: number
  }
  windows: Array<{ id: string; startLocal: Date; endLocal: Date }>
  date: Date
  client?: Client
}

export async function placeItemInWindows(params: PlaceParams): Promise<PlacementResult> {
  const { userId, item, windows, client } = params
  for (const w of windows) {
    const start = new Date(w.startLocal)
    const end = new Date(w.endLocal)

    const { data: taken, error } = await fetchInstancesForRange(
      userId,
      start.toISOString(),
      end.toISOString(),
      client
    )
    if (error) {
      return { error }
    }

    const sorted = (taken ?? []).sort(
      (a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    )

    let cursor = start
    const durMin = item.duration_min

    for (const block of sorted) {
      const blockStart = new Date(block.start_utc)
      const blockEnd = new Date(block.end_utc)
      if (diffMin(cursor, blockStart) >= durMin) {
        const startUTC = cursor.toISOString()
        const endUTC = addMin(cursor, durMin).toISOString()
        return await createInstance(
          {
            userId,
            sourceType: item.sourceType,
            sourceId: item.id,
            windowId: w.id,
            startUTC,
            endUTC,
            durationMin: durMin,
            weightSnapshot: item.weight,
            energyResolved: item.energy,
          },
          client
        )
      }
      if (blockEnd > cursor) {
        cursor = blockEnd
      }
    }

    if (diffMin(cursor, end) >= durMin) {
      const startUTC = cursor.toISOString()
      const endUTC = addMin(cursor, durMin).toISOString()
      return await createInstance(
        {
          userId,
          sourceType: item.sourceType,
          sourceId: item.id,
          windowId: w.id,
          startUTC,
          endUTC,
          durationMin: durMin,
          weightSnapshot: item.weight,
          energyResolved: item.energy,
        },
        client
      )
    }
  }

  return { error: 'NO_FIT' }
}

function diffMin(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 60000)
}
