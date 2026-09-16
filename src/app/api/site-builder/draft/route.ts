import { NextResponse } from "next/server";

import {
  authenticateSiteBuilderDraftRequest,
  isSiteDocument,
} from "@/lib/site-builder/draftPersistence";

export async function GET() {
  const auth = await authenticateSiteBuilderDraftRequest();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.db
    .from("site_builder_sites")
    .select("draft_document")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load site builder draft", error);
    return NextResponse.json(
      { error: "Unable to load site draft" },
      { status: 500 },
    );
  }

  const row = data as { draft_document?: unknown } | null;
  const site = row?.draft_document;

  if (site === undefined || site === null) {
    return NextResponse.json({ site: null });
  }

  if (!isSiteDocument(site)) {
    console.error("Stored site builder draft failed validation", {
      userId: auth.user.id,
    });
    return NextResponse.json(
      { error: "Stored site draft is invalid" },
      { status: 500 },
    );
  }

  return NextResponse.json({ site });
}

export async function PUT(request: Request) {
  const auth = await authenticateSiteBuilderDraftRequest();
  if ("response" in auth) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const site = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).site
    : undefined;

  if (!isSiteDocument(site)) {
    return NextResponse.json(
      { error: "Invalid site document" },
      { status: 400 },
    );
  }

  const { error } = await auth.db
    .from("site_builder_sites")
    .upsert(
      {
        user_id: auth.user.id,
        draft_document: site,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("Failed to save site builder draft", error);
    return NextResponse.json(
      { error: "Unable to save site draft" },
      { status: 500 },
    );
  }

  return NextResponse.json({ site });
}
