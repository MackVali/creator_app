const VISIBLE_INSTANCE_STATUSES = ['scheduled', 'completed', 'missed'] as const

const NULL_STATUS_CLAUSE = 'status.is.null'
const VISIBLE_STATUS_EQ_CLAUSES = VISIBLE_INSTANCE_STATUSES.map(
  status => `status.eq.${status}`,
)
const STATUS_OR_CLAUSE = [NULL_STATUS_CLAUSE, ...VISIBLE_STATUS_EQ_CLAUSES].join(',')

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
  NULL_STATUS_CLAUSE,
  VISIBLE_STATUS_EQ_CLAUSES,
  STATUS_OR_CLAUSE,
}
