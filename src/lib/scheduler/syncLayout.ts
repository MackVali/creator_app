import type { HabitScheduleItem } from '@/lib/scheduler/habits'

export type TimelineCardLayoutMode = 'full' | 'paired-left' | 'paired-right'

type HabitPlacementLike = {
  habitType?: HabitScheduleItem['habitType'] | null
  start: Date
  end: Date
}

type ProjectInstanceLike = {
  start: Date
  end: Date
}

type Candidate = {
  kind: 'habit' | 'project'
  index: number
  startMs: number
  endMs: number
}

type ScoredCandidate = Candidate & {
  overlapStart: number
  overlapDuration: number
  startGap: number
}

type SyncAlignment = { startMs: number; endMs: number }

export function computeTimelineLayoutForSyncHabits({
  habitPlacements,
  projectInstances,
}: {
  habitPlacements: HabitPlacementLike[]
  projectInstances: ProjectInstanceLike[]
}) {
  const habitLayouts = habitPlacements.map<TimelineCardLayoutMode>(() => 'full')
  const projectLayouts = projectInstances.map<TimelineCardLayoutMode>(() => 'full')
  const syncHabitAlignment = new Map<number, SyncAlignment>()

  const candidates: Candidate[] = []

  habitPlacements.forEach((placement, index) => {
    const startMs = placement.start.getTime()
    const endMs = placement.end.getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return
    candidates.push({ kind: 'habit', index, startMs, endMs })
  })

  projectInstances.forEach((instance, index) => {
    const startMs = instance.start.getTime()
    const endMs = instance.end.getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return
    candidates.push({ kind: 'project', index, startMs, endMs })
  })

  const sortedCandidates = candidates.sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs
    return a.endMs - b.endMs
  })

  const usedCandidates = new Set<string>()

  const syncHabits = habitPlacements
    .map((placement, index) => ({ placement, index }))
    .filter(({ placement }) => {
      const habitType = (placement.habitType ?? 'HABIT').toUpperCase()
      return habitType === 'SYNC' || habitType === 'ASYNC'
    })
    .map(({ placement, index }) => ({
      index,
      startMs: placement.start.getTime(),
      endMs: placement.end.getTime(),
    }))
    .filter(({ startMs, endMs }) => Number.isFinite(startMs) && Number.isFinite(endMs))
    .sort((a, b) => {
      if (a.startMs !== b.startMs) return a.startMs - b.startMs
      return a.endMs - b.endMs
    })

  syncHabits.forEach(syncHabit => {
    const { index: habitIndex, startMs, endMs } = syncHabit
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return
    if (habitLayouts[habitIndex] !== 'full') return

    const overlapping: ScoredCandidate[] = []

    for (const candidate of sortedCandidates) {
      const candidateKey = `${candidate.kind}:${candidate.index}`
      if (candidate.kind === 'habit' && candidate.index === habitIndex) continue
      if (candidate.kind === 'habit') {
        const candidatePlacement = habitPlacements[candidate.index]
        const candidateType = (candidatePlacement?.habitType ?? 'HABIT').toUpperCase()
        if (candidateType === 'SYNC' || candidateType === 'ASYNC') {
          continue
        }
      }
      if (candidate.endMs <= startMs) continue
      if (candidate.startMs >= endMs) break
      if (usedCandidates.has(candidateKey)) continue
      const overlapStart = Math.max(startMs, candidate.startMs)
      const overlapEnd = Math.min(endMs, candidate.endMs)
      if (overlapEnd <= overlapStart) continue
      overlapping.push({
        ...candidate,
        overlapStart,
        overlapDuration: overlapEnd - overlapStart,
        startGap: Math.abs(candidate.startMs - startMs),
      })
    }

    if (overlapping.length === 0) return

    overlapping.sort((a, b) => {
      if (a.overlapStart !== b.overlapStart) return a.overlapStart - b.overlapStart
      if (a.startGap !== b.startGap) return a.startGap - b.startGap
      if (a.startMs !== b.startMs) return a.startMs - b.startMs
      if (a.overlapDuration !== b.overlapDuration) {
        return b.overlapDuration - a.overlapDuration
      }
      return a.endMs - b.endMs
    })

    const winner = overlapping[0]
    const winnerKey = `${winner.kind}:${winner.index}`
    usedCandidates.add(winnerKey)
    habitLayouts[habitIndex] = 'paired-right'
    syncHabitAlignment.set(habitIndex, {
      startMs: winner.startMs,
      endMs: winner.endMs,
    })
    if (winner.kind === 'habit') {
      habitLayouts[winner.index] = 'paired-left'
    } else {
      projectLayouts[winner.index] = 'paired-left'
    }
  })

  return { habitLayouts, projectLayouts, syncHabitAlignment }
}
