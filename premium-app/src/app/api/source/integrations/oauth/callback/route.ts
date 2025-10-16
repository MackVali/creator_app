import { NextRequest, NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
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
      "id, status, oauth_token_url, oauth_client_id, oauth_client_secret, oauth_scopes, oauth_refresh_token"
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

  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: stateRow.redirect_uri,
    client_id: integration.oauth_client_id,
    code_verifier: stateRow.code_verifier,
  })

  if (integration.oauth_client_secret) {
    tokenParams.append("client_secret", integration.oauth_client_secret)
  }

  const tokenResponse = await fetch(integration.oauth_token_url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  })

  if (!tokenResponse.ok) {
    const errorBody = await safeJson(tokenResponse)
    await clearState(supabase, state, user.id)
    const message = typeof errorBody?.error_description === "string"
      ? errorBody.error_description
      : tokenResponse.statusText || "OAuth authorization failed"
    return htmlResponse({ status: "error", message })
  }

  const tokenJson = await safeJson(tokenResponse)
  const accessToken = tokenJson?.access_token
  if (typeof accessToken !== "string" || !accessToken) {
    await clearState(supabase, state, user.id)
    return htmlResponse({ status: "error", message: "Provider did not return an access token" })
  }

  const refreshToken =
    typeof tokenJson?.refresh_token === "string"
      ? tokenJson.refresh_token
      : integration.oauth_refresh_token

  const expiresIn = typeof tokenJson?.expires_in === "number" ? tokenJson.expires_in : null
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

async function safeJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
