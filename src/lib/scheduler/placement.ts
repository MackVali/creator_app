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
import { getDateTimeParts, makeZonedDate } from './timezone'
import { safeDate } from './safeDate'

type Client = SupabaseClient<Database>

type PlacementResult =
  | PostgrestSingleResponse<ScheduleInstance>
  | { error: 'NO_FIT' | Error }

type PlaceParams = {
  userId: string
  item: {
    id: string
    sourceType: ScheduleInstance['source_type']
    duration_min: number
    energy: string
    weight: number
    eventName: string
    practiceContextId?: string | null
  }
  windows: Array<{
    id: string
    startLocal: Date
    endLocal: Date
    availableStartLocal?: Date
    key?: string
    fromPrevDay?: boolean
  }>
  date: Date
  timeZone?: string | null
  client?: Client
  reuseInstanceId?: string | null
  ignoreProjectIds?: Set<string>
  notBefore?: Date
  existingInstances?: ScheduleInstance[]
  allowHabitOverlap?: boolean
  habitTypeById?: Map<string, string>
}

const normalizeHabitTypeValue = (value?: string | null) => {
  const raw = (value ?? 'HABIT').toUpperCase()
  return raw === 'ASYNC' ? 'SYNC' : raw
}

export async function placeItemInWindows(params: PlaceParams): Promise<PlacementResult> {
  const {
    userId,
    item,
    windows,
    timeZone,
    client,
    reuseInstanceId,
    ignoreProjectIds,
    notBefore,
    existingInstances,
    habitTypeById,
  } = params
  let best: null | {
    window: (typeof windows)[number]
    windowIndex: number
    start: Date
  } = null

  const resolvedTimeZone = timeZone ?? 'UTC'
  const targetDayParts = getDateTimeParts(params.date, resolvedTimeZone)

  const notBeforeMs = notBefore ? notBefore.getTime() : null
  const durationMs = Math.max(0, item.duration_min) * 60000
  const candidateIsSync =
    item.sourceType === 'HABIT' &&
    normalizeHabitTypeValue(habitTypeById?.get(item.id) ?? 'HABIT') === 'SYNC'

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
    const isBlockingStatus = (status?: ScheduleInstance['status'] | null) =>
      status === 'scheduled' || status === 'completed'

    if (existingInstances) {
      taken = existingInstances.filter(inst => {
        if (!inst) return false
        const instStart = safeDate(inst.start_utc)
        if (!instStart) return false
        const instDayParts = getDateTimeParts(instStart, resolvedTimeZone)
        if (
          instDayParts.year !== targetDayParts.year ||
          instDayParts.month !== targetDayParts.month ||
          instDayParts.day !== targetDayParts.day
        ) {
          return false
        }
        if (!isBlockingStatus(inst.status)) return false
        const instStartMs = instStart.getTime()
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
      taken = (data ?? []).filter(
        inst => inst && isBlockingStatus(inst.status) && inst.status !== 'canceled',
      )
    }

    const capacityBlockers: ScheduleInstance[] = []
    const syncBlockers: ScheduleInstance[] = []
    const projectBlockers: ScheduleInstance[] = []

    for (const inst of taken) {
      if (!inst) continue
      if (inst.id === reuseInstanceId) continue
      if (ignoreProjectIds && inst.source_type === 'PROJECT') {
        const projectId = inst.source_id ?? ''
        if (projectId && ignoreProjectIds.has(projectId)) {
          continue
        }
      }
      if (inst.source_type === 'HABIT') {
        const habitType = normalizeHabitTypeValue(
          habitTypeById?.get(inst.source_id ?? '') ?? 'HABIT'
        )
        if (habitType === 'SYNC') {
          syncBlockers.push(inst)
        } else {
          capacityBlockers.push(inst)
        }
        continue
      }
      if (inst.source_type === 'PROJECT') {
        projectBlockers.push(inst)
      }
      capacityBlockers.push(inst)
    }

    const sorted = (candidateIsSync ? [] : capacityBlockers).sort(
      (a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    )
    const hardBlockers = candidateIsSync ? [] : capacityBlockers

    const hasSyncOverlapLimit = (
      startMs: number,
      endMs: number,
      blocks: ScheduleInstance[],
      limit: number
    ) => {
      const events: Array<{ time: number; delta: number }> = []
      for (const block of blocks) {
        const blockStartMs = new Date(block.start_utc).getTime()
        const blockEndMs = new Date(block.end_utc).getTime()
        if (!Number.isFinite(blockStartMs) || !Number.isFinite(blockEndMs)) {
          continue
        }
        if (blockEndMs <= startMs || blockStartMs >= endMs) continue
        const overlapStart = Math.max(blockStartMs, startMs)
        const overlapEnd = Math.min(blockEndMs, endMs)
        if (overlapEnd <= overlapStart) continue
        events.push({ time: overlapStart, delta: 1 })
        events.push({ time: overlapEnd, delta: -1 })
      }
      if (events.length === 0) return false
      events.sort((a, b) => a.time - b.time || a.delta - b.delta)
      let active = 0
      let prevTime = startMs
      let index = 0
      while (index < events.length) {
        const time = events[index].time
        if (active >= limit && time > prevTime) {
          return true
        }
        while (index < events.length && events[index].time === time) {
          active += events[index].delta
          index += 1
        }
        prevTime = time
      }
      return active >= limit
    }

    const findSyncCandidate = () => {
      if (durationMs <= 0) {
        return new Date(startMs)
      }
      let projectStartAnchorMs = startMs
      for (const block of projectBlockers) {
        const blockStartMs = new Date(block.start_utc).getTime()
        const blockEndMs = new Date(block.end_utc).getTime()
        if (!Number.isFinite(blockStartMs) || !Number.isFinite(blockEndMs)) {
          continue
        }
        if (blockStartMs <= startMs && blockEndMs > startMs) {
          projectStartAnchorMs = Math.max(projectStartAnchorMs, blockEndMs)
        }
      }
      const syncStartMs = Math.max(startMs, projectStartAnchorMs)
      const candidateStarts = new Set<number>()
      candidateStarts.add(syncStartMs)
      for (const block of syncBlockers) {
        const blockStartMs = new Date(block.start_utc).getTime()
        const blockEndMs = new Date(block.end_utc).getTime()
        if (!Number.isFinite(blockStartMs) || !Number.isFinite(blockEndMs)) {
          continue
        }
        const endCandidate = blockEndMs
        const leadCandidate = blockStartMs - durationMs
        if (endCandidate >= startMs && endCandidate < windowEndMs) {
          candidateStarts.add(endCandidate)
        }
        if (leadCandidate >= startMs && leadCandidate < windowEndMs) {
          candidateStarts.add(leadCandidate)
        }
      }
      const ordered = Array.from(candidateStarts).sort((a, b) => a - b)
      for (const candidateStart of ordered) {
        if (candidateStart < syncStartMs) continue
        const candidateEnd = candidateStart + durationMs
        if (candidateEnd > windowEndMs) break
        if (!hasSyncOverlapLimit(candidateStart, candidateEnd, syncBlockers, 2)) {
          return new Date(candidateStart)
        }
      }
      return null
    }

    const advanceCursorPastHardBlockers = (cursorValue: number) => {
      let cursor = cursorValue
      while (true) {
        let maxEnd = cursor
        for (const block of hardBlockers) {
          const blockStartMs = new Date(block.start_utc).getTime()
          const blockEndMs = new Date(block.end_utc).getTime()
          if (!Number.isFinite(blockStartMs) || !Number.isFinite(blockEndMs)) {
            continue
          }
          const effectiveBlockStartMs =
            typeof notBeforeMs === 'number'
              ? Math.max(blockStartMs, notBeforeMs)
              : blockStartMs
          if (cursor >= effectiveBlockStartMs && cursor < blockEndMs) {
            if (blockEndMs > maxEnd) {
              maxEnd = blockEndMs
            }
          }
        }
        if (maxEnd === cursor) {
          return cursor
        }
        cursor = maxEnd
        if (typeof notBeforeMs === 'number' && cursor < notBeforeMs) {
          cursor = notBeforeMs
        }
      }
    }

    let cursorMs = advanceCursorPastHardBlockers(startMs)
    let candidate: Date | null = candidateIsSync ? findSyncCandidate() : null

    if (!candidate) {
      for (const block of sorted) {
        cursorMs = advanceCursorPastHardBlockers(cursorMs)
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
          cursorMs = advanceCursorPastHardBlockers(cursorMs)
        }
      }

      cursorMs = advanceCursorPastHardBlockers(cursorMs)
      if (!candidate && cursorMs + durationMs <= windowEndMs) {
        candidate = new Date(cursorMs)
      }
    }

    if (!candidate) continue

    if (typeof notBeforeMs === 'number' && candidate.getTime() < notBeforeMs) {
      candidate = new Date(notBeforeMs)
    }

    if (candidateIsSync) {
      best = { window: w, windowIndex: index, start: candidate }
      break
    }

    if (
      !best ||
      candidate.getTime() < best.start.getTime() ||
      (candidate.getTime() === best.start.getTime() && index < best.windowIndex)
    ) {
      if (process.env.DEBUG_OVERNIGHT === 'true' && item.id.startsWith('proj-overnight')) {
        console.log('overnight candidate', {
          itemId: item.id,
          windowId: w.id,
          start: candidate.toISOString(),
        })
      }
      best = { window: w, windowIndex: index, start: candidate }
    }
  }

  if (!best) {
    return { error: 'NO_FIT' }
  }

  let startUtc = safeDate(best.start)
  if (!startUtc) {
    return { error: 'NO_FIT' }
  }
  let endUtc = safeDate(addMin(best.start, item.duration_min))
  if (!endUtc) {
    return { error: 'NO_FIT' }
  }
  let durationMin = item.duration_min
  if (timeZone && best.window.fromPrevDay !== true) {
    const parts = getDateTimeParts(startUtc, timeZone)
    const nextDayStart = makeZonedDate(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day + 1,
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone
    )
    const maxEndMs = nextDayStart.getTime() - 1
    if (endUtc.getTime() > maxEndMs) {
      endUtc = safeDate(new Date(maxEndMs))
      if (!endUtc) {
        return { error: 'NO_FIT' }
      }
      const durationMs = endUtc.getTime() - startUtc.getTime()
      if (durationMs <= 0) {
        return { error: 'NO_FIT' }
      }
      durationMin = Math.max(1, Math.round(durationMs / 60000))
    }
  }

  return await persistPlacement(
    {
      userId,
      item,
      windowId: best.window.id,
      startUTC: startUtc.toISOString(),
      endUTC: endUtc.toISOString(),
      durationMin,
      reuseInstanceId,
      eventName: item.eventName,
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
    durationMin: number
    reuseInstanceId?: string | null
    eventName: string
  },
  client?: Client
) {
  const {
    userId,
    item,
    windowId,
    startUTC,
    endUTC,
    durationMin,
    reuseInstanceId,
    eventName,
  } = params
  if (reuseInstanceId) {
    return await rescheduleInstance(
      reuseInstanceId,
      {
        windowId,
        startUTC,
        endUTC,
        durationMin,
        weightSnapshot: item.weight,
        energyResolved: item.energy,
        eventName,
        practiceContextId: item.practiceContextId,
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
      durationMin,
      weightSnapshot: item.weight,
      energyResolved: item.energy,
      eventName,
      practiceContextId: item.practiceContextId,
    },
    client
  )
}
