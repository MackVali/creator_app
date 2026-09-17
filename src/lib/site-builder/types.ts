export type SiteSectionType =
  | "hero"
  | "content"
  | "cards"
  | "projects"
  | "products"
  | "services"
  | "gallery"
  | "media"
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
    };

export type SiteSectionLayoutConfig = {
  variant?: string;
  alignment?: "left" | "center";
  width?: "narrow" | "normal" | "wide";
  spacing?: "compact" | "normal" | "spacious";
  columns?: 2 | 3 | 4;
};

export type SiteSectionStyleConfig = {
  background?: "default" | "plain" | "dark" | "muted" | "contrast";
  muted?: boolean;
  showPrice?: boolean;
  showDescription?: boolean;
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
    };

export type SitePage = {
  id: string;
  title: string;
  slug: string;
  previewPath?: string;
  sections: SiteSection[];
};

export type SiteNavigationItem = {
  id: string;
  label: string;
  href: string;
  visible: boolean;
};

export type SiteHeaderConfig = {
  brandLabel: string;
  tagline: string;
  navigation: SiteNavigationItem[];
};

export type SiteFooterConfig = {
  brandLabel: string;
  tagline: string;
};

export type SiteThemePalette =
  | "graphite"
  | "ink"
  | "slate"
  | "warm";

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

export type SiteThemeConfig = {
  palette: SiteThemePalette;
  accentColor: string;
  typography: SiteThemeTypography;
  width: SiteThemeWidth;
  spacing: SiteThemeSpacing;
  radius: SiteThemeRadius;
};

export type SiteDocument = {
  id: string;
  name: string;
  handle: string;
  homePageId: string;
  header?: SiteHeaderConfig;
  footer?: SiteFooterConfig;
  theme?: SiteThemeConfig;
  pages: SitePage[];
};
