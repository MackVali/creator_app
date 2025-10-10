import { describe, expect, it } from 'vitest'

import type { ScheduleInstance } from '@/lib/scheduler/instanceRepo'
import { fetchInstancesForRange } from '@/lib/scheduler/instanceRepo'
import { VISIBLE_INSTANCE_STATUS_FILTER } from '@/lib/scheduler/instanceFilters'

interface FakeScheduleInstance
  extends Omit<ScheduleInstance, 'status'> {
  status: ScheduleInstance['status'] | null
}

function makeInstance(
  id: string,
  overrides: Partial<FakeScheduleInstance> & {
    status?: FakeScheduleInstance['status']
  } = {}
): FakeScheduleInstance {
  const baseTime = '2024-01-01T00:00:00.000Z'
  return {
    id,
    created_at: baseTime,
    updated_at: baseTime,
    user_id: 'user-1',
    source_type: 'PROJECT',
    source_id: `project-${id}`,
    window_id: null,
    start_utc: baseTime,
    end_utc: '2024-01-01T01:00:00.000Z',
    duration_min: 60,
    weight_snapshot: 1,
    energy_resolved: 'NO',
    completed_at: null,
    ...overrides,
    status: overrides.status !== undefined ? overrides.status : 'scheduled',
  }
}

class FakeQueryBuilder {
  public statusClause: string | undefined
  private statusFilter: ((status: string | null) => boolean) | undefined

  private userId: string | undefined
  private readonly records: FakeScheduleInstance[]
  private readonly filters: {
    endUpperBound?: string
    startLowerBound?: string
  }

  constructor(records: FakeScheduleInstance[]) {
    this.records = records
    this.filters = {}
  }

  select() {
    return this
  }

  eq(column: string, value: string) {
    if (column === 'user_id') {
      this.userId = value
    }
    return this
  }

  lt(column: string, value: string) {
    if (column === 'start_utc') {
      this.filters.endUpperBound = value
    }
    return this
  }

  gt(column: string, value: string) {
    if (column === 'end_utc') {
      this.filters.startLowerBound = value
    }
    return this
  }

  or(filter: string) {
    this.statusClause = filter
    this.statusFilter = this.buildStatusFilter(filter)
    return this
  }

  async order(_column?: string, _options?: { ascending?: boolean }) {
    const filtered = this.records
      .filter(record => {
        if (this.userId && record.user_id !== this.userId) {
          return false
        }

        if (
          this.filters.endUpperBound &&
          !(record.start_utc < this.filters.endUpperBound)
        ) {
          return false
        }

        if (
          this.filters.startLowerBound &&
          !(record.end_utc > this.filters.startLowerBound)
        ) {
          return false
        }

        if (this.statusFilter) {
          const status = (record.status ?? null) as string | null
          return this.statusFilter(status)
        }

        return true
      })
      .sort((a, b) => a.start_utc.localeCompare(b.start_utc))

    return {
      data: filtered as unknown as ScheduleInstance[],
      error: null,
    }
  }

  private buildStatusFilter(
    clauseString: string
  ): (status: string | null) => boolean {
    const clauses: string[] = []
    let depth = 0
    let current = ''

    for (const char of clauseString) {
      if (char === '(') {
        depth += 1
      } else if (char === ')') {
        depth = Math.max(0, depth - 1)
      }

      if (char === ',' && depth === 0) {
        if (current) clauses.push(current)
        current = ''
        continue
      }

      current += char
    }

    if (current) clauses.push(current)

    return (status: string | null) => {
      return clauses.some(clause => {
        if (clause === 'status.is.null') {
          return status === null
        }

        const eqMatch = clause.match(/^status\.eq\.(.+)$/)
        if (eqMatch) {
          return status === eqMatch[1]
        }

        const neqMatch = clause.match(/^status\.neq\.(.+)$/)
        if (neqMatch) {
          return status !== null && status !== neqMatch[1]
        }

        const inMatch = clause.match(/^status\.in\.\((.+)\)$/)
        if (inMatch) {
          const values = inMatch[1].split(',')
          return status !== null && values.includes(status)
        }

        return false
      })
    }
  }
}

class FakeSupabaseClient {
  public lastQuery: FakeQueryBuilder | undefined

  constructor(private readonly records: FakeScheduleInstance[]) {}

  from() {
    const query = new FakeQueryBuilder(this.records)
    this.lastQuery = query
    return query
  }
}

describe('fetchInstancesForRange', () => {
  it('keeps null statuses while filtering out canceled instances', async () => {
    const start = '2024-01-01T00:00:00.000Z'
    const end = '2024-01-02T00:00:00.000Z'

    const records: FakeScheduleInstance[] = [
      makeInstance('null', {
        status: null,
        start_utc: '2024-01-01T09:00:00.000Z',
        end_utc: '2024-01-01T10:00:00.000Z',
      }),
      makeInstance('scheduled', {
        status: 'scheduled',
        start_utc: '2024-01-01T11:00:00.000Z',
        end_utc: '2024-01-01T12:00:00.000Z',
      }),
      makeInstance('canceled', {
        status: 'canceled',
        start_utc: '2024-01-01T13:00:00.000Z',
        end_utc: '2024-01-01T14:00:00.000Z',
      }),
      makeInstance('other-user', {
        user_id: 'user-2',
        status: null,
        start_utc: '2024-01-01T09:30:00.000Z',
        end_utc: '2024-01-01T10:30:00.000Z',
      }),
      makeInstance('completed-overlap', {
        status: 'completed',
        start_utc: '2023-12-31T23:30:00.000Z',
        end_utc: '2024-01-01T00:30:00.000Z',
      }),
      makeInstance('completed-outside', {
        status: 'completed',
        start_utc: '2023-12-31T21:00:00.000Z',
        end_utc: '2023-12-31T22:00:00.000Z',
      }),
      makeInstance('missed-after', {
        status: 'missed',
        start_utc: '2024-01-01T23:30:00.000Z',
        end_utc: '2024-01-02T01:00:00.000Z',
      }),
    ]

    const client = new FakeSupabaseClient(records)

    const result = await fetchInstancesForRange(
      'user-1',
      start,
      end,
      client as unknown as Parameters<typeof fetchInstancesForRange>[3]
    )

    expect(client.lastQuery?.statusClause).toBe(VISIBLE_INSTANCE_STATUS_FILTER)
    expect(result.error).toBeNull()
    const statuses = result.data?.map(record => record.status as unknown as FakeScheduleInstance['status']) ?? []

    expect(statuses).toContain(null)
    expect(statuses).not.toContain('canceled')
    expect(result.data?.map(record => record.id)).toEqual([
      'completed-overlap',
      'null',
      'scheduled',
      'missed-after',
    ])
  })
})
