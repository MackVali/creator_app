type HostedConnectorDefinition = {
  id: string
  label: string
  description: string
  gradient: string
  icon: string
  provider: string
  displayName: string
  authorizePath: string
  tokenPath: string
  publishPath: string
  publishMethod: "POST" | "PUT" | "PATCH"
  scopes: string[]
  metadata?: Record<string, unknown>
  env: {
    clientId: string
    clientSecret?: string
  }
}

export type ResolvedHostedConnector = HostedConnectorDefinition & {
  enabled: boolean
  disabledReason: string | null
  clientId: string | null
  clientSecret: string | null
  connectionUrl: string | null
  publishUrl: string | null
  authorizeUrl: string | null
  tokenUrl: string | null
}

const CONNECTOR_DEFINITIONS: HostedConnectorDefinition[] = [
  {
    id: "instagram",
    label: "Instagram",
    description: "Auto-publish Reels, feed posts, and stories without touching the API payloads.",
    gradient: "from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
    icon: "instagram",
    provider: "Instagram",
    displayName: "Instagram (Hosted)",
    authorizePath: "/oauth/instagram/authorize",
    tokenPath: "/oauth/instagram/token",
    publishPath: "/publish/instagram",
    publishMethod: "POST",
    scopes: ["profile", "content"],
    metadata: {
      token_body_format: "json",
      authorize_params: {
        prompt: "consent",
      },
    },
    env: {
      clientId: "SOURCE_CONNECT_INSTAGRAM_CLIENT_ID",
      clientSecret: "SOURCE_CONNECT_INSTAGRAM_CLIENT_SECRET",
    },
  },
  {
    id: "tiktok",
    label: "TikTok",
    description: "Push short-form clips to your TikTok shop through Creator Connect.",
    gradient: "from-[#010101] via-[#3A3A3A] to-[#25F4EE]",
    icon: "tiktok",
    provider: "TikTok",
    displayName: "TikTok (Hosted)",
    authorizePath: "/oauth/tiktok/authorize",
    tokenPath: "/oauth/tiktok/token",
    publishPath: "/publish/tiktok",
    publishMethod: "POST",
    scopes: ["video.upload", "video.read"],
    metadata: {
      token_body_format: "json",
    },
    env: {
      clientId: "SOURCE_CONNECT_TIKTOK_CLIENT_ID",
      clientSecret: "SOURCE_CONNECT_TIKTOK_CLIENT_SECRET",
    },
  },
  {
    id: "facebook-pages",
    label: "Facebook Pages",
    description: "Schedule catalog drops and marketplace updates using our managed connector.",
    gradient: "from-[#1877F2] via-[#3578E5] to-[#4C8BF5]",
    icon: "facebook",
    provider: "Facebook Pages",
    displayName: "Facebook Pages (Hosted)",
    authorizePath: "/oauth/facebook-pages/authorize",
    tokenPath: "/oauth/facebook-pages/token",
    publishPath: "/publish/facebook-pages",
    publishMethod: "POST",
    scopes: ["pages.manage_posts", "pages.read_engagement"],
    metadata: {
      token_body_format: "json",
    },
    env: {
      clientId: "SOURCE_CONNECT_FACEBOOK_CLIENT_ID",
      clientSecret: "SOURCE_CONNECT_FACEBOOK_CLIENT_SECRET",
    },
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    description: "Share thought leadership to organizations or showcase pages with a single click.",
    gradient: "from-[#0A66C2] via-[#174886] to-[#001D3D]",
    icon: "linkedin",
    provider: "LinkedIn",
    displayName: "LinkedIn (Hosted)",
    authorizePath: "/oauth/linkedin/authorize",
    tokenPath: "/oauth/linkedin/token",
    publishPath: "/publish/linkedin",
    publishMethod: "POST",
    scopes: ["profile", "content.write"],
    metadata: {
      token_body_format: "json",
    },
    env: {
      clientId: "SOURCE_CONNECT_LINKEDIN_CLIENT_ID",
      clientSecret: "SOURCE_CONNECT_LINKEDIN_CLIENT_SECRET",
    },
  },
]

export function getHostedConnectorDefinitions() {
  return CONNECTOR_DEFINITIONS
}

export function resolveHostedConnectors(): ResolvedHostedConnector[] {
  const baseUrl = process.env.SOURCE_CONNECT_BASE_URL?.trim() ?? ""
  const normalizedBase = baseUrl.replace(/\/+$/, "")

  return CONNECTOR_DEFINITIONS.map((definition) => {
    const clientId = process.env[definition.env.clientId]?.trim() ?? null
    const clientSecret = definition.env.clientSecret
      ? process.env[definition.env.clientSecret]?.trim() ?? null
      : null

    let disabledReason: string | null = null

    if (!normalizedBase) {
      disabledReason = "Set SOURCE_CONNECT_BASE_URL to enable hosted connectors."
    } else if (!clientId) {
      disabledReason = `Add ${definition.env.clientId} to finish setup.`
    } else if (definition.env.clientSecret && !clientSecret) {
      disabledReason = `Add ${definition.env.clientSecret} to finish setup.`
    }

    const enabled = !disabledReason

    return {
      ...definition,
      enabled,
      disabledReason,
      clientId,
      clientSecret,
      connectionUrl: enabled ? normalizedBase : null,
      publishUrl: enabled ? `${normalizedBase}${definition.publishPath}` : null,
      authorizeUrl: enabled ? `${normalizedBase}${definition.authorizePath}` : null,
      tokenUrl: enabled ? `${normalizedBase}${definition.tokenPath}` : null,
    }
  })
}
