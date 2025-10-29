import { Buffer } from "node:buffer"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { PublishResult } from "@/types/source"

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
  payload_template: unknown | null
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

export type PublishStatus = "draft" | "queued" | "published" | "needs_attention"

export type PublishIntegrationContext = {
  id: string
  provider: string
  displayName: string | null
  connectionUrl: string
}

export type PublishContext<T extends Record<string, unknown>> = {
  key: string
  data: T
  buildDefaultPayload: (context: {
    data: T
    integration: PublishIntegrationContext
  }) => unknown
}

type PublishParams<T extends Record<string, unknown>> = {
  supabase: SupabaseClient<any>
  integrations: IntegrationRow[]
  userId: string
  context: PublishContext<T>
}

type PublishReturn = {
  publishResults: PublishResult[]
  nextStatus: PublishStatus
}

export async function publishToIntegrations<T extends Record<string, unknown>>({
  supabase,
  integrations,
  userId,
  context,
}: PublishParams<T>): Promise<PublishReturn> {
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

    const integrationContext: PublishIntegrationContext = {
      id: integrationRecord.id,
      provider: integrationRecord.provider,
      displayName: integrationRecord.display_name,
      connectionUrl: integrationRecord.connection_url,
    }

    const templateContext: Record<string, unknown> = {
      [context.key]: context.data,
      integration: integrationContext,
    }

    const payloadBody = buildPayload(integrationRecord, templateContext, context)
    const headers = buildHeaders(integrationRecord, templateContext, oauthToken ?? undefined)
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

function buildPayload<T extends Record<string, unknown>>(
  integration: IntegrationRow,
  templateContext: Record<string, unknown>,
  publishContext: PublishContext<T>
): unknown {
  if (integration.payload_template) {
    return applyTemplate(integration.payload_template, templateContext)
  }

  return publishContext.buildDefaultPayload({
    data: publishContext.data,
    integration: templateContext.integration as PublishIntegrationContext,
  })
}

async function ensureOAuthAccessToken(
  supabase: SupabaseClient<any>,
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

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: integration.oauth_refresh_token,
    client_id: integration.oauth_client_id,
  })

  if (integration.oauth_client_secret) {
    params.append("client_secret", integration.oauth_client_secret)
  }

  const metadata = isRecord(integration.oauth_metadata) ? integration.oauth_metadata : null
  const extraTokenParams = metadata ? extractTokenParams(metadata) : null
  if (extraTokenParams) {
    for (const [key, value] of Object.entries(extraTokenParams)) {
      params.set(key, value)
    }
  }

  let tokenResponse: Response
  try {
    tokenResponse = await fetch(integration.oauth_token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh OAuth token"
    return { error: message }
  }

  let tokenJson: Record<string, unknown> | null = null
  try {
    tokenJson = (await tokenResponse.clone().json()) as Record<string, unknown>
  } catch {
    tokenJson = null
  }

  let rawBody: string | null = null
  try {
    rawBody = await tokenResponse.text()
  } catch {
    rawBody = null
  }

  let tokenPayload = tokenJson
  if (!tokenPayload && rawBody) {
    const contentType = tokenResponse.headers.get("content-type")?.toLowerCase() ?? ""
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(rawBody)
      tokenPayload = Object.fromEntries(form.entries())
    } else {
      try {
        tokenPayload = JSON.parse(rawBody) as Record<string, unknown>
      } catch {
        tokenPayload = null
      }
    }
  }

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

function extractTokenParams(metadata: Record<string, unknown>) {
  const raw = metadata.token_params
  if (!isRecord(raw)) {
    return null
  }

  return Object.entries(raw).reduce((acc, [key, value]) => {
    if (!key) return acc
    if (value === null || value === undefined) return acc
    acc[key] = typeof value === "string" ? value : String(value)
    return acc
  }, {} as Record<string, string>)
}

function deriveOAuthErrorMessage(
  response: Response,
  payload: Record<string, unknown> | null,
  rawBody: string | null
) {
  if (payload) {
    const description = coerceString(payload.error_description)
    if (description) return description

    const error = coerceString(payload.error)
    if (error) return error

    const message = coerceString(payload.message)
    if (message) return message
  }

  const snippet = sanitizeResponseSnippet(rawBody)
  if (snippet) {
    return snippet
  }

  return response.statusText || "Failed to refresh OAuth token"
}

function sanitizeResponseSnippet(rawBody: string | null) {
  if (!rawBody) return null
  const stripped = rawBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  if (!stripped) return null
  return stripped.slice(0, 200)
}

function coerceString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return null
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function buildHeaders(
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

export function applyTemplate(template: unknown, context: Record<string, unknown>): unknown {
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

export function resolvePath(source: Record<string, unknown>, path: string): unknown {
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

export function normalizeMethod(method: string) {
  const normalized = method.toUpperCase()
  return normalized === "PUT" || normalized === "PATCH" ? normalized : "POST"
}

export function determineStatus(results: PublishResult[]): PublishStatus {
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

export const __testables = {
  publishToIntegrations,
  buildHeaders,
  applyTemplate,
  normalizeMethod,
  determineStatus,
  sanitizePublishResults,
}
