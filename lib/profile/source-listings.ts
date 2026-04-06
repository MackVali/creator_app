import type { ProfileOffer } from "@/lib/types";
import type { SourceListing } from "@/types/source";

const DESTINATION_FIELDS = [
  "destination",
  "destinationUrl",
  "destination_url",
  "href",
  "url",
  "link",
  "productUrl",
  "product_url",
  "checkoutUrl",
  "checkout_url",
  "purchaseUrl",
  "purchase_url",
  "externalUrl",
  "external_url",
];

const IMAGE_FIELDS = [
  "cover",
  "cover_image",
  "coverImage",
  "image",
  "image_url",
  "imageUrl",
  "hero",
  "heroImage",
  "thumbnail",
  "thumbnailUrl",
];

const CTA_TEXT_FIELDS = [
  "cta_label",
  "ctaText",
  "cta_text",
  "ctaLabel",
  "button_label",
  "buttonLabel",
];

const DURATION_FIELDS = ["duration_minutes", "duration", "length_minutes"];
const TAG_FIELDS = ["tags", "tag_list", "tagList", "categories"];
const INVENTORY_FIELDS = ["inventory_status", "inventoryStatus", "status", "availability"];

type MetadataRecord = Record<string, unknown> | null;

export function mapSourceListingToProfileOffer(
  listing: SourceListing,
  userId: string,
  position: number,
): ProfileOffer {
  const metadata = listing.metadata ?? null;
  const priceCents = typeof listing.price === "number" ? Math.round(listing.price * 100) : null;

  return {
    id: listing.id,
    profile_id: userId,
    user_id: userId,
    offer_type: "service",
    title: listing.title,
    description: listing.description ?? null,
    price_cents: priceCents,
    currency: listing.currency || "USD",
    metadata,
    media_url: resolveListingImage(metadata),
    cta_label: resolveCtaLabel(metadata) ?? "Book now",
    cta_url: resolveListingDestination(metadata),
    inventory_status: resolveInventoryStatus(metadata, listing.status),
    duration_minutes: resolveDurationMinutes(metadata),
    position,
    is_featured: Boolean(metadata && metadata.is_featured),
    is_active: listing.status === "published",
    tags: resolveListingTags(metadata),
    analytics_event: null,
    created_at: listing.created_at,
    updated_at: listing.updated_at,
  };
}

function resolveListingDestination(metadata: MetadataRecord) {
  const raw = extractFirstMatchingString(metadata, DESTINATION_FIELDS);
  if (raw) {
    return raw;
  }

  if (!metadata) {
    return null;
  }

  const postValue = metadata.post;
  if (postValue && typeof postValue === "object" && !Array.isArray(postValue)) {
    const post = postValue as Record<string, unknown>;
    const media = post.media;
    if (Array.isArray(media)) {
      for (const entry of media) {
        if (!entry || typeof entry !== "object") continue;
        const entryUrl = (entry as Record<string, unknown>).url;
        if (typeof entryUrl === "string" && entryUrl.trim()) {
          return entryUrl.trim();
        }
      }
    }
  }

  return null;
}

function resolveCtaLabel(metadata: MetadataRecord) {
  return extractFirstMatchingString(metadata, CTA_TEXT_FIELDS);
}

function resolveInventoryStatus(metadata: MetadataRecord, status: SourceListing["status"]) {
  const metadataStatus = extractFirstMatchingString(metadata, INVENTORY_FIELDS);
  if (metadataStatus) {
    return metadataStatus;
  }

  if (status) {
    return status;
  }

  return null;
}

function resolveDurationMinutes(metadata: MetadataRecord) {
  if (!metadata) {
    return null;
  }

  for (const key of DURATION_FIELDS) {
    const value = metadata[key];
    const parsed = normalizeNumber(value);
    if (typeof parsed === "number") {
      return parsed;
    }
  }

  return null;
}

function resolveListingTags(metadata: MetadataRecord) {
  if (!metadata) {
    return null;
  }

  for (const key of TAG_FIELDS) {
    const value = metadata[key];
    if (Array.isArray(value)) {
      const normalized = value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry);
      if (normalized.length > 0) {
        return normalized;
      }
    }

    if (typeof value === "string" && value.trim()) {
      const normalized = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return null;
}

function resolveListingImage(metadata: MetadataRecord) {
  const raw = extractFirstMatchingString(metadata, IMAGE_FIELDS);
  if (raw) {
    return raw;
  }

  if (!metadata) {
    return null;
  }

  const media = metadata.media;
  if (Array.isArray(media)) {
    for (const entry of media) {
      if (!entry || typeof entry !== "object") continue;
      const url = (entry as Record<string, unknown>).url;
      if (typeof url === "string" && url.trim()) {
        return url.trim();
      }
    }
  }

  return null;
}

function extractFirstMatchingString(metadata: MetadataRecord, keys: string[]) {
  if (!metadata) return null;

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}
