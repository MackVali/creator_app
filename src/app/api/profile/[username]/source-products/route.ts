import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import {
  type ListingRow,
} from "@/app/api/source/listings/shared"
import type { SourceListing } from "@/types/source"

const PUBLIC_PRODUCT_FIELDS =
  "id, type, title, description, price, currency, status, metadata, published_at, created_at, updated_at"

export async function GET(
  _: Request,
  context: { params?: { username?: string } },
) {
  const username = (context.params?.username ?? "").trim()
  if (!username) {
    return NextResponse.json(
      { listings: [] },
      { status: 400 },
    )
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    console.warn("[profile/source-products] server client unavailable")
    return NextResponse.json(
      { listings: [] },
      { status: 200 },
    )
  }

  const { data: profile, error: lookupError } = await supabase
    .from("profiles")
    .select("user_id")
    .ilike("username", username)
    .maybeSingle()

  const userId =
    profile && typeof profile.user_id === "string" && profile.user_id.trim()
      ? profile.user_id
      : null

  if (lookupError || !userId) {
    console.error(
      "[profile/source-products] failed to resolve user id",
      lookupError,
    )
    return NextResponse.json(
      { listings: [] },
      { status: 404 },
    )
  }

  const { data, error } = await supabase
    .from("source_listings")
    .select(PUBLIC_PRODUCT_FIELDS)
    .eq("user_id", userId)
    .eq("type", "product")
    .eq("status", "published")
    .not("price", "is", null)
    .order("updated_at", { ascending: false })
    .limit(12)

  if (error) {
    console.error("[profile/source-products] failed to load listings", error)
    return NextResponse.json(
      { listings: [] },
      { status: 500 },
    )
  }

  const listings: SourceListing[] = (data ?? []).map((row) => {
    const listing = row as Omit<ListingRow, "user_id" | "publish_results">
    return {
      id: listing.id,
      type: listing.type as SourceListing["type"],
      title: listing.title,
      description: listing.description,
      price: listing.price,
      currency: listing.currency,
      status: "published",
      metadata: listing.metadata ?? null,
      publish_results: null,
      published_at: listing.published_at,
      created_at: listing.created_at,
      updated_at: listing.updated_at,
    }
  })

  return NextResponse.json({ listings })
}
