import type {
  SiteDataSource,
  SiteSection,
  SiteSectionLayoutConfig,
  SiteSectionStyleConfig,
  SiteSectionType,
} from "@/lib/site-builder/types";

export type SiteSectionCategory = "Essentials" | "Commerce" | "Media";

export type SiteSectionVariant = {
  id: string;
  label: string;
  description: string;
};

export type SiteSectionDefinition = {
  type: SiteSectionType;
  label: string;
  description: string;
  category: SiteSectionCategory;
  defaultContent: Record<string, unknown>;
  defaultSource: SiteDataSource;
  defaultLayout: SiteSectionLayoutConfig;
  defaultStyle?: SiteSectionStyleConfig;
  variants: SiteSectionVariant[];
  usesSource: boolean;
  supportsColumns?: boolean;
  supportsWidth?: boolean;
  supportsSpacing?: boolean;
  supportsBackground?: boolean;
  supportsListingDisplay?: boolean;
};

const sectionDefinitions = [
  {
    type: "hero",
    label: "Hero",
    description: "Introduce the page with a headline, action, and optional media.",
    category: "Essentials",
    defaultContent: {
      eyebrow: "Welcome",
      headline: "Your headline",
      intro: "Introduce what you do and why it matters.",
      primaryCtaLabel: "Learn more",
      primaryCtaHref: "#contact",
      mediaUrl: "",
      mediaPath: "",
      mediaAlt: "",
      mediaFit: "contain",
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "split",
      alignment: "left",
      width: "normal",
      spacing: "normal",
    },
    defaultStyle: { background: "default" },
    variants: [
      { id: "split", label: "Split", description: "Copy beside a media stage." },
      { id: "centered", label: "Centered", description: "Balanced copy with media below." },
      { id: "editorial", label: "Editorial", description: "Large type and restrained media." },
      { id: "minimal", label: "Minimal", description: "Compact, text-first introduction." },
    ],
    usesSource: false,
    supportsBackground: true,
  },
  {
    type: "content",
    label: "Content",
    description: "Publish a focused block of editable prose.",
    category: "Essentials",
    defaultContent: {
      heading: "New content section",
      body: "Add a short message for this page.",
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "standard",
      alignment: "left",
      width: "normal",
      spacing: "normal",
    },
    defaultStyle: { background: "default" },
    variants: [
      { id: "standard", label: "Standard", description: "Comfortable prose width." },
      { id: "narrow", label: "Narrow", description: "Centered reading-width copy." },
      { id: "split", label: "Split", description: "Heading and body in two columns." },
    ],
    usesSource: false,
    supportsWidth: true,
    supportsSpacing: true,
    supportsBackground: true,
  },
  {
    type: "cta",
    label: "CTA",
    description: "Invite visitors into the next step.",
    category: "Essentials",
    defaultContent: {
      heading: "Start something useful",
      body: "Invite visitors into the next step.",
      buttonLabel: "Get started",
      buttonHref: "#contact",
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "banner",
      alignment: "left",
      spacing: "normal",
    },
    defaultStyle: { background: "default" },
    variants: [
      { id: "banner", label: "Banner", description: "Compact horizontal conversion block." },
      { id: "centered", label: "Centered", description: "Prominent centered action." },
      { id: "minimal", label: "Minimal", description: "Low-chrome text and action." },
    ],
    usesSource: false,
    supportsSpacing: true,
    supportsBackground: true,
  },
  {
    type: "contact",
    label: "Contact",
    description: "Give people a simple way to reach out.",
    category: "Essentials",
    defaultContent: {
      heading: "Let's build something useful.",
      body: "Open to creative opportunities, collaborations, and interesting projects.",
      buttonLabel: "Get in touch",
      buttonHref: "#contact",
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "standard",
      alignment: "left",
      spacing: "normal",
    },
    defaultStyle: { background: "default" },
    variants: [
      { id: "standard", label: "Standard", description: "Inline contact block." },
      { id: "centered", label: "Centered", description: "Centered contact invitation." },
    ],
    usesSource: false,
    supportsBackground: true,
  },
  {
    type: "products",
    label: "Products",
    description: "Show selected public Source products.",
    category: "Commerce",
    defaultContent: {
      heading: "Products",
      intro: "",
    },
    defaultSource: {
      kind: "source",
      listingType: "product",
      mode: "selected",
      listingIds: [],
    },
    defaultLayout: {
      variant: "grid",
      columns: 3,
    },
    defaultStyle: {
      background: "default",
      showPrice: true,
      showDescription: true,
    },
    variants: [
      { id: "grid", label: "Grid", description: "Responsive product card grid." },
      { id: "featured", label: "Featured", description: "First product emphasized." },
      { id: "list", label: "List", description: "Horizontal product rows." },
    ],
    usesSource: true,
    supportsColumns: true,
    supportsBackground: true,
    supportsListingDisplay: true,
  },
  {
    type: "services",
    label: "Services",
    description: "Show selected public Source services.",
    category: "Commerce",
    defaultContent: {
      heading: "Services",
      intro: "",
    },
    defaultSource: {
      kind: "source",
      listingType: "service",
      mode: "selected",
      listingIds: [],
    },
    defaultLayout: {
      variant: "grid",
      columns: 3,
    },
    defaultStyle: {
      background: "default",
      showPrice: true,
      showDescription: true,
    },
    variants: [
      { id: "grid", label: "Grid", description: "Service cards in a grid." },
      { id: "list", label: "List", description: "Stacked service rows." },
      { id: "editorial", label: "Editorial", description: "Larger text-forward services." },
    ],
    usesSource: true,
    supportsColumns: true,
    supportsBackground: true,
    supportsListingDisplay: true,
  },
  {
    type: "gallery",
    label: "Gallery",
    description: "Reserve space for public visual work.",
    category: "Media",
    defaultContent: {
      heading: "Gallery",
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "grid",
      columns: 3,
    },
    defaultStyle: { background: "default" },
    variants: [
      { id: "grid", label: "Grid", description: "Simple responsive media grid." },
    ],
    usesSource: false,
    supportsColumns: true,
    supportsBackground: true,
  },
] as const satisfies readonly SiteSectionDefinition[];

export const SECTION_CATEGORIES: SiteSectionCategory[] = [
  "Essentials",
  "Commerce",
  "Media",
];

export const SITE_SECTION_DEFINITIONS = sectionDefinitions;

export type AddableSiteSectionType =
  (typeof SITE_SECTION_DEFINITIONS)[number]["type"];

export const SITE_SECTION_REGISTRY = SITE_SECTION_DEFINITIONS.reduce(
  (registry, definition) => ({
    ...registry,
    [definition.type]: definition,
  }),
  {} as Record<AddableSiteSectionType, SiteSectionDefinition>,
);

let sectionIdCounter = 0;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getSectionDefinition(type: SiteSectionType) {
  return SITE_SECTION_REGISTRY[type as AddableSiteSectionType];
}

export function getDefaultSectionVariant(type: AddableSiteSectionType) {
  return SITE_SECTION_REGISTRY[type].defaultLayout.variant;
}

export function isRegisteredSectionType(
  type: SiteSectionType,
): type is AddableSiteSectionType {
  return type in SITE_SECTION_REGISTRY;
}

export function getSectionVariant(
  type: SiteSectionType,
  variantId: string | undefined,
) {
  const definition = getSectionDefinition(type);
  if (!definition) return undefined;

  return (
    definition.variants.find((variant) => variant.id === variantId) ??
    definition.variants.find(
      (variant) => variant.id === definition.defaultLayout.variant,
    )
  );
}

export function createSectionId(
  pageId: string,
  type: SiteSectionType,
  existingIds: Iterable<string> = [],
) {
  const used = new Set(existingIds);
  const safePageId = pageId.replace(/[^a-z0-9-]/gi, "-") || "page";
  const safeType = type.replace(/[^a-z0-9-]/gi, "-") || "section";

  let candidate = "";
  do {
    sectionIdCounter += 1;
    candidate = `${safePageId}-${safeType}-${Date.now().toString(
      36,
    )}-${sectionIdCounter.toString(36)}`;
  } while (used.has(candidate));

  return candidate;
}

export function createSiteSection({
  pageId,
  type,
  variant,
  existingIds,
}: {
  pageId: string;
  type: AddableSiteSectionType;
  variant?: string;
  existingIds?: Iterable<string>;
}): SiteSection {
  const definition = SITE_SECTION_REGISTRY[type];
  const variantId = variant ?? definition.defaultLayout.variant;

  return {
    id: createSectionId(pageId, type, existingIds),
    label: definition.label,
    type,
    visible: true,
    source: clone(definition.defaultSource),
    content: clone(definition.defaultContent),
    layout: {
      ...clone(definition.defaultLayout),
      variant: variantId,
    },
    style: definition.defaultStyle ? clone(definition.defaultStyle) : undefined,
  };
}

export function changeSectionVariant(
  section: SiteSection,
  variant: string,
): SiteSection {
  return {
    ...section,
    layout: {
      ...section.layout,
      variant,
    },
  };
}
