import type {
  SiteDataSource,
  SiteSection,
  SiteSectionLayoutConfig,
  SiteSectionStyleConfig,
  SiteSectionType,
} from "@/lib/site-builder/types";

export type SiteSectionCategory =
  | "Essentials"
  | "Trust"
  | "Commerce"
  | "Media";

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
      mediaRatio: "16:9",
      mediaHeight: 420,
      mediaZoom: 100,
      mediaPositionX: 50,
      mediaPositionY: 50,
      mediaFrame: "none",
      mediaRadius: 12,
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
    type: "split",
    label: "Split",
    description:
      "Combine editable copy, an action, and media in a flexible two-part section.",
    category: "Essentials",
    defaultContent: {
      eyebrow: "About",
      heading: "Tell the story with a little more room.",
      body: "Use this section for an introduction, feature, service explanation, process, or anything that benefits from text beside media.",
      buttonLabel: "Learn more",
      buttonHref: "#",
      buttonPageId: "",
      mediaUrl: "",
      mediaPath: "",
      mediaAlt: "",
      mediaFit: "cover",
      mediaRatio: "4:3",
      mediaHeight: 420,
      mediaZoom: 100,
      mediaPositionX: 50,
      mediaPositionY: 50,
      mediaFrame: "none",
      mediaRadius: 12,
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "media-right",
      spacing: "normal",
    },
    defaultStyle: { background: "default" },
    variants: [
      {
        id: "media-right",
        label: "Media right",
        description: "Copy on the left with media on the right.",
      },
      {
        id: "media-left",
        label: "Media left",
        description: "Media on the left with copy on the right.",
      },
      {
        id: "stacked",
        label: "Stacked",
        description: "Copy above a wide media stage.",
      },
    ],
    usesSource: false,
    supportsSpacing: true,
    supportsBackground: true,
  },
  {
    type: "cards",
    label: "Cards",
    description:
      "Build a manual collection of projects, features, links, or other public content.",
    category: "Essentials",
    defaultContent: {
      heading: "Selected work",
      intro: "A few things worth seeing.",
      items: [
        {
          id: "card-1",
          eyebrow: "Project",
          title: "First card",
          body: "Describe this item and why it matters.",
          imageUrl: "",
          imagePath: "",
          imageAlt: "",
          linkLabel: "View",
          linkHref: "#",
          linkPageId: "",
        },
        {
          id: "card-2",
          eyebrow: "Project",
          title: "Second card",
          body: "Add another item to this collection.",
          imageUrl: "",
          imagePath: "",
          imageAlt: "",
          linkLabel: "View",
          linkHref: "#",
          linkPageId: "",
        },
        {
          id: "card-3",
          eyebrow: "Project",
          title: "Third card",
          body: "Cards can represent almost any kind of public content.",
          imageUrl: "",
          imagePath: "",
          imageAlt: "",
          linkLabel: "View",
          linkHref: "#",
          linkPageId: "",
        },
      ],
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "grid",
      columns: 3,
      width: "wide",
      spacing: "spacious",
    },
    defaultStyle: { background: "default" },
    variants: [
      {
        id: "grid",
        label: "Grid",
        description: "Large visual portfolio tiles.",
      },
      {
        id: "list",
        label: "List",
        description: "Wide horizontal project rows.",
      },
      {
        id: "featured",
        label: "Featured",
        description: "Lead with one large showcase item.",
      },
    ],
    usesSource: false,
    supportsColumns: true,
    supportsWidth: true,
    supportsSpacing: true,
    supportsBackground: true,
  },
  {
    type: "stats",
    label: "Stats",
    description:
      "Highlight numbers, milestones, metrics, or other compact proof points.",
    category: "Trust",
    defaultContent: {
      heading: "By the numbers",
      intro: "",
      items: [
        {
          id: "stat-1",
          value: "10+",
          label: "Projects",
        },
        {
          id: "stat-2",
          value: "5",
          label: "Years building",
        },
        {
          id: "stat-3",
          value: "100%",
          label: "Independent",
        },
      ],
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "grid",
      columns: 3,
      spacing: "normal",
    },
    defaultStyle: { background: "default" },
    variants: [
      {
        id: "grid",
        label: "Grid",
        description: "Large values in individual cells.",
      },
      {
        id: "strip",
        label: "Strip",
        description: "Compact horizontal metrics.",
      },
      {
        id: "editorial",
        label: "Editorial",
        description: "Oversized typography with minimal chrome.",
      },
    ],
    usesSource: false,
    supportsColumns: true,
    supportsSpacing: true,
    supportsBackground: true,
  },
  {
    type: "faq",
    label: "FAQ",
    description:
      "Answer common questions with a structured expandable section.",
    category: "Trust",
    defaultContent: {
      heading: "Frequently asked questions",
      intro: "",
      items: [
        {
          id: "faq-1",
          question: "What should people know?",
          answer: "Give visitors a clear, direct answer here.",
        },
        {
          id: "faq-2",
          question: "How does this work?",
          answer: "Explain the process in a few useful sentences.",
        },
        {
          id: "faq-3",
          question: "What happens next?",
          answer: "Explain the next step or call to action.",
        },
      ],
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "accordion",
      width: "wide",
      spacing: "normal",
    },
    defaultStyle: { background: "default" },
    variants: [
      {
        id: "accordion",
        label: "Accordion",
        description: "Expandable questions in a clean vertical list.",
      },
      {
        id: "columns",
        label: "Columns",
        description: "Open answers arranged in two columns.",
      },
      {
        id: "plain",
        label: "Plain",
        description: "Simple stacked questions and answers.",
      },
    ],
    usesSource: false,
    supportsWidth: true,
    supportsSpacing: true,
    supportsBackground: true,
  },
  {
    type: "testimonials",
    label: "Testimonials",
    description:
      "Show quotes, reviews, endorsements, or other social proof.",
    category: "Trust",
    defaultContent: {
      heading: "What people say",
      intro: "",
      items: [
        {
          id: "testimonial-1",
          quote: "Add a real customer, client, or collaborator quote here.",
          name: "Person name",
          role: "Customer",
        },
        {
          id: "testimonial-2",
          quote: "Use this section for proof that supports the rest of the page.",
          name: "Person name",
          role: "Client",
        },
        {
          id: "testimonial-3",
          quote: "Short, specific testimonials usually work better than vague praise.",
          name: "Person name",
          role: "Collaborator",
        },
      ],
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "grid",
      columns: 3,
      spacing: "normal",
    },
    defaultStyle: { background: "default" },
    variants: [
      {
        id: "grid",
        label: "Grid",
        description: "Balanced quote cards.",
      },
      {
        id: "featured",
        label: "Featured",
        description: "Emphasize the first testimonial.",
      },
      {
        id: "list",
        label: "List",
        description: "Simple stacked testimonials.",
      },
    ],
    usesSource: false,
    supportsColumns: true,
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
      formEnabled: true,
      nameLabel: "Name",
      emailLabel: "Email",
      messageLabel: "Message",
      buttonLabel: "Send message",
      successMessage: "Thanks — your message was sent.",
      buttonHref: "#contact",
      buttonPageId: "",
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
    description: "Show a collection of uploaded images.",
    category: "Media",
    defaultContent: {
      heading: "Gallery",
      items: [],
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
  {
    type: "embed",
    label: "Embed",
    description:
      "Embed supported video, music, or hosted media.",
    category: "Media",
    defaultContent: {
      heading: "Featured media",
      intro: "",
      url: "",
      title: "Embedded media",
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "contained",
      width: "wide",
      spacing: "normal",
    },
    defaultStyle: {
      background: "default",
    },
    variants: [
      {
        id: "contained",
        label: "Contained",
        description:
          "Media sits inside a focused content width.",
      },
      {
        id: "wide",
        label: "Wide",
        description:
          "Media expands across the page stage.",
      },
    ],
    usesSource: false,
    supportsWidth: true,
    supportsSpacing: true,
    supportsBackground: true,
  },
  {
    type: "media",
    label: "Media",
    description: "Place a single uploaded image on the page.",
    category: "Media",
    defaultContent: {
      mediaUrl: "",
      mediaPath: "",
      mediaAlt: "",
      mediaFit: "contain",
    },
    defaultSource: { kind: "manual" },
    defaultLayout: {
      variant: "contained",
      width: "wide",
      spacing: "normal",
    },
    defaultStyle: { background: "default" },
    variants: [
      {
        id: "contained",
        label: "Contained",
        description: "Image sits inside the page content width.",
      },
      {
        id: "wide",
        label: "Wide",
        description: "Image receives a wider visual stage.",
      },
    ],
    usesSource: false,
    supportsWidth: true,
    supportsSpacing: true,
    supportsBackground: true,
  },
] as const satisfies readonly SiteSectionDefinition[];

export const SECTION_CATEGORIES: SiteSectionCategory[] = [
  "Essentials",
  "Trust",
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
