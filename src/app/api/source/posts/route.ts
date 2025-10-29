import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { publishToIntegrations, sanitizePublishResults } from "@/lib/source/publisher"
import type { IntegrationRow } from "@/lib/source/publisher"
import type { PublishResult, SourcePost } from "@/types/source"

export const runtime = "nodejs"

type PostRow = {
  id: string
  user_id: string
  caption: string | null
  media_url: string | null
  media_alt: string | null
  link_url: string | null
  status: string
  metadata: Record<string, unknown> | null
  publish_results: unknown
  published_at: string | null
  created_at: string
  updated_at: string
}

const postFields =
  "id, user_id, caption, media_url, media_alt, link_url, status, metadata, publish_results, published_at, created_at, updated_at"

export async function GET() {
  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    return NextResponse.json({ posts: [] }, { status: 200 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ posts: [] }, { status: 200 })
  }

  const { data, error } = await supabase
    .from("source_posts")
    .select(postFields)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50)

  if (error) {
    console.error("Failed to load posts", error)
    return NextResponse.json({ posts: [], error: "Unable to load posts" }, { status: 500 })
  }

  const posts = (data ?? []).map((row) => serializePost(row as PostRow))

  return NextResponse.json({ posts }, { status: 200 })
}

export async function POST(request: Request) {
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

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Post body must be an object" }, { status: 400 })
  }

  const {
    caption = null,
    mediaUrl,
    mediaAlt = null,
    linkUrl = null,
    metadata = null,
    publishNow = true,
  } = payload as Record<string, unknown>

  if (!mediaUrl || typeof mediaUrl !== "string" || !mediaUrl.trim()) {
    return NextResponse.json({ error: "A media URL is required" }, { status: 400 })
  }

  if (caption !== null && typeof caption !== "string") {
    return NextResponse.json({ error: "Caption must be text" }, { status: 400 })
  }

  if (mediaAlt !== null && typeof mediaAlt !== "string") {
    return NextResponse.json({ error: "Alt text must be text" }, { status: 400 })
  }

  if (linkUrl !== null) {
    if (typeof linkUrl !== "string" || (linkUrl.trim() && !isValidUrl(linkUrl))) {
      return NextResponse.json({ error: "Link URL must be valid" }, { status: 400 })
    }
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

  const shouldPublish = publishNow === true
  const normalizedMediaUrl = mediaUrl.trim()

  const insert = {
    user_id: user.id,
    caption: caption && typeof caption === "string" ? caption.trim() : null,
    media_url: normalizedMediaUrl,
    media_alt: mediaAlt && typeof mediaAlt === "string" ? mediaAlt.trim() : null,
    link_url: linkUrl && typeof linkUrl === "string" ? linkUrl.trim() : null,
    status: shouldPublish ? "queued" : "draft",
    metadata: preparedMetadata,
  }

  const { data: inserted, error: insertError } = await supabase
    .from("source_posts")
    .insert(insert)
    .select(postFields)
    .single()

  if (insertError || !inserted) {
    console.error("Failed to create post", insertError)
    return NextResponse.json({ error: "Unable to create post" }, { status: 500 })
  }

  let post = serializePost(inserted as PostRow)

  if (!shouldPublish) {
    return NextResponse.json({ post }, { status: 201 })
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
    return NextResponse.json({ error: "Unable to load integrations" }, { status: 500 })
  }

  const publishContext = {
    ...post,
    metadata: post.metadata ?? {},
  }

  const { publishResults, nextStatus } = await publishToIntegrations({
    supabase,
    integrations: (integrations ?? []) as IntegrationRow[],
    userId: user.id,
    context: {
      key: "post",
      data: publishContext,
      buildDefaultPayload: ({ data, integration }) => ({
        id: data.id,
        caption: data.caption,
        media_url: data.media_url,
        media_alt: data.media_alt,
        link_url: data.link_url,
        metadata: data.metadata,
        published_at: data.published_at,
        updated_at: data.updated_at,
        integration,
      }),
    },
  })

  const updatePayload: Partial<PostRow> & {
    publish_results: PublishResult[] | null
  } = {
    publish_results: publishResults.length > 0 ? publishResults : null,
    status: nextStatus,
    published_at: nextStatus === "published" ? new Date().toISOString() : post.published_at,
  }

  const { data: updated, error: updateError } = await supabase
    .from("source_posts")
    .update(updatePayload)
    .eq("id", post.id)
    .eq("user_id", user.id)
    .select(postFields)
    .single()

  if (updateError || !updated) {
    console.error("Failed to update post after publish", updateError)
    post = {
      ...post,
      status: nextStatus,
      publish_results: publishResults.length > 0 ? publishResults : null,
    }
  } else {
    post = serializePost(updated as PostRow)
  }

  return NextResponse.json({ post }, { status: 201 })
}

function serializePost(row: PostRow): SourcePost {
  return {
    id: row.id,
    caption: row.caption,
    media_url: row.media_url,
    media_alt: row.media_alt,
    link_url: row.link_url,
    status: row.status as SourcePost["status"],
    metadata: row.metadata ?? null,
    publish_results: sanitizePublishResults(row.publish_results),
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value)
    return Boolean(url.protocol && url.host)
  } catch {
    return false
  }
}
