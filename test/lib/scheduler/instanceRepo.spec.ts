import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowser: vi.fn(),
}))

import { buildInstanceVisibilityRangeOrClause } from '../../../src/lib/scheduler/instanceVisibility'
import { fetchInstancesForRange } from '../../../src/lib/scheduler/instanceRepo'

describe('fetchInstancesForRange', () => {
  it('requests only visible instances within the range', async () => {
    const order = vi.fn(async () => ({ data: [], error: null }))
    const or = vi.fn(() => ({ order }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    const client = { from } as const

    const userId = 'user-1'
    const start = '2024-01-01T00:00:00.000Z'
    const end = '2024-01-02T00:00:00.000Z'

    await fetchInstancesForRange(userId, start, end, client as never)

    expect(from).toHaveBeenCalledWith('schedule_instances')
    expect(select).toHaveBeenCalledWith('*')
    expect(eq).toHaveBeenCalledWith('user_id', userId)
    expect(or).toHaveBeenCalledWith(buildInstanceVisibilityRangeOrClause(start, end))
    expect(order).toHaveBeenCalledWith('start_utc', { ascending: true })
  })
})
