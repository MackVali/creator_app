import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { publishToIntegrations, sanitizePublishResults } from "@/lib/source/publisher"
import type { IntegrationRow } from "@/lib/source/publisher"
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

  const publishContext = {
    ...listing,
    metadata: listing.metadata ?? {},
  }

  const { publishResults, nextStatus } = await publishToIntegrations({
    supabase,
    integrations: (integrations ?? []) as IntegrationRow[],
    userId: user.id,
    context: {
      key: "listing",
      data: publishContext,
      buildDefaultPayload: ({ data, integration }) => ({
        id: data.id,
        type: data.type,
        title: data.title,
        description: data.description,
        price: data.price,
        currency: data.currency,
        metadata: data.metadata,
        published_at: data.published_at,
        updated_at: data.updated_at,
        integration,
      }),
    },
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

