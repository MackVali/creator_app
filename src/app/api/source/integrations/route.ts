import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import type { SourceIntegration } from "@/types/source"

export const runtime = "nodejs"

const allowedMethods = ["POST", "PUT", "PATCH"] as const
const allowedAuthModes = ["none", "bearer", "basic", "api_key", "oauth2"] as const
const allowedStatuses = ["active", "disabled"] as const

type IntegrationRow = {
  id: string
  provider: string
  display_name: string | null
  connection_url: string
  publish_url: string
  publish_method: string
  auth_mode: string
  auth_header: string | null
  headers: Record<string, unknown> | null
  payload_template: Record<string, unknown> | null
  status: string
  oauth_authorize_url: string | null
  oauth_token_url: string | null
  oauth_scopes: string[] | null
  oauth_client_id: string | null
  oauth_access_token: string | null
  oauth_expires_at: string | null
  created_at: string
  updated_at: string
}

const integrationFields =
  "id, provider, display_name, connection_url, publish_url, publish_method, auth_mode, auth_header, headers, payload_template, status, oauth_authorize_url, oauth_token_url, oauth_scopes, oauth_client_id, oauth_access_token, oauth_expires_at, created_at, updated_at"

export async function GET() {
  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    return NextResponse.json({ integrations: [] }, { status: 200 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ integrations: [] }, { status: 200 })
  }

  const { data, error } = await supabase
    .from("source_integrations")
    .select(integrationFields)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Failed to load integrations", error)
    return NextResponse.json(
      { integrations: [], error: "Unable to load integrations" },
      { status: 500 }
    )
  }

  const integrations = (data ?? []).map(serializeIntegration)

  return NextResponse.json({ integrations }, { status: 200 })
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
    return NextResponse.json({ error: "Integration body must be an object" }, { status: 400 })
  }

  const {
    provider,
    displayName,
    connectionUrl,
    publishUrl,
    publishMethod = "POST",
    authMode = "none",
    authToken,
    authHeader,
    headers = null,
    payloadTemplate = null,
    status = "active",
    oauthAuthorizeUrl,
    oauthTokenUrl,
    oauthScopes = null,
    oauthClientId,
    oauthClientSecret,
    oauthMetadata = null,
  } = payload as Record<string, unknown>

  if (!provider || typeof provider !== "string" || !provider.trim()) {
    return NextResponse.json({ error: "Platform name is required" }, { status: 400 })
  }

  if (!connectionUrl || typeof connectionUrl !== "string" || !isValidUrl(connectionUrl)) {
    return NextResponse.json({ error: "A valid website URL is required" }, { status: 400 })
  }

  if (!publishUrl || typeof publishUrl !== "string" || !isValidUrl(publishUrl)) {
    return NextResponse.json({ error: "A valid publish endpoint is required" }, { status: 400 })
  }

  if (typeof publishMethod !== "string" || !allowedMethods.includes(publishMethod as typeof allowedMethods[number])) {
    return NextResponse.json({ error: "Unsupported HTTP method" }, { status: 400 })
  }

  if (typeof authMode !== "string" || !allowedAuthModes.includes(authMode as (typeof allowedAuthModes)[number])) {
    return NextResponse.json({ error: "Unsupported authentication mode" }, { status: 400 })
  }

  if (typeof status !== "string" || !allowedStatuses.includes(status as typeof allowedStatuses[number])) {
    return NextResponse.json({ error: "Unsupported status value" }, { status: 400 })
  }

  let normalizedAuthHeader: string | null = null
  if (authMode === "api_key") {
    if (authHeader !== undefined && authHeader !== null && typeof authHeader !== "string") {
      return NextResponse.json({ error: "API key header must be text" }, { status: 400 })
    }
    normalizedAuthHeader = (authHeader as string | undefined)?.trim() || "X-API-Key"
  }

  let preparedHeaders: Record<string, string> | null = null
  if (headers !== null) {
    if (typeof headers !== "object" || Array.isArray(headers)) {
      return NextResponse.json({ error: "Headers must be a JSON object" }, { status: 400 })
    }

    preparedHeaders = Object.entries(headers as Record<string, unknown>).reduce(
      (acc, [key, value]) => {
        if (!key) return acc
        acc[key] = typeof value === "string" ? value : JSON.stringify(value)
        return acc
      },
      {} as Record<string, string>
    )
  }

  let preparedTemplate: Record<string, unknown> | null = null
  if (payloadTemplate !== null) {
    if (typeof payloadTemplate !== "object" || Array.isArray(payloadTemplate)) {
      return NextResponse.json(
        { error: "Payload template must be a JSON object" },
        { status: 400 }
      )
    }
    preparedTemplate = payloadTemplate as Record<string, unknown>
  }

  let preparedAuthorizeUrl: string | null = null
  let preparedTokenUrl: string | null = null
  let preparedScopes: string[] | null = null
  let preparedClientId: string | null = null
  let preparedClientSecret: string | null = null
  let preparedOauthMetadata: Record<string, unknown> | null = null

  if (authMode === "oauth2") {
    if (!oauthAuthorizeUrl || typeof oauthAuthorizeUrl !== "string" || !isValidUrl(oauthAuthorizeUrl)) {
      return NextResponse.json({ error: "A valid authorization URL is required" }, { status: 400 })
    }

    if (!oauthTokenUrl || typeof oauthTokenUrl !== "string" || !isValidUrl(oauthTokenUrl)) {
      return NextResponse.json({ error: "A valid token URL is required" }, { status: 400 })
    }

    if (!oauthClientId || typeof oauthClientId !== "string" || !oauthClientId.trim()) {
      return NextResponse.json({ error: "OAuth client ID is required" }, { status: 400 })
    }

    preparedAuthorizeUrl = oauthAuthorizeUrl.trim()
    preparedTokenUrl = oauthTokenUrl.trim()
    preparedClientId = oauthClientId.trim()
    preparedClientSecret =
      typeof oauthClientSecret === "string" && oauthClientSecret.trim()
        ? oauthClientSecret.trim()
        : null

    try {
      preparedScopes = normalizeScopes(oauthScopes)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid OAuth scopes"
      return NextResponse.json({ error: message }, { status: 400 })
    }

    if (oauthMetadata !== null) {
      if (typeof oauthMetadata !== "object" || Array.isArray(oauthMetadata)) {
        return NextResponse.json({ error: "OAuth metadata must be an object" }, { status: 400 })
      }
      preparedOauthMetadata = oauthMetadata as Record<string, unknown>
    }
  }

  const normalizedStatus =
    authMode === "oauth2" && status === "active" ? "disabled" : (status as (typeof allowedStatuses)[number])

  const insert = {
    user_id: user.id,
    provider: provider.trim(),
    display_name:
      typeof displayName === "string" && displayName.trim()
        ? displayName.trim()
        : null,
    connection_url: connectionUrl.trim(),
    publish_url: publishUrl.trim(),
    publish_method: publishMethod,
    auth_mode: authMode,
    auth_token:
      typeof authToken === "string" && authToken.trim() ? authToken.trim() : null,
    auth_header: normalizedAuthHeader,
    headers: preparedHeaders,
    payload_template: preparedTemplate,
    status: normalizedStatus,
    oauth_authorize_url: preparedAuthorizeUrl,
    oauth_token_url: preparedTokenUrl,
    oauth_scopes: preparedScopes,
    oauth_client_id: preparedClientId,
    oauth_client_secret: preparedClientSecret,
    oauth_access_token: null,
    oauth_refresh_token: null,
    oauth_expires_at: null,
    oauth_metadata: preparedOauthMetadata,
  }

  const { data, error } = await supabase
    .from("source_integrations")
    .insert(insert)
    .select(integrationFields)
    .single()

  if (error) {
    console.error("Failed to create integration", error)
    const statusCode = error.code === "23505" ? 409 : 500
    return NextResponse.json(
      { error: "Unable to create integration" },
      { status: statusCode }
    )
  }

  const integration = serializeIntegration(data as IntegrationRow)

  return NextResponse.json({ integration }, { status: 201 })
}

function serializeIntegration(row: IntegrationRow): SourceIntegration {
  return {
    id: row.id,
    provider: row.provider,
    display_name: row.display_name,
    connection_url: row.connection_url,
    publish_url: row.publish_url,
    publish_method: row.publish_method as SourceIntegration["publish_method"],
    auth_mode: row.auth_mode as SourceIntegration["auth_mode"],
    auth_header: row.auth_header,
    headers: sanitizeHeaders(row.headers),
    payload_template: row.payload_template ?? null,
    status: row.status as SourceIntegration["status"],
    created_at: row.created_at,
    updated_at: row.updated_at,
    oauth:
      row.auth_mode === "oauth2"
        ? {
            authorize_url: row.oauth_authorize_url,
            token_url: row.oauth_token_url,
            scopes: Array.isArray(row.oauth_scopes)
              ? row.oauth_scopes.filter((scope) => typeof scope === "string")
              : [],
            client_id: row.oauth_client_id,
            connected: Boolean(row.oauth_access_token),
            expires_at: row.oauth_expires_at,
          }
        : null,
  }
}

function sanitizeHeaders(headers: IntegrationRow["headers"]) {
  if (!headers) return null
  return Object.entries(headers).reduce((acc, [key, value]) => {
    if (!key) return acc
    acc[key] = typeof value === "string" ? value : JSON.stringify(value)
    return acc
  }, {} as Record<string, string>)
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value)
    return Boolean(url.protocol && url.host)
  } catch {
    return false
  }
}

function normalizeScopes(value: unknown): string[] | null {
  if (value === null || value === undefined) {
    return null
  }

  if (Array.isArray(value)) {
    const scopes = value
      .map((scope) => (typeof scope === "string" ? scope.trim() : ""))
      .filter(Boolean)
    return scopes.length > 0 ? scopes : null
  }

  if (typeof value === "string") {
    const scopes = value
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
    return scopes.length > 0 ? scopes : null
  }

  throw new Error("OAuth scopes must be a string or array of strings")
}
