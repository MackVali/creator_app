export const VISIBLE_INSTANCE_STATUS_CLAUSE =
  'or(status.is.null,status.eq.scheduled,status.eq.completed,status.eq.missed)'

export function buildInstanceVisibilityRangeOrClause(
  startUTC: string,
  endUTC: string,
): string {
  const startParam = startUTC
  const endParam = endUTC
  return [
    `and(${VISIBLE_INSTANCE_STATUS_CLAUSE},start_utc.gte.${startParam},start_utc.lt.${endParam})`,
    `and(${VISIBLE_INSTANCE_STATUS_CLAUSE},start_utc.lt.${startParam},end_utc.gt.${startParam})`,
  ].join(',')
}
