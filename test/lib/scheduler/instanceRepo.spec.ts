import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowser: vi.fn(),
}))

import { __INTERNAL_VISIBLE_INSTANCE_STATUS_HELPERS__ } from '../../../src/lib/scheduler/instanceVisibility'
import { fetchInstancesForRange } from '../../../src/lib/scheduler/instanceRepo'

describe('fetchInstancesForRange', () => {
  it('requests only visible instances within the range', async () => {
    const order = vi.fn(async () => ({ data: [], error: null }))
    const gt = vi.fn()
    const lt = vi.fn()
    const or = vi.fn()
    const eq = vi.fn(() => builder)
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    const builder = {
      or,
      lt,
      gt,
      order,
    }

    or.mockReturnValue(builder)
    lt.mockReturnValue(builder)
    gt.mockReturnValue(builder)

    const client = { from } as const

    const userId = 'user-1'
    const start = '2024-01-01T00:00:00.000Z'
    const end = '2024-01-02T00:00:00.000Z'

    await fetchInstancesForRange(userId, start, end, client as never)

    expect(from).toHaveBeenCalledWith('schedule_instances')
    expect(select).toHaveBeenCalledWith('*')
    expect(eq).toHaveBeenCalledWith('user_id', userId)
    const { STATUS_OR_CLAUSE } = __INTERNAL_VISIBLE_INSTANCE_STATUS_HELPERS__

    expect(or).toHaveBeenCalledWith(STATUS_OR_CLAUSE)
    expect(lt).toHaveBeenCalledWith('start_utc', end)
    expect(gt).toHaveBeenCalledWith('end_utc', start)
    expect(order).toHaveBeenCalledWith('start_utc', { ascending: true })
  })
})
