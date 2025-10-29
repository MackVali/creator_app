import type { PublishResult, SourceListing } from "@/types/source"

export type ListingRow = {
  id: string
  user_id: string
  type: string
  title: string
  description: string | null
  price: number | null
  currency: string
  status: string
  metadata: Record<string, unknown> | null
  publish_results: unknown
  published_at: string | null
  created_at: string
  updated_at: string
}

export const LISTING_FIELDS =
  "id, user_id, type, title, description, price, currency, status, metadata, publish_results, published_at, created_at, updated_at"

export function serializeListing(row: ListingRow): SourceListing {
  return {
    id: row.id,
    type: row.type as SourceListing["type"],
    title: row.title,
    description: row.description,
    price: row.price,
    currency: row.currency,
    status: row.status as SourceListing["status"],
    metadata: row.metadata ?? null,
    publish_results: sanitizePublishResults(row.publish_results),
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function sanitizePublishResults(value: unknown): PublishResult[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const mapped = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const record = entry as Record<string, unknown>
      const integrationId = record.integrationId ?? record.integration_id
      if (typeof integrationId !== "string") return null

      const status = record.status === "synced" ? "synced" : "failed"
      const responseCode = typeof record.responseCode === "number" ? record.responseCode : null
      const responseBody = record.responseBody ?? null
      const error = typeof record.error === "string" ? record.error : null
      const externalId =
        typeof record.externalId === "string"
          ? record.externalId
          : typeof record.external_id === "string"
          ? record.external_id
          : null
      const completedAt =
        typeof record.completedAt === "string"
          ? record.completedAt
          : typeof record.completed_at === "string"
          ? record.completed_at
          : null

      return {
        integrationId,
        integrationName:
          typeof record.integrationName === "string"
            ? record.integrationName
            : typeof record.integration_name === "string"
            ? record.integration_name
            : null,
        status,
        responseCode,
        responseBody,
        error,
        externalId,
        completedAt,
      } satisfies PublishResult
    })
    .filter(Boolean) as PublishResult[]

  return mapped.length > 0 ? mapped : null
}
