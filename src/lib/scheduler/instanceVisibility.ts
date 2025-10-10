const VISIBLE_INSTANCE_STATUSES = ['scheduled', 'completed', 'missed'] as const

const VISIBLE_STATUS_IN_CLAUSE = `status.in.(${VISIBLE_INSTANCE_STATUSES.join(',')})`
const NULL_STATUS_CLAUSE = 'status.is.null'

export function buildInstanceVisibilityRangeOrClause(
  startUTC: string,
  endUTC: string,
): string {
  const startParam = startUTC
  const endParam = endUTC

  return [
    `and(${NULL_STATUS_CLAUSE},start_utc.gte.${startParam},start_utc.lt.${endParam})`,
    `and(${VISIBLE_STATUS_IN_CLAUSE},start_utc.gte.${startParam},start_utc.lt.${endParam})`,
    `and(${NULL_STATUS_CLAUSE},start_utc.lt.${startParam},end_utc.gt.${startParam})`,
    `and(${VISIBLE_STATUS_IN_CLAUSE},start_utc.lt.${startParam},end_utc.gt.${startParam})`,
  ].join(',')
}

export const __INTERNAL_VISIBLE_INSTANCE_STATUS_HELPERS__ = {
  VISIBLE_INSTANCE_STATUSES,
  VISIBLE_STATUS_IN_CLAUSE,
  NULL_STATUS_CLAUSE,
}
