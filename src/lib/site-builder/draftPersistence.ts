import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isRegisteredSectionType } from "@/lib/site-builder/sectionRegistry";
import type {
  SiteDataSource,
  SiteDocument,
  SitePage,
  SiteSection,
  SiteSectionLayoutConfig,
  SiteSectionStyleConfig,
  SiteSectionType,
} from "@/lib/site-builder/types";

type SiteBuilderDraftResult = {
  data: unknown;
  error: { message?: string; code?: string } | null;
};

interface SiteBuilderDraftTableQuery extends PromiseLike<SiteBuilderDraftResult> {
  select(columns?: string): SiteBuilderDraftTableQuery;
  eq(column: string, value: unknown): SiteBuilderDraftTableQuery;
  maybeSingle(): Promise<SiteBuilderDraftResult>;
  upsert(
    values: unknown,
    options?: { onConflict?: string },
  ): SiteBuilderDraftTableQuery;
}

type SiteBuilderDraftQuery = {
  from(table: string): SiteBuilderDraftTableQuery;
};

const persistedSectionTypes = new Set<SiteSectionType>([
  "projects",
  "media",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isPersistableSectionType(value: unknown): value is SiteSectionType {
  if (!isString(value)) return false;
  return (
    isRegisteredSectionType(value as SiteSectionType) ||
    persistedSectionTypes.has(value as SiteSectionType)
  );
}

function isSiteDataSource(value: unknown): value is SiteDataSource {
  if (!isRecord(value)) return false;

  if (value.kind === "manual") {
    return Object.keys(value).every((key) => key === "kind");
  }

  if (value.kind !== "source") return false;
  if (
    value.listingType !== "product" &&
    value.listingType !== "service" &&
    value.listingType !== "post"
  ) {
    return false;
  }
  if (value.mode !== "latest" && value.mode !== "selected") return false;
  if (
    "listingIds" in value &&
    value.listingIds !== undefined &&
    !isStringArray(value.listingIds)
  ) {
    return false;
  }

  return true;
}

function isSiteSectionLayoutConfig(
  value: unknown,
): value is SiteSectionLayoutConfig {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;

  if ("variant" in value && value.variant !== undefined && !isString(value.variant)) {
    return false;
  }
  if (
    "alignment" in value &&
    value.alignment !== undefined &&
    value.alignment !== "left" &&
    value.alignment !== "center"
  ) {
    return false;
  }
  if (
    "width" in value &&
    value.width !== undefined &&
    value.width !== "narrow" &&
    value.width !== "normal" &&
    value.width !== "wide"
  ) {
    return false;
  }
  if (
    "spacing" in value &&
    value.spacing !== undefined &&
    value.spacing !== "compact" &&
    value.spacing !== "normal" &&
    value.spacing !== "spacious"
  ) {
    return false;
  }
  if (
    "columns" in value &&
    value.columns !== undefined &&
    value.columns !== 2 &&
    value.columns !== 3 &&
    value.columns !== 4
  ) {
    return false;
  }

  return true;
}

function isSiteSectionStyleConfig(
  value: unknown,
): value is SiteSectionStyleConfig {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;

  if (
    "background" in value &&
    value.background !== undefined &&
    value.background !== "default" &&
    value.background !== "plain" &&
    value.background !== "dark" &&
    value.background !== "muted" &&
    value.background !== "contrast"
  ) {
    return false;
  }

  for (const key of ["muted", "showPrice", "showDescription"]) {
    if (key in value && value[key] !== undefined && typeof value[key] !== "boolean") {
      return false;
    }
  }

  return true;
}

function isSiteSection(value: unknown): value is SiteSection {
  if (!isRecord(value)) return false;

  return (
    isString(value.id) &&
    isString(value.label) &&
    isPersistableSectionType(value.type) &&
    typeof value.visible === "boolean" &&
    isSiteDataSource(value.source) &&
    isRecord(value.content) &&
    isSiteSectionLayoutConfig(value.layout) &&
    isSiteSectionStyleConfig(value.style)
  );
}

function isSitePage(value: unknown): value is SitePage {
  if (!isRecord(value)) return false;

  return (
    isString(value.id) &&
    isString(value.title) &&
    isString(value.slug) &&
    (value.previewPath === undefined || isString(value.previewPath)) &&
    Array.isArray(value.sections) &&
    value.sections.every(isSiteSection)
  );
}

export function isSiteDocument(value: unknown): value is SiteDocument {
  if (!isRecord(value)) return false;
  if (
    !isString(value.id) ||
    !isString(value.name) ||
    !isString(value.handle) ||
    !isString(value.homePageId) ||
    !Array.isArray(value.pages) ||
    !value.pages.every(isSitePage)
  ) {
    return false;
  }

  return value.pages.some((page) => page.id === value.homePageId);
}

export async function authenticateSiteBuilderDraftRequest() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      response: NextResponse.json(
        { error: "Supabase client not initialized" },
        { status: 500 },
      ),
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      ),
    };
  }

  return {
    supabase,
    db: supabase as unknown as SiteBuilderDraftQuery,
    user,
  };
}
