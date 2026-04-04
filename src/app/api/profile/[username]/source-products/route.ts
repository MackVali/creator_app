import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import {
  LISTING_FIELDS,
  serializeListing,
  type ListingRow,
} from "@/app/api/source/listings/shared"

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

  const supabase = createAdminClient()
  if (!supabase) {
    console.warn("[profile/source-products] admin client unavailable")
    return NextResponse.json(
      { listings: [] },
      { status: 503 },
    )
  }

  const serverSupabase = await createSupabaseServerClient()
  const { data: viewerAuth } = serverSupabase
    ? await serverSupabase.auth.getUser()
    : { data: { user: null } }

  const { data: userId, error: lookupError } = await supabase.rpc(
    "get_profile_user_id",
    { p_username: username },
  )

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

  const viewerUserId = viewerAuth?.user?.id ?? null
  const statusFilter =
    viewerUserId && viewerUserId === userId
      ? ["published", "draft", "queued"]
      : ["published"]

  const { data, error } = await supabase
    .from("source_listings")
    .select(LISTING_FIELDS)
    .eq("user_id", userId)
    .eq("type", "product")
    .in("status", statusFilter)
    .order("updated_at", { ascending: false })
    .limit(12)

  if (error) {
    console.error("[profile/source-products] failed to load listings", error)
    return NextResponse.json(
      { listings: [] },
      { status: 500 },
    )
  }

  const listings = (data ?? [])
    .map((row) => serializeListing(row as ListingRow))

  return NextResponse.json({ listings })
}
