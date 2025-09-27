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
}

export async function placeItemInWindows(params: PlaceParams): Promise<PlacementResult> {
  const { userId, item, windows, client, reuseInstanceId, ignoreProjectIds } = params
  let best: null | {
    window: (typeof windows)[number]
    windowIndex: number
    start: Date
  } = null

  for (const [index, w] of windows.entries()) {
    const start = new Date(w.availableStartLocal ?? w.startLocal)
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

    const filtered = (taken ?? []).filter(inst => {
      if (inst.id === reuseInstanceId) return false
      if (ignoreProjectIds && inst.source_type === 'PROJECT') {
        const projectId = inst.source_id ?? ''
        if (projectId && ignoreProjectIds.has(projectId)) {
          return false
        }
      }
      return true
    })

    const sorted = filtered.sort(
      (a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    )

    let cursor = start
    const durMin = item.duration_min
    let candidate: Date | null = null

    for (const block of sorted) {
      const blockStart = new Date(block.start_utc)
      const blockEnd = new Date(block.end_utc)
      if (diffMin(cursor, blockStart) >= durMin) {
        candidate = new Date(cursor)
        break
      }
      if (blockEnd > cursor) {
        cursor = blockEnd
      }
    }

    if (!candidate && diffMin(cursor, end) >= durMin) {
      candidate = new Date(cursor)
    }

    if (!candidate) continue

    if (
      !best ||
      candidate.getTime() < best.start.getTime() ||
      (candidate.getTime() === best.start.getTime() && index < best.windowIndex)
    ) {
      best = { window: w, windowIndex: index, start: candidate }
    }
  }

  if (!best) {
    return { error: 'NO_FIT' }
  }

  return await persistPlacement(
    {
      userId,
      item,
      windowId: best.window.id,
      startUTC: best.start.toISOString(),
      endUTC: addMin(best.start, item.duration_min).toISOString(),
      reuseInstanceId,
    },
    client
  )
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
