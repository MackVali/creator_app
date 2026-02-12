import { NextRequest, NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requirePlus } from "@/lib/entitlements/requirePlus"

import {
  coerceNumber,
  coerceString,
  deriveOAuthErrorMessage,
  extractClientCredentialKeys,
  extractRedirectUriKey,
  extractTokenBodyFormat,
  extractTokenCodeKey,
  extractTokenHeaders,
  extractTokenMethod,
  extractTokenParams,
  isRecord,
  parseOAuthTokenResponse,
  shouldUsePkce,
} from "../utils"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const gate = await requirePlus()
  if (gate) {
    return gate
  }

  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    return htmlResponse({ status: "error", message: "Supabase client not initialized" })
  }

  const searchParams = request.nextUrl.searchParams
  const state = searchParams.get("state")
  const code = searchParams.get("code")
  const errorParam = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return htmlResponse({ status: "error", message: "Authentication required" })
  }

  if (errorParam) {
    const message = errorDescription || errorParam
    await clearState(supabase, state, user.id)
    return htmlResponse({ status: "error", message })
  }

  if (!state || !code) {
    await clearState(supabase, state, user.id)
    return htmlResponse({ status: "error", message: "Missing OAuth state or code" })
  }

  const { data: stateRow, error: stateError } = await supabase
    .from("source_oauth_states")
    .select("id, integration_id, code_verifier, redirect_uri")
    .eq("state", state)
    .eq("user_id", user.id)
    .single()

  if (stateError || !stateRow) {
    return htmlResponse({ status: "error", message: "OAuth session expired" })
  }

  const { data: integration, error: integrationError } = await supabase
    .from("source_integrations")
    .select(
      "id, provider, status, oauth_token_url, oauth_client_id, oauth_client_secret, oauth_scopes, oauth_refresh_token, oauth_metadata"
    )
    .eq("id", stateRow.integration_id)
    .eq("user_id", user.id)
    .single()

  if (integrationError || !integration) {
    await clearState(supabase, state, user.id)
    return htmlResponse({ status: "error", message: "Integration not found" })
  }

  if (!integration.oauth_token_url || !integration.oauth_client_id) {
    await clearState(supabase, state, user.id)
    return htmlResponse({ status: "error", message: "Integration OAuth settings incomplete" })
  }

  const metadata = isRecord(integration.oauth_metadata)
    ? (integration.oauth_metadata as Record<string, unknown>)
    : null

  const tokenParams = new URLSearchParams()
  const codeKey = extractTokenCodeKey(metadata)
  tokenParams.set(codeKey, code)

  const redirectKey = extractRedirectUriKey(metadata)
  if (redirectKey) {
    tokenParams.set(redirectKey, stateRow.redirect_uri)
  }

  const { clientIdKey, clientSecretKey } = extractClientCredentialKeys(metadata)
  tokenParams.set(clientIdKey, integration.oauth_client_id)

  if (shouldUsePkce(metadata) && stateRow.code_verifier) {
    tokenParams.set("code_verifier", stateRow.code_verifier)
  }

  if (clientSecretKey && integration.oauth_client_secret) {
    tokenParams.set(clientSecretKey, integration.oauth_client_secret)
  }

  const extraTokenParams = extractTokenParams(metadata)
  if (extraTokenParams) {
    for (const [key, value] of Object.entries(extraTokenParams)) {
      if (!key) continue
      tokenParams.set(key, value)
    }
  }

  if (!tokenParams.has("grant_type")) {
    tokenParams.set("grant_type", "authorization_code")
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
      for (const [key, value] of tokenParams.entries()) {
        url.searchParams.set(key, value)
      }
      tokenResponse = await fetch(url.toString(), {
        method: "GET",
        headers,
      })
    } else {
      const body =
        bodyFormat === "json"
          ? JSON.stringify(Object.fromEntries(tokenParams.entries()))
          : tokenParams.toString()

      tokenResponse = await fetch(integration.oauth_token_url, {
        method: "POST",
        headers,
        body,
      })
    }
  } catch (error) {
    await clearState(supabase, state, user.id)
    const message = error instanceof Error ? error.message : "Unable to exchange OAuth code"
    return htmlResponse({ status: "error", message })
  }

  const { payload: tokenPayload, rawBody } = await parseOAuthTokenResponse(tokenResponse)

  if (!tokenResponse.ok) {
    await clearState(supabase, state, user.id)
    const message = deriveOAuthErrorMessage(tokenResponse, tokenPayload, rawBody)
    return htmlResponse({ status: "error", message })
  }

  if (!tokenPayload) {
    await clearState(supabase, state, user.id)
    return htmlResponse({ status: "error", message: "Provider returned an unreadable response" })
  }

  const accessToken = coerceString(tokenPayload.access_token)
  if (!accessToken) {
    await clearState(supabase, state, user.id)
    return htmlResponse({ status: "error", message: "Provider did not return an access token" })
  }

  const refreshToken = coerceString(tokenPayload.refresh_token) ?? integration.oauth_refresh_token

  const expiresIn = coerceNumber(tokenPayload.expires_in)
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null

  const updatePayload = {
    oauth_access_token: accessToken,
    oauth_refresh_token: refreshToken ?? null,
    oauth_expires_at: expiresAt,
    status: integration.status === "disabled" ? "active" : integration.status,
  }

  const { error: updateError } = await supabase
    .from("source_integrations")
    .update(updatePayload)
    .eq("id", integration.id)
    .eq("user_id", user.id)

  await clearState(supabase, state, user.id)

  if (updateError) {
    console.error("Failed to persist OAuth tokens", updateError)
    return htmlResponse({ status: "error", message: "Unable to store OAuth credentials" })
  }

  return htmlResponse({ status: "success" })
}

async function clearState(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, state: string | null, userId: string) {
  if (!state) return
  await supabase
    .from("source_oauth_states")
    .delete()
    .eq("state", state)
    .eq("user_id", userId)
}

function htmlResponse({
  status,
  message,
}: {
  status: "success" | "error"
  message?: string
}) {
  const payload = {
    type: "source:oauth:complete",
    status,
    message: message ?? null,
  }

  const script = `window.opener && window.opener.postMessage(${JSON.stringify(payload)}, window.location.origin);
window.close();`

  const body = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Source OAuth</title>
    <style>
      body { background: #020617; color: #e2e8f0; font-family: system-ui, sans-serif; display: grid; place-items: center; height: 100vh; margin: 0; }
      .card { padding: 2rem; border-radius: 1rem; border: 1px solid rgba(148, 163, 184, 0.2); background: rgba(15, 23, 42, 0.8); max-width: 28rem; text-align: center; }
      .status { font-weight: 600; margin-bottom: 0.5rem; }
      .message { font-size: 0.875rem; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="status">${status === "success" ? "Connection complete" : "Connection failed"}</div>
      <div class="message">${message ? escapeHtml(message) : "You can close this window."}</div>
    </div>
    <script>${script}</script>
  </body>
</html>`

  return new NextResponse(body, { headers: { "Content-Type": "text/html" } })
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
