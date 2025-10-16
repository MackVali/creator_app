import crypto from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"

export const runtime = "nodejs"

type Params = {
  params: {
    id: string
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = params

  if (!id) {
    return NextResponse.json({ error: "Integration id is required" }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    return NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("source_integrations")
    .select(
      "id, user_id, oauth_authorize_url, oauth_token_url, oauth_client_id, oauth_scopes, oauth_metadata"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (error || !data) {
    const status = error?.code === "PGRST116" ? 404 : 500
    const message = status === 404 ? "Integration not found" : "Unable to load integration"
    return NextResponse.json({ error: message }, { status })
  }

  const authorizeUrl = data.oauth_authorize_url
  const clientId = data.oauth_client_id

  if (!authorizeUrl || !data.oauth_token_url || !clientId) {
    return NextResponse.json(
      { error: "OAuth configuration is incomplete for this integration" },
      { status: 400 }
    )
  }

  const metadata = isRecord(data.oauth_metadata) ? (data.oauth_metadata as Record<string, unknown>) : null

  const origin = request.nextUrl.origin
  const redirectOverride = extractRedirectUri(metadata)
  const redirectUri = redirectOverride ?? `${origin}/api/source/integrations/oauth/callback`

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = crypto.randomBytes(16).toString("hex")

  const { error: stateError } = await supabase
    .from("source_oauth_states")
    .insert({
      user_id: user.id,
      integration_id: id,
      state,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    })

  if (stateError) {
    console.error("Failed to create OAuth state", stateError)
    return NextResponse.json(
      { error: "Unable to initiate OAuth flow" },
      { status: 500 }
    )
  }

  const url = new URL(authorizeUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")

  if (Array.isArray(data.oauth_scopes) && data.oauth_scopes.length > 0) {
    url.searchParams.set("scope", data.oauth_scopes.join(" "))
  }

  const additionalParams = extractAuthorizeParams(metadata)
  if (additionalParams) {
    for (const [key, value] of Object.entries(additionalParams)) {
      url.searchParams.set(key, value)
    }
  }

  return NextResponse.json({ authorizationUrl: url.toString() })
}

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url")
}

function generateCodeChallenge(codeVerifier: string) {
  const hash = crypto.createHash("sha256").update(codeVerifier).digest()
  return hash.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function extractRedirectUri(metadata: Record<string, unknown> | null) {
  if (!metadata) return null
  const raw = metadata.redirect_uri
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (!isValidUrl(trimmed)) return null
  return trimmed
}

function extractAuthorizeParams(metadata: Record<string, unknown> | null) {
  if (!metadata) return null
  const raw = metadata.authorize_params
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value)
    return Boolean(parsed.protocol && parsed.host)
  } catch {
    return false
  }
}
