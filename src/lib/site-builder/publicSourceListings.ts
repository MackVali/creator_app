import "server-only";

import {
  toPublicSourceListing,
  type PublicSourceListingRow,
} from "@/lib/site-builder/publicListingProjection";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SourceListing } from "@/types/source";

const PUBLIC_SOURCE_LISTING_FIELDS =
  "id, type, title, description, price, currency, status, metadata, published_at, created_at, updated_at";

export async function getPublishedSiteSourceListings(
  userId: string,
): Promise<SourceListing[]> {
  const admin = createAdminClient();

  if (!admin) {
    console.error(
      "Unable to load public site Source listings: admin client unavailable",
    );
    return [];
  }

  const { data, error } = await admin
    .from("source_listings")
    .select(PUBLIC_SOURCE_LISTING_FIELDS)
    .eq("user_id", userId)
    .eq("status", "published")
    .in("type", ["product", "service"])
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(
      "Failed to load public Site Builder Source listings",
      {
        userId,
        error,
      },
    );
    return [];
  }

  return (data ?? []).map((row) =>
    toPublicSourceListing(
      row as PublicSourceListingRow,
    ),
  );
}
