import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSiteDocument } from "@/lib/site-builder/draftPersistence";
import type { SiteDocument } from "@/lib/site-builder/types";

type PublicSiteResult = {
  data: unknown;
  error: {
    code?: string;
    message?: string;
  } | null;
};

interface PublicSiteTableQuery extends PromiseLike<PublicSiteResult> {
  select(columns?: string): PublicSiteTableQuery;
  eq(column: string, value: unknown): PublicSiteTableQuery;
  maybeSingle(): Promise<PublicSiteResult>;
}

type PublicSiteDatabase = {
  from(table: string): PublicSiteTableQuery;
};

export type PublishedSiteRecord = {
  site: SiteDocument;
  userId: string;
  handle: string;
  publishedAt: string | null;
};

export async function getPublishedSiteRecordByHandle(
  requestedHandle: string,
): Promise<PublishedSiteRecord | null> {
  const handle = requestedHandle.trim().toLowerCase();

  if (!handle) return null;

  const admin = createAdminClient();

  if (!admin) {
    console.error("Unable to load public site: admin client unavailable");
    return null;
  }

  const db = admin as unknown as PublicSiteDatabase;

  const { data, error } = await db
    .from("site_builder_public_sites")
    .select("user_id,handle,document,published_at")
    .eq("handle", handle)
    .maybeSingle();

  if (error) {
    console.error("Failed to load published site", {
      handle,
      code: error.code,
      message: error.message,
    });
    return null;
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  const row = data as Record<string, unknown>;
  const document = row.document;

  if (
    !isSiteDocument(document) ||
    typeof row.user_id !== "string" ||
    typeof row.handle !== "string"
  ) {
    return null;
  }

  return {
    site: document,
    userId: row.user_id,
    handle: row.handle,
    publishedAt:
      typeof row.published_at === "string"
        ? row.published_at
        : null,
  };
}
