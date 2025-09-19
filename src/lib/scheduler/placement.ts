import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import type { Database } from '../../../types/supabase'
import {
  fetchInstancesForRange,
  createInstance,
  rescheduleInstance,
  type ScheduleInstance,
} from './instanceRepo'
import { addMin } from './placer'

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
  windows: Array<{ id: string; startLocal: Date; endLocal: Date }>
  date: Date
  client?: Client
  reuseInstanceId?: string | null
}

export async function placeItemInWindows(params: PlaceParams): Promise<PlacementResult> {
  const { userId, item, windows, client, reuseInstanceId } = params
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

    const filtered = (taken ?? []).filter(inst => inst.id !== reuseInstanceId)

    const sorted = filtered.sort(
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
        return await persistPlacement(
          {
            userId,
            item,
            windowId: w.id,
            startUTC,
            endUTC,
            reuseInstanceId,
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
      return await persistPlacement(
        {
          userId,
          item,
          windowId: w.id,
          startUTC,
          endUTC,
          reuseInstanceId,
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

async function persistPlacement(
  params: {
    userId: string
    item: PlaceParams['item']
    windowId: string
    startUTC: string
    endUTC: string
    reuseInstanceId?: string | null
  },
  client?: Client
) {
  const { userId, item, windowId, startUTC, endUTC, reuseInstanceId } = params
  if (reuseInstanceId) {
    return await rescheduleInstance(
      reuseInstanceId,
      {
        windowId,
        startUTC,
        endUTC,
        durationMin: item.duration_min,
        weightSnapshot: item.weight,
        energyResolved: item.energy,
      },
      client
    )
  }

  return await createInstance(
    {
      userId,
      sourceId: item.id,
      windowId,
      startUTC,
      endUTC,
      durationMin: item.duration_min,
      weightSnapshot: item.weight,
      energyResolved: item.energy,
    },
    client
  )
}
