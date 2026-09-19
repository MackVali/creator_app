import type { SourceListing } from "@/types/source";

export type PublicSourceListingRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  status: string;
  metadata: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

const PUBLIC_METADATA_STRING_KEYS = [
  "cover",
  "coverImage",
  "image",
  "imageUrl",
  "image_url",
  "heroImage",
  "hero",
  "thumbnail",
  "thumbnailUrl",
] as const;

function sanitizePublicMetadata(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadata) return null;

  const safe: Record<string, unknown> = {};

  for (const key of PUBLIC_METADATA_STRING_KEYS) {
    const value = metadata[key];

    if (typeof value === "string" && value.trim()) {
      safe[key] = value.trim();
    }
  }

  const duration = metadata.duration_minutes;

  if (
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
  ) {
    safe.duration_minutes = duration;
  }

  if (Array.isArray(metadata.media)) {
    const media = metadata.media.flatMap((entry) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry)
      ) {
        return [];
      }

      const candidate = entry as Record<string, unknown>;
      const url =
        typeof candidate.url === "string"
          ? candidate.url.trim()
          : "";

      if (!url) return [];

      const sanitized: Record<string, string> = { url };

      if (
        typeof candidate.type === "string" &&
        candidate.type.trim()
      ) {
        sanitized.type = candidate.type.trim();
      }

      return [sanitized];
    });

    if (media.length > 0) {
      safe.media = media;
    }
  }

  return Object.keys(safe).length > 0 ? safe : null;
}

export function toPublicSourceListing(
  row: PublicSourceListingRow,
): SourceListing {
  return {
    id: row.id,
    type: row.type as SourceListing["type"],
    title: row.title,
    description: row.description,
    price: row.price,
    currency: row.currency,
    status: "published",
    metadata: sanitizePublicMetadata(row.metadata),
    publish_results: null,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
