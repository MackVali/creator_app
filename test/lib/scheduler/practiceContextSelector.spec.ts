import { describe, it, expect } from 'vitest'
import { selectPracticeContext } from '../../../src/lib/scheduler/practiceContextSelector'

const baseWindowStart = new Date('2024-01-01T12:00:00Z')

describe('selectPracticeContext', () => {
  it('prefers the alphabetically first actionable context when scores tie', () => {
    const result = selectPracticeContext({
      candidateContextIds: ['ctx-b', 'ctx-a'],
      contextEventCounts: new Map(),
      contextTaskCounts: new Map([
        ['ctx-a', 1],
        ['ctx-b', 1],
      ]),
      lastPracticedAt: new Map(),
      lastContextUsed: null,
      windowStart: baseWindowStart,
    })

    expect(result).toBe('ctx-a')
  })

  it('favors actionable contexts over non-actionable choices during tie breaks', () => {
    const result = selectPracticeContext({
      candidateContextIds: ['ctx-b', 'ctx-a'],
      contextEventCounts: new Map(),
      contextTaskCounts: new Map([
        ['ctx-a', 1],
        ['ctx-b', 0],
      ]),
      lastPracticedAt: new Map(),
      lastContextUsed: null,
      windowStart: baseWindowStart,
    })

    expect(result).toBe('ctx-a')
  })
})
