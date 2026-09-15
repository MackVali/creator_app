export type SiteSectionType =
  | "hero"
  | "content"
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
    }
  | {
      kind: "creator";
      entity: "project";
      mode: "latest" | "selected";
      entityIds?: string[];
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

export type SitePage = {
  id: string;
  title: string;
  slug: string;
  previewPath?: string;
  sections: SiteSection[];
};

export type SiteDocument = {
  id: string;
  name: string;
  handle: string;
  pages: SitePage[];
};
