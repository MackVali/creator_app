export type SiteSectionType =
  | "banner"
  | "hero"
  | "content"
  | "split"
  | "cards"
  | "stats"
  | "faq"
  | "testimonials"
  | "projects"
  | "store-navigation"
  | "products"
  | "services"
  | "gallery"
  | "media"
  | "embed"
  | "cta"
  | "contact";

export type SiteDataSource =
  | {
      kind: "manual";
    }
  | {
      kind: "source";
      listingType: "product" | "service" | "post";
      mode: "latest" | "selected";
      listingIds?: string[];
    }
  | {
      kind: "catalog";
      mode: "all" | "collection" | "selected";
      collectionId?: string;
      itemIds?: string[];
    };

export type SiteSectionPadding =
  | "none"
  | "small"
  | "medium"
  | "large"
  | "xlarge";

export type SiteSectionDivider =
  | "none"
  | "top"
  | "bottom"
  | "both";

export type SiteSectionDividerStrength =
  | "hairline"
  | "strong";

export type SiteSectionLayoutConfig = {
  variant?: string;

  // Banner sections are anchored outside the normal page flow.
  placement?: "top" | "bottom" | "both";

  alignment?: "left" | "center";
  width?: "narrow" | "normal" | "wide" | "full";

  // Legacy coarse spacing remains supported.
  spacing?: "compact" | "normal" | "spacious";
  size?: "default" | "compact" | "standard" | "large";

  // Optional per-section overrides.
  paddingTop?: SiteSectionPadding;
  paddingBottom?: SiteSectionPadding;

  columns?: 2 | 3 | 4;

  // Precise visual editor overrides. When present, these take precedence over
  // the legacy coarse layout tokens above.
  contentWidth?: number;

  heightMode?: "auto" | "minimum" | "screen";
  minHeight?: number;

  paddingTopPx?: number;
  paddingRightPx?: number;
  paddingBottomPx?: number;
  paddingLeftPx?: number;

  gap?: number;

  // Shared section composition / typography controls.
  mediaShare?: number;

  headingSize?: number;
  headingWidth?: number;

  bodySize?: number;
  bodyWidth?: number;

  textGap?: number;
};

export type SiteSectionStyleConfig = {
  background?: "default" | "plain" | "dark" | "muted" | "contrast";

  // Optional per-section color overrides.
  // When absent, the section inherits the active Site theme.
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;

  divider?: SiteSectionDivider;
  dividerStrength?: SiteSectionDividerStrength;

  muted?: boolean;

  // Shared appearance language for repeated visual items such as
  // cards, gallery images, products, and services.
  itemFrame?: "none" | "outline" | "surface";
  itemRadius?: number;
  itemMediaFit?: "cover" | "contain";
  itemMediaRatio?: "auto" | "16:9" | "3:2" | "4:3" | "1:1" | "4:5";
  itemPadding?: number;

  showPrice?: boolean;
  showDescription?: boolean;

  // Storefront product-card behavior.
  showSizes?: boolean;
  showColors?: boolean;
  swapImageOnHover?: boolean;
};

export type SiteSection = {
  id: string;
  label: string;
  type: SiteSectionType;
  visible: boolean;
  source: SiteDataSource;
  content: Record<string, unknown>;
  layout?: SiteSectionLayoutConfig;
  style?: SiteSectionStyleConfig;
};

export type SiteContentNodeId = "text" | "button" | "media";

export type SiteEditorSelection =
  | {
      kind: "section";
      pageId: string;
      sectionId: string;
    }
  | {
      kind: "content";
      pageId: string;
      sectionId: string;
      node: SiteContentNodeId;
    }
  | {
      kind: "block";
      pageId: string;
      sectionId: string;
      blockId: string;
    };

export type SitePagePresentation =
  | "default"
  | "storefront";

export type SiteStorefrontNavigationItem = {
  id: string;
  label: string;
  href: string;
  visible: boolean;
};

export type SitePage = {
  id: string;
  title: string;
  slug: string;
  previewPath?: string;

  // Optional page-specific presentation.
  // Normal portfolio pages remain unchanged.
  presentation?: SitePagePresentation;

  // Optional sub-brand identity for storefront pages.
  brandLabel?: string;

  // Optional storefront-only category navigation.
  storefrontNavigation?: SiteStorefrontNavigationItem[];

  // Controls how storefront navigation is presented.
  storefrontNavigationLayout?:
    | "sidebar"
    | "top"
    | "both"
    | "none";

  // Optional storefront utility chrome.
  storefrontShowSearch?: boolean;
  storefrontShowBag?: boolean;

  sections: SiteSection[];
};

export type SiteNavigationItemKind =
  | "page"
  | "link"
  | "dropdown";

export type SiteNavigationItem = {
  id: string;
  label: string;

  // Optional so existing flat navigation documents remain valid.
  kind?: SiteNavigationItemKind;

  href: string;
  pageId?: string;
  visible: boolean;

  // Navigation is its own hierarchy. Pages remain independent.
  children?: SiteNavigationItem[];
};

export type SiteHeaderConfig = {
  brandLabel: string;
  tagline: string;
  navigation: SiteNavigationItem[];

  alignment?: "split" | "left" | "center" | "right";
  behavior?: "static" | "sticky" | "fixed";
  edgeSpacing?: "compact" | "standard" | "spacious";
  contentFlow?: "below" | "overlay";
};

export type SiteFooterConfig = {
  brandLabel: string;
  tagline: string;
};

export type SiteThemePalette =
  | "graphite"
  | "ink"
  | "slate"
  | "warm"
  | "paper";

export type SiteThemeTypography =
  | "sans"
  | "serif"
  | "mono";

export type SiteThemeWidth =
  | "compact"
  | "standard"
  | "wide";

export type SiteThemeSpacing =
  | "compact"
  | "normal"
  | "spacious";

export type SiteThemeRadius =
  | "sharp"
  | "soft"
  | "rounded";

export type SiteThemeColorOverrides = {
  background?: string;
  surface?: string;
  text?: string;
  mutedText?: string;
  border?: string;
};

export type SiteThemeConfig = {
  palette: SiteThemePalette;
  accentColor: string;

  colors?: SiteThemeColorOverrides;

  typography: SiteThemeTypography;
  width: SiteThemeWidth;

  // Kept for compatibility with existing saved sites.
  spacing: SiteThemeSpacing;

  sectionSpacing?: number;
  pagePadding?: number;

  radius: SiteThemeRadius;
};

export type SiteCatalogItemStatus =
  | "concept"
  | "coming-soon"
  | "available";

export type SiteCatalogCollection = {
  id: string;
  title: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  sortOrder: number;
};

export type SiteCatalogItemSize = {
  label: string;
  available: boolean;
};

export type SiteCatalogItemColor = {
  name: string;
  hex?: string;
};

export type SiteCatalogItem = {
  id: string;
  title: string;

  imageUrl: string;
  imagePath: string;
  imageAlt: string;

  // Optional alternate storefront image used for hover / rollover.
  hoverImageUrl?: string;
  hoverImagePath?: string;
  hoverImageAlt?: string;

  collectionId?: string;

  subtitle?: string;
  priceLabel?: string;
  status: SiteCatalogItemStatus;
  href?: string;

  sizes?: SiteCatalogItemSize[];
  colors?: SiteCatalogItemColor[];

  visible: boolean;
  sortOrder: number;
};

export type SiteCatalog = {
  collections: SiteCatalogCollection[];
  items: SiteCatalogItem[];
};

export type SiteDocument = {
  id: string;
  name: string;
  handle: string;
  homePageId: string;
  header?: SiteHeaderConfig;
  footer?: SiteFooterConfig;
  theme?: SiteThemeConfig;

  // Site-first visual catalog. Items may exist before they become
  // real Source products or commerce listings.
  catalog?: SiteCatalog;

  pages: SitePage[];
};
