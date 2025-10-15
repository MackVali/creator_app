export type SourceIntegration = {
  id: string
  provider: string
  display_name: string | null
  connection_url: string
  publish_url: string
  publish_method: "POST" | "PUT" | "PATCH"
  auth_mode: "none" | "bearer" | "basic" | "api_key"
  headers: Record<string, string> | null
  payload_template: unknown | null
  status: "active" | "disabled"
  created_at: string
  updated_at: string
}

export type PublishResult = {
  integrationId: string
  integrationName?: string | null
  status: "synced" | "failed"
  responseCode?: number | null
  responseBody?: unknown
  error?: string | null
  externalId?: string | null
  completedAt?: string | null
}

export type SourceListing = {
  id: string
  type: "product" | "service"
  title: string
  description: string | null
  price: number | null
  currency: string
  status: "draft" | "queued" | "published" | "needs_attention"
  metadata: Record<string, unknown> | null
  publish_results: PublishResult[] | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export type IntegrationsResponse = {
  integrations: SourceIntegration[]
}

export type ListingsResponse = {
  listings: SourceListing[]
}
