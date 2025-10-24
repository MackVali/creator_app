// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import type { Database } from '../../../../types/supabase'
import {
  fetchInstancesForRange,
  createInstance,
  rescheduleInstance,
  type ScheduleInstance,
} from './instanceRepo.js'
import { addMin } from '../placer.js'

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
  client: Client
  reuseInstanceId?: string | null
  ignoreProjectIds?: Set<string>
  notBefore?: Date
}

export async function placeItemInWindows(params: PlaceParams): Promise<PlacementResult> {
  const { userId, item, windows, client, reuseInstanceId, ignoreProjectIds, notBefore } = params
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

    const { data: taken, error } = await fetchInstancesForRange(
      client,
      userId,
      rangeStart.toISOString(),
      windowEnd.toISOString(),
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

    if (!candidate) {
      if (cursorMs + durationMs <= windowEndMs) {
        candidate = new Date(cursorMs)
      }
    }

    if (!candidate) continue

    if (!best || candidate.getTime() < best.start.getTime()) {
      best = { window: w, windowIndex: index, start: candidate }
    }
  }

  if (!best) {
    return { error: 'NO_FIT' }
  }

  const { window: chosenWindow, start } = best
  const durationMin = Math.max(0, item.duration_min)
  const end = addMin(start, durationMin)

  if (params.reuseInstanceId) {
    const reschedule = await rescheduleInstance(client, params.reuseInstanceId, {
      windowId: chosenWindow.id,
      startUTC: start.toISOString(),
      endUTC: end.toISOString(),
      durationMin,
      weightSnapshot: item.weight,
      energyResolved: item.energy,
    })
    if (reschedule.error) {
      return { error: reschedule.error }
    }
    return reschedule
  }

  return await createInstance(client, {
    userId,
    sourceId: item.id,
    sourceType: item.sourceType,
    windowId: chosenWindow.id,
    startUTC: start.toISOString(),
    endUTC: end.toISOString(),
    durationMin,
    weightSnapshot: item.weight,
    energyResolved: item.energy,
  })
}
