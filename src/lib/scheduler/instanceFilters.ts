export const VISIBLE_INSTANCE_STATUS_FILTER =
  'status.is.null,status.eq.scheduled,status.eq.completed,status.eq.missed'

export function applyVisibleInstanceStatusFilter<
  T extends {
    or: (filter: string, options?: { foreignTable?: string }) => T
  }
>(query: T): T {
  return query.or(VISIBLE_INSTANCE_STATUS_FILTER)
}
