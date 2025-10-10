import { describe, expect, it } from 'vitest'

import {
  VISIBLE_INSTANCE_STATUS_CLAUSE,
  buildInstanceVisibilityRangeOrClause,
} from '../../../src/lib/scheduler/instanceVisibility'

describe('buildInstanceVisibilityRangeOrClause', () => {
  it('nests the visibility clause inside both range checks', () => {
    const start = '2024-01-01T00:00:00.000Z'
    const end = '2024-01-02T00:00:00.000Z'

    const clause = buildInstanceVisibilityRangeOrClause(start, end)

    expect(clause).toBe(
      [
        `and(${VISIBLE_INSTANCE_STATUS_CLAUSE},start_utc.gte.${start},start_utc.lt.${end})`,
        `and(${VISIBLE_INSTANCE_STATUS_CLAUSE},start_utc.lt.${start},end_utc.gt.${start})`,
      ].join(','),
    )
  })
})
