import { Buffer } from "node:buffer"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import type { PublishResult, SourceListing } from "@/types/source"
import {
  coerceNumber,
  coerceString,
  deriveOAuthErrorMessage,
  extractClientCredentialKeys,
  extractTokenBodyFormat,
  extractTokenHeaders,
  extractRefreshTokenParams,
  isRecord,
  parseOAuthTokenResponse,
} from "../integrations/oauth/utils"
import {
  LISTING_FIELDS,
  serializeListing,
  type ListingRow,
  sanitizePublishResults,
} from "./shared"

import { requirePlus } from "@/lib/entitlements/requirePlus"

export const runtime = "nodejs"

export type IntegrationRow = {
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
  status: string
  oauth_token_url: string | null
  oauth_client_id: string | null
  oauth_client_secret: string | null
  oauth_access_token: string | null
  oauth_refresh_token: string | null
  oauth_expires_at: string | null
  oauth_scopes: string[] | null
  oauth_metadata: Record<string, unknown> | null
}

export async function GET() {
  const gate = await requirePlus()
  if (gate) {
    return gate
  }

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
    .select(LISTING_FIELDS)
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
  const gate = await requirePlus()
  if (gate) {
    return gate
  }

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
    .select(LISTING_FIELDS)
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
      "id, provider, display_name, connection_url, publish_url, publish_method, auth_mode, auth_token, auth_header, headers, payload_template, status, oauth_token_url, oauth_client_id, oauth_client_secret, oauth_access_token, oauth_refresh_token, oauth_expires_at, oauth_scopes, oauth_metadata"
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

  const { publishResults, nextStatus } = await publishToIntegrations({
    supabase,
    listing,
    integrations: (integrations ?? []) as IntegrationRow[],
    userId: user.id,
  })
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
    .select(LISTING_FIELDS)
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

export async function publishToIntegrations({
  supabase,
  listing,
  integrations,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  listing: SourceListing
  integrations: IntegrationRow[]
  userId: string
}) {
  const publishContextListing = {
    ...listing,
    metadata: listing.metadata ?? {},
  }

  const publishResults: PublishResult[] = []

  for (const integration of integrations) {
    let integrationRecord = integration
    let oauthToken: string | null = null

    if (integrationRecord.auth_mode === "oauth2") {
      const ensured = await ensureOAuthAccessToken(supabase, integrationRecord, userId)
      if ("error" in ensured) {
        publishResults.push({
          integrationId: integrationRecord.id,
          integrationName: integrationRecord.display_name ?? integrationRecord.provider,
          status: "failed",
          responseCode: null,
          responseBody: null,
          error: ensured.error,
          externalId: null,
          completedAt: new Date().toISOString(),
        })
        continue
      }

      oauthToken = ensured.token
      integrationRecord = ensured.integration
    }

    const context = {
      listing: publishContextListing,
      integration: {
        id: integrationRecord.id,
        provider: integrationRecord.provider,
        displayName: integrationRecord.display_name,
        connectionUrl: integrationRecord.connection_url,
      },
    }

    const payloadBody = buildPayload(integrationRecord, context)
    const headers = buildHeaders(integrationRecord, context, oauthToken ?? undefined)
    const method = normalizeMethod(integrationRecord.publish_method)

    const result: PublishResult = {
      integrationId: integrationRecord.id,
      integrationName: integrationRecord.display_name ?? integrationRecord.provider,
      status: "failed",
      responseCode: null,
      responseBody: null,
      error: null,
      externalId: null,
      completedAt: new Date().toISOString(),
    }

    try {
      const response = await fetch(integrationRecord.publish_url, {
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

  return { publishResults, nextStatus }
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

async function ensureOAuthAccessToken(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  integration: IntegrationRow,
  userId: string
): Promise<{ token: string; integration: IntegrationRow } | { error: string }> {
  if (!integration.oauth_access_token) {
    return { error: "Connect this integration to authorize API access." }
  }

  const expiresAt = integration.oauth_expires_at ? new Date(integration.oauth_expires_at).getTime() : null
  if (!expiresAt || Number.isNaN(expiresAt) || expiresAt - Date.now() > 60_000) {
    return { token: integration.oauth_access_token, integration }
  }

  if (!integration.oauth_refresh_token) {
    return { error: "OAuth access token expired and no refresh token is available." }
  }

  if (!integration.oauth_token_url || !integration.oauth_client_id) {
    return { error: "OAuth refresh settings are incomplete for this integration." }
  }

  const metadata = isRecord(integration.oauth_metadata) ? integration.oauth_metadata : null
  const { clientIdKey, clientSecretKey } = extractClientCredentialKeys(metadata)

  const params = new URLSearchParams()
  params.set("grant_type", "refresh_token")
  params.set("refresh_token", integration.oauth_refresh_token)
  params.set(clientIdKey, integration.oauth_client_id)

  if (clientSecretKey && integration.oauth_client_secret) {
    params.set(clientSecretKey, integration.oauth_client_secret)
  }

  const refreshParams = extractRefreshTokenParams(metadata)
  if (refreshParams) {
    for (const [key, value] of Object.entries(refreshParams)) {
      if (!key) continue
      params.set(key, value)
    }
  }

  const tokenMethod = extractTokenMethod(metadata)
  const bodyFormat = extractTokenBodyFormat(metadata)
  const additionalHeaders = extractTokenHeaders(metadata)

  const headers: Record<string, string> = { Accept: "application/json" }
  if (additionalHeaders) {
    for (const [key, value] of Object.entries(additionalHeaders)) {
      if (!key) continue
      headers[key] = value
    }
  }

  if (tokenMethod === "POST") {
    const desiredContentType =
      bodyFormat === "json"
        ? "application/json"
        : "application/x-www-form-urlencoded"

    const hasContentType = Object.keys(headers).some(
      (key) => key.toLowerCase() === "content-type"
    )

    if (!hasContentType) {
      headers["Content-Type"] = desiredContentType
    }
  }

  let tokenResponse: Response
  try {
    if (tokenMethod === "GET") {
      const url = new URL(integration.oauth_token_url)
      for (const [key, value] of params.entries()) {
        url.searchParams.set(key, value)
      }
      tokenResponse = await fetch(url.toString(), { method: "GET", headers })
    } else {
      const body =
        bodyFormat === "json"
          ? JSON.stringify(Object.fromEntries(params.entries()))
          : params.toString()

      tokenResponse = await fetch(integration.oauth_token_url, {
        method: "POST",
        headers,
        body,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh OAuth token"
    return { error: message }
  }

  const { payload: tokenPayload, rawBody } = await parseOAuthTokenResponse(tokenResponse)

  if (!tokenResponse.ok) {
    const message = deriveOAuthErrorMessage(tokenResponse, tokenPayload, rawBody)
    return { error: message }
  }

  if (!tokenPayload) {
    return { error: "OAuth refresh returned an unreadable response." }
  }

  const accessToken = coerceString(tokenPayload.access_token)
  if (!accessToken) {
    return { error: "OAuth refresh did not return an access token." }
  }

  const refreshToken = coerceString(tokenPayload.refresh_token) ?? integration.oauth_refresh_token

  const expiresIn = coerceNumber(tokenPayload.expires_in)
  const nextExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null

  const { data, error } = await supabase
    .from("source_integrations")
    .update({
      oauth_access_token: accessToken,
      oauth_refresh_token: refreshToken,
      oauth_expires_at: nextExpiresAt,
    })
    .eq("id", integration.id)
    .eq("user_id", userId)
    .select("oauth_access_token, oauth_refresh_token, oauth_expires_at")
    .single()

  if (error) {
    console.error("Failed to store refreshed OAuth token", error)
    return { error: "Unable to store refreshed OAuth credentials." }
  }

  return {
    token: data?.oauth_access_token ?? accessToken,
    integration: {
      ...integration,
      oauth_access_token: data?.oauth_access_token ?? accessToken,
      oauth_refresh_token: data?.oauth_refresh_token ?? refreshToken,
      oauth_expires_at: data?.oauth_expires_at ?? nextExpiresAt,
    },
  }
}

function buildHeaders(
  integration: IntegrationRow,
  context: Record<string, unknown>,
  oauthAccessToken?: string
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

  if (integration.auth_mode === "oauth2" && oauthAccessToken) {
    headers.set("Authorization", `Bearer ${oauthAccessToken}`)
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

export const __testables = {
  publishToIntegrations,
  buildHeaders,
  applyTemplate,
  determineStatus,
  sanitizePublishResults,
}
