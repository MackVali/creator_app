import { NextResponse } from "next/server";

import {
  authenticateSiteBuilderDraftRequest,
  isSiteDocument,
} from "@/lib/site-builder/draftPersistence";

function normalizeHandle(value: string) {
  return value.trim().toLowerCase();
}

function isValidHandle(value: string) {
  return (
    value.length >= 1 &&
    value.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)
  );
}

export async function GET() {
  const auth = await authenticateSiteBuilderDraftRequest();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.db
    .from("site_builder_public_sites")
    .select("handle,document,published_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load site publication state", error);

    return NextResponse.json(
      { error: "Unable to load publication state" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({
      published: false,
      site: null,
      handle: null,
      publishedAt: null,
    });
  }

  const row = data as {
    handle?: unknown;
    document?: unknown;
    published_at?: unknown;
  };

  return NextResponse.json({
    published: isSiteDocument(row.document),
    site: isSiteDocument(row.document) ? row.document : null,
    handle: typeof row.handle === "string" ? row.handle : null,
    publishedAt:
      typeof row.published_at === "string"
        ? row.published_at
        : null,
  });
}

export async function POST(request: Request) {
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

  const candidate =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).site
      : undefined;

  if (!isSiteDocument(candidate)) {
    return NextResponse.json(
      { error: "Invalid site document" },
      { status: 400 },
    );
  }

  const handle = normalizeHandle(candidate.handle);

  if (!isValidHandle(handle)) {
    return NextResponse.json(
      { error: "Invalid site handle" },
      { status: 400 },
    );
  }

  const site = {
    ...candidate,
    handle,
  };

  const publishedAt = new Date().toISOString();

  const { error } = await auth.db
    .from("site_builder_public_sites")
    .upsert(
      {
        user_id: auth.user.id,
        handle,
        document: site,
        published_at: publishedAt,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("Failed to publish site", error);

    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That site handle is already in use." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Unable to publish site" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    published: true,
    site,
    handle,
    publishedAt,
  });
}

export async function DELETE() {
  const auth = await authenticateSiteBuilderDraftRequest();
  if ("response" in auth) return auth.response;

  const { error } = await auth.db
    .from("site_builder_public_sites")
    .delete()
    .eq("user_id", auth.user.id);

  if (error) {
    console.error("Failed to unpublish site", error);

    return NextResponse.json(
      { error: "Unable to unpublish site" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    published: false,
  });
}
