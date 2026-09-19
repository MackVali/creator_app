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
  delete(): SiteBuilderDraftTableQuery;
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

function isSiteNavigationItem(value: unknown) {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isString(value.href) &&
    (
      value.pageId === undefined ||
      isString(value.pageId)
    ) &&
    typeof value.visible === "boolean"
  );
}

function isSiteHeaderConfig(value: unknown) {
  if (value === undefined) return true;

  return (
    isRecord(value) &&
    isString(value.brandLabel) &&
    isString(value.tagline) &&
    Array.isArray(value.navigation) &&
    value.navigation.every(isSiteNavigationItem)
  );
}

function isSiteFooterConfig(value: unknown) {
  if (value === undefined) return true;

  return (
    isRecord(value) &&
    isString(value.brandLabel) &&
    isString(value.tagline)
  );
}

function isHexColor(value: unknown) {
  return (
    isString(value) &&
    /^#[0-9a-fA-F]{6}$/.test(value)
  );
}

function isSiteThemeColorOverrides(
  value: unknown,
) {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;

  const allowed = new Set([
    "background",
    "surface",
    "text",
    "mutedText",
    "border",
  ]);

  return Object.entries(value).every(
    ([key, color]) =>
      allowed.has(key) &&
      isHexColor(color),
  );
}

function isSiteThemeConfig(value: unknown) {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;

  return (
    (
      value.palette === "graphite" ||
      value.palette === "ink" ||
      value.palette === "slate" ||
      value.palette === "warm" ||
      value.palette === "paper"
    ) &&
    isHexColor(value.accentColor) &&
    isSiteThemeColorOverrides(value.colors) &&
    (
      value.sectionSpacing === undefined ||
      (
        typeof value.sectionSpacing === "number" &&
        value.sectionSpacing >= 8 &&
        value.sectionSpacing <= 160
      )
    ) &&
    (
      value.pagePadding === undefined ||
      (
        typeof value.pagePadding === "number" &&
        value.pagePadding >= 12 &&
        value.pagePadding <= 120
      )
    ) &&
    (
      value.typography === "sans" ||
      value.typography === "serif" ||
      value.typography === "mono"
    ) &&
    (
      value.width === "compact" ||
      value.width === "standard" ||
      value.width === "wide"
    ) &&
    (
      value.spacing === "compact" ||
      value.spacing === "normal" ||
      value.spacing === "spacious"
    ) &&
    (
      value.radius === "sharp" ||
      value.radius === "soft" ||
      value.radius === "rounded"
    )
  );
}

function isPersistableSectionType(value: unknown): value is SiteSectionType {
  if (!isString(value)) return false;
  return (
    isRegisteredSectionType(value as SiteSectionType) ||
    persistedSectionTypes.has(value as SiteSectionType)
  );
}

function isSiteDataSource(
  value: unknown,
): value is SiteDataSource {
  if (!isRecord(value)) {
    return false;
  }

  if (value.kind === "manual") {
    return Object.keys(
      value,
    ).every(
      (key) => key === "kind",
    );
  }

  if (value.kind === "catalog") {
    if (
      value.mode !== "all" &&
      value.mode !== "collection" &&
      value.mode !== "selected"
    ) {
      return false;
    }

    if (
      value.collectionId !==
        undefined &&
      !isString(
        value.collectionId,
      )
    ) {
      return false;
    }

    if (
      value.itemIds !==
        undefined &&
      !isStringArray(
        value.itemIds,
      )
    ) {
      return false;
    }

    return true;
  }

  if (value.kind !== "source") {
    return false;
  }

  if (
    value.listingType !==
      "product" &&
    value.listingType !==
      "service" &&
    value.listingType !==
      "post"
  ) {
    return false;
  }

  if (
    value.mode !== "latest" &&
    value.mode !== "selected"
  ) {
    return false;
  }

  if (
    value.listingIds !==
      undefined &&
    !isStringArray(
      value.listingIds,
    )
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
    value.width !== "wide" &&
    value.width !== "full"
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

  for (const key of [
    "paddingTop",
    "paddingBottom",
  ]) {
    if (
      key in value &&
      value[key] !== undefined &&
      value[key] !== "none" &&
      value[key] !== "small" &&
      value[key] !== "medium" &&
      value[key] !== "large" &&
      value[key] !== "xlarge"
    ) {
      return false;
    }
  }

  if (
    "size" in value &&
    value.size !== undefined &&
    value.size !== "default" &&
    value.size !== "compact" &&
    value.size !== "standard" &&
    value.size !== "large"
  ) {
    return false;
  }

  const numericRanges: Record<
    string,
    [number, number]
  > = {
    contentWidth: [320, 2000],
    minHeight: [0, 1600],

    paddingTopPx: [0, 240],
    paddingRightPx: [0, 240],
    paddingBottomPx: [0, 240],
    paddingLeftPx: [0, 240],

    gap: [0, 160],
    mediaShare: [20, 80],

    headingSize: [18, 160],
    headingWidth: [240, 1400],

    bodySize: [9, 32],
    bodyWidth: [240, 1200],

    textGap: [0, 96],
  };

  for (const [
    key,
    [min, max],
  ] of Object.entries(
    numericRanges,
  )) {
    const candidate =
      value[key];

    if (
      candidate !== undefined &&
      (
        typeof candidate !==
          "number" ||
        !Number.isFinite(
          candidate,
        ) ||
        candidate < min ||
        candidate > max
      )
    ) {
      return false;
    }
  }

  return true;
}

function isSiteSectionStyleConfig(
  value: unknown,
): value is SiteSectionStyleConfig {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  if (
    "background" in value &&
    value.background !==
      undefined &&
    value.background !==
      "default" &&
    value.background !==
      "plain" &&
    value.background !==
      "dark" &&
    value.background !==
      "muted" &&
    value.background !==
      "contrast"
  ) {
    return false;
  }

  if (
    "divider" in value &&
    value.divider !==
      undefined &&
    value.divider !==
      "none" &&
    value.divider !==
      "top" &&
    value.divider !==
      "bottom" &&
    value.divider !==
      "both"
  ) {
    return false;
  }

  if (
    "dividerStrength" in
      value &&
    value.dividerStrength !==
      undefined &&
    value.dividerStrength !==
      "hairline" &&
    value.dividerStrength !==
      "strong"
  ) {
    return false;
  }

  for (
    const key of [
      "muted",
      "showPrice",
      "showDescription",
    ]
  ) {
    if (
      key in value &&
      value[key] !==
        undefined &&
      typeof value[key] !==
        "boolean"
    ) {
      return false;
    }
  }

  if (
    "itemFrame" in value &&
    value.itemFrame !==
      undefined &&
    value.itemFrame !==
      "none" &&
    value.itemFrame !==
      "outline" &&
    value.itemFrame !==
      "surface"
  ) {
    return false;
  }

  if (
    "itemMediaFit" in value &&
    value.itemMediaFit !==
      undefined &&
    value.itemMediaFit !==
      "cover" &&
    value.itemMediaFit !==
      "contain"
  ) {
    return false;
  }

  if (
    "itemMediaRatio" in
      value &&
    value.itemMediaRatio !==
      undefined &&
    value.itemMediaRatio !==
      "auto" &&
    value.itemMediaRatio !==
      "16:9" &&
    value.itemMediaRatio !==
      "3:2" &&
    value.itemMediaRatio !==
      "4:3" &&
    value.itemMediaRatio !==
      "1:1" &&
    value.itemMediaRatio !==
      "4:5"
  ) {
    return false;
  }

  if (
    value.itemRadius !==
      undefined &&
    (
      typeof value.itemRadius !==
        "number" ||
      !Number.isFinite(
        value.itemRadius,
      ) ||
      value.itemRadius < 0 ||
      value.itemRadius > 48
    )
  ) {
    return false;
  }

  if (
    value.itemPadding !==
      undefined &&
    (
      typeof value.itemPadding !==
        "number" ||
      !Number.isFinite(
        value.itemPadding,
      ) ||
      value.itemPadding < 0 ||
      value.itemPadding > 96
    )
  ) {
    return false;
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

function isSiteCatalog(
  value: unknown,
) {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  if (
    !Array.isArray(
      value.collections,
    ) ||
    !Array.isArray(
      value.items,
    )
  ) {
    return false;
  }

  const collectionsValid =
    value.collections.every(
      (collection) => {
        if (
          !isRecord(
            collection,
          )
        ) {
          return false;
        }

        return (
          isString(
            collection.id,
          ) &&
          isString(
            collection.title,
          ) &&
          isString(
            collection.slug,
          ) &&
          typeof collection.sortOrder ===
            "number" &&
          Number.isFinite(
            collection.sortOrder,
          ) &&
          (
            collection.description ===
              undefined ||
            isString(
              collection.description,
            )
          ) &&
          (
            collection.coverImageUrl ===
              undefined ||
            isString(
              collection.coverImageUrl,
            )
          )
        );
      },
    );

  if (!collectionsValid) {
    return false;
  }

  return value.items.every(
    (item) => {
      if (!isRecord(item)) {
        return false;
      }

      return (
        isString(item.id) &&
        isString(item.title) &&
        isString(
          item.imageUrl,
        ) &&
        isString(
          item.imagePath,
        ) &&
        isString(
          item.imageAlt,
        ) &&
        typeof item.visible ===
          "boolean" &&
        typeof item.sortOrder ===
          "number" &&
        Number.isFinite(
          item.sortOrder,
        ) &&
        (
          item.collectionId ===
            undefined ||
          isString(
            item.collectionId,
          )
        ) &&
        (
          item.subtitle ===
            undefined ||
          isString(
            item.subtitle,
          )
        ) &&
        (
          item.priceLabel ===
            undefined ||
          isString(
            item.priceLabel,
          )
        ) &&
        (
          item.href ===
            undefined ||
          isString(
            item.href,
          )
        ) &&
        (
          item.status ===
            "concept" ||
          item.status ===
            "coming-soon" ||
          item.status ===
            "available"
        )
      );
    },
  );
}


export function isSiteDocument(value: unknown): value is SiteDocument {
  if (!isRecord(value)) return false;
  if (
    !isString(value.id) ||
    !isString(value.name) ||
    !isString(value.handle) ||
    !isString(value.homePageId) ||
    !isSiteHeaderConfig(value.header) ||
    !isSiteFooterConfig(value.footer) ||
    !isSiteThemeConfig(value.theme) ||
    !isSiteCatalog(value.catalog) ||
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
