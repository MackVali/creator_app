const DAY_IN_MS = 24 * 60 * 60 * 1000
const DEFAULT_LAST_PRACTICED_DAYS = 30

export type PracticeContextSelectorInput = {
  candidateContextIds: string[]
  contextEventCounts: Map<string, number>
  contextTaskCounts: Map<string, number>
  lastPracticedAt: Map<string, Date>
  lastContextUsed: string | null
  windowStart: Date
}

export function selectPracticeContext({
  candidateContextIds,
  contextEventCounts,
  contextTaskCounts,
  lastPracticedAt,
  lastContextUsed,
  windowStart,
}: PracticeContextSelectorInput): string | null {
  const contexts = candidateContextIds
    .filter((value) => value && value.length > 0)
    .sort((a, b) => a.localeCompare(b))
  if (contexts.length === 0) {
    return null
  }

  const actionable = contexts.filter((contextId) => (contextTaskCounts.get(contextId) ?? 0) > 0)
  const penaltyPool = actionable.length > 0 ? actionable : contexts

  let bestId: string | null = null
  let bestContextScore = Number.NEGATIVE_INFINITY
  let bestLastPracticedScore = Number.NEGATIVE_INFINITY
  let bestRotationPenalty = Number.NEGATIVE_INFINITY
  let bestIsActionable = false

  for (const contextId of contexts) {
    const contextScore = (contextEventCounts.get(contextId) ?? 0) * 10
    const hasSchedulableTasks = (contextTaskCounts.get(contextId) ?? 0) > 0

    const last = lastPracticedAt.get(contextId) ?? null
    let lastPracticedScore = 0
    if (last) {
      const diff = windowStart.getTime() - last.getTime()
      if (Number.isFinite(diff) && diff > 0) {
        const days = Math.max(0, Math.floor(diff / DAY_IN_MS))
        if (days > 0) {
          lastPracticedScore = days * 5
        }
      }
    } else {
      lastPracticedScore = DEFAULT_LAST_PRACTICED_DAYS * 5
    }

    const isOnlyValidOption =
      penaltyPool.length === 1 && penaltyPool[0] === contextId
    const rotationPenalty =
      !isOnlyValidOption && lastContextUsed && lastContextUsed === contextId ? -100 : 0

    const scoresEqual =
      contextScore === bestContextScore &&
      lastPracticedScore === bestLastPracticedScore &&
      rotationPenalty === bestRotationPenalty

    let shouldUpdate = false
    if (contextScore > bestContextScore) {
      shouldUpdate = true
    } else if (contextScore === bestContextScore) {
      if (lastPracticedScore > bestLastPracticedScore) {
        shouldUpdate = true
      } else if (lastPracticedScore === bestLastPracticedScore) {
        if (rotationPenalty > bestRotationPenalty) {
          shouldUpdate = true
        } else if (scoresEqual) {
          if (hasSchedulableTasks && !bestIsActionable) {
            shouldUpdate = true
          } else if (hasSchedulableTasks === bestIsActionable) {
            if (!bestId || contextId.localeCompare(bestId) < 0) {
              shouldUpdate = true
            }
          }
        }
      }
    }

    if (shouldUpdate) {
      bestId = contextId
      bestContextScore = contextScore
      bestLastPracticedScore = lastPracticedScore
      bestRotationPenalty = rotationPenalty
      bestIsActionable = hasSchedulableTasks
    }
  }

  return bestId
}
