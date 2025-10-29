export type OAuthMetadata = Record<string, unknown>

type TokenBodyFormat = "form" | "json"
type TokenMethod = "GET" | "POST"

type ParsedTokenResponse = {
  payload: Record<string, unknown> | null
  rawBody: string | null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function extractTokenParams(metadata: OAuthMetadata | null) {
  if (!metadata) return null
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

export function extractRefreshTokenParams(metadata: OAuthMetadata | null) {
  if (!metadata) return null
  const raw = metadata.refresh_params
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

export function extractTokenHeaders(metadata: OAuthMetadata | null) {
  if (!metadata) return null
  const raw = metadata.token_headers
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

export function extractTokenMethod(metadata: OAuthMetadata | null): TokenMethod {
  if (!metadata) return "POST"
  const raw = metadata.token_method
  if (typeof raw !== "string") return "POST"
  const normalized = raw.trim().toUpperCase()
  return normalized === "GET" ? "GET" : "POST"
}

export function extractTokenBodyFormat(metadata: OAuthMetadata | null): TokenBodyFormat {
  if (!metadata) return "form"
  const raw = metadata.token_body_format
  if (typeof raw !== "string") return "form"
  const normalized = raw.trim().toLowerCase()
  return normalized === "json" ? "json" : "form"
}

export function extractClientCredentialKeys(metadata: OAuthMetadata | null) {
  const keys: { clientIdKey: string; clientSecretKey: string | null } = {
    clientIdKey: "client_id",
    clientSecretKey: "client_secret",
  }

  if (!metadata) return keys

  const rawClientId = metadata.token_client_id_key
  if (typeof rawClientId === "string" && rawClientId.trim()) {
    keys.clientIdKey = rawClientId.trim()
  }

  const rawClientSecret = metadata.token_client_secret_key
  if (rawClientSecret === null) {
    keys.clientSecretKey = null
  } else if (typeof rawClientSecret === "string" && rawClientSecret.trim()) {
    keys.clientSecretKey = rawClientSecret.trim()
  }

  return keys
}

export function extractTokenCodeKey(metadata: OAuthMetadata | null) {
  if (!metadata) return "code"
  const raw = metadata.token_code_key
  if (typeof raw !== "string") return "code"
  const trimmed = raw.trim()
  return trimmed || "code"
}

export function extractRedirectUriKey(metadata: OAuthMetadata | null): string | null {
  if (!metadata) return "redirect_uri"
  const raw = metadata.token_redirect_uri_key
  if (raw === null) return null
  if (typeof raw !== "string") return "redirect_uri"
  const trimmed = raw.trim()
  return trimmed || "redirect_uri"
}

export function shouldUsePkce(metadata: OAuthMetadata | null) {
  if (!metadata) return true
  const raw = metadata.pkce
  if (typeof raw === "boolean") {
    return raw
  }
  return true
}

export async function parseOAuthTokenResponse(response: Response): Promise<ParsedTokenResponse> {
  let payload: Record<string, unknown> | null = null
  try {
    payload = (await response.clone().json()) as Record<string, unknown>
  } catch {
    payload = null
  }

  let rawBody: string | null = null
  try {
    rawBody = await response.clone().text()
  } catch {
    rawBody = null
  }

  if (!payload && rawBody) {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(rawBody)
      payload = Object.fromEntries(form.entries())
    } else {
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>
      } catch {
        payload = null
      }
    }
  }

  return { payload, rawBody }
}

export function deriveOAuthErrorMessage(
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

  return response.statusText || "OAuth authorization failed"
}

export function sanitizeResponseSnippet(rawBody: string | null) {
  if (!rawBody) return null
  const stripped = rawBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  if (!stripped) return null
  return stripped.slice(0, 200)
}

export function coerceString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return null
}

export function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}
