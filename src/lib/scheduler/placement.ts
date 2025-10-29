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
  notBefore?: Date
  existingInstances?: ScheduleInstance[]
}

export async function placeItemInWindows(params: PlaceParams): Promise<PlacementResult> {
  const {
    userId,
    item,
    windows,
    client,
    reuseInstanceId,
    ignoreProjectIds,
    notBefore,
    existingInstances,
  } = params
  let best: null | {
    window: (typeof windows)[number]
    windowIndex: number
    start: Date
  } = null

  const notBeforeMs = notBefore ? notBefore.getTime() : null
  const durationMs = Math.max(0, item.duration_min) * 60000

  for (const [index, w] of windows.entries()) {
    const windowStart = new Date(w.availableStartLocal ?? w.startLocal)
    const windowEnd = new Date(w.endLocal)

    const windowStartMs = windowStart.getTime()
    const windowEndMs = windowEnd.getTime()

    if (typeof notBeforeMs === 'number' && windowEndMs <= notBeforeMs) {
      continue
    }

    const startMs =
      typeof notBeforeMs === 'number' ? Math.max(windowStartMs, notBeforeMs) : windowStartMs
    const rangeStart = new Date(startMs)

    let taken: ScheduleInstance[] = []
    if (existingInstances) {
      taken = existingInstances.filter(inst => {
        if (!inst) return false
        if (inst.status !== 'scheduled') return false
        const instStartMs = new Date(inst.start_utc).getTime()
        const instEndMs = new Date(inst.end_utc).getTime()
        return instEndMs > startMs && instStartMs < windowEndMs
      })
    } else {
      const { data, error } = await fetchInstancesForRange(
        userId,
        rangeStart.toISOString(),
        windowEnd.toISOString(),
        client
      )
      if (error) {
        return { error }
      }
      taken = (data ?? []).filter(inst => inst && inst.status !== 'canceled')
    }

    const filtered = taken.filter(inst => {
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

    let cursorMs = startMs
    let candidate: Date | null = null

    for (const block of sorted) {
      const blockStart = new Date(block.start_utc)
      const blockEnd = new Date(block.end_utc)

      const blockStartMs = blockStart.getTime()
      const blockEndMs = blockEnd.getTime()

      if (typeof notBeforeMs === 'number' && blockEndMs <= notBeforeMs) {
        continue
      }

      const effectiveBlockStartMs =
        typeof notBeforeMs === 'number'
          ? Math.max(blockStartMs, notBeforeMs)
          : blockStartMs

      if (cursorMs + durationMs <= effectiveBlockStartMs) {
        candidate = new Date(cursorMs)
        break
      }

      if (blockEndMs > cursorMs) {
        cursorMs = blockEndMs
        if (typeof notBeforeMs === 'number' && cursorMs < notBeforeMs) {
          cursorMs = notBeforeMs
        }
      }
    }

    if (!candidate && cursorMs + durationMs <= windowEndMs) {
      candidate = new Date(cursorMs)
    }

    if (!candidate) continue

    if (typeof notBeforeMs === 'number' && candidate.getTime() < notBeforeMs) {
      candidate = new Date(notBeforeMs)
    }

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
      sourceType: item.sourceType,
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
