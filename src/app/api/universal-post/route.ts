import { NextResponse } from "next/server";

import { publishToIntegrations, type IntegrationRow } from "@/app/api/source/listings/route";
import {
  LISTING_FIELDS,
  serializeListing,
  type ListingRow,
} from "@/app/api/source/listings/shared";
import type { PublishResult } from "@/types/source";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requirePlus } from "@/lib/entitlements/requirePlus";

export const runtime = "nodejs";

const integrationFields =
  "id, provider, display_name, connection_url, publish_url, publish_method, auth_mode, auth_token, auth_header, headers, payload_template, status, oauth_token_url, oauth_client_id, oauth_client_secret, oauth_access_token, oauth_refresh_token, oauth_expires_at, oauth_scopes, oauth_metadata";

type IncomingMedia = { url?: unknown; type?: unknown };

type PostPayload = {
  title?: unknown;
  content?: unknown;
  media?: unknown;
  mediaTypes?: unknown;
  integrationIds?: unknown;
};

type SanitizedMedia = { url: string; type: "text" | "image" | "video" | "link" };

const ALLOWED_MEDIA_TYPES: SanitizedMedia["type"][] = ["text", "image", "video", "link"];

export async function POST(request: Request) {
  const gate = await requirePlus();
  if (gate) {
    return gate;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: PostPayload;
  try {
    payload = (await request.json()) as PostPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const rawTitle = typeof payload.title === "string" ? payload.title.trim() : "";
  const rawContent = typeof payload.content === "string" ? payload.content.trim() : "";

  if (!rawTitle && !rawContent) {
    return NextResponse.json(
      { error: "Add a headline or message before posting" },
      { status: 400 }
    );
  }

  const mediaEntries = Array.isArray(payload.media)
    ? (payload.media as IncomingMedia[])?.slice(0, 10)
    : [];

  const normalizedMedia: SanitizedMedia[] = mediaEntries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const url = typeof entry.url === "string" ? entry.url.trim() : "";
      if (!url) return null;
      const typeValue = typeof entry.type === "string" ? entry.type.toLowerCase() : "link";
      const type = (ALLOWED_MEDIA_TYPES.includes(typeValue as SanitizedMedia["type"]) ? typeValue : "link") as SanitizedMedia["type"];
      return { url, type } satisfies SanitizedMedia;
    })
    .filter(Boolean) as SanitizedMedia[];

  const normalizedMediaTypes = Array.isArray(payload.mediaTypes)
    ? Array.from(
        new Set(
          (payload.mediaTypes as unknown[])
            .map((value) => (typeof value === "string" ? value.toLowerCase().trim() : ""))
            .filter((value) => value && ALLOWED_MEDIA_TYPES.includes(value as SanitizedMedia["type"]))
        )
      )
    : [];

  if (normalizedMediaTypes.length === 0 && rawContent) {
    normalizedMediaTypes.push("text");
  }

  const selectedIntegrationIds = Array.isArray(payload.integrationIds)
    ? (payload.integrationIds as unknown[]).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : null;

  let query = supabase
    .from("source_integrations")
    .select(integrationFields)
    .eq("user_id", user.id);

  if (selectedIntegrationIds && selectedIntegrationIds.length > 0) {
    query = query.in("id", selectedIntegrationIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load integrations for universal post", error);
    return NextResponse.json(
      { error: "Unable to load connected accounts" },
      { status: 500 }
    );
  }

  const integrations = (data ?? []) as IntegrationRow[];
  const activeIntegrations = integrations.filter((integration) => integration.status === "active");

  const missingIntegrationIds = selectedIntegrationIds
    ? selectedIntegrationIds.filter((id) => !integrations.some((integration) => integration.id === id))
    : [];

  if (activeIntegrations.length === 0) {
    return NextResponse.json(
      { error: "Connect an account before posting", missingIntegrationIds },
      { status: 400 }
    );
  }

  const normalizedTitle = rawTitle || rawContent.slice(0, 80) || "Post";
  const selectedSnapshot = selectedIntegrationIds && selectedIntegrationIds.length > 0 ? selectedIntegrationIds : null;
  const deliveredIds = activeIntegrations.map((integration) => integration.id);
  const postMetadata = {
    title: rawTitle || null,
    content: rawContent || null,
    media: normalizedMedia,
    mediaTypes: normalizedMediaTypes,
    selectedIntegrationIds: selectedSnapshot,
    deliveredIntegrationIds: deliveredIds,
    missingIntegrationIds: missingIntegrationIds.length > 0 ? missingIntegrationIds : null,
  };

  const metadata = {
    kind: "post" as const,
    post: postMetadata,
  } satisfies Record<string, unknown>;

  const { data: inserted, error: insertError } = await supabase
    .from("source_listings")
    .insert({
      user_id: user.id,
      type: "post",
      title: normalizedTitle,
      description: rawContent || null,
      price: null,
      currency: "USD",
      status: "queued",
      metadata,
    })
    .select(LISTING_FIELDS)
    .single();

  if (insertError || !inserted) {
    console.error("Failed to create universal post listing", insertError);
    return NextResponse.json({ error: "Unable to record post" }, { status: 500 });
  }

  let listing = serializeListing(inserted as ListingRow);
  listing = {
    ...listing,
    metadata,
  };

  const { publishResults, nextStatus } = await publishToIntegrations({
    supabase,
    listing,
    integrations: activeIntegrations,
    userId: user.id,
  });

  const updatePayload: Partial<ListingRow> & {
    publish_results: PublishResult[] | null;
  } = {
    publish_results: publishResults.length > 0 ? publishResults : null,
    status: nextStatus,
    metadata,
    published_at: nextStatus === "published" ? new Date().toISOString() : listing.published_at,
  };

  const { data: updated, error: updateError } = await supabase
    .from("source_listings")
    .update(updatePayload)
    .eq("id", listing.id)
    .eq("user_id", user.id)
    .select(LISTING_FIELDS)
    .single();

  if (updateError || !updated) {
    console.error("Failed to update universal post after publish", updateError);
    listing = {
      ...listing,
      status: nextStatus,
      publish_results: publishResults.length > 0 ? publishResults : null,
      published_at:
        nextStatus === "published" ? new Date().toISOString() : listing.published_at,
    };
  } else {
    listing = serializeListing(updated as ListingRow);
  }

  const responseBody: Record<string, unknown> = {
    listing,
    results: publishResults,
    usedIntegrationIds: deliveredIds,
  };

  if (missingIntegrationIds.length > 0) {
    responseBody.missingIntegrationIds = missingIntegrationIds;
  }

  return NextResponse.json(responseBody, { status: 201 });
}
