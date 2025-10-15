import { Buffer } from "node:buffer"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import type { PublishResult, SourceListing } from "@/types/source"

export const runtime = "nodejs"

type ListingRow = {
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

type IntegrationRow = {
  id: string
  provider: string
  display_name: string | null
  connection_url: string
  publish_url: string
  publish_method: string
  auth_mode: string
  auth_token: string | null
  auth_header: string | null
  headers: Record<string, unknown> | null
  payload_template: Record<string, unknown> | null
}

const listingFields =
  "id, user_id, type, title, description, price, currency, status, metadata, publish_results, published_at, created_at, updated_at"

export async function GET() {
  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    return NextResponse.json({ listings: [] }, { status: 200 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ listings: [] }, { status: 200 })
  }

  const { data, error } = await supabase
    .from("source_listings")
    .select(listingFields)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50)

  if (error) {
    console.error("Failed to load listings", error)
    return NextResponse.json(
      { listings: [], error: "Unable to load listings" },
      { status: 500 }
    )
  }

  const listings = (data ?? []).map((row) => serializeListing(row as ListingRow))

  return NextResponse.json({ listings }, { status: 200 })
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 }
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Listing body must be an object" }, { status: 400 })
  }

  const {
    type,
    title,
    description = null,
    price = null,
    currency = "USD",
    metadata = null,
    publishNow = false,
  } = payload as Record<string, unknown>

  const shouldPublish = publishNow === true

  if (type !== "product" && type !== "service") {
    return NextResponse.json({ error: "Type must be product or service" }, { status: 400 })
  }

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 })
  }

  if (description !== null && typeof description !== "string") {
    return NextResponse.json({ error: "Description must be text" }, { status: 400 })
  }

  let parsedPrice: number | null = null
  if (price !== null) {
    if (typeof price === "number") {
      parsedPrice = Number.isFinite(price) ? price : null
    } else if (typeof price === "string" && price.trim()) {
      const next = Number.parseFloat(price)
      if (Number.isNaN(next)) {
        return NextResponse.json({ error: "Price must be numeric" }, { status: 400 })
      }
      parsedPrice = next
    } else {
      return NextResponse.json({ error: "Price must be numeric" }, { status: 400 })
    }

    if (parsedPrice !== null && parsedPrice < 0) {
      return NextResponse.json({ error: "Price cannot be negative" }, { status: 400 })
    }
  }

  if (!currency || typeof currency !== "string") {
    return NextResponse.json({ error: "Currency is required" }, { status: 400 })
  }

  const normalizedCurrency = currency.trim().toUpperCase()
  if (normalizedCurrency.length !== 3) {
    return NextResponse.json({ error: "Currency must be a 3 letter code" }, { status: 400 })
  }

  let preparedMetadata: Record<string, unknown> | null = null
  if (metadata !== null) {
    if (typeof metadata !== "object" || Array.isArray(metadata)) {
      return NextResponse.json({ error: "Metadata must be an object" }, { status: 400 })
    }
    preparedMetadata = { ...(metadata as Record<string, unknown>) }
    if (Object.keys(preparedMetadata).length === 0) {
      preparedMetadata = null
    }
  }

  const insert = {
    user_id: user.id,
    type,
    title: title.trim(),
    description: description ? (description as string).trim() : null,
    price: parsedPrice,
    currency: normalizedCurrency,
    status: shouldPublish ? "queued" : "draft",
    metadata: preparedMetadata,
  }

  const { data: inserted, error: insertError } = await supabase
    .from("source_listings")
    .insert(insert)
    .select(listingFields)
    .single()

  if (insertError || !inserted) {
    console.error("Failed to create listing", insertError)
    return NextResponse.json(
      { error: "Unable to create listing" },
      { status: 500 }
    )
  }

  let listing = serializeListing(inserted as ListingRow)

  if (!shouldPublish) {
    return NextResponse.json({ listing }, { status: 201 })
  }

  const { data: integrations, error: integrationsError } = await supabase
    .from("source_integrations")
    .select(
      "id, provider, display_name, connection_url, publish_url, publish_method, auth_mode, auth_token, auth_header, headers, payload_template, status"
    )
    .eq("user_id", user.id)
    .eq("status", "active")

  if (integrationsError) {
    console.error("Failed to load integrations for publishing", integrationsError)
    return NextResponse.json(
      { error: "Unable to load integrations" },
      { status: 500 }
    )
  }

  const publishContextListing = {
    ...listing,
    metadata: listing.metadata ?? {},
  }

  const publishResults: PublishResult[] = []

  for (const integration of (integrations ?? []) as IntegrationRow[]) {
    const context = {
      listing: publishContextListing,
      integration: {
        id: integration.id,
        provider: integration.provider,
        displayName: integration.display_name,
        connectionUrl: integration.connection_url,
      },
    }

    const payloadBody = buildPayload(integration, context)
    const headers = buildHeaders(integration, context)
    const method = normalizeMethod(integration.publish_method)

    const result: PublishResult = {
      integrationId: integration.id,
      integrationName: integration.display_name ?? integration.provider,
      status: "failed",
      responseCode: null,
      responseBody: null,
      error: null,
      externalId: null,
      completedAt: new Date().toISOString(),
    }

    try {
      const response = await fetch(integration.publish_url, {
        method,
        headers,
        body: JSON.stringify(payloadBody),
      })

      result.responseCode = response.status

      const text = await response.text()
      if (text) {
        try {
          result.responseBody = JSON.parse(text)
        } catch {
          result.responseBody = text
        }
      }

      if (response.ok) {
        result.status = "synced"
        if (
          result.responseBody &&
          typeof result.responseBody === "object" &&
          !Array.isArray(result.responseBody) &&
          "id" in (result.responseBody as Record<string, unknown>)
        ) {
          const externalId = (result.responseBody as Record<string, unknown>).id
          if (typeof externalId === "string" || typeof externalId === "number") {
            result.externalId = String(externalId)
          }
        }
      } else {
        result.status = "failed"
        result.error =
          typeof result.responseBody === "string"
            ? result.responseBody
            : response.statusText || "Failed to sync"
      }
    } catch (error) {
      result.status = "failed"
      result.error = error instanceof Error ? error.message : "Unknown error"
    }

    publishResults.push(result)
  }

  const nextStatus = determineStatus(publishResults)
  const updatePayload: Partial<ListingRow> & {
    publish_results: PublishResult[] | null
  } = {
    publish_results: publishResults.length > 0 ? publishResults : null,
    status: nextStatus,
    published_at:
      nextStatus === "published" ? new Date().toISOString() : listing.published_at,
  }

  const { data: updated, error: updateError } = await supabase
    .from("source_listings")
    .update(updatePayload)
    .eq("id", listing.id)
    .eq("user_id", user.id)
    .select(listingFields)
    .single()

  if (updateError || !updated) {
    console.error("Failed to update listing after publish", updateError)
    listing = {
      ...listing,
      status: nextStatus,
      publish_results: publishResults.length > 0 ? publishResults : null,
    }
  } else {
    listing = serializeListing(updated as ListingRow)
  }

  return NextResponse.json({ listing }, { status: 201 })
}

function serializeListing(row: ListingRow): SourceListing {
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

function sanitizePublishResults(value: unknown): PublishResult[] | null {
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

function buildPayload(
  integration: IntegrationRow,
  context: Record<string, unknown>
): unknown {
  if (integration.payload_template) {
    return applyTemplate(integration.payload_template, context)
  }

  const listing = context.listing as SourceListing

  return {
    id: listing.id,
    type: listing.type,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    metadata: listing.metadata,
    published_at: listing.published_at,
    updated_at: listing.updated_at,
    integration: context.integration,
  }
}

function buildHeaders(
  integration: IntegrationRow,
  context: Record<string, unknown>
): Headers {
  const headers = new Headers({ "Content-Type": "application/json" })

  if (integration.auth_mode === "bearer" && integration.auth_token) {
    headers.set("Authorization", `Bearer ${integration.auth_token}`)
  }

  if (integration.auth_mode === "basic" && integration.auth_token) {
    const encoded = Buffer.from(integration.auth_token, "utf-8").toString("base64")
    headers.set("Authorization", `Basic ${encoded}`)
  }

  if (integration.auth_mode === "api_key" && integration.auth_token) {
    const headerName = integration.auth_header?.trim() || "X-API-Key"
    headers.set(headerName, integration.auth_token)
  }

  if (integration.headers) {
    for (const [key, value] of Object.entries(integration.headers)) {
      if (!key) continue
      const templated = applyTemplate(value, context)
      if (templated === undefined || templated === null) continue
      headers.set(key, String(templated))
    }
  }

  return headers
}

function applyTemplate(template: unknown, context: Record<string, unknown>): unknown {
  if (template === null || template === undefined) {
    return template
  }

  if (typeof template === "string") {
    return template.replace(/{{\s*([^}]+)\s*}}/g, (_, token: string) => {
      const value = resolvePath(context, token.trim())
      if (value === undefined || value === null) return ""
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value)
      }
      return JSON.stringify(value)
    })
  }

  if (Array.isArray(template)) {
    return template.map((item) => applyTemplate(item, context))
  }

  if (typeof template === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
      result[key] = applyTemplate(value, context)
    }
    return result
  }

  return template
}

function resolvePath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== "object") return undefined
    if (Array.isArray(acc)) {
      const index = Number(segment)
      if (Number.isNaN(index)) return undefined
      return acc[index]
    }
    return (acc as Record<string, unknown>)[segment]
  }, source)
}

function normalizeMethod(method: string) {
  const normalized = method.toUpperCase()
  return normalized === "PUT" || normalized === "PATCH" ? normalized : "POST"
}

function determineStatus(results: PublishResult[]): SourceListing["status"] {
  if (results.length === 0) {
    return "draft"
  }

  if (results.every((result) => result.status === "synced")) {
    return "published"
  }

  if (results.some((result) => result.status === "synced")) {
    return "needs_attention"
  }

  return "needs_attention"
}
