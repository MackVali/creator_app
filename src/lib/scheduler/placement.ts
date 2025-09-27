import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/supabase'
import {
  fetchInstancesForRange,
  createInstance,
  rescheduleInstance,
  type ScheduleInstance,
} from './instanceRepo'
import { addMin } from './placer'
import { ENERGY, SCORING_WEIGHTS, type RejectedReason } from './config'

type Client = SupabaseClient<Database>

export type CandidateEvaluation = {
  windowId: string
  availableStartUTC: string
  endUTC: string
  score: number
}

type PlacementSuccess = {
  ok: true
  instance: ScheduleInstance
  score: number
  considered: CandidateEvaluation[]
}

type PlacementFailure = {
  ok: false
  reason: RejectedReason
  considered: CandidateEvaluation[]
  error?: unknown
}

type PlacementResult = PlacementSuccess | PlacementFailure

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
    availableStartLocal: Date
    key?: string
    energy?: string
  }>
  date: Date
  client?: Client
  reuseInstanceId?: string | null
  runId: string
  runStart: Date
  stabilityLockMinutes: number
  weights?: typeof SCORING_WEIGHTS
  dryRun?: boolean
  effectiveNow?: Date | null
  collectEvaluations?: boolean
}

export async function placeItemInWindows(params: PlaceParams): Promise<PlacementResult> {
  const {
    userId,
    item,
    windows,
    client,
    reuseInstanceId,
    runId,
    runStart,
    stabilityLockMinutes,
    weights = SCORING_WEIGHTS,
    dryRun,
    effectiveNow,
    collectEvaluations = true,
  } = params

  const considered: CandidateEvaluation[] = []
  let best:
    | null
    | {
        candidate: CandidateEvaluation
        start: Date
        window: PlaceParams['windows'][number]
      } = null

  for (const window of windows) {
    const start = new Date(window.availableStartLocal ?? window.startLocal)
    const end = new Date(window.endLocal)
    const { data: taken, error } = await fetchInstancesForRange(
      userId,
      start.toISOString(),
      end.toISOString(),
      client,
    )
    if (error) {
      return { ok: false, reason: 'Unknown', considered, error }
    }

    const filtered = (taken ?? []).filter(inst => inst.id !== reuseInstanceId)
    filtered.sort(
      (a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime(),
    )

    let cursor = start
    const durMin = item.duration_min
    let candidateStart: Date | null = null

    for (const block of filtered) {
      const blockStart = new Date(block.start_utc)
      const blockEnd = new Date(block.end_utc)
      if (diffMin(cursor, blockStart) >= durMin) {
        candidateStart = new Date(cursor)
        break
      }
      if (blockEnd > cursor) {
        cursor = blockEnd
      }
    }

    if (!candidateStart && diffMin(cursor, end) >= durMin) {
      candidateStart = new Date(cursor)
    }

    if (!candidateStart) {
      continue
    }

    const startUTC = candidateStart.toISOString()
    const endUTC = addMin(candidateStart, item.duration_min).toISOString()
    const score = scoreCandidate(
      candidateStart,
      window,
      item,
      effectiveNow ?? runStart,
      weights,
    )
    const evaluation: CandidateEvaluation = {
      windowId: window.id,
      availableStartUTC: startUTC,
      endUTC,
      score,
    }
    if (collectEvaluations) {
      considered.push(evaluation)
    }

    if (
      !best ||
      score > best.candidate.score ||
      (score === best.candidate.score && candidateStart.getTime() < best.start.getTime())
    ) {
      best = { candidate: evaluation, start: candidateStart, window }
    }
  }

  if (!best) {
    return {
      ok: false,
      reason: 'NoCompatibleWindow',
      considered: collectEvaluations ? considered : [],
    }
  }

  const lockedUntil = new Date(runStart.getTime() + stabilityLockMinutes * 60000)
  if (best.start < lockedUntil) {
    return {
      ok: false,
      reason: 'LockedByStabilityHorizon',
      considered: collectEvaluations ? considered : [],
    }
  }

  const instanceInput = {
    userId,
    sourceId: item.id,
    windowId: best.window.id,
    startUTC: best.candidate.availableStartUTC,
    endUTC: best.candidate.endUTC,
    durationMin: item.duration_min,
    weightSnapshot: item.weight,
    energyResolved: item.energy,
    runId,
    score: best.candidate.score,
  }

  if (dryRun) {
    const simulated = buildSimulatedInstance(instanceInput, reuseInstanceId)
    return {
      ok: true,
      instance: simulated,
      score: best.candidate.score,
      considered: collectEvaluations ? considered : [],
    }
  }

  const persisted = reuseInstanceId
    ? await rescheduleInstance(reuseInstanceId, instanceInput, client)
    : await createInstance(instanceInput, client)

  if (persisted.error) {
    return {
      ok: false,
      reason: 'Unknown',
      considered: collectEvaluations ? considered : [],
      error: persisted.error,
    }
  }

  const instance = persisted.data as ScheduleInstance
  return {
    ok: true,
    instance,
    score: best.candidate.score,
    considered: collectEvaluations ? considered : [],
  }
}

function diffMin(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 60000)
}

function scoreCandidate(
  candidateStart: Date,
  window: PlaceParams['windows'][number],
  item: PlaceParams['item'],
  reference: Date,
  weights: typeof SCORING_WEIGHTS,
) {
  const energyFit = calculateEnergyFit(item.energy, window.energy)
  const hoursUntil = Math.max(0, (candidateStart.getTime() - reference.getTime()) / 3_600_000)
  const urgency = 1 / (1 + hoursUntil)
  const value = item.weight ?? 0

  return (
    weights.value * value +
    weights.deadlineUrgency * urgency +
    weights.energyFit * energyFit
  )
}

function calculateEnergyFit(taskEnergy: string, windowEnergy?: string) {
  const taskIdx = ENERGY.LIST.indexOf(taskEnergy.toUpperCase() as (typeof ENERGY.LIST)[number])
  const windowIdx = ENERGY.LIST.indexOf((windowEnergy ?? '').toUpperCase() as (typeof ENERGY.LIST)[number])
  if (taskIdx === -1 || windowIdx === -1) return 0.5
  const diff = Math.abs(windowIdx - taskIdx)
  const span = Math.max(1, ENERGY.LIST.length - 1)
  return Math.max(0, 1 - diff / span)
}

function buildSimulatedInstance(
  input: {
    userId: string
    sourceId: string
    windowId?: string | null
    startUTC: string
    endUTC: string
    durationMin: number
    weightSnapshot: number
    energyResolved: string
    runId: string
    score: number
  },
  reuseInstanceId?: string | null,
) {
  const now = new Date().toISOString()
  const id = reuseInstanceId ?? `dry-${input.sourceId}-${input.startUTC}`
  return {
    id,
    user_id: input.userId,
    source_id: input.sourceId,
    source_type: 'PROJECT',
    window_id: input.windowId ?? null,
    start_utc: input.startUTC,
    end_utc: input.endUTC,
    duration_min: input.durationMin,
    status: 'scheduled',
    weight_snapshot: input.weightSnapshot,
    energy_resolved: input.energyResolved,
    created_at: now,
    updated_at: now,
    completed_at: null,
    run_id: input.runId,
    placed_at: now,
    plan_version: null,
    score: input.score,
    rejected_reason: null,
  } as ScheduleInstance
}
