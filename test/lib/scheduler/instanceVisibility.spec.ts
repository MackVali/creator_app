import { describe, expect, it } from 'vitest'

import {
  __INTERNAL_VISIBLE_INSTANCE_STATUS_HELPERS__,
  buildInstanceVisibilityRangeOrClause,
} from '../../../src/lib/scheduler/instanceVisibility'

describe('buildInstanceVisibilityRangeOrClause', () => {
  it('nests the visibility clause inside both range checks', () => {
    const start = '2024-01-01T00:00:00.000Z'
    const end = '2024-01-02T00:00:00.000Z'

    const clause = buildInstanceVisibilityRangeOrClause(start, end)

    const { NULL_STATUS_CLAUSE, VISIBLE_STATUS_IN_CLAUSE } =
      __INTERNAL_VISIBLE_INSTANCE_STATUS_HELPERS__

    expect(clause).toBe(
      [
        `and(${NULL_STATUS_CLAUSE},start_utc.gte.${start},start_utc.lt.${end})`,
        `and(${VISIBLE_STATUS_IN_CLAUSE},start_utc.gte.${start},start_utc.lt.${end})`,
        `and(${NULL_STATUS_CLAUSE},start_utc.lt.${start},end_utc.gt.${start})`,
        `and(${VISIBLE_STATUS_IN_CLAUSE},start_utc.lt.${start},end_utc.gt.${start})`,
      ].join(','),
    )
  })
})
