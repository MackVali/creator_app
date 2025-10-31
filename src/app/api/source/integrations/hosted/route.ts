import { NextRequest, NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"

import {
  type ResolvedHostedConnector,
  resolveHostedConnectors,
} from "./config"
import {
  integrationSelectFields,
  serializeIntegration,
  type IntegrationRow,
} from "../route"
import { isRecord } from "../oauth/utils"
import type {
  HostedConnectorSummary,
  HostedConnectorsResponse,
} from "@/types/source"

export const runtime = "nodejs"

export async function GET() {
  const connectors = resolveHostedConnectors()

  if (connectors.length === 0) {
    return NextResponse.json<HostedConnectorsResponse>({ connectors: [] })
  }

  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    return NextResponse.json<HostedConnectorsResponse>({
      connectors: connectors.map((connector) => toSummary(connector, null)),
    })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json<HostedConnectorsResponse>({
      connectors: connectors.map((connector) => toSummary(connector, null)),
    })
  }

  const orFilter = connectors
    .map((connector) => `oauth_metadata->>hosted_connector_id.eq.${connector.id}`)
    .join(",")

  let integrationRows: IntegrationRow[] = []

  if (orFilter) {
    const { data, error } = await supabase
      .from("source_integrations")
      .select(integrationSelectFields)
      .eq("user_id", user.id)
      .or(orFilter)

    if (error) {
      console.error("Failed to load hosted connectors", error)
    } else if (Array.isArray(data)) {
      integrationRows = data as IntegrationRow[]
    }
  }

  const integrationById = integrationRows.reduce<Record<string, IntegrationRow>>(
    (acc, row) => {
      const hostedId = extractHostedConnectorId(row)
      if (hostedId) {
        acc[hostedId] = row
      }
      return acc
    },
    {}
  )

  const summaries: HostedConnectorSummary[] = connectors.map((connector) =>
    toSummary(connector, integrationById[connector.id] ?? null)
  )

  return NextResponse.json<HostedConnectorsResponse>({ connectors: summaries })
}

export async function POST(request: NextRequest) {
  const connectors = resolveHostedConnectors()

  if (connectors.length === 0) {
    return NextResponse.json({ error: "Hosted connectors are not configured" }, { status: 400 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const connectorId =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? ((payload as Record<string, unknown>).connectorId as string | undefined)
      : undefined

  if (!connectorId || typeof connectorId !== "string") {
    return NextResponse.json({ error: "connectorId is required" }, { status: 400 })
  }

  const connector = connectors.find((item) => item.id === connectorId)

  if (!connector) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 })
  }

  if (
    !connector.enabled ||
    !connector.connectionUrl ||
    !connector.publishUrl ||
    !connector.authorizeUrl ||
    !connector.tokenUrl
  ) {
    return NextResponse.json(
      { error: connector.disabledReason ?? "Connector is not ready" },
      { status: 400 }
    )
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

  const { data: existing, error: existingError } = await supabase
    .from("source_integrations")
    .select(integrationSelectFields)
    .eq("user_id", user.id)
    .eq("oauth_metadata->>hosted_connector_id", connector.id)
    .maybeSingle()

  if (existingError && existingError.code !== "PGRST116") {
    console.error("Failed to load hosted connector", existingError)
    return NextResponse.json(
      { error: "Unable to create connector" },
      { status: 500 }
    )
  }

  if (existing) {
    const integration = serializeIntegration(existing as IntegrationRow)
    return NextResponse.json({ integration }, { status: 200 })
  }

  const metadata: Record<string, unknown> = {
    hosted_connector_id: connector.id,
  }

  if (connector.metadata) {
    Object.assign(metadata, connector.metadata)
  }

  const insert = {
    user_id: user.id,
    provider: connector.provider,
    display_name: connector.displayName,
    connection_url: connector.connectionUrl,
    publish_url: connector.publishUrl,
    publish_method: connector.publishMethod,
    auth_mode: "oauth2" as const,
    auth_token: null,
    auth_header: null,
    headers: null,
    payload_template: null,
    status: "disabled" as const,
    oauth_authorize_url: connector.authorizeUrl,
    oauth_token_url: connector.tokenUrl,
    oauth_scopes: connector.scopes,
    oauth_client_id: connector.clientId,
    oauth_client_secret: connector.clientSecret,
    oauth_metadata: metadata,
  }

  const { data, error } = await supabase
    .from("source_integrations")
    .insert(insert)
    .select(integrationSelectFields)
    .single()

  if (error || !data) {
    console.error("Failed to create hosted connector", error)
    return NextResponse.json(
      { error: "Unable to create connector" },
      { status: 500 }
    )
  }

  const integration = serializeIntegration(data as IntegrationRow)

  return NextResponse.json({ integration }, { status: 201 })
}

function toSummary(connector: ResolvedHostedConnector, row: IntegrationRow | null): HostedConnectorSummary {
  return {
    id: connector.id,
    label: connector.label,
    description: connector.description,
    gradient: connector.gradient,
    icon: connector.icon,
    enabled: connector.enabled,
    disabledReason: connector.disabledReason,
    requiresOauth: true,
    integration: row ? serializeIntegration(row) : null,
  }
}

function extractHostedConnectorId(row: IntegrationRow) {
  if (!row.oauth_metadata) return null
  if (!isRecord(row.oauth_metadata)) return null
  const raw = (row.oauth_metadata as Record<string, unknown>).hosted_connector_id
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}
