import { describe, expect, it, vi } from 'vitest'

import {
  __INTERNAL_VISIBLE_INSTANCE_STATUS_HELPERS__,
  applyInstanceVisibilityFilters,
} from '../../../src/lib/scheduler/instanceVisibility'

describe('applyInstanceVisibilityFilters', () => {
  it('applies status and overlap filters to the query builder', () => {
    const start = '2024-01-01T00:00:00.000Z'
    const end = '2024-01-02T00:00:00.000Z'

    const or = vi.fn()
    const lt = vi.fn()
    const gt = vi.fn()

    const builder = {
      or,
      lt,
      gt,
    }

    or.mockReturnValue(builder)
    lt.mockReturnValue(builder)
    gt.mockReturnValue(builder)

    const result = applyInstanceVisibilityFilters(builder, start, end)

    const { STATUS_OR_CLAUSE } = __INTERNAL_VISIBLE_INSTANCE_STATUS_HELPERS__

    expect(or).toHaveBeenCalledWith(STATUS_OR_CLAUSE)
    expect(lt).toHaveBeenCalledWith('start_utc', end)
    expect(gt).toHaveBeenCalledWith('end_utc', start)
    expect(result).toBe(builder)
  })
})
