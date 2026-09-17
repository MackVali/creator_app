import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  LISTING_FIELDS,
  serializeListing,
  type ListingRow,
} from "@/lib/source/listings/shared";
import type { SourceListing } from "@/types/source";

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
    .select(LISTING_FIELDS)
    .eq("user_id", userId)
    .eq("status", "published")
    .in("type", ["product", "service"])
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to load public Site Builder Source listings", {
      userId,
      error,
    });
    return [];
  }

  return (data ?? []).map((row) =>
    serializeListing(row as ListingRow),
  );
}
