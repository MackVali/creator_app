const VISIBLE_INSTANCE_STATUSES = ['scheduled', 'completed', 'missed'] as const

const VISIBLE_STATUS_IN_CLAUSE = `status.in.(${VISIBLE_INSTANCE_STATUSES.join(',')})`
const NULL_STATUS_CLAUSE = 'status.is.null'
const STATUS_OR_CLAUSE = `${NULL_STATUS_CLAUSE},${VISIBLE_STATUS_IN_CLAUSE}`

type VisibilityQueryBuilder = {
  or(clause: string): unknown
  lt(column: 'start_utc', value: string): unknown
  gt(column: 'end_utc', value: string): unknown
}

export function applyInstanceVisibilityFilters<T extends VisibilityQueryBuilder>(
  query: T,
  startUTC: string,
  endUTC: string,
): T {
  query.or(STATUS_OR_CLAUSE)
  query.lt('start_utc', endUTC)
  query.gt('end_utc', startUTC)
  return query
}

export const __INTERNAL_VISIBLE_INSTANCE_STATUS_HELPERS__ = {
  VISIBLE_INSTANCE_STATUSES,
  VISIBLE_STATUS_IN_CLAUSE,
  NULL_STATUS_CLAUSE,
  STATUS_OR_CLAUSE,
}
