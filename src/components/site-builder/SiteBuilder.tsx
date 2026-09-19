"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  Home,
  ImageIcon,
  Loader2,
  Mail,
  Menu,
  MousePointerClick,
  Monitor,
  MoreHorizontal,
  Package,
  Palette,
  Pencil,
  Plus,
  Trash2,
  Type,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SectionLibrary } from "@/components/site-builder/SectionLibrary";
import { normalizeSourceListingCardProps } from "@/components/source/SourceListingCard";
import { mackValiSiteDocument } from "@/lib/site-builder/mackValiSite";
import { migrateLegacyMackSite } from "@/lib/site-builder/migrateLegacyMackSite";
import { uploadSiteImage } from "@/lib/site-builder/mediaStorage";
import {
  getSiteFooterConfig,
  getSiteHeaderConfig,
} from "@/lib/site-builder/siteChrome";
import {
  isValidSiteHandle,
  sanitizeSiteHandle,
} from "@/lib/site-builder/siteIdentity";
import {
  getSitePageHref,
} from "@/lib/site-builder/siteLinks";
import {
  resolveSiteEmbedUrl,
} from "@/lib/site-builder/siteEmbeds";
import {
  getSiteThemeColors,
  getSiteThemeConfig,
  getSiteThemePreset,
  getSiteThemeStyle,
} from "@/lib/site-builder/siteTheme";
import {
  createSitePreviewActiveSelectionMessage,
  createSitePreviewStateMessage,
  isSitePreviewContentEditRequestMessage,
  isSitePreviewReadyMessage,
  isSitePreviewSectionInsertRequestMessage,
  isSitePreviewSelectionRequestMessage,
  sectionTypeSupportsInlineEditField,
} from "@/lib/site-builder/previewMessages";
import {
  changeSectionVariant,
  createSiteSection,
  getSectionDefinition,
  type AddableSiteSectionType,
} from "@/lib/site-builder/sectionRegistry";
import type {
  SiteCatalog,
  SiteCatalogCollection,
  SiteCatalogItem,
  SiteContentNodeId,
  SiteDataSource,
  SiteDocument,
  SiteEditorSelection,
  SiteNavigationItem,
  SiteSection,
  SiteSectionLayoutConfig,
  SiteSectionStyleConfig,
  SiteThemeConfig,
} from "@/lib/site-builder/types";
import type { ListingsResponse, SourceListing } from "@/types/source";

type PreviewMode = "desktop" | "tablet" | "mobile";
type InspectorMode = "content" | "design";
type SiteRailMode = "structure" | "design";
type DraftLoadStatus = "loading" | "ready" | "error";
type DraftSaveStatus = "idle" | "saving" | "saved" | "error";
type PublishRequestStatus =
  | "checking"
  | "ready"
  | "publishing"
  | "error";
type SiteChromeSelection =
  | "site"
  | "design"
  | "inquiries"
  | "catalog"
  | "header"
  | "navigation"
  | "footer";
type SectionNavigationChild =
  | {
      kind?: "content";
      id: SiteContentNodeId;
      label: string;
      icon: LucideIcon;
    }
  | {
      kind: "block";
      id: string;
      label: string;
      icon: LucideIcon;
    };

type SiteContentChangeHandler = (key: string, value: unknown) => void;

type SiteInquiry = {
  id: string;
  site_handle: string;
  page_id: string;
  section_id: string;
  sender_name: string;
  sender_email: string;
  message: string;
  status: "new" | "read" | "archived";
  created_at: string;
};

type InquiryLoadStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "error";

type SiteGalleryItem = {
  id: string;
  url: string;
  path: string;
  alt: string;
};

type SiteCardItem = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  imageUrl: string;
  imagePath: string;
  imageAlt: string;
  linkLabel: string;
  linkHref: string;
  linkPageId: string;

  // Legacy presentation values remain readable.
  emphasis?: "normal" | "featured";
  mediaScale?: "small" | "balanced" | "dominant";

  // Visual card geometry.
  span?: "one" | "two" | "full";
  mediaPosition?: "top" | "left" | "right";
  mediaFit?: "cover" | "contain";
  mediaRatio?: "16:9" | "3:2" | "4:3" | "1:1";
  mediaShare?: number;
  mediaZoom?: number;
  mediaPositionX?: number;
  mediaPositionY?: number;
  minHeight?: number;
  padding?: number;

  // Card typography.
  titleSize?: number;
  bodySize?: number;
  textWidth?: number;
};

type SiteStatItem = {
  id: string;
  value: string;
  label: string;
};

type SiteFaqItem = {
  id: string;
  question: string;
  answer: string;
};

type SiteTestimonialItem = {
  id: string;
  quote: string;
  name: string;
  role: string;
};


const previewModes: Record<
  PreviewMode,
  { label: string; width: number; viewportHeight: number | null }
> = {
  desktop: { label: "Desktop", width: 1440, viewportHeight: 900 },
  tablet: { label: "Tablet", width: 768, viewportHeight: 1024 },
  mobile: { label: "Mobile", width: 390, viewportHeight: 844 },
};

const inspectorModes: Array<{ id: InspectorMode; label: string }> = [
  { id: "content", label: "Content" },
  { id: "design", label: "Design" },
];

function cloneInitialSite(): SiteDocument {
  const site = JSON.parse(
    JSON.stringify(mackValiSiteDocument),
  ) as SiteDocument;

  return migrateLegacyMackSite(site);
}

function getInitialEditorSelection(
  _site: SiteDocument,
): SiteEditorSelection | null {
  void _site;
  return null;
}

function slugifyPageTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeSlug(value: string) {
  return slugifyPageTitle(value);
}

function createPageId(title: string) {
  const base = slugifyPageTitle(title) || "page";
  return `${base}-${Date.now().toString(36)}`;
}

function createDuplicatePageId(pageId: string) {
  return `${pageId}-copy-${Date.now().toString(36)}`;
}

function uniqueSlug(
  desiredSlug: string,
  pages: SiteDocument["pages"],
  ignoredPageId?: string,
) {
  const base = sanitizeSlug(desiredSlug) || "page";
  const existing = new Set(
    pages
      .filter((page) => page.id !== ignoredPageId)
      .map((page) => page.slug),
  );

  if (!existing.has(base)) return base;

  let index = 2;
  let candidate = `${base}-copy`;
  while (existing.has(candidate)) {
    candidate = `${base}-copy-${index}`;
    index += 1;
  }

  return candidate;
}

function isDuplicateSlug(
  slug: string,
  pages: SiteDocument["pages"],
  ignoredPageId?: string,
) {
  return pages.some(
    (page) => page.id !== ignoredPageId && page.slug === slug,
  );
}

function getDraftPreviewHref(
  site: SiteDocument,
  pageId: string | undefined,
) {
  const resolvedPageId =
    pageId ??
    site.homePageId;

  return `/site/preview?standalone=1&page=${encodeURIComponent(
    resolvedPageId,
  )}`;
}

function getPublicPageHref(
  site: SiteDocument,
  pageId: string | undefined,
) {
  return getSitePageHref(site, pageId);
}

function sectionSourceLabel(section: SiteSection) {
  if (section.source.kind === "manual") {
    return "Manual";
  }

  return `Source ${section.source.listingType}s`;
}

function createDuplicateSectionId(sectionId: string) {
  return `${sectionId}-copy-${Date.now().toString(36)}`;
}

function sectionHasDesignControls(section: SiteSection) {
  return Boolean(getSectionDefinition(section.type));
}

function getSectionBlockNavigationChildren(
  section: SiteSection,
): SectionNavigationChild[] {
  if (
    section.type !== "cards" &&
    section.type !== "stats" &&
    section.type !== "faq" &&
    section.type !== "testimonials"
  ) {
    return [];
  }

  const items = Array.isArray(
    section.content.items,
  )
    ? section.content.items
    : [];

  return items.flatMap(
    (item, index) => {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item)
      ) {
        return [];
      }

      const record =
        item as Record<
          string,
          unknown
        >;

      const id =
        typeof record.id === "string" &&
        record.id.trim()
          ? record.id
          : "";

      if (!id) {
        return [];
      }

      let label = "";

      if (
        section.type === "cards"
      ) {
        label =
          typeof record.title ===
            "string" &&
          record.title.trim()
            ? record.title
            : `Card ${index + 1}`;
      } else if (
        section.type === "faq"
      ) {
        label =
          typeof record.question ===
            "string" &&
          record.question.trim()
            ? record.question
            : `Question ${index + 1}`;
      } else if (
        section.type ===
        "testimonials"
      ) {
        label =
          typeof record.name ===
            "string" &&
          record.name.trim()
            ? record.name
            : `Testimonial ${index + 1}`;
      } else {
        label =
          typeof record.label ===
            "string" &&
          record.label.trim()
            ? record.label
            : typeof record.value ===
                  "string" &&
                record.value.trim()
              ? record.value
              : `Stat ${index + 1}`;
      }

      return [
        {
          kind: "block" as const,
          id,
          label,
          icon: FileText,
        },
      ];
    },
  );
}

function getSectionNavigationChildren(
  section: SiteSection,
): SectionNavigationChild[] {
  if (section.type === "hero") {
    return [
      { id: "text", label: "Text", icon: Type },
      { id: "button", label: "Button", icon: MousePointerClick },
      { id: "media", label: "Media", icon: ImageIcon },
    ];
  }

  if (section.type === "cta") {
    return [
      { id: "text", label: "Text", icon: Type },
      { id: "button", label: "Button", icon: MousePointerClick },
    ];
  }

  if (section.type === "contact") {
    return [
      { id: "text", label: "Text", icon: Type },
      {
        id: "button",
        label:
          section.content.formEnabled === true
            ? "Submit button"
            : "Button",
        icon: MousePointerClick,
      },
    ];
  }

  if (section.type === "split") {
    return [
      { id: "text", label: "Text", icon: Type },
      { id: "button", label: "Button", icon: MousePointerClick },
      { id: "media", label: "Media", icon: ImageIcon },
    ];
  }

  if (
    section.type === "cards" ||
    section.type === "stats" ||
    section.type === "faq" ||
    section.type === "testimonials"
  ) {
    return [
      {
        id: "text",
        label: "Section text",
        icon: Type,
      },
      ...getSectionBlockNavigationChildren(
        section,
      ),
    ];
  }

  if (section.type === "embed") {
    return [
      {
        id: "text",
        label: "Section text",
        icon: Type,
      },
      {
        id: "media",
        label: "Embed",
        icon: ImageIcon,
      },
    ];
  }

  if (section.type === "media") {
    return [
      { id: "media", label: "Media", icon: ImageIcon },
    ];
  }

  if (section.type === "gallery") {
    return [
      { id: "media", label: "Images", icon: ImageIcon },
    ];
  }

  return [];
}

function getSectionTreeIcon(
  type: SiteSection["type"],
) {
  switch (type) {
    case "hero":
      return Globe2;

    case "content":
    case "split":
    case "stats":
    case "faq":
    case "testimonials":
      return Type;

    case "gallery":
    case "media":
    case "embed":
      return ImageIcon;

    case "cta":
    case "contact":
      return MousePointerClick;

    case "cards":
    case "projects":
    case "products":
    case "services":
    default:
      return Package;
  }
}

function sectionSupportsContentNode(
  section: SiteSection,
  node: SiteContentNodeId,
) {
  return getSectionNavigationChildren(section).some((child) => child.id === node);
}

function InspectorHeader({
  pageTitle,
  section,
  canMoveUp,
  canMoveDown,
  canDelete,
  onDuplicate,
  onToggleVisible,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  pageTitle: string;
  section: SiteSection;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  onDuplicate: () => void;
  onToggleVisible: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border-b border-white/[0.07] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-zinc-100">
            {section.label}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-600">
            {pageTitle} / {section.label}
          </p>
          {section.source.kind !== "manual" ? (
            <p className="mt-1 text-[10px] text-zinc-600">
              {sectionSourceLabel(section)}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onToggleVisible}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.09] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100"
          title={section.visible ? "Hide section" : "Show section"}
        >
          {section.visible ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>

        <details className="group relative shrink-0">
          <summary
            className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-md border border-white/[0.09] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100 [&::-webkit-details-marker]:hidden"
            title="Section actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </summary>
          <div className="absolute right-0 top-8 z-20 w-40 rounded-md border border-white/[0.1] bg-[#111214] p-1 shadow-2xl">
            <InspectorMenuButton icon={Copy} label="Duplicate" onClick={onDuplicate} />
            <InspectorMenuButton
              icon={ArrowUp}
              label="Move up"
              onClick={onMoveUp}
              disabled={!canMoveUp}
            />
            <InspectorMenuButton
              icon={ArrowDown}
              label="Move down"
              onClick={onMoveDown}
              disabled={!canMoveDown}
            />
            <InspectorMenuButton
              icon={section.visible ? EyeOff : Eye}
              label={section.visible ? "Hide" : "Show"}
              onClick={onToggleVisible}
            />
            <InspectorMenuButton
              icon={Trash2}
              label="Delete"
              onClick={onDelete}
              disabled={!canDelete}
              danger
            />
          </div>
        </details>
      </div>
    </div>
  );
}

function InspectorMenuButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        onClick();
      }}
      disabled={disabled}
      className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition disabled:cursor-not-allowed disabled:text-zinc-700 ${
        danger
          ? "text-zinc-500 hover:bg-red-400/[0.08] hover:text-red-200"
          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function getContentString(section: SiteSection, key: string) {
  const value = section.content[key];
  return typeof value === "string" ? value : "";
}

function getGalleryItems(section: SiteSection): SiteGalleryItem[] {
  const value = section.content.items;
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item)
    ) {
      return [];
    }

    const candidate = item as Record<string, unknown>;

    if (
      typeof candidate.id !== "string" ||
      typeof candidate.url !== "string" ||
      typeof candidate.path !== "string"
    ) {
      return [];
    }

    return [{
      id: candidate.id,
      url: candidate.url,
      path: candidate.path,
      alt: typeof candidate.alt === "string" ? candidate.alt : "",
    }];
  });
}

function getCardItems(section: SiteSection): SiteCardItem[] {
  const value = section.content.items;
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item)
    ) {
      return [];
    }

    const candidate =
      item as Record<string, unknown>;

    if (typeof candidate.id !== "string") {
      return [];
    }

    const readString = (key: string) =>
      typeof candidate[key] === "string"
        ? candidate[key] as string
        : "";

    const readNumber = (
      key: string,
      min: number,
      max: number,
    ) => {
      const value = candidate[key];

      return typeof value === "number" &&
        Number.isFinite(value)
        ? Math.max(
            min,
            Math.min(
              max,
              value,
            ),
          )
        : undefined;
    };

    return [{
      id: candidate.id,
      eyebrow: readString("eyebrow"),
      title: readString("title"),
      body: readString("body"),
      imageUrl: readString("imageUrl"),
      imagePath: readString("imagePath"),
      imageAlt: readString("imageAlt"),
      linkLabel: readString("linkLabel"),
      linkHref: readString("linkHref"),
      linkPageId: readString("linkPageId"),

      emphasis:
        candidate.emphasis === "normal" ||
        candidate.emphasis === "featured"
          ? candidate.emphasis
          : undefined,

      mediaScale:
        candidate.mediaScale === "small" ||
        candidate.mediaScale === "balanced" ||
        candidate.mediaScale === "dominant"
          ? candidate.mediaScale
          : undefined,

      span:
        candidate.span === "one" ||
        candidate.span === "two" ||
        candidate.span === "full"
          ? candidate.span
          : undefined,

      mediaPosition:
        candidate.mediaPosition === "top" ||
        candidate.mediaPosition === "left" ||
        candidate.mediaPosition === "right"
          ? candidate.mediaPosition
          : undefined,

      mediaFit:
        candidate.mediaFit === "cover" ||
        candidate.mediaFit === "contain"
          ? candidate.mediaFit
          : undefined,

      mediaRatio:
        candidate.mediaRatio === "16:9" ||
        candidate.mediaRatio === "3:2" ||
        candidate.mediaRatio === "4:3" ||
        candidate.mediaRatio === "1:1"
          ? candidate.mediaRatio
          : undefined,

      mediaShare:
        readNumber(
          "mediaShare",
          25,
          75,
        ),

      mediaZoom:
        readNumber(
          "mediaZoom",
          50,
          180,
        ),

      mediaPositionX:
        readNumber(
          "mediaPositionX",
          0,
          100,
        ),

      mediaPositionY:
        readNumber(
          "mediaPositionY",
          0,
          100,
        ),

      minHeight:
        readNumber(
          "minHeight",
          180,
          900,
        ),

      padding:
        readNumber(
          "padding",
          0,
          120,
        ),

      titleSize:
        readNumber(
          "titleSize",
          18,
          96,
        ),

      bodySize:
        readNumber(
          "bodySize",
          9,
          28,
        ),

      textWidth:
        readNumber(
          "textWidth",
          180,
          1000,
        ),
    }];
  });
}

function getStatItems(section: SiteSection): SiteStatItem[] {
  const value = section.content.items;
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item)
    ) {
      return [];
    }

    const candidate = item as Record<string, unknown>;

    if (typeof candidate.id !== "string") return [];

    return [
      {
        id: candidate.id,
        value:
          typeof candidate.value === "string"
            ? candidate.value
            : "",
        label:
          typeof candidate.label === "string"
            ? candidate.label
            : "",
      },
    ];
  });
}

function getFaqItems(section: SiteSection): SiteFaqItem[] {
  const value = section.content.items;
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item)
    ) {
      return [];
    }

    const candidate = item as Record<string, unknown>;

    if (typeof candidate.id !== "string") return [];

    return [
      {
        id: candidate.id,
        question:
          typeof candidate.question === "string"
            ? candidate.question
            : "",
        answer:
          typeof candidate.answer === "string"
            ? candidate.answer
            : "",
      },
    ];
  });
}

function getTestimonialItems(
  section: SiteSection,
): SiteTestimonialItem[] {
  const value = section.content.items;
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item)
    ) {
      return [];
    }

    const candidate = item as Record<string, unknown>;

    if (typeof candidate.id !== "string") return [];

    const read = (key: string) =>
      typeof candidate[key] === "string"
        ? (candidate[key] as string)
        : "";

    return [
      {
        id: candidate.id,
        quote: read("quote"),
        name: read("name"),
        role: read("role"),
      },
    ];
  });
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[11px] font-medium text-zinc-500"
    >
      {children}
    </label>
  );
}

function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-8 w-full rounded-md border border-white/[0.09] bg-black/30 px-2.5 text-[12px] text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-white/[0.18]"
      />
    </div>
  );
}

function TextAreaInput({
  id,
  label,
  value,
  onChange,
  rows = 4,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="mt-1.5 w-full resize-none rounded-md border border-white/[0.09] bg-black/30 px-2.5 py-2 text-[12px] leading-5 text-zinc-100 outline-none transition focus:border-white/[0.18]"
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-white/[0.08] bg-black/20 px-2.5 py-2">
      <span>
        <span className="block text-[12px] font-medium text-zinc-300">
          {label}
        </span>
        {description ? (
          <span className="mt-1 block text-[10px] leading-4 text-zinc-600">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-zinc-100"
      />
    </label>
  );
}

function InspectorGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-white/[0.06] pb-4 last:border-b-0 last:pb-0">
      <h3 className="text-[12px] font-medium text-zinc-300">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SiteLinkTargetEditor({
  idPrefix,
  site,
  pageId,
  href,
  onPageIdChange,
  onHrefChange,
}: {
  idPrefix: string;
  site: SiteDocument;
  pageId: string;
  href: string;
  onPageIdChange: (value: string) => void;
  onHrefChange: (value: string) => void;
}) {
  const pageExists =
    Boolean(pageId) &&
    site.pages.some((page) => page.id === pageId);

  return (
    <div>
      <FieldLabel htmlFor={`${idPrefix}-target`}>
        Target
      </FieldLabel>

      <select
        id={`${idPrefix}-target`}
        value={pageExists ? pageId : "__custom__"}
        onChange={(event) => {
          onPageIdChange(
            event.target.value === "__custom__"
              ? ""
              : event.target.value,
          );
        }}
        className="mt-1.5 h-8 w-full rounded-md border border-white/[0.09] bg-black/30 px-2 text-[11px] text-zinc-300 outline-none focus:border-white/[0.18]"
      >
        <option value="__custom__">
          Custom URL
        </option>

        {site.pages.map((page) => (
          <option
            key={page.id}
            value={page.id}
          >
            {page.id === site.homePageId
              ? `${page.title} · Home`
              : page.title}
          </option>
        ))}
      </select>

      {pageExists ? (
        <p className="mt-1.5 break-all text-[10px] text-zinc-600">
          {getSitePageHref(site, pageId)}
        </p>
      ) : (
        <div className="mt-2">
          <TextInput
            id={`${idPrefix}-href`}
            label="Custom URL"
            value={href}
            placeholder="https://… or #section"
            onChange={onHrefChange}
          />
        </div>
      )}
    </div>
  );
}

function CtaFields({
  site,
  labelId,
  hrefId,
  label,
  href,
  pageId,
  labelKey,
  hrefKey,
  pageIdKey,
  onContentChange,
}: {
  site: SiteDocument;
  labelId: string;
  hrefId: string;
  label: string;
  href: string;
  pageId: string;
  labelKey: string;
  hrefKey: string;
  pageIdKey: string;
  onContentChange: SiteContentChangeHandler;
}) {
  return (
    <div className="space-y-3">
      <TextInput
        id={labelId}
        label="Label"
        value={label}
        onChange={(value) =>
          onContentChange(labelKey, value)
        }
      />

      <SiteLinkTargetEditor
        idPrefix={hrefId}
        site={site}
        pageId={pageId}
        href={href}
        onPageIdChange={(value) =>
          onContentChange(pageIdKey, value)
        }
        onHrefChange={(value) =>
          onContentChange(hrefKey, value)
        }
      />
    </div>
  );
}

function EmbedEditor({
  section,
  onContentChange,
}: {
  section: SiteSection;
  onContentChange: SiteContentChangeHandler;
}) {
  const url = getContentString(
    section,
    "url",
  );
  const title = getContentString(
    section,
    "title",
  );
  const resolved = resolveSiteEmbedUrl(url);

  const providerLabel =
    resolved?.provider === "youtube"
      ? "YouTube"
      : resolved?.provider === "vimeo"
      ? "Vimeo"
      : resolved?.provider === "spotify"
      ? "Spotify"
      : resolved?.provider === "video"
      ? "Direct video"
      : null;

  return (
    <div className="space-y-3">
      <TextInput
        id={`site-${section.id}-embed-url`}
        label="Media URL"
        value={url}
        placeholder="Paste YouTube, Vimeo, Spotify, or video URL"
        onChange={(value) =>
          onContentChange("url", value)
        }
      />

      <TextInput
        id={`site-${section.id}-embed-title`}
        label="Accessible title"
        value={title}
        placeholder="Video or audio title"
        onChange={(value) =>
          onContentChange("title", value)
        }
      />

      {url ? (
        <div
          className={`rounded-md border px-3 py-2 text-[10px] leading-4 ${
            resolved
              ? "border-emerald-300/10 bg-emerald-300/[0.03] text-emerald-100/60"
              : "border-amber-300/10 bg-amber-300/[0.03] text-amber-100/60"
          }`}
        >
          {resolved
            ? `${providerLabel} embed recognized.`
            : "Unsupported URL. Use YouTube, Vimeo, Spotify, MP4, WebM, OGG, or OGV."}
        </div>
      ) : (
        <p className="text-[10px] leading-4 text-zinc-600">
          Supports YouTube, Vimeo, Spotify,
          and direct hosted video files.
        </p>
      )}
    </div>
  );
}


function MediaPositionControl({
  x,
  y,
  onChange,
}: {
  x: number;
  y: number;
  onChange: (
    x: number,
    y: number,
  ) => void;
}) {
  const clamp = (
    value: number,
  ) =>
    Math.max(
      0,
      Math.min(100, value),
    );

  return (
    <div className="px-1 py-2">
      <div className="mb-2 text-[10px] text-zinc-500">
        Position
      </div>

      <div
        className="relative h-20 cursor-crosshair overflow-hidden rounded-md border border-white/[0.08] bg-black/30"
        onPointerDown={(event) => {
          const rect =
            event.currentTarget
              .getBoundingClientRect();

          onChange(
            clamp(
              (
                (
                  event.clientX -
                  rect.left
                ) /
                rect.width
              ) * 100,
            ),
            clamp(
              (
                (
                  event.clientY -
                  rect.top
                ) /
                rect.height
              ) * 100,
            ),
          );
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.05]" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/[0.05]" />

        <span
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/60 bg-white shadow-lg"
          style={{
            left: `${x}%`,
            top: `${y}%`,
          }}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-[8px] uppercase tracking-[0.14em] text-zinc-700">
            X
          </span>

          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(x)}
            onChange={(event) =>
              onChange(
                clamp(
                  Number(
                    event.target.value,
                  ),
                ),
                y,
              )
            }
            className="h-7 w-full rounded border border-white/[0.08] bg-black/25 px-2 text-[10px] text-zinc-300 outline-none"
          />
        </label>

        <label>
          <span className="mb-1 block text-[8px] uppercase tracking-[0.14em] text-zinc-700">
            Y
          </span>

          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(y)}
            onChange={(event) =>
              onChange(
                x,
                clamp(
                  Number(
                    event.target.value,
                  ),
                ),
              )
            }
            className="h-7 w-full rounded border border-white/[0.08] bg-black/25 px-2 text-[10px] text-zinc-300 outline-none"
          />
        </label>
      </div>
    </div>
  );
}

function MediaEditor({
  section,
  onContentChange,
}: {
  section: SiteSection;
  onContentChange: SiteContentChangeHandler;
}) {
  const [uploading, setUploading] =
    useState(false);

  const [uploadError, setUploadError] =
    useState<string | null>(null);

  const mediaUrl =
    getContentString(
      section,
      "mediaUrl",
    );

  const mediaAlt =
    getContentString(
      section,
      "mediaAlt",
    );

  const mediaFit =
    getContentString(
      section,
      "mediaFit",
    ) === "cover"
      ? "cover"
      : "contain";

  const mediaRatioValue =
    getContentString(
      section,
      "mediaRatio",
    );

  const mediaRatio =
    mediaRatioValue === "auto" ||
    mediaRatioValue === "3:2" ||
    mediaRatioValue === "4:3" ||
    mediaRatioValue === "1:1" ||
    mediaRatioValue === "4:5"
      ? mediaRatioValue
      : "16:9";

  const mediaFrameValue =
    getContentString(
      section,
      "mediaFrame",
    );

  const mediaFrame =
    mediaFrameValue === "outline" ||
    mediaFrameValue === "surface"
      ? mediaFrameValue
      : "none";

  function readNumber(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const value =
      section.content[key];

    return typeof value === "number" &&
      Number.isFinite(value)
      ? Math.max(
          min,
          Math.min(
            max,
            value,
          ),
        )
      : fallback;
  }

  const mediaHeight =
    readNumber(
      "mediaHeight",
      360,
      160,
      900,
    );

  const mediaZoom =
    readNumber(
      "mediaZoom",
      100,
      50,
      180,
    );

  const mediaPositionX =
    readNumber(
      "mediaPositionX",
      50,
      0,
      100,
    );

  const mediaPositionY =
    readNumber(
      "mediaPositionY",
      50,
      0,
      100,
    );

  const mediaRadius =
    readNumber(
      "mediaRadius",
      12,
      0,
      48,
    );

  async function upload(
    file: File,
  ) {
    setUploading(true);
    setUploadError(null);

    try {
      const result =
        await uploadSiteImage(
          file,
        );

      onContentChange(
        "mediaUrl",
        result.url,
      );

      onContentChange(
        "mediaPath",
        result.path,
      );
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to upload image.",
      );
    } finally {
      setUploading(false);
    }
  }

  const previewAspect =
    mediaRatio === "1:1"
      ? "1 / 1"
      : mediaRatio === "4:5"
        ? "4 / 5"
        : mediaRatio === "4:3"
          ? "4 / 3"
          : mediaRatio === "3:2"
            ? "3 / 2"
            : "16 / 9";

  return (
    <div className="space-y-4">
      <div>
        <div
          className={`relative overflow-hidden bg-black/25 ${
            mediaFrame === "outline"
              ? "border border-white/[0.12]"
              : mediaFrame === "surface"
                ? "border border-white/[0.08] bg-white/[0.035]"
                : ""
          }`}
          style={{
            aspectRatio:
              previewAspect,
            borderRadius:
              `${mediaRadius}px`,
          }}
        >
          {mediaUrl ? (
            <div
              className="absolute inset-0 bg-no-repeat"
              style={{
                backgroundImage:
                  `url(${mediaUrl})`,
                backgroundSize:
                  mediaFit === "cover"
                    ? "cover"
                    : `${mediaZoom}%`,
                backgroundPosition:
                  `${mediaPositionX}% ${mediaPositionY}%`,
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-700">
              No uploaded media
            </div>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-white/[0.1] px-3 text-[10px] text-zinc-400 transition hover:border-white/[0.2] hover:text-zinc-100">
            {uploading
              ? "Uploading…"
              : mediaUrl
                ? "Replace"
                : "Upload"}

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              className="hidden"
              disabled={uploading}
              onChange={(event) => {
                const input =
                  event.currentTarget;

                const file =
                  input.files?.[0];

                if (!file) return;

                void upload(
                  file,
                ).finally(() => {
                  input.value = "";
                });
              }}
            />
          </label>

          {mediaUrl ? (
            <button
              type="button"
              onClick={() => {
                onContentChange(
                  "mediaUrl",
                  "",
                );

                onContentChange(
                  "mediaPath",
                  "",
                );
              }}
              className="h-8 rounded-md border border-white/[0.08] px-3 text-[10px] text-zinc-500 transition hover:border-red-300/20 hover:text-red-200"
            >
              Remove
            </button>
          ) : null}
        </div>

        {uploadError ? (
          <p className="mt-2 text-[10px] leading-4 text-red-200/80">
            {uploadError}
          </p>
        ) : null}
      </div>

      <TextInput
        id={`site-${section.id}-media-alt`}
        label="Alt text"
        value={mediaAlt}
        onChange={(value) =>
          onContentChange(
            "mediaAlt",
            value,
          )
        }
        placeholder="Describe this image"
      />

      <InspectorSegmentedControl
        label="Fit"
        value={mediaFit}
        options={[
          {
            label: "Contain",
            value: "contain",
          },
          {
            label: "Cover",
            value: "cover",
          },
        ]}
        onChange={(value) =>
          onContentChange(
            "mediaFit",
            value,
          )
        }
      />

      <InspectorSelectRow
        label="Ratio"
        value={mediaRatio}
        options={[
          {
            label: "Auto",
            value: "auto",
          },
          {
            label: "Wide 16:9",
            value: "16:9",
          },
          {
            label: "Photo 3:2",
            value: "3:2",
          },
          {
            label: "Standard 4:3",
            value: "4:3",
          },
          {
            label: "Square 1:1",
            value: "1:1",
          },
          {
            label: "Portrait 4:5",
            value: "4:5",
          },
        ]}
        onChange={(value) =>
          onContentChange(
            "mediaRatio",
            value,
          )
        }
      />

      <InspectorRangeField
        label="Height"
        value={mediaHeight}
        min={160}
        max={900}
        step={10}
        unit="px"
        onChange={(value) =>
          onContentChange(
            "mediaHeight",
            value,
          )
        }
      />

      <InspectorRangeField
        label="Zoom"
        value={mediaZoom}
        min={50}
        max={180}
        step={1}
        unit="%"
        onChange={(value) =>
          onContentChange(
            "mediaZoom",
            value,
          )
        }
      />

      <MediaPositionControl
        x={mediaPositionX}
        y={mediaPositionY}
        onChange={(x, y) => {
          onContentChange(
            "mediaPositionX",
            x,
          );

          onContentChange(
            "mediaPositionY",
            y,
          );
        }}
      />

      <InspectorSegmentedControl
        label="Frame"
        value={mediaFrame}
        options={[
          {
            label: "None",
            value: "none",
          },
          {
            label: "Outline",
            value: "outline",
          },
          {
            label: "Surface",
            value: "surface",
          },
        ]}
        onChange={(value) =>
          onContentChange(
            "mediaFrame",
            value,
          )
        }
      />

      <InspectorRangeField
        label="Corners"
        value={mediaRadius}
        min={0}
        max={48}
        step={1}
        unit="px"
        onChange={(value) =>
          onContentChange(
            "mediaRadius",
            value,
          )
        }
      />
    </div>
  );
}


function createBlankSiteCardItem(): SiteCardItem {
  return {
    id:
      crypto.randomUUID(),
    eyebrow: "",
    title: "",
    body: "",
    imageUrl: "",
    imagePath: "",
    imageAlt: "",
    linkLabel: "",
    linkHref: "",
    linkPageId: "",

    span: "one",
    mediaPosition: "top",
    mediaFit: "cover",
    mediaRatio: "16:9",
    mediaShare: 50,
    mediaZoom: 100,
    mediaPositionX: 50,
    mediaPositionY: 50,
    padding: 24,
    titleSize: 30,
    bodySize: 13,
    textWidth: 520,
  };
}


function CardsNavigator({
  section,
  onContentChange,
  onSelectBlock,
}: {
  section: SiteSection;
  onContentChange: SiteContentChangeHandler;
  onSelectBlock: (blockId: string) => void;
}) {
  const items = getCardItems(section);

  function setItems(
    nextItems: SiteCardItem[],
  ) {
    onContentChange(
      "items",
      nextItems,
    );
  }

  function moveItem(
    itemId: string,
    direction: "up" | "down",
  ) {
    const index = items.findIndex(
      (item) =>
        item.id === itemId,
    );

    if (index < 0) return;

    const destination =
      direction === "up"
        ? index - 1
        : index + 1;

    if (
      destination < 0 ||
      destination >= items.length
    ) {
      return;
    }

    const next = [...items];
    const [moved] =
      next.splice(index, 1);

    next.splice(
      destination,
      0,
      moved,
    );

    setItems(next);
  }

  function addItem() {
    const item =
      createBlankSiteCardItem();

    setItems([
      ...items,
      item,
    ]);

    onSelectBlock(
      item.id,
    );
  }

  function duplicateItem(
    item: SiteCardItem,
  ) {
    const index =
      items.findIndex(
        (candidate) =>
          candidate.id === item.id,
      );

    const copy: SiteCardItem = {
      ...item,
      id: crypto.randomUUID(),
      title:
        item.title
          ? `${item.title} copy`
          : "Card copy",
    };

    const next = [...items];

    next.splice(
      index + 1,
      0,
      copy,
    );

    setItems(next);

    onSelectBlock(
      copy.id,
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map(
        (item, index) => (
          <div
            key={item.id}
            className="group flex min-h-10 items-center gap-1 rounded-md border border-white/[0.07] bg-black/20 p-1"
          >
            <button
              type="button"
              onClick={() =>
                onSelectBlock(
                  item.id,
                )
              }
              className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left transition hover:bg-white/[0.04]"
            >
              {item.imageUrl ? (
                <span
                  className="h-7 w-9 shrink-0 rounded-[3px] border border-white/[0.08] bg-contain bg-center bg-no-repeat"
                  style={{
                    backgroundImage:
                      `url(${item.imageUrl})`,
                  }}
                />
              ) : (
                <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-[3px] border border-white/[0.08] bg-black/30">
                  <ImageIcon className="h-3 w-3 text-zinc-700" />
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-zinc-300">
                  {item.title ||
                    `Card ${index + 1}`}
                </span>

                <span className="mt-0.5 block text-[9px] text-zinc-700">
                  Edit card
                </span>
              </span>

              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-700 transition group-hover:text-zinc-400" />
            </button>

            <button
              type="button"
              disabled={
                index === 0
              }
              onClick={() =>
                moveItem(
                  item.id,
                  "up",
                )
              }
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-300 disabled:opacity-20"
              title="Move earlier"
            >
              <ArrowUp className="h-3 w-3" />
            </button>

            <button
              type="button"
              disabled={
                index ===
                items.length - 1
              }
              onClick={() =>
                moveItem(
                  item.id,
                  "down",
                )
              }
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-300 disabled:opacity-20"
              title="Move later"
            >
              <ArrowDown className="h-3 w-3" />
            </button>

            <details className="group/actions relative shrink-0">
              <summary
                className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-300 [&::-webkit-details-marker]:hidden"
                title="Card actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </summary>

              <div className="absolute right-0 top-8 z-30 w-32 rounded-md border border-white/[0.1] bg-[#111214] p-1 shadow-2xl">
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute(
                        "open",
                      );

                    duplicateItem(
                      item,
                    );
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded px-2 text-[10px] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
                >
                  <Copy className="h-3 w-3" />
                  Duplicate
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute(
                        "open",
                      );

                    setItems(
                      items.filter(
                        (candidate) =>
                          candidate.id !==
                          item.id,
                      ),
                    );
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded px-2 text-[10px] text-zinc-500 hover:bg-red-400/[0.08] hover:text-red-200"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>
            </details>
          </div>
        ),
      )}

      <button
        type="button"
        onClick={addItem}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/[0.1] text-[10px] text-zinc-500 transition hover:border-white/[0.18] hover:text-zinc-200"
      >
        <Plus className="h-3.5 w-3.5" />
        Add card
      </button>
    </div>
  );
}

function CardBlockInspectorPanel({
  site,
  section,
  blockId,
  onContentChange,
}: {
  site: SiteDocument;
  section: SiteSection;
  blockId: string;
  onContentChange: SiteContentChangeHandler;
}) {
  const items =
    getCardItems(section);

  const index =
    items.findIndex(
      (candidate) =>
        candidate.id === blockId,
    );

  const item =
    index >= 0
      ? items[index]
      : undefined;

  const [uploading, setUploading] =
    useState(false);

  const [uploadError, setUploadError] =
    useState<string | null>(null);

  if (!item) {
    return (
      <div className="p-4">
        <p className="text-[11px] text-zinc-500">
          This card could not be found.
        </p>
      </div>
    );
  }

  const variant =
    section.layout?.variant ??
    "grid";

  const legacyFeatured =
    item.emphasis === undefined &&
    variant === "featured" &&
    index === 0;

  const legacyExplicitFeatured =
    item.emphasis ===
    "featured";

  const inferredFeatured =
    legacyFeatured ||
    legacyExplicitFeatured;

  const span =
    item.span ??
    (
      inferredFeatured
        ? "full"
        : "one"
    );

  const featured =
    span === "full" ||
    inferredFeatured;

  const mediaPosition =
    item.mediaPosition ??
    (
      featured ||
      variant === "list"
        ? "left"
        : "top"
    );

  const mediaFit =
    item.mediaFit ??
    "cover";

  const mediaRatio =
    item.mediaRatio ??
    (
      item.mediaScale ===
      "dominant"
        ? "4:3"
        : "16:9"
    );

  const mediaShare =
    item.mediaShare ??
    (
      item.mediaScale ===
      "small"
        ? 38
        : item.mediaScale ===
            "dominant"
          ? 68
          : featured
            ? 62
            : 48
    );

  const mediaZoom =
    item.mediaZoom ??
    100;

  const mediaPositionX =
    item.mediaPositionX ??
    50;

  const mediaPositionY =
    item.mediaPositionY ??
    50;

  const minHeight =
    item.minHeight ??
    (
      featured
        ? 460
        : 320
    );

  const padding =
    item.padding ??
    (
      featured
        ? 40
        : 24
    );

  const titleSize =
    item.titleSize ??
    (
      featured
        ? 54
        : 30
    );

  const bodySize =
    item.bodySize ??
    (
      featured
        ? 13
        : 11
    );

  const textWidth =
    item.textWidth ??
    (
      featured
        ? 620
        : 520
    );

  function updateItem(
    patch: Partial<SiteCardItem>,
  ) {
    onContentChange(
      "items",
      items.map(
        (candidate) =>
          candidate.id ===
          item.id
            ? {
                ...candidate,
                ...patch,
              }
            : candidate,
      ),
    );
  }

  async function uploadImage(
    file: File,
  ) {
    setUploading(true);
    setUploadError(null);

    try {
      const result =
        await uploadSiteImage(
          file,
        );

      updateItem({
        imageUrl:
          result.url,
        imagePath:
          result.path,
      });
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to upload card image.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="border-b border-white/[0.07] px-4 py-3">
        <p className="truncate text-[15px] font-medium text-zinc-100">
          {item.title ||
            "Untitled card"}
        </p>

        <p className="mt-0.5 truncate text-[11px] text-zinc-600">
          {section.label} / Card
        </p>
      </div>

      <div className="space-y-5 p-4">
        <InspectorGroup title="Content">
          <div className="space-y-3">
            <TextInput
              id={`site-card-block-eyebrow-${item.id}`}
              label="Eyebrow"
              value={item.eyebrow}
              onChange={(value) =>
                updateItem({
                  eyebrow: value,
                })
              }
            />

            <TextInput
              id={`site-card-block-title-${item.id}`}
              label="Title"
              value={item.title}
              onChange={(value) =>
                updateItem({
                  title: value,
                })
              }
            />

            <TextAreaInput
              id={`site-card-block-body-${item.id}`}
              label="Description"
              value={item.body}
              rows={4}
              onChange={(value) =>
                updateItem({
                  body: value,
                })
              }
            />

            <TextInput
              id={`site-card-block-link-label-${item.id}`}
              label="Link label"
              value={item.linkLabel}
              onChange={(value) =>
                updateItem({
                  linkLabel:
                    value,
                })
              }
            />

            <SiteLinkTargetEditor
              idPrefix={`site-card-block-link-${item.id}`}
              site={site}
              pageId={
                item.linkPageId
              }
              href={
                item.linkHref
              }
              onPageIdChange={(value) =>
                updateItem({
                  linkPageId:
                    value,
                })
              }
              onHrefChange={(value) =>
                updateItem({
                  linkHref:
                    value,
                })
              }
            />
          </div>
        </InspectorGroup>

        <InspectorGroup title="Layout">
          <div>
            {variant !== "list" ? (
              <InspectorSegmentedControl
                label="Card width"
                value={span}
                options={[
                  {
                    label: "1 col",
                    value: "one",
                  },
                  {
                    label: "2 col",
                    value: "two",
                  },
                  {
                    label: "Full",
                    value: "full",
                  },
                ]}
                onChange={(value) =>
                  updateItem({
                    span: value,
                  })
                }
              />
            ) : null}

            <InspectorSegmentedControl
              label="Media layout"
              value={mediaPosition}
              options={[
                {
                  label: "Top",
                  value: "top",
                },
                {
                  label: "Left",
                  value: "left",
                },
                {
                  label: "Right",
                  value: "right",
                },
              ]}
              onChange={(value) =>
                updateItem({
                  mediaPosition:
                    value,
                })
              }
            />

            {mediaPosition !==
            "top" ? (
              <>
                <InspectorRangeField
                  label="Media width"
                  value={mediaShare}
                  min={25}
                  max={75}
                  step={1}
                  unit="%"
                  onChange={(value) =>
                    updateItem({
                      mediaShare:
                        value,
                    })
                  }
                />

                <InspectorRangeField
                  label="Card height"
                  value={minHeight}
                  min={220}
                  max={900}
                  step={10}
                  unit="px"
                  onChange={(value) =>
                    updateItem({
                      minHeight:
                        value,
                    })
                  }
                />
              </>
            ) : null}

            <InspectorRangeField
              label="Card padding"
              value={padding}
              min={0}
              max={96}
              step={2}
              unit="px"
              onChange={(value) =>
                updateItem({
                  padding: value,
                })
              }
            />
          </div>
        </InspectorGroup>

        <InspectorGroup title="Media">
          <div className="space-y-3">
            <div
              className="relative aspect-[16/9] overflow-hidden rounded-md border border-white/[0.08] bg-[var(--site-surface-strong)] bg-no-repeat"
              style={
                item.imageUrl
                  ? {
                      backgroundImage:
                        `url(${item.imageUrl})`,
                      backgroundSize:
                        mediaFit ===
                        "contain"
                          ? `${mediaZoom}%`
                          : "cover",
                      backgroundPosition:
                        `${mediaPositionX}% ${mediaPositionY}%`,
                    }
                  : undefined
              }
            >
              {!item.imageUrl ? (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-700">
                  No media
                </div>
              ) : null}
            </div>

            <div className="flex gap-2">
              <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-white/[0.1] px-3 text-[10px] text-zinc-400 transition hover:border-white/[0.2] hover:text-zinc-100">
                {uploading
                  ? "Uploading…"
                  : item.imageUrl
                    ? "Replace"
                    : "Upload"}

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  disabled={uploading}
                  className="hidden"
                  onChange={(event) => {
                    const input =
                      event.currentTarget;

                    const file =
                      input.files?.[0];

                    if (!file) return;

                    void uploadImage(
                      file,
                    ).finally(() => {
                      input.value =
                        "";
                    });
                  }}
                />
              </label>

              {item.imageUrl ? (
                <button
                  type="button"
                  onClick={() =>
                    updateItem({
                      imageUrl: "",
                      imagePath: "",
                    })
                  }
                  className="h-8 rounded-md border border-white/[0.08] px-3 text-[10px] text-zinc-500 transition hover:border-red-300/20 hover:text-red-200"
                >
                  Remove
                </button>
              ) : null}
            </div>

            {uploadError ? (
              <p className="text-[10px] leading-4 text-red-200/80">
                {uploadError}
              </p>
            ) : null}

            {item.imageUrl ? (
              <TextInput
                id={`site-card-block-alt-${item.id}`}
                label="Alt text"
                value={item.imageAlt}
                onChange={(value) =>
                  updateItem({
                    imageAlt:
                      value,
                  })
                }
              />
            ) : null}

            <InspectorSegmentedControl
              label="Fit"
              value={mediaFit}
              options={[
                {
                  label: "Contain",
                  value: "contain",
                },
                {
                  label: "Cover",
                  value: "cover",
                },
              ]}
              onChange={(value) =>
                updateItem({
                  mediaFit:
                    value,
                })
              }
            />

            <InspectorSelectRow
              label="Ratio"
              value={mediaRatio}
              options={[
                {
                  label: "Wide 16:9",
                  value: "16:9",
                },
                {
                  label: "Photo 3:2",
                  value: "3:2",
                },
                {
                  label: "Standard 4:3",
                  value: "4:3",
                },
                {
                  label: "Square 1:1",
                  value: "1:1",
                },
              ]}
              onChange={(value) =>
                updateItem({
                  mediaRatio:
                    value,
                })
              }
            />

            <InspectorRangeField
              label="Zoom"
              value={mediaZoom}
              min={50}
              max={180}
              step={1}
              unit="%"
              onChange={(value) =>
                updateItem({
                  mediaZoom:
                    value,
                })
              }
            />

            <InspectorRangeField
              label="Position X"
              value={mediaPositionX}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(value) =>
                updateItem({
                  mediaPositionX:
                    value,
                })
              }
            />

            <InspectorRangeField
              label="Position Y"
              value={mediaPositionY}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(value) =>
                updateItem({
                  mediaPositionY:
                    value,
                })
              }
            />
          </div>
        </InspectorGroup>

        <InspectorGroup title="Typography">
          <div>
            <InspectorRangeField
              label="Title size"
              value={titleSize}
              min={18}
              max={80}
              step={1}
              unit="px"
              onChange={(value) =>
                updateItem({
                  titleSize:
                    value,
                })
              }
            />

            <InspectorRangeField
              label="Body size"
              value={bodySize}
              min={9}
              max={22}
              step={1}
              unit="px"
              onChange={(value) =>
                updateItem({
                  bodySize:
                    value,
                })
              }
            />

            <InspectorRangeField
              label="Text width"
              value={textWidth}
              min={200}
              max={900}
              step={10}
              unit="px"
              onChange={(value) =>
                updateItem({
                  textWidth:
                    value,
                })
              }
            />
          </div>
        </InspectorGroup>
      </div>
    </>
  );
}

function StatsEditor({
  section,
  onContentChange,
}: {
  section: SiteSection;
  onContentChange: SiteContentChangeHandler;
}) {
  const items = getStatItems(section);

  function setItems(next: SiteStatItem[]) {
    onContentChange("items", next);
  }

  function updateItem(
    itemId: string,
    updater: (item: SiteStatItem) => SiteStatItem,
  ) {
    setItems(
      items.map((item) =>
        item.id === itemId ? updater(item) : item,
      ),
    );
  }

  function moveItem(
    itemId: string,
    direction: "up" | "down",
  ) {
    const index = items.findIndex(
      (item) => item.id === itemId,
    );
    if (index < 0) return;

    const destination =
      direction === "up" ? index - 1 : index + 1;

    if (
      destination < 0 ||
      destination >= items.length
    ) {
      return;
    }

    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(destination, 0, moved);
    setItems(next);
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="rounded-md border border-white/[0.08] bg-black/20 p-2.5"
        >
          <div className="grid grid-cols-[0.7fr_1.3fr] gap-2">
            <TextInput
              id={`site-stat-value-${item.id}`}
              label="Value"
              value={item.value}
              onChange={(value) =>
                updateItem(item.id, (current) => ({
                  ...current,
                  value,
                }))
              }
            />

            <TextInput
              id={`site-stat-label-${item.id}`}
              label="Label"
              value={item.label}
              onChange={(value) =>
                updateItem(item.id, (current) => ({
                  ...current,
                  label: value,
                }))
              }
            />
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2">
            <div className="flex gap-1">
              <button
                type="button"
                disabled={index === 0}
                onClick={() =>
                  moveItem(item.id, "up")
                }
                className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 disabled:opacity-25"
                title="Move earlier"
              >
                <ArrowUp className="h-3 w-3" />
              </button>

              <button
                type="button"
                disabled={index === items.length - 1}
                onClick={() =>
                  moveItem(item.id, "down")
                }
                className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 disabled:opacity-25"
                title="Move later"
              >
                <ArrowDown className="h-3 w-3" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = [...items];
                  next.splice(index + 1, 0, {
                    ...item,
                    id: crypto.randomUUID(),
                  });
                  setItems(next);
                }}
                className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 hover:text-zinc-200"
                title="Duplicate stat"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setItems(
                  items.filter(
                    (candidate) =>
                      candidate.id !== item.id,
                  ),
                )
              }
              className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 hover:border-red-300/20 hover:text-red-200"
              title="Delete stat"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          setItems([
            ...items,
            {
              id: crypto.randomUUID(),
              value: "100",
              label: "New metric",
            },
          ])
        }
        className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-white/[0.1] text-[11px] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100"
      >
        <Plus className="h-3.5 w-3.5" />
        Add stat
      </button>
    </div>
  );
}

function FaqEditor({
  section,
  onContentChange,
}: {
  section: SiteSection;
  onContentChange: SiteContentChangeHandler;
}) {
  const items = getFaqItems(section);

  function setItems(next: SiteFaqItem[]) {
    onContentChange("items", next);
  }

  function updateItem(
    itemId: string,
    updater: (item: SiteFaqItem) => SiteFaqItem,
  ) {
    setItems(
      items.map((item) =>
        item.id === itemId ? updater(item) : item,
      ),
    );
  }

  function moveItem(
    itemId: string,
    direction: "up" | "down",
  ) {
    const index = items.findIndex(
      (item) => item.id === itemId,
    );
    if (index < 0) return;

    const nextIndex =
      direction === "up" ? index - 1 : index + 1;

    if (nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    setItems(next);
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <details
          key={item.id}
          className="group rounded-md border border-white/[0.08] bg-black/20"
          open={items.length <= 2}
        >
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-2.5 text-[11px] text-zinc-300 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition group-open:rotate-90" />
            <span className="min-w-0 flex-1 truncate">
              {item.question || `Question ${index + 1}`}
            </span>
            <span className="text-[10px] text-zinc-700">
              {index + 1}
            </span>
          </summary>

          <div className="space-y-3 border-t border-white/[0.06] p-2.5">
            <TextInput
              id={`site-faq-question-${item.id}`}
              label="Question"
              value={item.question}
              onChange={(value) =>
                updateItem(item.id, (current) => ({
                  ...current,
                  question: value,
                }))
              }
            />

            <TextAreaInput
              id={`site-faq-answer-${item.id}`}
              label="Answer"
              value={item.answer}
              rows={4}
              onChange={(value) =>
                updateItem(item.id, (current) => ({
                  ...current,
                  answer: value,
                }))
              }
            />

            <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveItem(item.id, "up")}
                  className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 disabled:opacity-25"
                  title="Move earlier"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(item.id, "down")}
                  className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 disabled:opacity-25"
                  title="Move later"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const copy = {
                      ...item,
                      id: crypto.randomUUID(),
                    };
                    const next = [...items];
                    next.splice(index + 1, 0, copy);
                    setItems(next);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 hover:text-zinc-200"
                  title="Duplicate question"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  setItems(
                    items.filter(
                      (candidate) =>
                        candidate.id !== item.id,
                    ),
                  )
                }
                className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 hover:border-red-300/20 hover:text-red-200"
                title="Delete question"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </details>
      ))}

      <button
        type="button"
        onClick={() =>
          setItems([
            ...items,
            {
              id: crypto.randomUUID(),
              question: "New question",
              answer: "Add an answer.",
            },
          ])
        }
        className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-white/[0.1] text-[11px] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100"
      >
        <Plus className="h-3.5 w-3.5" />
        Add question
      </button>
    </div>
  );
}

function TestimonialsEditor({
  section,
  onContentChange,
}: {
  section: SiteSection;
  onContentChange: SiteContentChangeHandler;
}) {
  const items = getTestimonialItems(section);

  function setItems(next: SiteTestimonialItem[]) {
    onContentChange("items", next);
  }

  function updateItem(
    itemId: string,
    updater: (
      item: SiteTestimonialItem,
    ) => SiteTestimonialItem,
  ) {
    setItems(
      items.map((item) =>
        item.id === itemId ? updater(item) : item,
      ),
    );
  }

  function moveItem(
    itemId: string,
    direction: "up" | "down",
  ) {
    const index = items.findIndex(
      (item) => item.id === itemId,
    );
    if (index < 0) return;

    const nextIndex =
      direction === "up" ? index - 1 : index + 1;

    if (nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    setItems(next);
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <details
          key={item.id}
          className="group rounded-md border border-white/[0.08] bg-black/20"
          open={items.length <= 2}
        >
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-2.5 text-[11px] text-zinc-300 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition group-open:rotate-90" />

            <span className="min-w-0 flex-1 truncate">
              {item.name || `Testimonial ${index + 1}`}
            </span>

            <span className="text-[10px] text-zinc-700">
              {index + 1}
            </span>
          </summary>

          <div className="space-y-3 border-t border-white/[0.06] p-2.5">
            <TextAreaInput
              id={`site-testimonial-quote-${item.id}`}
              label="Quote"
              value={item.quote}
              rows={4}
              onChange={(value) =>
                updateItem(item.id, (current) => ({
                  ...current,
                  quote: value,
                }))
              }
            />

            <div className="grid grid-cols-2 gap-2">
              <TextInput
                id={`site-testimonial-name-${item.id}`}
                label="Name"
                value={item.name}
                onChange={(value) =>
                  updateItem(item.id, (current) => ({
                    ...current,
                    name: value,
                  }))
                }
              />

              <TextInput
                id={`site-testimonial-role-${item.id}`}
                label="Role"
                value={item.role}
                onChange={(value) =>
                  updateItem(item.id, (current) => ({
                    ...current,
                    role: value,
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveItem(item.id, "up")}
                  className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 disabled:opacity-25"
                  title="Move earlier"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(item.id, "down")}
                  className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 disabled:opacity-25"
                  title="Move later"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const copy = {
                      ...item,
                      id: crypto.randomUUID(),
                    };
                    const next = [...items];
                    next.splice(index + 1, 0, copy);
                    setItems(next);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 hover:text-zinc-200"
                  title="Duplicate testimonial"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  setItems(
                    items.filter(
                      (candidate) =>
                        candidate.id !== item.id,
                    ),
                  )
                }
                className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 hover:border-red-300/20 hover:text-red-200"
                title="Delete testimonial"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </details>
      ))}

      <button
        type="button"
        onClick={() =>
          setItems([
            ...items,
            {
              id: crypto.randomUUID(),
              quote: "Add a testimonial.",
              name: "Person name",
              role: "Customer",
            },
          ])
        }
        className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-white/[0.1] text-[11px] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100"
      >
        <Plus className="h-3.5 w-3.5" />
        Add testimonial
      </button>
    </div>
  );
}

function GalleryEditor({
  section,
  onContentChange,
}: {
  section: SiteSection;
  onContentChange: SiteContentChangeHandler;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const items = getGalleryItems(section);

  function setItems(nextItems: SiteGalleryItem[]) {
    onContentChange("items", nextItems);
  }

  async function upload(files: File[]) {
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      const uploaded: SiteGalleryItem[] = [];

      for (const file of files) {
        const result = await uploadSiteImage(file);
        uploaded.push({
          id: crypto.randomUUID(),
          url: result.url,
          path: result.path,
          alt: "",
        });
      }

      setItems([...items, ...uploaded]);
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to upload gallery image.",
      );
    } finally {
      setUploading(false);
    }
  }

  function updateItem(
    itemId: string,
    updater: (item: SiteGalleryItem) => SiteGalleryItem,
  ) {
    setItems(
      items.map((item) =>
        item.id === itemId ? updater(item) : item,
      ),
    );
  }

  function moveItem(itemId: string, direction: "up" | "down") {
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) return;

    const destination = direction === "up" ? index - 1 : index + 1;
    if (destination < 0 || destination >= items.length) return;

    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(destination, 0, item);
    setItems(next);
  }

  return (
    <div className="space-y-3">
      <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-white/[0.1] px-3 text-[11px] text-zinc-300 transition hover:border-white/[0.2] hover:text-zinc-100">
        {uploading ? "Uploading…" : "Add images"}
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          disabled={uploading}
          className="hidden"
          onChange={(event) => {
            const input = event.currentTarget;
            const files = Array.from(input.files ?? []);
            if (files.length === 0) return;

            void upload(files).finally(() => {
              input.value = "";
            });
          }}
        />
      </label>

      {uploadError ? (
        <p className="text-[11px] leading-4 text-red-200/80">
          {uploadError}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/[0.1] px-3 py-6 text-center text-[11px] text-zinc-600">
          No gallery images yet.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-md border border-white/[0.08] bg-black/20 p-2"
            >
              <div className="flex gap-2">
                <div
                  className="h-14 w-16 shrink-0 rounded-sm border border-white/[0.08] bg-black bg-cover bg-center"
                  style={{ backgroundImage: `url(${item.url})` }}
                />

                <div className="min-w-0 flex-1">
                  <input
                    value={item.alt}
                    placeholder="Alt text"
                    onChange={(event) =>
                      updateItem(item.id, (current) => ({
                        ...current,
                        alt: event.target.value,
                      }))
                    }
                    className="h-7 w-full rounded-md border border-white/[0.08] bg-black/25 px-2 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-white/[0.18]"
                  />

                  <div className="mt-2 flex gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveItem(item.id, "up")}
                      className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 disabled:opacity-25"
                      title="Move earlier"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>

                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      onClick={() => moveItem(item.id, "down")}
                      className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 disabled:opacity-25"
                      title="Move later"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setItems(
                          items.filter(
                            (candidate) => candidate.id !== item.id,
                          ),
                        )
                      }
                      className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 hover:border-red-300/20 hover:text-red-200"
                      title="Remove image"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InspectorContentPanel({
  site,
  section,
  onContentChange,
  onSelectBlock,
  onSourceChange,
  sourceStatus,
  sourceError,
  sourceProducts,
  sourceServices,
  selectedProductIds,
  selectedServiceIds,
  onLoadSourceListings,
  onToggleSourceListing,
}: {
  site: SiteDocument;
  section: SiteSection;
  onContentChange: SiteContentChangeHandler;
  onSelectBlock: (blockId: string) => void;
  onSourceChange: (
    source: SiteDataSource,
  ) => void;
  sourceStatus: "idle" | "loading" | "loaded" | "error";
  sourceError: string | null;
  sourceProducts: SourceListing[];
  sourceServices: SourceListing[];
  selectedProductIds: string[];
  selectedServiceIds: string[];
  onLoadSourceListings: () => void;
  onToggleSourceListing: (
    listingId: string,
    listingType: "product" | "service",
  ) => void;
}) {
  if (section.type === "hero") {
    return (
      <div className="space-y-4">
        <InspectorGroup title="Text">
          <TextInput
            id="site-hero-eyebrow"
            label="Eyebrow"
            value={getContentString(section, "eyebrow")}
            onChange={(value) => onContentChange("eyebrow", value)}
          />
          <TextAreaInput
            id="site-hero-headline"
            label="Heading"
            value={getContentString(section, "headline")}
            onChange={(value) => onContentChange("headline", value)}
            rows={3}
          />
          <TextAreaInput
            id="site-hero-intro"
            label="Description"
            value={getContentString(section, "intro")}
            onChange={(value) => onContentChange("intro", value)}
            rows={4}
          />
        </InspectorGroup>
        <InspectorGroup title="Action">
          <CtaFields
            site={site}
            labelId="site-hero-cta-label"
            hrefId="site-hero-cta-href"
            label={getContentString(section, "primaryCtaLabel")}
            href={getContentString(section, "primaryCtaHref")}
            pageId={getContentString(section, "primaryCtaPageId")}
            labelKey="primaryCtaLabel"
            hrefKey="primaryCtaHref"
            pageIdKey="primaryCtaPageId"
            onContentChange={onContentChange}
          />
        </InspectorGroup>
        <InspectorGroup title="Media">
          <MediaEditor
            section={section}
            onContentChange={onContentChange}
          />
        </InspectorGroup>
      </div>
    );
  }

  if (section.type === "split") {
    return (
      <div className="space-y-4">
        <InspectorGroup title="Text">
          <TextInput
            id="site-split-eyebrow"
            label="Eyebrow"
            value={getContentString(section, "eyebrow")}
            onChange={(value) =>
              onContentChange("eyebrow", value)
            }
          />

          <TextAreaInput
            id="site-split-heading"
            label="Heading"
            value={getContentString(section, "heading")}
            onChange={(value) =>
              onContentChange("heading", value)
            }
            rows={3}
          />

          <TextAreaInput
            id="site-split-body"
            label="Body"
            value={getContentString(section, "body")}
            onChange={(value) =>
              onContentChange("body", value)
            }
            rows={5}
          />
        </InspectorGroup>

        <InspectorGroup title="Action">
          <CtaFields
            site={site}
            labelId="site-split-button-label"
            hrefId="site-split-button"
            label={getContentString(section, "buttonLabel")}
            href={getContentString(section, "buttonHref")}
            pageId={getContentString(section, "buttonPageId")}
            labelKey="buttonLabel"
            hrefKey="buttonHref"
            pageIdKey="buttonPageId"
            onContentChange={onContentChange}
          />
        </InspectorGroup>

        <InspectorGroup title="Media">
          <MediaEditor
            section={section}
            onContentChange={onContentChange}
          />
        </InspectorGroup>
      </div>
    );
  }

  if (
    section.type ===
    "products"
  ) {
    const sourceKind =
      section.source.kind ===
      "catalog"
        ? "catalog"
        : "source";

    return (
      <div className="space-y-4">
        <InspectorGroup title="Content">
          <TextInput
            id="site-section-heading"
            label="Heading"
            value={getContentString(
              section,
              "heading",
            )}
            onChange={(value) =>
              onContentChange(
                "heading",
                value,
              )
            }
          />

          <TextAreaInput
            id="site-section-intro"
            label="Intro"
            value={getContentString(
              section,
              "intro",
            )}
            onChange={(value) =>
              onContentChange(
                "intro",
                value,
              )
            }
            rows={3}
          />
        </InspectorGroup>

        <InspectorGroup title="Product source">
          <InspectorSegmentedControl
            label="Source"
            value={sourceKind}
            options={[
              {
                label: "Catalog",
                value: "catalog",
              },
              {
                label: "Source",
                value: "source",
              },
            ]}
            onChange={(value) => {
              if (
                value ===
                "catalog"
              ) {
                onSourceChange({
                  kind: "catalog",
                  mode: "all",
                });
                return;
              }

              onSourceChange({
                kind: "source",
                listingType:
                  "product",
                mode:
                  "selected",
                listingIds: [],
              });
            }}
          />
        </InspectorGroup>

        {section.source.kind ===
        "catalog" ? (
          <CatalogProductSelector
            site={site}
            section={section}
            onSourceChange={
              onSourceChange
            }
          />
        ) : (
          <SourceListingSelector
            section={section}
            sourceStatus={
              sourceStatus
            }
            sourceError={
              sourceError
            }
            sourceProducts={
              sourceProducts
            }
            sourceServices={
              sourceServices
            }
            selectedProductIds={
              selectedProductIds
            }
            selectedServiceIds={
              selectedServiceIds
            }
            onLoadSourceListings={
              onLoadSourceListings
            }
            onToggleSourceListing={
              onToggleSourceListing
            }
          />
        )}
      </div>
    );
  }

  if (
    section.type ===
    "services"
  ) {
    return (
      <div className="space-y-4">
        <InspectorGroup title="Content">
          <TextInput
            id="site-section-heading"
            label="Heading"
            value={getContentString(
              section,
              "heading",
            )}
            onChange={(value) =>
              onContentChange(
                "heading",
                value,
              )
            }
          />

          <TextAreaInput
            id="site-section-intro"
            label="Intro"
            value={getContentString(
              section,
              "intro",
            )}
            onChange={(value) =>
              onContentChange(
                "intro",
                value,
              )
            }
            rows={3}
          />
        </InspectorGroup>

        <SourceListingSelector
          section={section}
          sourceStatus={
            sourceStatus
          }
          sourceError={
            sourceError
          }
          sourceProducts={
            sourceProducts
          }
          sourceServices={
            sourceServices
          }
          selectedProductIds={
            selectedProductIds
          }
          selectedServiceIds={
            selectedServiceIds
          }
          onLoadSourceListings={
            onLoadSourceListings
          }
          onToggleSourceListing={
            onToggleSourceListing
          }
        />
      </div>
    );
  }

  if (section.type === "cards") {
    return (
      <div className="space-y-4">
        <InspectorGroup title="Section">
          <TextInput
            id="site-cards-heading"
            label="Heading"
            value={getContentString(section, "heading")}
            onChange={(value) =>
              onContentChange("heading", value)
            }
          />

          <TextAreaInput
            id="site-cards-intro"
            label="Intro"
            value={getContentString(section, "intro")}
            onChange={(value) =>
              onContentChange("intro", value)
            }
            rows={3}
          />
        </InspectorGroup>

        <InspectorGroup title="Items">
          <CardsNavigator
            section={section}
            onContentChange={onContentChange}
            onSelectBlock={onSelectBlock}
          />
        </InspectorGroup>
      </div>
    );
  }

  if (section.type === "stats") {
    return (
      <div className="space-y-4">
        <InspectorGroup title="Section">
          <TextInput
            id="site-stats-heading"
            label="Heading"
            value={getContentString(section, "heading")}
            onChange={(value) =>
              onContentChange("heading", value)
            }
          />

          <TextAreaInput
            id="site-stats-intro"
            label="Intro"
            value={getContentString(section, "intro")}
            onChange={(value) =>
              onContentChange("intro", value)
            }
            rows={3}
          />
        </InspectorGroup>

        <InspectorGroup title="Stats">
          <StatsEditor
            section={section}
            onContentChange={onContentChange}
          />
        </InspectorGroup>
      </div>
    );
  }

  if (section.type === "faq") {
    return (
      <div className="space-y-4">
        <InspectorGroup title="Section">
          <TextInput
            id="site-faq-heading"
            label="Heading"
            value={getContentString(section, "heading")}
            onChange={(value) =>
              onContentChange("heading", value)
            }
          />

          <TextAreaInput
            id="site-faq-intro"
            label="Intro"
            value={getContentString(section, "intro")}
            onChange={(value) =>
              onContentChange("intro", value)
            }
            rows={3}
          />
        </InspectorGroup>

        <InspectorGroup title="Questions">
          <FaqEditor
            section={section}
            onContentChange={onContentChange}
          />
        </InspectorGroup>
      </div>
    );
  }

  if (section.type === "testimonials") {
    return (
      <div className="space-y-4">
        <InspectorGroup title="Section">
          <TextInput
            id="site-testimonials-heading"
            label="Heading"
            value={getContentString(section, "heading")}
            onChange={(value) =>
              onContentChange("heading", value)
            }
          />

          <TextAreaInput
            id="site-testimonials-intro"
            label="Intro"
            value={getContentString(section, "intro")}
            onChange={(value) =>
              onContentChange("intro", value)
            }
            rows={3}
          />
        </InspectorGroup>

        <InspectorGroup title="Testimonials">
          <TestimonialsEditor
            section={section}
            onContentChange={onContentChange}
          />
        </InspectorGroup>
      </div>
    );
  }

  if (section.type === "content") {
    return (
      <InspectorGroup title="Content">
        <TextInput
          id="site-section-heading"
          label="Heading"
          value={getContentString(section, "heading")}
          onChange={(value) => onContentChange("heading", value)}
        />
        <TextAreaInput
          id="site-section-body"
          label="Body"
          value={getContentString(section, "body")}
          onChange={(value) => onContentChange("body", value)}
          rows={4}
        />
      </InspectorGroup>
    );
  }

  if (section.type === "gallery") {
    return (
      <div className="space-y-4">
        <InspectorGroup title="Content">
          <TextInput
            id="site-gallery-heading"
            label="Heading"
            value={getContentString(section, "heading")}
            onChange={(value) => onContentChange("heading", value)}
          />
        </InspectorGroup>

        <InspectorGroup title="Images">
          <GalleryEditor
            section={section}
            onContentChange={onContentChange}
          />
        </InspectorGroup>
      </div>
    );
  }

  if (section.type === "embed") {
    return (
      <div className="space-y-4">
        <InspectorGroup title="Section">
          <TextInput
            id="site-embed-heading"
            label="Heading"
            value={getContentString(
              section,
              "heading",
            )}
            onChange={(value) =>
              onContentChange(
                "heading",
                value,
              )
            }
          />

          <TextAreaInput
            id="site-embed-intro"
            label="Intro"
            value={getContentString(
              section,
              "intro",
            )}
            onChange={(value) =>
              onContentChange(
                "intro",
                value,
              )
            }
            rows={3}
          />
        </InspectorGroup>

        <InspectorGroup title="Embed">
          <EmbedEditor
            section={section}
            onContentChange={
              onContentChange
            }
          />
        </InspectorGroup>
      </div>
    );
  }

  if (section.type === "media") {
    return (
      <InspectorGroup title="Media">
        <MediaEditor
          section={section}
          onContentChange={onContentChange}
        />
      </InspectorGroup>
    );
  }

  if (section.type === "contact") {
    const formEnabled =
      section.content.formEnabled === true;

    return (
      <div className="space-y-4">
        <InspectorGroup title="Contact">
          <TextInput
            id="site-contact-heading"
            label="Heading"
            value={getContentString(section, "heading")}
            onChange={(value) =>
              onContentChange("heading", value)
            }
          />

          <TextAreaInput
            id="site-contact-body"
            label="Body"
            value={getContentString(section, "body")}
            onChange={(value) =>
              onContentChange("body", value)
            }
            rows={3}
          />

          <ToggleRow
            label="Contact form"
            checked={formEnabled}
            description={
              formEnabled
                ? "Visitors can send inquiries directly through this Site."
                : "Use the Contact section as a normal linked action."
            }
            onChange={(checked) =>
              onContentChange("formEnabled", checked)
            }
          />
        </InspectorGroup>

        {formEnabled ? (
          <InspectorGroup title="Form">
            <TextInput
              id="site-contact-name-label"
              label="Name field"
              value={
                getContentString(section, "nameLabel") ||
                "Name"
              }
              onChange={(value) =>
                onContentChange("nameLabel", value)
              }
            />

            <TextInput
              id="site-contact-email-label"
              label="Email field"
              value={
                getContentString(section, "emailLabel") ||
                "Email"
              }
              onChange={(value) =>
                onContentChange("emailLabel", value)
              }
            />

            <TextInput
              id="site-contact-message-label"
              label="Message field"
              value={
                getContentString(section, "messageLabel") ||
                "Message"
              }
              onChange={(value) =>
                onContentChange("messageLabel", value)
              }
            />

            <TextInput
              id="site-contact-submit-label"
              label="Submit button"
              value={
                getContentString(section, "buttonLabel") ||
                "Send message"
              }
              onChange={(value) =>
                onContentChange("buttonLabel", value)
              }
            />

            <TextAreaInput
              id="site-contact-success-message"
              label="Success message"
              value={
                getContentString(
                  section,
                  "successMessage",
                ) ||
                "Thanks — your message was sent."
              }
              onChange={(value) =>
                onContentChange(
                  "successMessage",
                  value,
                )
              }
              rows={2}
            />
          </InspectorGroup>
        ) : (
          <InspectorGroup title="Action">
            <CtaFields
              site={site}
              labelId="site-contact-button-label"
              hrefId="site-contact-button-href"
              label={getContentString(section, "buttonLabel")}
              href={getContentString(section, "buttonHref")}
              pageId={getContentString(section, "buttonPageId")}
              labelKey="buttonLabel"
              hrefKey="buttonHref"
              pageIdKey="buttonPageId"
              onContentChange={onContentChange}
            />
          </InspectorGroup>
        )}
      </div>
    );
  }

  if (section.type === "cta") {
    return (
      <InspectorGroup title="Content">
        <TextInput
          id="site-action-heading"
          label="Heading"
          value={getContentString(section, "heading")}
          onChange={(value) =>
            onContentChange("heading", value)
          }
        />
        <TextAreaInput
          id="site-action-body"
          label="Body"
          value={getContentString(section, "body")}
          onChange={(value) =>
            onContentChange("body", value)
          }
          rows={3}
        />
        <CtaFields
          site={site}
          labelId="site-action-button-label"
          hrefId="site-action-button-href"
          label={getContentString(section, "buttonLabel")}
          href={getContentString(section, "buttonHref")}
          pageId={getContentString(section, "buttonPageId")}
          labelKey="buttonLabel"
          hrefKey="buttonHref"
          pageIdKey="buttonPageId"
          onContentChange={onContentChange}
        />
      </InspectorGroup>
    );
  }

  return (
    <p className="text-[12px] leading-5 text-zinc-500">
      This section is represented in the generic Site document.
    </p>
  );
}

function ContentNodeInspectorPanel({
  site,
  section,
  node,
  onContentChange,
}: {
  site: SiteDocument;
  section: SiteSection;
  node: SiteContentNodeId;
  onContentChange: SiteContentChangeHandler;
}) {
  const nodeLabel =
    node === "button" ? "Button" : node === "media" ? "Media" : "Text";

  if (node === "text") {
    if (section.type === "hero") {
      return (
        <>
          <div className="border-b border-white/[0.07] px-4 py-3">
            <p className="truncate text-[15px] font-medium text-zinc-100">
              Text
            </p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-600">
              {section.label} / Text
            </p>
          </div>

          <div className="space-y-3 p-4">
            <TextInput
              id="site-hero-node-eyebrow"
              label="Eyebrow"
              value={getContentString(section, "eyebrow")}
              onChange={(value) => onContentChange("eyebrow", value)}
            />
            <TextAreaInput
              id="site-hero-node-headline"
              label="Heading"
              value={getContentString(section, "headline")}
              onChange={(value) => onContentChange("headline", value)}
              rows={3}
            />
            <TextAreaInput
              id="site-hero-node-intro"
              label="Description"
              value={getContentString(section, "intro")}
              onChange={(value) => onContentChange("intro", value)}
              rows={4}
            />
          </div>
        </>
      );
    }

    if (section.type === "split") {
      return (
        <>
          <div className="border-b border-white/[0.07] px-4 py-3">
            <p className="truncate text-[15px] font-medium text-zinc-100">
              Text
            </p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-600">
              {section.label} / Text
            </p>
          </div>

          <div className="space-y-3 p-4">
            <TextInput
              id="site-split-node-eyebrow"
              label="Eyebrow"
              value={getContentString(section, "eyebrow")}
              onChange={(value) =>
                onContentChange("eyebrow", value)
              }
            />

            <TextAreaInput
              id="site-split-node-heading"
              label="Heading"
              value={getContentString(section, "heading")}
              onChange={(value) =>
                onContentChange("heading", value)
              }
              rows={3}
            />

            <TextAreaInput
              id="site-split-node-body"
              label="Body"
              value={getContentString(section, "body")}
              onChange={(value) =>
                onContentChange("body", value)
              }
              rows={5}
            />
          </div>
        </>
      );
    }

    if (section.type === "cards") {
      return (
        <>
          <div className="border-b border-white/[0.07] px-4 py-3">
            <p className="truncate text-[15px] font-medium text-zinc-100">
              Section text
            </p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-600">
              {section.label} / Section text
            </p>
          </div>

          <div className="space-y-3 p-4">
            <TextInput
              id="site-cards-node-heading"
              label="Heading"
              value={getContentString(section, "heading")}
              onChange={(value) =>
                onContentChange("heading", value)
              }
            />

            <TextAreaInput
              id="site-cards-node-intro"
              label="Intro"
              value={getContentString(section, "intro")}
              onChange={(value) =>
                onContentChange("intro", value)
              }
              rows={4}
            />
          </div>
        </>
      );
    }

    if (
      section.type === "stats" ||
      section.type === "faq" ||
      section.type === "testimonials" ||
      section.type === "embed"
    ) {
      return (
        <>
          <div className="border-b border-white/[0.07] px-4 py-3">
            <p className="truncate text-[15px] font-medium text-zinc-100">
              Section text
            </p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-600">
              {section.label} / Section text
            </p>
          </div>

          <div className="space-y-3 p-4">
            <TextInput
              id="site-trust-node-heading"
              label="Heading"
              value={getContentString(section, "heading")}
              onChange={(value) =>
                onContentChange("heading", value)
              }
            />

            <TextAreaInput
              id="site-trust-node-intro"
              label="Intro"
              value={getContentString(section, "intro")}
              onChange={(value) =>
                onContentChange("intro", value)
              }
              rows={4}
            />
          </div>
        </>
      );
    }

    if (section.type === "cta" || section.type === "contact") {
      return (
        <>
          <div className="border-b border-white/[0.07] px-4 py-3">
            <p className="truncate text-[15px] font-medium text-zinc-100">
              Text
            </p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-600">
              {section.label} / Text
            </p>
          </div>

          <div className="space-y-3 p-4">
            <TextInput
              id="site-action-node-heading"
              label="Heading"
              value={getContentString(section, "heading")}
              onChange={(value) => onContentChange("heading", value)}
            />
            <TextAreaInput
              id="site-action-node-body"
              label="Body"
              value={getContentString(section, "body")}
              onChange={(value) => onContentChange("body", value)}
              rows={4}
            />
          </div>
        </>
      );
    }
  }

  if (node === "button") {
    const labelKey =
      section.type === "hero"
        ? "primaryCtaLabel"
        : "buttonLabel";
    const hrefKey =
      section.type === "hero"
        ? "primaryCtaHref"
        : "buttonHref";
    const pageIdKey =
      section.type === "hero"
        ? "primaryCtaPageId"
        : "buttonPageId";
    const contactFormEnabled =
      section.type === "contact" &&
      section.content.formEnabled === true;

    if (
      section.type === "hero" ||
      section.type === "split" ||
      section.type === "cta" ||
      section.type === "contact"
    ) {
      return (
        <>
          <div className="border-b border-white/[0.07] px-4 py-3">
            <p className="truncate text-[15px] font-medium text-zinc-100">
              Button
            </p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-600">
              {section.label} / Button
            </p>
          </div>

          <div className="space-y-3 p-4">
            <TextInput
              id="site-button-node-label"
              label="Label"
              value={getContentString(section, labelKey)}
              onChange={(value) => onContentChange(labelKey, value)}
            />
            {contactFormEnabled ? (
              <p className="rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 text-[11px] leading-4 text-zinc-500">
                This button submits the Contact form.
              </p>
            ) : (
              <SiteLinkTargetEditor
                idPrefix="site-button-node"
                site={site}
                pageId={getContentString(section, pageIdKey)}
                href={getContentString(section, hrefKey)}
                onPageIdChange={(value) =>
                  onContentChange(pageIdKey, value)
                }
                onHrefChange={(value) =>
                  onContentChange(hrefKey, value)
                }
              />
            )}
          </div>
        </>
      );
    }
  }

  if (
    node === "media" &&
    section.type === "embed"
  ) {
    return (
      <>
        <div className="border-b border-white/[0.07] px-4 py-3">
          <p className="truncate text-[15px] font-medium text-zinc-100">
            Embed
          </p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-600">
            {section.label} / Embed
          </p>
        </div>

        <div className="p-4">
          <EmbedEditor
            section={section}
            onContentChange={
              onContentChange
            }
          />
        </div>
      </>
    );
  }

  if (
    node === "media" &&
    (
      section.type === "hero" ||
      section.type === "split" ||
      section.type === "media"
    )
  ) {
    return (
      <>
        <div className="border-b border-white/[0.07] px-4 py-3">
          <p className="truncate text-[15px] font-medium text-zinc-100">
            Media
          </p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-600">
            {section.label} / Media
          </p>
        </div>

        <div className="p-4">
          <MediaEditor
            section={section}
            onContentChange={onContentChange}
          />
        </div>
      </>
    );
  }

  if (node === "media" && section.type === "gallery") {
    return (
      <>
        <div className="border-b border-white/[0.07] px-4 py-3">
          <p className="truncate text-[15px] font-medium text-zinc-100">
            Images
          </p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-600">
            {section.label} / Images
          </p>
        </div>

        <div className="p-4">
          <GalleryEditor
            section={section}
            onContentChange={onContentChange}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="border-b border-white/[0.07] px-4 py-3">
        <p className="truncate text-[15px] font-medium text-zinc-100">
          {nodeLabel}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-zinc-600">
          {section.label} / {nodeLabel}
        </p>
      </div>
      <div className="p-4">
        <p className="text-[12px] leading-5 text-zinc-500">
          This content node is not editable for this section yet.
        </p>
      </div>
    </>
  );
}


function CatalogProductSelector({
  site,
  section,
  onSourceChange,
}: {
  site: SiteDocument;
  section: SiteSection;
  onSourceChange: (
    source: SiteDataSource,
  ) => void;
}) {
  if (
    section.source.kind !==
    "catalog"
  ) {
    return null;
  }

  const source =
    section.source;

  const catalog =
    site.catalog ?? {
      collections: [],
      items: [],
    };

  const selectedIds =
    source.itemIds ?? [];

  const visibleItems =
    catalog.items
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder -
          b.sortOrder,
      );

  return (
    <InspectorGroup title="Catalog">
      <div>
        <InspectorSegmentedControl
          label="Show"
          value={source.mode}
          options={[
            {
              label: "All",
              value: "all",
            },
            {
              label: "Collection",
              value: "collection",
            },
            {
              label: "Selected",
              value: "selected",
            },
          ]}
          onChange={(mode) => {
            if (
              mode ===
              "collection"
            ) {
              onSourceChange({
                kind: "catalog",
                mode,
                collectionId:
                  source.collectionId ??
                  catalog
                    .collections[0]
                    ?.id,
              });
              return;
            }

            if (
              mode ===
              "selected"
            ) {
              onSourceChange({
                kind: "catalog",
                mode,
                itemIds:
                  source.itemIds ??
                  [],
              });
              return;
            }

            onSourceChange({
              kind: "catalog",
              mode: "all",
            });
          }}
        />

        {source.mode ===
        "collection" ? (
          catalog.collections
            .length > 0 ? (
            <InspectorSelectRow
              label="Collection"
              value={
                source.collectionId ??
                catalog
                  .collections[0]
                  ?.id ??
                ""
              }
              options={catalog.collections
                .slice()
                .sort(
                  (a, b) =>
                    a.sortOrder -
                    b.sortOrder,
                )
                .map(
                  (
                    collection,
                  ) => ({
                    label:
                      collection.title,
                    value:
                      collection.id,
                  }),
                )}
              onChange={(
                collectionId,
              ) =>
                onSourceChange({
                  kind: "catalog",
                  mode:
                    "collection",
                  collectionId,
                })
              }
            />
          ) : (
            <p className="px-1 py-3 text-[10px] leading-4 text-zinc-600">
              Create a Catalog
              collection first.
            </p>
          )
        ) : null}

        {source.mode ===
        "selected" ? (
          <div className="mt-2 space-y-1.5">
            {visibleItems.length >
            0 ? (
              visibleItems.map(
                (item) => {
                  const selected =
                    selectedIds.includes(
                      item.id,
                    );

                  const collection =
                    catalog.collections.find(
                      (
                        candidate,
                      ) =>
                        candidate.id ===
                        item.collectionId,
                    );

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const itemIds =
                          selected
                            ? selectedIds.filter(
                                (
                                  id,
                                ) =>
                                  id !==
                                  item.id,
                              )
                            : [
                                ...selectedIds,
                                item.id,
                              ];

                        onSourceChange({
                          kind:
                            "catalog",
                          mode:
                            "selected",
                          itemIds,
                        });
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-md border p-2 text-left transition ${
                        selected
                          ? "border-white/20 bg-white/[0.055]"
                          : "border-white/[0.06] bg-black/15 hover:border-white/[0.12]"
                      }`}
                    >
                      <span
                        className="h-10 w-8 shrink-0 rounded-[3px] bg-white/[0.04] bg-cover bg-center"
                        style={{
                          backgroundImage:
                            item.imageUrl
                              ? `url(${item.imageUrl})`
                              : undefined,
                        }}
                      />

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-medium text-zinc-300">
                          {
                            item.title
                          }
                        </span>

                        <span className="mt-0.5 block truncate text-[9px] text-zinc-700">
                          {collection?.title ??
                            "Unsorted"}
                        </span>
                      </span>

                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                          selected
                            ? "border-white/60 bg-white"
                            : "border-white/15"
                        }`}
                      >
                        {selected ? (
                          <span className="h-1.5 w-1.5 rounded-[1px] bg-black" />
                        ) : null}
                      </span>
                    </button>
                  );
                },
              )
            ) : (
              <p className="px-1 py-3 text-[10px] leading-4 text-zinc-600">
                Add products to
                Catalog first.
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-3 border-t border-white/[0.045] pt-3">
          <p className="text-[9px] leading-4 text-zinc-700">
            {catalog.items.length}{" "}
            Catalog item
            {catalog.items.length ===
            1
              ? ""
              : "s"}{" "}
            available
          </p>
        </div>
      </div>
    </InspectorGroup>
  );
}


function SourceListingSelector({
  section,
  sourceStatus,
  sourceError,
  sourceProducts,
  sourceServices,
  selectedProductIds,
  selectedServiceIds,
  onLoadSourceListings,
  onToggleSourceListing,
}: {
  section: SiteSection;
  sourceStatus: "idle" | "loading" | "loaded" | "error";
  sourceError: string | null;
  sourceProducts: SourceListing[];
  sourceServices: SourceListing[];
  selectedProductIds: string[];
  selectedServiceIds: string[];
  onLoadSourceListings: () => void;
  onToggleSourceListing: (
    listingId: string,
    listingType: "product" | "service",
  ) => void;
}) {
  if (section.source.kind !== "source") {
    return null;
  }

  const listingType = section.source.listingType;
  const listings = listingType === "service" ? sourceServices : sourceProducts;
  const selectedIds =
    listingType === "service" ? selectedServiceIds : selectedProductIds;

  if (listingType !== "product" && listingType !== "service") {
    return (
      <p className="text-[12px] leading-5 text-zinc-500">
        Source posts are not editable in this slice.
      </p>
    );
  }

  return (
    <InspectorGroup title={listingType === "service" ? "Services" : "Products"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] text-zinc-500">
            Source
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {selectedIds.length} selected · {listings.length} loaded
          </p>
        </div>

        <button
          type="button"
          onClick={onLoadSourceListings}
          disabled={sourceStatus === "loading"}
          className="inline-flex h-7 items-center gap-2 rounded-md border border-white/[0.1] px-2.5 text-[11px] text-zinc-300 transition hover:border-white/[0.2] disabled:cursor-not-allowed disabled:text-zinc-600"
        >
          {sourceStatus === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Package className="h-3.5 w-3.5" />
          )}
          Load
        </button>
      </div>

      {sourceStatus === "error" ? (
        <p className="mt-3 rounded-md border border-red-400/20 bg-red-400/5 px-3 py-2 text-[11px] leading-5 text-red-200/80">
          {sourceError}
        </p>
      ) : null}

      {sourceStatus === "loaded" && listings.length === 0 ? (
        <p className="mt-3 rounded-md border border-white/[0.08] bg-black/20 px-3 py-3 text-[11px] leading-5 text-zinc-500">
          No {listingType} listings found in Source.
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {listings.map((listing) => {
          const card = normalizeSourceListingCardProps(listing);
          const selected = selectedIds.includes(listing.id);

          return (
            <button
              key={listing.id}
              type="button"
              onClick={() => onToggleSourceListing(listing.id, listingType)}
              className={`flex w-full items-center gap-3 rounded-md border px-2.5 py-2 text-left transition ${
                selected
                  ? "border-white/25 bg-white/[0.07]"
                  : "border-white/[0.08] bg-black/20 hover:border-white/[0.16]"
              }`}
            >
              <span
                className="h-9 w-9 shrink-0 rounded-sm border border-white/[0.07] bg-white/[0.03] bg-cover bg-center"
                style={
                  card.image
                    ? { backgroundImage: `url(${card.image})` }
                    : undefined
                }
              />
              <span
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                  selected ? "border-white/60 bg-white" : "border-white/20"
                }`}
              >
                {selected ? (
                  <span className="h-1.5 w-1.5 rounded-sm bg-black" />
                ) : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-zinc-200">
                  {listing.title}
                </span>
                <span className="mt-1 block text-[10px] text-zinc-500">
                  {card.priceLabel}
                  {card.secondaryLabel ? ` · ${card.secondaryLabel}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {sourceStatus === "idle" ? (
        <p className="mt-3 text-[11px] leading-5 text-zinc-600">
          Load Source listings to choose {listingType}s for this section.
        </p>
      ) : null}
    </InspectorGroup>
  );
}

function InspectorSelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: {
    label: string;
    value: T;
  }[];
  onChange: (value: T) => void;
}) {
  const active =
    options.find(
      (option) =>
        option.value === value,
    ) ?? options[0];

  return (
    <label className="group relative flex h-8 cursor-pointer items-center gap-3 border-b border-white/[0.045] px-1 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-500 transition group-hover:text-zinc-400">
        {label}
      </span>

      <span className="max-w-[140px] truncate text-right text-[10px] text-zinc-300">
        {active?.label ?? value}
      </span>

      <ChevronRight className="h-3 w-3 shrink-0 text-zinc-700 transition group-hover:text-zinc-500" />

      <select
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value as T,
          )
        }
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function InspectorSegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: {
    label: string;
    value: T;
  }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="px-1 py-2">
      <div className="mb-2 text-[10px] text-zinc-500">
        {label}
      </div>
      <div className="grid grid-flow-col auto-cols-fr overflow-hidden rounded-md border border-white/[0.08] bg-black/25 p-0.5">
        {options.map((option) => {
          const selected =
            option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                onChange(option.value)
              }
              className={`h-7 min-w-0 rounded-[4px] px-2 text-[10px] transition ${
                selected
                  ? "bg-white text-black"
                  : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InspectorRangeField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const clampedValue = Math.max(
    min,
    Math.min(max, value),
  );

  function commit(nextValue: number) {
    if (!Number.isFinite(nextValue)) return;
    onChange(
      Math.max(
        min,
        Math.min(max, nextValue),
      ),
    );
  }

  return (
    <div className="px-1 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-500">
          {label}
        </span>
        <span className="flex h-6 items-center rounded-md border border-white/[0.08] bg-black/25 px-2">
          <input
            value={clampedValue}
            type="number"
            min={min}
            max={max}
            step={step}
            onChange={(event) =>
              commit(
                Number(event.target.value),
              )
            }
            className="w-12 bg-transparent text-right text-[10px] tabular-nums text-zinc-200 outline-none"
            aria-label={label}
          />
          {unit ? (
            <span className="ml-1 text-[9px] text-zinc-600">
              {unit}
            </span>
          ) : null}
        </span>
      </div>
      <input
        value={clampedValue}
        min={min}
        max={max}
        step={step}
        type="range"
        onChange={(event) =>
          commit(Number(event.target.value))
        }
        className="h-1.5 w-full accent-zinc-100"
        aria-label={label}
      />
    </div>
  );
}

function InspectorSpacingControl({
  values,
  onChange,
}: {
  values: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  onChange: (
    side: "top" | "right" | "bottom" | "left",
    value: number,
  ) => void;
}) {
  const sides = [
    { id: "top", label: "T" },
    { id: "right", label: "R" },
    { id: "bottom", label: "B" },
    { id: "left", label: "L" },
  ] as const;

  return (
    <div className="px-1 py-2.5">
      <div className="mb-2 text-[10px] text-zinc-500">
        Padding
      </div>
      <div className="rounded-md border border-white/[0.08] bg-black/25 p-2">
        <div className="relative mx-auto mb-3 h-16 w-24 rounded-sm border border-dashed border-white/20">
          <div className="absolute left-1/2 top-1 -translate-x-1/2 text-[9px] tabular-nums text-zinc-400">
            {values.top}
          </div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] tabular-nums text-zinc-400">
            {values.right}
          </div>
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] tabular-nums text-zinc-400">
            {values.bottom}
          </div>
          <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] tabular-nums text-zinc-400">
            {values.left}
          </div>
          <div className="absolute inset-5 rounded-[3px] bg-white/[0.08]" />
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {sides.map((side) => (
            <label
              key={side.id}
              className="min-w-0"
            >
              <span className="mb-1 block text-center text-[8px] text-zinc-600">
                {side.label}
              </span>
              <input
                value={values[side.id]}
                type="number"
                min={0}
                max={240}
                step={1}
                onChange={(event) =>
                  onChange(
                    side.id,
                    Math.max(
                      0,
                      Math.min(
                        240,
                        Number(
                          event.target.value,
                        ) || 0,
                      ),
                    ),
                  )
                }
                className="h-7 w-full rounded-[4px] border border-white/[0.08] bg-black/25 px-1 text-center text-[10px] tabular-nums text-zinc-200 outline-none focus:border-white/20"
                aria-label={`${side.label} padding`}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}


function sectionUsesPreciseEditor(
  section: SiteSection,
) {
  return (
    section.type === "hero" ||
    section.type === "content" ||
    section.type === "split" ||
    section.type === "cards" ||
    section.type === "cta" ||
    section.type === "contact"
  );
}

function sectionTypographyDefaults(
  section: SiteSection,
) {
  if (section.type === "hero") {
    return {
      headingSize: 72,
      headingWidth: 780,
      bodySize: 14,
      bodyWidth: 520,
      textGap: 20,
    };
  }

  if (section.type === "cards") {
    return {
      headingSize: 64,
      headingWidth: 1000,
      bodySize: 14,
      bodyWidth: 680,
      textGap: 18,
    };
  }

  if (section.type === "contact") {
    return {
      headingSize: 52,
      headingWidth: 720,
      bodySize: 14,
      bodyWidth: 560,
      textGap: 18,
    };
  }

  if (section.type === "cta") {
    return {
      headingSize: 40,
      headingWidth: 760,
      bodySize: 14,
      bodyWidth: 620,
      textGap: 14,
    };
  }

  return {
    headingSize: 48,
    headingWidth: 760,
    bodySize: 14,
    bodyWidth: 620,
    textGap: 18,
  };
}

function preciseSectionPadding(
  section: SiteSection,
) {
  const layout =
    section.layout ?? {};

  const fallback =
    layout.spacing === "compact"
      ? 32
      : layout.spacing ===
          "spacious"
        ? 72
        : 56;

  return {
    top:
      layout.paddingTopPx ??
      fallback,
    right:
      layout.paddingRightPx ??
      48,
    bottom:
      layout.paddingBottomPx ??
      fallback,
    left:
      layout.paddingLeftPx ??
      48,
  };
}

function InspectorDesignPanel({
  section,
  onLayoutChange,
  onStyleChange,
}: {
  section: SiteSection;
  onLayoutChange: (
    key: keyof SiteSectionLayoutConfig,
    value:
      SiteSectionLayoutConfig[
        keyof SiteSectionLayoutConfig
      ],
  ) => void;
  onStyleChange: (
    key: keyof SiteSectionStyleConfig,
    value:
      SiteSectionStyleConfig[
        keyof SiteSectionStyleConfig
      ],
  ) => void;
}) {
  const definition =
    getSectionDefinition(section.type);

  const supportsVariant =
    Boolean(
      definition &&
        definition.variants.length > 1,
    );

  const supportsColumns =
    Boolean(
      definition?.supportsColumns,
    );

  const supportsWidth =
    Boolean(
      definition?.supportsWidth,
    );

  const supportsListingDisplay =
    Boolean(
      definition?.supportsListingDisplay,
    );

  const supportsAlignment =
    section.layout?.alignment !==
    undefined;

  const currentVariant =
    section.layout?.variant ??
    definition?.defaultLayout.variant ??
    definition?.variants[0]?.id ??
    "";

  const divider =
    section.style?.divider ??
    "none";

  const preciseSectionControls =
    sectionUsesPreciseEditor(
      section,
    );

  const supportsItemAppearance =
    section.type === "gallery" ||
    section.type === "products" ||
    section.type === "services";

  const sectionLayout =
    section.layout ?? {};

  const typographyDefaults =
    sectionTypographyDefaults(
      section,
    );

  const sharedPadding =
    preciseSectionPadding(
      section,
    );

  if (section.type === "cards") {
    const layout = section.layout ?? {};
    const width =
      layout.width ?? "wide";
    const heightMode =
      layout.heightMode ?? "auto";
    const fallbackPadding =
      layout.spacing === "compact"
        ? 20
        : layout.spacing === "normal"
          ? 40
          : 48;
    const paddingValues = {
      top:
        layout.paddingTopPx ??
        fallbackPadding,
      right:
        layout.paddingRightPx ??
        48,
      bottom:
        layout.paddingBottomPx ??
        fallbackPadding,
      left:
        layout.paddingLeftPx ??
        48,
    };

    return (
      <div className="space-y-5">
        <InspectorGroup title="Layout">
          <div>
            {supportsVariant &&
            definition ? (
              <InspectorSelectRow
                label="Variant"
                value={currentVariant}
                options={definition.variants.map(
                  (variant) => ({
                    label:
                      variant.label,
                    value:
                      variant.id,
                  }),
                )}
                onChange={(value) =>
                  onLayoutChange(
                    "variant",
                    value,
                  )
                }
              />
            ) : null}

            <InspectorSegmentedControl
              label="Columns"
              value={String(
                layout.columns ?? 3,
              )}
              options={[
                {
                  label: "2",
                  value: "2",
                },
                {
                  label: "3",
                  value: "3",
                },
                {
                  label: "4",
                  value: "4",
                },
              ]}
              onChange={(value) =>
                onLayoutChange(
                  "columns",
                  Number(value) as
                    | 2
                    | 3
                    | 4,
                )
              }
            />

            {supportsAlignment ? (
              <InspectorSelectRow
                label="Alignment"
                value={
                  layout.alignment ?? "left"
                }
                options={[
                  {
                    label: "Left",
                    value: "left",
                  },
                  {
                    label: "Center",
                    value: "center",
                  },
                ]}
                onChange={(value) =>
                  onLayoutChange(
                    "alignment",
                    value,
                  )
                }
              />
            ) : null}
          </div>
        </InspectorGroup>

        <InspectorGroup title="Dimensions">
          <InspectorSegmentedControl
            label="Width"
            value={width}
            options={[
              {
                label: "Narrow",
                value: "narrow",
              },
              {
                label: "Normal",
                value: "normal",
              },
              {
                label: "Wide",
                value: "wide",
              },
              {
                label: "Full",
                value: "full",
              },
            ]}
            onChange={(value) =>
              onLayoutChange(
                "width",
                value,
              )
            }
          />

          <InspectorRangeField
            label="Content width"
            value={
              layout.contentWidth ??
              (width === "narrow"
                ? 900
                : width === "normal"
                  ? 1180
                  : width === "full"
                    ? 1600
                    : 1320)
            }
            min={520}
            max={1800}
            step={10}
            unit="px"
            onChange={(value) =>
              onLayoutChange(
                "contentWidth",
                value,
              )
            }
          />

          <InspectorSegmentedControl
            label="Height"
            value={heightMode}
            options={[
              {
                label: "Auto",
                value: "auto",
              },
              {
                label: "Min",
                value: "minimum",
              },
              {
                label: "Screen",
                value: "screen",
              },
            ]}
            onChange={(value) =>
              onLayoutChange(
                "heightMode",
                value,
              )
            }
          />

          {heightMode === "minimum" ? (
            <InspectorRangeField
              label="Min height"
              value={
                layout.minHeight ?? 560
              }
              min={240}
              max={1200}
              step={10}
              unit="px"
              onChange={(value) =>
                onLayoutChange(
                  "minHeight",
                  value,
                )
              }
            />
          ) : null}
        </InspectorGroup>

        <InspectorGroup title="Spacing">
          <InspectorSpacingControl
            values={paddingValues}
            onChange={(side, value) => {
              const key =
                side === "top"
                  ? "paddingTopPx"
                  : side === "right"
                    ? "paddingRightPx"
                    : side === "bottom"
                      ? "paddingBottomPx"
                      : "paddingLeftPx";

              onLayoutChange(
                key as keyof SiteSectionLayoutConfig,
                value,
              );
            }}
          />

          <InspectorRangeField
            label="Gap"
            value={layout.gap ?? 20}
            min={0}
            max={96}
            step={1}
            unit="px"
            onChange={(value) =>
              onLayoutChange(
                "gap",
                value,
              )
            }
          />
        </InspectorGroup>


        <InspectorGroup title="Typography">
          <InspectorRangeField
            label="Heading size"
            value={
              layout.headingSize ??
              typographyDefaults.headingSize
            }
            min={24}
            max={120}
            step={1}
            unit="px"
            onChange={(value) =>
              onLayoutChange(
                "headingSize",
                value,
              )
            }
          />

          <InspectorRangeField
            label="Heading width"
            value={
              layout.headingWidth ??
              typographyDefaults.headingWidth
            }
            min={320}
            max={1400}
            step={10}
            unit="px"
            onChange={(value) =>
              onLayoutChange(
                "headingWidth",
                value,
              )
            }
          />

          <InspectorRangeField
            label="Intro size"
            value={
              layout.bodySize ??
              typographyDefaults.bodySize
            }
            min={10}
            max={24}
            step={1}
            unit="px"
            onChange={(value) =>
              onLayoutChange(
                "bodySize",
                value,
              )
            }
          />

          <InspectorRangeField
            label="Intro width"
            value={
              layout.bodyWidth ??
              typographyDefaults.bodyWidth
            }
            min={260}
            max={1000}
            step={10}
            unit="px"
            onChange={(value) =>
              onLayoutChange(
                "bodyWidth",
                value,
              )
            }
          />

          <InspectorRangeField
            label="Heading → intro"
            value={
              layout.textGap ??
              typographyDefaults.textGap
            }
            min={0}
            max={64}
            step={1}
            unit="px"
            onChange={(value) =>
              onLayoutChange(
                "textGap",
                value,
              )
            }
          />
        </InspectorGroup>

        <InspectorGroup title="Appearance">
          <div>
            <InspectorSegmentedControl
              label="Card frame"
              value={
                section.style?.itemFrame ??
                "none"
              }
              options={[
                {
                  label: "None",
                  value: "none",
                },
                {
                  label: "Outline",
                  value: "outline",
                },
                {
                  label: "Surface",
                  value: "surface",
                },
              ]}
              onChange={(value) =>
                onStyleChange(
                  "itemFrame",
                  value,
                )
              }
            />

            <InspectorRangeField
              label="Card corners"
              value={
                section.style?.itemRadius ??
                12
              }
              min={0}
              max={48}
              step={1}
              unit="px"
              onChange={(value) =>
                onStyleChange(
                  "itemRadius",
                  value,
                )
              }
            />

            <InspectorSelectRow
              label="Background"
              value={
                section.style
                  ?.background ??
                "default"
              }
              options={[
                {
                  label: "Site background",
                  value: "default",
                },
                {
                  label: "Surface",
                  value: "plain",
                },
                {
                  label: "Muted surface",
                  value: "muted",
                },
                {
                  label: "Strong surface",
                  value: "dark",
                },
                {
                  label: "Contrast",
                  value: "contrast",
                },
              ]}
              onChange={(value) =>
                onStyleChange(
                  "background",
                  value,
                )
              }
            />

            <InspectorSelectRow
              label="Divider"
              value={divider}
              options={[
                {
                  label: "None",
                  value: "none",
                },
                {
                  label: "Top",
                  value: "top",
                },
                {
                  label: "Bottom",
                  value: "bottom",
                },
                {
                  label: "Top & bottom",
                  value: "both",
                },
              ]}
              onChange={(value) =>
                onStyleChange(
                  "divider",
                  value,
                )
              }
            />

            {divider !== "none" ? (
              <InspectorSelectRow
                label="Divider weight"
                value={
                  section.style
                    ?.dividerStrength ??
                  "hairline"
                }
                options={[
                  {
                    label: "Hairline",
                    value: "hairline",
                  },
                  {
                    label: "Strong",
                    value: "strong",
                  },
                ]}
                onChange={(value) =>
                  onStyleChange(
                    "dividerStrength",
                    value,
                  )
                }
              />
            ) : null}
          </div>
        </InspectorGroup>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* APPEARANCE */}
      <InspectorGroup title="Appearance">
        <div>
          <InspectorSelectRow
            label="Background"
            value={
              section.style?.background ??
              "default"
            }
            options={[
              {
                label: "Site background",
                value: "default",
              },
              {
                label: "Surface",
                value: "plain",
              },
              {
                label: "Muted surface",
                value: "muted",
              },
              {
                label: "Strong surface",
                value: "dark",
              },
              {
                label: "Contrast",
                value: "contrast",
              },
            ]}
            onChange={(value) =>
              onStyleChange(
                "background",
                value,
              )
            }
          />

          <InspectorSelectRow
            label="Divider"
            value={divider}
            options={[
              {
                label: "None",
                value: "none",
              },
              {
                label: "Top",
                value: "top",
              },
              {
                label: "Bottom",
                value: "bottom",
              },
              {
                label: "Top & bottom",
                value: "both",
              },
            ]}
            onChange={(value) =>
              onStyleChange(
                "divider",
                value,
              )
            }
          />

          {divider !== "none" ? (
            <InspectorSelectRow
              label="Divider weight"
              value={
                section.style
                  ?.dividerStrength ??
                "hairline"
              }
              options={[
                {
                  label: "Hairline",
                  value: "hairline",
                },
                {
                  label: "Strong",
                  value: "strong",
                },
              ]}
              onChange={(value) =>
                onStyleChange(
                  "dividerStrength",
                  value,
                )
              }
            />
          ) : null}
        </div>
      </InspectorGroup>


      {/* LAYOUT */}
      {supportsVariant ||
      supportsColumns ||
      supportsWidth ||
      supportsAlignment ? (
        <InspectorGroup title="Layout">
          <div>
            {supportsVariant &&
            definition ? (
              <InspectorSelectRow
                label="Variant"
                value={currentVariant}
                options={definition.variants.map(
                  (variant) => ({
                    label:
                      variant.label,
                    value:
                      variant.id,
                  }),
                )}
                onChange={(value) =>
                  onLayoutChange(
                    "variant",
                    value,
                  )
                }
              />
            ) : null}

            {(
              (
                section.type === "hero" &&
                currentVariant === "split"
              ) ||
              (
                section.type === "split" &&
                currentVariant !== "stacked"
              )
            ) ? (
              <InspectorRangeField
                label="Media share"
                value={
                  sectionLayout.mediaShare ??
                  66
                }
                min={25}
                max={75}
                step={1}
                unit="%"
                onChange={(value) =>
                  onLayoutChange(
                    "mediaShare",
                    value,
                  )
                }
              />
            ) : null}

            {supportsWidth &&
            !preciseSectionControls ? (
              <InspectorSelectRow
                label="Width"
                value={
                  section.layout?.width ??
                  "normal"
                }
                options={[
                  {
                    label: "Narrow",
                    value: "narrow",
                  },
                  {
                    label: "Normal",
                    value: "normal",
                  },
                  {
                    label: "Wide",
                    value: "wide",
                  },
                  {
                    label: "Full",
                    value: "full",
                  },
                ]}
                onChange={(value) =>
                  onLayoutChange(
                    "width",
                    value,
                  )
                }
              />
            ) : null}

            {supportsAlignment ? (
              <InspectorSelectRow
                label="Alignment"
                value={
                  section.layout
                    ?.alignment ??
                  "left"
                }
                options={[
                  {
                    label: "Left",
                    value: "left",
                  },
                  {
                    label: "Center",
                    value: "center",
                  },
                ]}
                onChange={(value) =>
                  onLayoutChange(
                    "alignment",
                    value,
                  )
                }
              />
            ) : null}

            {supportsColumns ? (
              <InspectorSelectRow
                label="Columns"
                value={String(
                  section.layout?.columns ??
                    3,
                )}
                options={[
                  {
                    label: "2",
                    value: "2",
                  },
                  {
                    label: "3",
                    value: "3",
                  },
                  {
                    label: "4",
                    value: "4",
                  },
                ]}
                onChange={(value) =>
                  onLayoutChange(
                    "columns",
                    Number(value) as
                      | 2
                      | 3
                      | 4,
                  )
                }
              />
            ) : null}
          </div>
        </InspectorGroup>
      ) : null}


      {supportsItemAppearance ? (
        <InspectorGroup
          title={
            section.type === "gallery"
              ? "Images"
              : section.type === "services"
                ? "Service cards"
                : "Product cards"
          }
        >
          <div>
            <InspectorSegmentedControl
              label="Frame"
              value={
                section.style?.itemFrame ??
                "none"
              }
              options={[
                {
                  label: "None",
                  value: "none",
                },
                {
                  label: "Outline",
                  value: "outline",
                },
                {
                  label: "Surface",
                  value: "surface",
                },
              ]}
              onChange={(value) =>
                onStyleChange(
                  "itemFrame",
                  value,
                )
              }
            />

            <InspectorRangeField
              label="Corners"
              value={
                section.style?.itemRadius ??
                12
              }
              min={0}
              max={48}
              step={1}
              unit="px"
              onChange={(value) =>
                onStyleChange(
                  "itemRadius",
                  value,
                )
              }
            />

            <InspectorSegmentedControl
              label="Media fit"
              value={
                section.style?.itemMediaFit ??
                "cover"
              }
              options={[
                {
                  label: "Contain",
                  value: "contain",
                },
                {
                  label: "Cover",
                  value: "cover",
                },
              ]}
              onChange={(value) =>
                onStyleChange(
                  "itemMediaFit",
                  value,
                )
              }
            />

            <InspectorSelectRow
              label="Media ratio"
              value={
                section.style?.itemMediaRatio ??
                (
                  section.type === "gallery"
                    ? "auto"
                    : "4:3"
                )
              }
              options={[
                {
                  label: "Auto",
                  value: "auto",
                },
                {
                  label: "Wide 16:9",
                  value: "16:9",
                },
                {
                  label: "Photo 3:2",
                  value: "3:2",
                },
                {
                  label: "Standard 4:3",
                  value: "4:3",
                },
                {
                  label: "Square 1:1",
                  value: "1:1",
                },
                {
                  label: "Portrait 4:5",
                  value: "4:5",
                },
              ]}
              onChange={(value) =>
                onStyleChange(
                  "itemMediaRatio",
                  value,
                )
              }
            />

            <InspectorRangeField
              label="Gap"
              value={
                sectionLayout.gap ??
                28
              }
              min={0}
              max={96}
              step={1}
              unit="px"
              onChange={(value) =>
                onLayoutChange(
                  "gap",
                  value,
                )
              }
            />

            {section.type === "products" ||
            section.type === "services" ? (
              <InspectorRangeField
                label="Card padding"
                value={
                  section.style?.itemPadding ??
                  20
                }
                min={0}
                max={64}
                step={1}
                unit="px"
                onChange={(value) =>
                  onStyleChange(
                    "itemPadding",
                    value,
                  )
                }
              />
            ) : null}
          </div>
        </InspectorGroup>
      ) : null}

      {/* PRECISE SECTION SHELL */}
      {preciseSectionControls ? (
        <>
          <InspectorGroup title="Dimensions">
            <InspectorSegmentedControl
              label="Width"
              value={
                sectionLayout.width ??
                "wide"
              }
              options={[
                {
                  label: "Narrow",
                  value: "narrow",
                },
                {
                  label: "Normal",
                  value: "normal",
                },
                {
                  label: "Wide",
                  value: "wide",
                },
                {
                  label: "Full",
                  value: "full",
                },
              ]}
              onChange={(value) =>
                onLayoutChange(
                  "width",
                  value,
                )
              }
            />

            <InspectorRangeField
              label="Content width"
              value={
                sectionLayout.contentWidth ??
                (
                  sectionLayout.width ===
                  "narrow"
                    ? 900
                    : sectionLayout.width ===
                        "normal"
                      ? 1180
                      : sectionLayout.width ===
                          "full"
                        ? 1600
                        : 1320
                )
              }
              min={520}
              max={1800}
              step={10}
              unit="px"
              onChange={(value) =>
                onLayoutChange(
                  "contentWidth",
                  value,
                )
              }
            />

            <InspectorSegmentedControl
              label="Height"
              value={
                sectionLayout.heightMode ??
                "auto"
              }
              options={[
                {
                  label: "Auto",
                  value: "auto",
                },
                {
                  label: "Min",
                  value: "minimum",
                },
                {
                  label: "Screen",
                  value: "screen",
                },
              ]}
              onChange={(value) =>
                onLayoutChange(
                  "heightMode",
                  value,
                )
              }
            />

            {sectionLayout.heightMode ===
            "minimum" ? (
              <InspectorRangeField
                label="Min height"
                value={
                  sectionLayout.minHeight ??
                  520
                }
                min={180}
                max={1200}
                step={10}
                unit="px"
                onChange={(value) =>
                  onLayoutChange(
                    "minHeight",
                    value,
                  )
                }
              />
            ) : null}
          </InspectorGroup>

          <InspectorGroup title="Spacing">
            <InspectorSpacingControl
              values={
                sharedPadding
              }
              onChange={(
                side,
                value,
              ) => {
                const key =
                  side === "top"
                    ? "paddingTopPx"
                    : side === "right"
                      ? "paddingRightPx"
                      : side === "bottom"
                        ? "paddingBottomPx"
                        : "paddingLeftPx";

                onLayoutChange(
                  key as keyof SiteSectionLayoutConfig,
                  value,
                );
              }}
            />

            <InspectorRangeField
              label="Internal gap"
              value={
                sectionLayout.gap ??
                28
              }
              min={0}
              max={120}
              step={1}
              unit="px"
              onChange={(value) =>
                onLayoutChange(
                  "gap",
                  value,
                )
              }
            />
          </InspectorGroup>

          <InspectorGroup title="Typography">
            <InspectorRangeField
              label="Heading size"
              value={
                sectionLayout.headingSize ??
                typographyDefaults.headingSize
              }
              min={18}
              max={120}
              step={1}
              unit="px"
              onChange={(value) =>
                onLayoutChange(
                  "headingSize",
                  value,
                )
              }
            />

            <InspectorRangeField
              label="Heading width"
              value={
                sectionLayout.headingWidth ??
                typographyDefaults.headingWidth
              }
              min={240}
              max={1400}
              step={10}
              unit="px"
              onChange={(value) =>
                onLayoutChange(
                  "headingWidth",
                  value,
                )
              }
            />

            <InspectorRangeField
              label="Body size"
              value={
                sectionLayout.bodySize ??
                typographyDefaults.bodySize
              }
              min={9}
              max={28}
              step={1}
              unit="px"
              onChange={(value) =>
                onLayoutChange(
                  "bodySize",
                  value,
                )
              }
            />

            <InspectorRangeField
              label="Body width"
              value={
                sectionLayout.bodyWidth ??
                typographyDefaults.bodyWidth
              }
              min={240}
              max={1200}
              step={10}
              unit="px"
              onChange={(value) =>
                onLayoutChange(
                  "bodyWidth",
                  value,
                )
              }
            />

            <InspectorRangeField
              label="Heading → body"
              value={
                sectionLayout.textGap ??
                typographyDefaults.textGap
              }
              min={0}
              max={64}
              step={1}
              unit="px"
              onChange={(value) =>
                onLayoutChange(
                  "textGap",
                  value,
                )
              }
            />
          </InspectorGroup>
        </>
      ) : (
        <InspectorGroup title="Section">
          <InspectorSelectRow
            label="Size"
            value={
              section.layout?.size ??
              "default"
            }
            options={[
              {
                label: "Default",
                value: "default",
              },
              {
                label: "Compact",
                value: "compact",
              },
              {
                label: "Standard",
                value: "standard",
              },
              {
                label: "Large",
                value: "large",
              },
            ]}
            onChange={(value) =>
              onLayoutChange(
                "size",
                value,
              )
            }
          />
        </InspectorGroup>
      )}

      {/* COMMERCE DISPLAY */}
      {supportsListingDisplay ? (
        <InspectorGroup title="Display">
          <ToggleRow
            label="Show price"
            checked={
              section.style
                ?.showPrice !== false
            }
            onChange={(checked) =>
              onStyleChange(
                "showPrice",
                checked,
              )
            }
          />

          <ToggleRow
            label="Show description"
            checked={
              section.style
                ?.showDescription !==
              false
            }
            onChange={(checked) =>
              onStyleChange(
                "showDescription",
                checked,
              )
            }
          />
        </InspectorGroup>
      ) : null}
    </div>
  );
}


function ThemeColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(
    value.toUpperCase(),
  );

  useEffect(() => {
    setDraft(value.toUpperCase());
  }, [value]);

  function commit() {
    if (
      /^#[0-9a-fA-F]{6}$/.test(
        draft,
      )
    ) {
      onChange(draft);
      return;
    }

    setDraft(value.toUpperCase());
  }

  return (
    <div className="flex h-8 items-center gap-2 px-2">
      <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-400">
        {label}
      </span>

      <input
        value={draft}
        onChange={(event) =>
          setDraft(
            event.target.value.toUpperCase(),
          )
        }
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        spellCheck={false}
        className="w-[58px] bg-transparent text-right font-mono text-[9px] text-zinc-600 outline-none focus:text-zinc-300"
      />

      <label
        className="relative h-4 w-4 shrink-0 cursor-pointer overflow-hidden rounded-[4px] border border-white/[0.14]"
        style={{
          backgroundColor: value,
        }}
      >
        <input
          type="color"
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value,
            )
          }
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}


function ThemeRangeControl({
  label,
  value,
  min,
  max,
  step,
  suffix = "px",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-500">
          {label}
        </span>

        <span className="font-mono text-[9px] text-zinc-600">
          {value}
          {suffix}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(
            Number(
              event.target.value,
            ),
          )
        }
        className="mt-1 h-3 w-full accent-zinc-300"
      />
    </div>
  );
}


function PageInspector({
  site,
  page,
  onOpenSettings,
  onDuplicate,
  onSetHomepage,
  onDelete,
}: {
  site: SiteDocument;
  page: SiteDocument["pages"][number];
  onOpenSettings: () => void;
  onDuplicate: () => void;
  onSetHomepage: () => void;
  onDelete: () => void;
}) {
  const isHomePage =
    page.id === site.homePageId;

  return (
    <>
      <div className="border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-zinc-100">
              {page.title}
            </p>

            <p className="mt-0.5 text-[11px] text-zinc-600">
              Page
            </p>
          </div>

          {isHomePage ? (
            <span className="rounded-full border border-white/[0.08] px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-zinc-500">
              Home
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <InspectorGroup title="Page">
          <div className="rounded-md border border-white/[0.07] bg-black/20 px-3 py-2.5">
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-600">
              Public path
            </p>

            <p className="mt-1 break-all text-[11px] text-zinc-300">
              {getSitePageHref(
                site,
                page.id,
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-white/[0.09] text-[11px] text-zinc-300 transition hover:border-white/[0.17] hover:bg-white/[0.035] hover:text-zinc-100"
          >
            <Pencil className="h-3.5 w-3.5" />
            Page settings
          </button>
        </InspectorGroup>

        <InspectorGroup title="Actions">
          <button
            type="button"
            onClick={onDuplicate}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-zinc-500 transition hover:bg-white/[0.035] hover:text-zinc-200"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>

          {!isHomePage ? (
            <>
              <button
                type="button"
                onClick={onSetHomepage}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-zinc-500 transition hover:bg-white/[0.035] hover:text-zinc-200"
              >
                <Home className="h-3.5 w-3.5" />
                Set as homepage
              </button>

              <button
                type="button"
                onClick={onDelete}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-zinc-600 transition hover:bg-red-400/[0.05] hover:text-red-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </>
          ) : null}
        </InspectorGroup>
      </div>
    </>
  );
}


function SiteInquiriesInspector({
  inquiries,
  status,
  error,
  onRefresh,
}: {
  inquiries: SiteInquiry[];
  status: InquiryLoadStatus;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium text-zinc-100">
              Inquiries
            </p>

            <p className="mt-0.5 text-[11px] text-zinc-600">
              Site contact submissions
            </p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={status === "loading"}
            className="flex h-7 items-center gap-1.5 rounded-md border border-white/[0.08] px-2 text-[10px] text-zinc-500 transition hover:border-white/[0.16] hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "loading" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}

            Refresh
          </button>
        </div>
      </div>

      <div className="p-3">
        {status === "loading" &&
        inquiries.length === 0 ? (
          <div className="flex items-center gap-2 px-1 py-4 text-[11px] text-zinc-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading inquiries…
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-red-400/20 bg-red-400/[0.04] px-3 py-2 text-[10px] leading-4 text-red-200/80">
            {error}
          </div>
        ) : null}

        {status !== "loading" &&
        !error &&
        inquiries.length === 0 ? (
          <div className="px-1 py-5">
            <p className="text-[11px] text-zinc-500">
              No inquiries yet.
            </p>

            <p className="mt-1 text-[10px] leading-4 text-zinc-700">
              Contact form submissions will appear here.
            </p>
          </div>
        ) : null}

        {inquiries.length > 0 ? (
          <div className="space-y-1.5">
            {inquiries.map((inquiry) => {
              const createdAt =
                new Date(
                  inquiry.created_at,
                );

              return (
                <div
                  key={inquiry.id}
                  className="rounded-md border border-white/[0.06] bg-white/[0.015] px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-zinc-300">
                        {inquiry.sender_name}
                      </p>

                      <p className="mt-0.5 truncate text-[9px] text-zinc-600">
                        {inquiry.sender_email}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.08em] ${
                        inquiry.status === "new"
                          ? "bg-white/[0.08] text-zinc-300"
                          : inquiry.status === "archived"
                            ? "text-zinc-700"
                            : "text-zinc-500"
                      }`}
                    >
                      {inquiry.status}
                    </span>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-[10px] leading-4 text-zinc-500">
                    {inquiry.message}
                  </p>

                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/[0.045] pt-2">
                    <span className="truncate text-[8px] text-zinc-700">
                      {inquiry.page_id}
                    </span>

                    <span className="shrink-0 text-[8px] text-zinc-700">
                      {Number.isNaN(
                        createdAt.getTime(),
                      )
                        ? inquiry.created_at
                        : createdAt.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}


function SiteCatalogInspector({
  site,
  onCatalogChange,
  mobile = false,
}: {
  site: SiteDocument;
  onCatalogChange: (
    catalog: SiteCatalog,
  ) => void;
  mobile?: boolean;
}) {
  const catalog: SiteCatalog =
    site.catalog ?? {
      collections: [],
      items: [],
    };

  const [title, setTitle] =
    useState("");

  const [
    collectionName,
    setCollectionName,
  ] = useState("");

  const [
    uploadResult,
    setUploadResult,
  ] = useState<{
    path: string;
    url: string;
  } | null>(null);

  const [
    uploadStatus,
    setUploadStatus,
  ] = useState<
    "idle" | "uploading" | "error"
  >("idle");

  const [
    uploadError,
    setUploadError,
  ] = useState<string | null>(
    null,
  );

  const itemCount =
    catalog.items.length;

  const visibleItemCount =
    catalog.items.filter(
      (item) => item.visible,
    ).length;

  async function uploadImage(
    file: File,
  ) {
    setUploadStatus(
      "uploading",
    );
    setUploadError(null);

    try {
      const result =
        await uploadSiteImage(
          file,
        );

      setUploadResult(result);
      setUploadStatus("idle");
    } catch (error) {
      setUploadStatus("error");
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to upload image.",
      );
    }
  }

  function resolveCollection() {
    const trimmed =
      collectionName.trim();

    if (!trimmed) {
      return {
        collections:
          catalog.collections,
        collectionId:
          undefined,
      };
    }

    const existing =
      catalog.collections.find(
        (collection) =>
          collection.title
            .trim()
            .toLowerCase() ===
          trimmed.toLowerCase(),
      );

    if (existing) {
      return {
        collections:
          catalog.collections,
        collectionId:
          existing.id,
      };
    }

    const collection:
      SiteCatalogCollection = {
        id:
          `catalog-collection-${crypto.randomUUID()}`,
        title: trimmed,
        slug:
          slugifyPageTitle(
            trimmed,
          ) ||
          `collection-${catalog.collections.length + 1}`,
        sortOrder:
          catalog.collections.reduce(
            (
              highest,
              candidate,
            ) =>
              Math.max(
                highest,
                candidate.sortOrder,
              ),
            -1,
          ) + 1,
      };

    return {
      collections: [
        ...catalog.collections,
        collection,
      ],
      collectionId:
        collection.id,
    };
  }

  function addItem() {
    const trimmedTitle =
      title.trim();

    if (
      !trimmedTitle ||
      !uploadResult
    ) {
      return;
    }

    const {
      collections,
      collectionId,
    } =
      resolveCollection();

    const item:
      SiteCatalogItem = {
        id:
          `catalog-item-${crypto.randomUUID()}`,
        title:
          trimmedTitle,

        imageUrl:
          uploadResult.url,
        imagePath:
          uploadResult.path,
        imageAlt:
          trimmedTitle,

        collectionId,

        status:
          "concept",

        visible: true,
        sortOrder:
          catalog.items.reduce(
            (
              highest,
              candidate,
            ) =>
              Math.max(
                highest,
                candidate.sortOrder,
              ),
            -1,
          ) + 1,
      };

    onCatalogChange({
      collections,
      items: [
        ...catalog.items,
        item,
      ],
    });

    setTitle("");
    setCollectionName("");
    setUploadResult(null);
    setUploadStatus("idle");
    setUploadError(null);
  }

  function updateItem(
    itemId: string,
    updater: (
      item: SiteCatalogItem,
    ) => SiteCatalogItem,
  ) {
    onCatalogChange({
      ...catalog,
      items:
        catalog.items.map(
          (item) =>
            item.id === itemId
              ? updater(item)
              : item,
        ),
    });
  }

  function deleteItem(
    itemId: string,
  ) {
    onCatalogChange({
      ...catalog,
      items:
        catalog.items.filter(
          (item) =>
            item.id !== itemId,
        ),
    });
  }

  return (
    <>
      <div
        className={
          mobile
            ? "border-b border-white/[0.07] px-4 pb-4 pt-5"
            : "border-b border-white/[0.07] px-4 py-3"
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className={
                mobile
                  ? "text-[20px] font-medium tracking-[-0.02em] text-zinc-100"
                  : "text-[15px] font-medium text-zinc-100"
              }
            >
              Catalog
            </p>

            <p className="mt-1 text-[11px] text-zinc-600">
              {itemCount} item
              {itemCount === 1
                ? ""
                : "s"}{" "}
              · {visibleItemCount} visible
            </p>
          </div>

          <Package
            className={
              mobile
                ? "mt-1 h-5 w-5 text-zinc-600"
                : "mt-0.5 h-4 w-4 text-zinc-600"
            }
          />
        </div>
      </div>

      <div
        className={
          mobile
            ? "space-y-6 p-4 pb-24"
            : "space-y-5 p-4"
        }
      >
        <InspectorGroup title="Quick add">
          <div className="space-y-3">
            <div
              className={`relative overflow-hidden rounded-lg border border-white/[0.08] bg-black/25 ${
                mobile
                  ? "aspect-[4/5]"
                  : "aspect-[4/3]"
              }`}
            >
              {uploadResult ? (
                <img
                  src={
                    uploadResult.url
                  }
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-600">
                  <ImageIcon className="h-5 w-5" />
                  <span className="text-[10px] uppercase tracking-[0.14em]">
                    Product image
                  </span>
                </div>
              )}

              <label className="absolute inset-0 cursor-pointer">
                <span className="sr-only">
                  Upload product
                  image
                </span>

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  disabled={
                    uploadStatus ===
                    "uploading"
                  }
                  className="hidden"
                  onChange={(
                    event,
                  ) => {
                    const input =
                      event.currentTarget;

                    const file =
                      input.files?.[0];

                    if (!file) {
                      return;
                    }

                    void uploadImage(
                      file,
                    ).finally(
                      () => {
                        input.value =
                          "";
                      },
                    );
                  }}
                />
              </label>

              <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/70 px-2.5 py-1.5 text-[10px] font-medium text-zinc-200 backdrop-blur">
                {uploadStatus ===
                "uploading"
                  ? "Uploading…"
                  : uploadResult
                    ? "Tap to replace"
                    : "Tap to add photo"}
              </div>
            </div>

            {uploadError ? (
              <p className="rounded-md border border-red-300/15 bg-red-300/[0.04] px-3 py-2 text-[10px] leading-4 text-red-200/80">
                {uploadError}
              </p>
            ) : null}

            <TextInput
              id={
                mobile
                  ? "mobile-catalog-item-name"
                  : "catalog-item-name"
              }
              label="Product name"
              value={title}
              onChange={setTitle}
              placeholder="Washed Logo Hoodie"
            />

            <div>
              <TextInput
                id={
                  mobile
                    ? "mobile-catalog-collection"
                    : "catalog-collection"
                }
                label="Collection"
                value={
                  collectionName
                }
                onChange={
                  setCollectionName
                }
                placeholder="Collection 01"
              />

              {catalog.collections
                .length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {catalog.collections
                    .slice()
                    .sort(
                      (a, b) =>
                        a.sortOrder -
                        b.sortOrder,
                    )
                    .map(
                      (
                        collection,
                      ) => (
                        <button
                          key={
                            collection.id
                          }
                          type="button"
                          onClick={() =>
                            setCollectionName(
                              collection.title,
                            )
                          }
                          className={`rounded-full border px-2.5 py-1 text-[9px] transition ${
                            collectionName
                              .trim()
                              .toLowerCase() ===
                            collection.title
                              .trim()
                              .toLowerCase()
                              ? "border-white/20 bg-white/[0.08] text-zinc-200"
                              : "border-white/[0.07] text-zinc-600 hover:border-white/[0.14] hover:text-zinc-300"
                          }`}
                        >
                          {
                            collection.title
                          }
                        </button>
                      ),
                    )}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={addItem}
              disabled={
                !title.trim() ||
                !uploadResult ||
                uploadStatus ===
                  "uploading"
              }
              className={`flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 font-medium text-black transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 ${
                mobile
                  ? "h-11 text-[13px]"
                  : "h-9 text-[11px]"
              }`}
            >
              <Plus className="h-4 w-4" />
              Add to catalog
            </button>
          </div>
        </InspectorGroup>

        <InspectorGroup title="Products">
          {catalog.items.length >
          0 ? (
            <div className="space-y-2">
              {catalog.items
                .slice()
                .sort(
                  (a, b) =>
                    a.sortOrder -
                    b.sortOrder,
                )
                .map((item) => {
                  const collection =
                    catalog.collections.find(
                      (
                        candidate,
                      ) =>
                        candidate.id ===
                        item.collectionId,
                    );

                  return (
                    <div
                      key={item.id}
                      className="group flex gap-3 rounded-md border border-white/[0.07] bg-white/[0.015] p-2"
                    >
                      <div className="relative h-[74px] w-[60px] shrink-0 overflow-hidden rounded-[5px] bg-white/[0.03]">
                        <img
                          src={
                            item.imageUrl
                          }
                          alt={
                            item.imageAlt
                          }
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium text-zinc-200">
                            {
                              item.title
                            }
                          </p>

                          <p className="mt-1 truncate text-[9px] text-zinc-600">
                            {collection?.title ??
                              "Unsorted"}{" "}
                            ·{" "}
                            {
                              item.status
                            }
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(
                                item.id,
                                (
                                  current,
                                ) => ({
                                  ...current,
                                  visible:
                                    !current.visible,
                                }),
                              )
                            }
                            className={`flex h-6 items-center gap-1 rounded px-1.5 text-[9px] transition ${
                              item.visible
                                ? "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                                : "text-zinc-700 hover:bg-white/[0.03] hover:text-zinc-400"
                            }`}
                          >
                            {item.visible ? (
                              <Eye className="h-3 w-3" />
                            ) : (
                              <EyeOff className="h-3 w-3" />
                            )}

                            {item.visible
                              ? "Visible"
                              : "Hidden"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              deleteItem(
                                item.id,
                              )
                            }
                            className="flex h-6 items-center gap-1 rounded px-1.5 text-[9px] text-zinc-700 transition hover:bg-red-300/[0.04] hover:text-red-200"
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-8 text-center">
              <Package className="mx-auto h-5 w-5 text-zinc-700" />

              <p className="mt-3 text-[11px] text-zinc-400">
                Your catalog is
                empty.
              </p>

              <p className="mt-1 text-[10px] leading-4 text-zinc-700">
                Upload a concept,
                mockup, sample, or
                future product.
              </p>
            </div>
          )}
        </InspectorGroup>

        {catalog.collections
          .length > 0 ? (
          <InspectorGroup title="Collections">
            <div className="space-y-1">
              {catalog.collections
                .slice()
                .sort(
                  (a, b) =>
                    a.sortOrder -
                    b.sortOrder,
                )
                .map(
                  (
                    collection,
                  ) => {
                    const count =
                      catalog.items.filter(
                        (item) =>
                          item.collectionId ===
                          collection.id,
                      ).length;

                    return (
                      <div
                        key={
                          collection.id
                        }
                        className="flex h-8 items-center gap-2 border-b border-white/[0.045] px-1 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-400">
                          {
                            collection.title
                          }
                        </span>

                        <span className="text-[9px] tabular-nums text-zinc-700">
                          {count}
                        </span>
                      </div>
                    );
                  },
                )}
            </div>
          </InspectorGroup>
        ) : null}
      </div>
    </>
  );
}


function SiteChromeInspector({
  selection,
  site,
  onSiteNameChange,
  onSiteHandleChange,
  onThemeChange,
  onHeaderChange,
  onFooterChange,
  onNavigationChange,
}: {
  selection: SiteChromeSelection;
  site: SiteDocument;
  onSiteNameChange: (value: string) => void;
  onSiteHandleChange: (value: string) => void;
  onThemeChange: (theme: SiteThemeConfig) => void;
  onHeaderChange: (
    key: "brandLabel" | "tagline",
    value: string,
  ) => void;
  onFooterChange: (
    key: "brandLabel" | "tagline",
    value: string,
  ) => void;
  onNavigationChange: (items: SiteNavigationItem[]) => void;
}) {
  const header = getSiteHeaderConfig(site);
  const footer = getSiteFooterConfig(site);
  const handleValid = isValidSiteHandle(site.handle);
  const theme = getSiteThemeConfig(site);
  const themeColors =
    getSiteThemeColors(theme);

  function updateThemeColor(
    key:
      | "background"
      | "surface"
      | "text"
      | "mutedText"
      | "border",
    value: string,
  ) {
    onThemeChange({
      ...theme,
      colors: {
        ...theme.colors,
        [key]: value,
      },
    });
  }
  const linkedNavigationPageIds = new Set(
    header.navigation.flatMap((item) =>
      item.pageId ? [item.pageId] : [],
    ),
  );
  const navigationPagesNotLinked = site.pages.filter(
    (page) => !linkedNavigationPageIds.has(page.id),
  );

  if (selection === "site") {
    return (
      <>
        <div className="border-b border-white/[0.07] px-4 py-3">
          <p className="text-[15px] font-medium text-zinc-100">
            Site
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            Site settings
          </p>
        </div>

        <div className="space-y-4 p-4">
          <InspectorGroup title="Identity">
            <TextInput
              id="site-name"
              label="Site name"
              value={site.name}
              onChange={onSiteNameChange}
              placeholder="My site"
            />

            <div>
              <TextInput
                id="site-handle"
                label="Public handle"
                value={site.handle}
                onChange={onSiteHandleChange}
                placeholder="my-site"
              />

              <p
                className={`mt-1.5 text-[10px] ${
                  handleValid
                    ? "text-zinc-600"
                    : "text-red-200/70"
                }`}
              >
                {handleValid
                  ? `/portfolio/${site.handle}`
                  : "Enter a valid public handle."}
              </p>
            </div>
          </InspectorGroup>

          <div className="rounded-md border border-white/[0.08] bg-black/20 px-3 py-2.5">
            <p className="text-[11px] font-medium text-zinc-300">
              Public address
            </p>
            <p className="mt-1 break-all text-[11px] text-zinc-600">
              /portfolio/{site.handle || "your-handle"}
            </p>
            <p className="mt-2 text-[10px] leading-4 text-zinc-700">
              Changing the handle changes the site address the next
              time you publish.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (selection === "design") {

    return (
      <>
        <div className="border-b border-white/[0.06] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-zinc-100">
                Design
              </p>

              <p className="mt-0.5 text-[9px] text-zinc-650">
                Site-wide appearance
              </p>
            </div>

            {theme.colors ? (
              <button
                type="button"
                onClick={() => {
                  const preset =
                    getSiteThemePreset(
                      theme.palette,
                    );

                  onThemeChange({
                    ...theme,
                    colors: undefined,
                    accentColor:
                      preset.accent,
                  });
                }}
                className="text-[9px] text-zinc-600 transition hover:text-zinc-300"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-5 p-3">



          <section>
            <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-650">
              Colors
            </p>

            <div className="overflow-hidden rounded-md border border-white/[0.055]">
              <ThemeColorRow
                label="Background"
                value={
                  themeColors.background
                }
                onChange={(value) =>
                  updateThemeColor(
                    "background",
                    value,
                  )
                }
              />

              <ThemeColorRow
                label="Surface"
                value={
                  themeColors.surface
                }
                onChange={(value) =>
                  updateThemeColor(
                    "surface",
                    value,
                  )
                }
              />

              <ThemeColorRow
                label="Text"
                value={
                  themeColors.text
                }
                onChange={(value) =>
                  updateThemeColor(
                    "text",
                    value,
                  )
                }
              />

              <ThemeColorRow
                label="Secondary"
                value={
                  themeColors.mutedText
                }
                onChange={(value) =>
                  updateThemeColor(
                    "mutedText",
                    value,
                  )
                }
              />

              <ThemeColorRow
                label="Border"
                value={
                  themeColors.border
                }
                onChange={(value) =>
                  updateThemeColor(
                    "border",
                    value,
                  )
                }
              />

              <ThemeColorRow
                label="Accent"
                value={
                  theme.accentColor
                }
                onChange={(value) =>
                  onThemeChange({
                    ...theme,
                    accentColor:
                      value,
                  })
                }
              />
            </div>
          </section>

          <section>
            <p className="mb-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-650">
              Typography
            </p>

            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-white/[0.06]">
              {(
                [
                  {
                    value: "sans",
                    label: "Sans",
                  },
                  {
                    value: "serif",
                    label: "Serif",
                  },
                  {
                    value: "mono",
                    label: "Mono",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onThemeChange({
                      ...theme,
                      typography:
                        option.value,
                    })
                  }
                  className={`h-7 border-r border-white/[0.05] text-[9px] last:border-r-0 ${
                    theme.typography ===
                    option.value
                      ? "bg-white/[0.08] text-zinc-200"
                      : "text-zinc-600 hover:bg-white/[0.025] hover:text-zinc-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-650">
              Layout
            </p>

            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[10px] text-zinc-500">
                  Width
                </p>

                <div className="grid grid-cols-3 overflow-hidden rounded-md border border-white/[0.06]">
                  {(
                    [
                      {
                        value: "compact",
                        label: "Compact",
                      },
                      {
                        value: "standard",
                        label: "Standard",
                      },
                      {
                        value: "wide",
                        label: "Wide",
                      },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        onThemeChange({
                          ...theme,
                          width:
                            option.value,
                        })
                      }
                      className={`h-7 border-r border-white/[0.05] text-[8px] last:border-r-0 ${
                        theme.width ===
                        option.value
                          ? "bg-white/[0.08] text-zinc-200"
                          : "text-zinc-600 hover:bg-white/[0.025] hover:text-zinc-400"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <ThemeRangeControl
                label="Section gap"
                value={
                  theme.sectionSpacing ??
                  40
                }
                min={8}
                max={120}
                step={4}
                onChange={(value) =>
                  onThemeChange({
                    ...theme,
                    sectionSpacing:
                      value,
                  })
                }
              />

              <ThemeRangeControl
                label="Page gutter"
                value={
                  theme.pagePadding ??
                  58
                }
                min={12}
                max={100}
                step={2}
                onChange={(value) =>
                  onThemeChange({
                    ...theme,
                    pagePadding:
                      value,
                  })
                }
              />
            </div>
          </section>

          <section>
            <p className="mb-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-650">
              Corners
            </p>

            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-white/[0.06]">
              {(
                [
                  {
                    value: "sharp",
                    label: "Sharp",
                  },
                  {
                    value: "soft",
                    label: "Soft",
                  },
                  {
                    value: "rounded",
                    label: "Round",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onThemeChange({
                      ...theme,
                      radius:
                        option.value,
                    })
                  }
                  className={`h-7 border-r border-white/[0.05] text-[9px] last:border-r-0 ${
                    theme.radius ===
                    option.value
                      ? "bg-white/[0.08] text-zinc-200"
                      : "text-zinc-600 hover:bg-white/[0.025] hover:text-zinc-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </>
    );
  }

  if (selection === "header") {
    return (
      <>
        <div className="border-b border-white/[0.07] px-4 py-3">
          <p className="text-[15px] font-medium text-zinc-100">Header</p>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            Site / Header
          </p>
        </div>

        <div className="space-y-4 p-4">
          <InspectorGroup title="Brand">
            <TextInput
              id="site-header-brand"
              label="Brand label"
              value={header.brandLabel}
              onChange={(value) =>
                onHeaderChange("brandLabel", value)
              }
            />
          </InspectorGroup>

          <InspectorGroup title="Header text">
            <TextInput
              id="site-header-tagline"
              label="Tagline"
              value={header.tagline}
              onChange={(value) =>
                onHeaderChange("tagline", value)
              }
            />
          </InspectorGroup>
        </div>
      </>
    );
  }

  if (selection === "navigation") {
    return (
      <>
        <div className="border-b border-white/[0.07] px-4 py-3">
          <p className="text-[15px] font-medium text-zinc-100">
            Navigation
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            Site / Header / Navigation
          </p>
        </div>

        <div className="space-y-3 p-4">
          {header.navigation.map((item, index) => (
            <div
              key={item.id}
              className="rounded-md border border-white/[0.08] bg-black/20 p-2.5"
            >
              <div className="grid grid-cols-2 gap-2">
                <TextInput
                  id={`site-nav-label-${item.id}`}
                  label="Label"
                  value={item.label}
                  onChange={(value) =>
                    onNavigationChange(
                      header.navigation.map((candidate) =>
                        candidate.id === item.id
                          ? { ...candidate, label: value }
                          : candidate,
                      ),
                    )
                  }
                />

                <div>
                  <FieldLabel
                    htmlFor={`site-nav-target-${item.id}`}
                  >
                    Target
                  </FieldLabel>

                  <select
                    id={`site-nav-target-${item.id}`}
                    value={item.pageId ?? "__custom__"}
                    onChange={(event) => {
                      const nextPageId =
                        event.target.value === "__custom__"
                          ? undefined
                          : event.target.value;

                      onNavigationChange(
                        header.navigation.map((candidate) =>
                          candidate.id === item.id
                            ? {
                                ...candidate,
                                pageId: nextPageId,
                              }
                            : candidate,
                        ),
                      );
                    }}
                    className="mt-1.5 h-8 w-full rounded-md border border-white/[0.09] bg-black/30 px-2 text-[11px] text-zinc-300 outline-none focus:border-white/[0.18]"
                  >
                    <option value="__custom__">
                      Custom URL
                    </option>

                    {site.pages.map((page) => (
                      <option
                        key={page.id}
                        value={page.id}
                      >
                        {page.id === site.homePageId
                          ? `${page.title} · Home`
                          : page.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {item.pageId ? (
                <div className="mt-2 rounded border border-white/[0.06] bg-black/20 px-2.5 py-2">
                  <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-700">
                    Resolves to
                  </p>
                  <p className="mt-1 break-all text-[10px] text-zinc-500">
                    {getSitePageHref(site, item.pageId)}
                  </p>
                </div>
              ) : (
                <div className="mt-2">
                  <TextInput
                    id={`site-nav-href-${item.id}`}
                    label="Custom URL"
                    value={item.href}
                    placeholder="https://… or #section"
                    onChange={(value) =>
                      onNavigationChange(
                        header.navigation.map(
                          (candidate) =>
                            candidate.id === item.id
                              ? {
                                  ...candidate,
                                  href: value,
                                }
                              : candidate,
                        ),
                      )
                    }
                  />
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <input
                    type="checkbox"
                    checked={item.visible}
                    onChange={(event) =>
                      onNavigationChange(
                        header.navigation.map((candidate) =>
                          candidate.id === item.id
                            ? {
                                ...candidate,
                                visible: event.target.checked,
                              }
                            : candidate,
                        ),
                      )
                    }
                    className="h-3.5 w-3.5 accent-zinc-100"
                  />
                  Visible
                </label>

                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      const next = [...header.navigation];
                      const [moved] = next.splice(index, 1);
                      next.splice(index - 1, 0, moved);
                      onNavigationChange(next);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 disabled:opacity-25"
                    title="Move up"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>

                  <button
                    type="button"
                    disabled={index === header.navigation.length - 1}
                    onClick={() => {
                      const next = [...header.navigation];
                      const [moved] = next.splice(index, 1);
                      next.splice(index + 1, 0, moved);
                      onNavigationChange(next);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 disabled:opacity-25"
                    title="Move down"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onNavigationChange(
                        header.navigation.filter(
                          (candidate) => candidate.id !== item.id,
                        ),
                      )
                    }
                    className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 hover:border-red-300/20 hover:text-red-200"
                    title="Delete link"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={navigationPagesNotLinked.length === 0}
              onClick={() =>
                onNavigationChange([
                  ...header.navigation,
                  ...navigationPagesNotLinked.map((page) => ({
                    id: `nav-${crypto.randomUUID()}`,
                    label: page.title,
                    href: "",
                    pageId: page.id,
                    visible: true,
                  })),
                ])
              }
              className="flex h-8 items-center justify-center gap-2 rounded-md border border-white/[0.1] text-[11px] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <FileText className="h-3.5 w-3.5" />
              Add pages
            </button>

            <button
              type="button"
              onClick={() =>
                onNavigationChange([
                  ...header.navigation,
                  {
                    id: `nav-${crypto.randomUUID()}`,
                    label: "New link",
                    href: "#",
                    visible: true,
                  },
                ])
              }
              className="flex h-8 items-center justify-center gap-2 rounded-md border border-white/[0.1] text-[11px] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Custom link
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="border-b border-white/[0.07] px-4 py-3">
        <p className="text-[15px] font-medium text-zinc-100">Footer</p>
        <p className="mt-0.5 text-[11px] text-zinc-600">
          Site / Footer
        </p>
      </div>

      <div className="space-y-4 p-4">
        <InspectorGroup title="Brand">
          <TextInput
            id="site-footer-brand"
            label="Brand label"
            value={footer.brandLabel}
            onChange={(value) =>
              onFooterChange("brandLabel", value)
            }
          />
        </InspectorGroup>

        <InspectorGroup title="Footer text">
          <TextInput
            id="site-footer-tagline"
            label="Tagline"
            value={footer.tagline}
            onChange={(value) =>
              onFooterChange("tagline", value)
            }
          />
        </InspectorGroup>
      </div>
    </>
  );
}

export default function SiteBuilder() {
  const [site, setSite] = useState<SiteDocument>(cloneInitialSite);
  const [selectedPageId, setSelectedPageId] = useState(() => {
    const initialSite = cloneInitialSite();
    return initialSite.homePageId;
  });
  const [editorSelection, setEditorSelection] =
    useState<SiteEditorSelection | null>(() =>
      getInitialEditorSelection(cloneInitialSite()),
    );
  const [siteChromeSelection, setSiteChromeSelection] =
    useState<SiteChromeSelection | null>(null);
  const [railMode, setRailMode] =
    useState<SiteRailMode>("structure");
  const [expandedSectionIds, setExpandedSectionIds] =
    useState<Set<string>>(() => new Set());
  const [draftLoadStatus, setDraftLoadStatus] =
    useState<DraftLoadStatus>("loading");
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] =
    useState<DraftSaveStatus>("idle");
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [publishRequestStatus, setPublishRequestStatus] =
    useState<PublishRequestStatus>("checking");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedSiteJson, setPublishedSiteJson] =
    useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [showSectionLibrary, setShowSectionLibrary] = useState(false);
  const [sectionInsertionIndex, setSectionInsertionIndex] =
    useState<number | null>(null);
  const [sectionInsertionPageId, setSectionInsertionPageId] =
    useState<string | null>(null);
  const [expandedPageIds, setExpandedPageIds] = useState<Set<string>>(
    () => new Set([cloneInitialSite().homePageId]),
  );
  const [showPageDialog, setShowPageDialog] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [pageDraftTitle, setPageDraftTitle] = useState("");
  const [pageDraftSlug, setPageDraftSlug] = useState("");
  const [pageDraftSlugTouched, setPageDraftSlugTouched] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [activeInspectorMode, setActiveInspectorMode] =
    useState<InspectorMode>("content");
  const [sourceListings, setSourceListings] = useState<SourceListing[]>([]);
  const [sourceStatus, setSourceStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [siteInquiries, setSiteInquiries] =
    useState<SiteInquiry[]>([]);
  const [inquiryLoadStatus, setInquiryLoadStatus] =
    useState<InquiryLoadStatus>("idle");
  const [inquiryLoadError, setInquiryLoadError] =
    useState<string | null>(null);
  const latestSiteJsonRef = useRef(JSON.stringify(cloneInitialSite()));
  const lastPersistedSiteJsonRef = useRef("");
  const draftLoadRequestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const saveRequestIdRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestSiteJsonRef.current = JSON.stringify(site);
  }, [site]);

  const loadPublicationState = useCallback(async () => {
    setPublishRequestStatus("checking");
    setPublishError(null);

    try {
      const response = await fetch("/api/site-builder/publish", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const payload = (await response.json()) as {
        published?: boolean;
        site?: SiteDocument | null;
        publishedAt?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to load publication state.",
        );
      }

      setPublishedSiteJson(
        payload.published && payload.site
          ? JSON.stringify(payload.site)
          : null,
      );
      setPublishedAt(payload.publishedAt ?? null);
      setPublishRequestStatus("ready");
    } catch (error) {
      setPublishError(
        error instanceof Error
          ? error.message
          : "Unable to load publication state.",
      );
      setPublishRequestStatus("error");
    }
  }, []);

  const loadSiteInquiries = useCallback(async () => {
    setInquiryLoadStatus("loading");
    setInquiryLoadError(null);

    try {
      const response = await fetch(
        "/api/site-builder/inquiries",
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );

      const payload = (await response.json()) as {
        inquiries?: SiteInquiry[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Unable to load Site inquiries.",
        );
      }

      setSiteInquiries(payload.inquiries ?? []);
      setInquiryLoadStatus("loaded");
    } catch (error) {
      setInquiryLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load Site inquiries.",
      );
      setInquiryLoadStatus("error");
    }
  }, []);

  const loadDraft = useCallback(async () => {
    const requestId = draftLoadRequestIdRef.current + 1;
    draftLoadRequestIdRef.current = requestId;
    setDraftLoadStatus("loading");
    setDraftLoadError(null);

    try {
      const response = await fetch("/api/site-builder/draft", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      const payload = (await response.json()) as {
        site?: SiteDocument | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load site draft.");
      }

      if (!mountedRef.current || draftLoadRequestIdRef.current !== requestId) {
        return;
      }

      const loadedSite =
        payload.site ?? cloneInitialSite();

      const nextSite =
        migrateLegacyMackSite(
          loadedSite,
        );

      const nextSelection =
        getInitialEditorSelection(
          nextSite,
        );
      const nextPageId =
        nextSite.pages.find((page) => page.id === nextSite.homePageId)?.id ??
        nextSite.pages[0]?.id ??
        "";
      const loadedSiteJson =
        JSON.stringify(
          loadedSite,
        );

      const nextSiteJson =
        JSON.stringify(
          nextSite,
        );

      setSite(nextSite);
      setSelectedPageId(nextPageId);
      setEditorSelection(nextSelection);
      setSiteChromeSelection(null);
      setRailMode("structure");
      setExpandedSectionIds(new Set());
      setExpandedPageIds(nextPageId ? new Set([nextPageId]) : new Set());
      latestSiteJsonRef.current =
        nextSiteJson;

      lastPersistedSiteJsonRef.current =
        loadedSiteJson;
      setDraftSaveStatus("idle");
      setDraftSaveError(null);
      setDraftLoadStatus("ready");
    } catch (error) {
      if (!mountedRef.current || draftLoadRequestIdRef.current !== requestId) {
        return;
      }

      lastPersistedSiteJsonRef.current = latestSiteJsonRef.current;
      setDraftLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load site draft.",
      );
      setDraftLoadStatus("error");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadDraft();

    return () => {
      mountedRef.current = false;
      draftLoadRequestIdRef.current += 1;
    };
  }, [loadDraft]);

  useEffect(() => {
    if (draftLoadStatus !== "ready") return;

    void loadPublicationState();
  }, [draftLoadStatus, loadPublicationState]);

  useEffect(() => {
    if (draftLoadStatus !== "ready") return;

    void loadSiteInquiries();
  }, [draftLoadStatus, loadSiteInquiries]);

  useEffect(() => {
    if (draftLoadStatus !== "ready") return;

    const siteJson = JSON.stringify(site);
    latestSiteJsonRef.current = siteJson;

    if (siteJson === lastPersistedSiteJsonRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setDraftSaveStatus("saving");
    setDraftSaveError(null);

    saveTimerRef.current = setTimeout(() => {
      const requestSite = site;
      const requestSiteJson = JSON.stringify(requestSite);
      const requestId = saveRequestIdRef.current + 1;
      saveRequestIdRef.current = requestId;

      fetch("/api/site-builder/draft", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ site: requestSite }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };

          if (!response.ok) {
            throw new Error(payload.error ?? "Unable to save site draft.");
          }

          if (
            saveRequestIdRef.current === requestId &&
            latestSiteJsonRef.current === requestSiteJson
          ) {
            lastPersistedSiteJsonRef.current = requestSiteJson;
            setDraftSaveStatus("saved");
            setDraftSaveError(null);
          }
        })
        .catch((error) => {
          if (saveRequestIdRef.current !== requestId) return;
          if (latestSiteJsonRef.current !== requestSiteJson) {
            setDraftSaveStatus("saving");
            setDraftSaveError(null);
            return;
          }

          setDraftSaveStatus("error");
          setDraftSaveError(
            error instanceof Error
              ? error.message
              : "Unable to save site draft.",
          );
        });
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [draftLoadStatus, site]);

  const selectedPage =
    site.pages.find((page) => page.id === selectedPageId) ?? site.pages[0];

  const selectedSectionId =
    editorSelection?.pageId === selectedPage?.id
      ? editorSelection.sectionId
      : "";
  const selectedContentNode =
    editorSelection?.kind === "content" &&
    editorSelection.pageId === selectedPage?.id
      ? editorSelection.node
      : null;
  const selectedBlockId =
    editorSelection?.kind === "block" &&
    editorSelection.pageId === selectedPage?.id
      ? editorSelection.blockId
      : null;
  const selectedSection =
    selectedSectionId
      ? selectedPage?.sections.find(
          (section) => section.id === selectedSectionId,
        )
      : undefined;

  const selectedSectionIndex = selectedPage?.sections.findIndex(
    (section) => section.id === selectedSection?.id,
  );
  const sectionInsertionPage =
    site.pages.find((page) => page.id === sectionInsertionPageId) ??
    selectedPage;
  const sourceProducts = sourceListings.filter(
    (listing) => listing.type === "product",
  );
  const sourceServices = sourceListings.filter(
    (listing) => listing.type === "service",
  );
  const editorLocked = draftLoadStatus !== "ready";
  const newInquiryCount = siteInquiries.filter(
    (inquiry) => inquiry.status === "new",
  ).length;

  function selectSiteChrome(selection: SiteChromeSelection) {
    if (editorLocked) return;

    setRailMode(
      selection === "design"
        ? "design"
        : "structure",
    );
    setSiteChromeSelection(selection);
    setEditorSelection(null);
    setActiveInspectorMode("content");

    if (
      selection === "inquiries" &&
      inquiryLoadStatus !== "loading"
    ) {
      void loadSiteInquiries();
    }
  }

  function updateSiteName(value: string) {
    if (editorLocked) return;

    setSite((current) => ({
      ...current,
      name: value,
    }));
  }

  function updateSiteHandle(value: string) {
    if (editorLocked) return;

    setSite((current) => ({
      ...current,
      handle: sanitizeSiteHandle(value),
    }));
  }

  function applyThemeToPreview(
    theme: SiteThemeConfig,
  ) {
    const previewDocument =
      previewIframeRef.current?.contentDocument;

    const themeRoot =
      previewDocument?.querySelector<HTMLElement>(
        "[data-site-theme-root]",
      );

    if (!themeRoot) return;

    const style =
      getSiteThemeStyle(theme);

    for (const [property, value] of Object.entries(style)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (property.startsWith("--")) {
        themeRoot.style.setProperty(
          property,
          String(value),
        );
        continue;
      }

      if (property === "backgroundColor") {
        themeRoot.style.backgroundColor =
          String(value);
        continue;
      }

      if (property === "color") {
        themeRoot.style.color =
          String(value);
        continue;
      }

      if (property === "fontFamily") {
        themeRoot.style.fontFamily =
          String(value);
      }
    }
  }

  function updateSiteTheme(theme: SiteThemeConfig) {
    if (editorLocked) return;

    setSite((current) => ({
      ...current,
      theme,
    }));

    // Same-origin preview: update design tokens immediately.
    window.requestAnimationFrame(() => {
      applyThemeToPreview(theme);
    });
  }

  function updateSiteHeaderField(
    key: "brandLabel" | "tagline",
    value: string,
  ) {
    if (editorLocked) return;

    setSite((current) => {
      const header = getSiteHeaderConfig(current);

      return {
        ...current,
        header: {
          ...header,
          [key]: value,
        },
      };
    });
  }

  function updateSiteNavigation(items: SiteNavigationItem[]) {
    if (editorLocked) return;

    setSite((current) => {
      const header = getSiteHeaderConfig(current);

      return {
        ...current,
        header: {
          ...header,
          navigation: items,
        },
      };
    });
  }

  function updateSiteFooterField(
    key: "brandLabel" | "tagline",
    value: string,
  ) {
    if (editorLocked) return;

    setSite((current) => {
      const footer = getSiteFooterConfig(current);

      return {
        ...current,
        footer: {
          ...footer,
          [key]: value,
        },
      };
    });
  }

  function updateSiteCatalog(
    catalog: SiteCatalog,
  ) {
    if (editorLocked) return;

    setSite((current) => ({
      ...current,
      catalog,
    }));
  }

  function selectPage(pageId: string) {
    const page = site.pages.find(
      (candidate) => candidate.id === pageId,
    );
    if (!page) return;

    setRailMode("structure");
    setSelectedPageId(page.id);
    setSiteChromeSelection(null);
    setEditorSelection(null);

    setExpandedPageIds(
      (current) =>
        new Set(current).add(page.id),
    );
  }

  function selectSection(
    pageId: string,
    sectionId: string,
  ) {
    setRailMode("structure");
    setSelectedPageId(pageId);
    setSiteChromeSelection(null);

    setEditorSelection({
      kind: "section",
      pageId,
      sectionId,
    });

    setExpandedPageIds(
      (current) =>
        new Set(current).add(pageId),
    );

    setExpandedSectionIds(
      (current) =>
        new Set(current).add(sectionId),
    );
  }

  function selectSectionContentChild(
    pageId: string,
    sectionId: string,
    node: SiteContentNodeId,
  ) {
    setRailMode("structure");
    setSelectedPageId(pageId);
    setSiteChromeSelection(null);

    setEditorSelection({
      kind: "content",
      pageId,
      sectionId,
      node,
    });

    setActiveInspectorMode("content");

    setExpandedPageIds(
      (current) =>
        new Set(current).add(pageId),
    );

    setExpandedSectionIds(
      (current) =>
        new Set(current).add(sectionId),
    );
  }

  function selectSectionBlock(
    pageId: string,
    sectionId: string,
    blockId: string,
  ) {
    setRailMode("structure");
    setSelectedPageId(pageId);
    setSiteChromeSelection(null);

    setEditorSelection({
      kind: "block",
      pageId,
      sectionId,
      blockId,
    });

    setActiveInspectorMode(
      "content",
    );

    setExpandedPageIds(
      (current) =>
        new Set(current).add(
          pageId,
        ),
    );

    setExpandedSectionIds(
      (current) =>
        new Set(current).add(
          sectionId,
        ),
    );
  }

  function toggleSectionExpanded(
    sectionId: string,
  ) {
    setExpandedSectionIds((current) => {
      const next = new Set(current);

      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      return next;
    });
  }

  function togglePageExpanded(pageId: string) {
    setExpandedPageIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) {
        if (pageId === selectedPageId) return current;
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }

  function openSectionLibrary(pageId: string, insertionIndex: number) {
    if (editorLocked) return;

    setSelectedPageId(pageId);
    setExpandedPageIds((current) => new Set(current).add(pageId));
    setSectionInsertionIndex(insertionIndex);
    setSectionInsertionPageId(pageId);
    setShowSectionLibrary(true);
  }

  function closeSectionLibrary() {
    setShowSectionLibrary(false);
    setSectionInsertionIndex(null);
    setSectionInsertionPageId(null);
  }

  function openNewPageDialog() {
    if (editorLocked) return;

    setSiteChromeSelection(null);
    setEditingPageId(null);
    setPageDraftTitle("");
    setPageDraftSlug("");
    setPageDraftSlugTouched(false);
    setShowPageDialog(true);
  }

  function openPageSettings(pageId: string) {
    if (editorLocked) return;

    const page = site.pages.find((candidate) => candidate.id === pageId);
    if (!page) return;

    setEditingPageId(page.id);
    setPageDraftTitle(page.title);
    setPageDraftSlug(page.slug);
    setPageDraftSlugTouched(true);
    setShowPageDialog(true);
  }

  function closePageDialog() {
    setShowPageDialog(false);
    setEditingPageId(null);
    setPageDraftTitle("");
    setPageDraftSlug("");
    setPageDraftSlugTouched(false);
  }

  function updatePageDraftTitle(value: string) {
    if (editorLocked) return;

    setPageDraftTitle(value);
    if (!pageDraftSlugTouched && !editingPageId) {
      setPageDraftSlug(slugifyPageTitle(value));
    }
  }

  function updatePageDraftSlug(value: string) {
    if (editorLocked) return;

    setPageDraftSlugTouched(true);
    setPageDraftSlug(sanitizeSlug(value));
  }

  function savePageDraft() {
    if (editorLocked) return;

    const title = pageDraftTitle.trim();
    if (!title) return;

    if (editingPageId) {
      const editingPage = site.pages.find((page) => page.id === editingPageId);
      if (!editingPage) return;
      const nextSlug =
        editingPage.id === site.homePageId
          ? ""
          : sanitizeSlug(pageDraftSlug);

      if (
        editingPage.id !== site.homePageId &&
        (!nextSlug || isDuplicateSlug(nextSlug, site.pages, editingPage.id))
      ) {
        return;
      }

      setSite((current) => ({
        ...current,
        pages: current.pages.map((page) =>
          page.id === editingPage.id
            ? {
                ...page,
                title,
                slug: page.id === current.homePageId ? "" : nextSlug,
              }
            : page,
        ),
      }));
      closePageDialog();
      return;
    }

    const slug = sanitizeSlug(pageDraftSlug || title);
    if (!slug || isDuplicateSlug(slug, site.pages)) return;

    const page = {
      id: createPageId(title),
      title,
      slug,
      sections: [],
    };

    setSite((current) => ({
      ...current,
      pages: [...current.pages, page],
    }));
    setSelectedPageId(page.id);
    setEditorSelection(null);
    setExpandedPageIds((current) => new Set(current).add(page.id));
    closePageDialog();
  }

  function duplicatePage(pageId: string) {
    if (editorLocked) return;

    const sourcePage = site.pages.find((page) => page.id === pageId);
    if (!sourcePage) return;

    const duplicate = JSON.parse(JSON.stringify(sourcePage)) as typeof sourcePage;
    duplicate.id = createDuplicatePageId(sourcePage.id);
    duplicate.title = `${sourcePage.title} copy`;
    duplicate.slug = uniqueSlug(
      sourcePage.slug ? `${sourcePage.slug}-copy` : `${slugifyPageTitle(sourcePage.title)}-copy`,
      site.pages,
    );
    duplicate.previewPath = undefined;
    duplicate.sections = duplicate.sections.map((section) => ({
      ...section,
      id: createDuplicateSectionId(section.id),
    }));

    setSite((current) => ({
      ...current,
      pages: [...current.pages, duplicate],
    }));
    setSelectedPageId(duplicate.id);
    setEditorSelection(
      duplicate.sections[0]
        ? {
            kind: "section",
            pageId: duplicate.id,
            sectionId: duplicate.sections[0].id,
          }
        : null,
    );
    setExpandedPageIds((current) => new Set(current).add(duplicate.id));
  }

  function setHomepage(pageId: string) {
    if (editorLocked) return;

    setSite((current) => ({
      ...current,
      homePageId: pageId,
      pages: current.pages.map((page) =>
        page.id === pageId
          ? { ...page, slug: "" }
          : page.slug
          ? page
          : { ...page, slug: uniqueSlug(page.title, current.pages, page.id) },
      ),
    }));
  }

  function deletePage(pageId: string) {
    if (editorLocked) return;

    if (site.pages.length <= 1 || pageId === site.homePageId) return;

    const pageIndex = site.pages.findIndex((page) => page.id === pageId);
    const nextPage =
      site.pages[pageIndex + 1] ??
      site.pages[pageIndex - 1] ??
      site.pages.find((page) => page.id !== pageId);
    if (!nextPage) return;

    setSite((current) => ({
      ...current,
      pages: current.pages.filter((page) => page.id !== pageId),
    }));

    if (selectedPageId === pageId) {
      setSelectedPageId(nextPage.id);
      setEditorSelection(
        nextPage.sections[0]
          ? {
              kind: "section",
              pageId: nextPage.id,
              sectionId: nextPage.sections[0].id,
            }
          : null,
      );
    }
  }

  function addCardToSection(
    pageId: string,
    sectionId: string,
  ) {
    if (editorLocked) {
      return;
    }

    const item =
      createBlankSiteCardItem();

    setSite((current) => ({
      ...current,
      pages:
        current.pages.map(
          (page) => {
            if (
              page.id !== pageId
            ) {
              return page;
            }

            return {
              ...page,
              sections:
                page.sections.map(
                  (section) => {
                    if (
                      section.id !==
                        sectionId ||
                      section.type !==
                        "cards"
                    ) {
                      return section;
                    }

                    const items =
                      Array.isArray(
                        section
                          .content
                          .items,
                      )
                        ? section
                            .content
                            .items
                        : [];

                    return {
                      ...section,
                      content: {
                        ...section
                          .content,
                        items: [
                          ...items,
                          item,
                        ],
                      },
                    };
                  },
                ),
            };
          },
        ),
    }));

    setSelectedPageId(
      pageId,
    );

    setSiteChromeSelection(
      null,
    );

    setEditorSelection({
      kind: "block",
      pageId,
      sectionId,
      blockId: item.id,
    });

    setActiveInspectorMode(
      "content",
    );

    setExpandedPageIds(
      (current) =>
        new Set(
          current,
        ).add(
          pageId,
        ),
    );

    setExpandedSectionIds(
      (current) =>
        new Set(
          current,
        ).add(
          sectionId,
        ),
    );
  }

  function updateSelectedSectionContent(
    key: string,
    value: unknown,
  ) {
    if (editorLocked) return;
    if (!selectedPage || !selectedSection) return;

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id !== selectedPage.id
          ? page
          : {
              ...page,
              sections: page.sections.map((section) =>
                section.id !== selectedSection.id
                  ? section
                  : {
                      ...section,
                      content: {
                        ...section.content,
                        [key]: value,
                      },
                    },
              ),
            },
      ),
    }));
  }

  const updateSectionContent = useCallback((
    pageId: string,
    sectionId: string,
    key: string,
    value: string,
  ) => {
    if (editorLocked) return;

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id !== pageId
        ? page
        : {
              ...page,
              sections: page.sections.map((section) =>
                section.id !== sectionId
                  ? section
                  : {
                      ...section,
                      content: {
                        ...section.content,
                        [key]: value,
                      },
                    },
              ),
            },
      ),
    }));
  }, [editorLocked]);

  function updateSelectedSection(
    updater: (section: SiteSection) => SiteSection,
  ) {
    if (editorLocked) return;
    if (!selectedPage || !selectedSection) return;

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id !== selectedPage.id
          ? page
          : {
              ...page,
              sections: page.sections.map((section) =>
                section.id === selectedSection.id
                  ? updater(section)
                  : section,
              ),
            },
      ),
    }));
  }

  function toggleSelectedSectionVisibility() {
    updateSelectedSection((section) => ({
      ...section,
      visible: !section.visible,
    }));
  }

  function toggleSectionVisibility(pageId: string, sectionId: string) {
    if (editorLocked) return;

    const page = site.pages.find((candidate) => candidate.id === pageId);
    if (!page) return;

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id !== pageId
          ? page
          : {
              ...page,
              sections: page.sections.map((section) =>
                section.id === sectionId
                  ? { ...section, visible: !section.visible }
                  : section,
              ),
          },
      ),
    }));
    setSelectedPageId(pageId);
    setEditorSelection({ kind: "section", pageId, sectionId });
    setExpandedPageIds((current) => new Set(current).add(pageId));
  }

  function moveSelectedSection(direction: "up" | "down") {
    if (
      !selectedPage ||
      !selectedSection ||
      selectedSectionIndex === undefined ||
      selectedSectionIndex < 0
    ) {
      return;
    }

    const nextIndex =
      direction === "up"
        ? selectedSectionIndex - 1
        : selectedSectionIndex + 1;

    if (nextIndex < 0 || nextIndex >= selectedPage.sections.length) {
      return;
    }

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== selectedPage.id) return page;

        const sections = [...page.sections];
        const [moved] = sections.splice(selectedSectionIndex, 1);
        sections.splice(nextIndex, 0, moved);

        return {
          ...page,
          sections,
        };
      }),
    }));
  }

  function moveSection(
    pageId: string,
    sectionId: string,
    direction: "up" | "down",
  ) {
    if (editorLocked) return;

    const page = site.pages.find((candidate) => candidate.id === pageId);
    if (!page) return;

    const currentIndex = page.sections.findIndex(
      (section) => section.id === sectionId,
    );
    if (currentIndex < 0) return;

    const nextIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= page.sections.length) return;

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== pageId) return page;

        const sections = [...page.sections];
        const [moved] = sections.splice(currentIndex, 1);
        sections.splice(nextIndex, 0, moved);

        return {
          ...page,
          sections,
        };
      }),
    }));
    setSelectedPageId(pageId);
    setEditorSelection({ kind: "section", pageId, sectionId });
    setExpandedPageIds((current) => new Set(current).add(pageId));
  }

  function deleteSelectedSection() {
    if (editorLocked) return;
    if (!selectedPage || !selectedSection) return;

    const nextSelection =
      selectedPage.sections.find(
        (section) => section.id !== selectedSection.id,
      )?.id ?? "";

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id !== selectedPage.id
          ? page
          : {
              ...page,
              sections: page.sections.filter(
                (section) => section.id !== selectedSection.id,
              ),
            },
      ),
    }));
    setEditorSelection(
      nextSelection
        ? {
            kind: "section",
            pageId: selectedPage.id,
            sectionId: nextSelection,
          }
        : null,
    );
  }

  function deleteSection(pageId: string, sectionId: string) {
    if (editorLocked) return;

    const page = site.pages.find((candidate) => candidate.id === pageId);
    if (!page) return;

    const nextSelection =
      page.sections.find((section) => section.id !== sectionId)?.id ??
      "";

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id !== pageId
          ? page
          : {
              ...page,
              sections: page.sections.filter(
                (section) => section.id !== sectionId,
              ),
          },
      ),
    }));
    setSelectedPageId(pageId);
    setEditorSelection(
      selectedPageId === pageId && selectedSection?.id !== sectionId
        ? editorSelection
        : nextSelection
        ? { kind: "section", pageId, sectionId: nextSelection }
        : null,
    );
    setExpandedPageIds((current) => new Set(current).add(pageId));
  }

  function duplicateSelectedSection() {
    if (editorLocked) return;
    if (!selectedPage || !selectedSection) return;

    const duplicate: SiteSection = JSON.parse(
      JSON.stringify(selectedSection),
    ) as SiteSection;
    duplicate.id = createDuplicateSectionId(selectedSection.id);
    duplicate.label = `${selectedSection.label} copy`;
    duplicate.visible = true;

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== selectedPage.id) return page;

        const insertIndex =
          selectedSectionIndex === undefined || selectedSectionIndex < 0
            ? page.sections.length
            : selectedSectionIndex + 1;
        const sections = [...page.sections];
        sections.splice(insertIndex, 0, duplicate);

        return {
          ...page,
          sections,
        };
      }),
    }));
    setEditorSelection({
      kind: "section",
      pageId: selectedPage.id,
      sectionId: duplicate.id,
    });
  }

  function duplicateSection(pageId: string, sectionId: string) {
    if (editorLocked) return;

    const page = site.pages.find((candidate) => candidate.id === pageId);
    if (!page) return;

    const sourceSection = page.sections.find(
      (section) => section.id === sectionId,
    );
    if (!sourceSection) return;

    const duplicate: SiteSection = JSON.parse(
      JSON.stringify(sourceSection),
    ) as SiteSection;
    duplicate.id = createDuplicateSectionId(sourceSection.id);
    duplicate.label = `${sourceSection.label} copy`;
    duplicate.visible = true;

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== pageId) return page;

        const currentIndex = page.sections.findIndex(
          (section) => section.id === sectionId,
        );
        const insertIndex =
          currentIndex < 0 ? page.sections.length : currentIndex + 1;
        const sections = [...page.sections];
        sections.splice(insertIndex, 0, duplicate);

        return {
          ...page,
          sections,
        };
      }),
    }));
    setSelectedPageId(pageId);
    setEditorSelection({ kind: "section", pageId, sectionId: duplicate.id });
    setExpandedPageIds((current) => new Set(current).add(pageId));
  }

  function addSection(type: AddableSiteSectionType, variant: string) {
    if (editorLocked) return;

    const targetPage =
      site.pages.find((page) => page.id === sectionInsertionPageId) ??
      selectedPage;
    if (!targetPage) return;

    const requestedInsertIndex =
      sectionInsertionIndex === null
        ? targetPage.sections.length
        : sectionInsertionIndex;
    const boundedInsertIndex = Math.max(
      0,
      Math.min(requestedInsertIndex, targetPage.sections.length),
    );
    const section = createSiteSection({
      pageId: targetPage.id,
      type,
      variant,
      existingIds: targetPage.sections.map((candidate) => candidate.id),
    });

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== targetPage.id) return page;

        const sections = [...page.sections];
        sections.splice(boundedInsertIndex, 0, section);

        return {
          ...page,
          sections,
        };
      }),
    }));
    setSelectedPageId(targetPage.id);
    setEditorSelection({
      kind: "section",
      pageId: targetPage.id,
      sectionId: section.id,
    });
    setExpandedPageIds((current) => new Set(current).add(targetPage.id));
    closeSectionLibrary();
  }

  async function loadSourceListings() {
    setSourceStatus("loading");
    setSourceError(null);

    try {
      const response = await fetch("/api/source/listings");
      const payload = (await response.json()) as ListingsResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load Source listings.");
      }

      setSourceListings(payload.listings ?? []);
      setSourceStatus("loaded");
    } catch (error) {
      setSourceStatus("error");
      setSourceError(
        error instanceof Error
          ? error.message
          : "Unable to load Source listings.",
      );
    }
  }

  function updateSelectedSectionSource(
    source: SiteDataSource,
  ) {
    if (editorLocked) {
      return;
    }

    updateSelectedSection(
      (section) => ({
        ...section,
        source,
      }),
    );
  }

  function updateSelectedSectionLayout(
    key: keyof SiteSectionLayoutConfig,
    value: SiteSectionLayoutConfig[keyof SiteSectionLayoutConfig],
  ) {
    updateSelectedSection((section) => {
      if (key === "variant" && typeof value === "string") {
        return changeSectionVariant(section, value);
      }

      return {
        ...section,
        layout: {
          ...section.layout,
          [key]: value,
        },
      };
    });
  }

  function updateSelectedSectionStyle(
    key: keyof SiteSectionStyleConfig,
    value: SiteSectionStyleConfig[keyof SiteSectionStyleConfig],
  ) {
    updateSelectedSection((section) => ({
      ...section,
      style: {
        ...section.style,
        [key]: value,
      },
    }));
  }

  function toggleSourceListing(
    listingId: string,
    listingType: "product" | "service",
  ) {
    if (editorLocked) return;

    updateSelectedSection((section) => {
      if (
        section.source.kind !== "source" ||
        section.source.listingType !== listingType
      ) {
        return section;
      }

      const currentIds = section.source.listingIds ?? [];
      const listingIds = currentIds.includes(listingId)
        ? currentIds.filter((id) => id !== listingId)
        : [...currentIds, listingId];

      return {
        ...section,
        source: {
          ...section.source,
          mode: "selected",
          listingIds,
        },
      };
    });
  }

  async function publishSite() {
    if (editorLocked || publishRequestStatus === "publishing") {
      return;
    }

    setPublishRequestStatus("publishing");
    setPublishError(null);

    try {
      const response = await fetch("/api/site-builder/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ site }),
      });

      const payload = (await response.json()) as {
        site?: SiteDocument;
        publishedAt?: string;
        error?: string;
      };

      if (!response.ok || !payload.site) {
        throw new Error(payload.error ?? "Unable to publish site.");
      }

      setPublishedSiteJson(JSON.stringify(payload.site));
      setPublishedAt(payload.publishedAt ?? new Date().toISOString());
      setPublishRequestStatus("ready");
    } catch (error) {
      setPublishError(
        error instanceof Error
          ? error.message
          : "Unable to publish site.",
      );
      setPublishRequestStatus("error");
    }
  }

  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewAvailableWidth, setPreviewAvailableWidth] = useState(0);
  const [previewAvailableHeight, setPreviewAvailableHeight] = useState(0);

  const postPreviewState = useCallback(() => {
    const previewWindow = previewIframeRef.current?.contentWindow;
    if (!previewWindow) return;

    previewWindow.postMessage(
      createSitePreviewStateMessage({
        site,
        selectedPageId: selectedPage?.id ?? site.homePageId,
        sourceListings,
      }),
      window.location.origin,
    );
  }, [selectedPage?.id, site, sourceListings]);

  const postPreviewActiveSelection = useCallback(() => {
    const previewWindow = previewIframeRef.current?.contentWindow;
    if (!previewWindow) return;

    previewWindow.postMessage(
      createSitePreviewActiveSelectionMessage(editorSelection),
      window.location.origin,
    );
  }, [editorSelection]);

  const postPreviewInitialMessages = useCallback(() => {
    postPreviewState();
    postPreviewActiveSelection();

    window.requestAnimationFrame(() => {
      applyThemeToPreview(
        getSiteThemeConfig(site),
      );
    });
  }, [
    postPreviewActiveSelection,
    postPreviewState,
    site,
  ]);

  useEffect(() => {
    const stageNode = previewStageRef.current;
    if (!stageNode) return;

    const updatePreviewMetrics = () => {
      // Stage uses p-6 = 24px on each side.
      setPreviewAvailableWidth(
        Math.max(1, Math.floor(stageNode.clientWidth - 48)),
      );
      setPreviewAvailableHeight(
        Math.max(1, Math.floor(stageNode.clientHeight - 48)),
      );
    };

    updatePreviewMetrics();

    const observer = new ResizeObserver(updatePreviewMetrics);
    observer.observe(stageNode);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    postPreviewState();

    window.requestAnimationFrame(() => {
      applyThemeToPreview(
        getSiteThemeConfig(site),
      );
    });
  }, [
    postPreviewState,
    previewMode,
    selectedPage?.id,
    site,
  ]);

  useEffect(() => {
    postPreviewActiveSelection();
  }, [postPreviewActiveSelection, previewMode, selectedPage?.id]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== previewIframeRef.current?.contentWindow) return;

      if (
        isSitePreviewReadyMessage(
          event.data,
        )
      ) {
        postPreviewInitialMessages();
        return;
      }

      if (
        isSitePreviewSectionInsertRequestMessage(
          event.data,
        )
      ) {
        const {
          pageId,
          insertionIndex,
        } =
          event.data.payload;

        const page =
          site.pages.find(
            (candidate) =>
              candidate.id ===
              pageId,
          );

        if (!page) {
          return;
        }

        const boundedIndex =
          Math.max(
            0,
            Math.min(
              insertionIndex,
              page.sections.length,
            ),
          );

        setSelectedPageId(
          page.id,
        );

        setExpandedPageIds(
          (current) =>
            new Set(
              current,
            ).add(
              page.id,
            ),
        );

        setSectionInsertionPageId(
          page.id,
        );

        setSectionInsertionIndex(
          boundedIndex,
        );

        setShowSectionLibrary(
          true,
        );

        return;
      }

      if (isSitePreviewContentEditRequestMessage(event.data)) {
        const { pageId, sectionId, field, value } = event.data.payload;
        const page = site.pages.find((candidate) => candidate.id === pageId);
        const section = page?.sections.find(
          (candidate) => candidate.id === sectionId,
        );

        if (!page || !section) return;
        if (!sectionTypeSupportsInlineEditField(section.type, field)) return;

        updateSectionContent(page.id, section.id, field, value);
        return;
      }

      if (!isSitePreviewSelectionRequestMessage(event.data)) return;

      const {
        pageId,
        sectionId,
        node,
        blockId,
      } = event.data.payload;
      const page = site.pages.find((candidate) => candidate.id === pageId);
      const section = page?.sections.find(
        (candidate) => candidate.id === sectionId,
      );

      if (!page || !section) return;

      if (blockId) {
        const selectable =
          getSectionBlockNavigationChildren(
            section,
          ).some(
            (child) =>
              child.kind === "block" &&
              child.id === blockId,
          );

        if (!selectable) return;

        selectSectionBlock(
          page.id,
          section.id,
          blockId,
        );
        return;
      }

      if (node) {
        if (!sectionSupportsContentNode(section, node)) return;
        selectSectionContentChild(page.id, section.id, node);
        return;
      }

      selectSection(page.id, section.id);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    postPreviewInitialMessages,
    site.pages,
    updateSectionContent,
  ]);

  const previewLogicalWidth = previewModes[previewMode].width;
  const previewLogicalHeight =
    previewModes[previewMode].viewportHeight ?? 900;

  const previewWidthScale =
    previewAvailableWidth > 0
      ? previewAvailableWidth / previewLogicalWidth
      : 1;

  const previewHeightScale =
    previewAvailableHeight > 0
      ? previewAvailableHeight / previewLogicalHeight
      : 1;

  const previewScale =
    previewMode === "desktop"
      ? Math.min(1, previewWidthScale)
      : Math.min(
          1,
          previewWidthScale,
          previewHeightScale,
        );

  // Desktop should use the full available editor height instead of
  // preserving a short fixed preview viewport. Keep the visual scale
  // determined by width, then expand the iframe's logical viewport
  // vertically to fill the remaining preview stage.
  const previewRenderedLogicalHeight =
    previewMode === "desktop" &&
    previewAvailableHeight > 0 &&
    previewScale > 0
      ? Math.max(
          previewLogicalHeight,
          Math.floor(
            previewAvailableHeight /
              previewScale,
          ),
        )
      : previewLogicalHeight;

  const previewFrameWidth = Math.ceil(
    previewLogicalWidth * previewScale,
  );
  const previewFrameHeight = Math.ceil(
    previewRenderedLogicalHeight *
      previewScale,
  );

  const selectedProductIds =
    selectedSection?.source.kind === "source" &&
    selectedSection.source.listingType === "product"
      ? selectedSection.source.listingIds ?? []
      : [];
  const selectedServiceIds =
    selectedSection?.source.kind === "source" &&
    selectedSection.source.listingType === "service"
      ? selectedSection.source.listingIds ?? []
      : [];

  useEffect(() => {
    if (
      selectedSection &&
      activeInspectorMode === "design" &&
      (selectedContentNode || !sectionHasDesignControls(selectedSection))
    ) {
      setActiveInspectorMode("content");
    }
  }, [activeInspectorMode, selectedContentNode, selectedSection]);

  useEffect(() => {
    if (!editorSelection) return;

    const page = site.pages.find(
      (candidate) => candidate.id === editorSelection.pageId,
    );
    if (!page) {
      setEditorSelection(null);
      return;
    }

    const section = page.sections.find(
      (candidate) => candidate.id === editorSelection.sectionId,
    );
    if (!section) {
      setEditorSelection(
        page.sections[0]
          ? {
              kind: "section",
              pageId: page.id,
              sectionId: page.sections[0].id,
            }
          : null,
      );
      return;
    }

    if (
      editorSelection.kind === "content" &&
      !sectionSupportsContentNode(section, editorSelection.node)
    ) {
      setEditorSelection({
        kind: "section",
        pageId: page.id,
        sectionId: section.id,
      });
    }
  }, [editorSelection, site.pages]);

  useEffect(() => {
    if (!selectedPage?.id) return;

    setExpandedPageIds((current) => {
      if (current.has(selectedPage.id)) return current;

      return new Set(current).add(selectedPage.id);
    });
  }, [selectedPage?.id]);

  const editingPage = editingPageId
    ? site.pages.find((page) => page.id === editingPageId)
    : null;
  const pageDialogTitle = editingPage ? "Page settings" : "New page";
  const pageDialogSlug = editingPage?.id === site.homePageId
    ? ""
    : sanitizeSlug(pageDraftSlug || pageDraftTitle);
  const pageDialogSlugDuplicate =
    pageDialogSlug !== "" &&
    isDuplicateSlug(pageDialogSlug, site.pages, editingPage?.id);
  const pageDialogCanSave =
    pageDraftTitle.trim().length > 0 &&
    (editingPage?.id === site.homePageId ||
      (pageDialogSlug.length > 0 && !pageDialogSlugDuplicate));
  const sectionInsertionLabel =
    sectionInsertionIndex === null || !sectionInsertionPage
      ? "Adds a section to the end of this page."
      : sectionInsertionIndex >= sectionInsertionPage.sections.length
      ? "Adds a section to the end of this page."
      : sectionInsertionIndex <= 0
      ? `Inserts before ${sectionInsertionPage.sections[0]?.label ?? "the first section"}.`
      : `Inserts after ${sectionInsertionPage.sections[sectionInsertionIndex - 1]?.label ?? "the selected section"}.`;
  const draftStatusLabel =
    draftLoadStatus === "loading"
      ? "Loading draft"
      : draftLoadStatus === "error"
      ? "Draft load failed"
      : draftSaveStatus === "saving"
      ? "Saving"
      : draftSaveStatus === "saved"
      ? "Saved"
      : draftSaveStatus === "error"
      ? "Save failed"
      : "Draft ready";
  const DraftStatusIcon =
    draftLoadStatus === "loading" || draftSaveStatus === "saving"
      ? Loader2
      : draftLoadStatus === "error" || draftSaveStatus === "error"
      ? AlertTriangle
      : draftSaveStatus === "saved"
      ? CheckCircle2
      : Globe2;
  const draftStatusTitle =
    draftLoadStatus === "error"
      ? draftLoadError ?? draftStatusLabel
      : draftSaveStatus === "error"
      ? draftSaveError ?? draftStatusLabel
      : draftStatusLabel;
  const draftLoadNoticeTitle =
    draftLoadStatus === "error" ? "Draft load failed" : "Loading draft";
  const draftLoadNoticeBody =
    draftLoadStatus === "error"
      ? draftLoadError ?? "Unable to load site draft."
      : "Editor controls unlock after the saved draft is loaded.";
  const currentSiteJson = JSON.stringify(site);
  const siteIsPublished = publishedSiteJson !== null;
  const hasUnpublishedChanges =
    siteIsPublished && publishedSiteJson !== currentSiteJson;
  const publishLabel =
    publishRequestStatus === "checking"
      ? "Checking…"
      : publishRequestStatus === "publishing"
      ? "Publishing…"
      : !siteIsPublished
      ? "Publish"
      : hasUnpublishedChanges
      ? "Publish changes"
      : "Published";
  const siteHandleValid = isValidSiteHandle(site.handle);
  const publishTitle =
    !siteHandleValid
      ? "Enter a valid public handle before publishing."
      : publishRequestStatus === "error"
      ? publishError ?? "Publication failed"
      : publishedAt && !hasUnpublishedChanges
      ? `Published ${new Date(publishedAt).toLocaleString()}`
      : hasUnpublishedChanges
      ? "The draft has changes that are not live yet."
      : "Publish this site.";

  return (
    <div className="min-h-screen bg-[#08090a] text-zinc-100 lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
      <SectionLibrary
        open={showSectionLibrary && !editorLocked}
        insertionLabel={sectionInsertionLabel}
        onClose={closeSectionLibrary}
        onInsert={addSection}
      />

      {showPageDialog ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-24">
          <div className="w-full max-w-[360px] rounded-lg border border-white/[0.1] bg-[#111214] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium text-zinc-100">
                  {pageDialogTitle}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                  {editingPage?.id === site.homePageId
                    ? "The homepage resolves at /."
                    : "Set the page name and URL slug."}
                </p>
              </div>
              <button
                type="button"
                onClick={closePageDialog}
                className="rounded-md px-2 py-1 text-[11px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <TextInput
                id="site-page-title"
                label="Page name"
                value={pageDraftTitle}
                onChange={updatePageDraftTitle}
                placeholder="About"
              />

              <div>
                <TextInput
                  id="site-page-slug"
                  label="URL slug"
                  value={
                    editingPage?.id === site.homePageId
                      ? ""
                      : pageDraftSlug
                  }
                  onChange={updatePageDraftSlug}
                  placeholder="about"
                />
                <p className="mt-1.5 text-[10px] text-zinc-600">
                  {editingPage?.id === site.homePageId
                    ? "/"
                    : `/${pageDialogSlug || "page"}`}
                </p>
                {pageDialogSlugDuplicate ? (
                  <p className="mt-1.5 text-[10px] text-red-200/80">
                    That slug is already in use.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closePageDialog}
                className="h-8 rounded-md border border-white/[0.08] px-3 text-[11px] text-zinc-400 transition hover:border-white/[0.16] hover:text-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePageDraft}
                disabled={!pageDialogCanSave}
                className="h-8 rounded-md bg-zinc-100 px-3 text-[11px] font-medium text-black transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {editingPage ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-[100dvh] bg-[#090a0b] lg:hidden">
        <SiteCatalogInspector
          site={site}
          onCatalogChange={
            updateSiteCatalog
          }
          mobile
        />
      </div>

      <div className="hidden h-full min-h-0 overflow-hidden lg:grid lg:grid-cols-[240px_minmax(0,1fr)_310px]">
        {/* LEFT: site tree */}
        <aside
          className={`h-full min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y border-r border-white/[0.07] bg-[#090a0b] [-webkit-overflow-scrolling:touch] ${
            editorLocked ? "pointer-events-none select-none opacity-60" : ""
          }`}
        >
          <div className="border-b border-white/[0.06] p-2.5">
            <button
              type="button"
              onClick={() =>
                selectSiteChrome("site")
              }
              className={`flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left transition ${
                siteChromeSelection === "site"
                  ? "bg-white/[0.055]"
                  : "hover:bg-white/[0.025]"
              }`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                  siteChromeSelection === "site"
                    ? "border-white/[0.12] bg-white/[0.05]"
                    : "border-white/[0.06] bg-white/[0.018]"
                }`}
              >
                <Globe2
                  className={`h-3.5 w-3.5 ${
                    siteChromeSelection === "site"
                      ? "text-zinc-200"
                      : "text-zinc-500"
                  }`}
                />
              </div>

              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-zinc-200">
                  {site.name || "Untitled site"}
                </p>

                <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-zinc-700">
                  Site settings
                </p>
              </div>
            </button>
          </div>

          <div className="border-b border-white/[0.06] p-2.5">
            <div className="grid grid-cols-2 gap-1 rounded-md bg-black/20 p-1">
              <button
                type="button"
                onClick={() => {
                  setRailMode("structure");

                  if (
                    siteChromeSelection === "design"
                  ) {
                    setSiteChromeSelection(null);
                    setEditorSelection(null);
                  }
                }}
                className={`h-7 rounded text-[11px] font-medium transition ${
                  railMode === "structure"
                    ? "bg-white/[0.09] text-zinc-100 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-300"
                }`}
              >
                Structure
              </button>

              <button
                type="button"
                onClick={() =>
                  selectSiteChrome("design")
                }
                className={`h-7 rounded text-[11px] font-medium transition ${
                  railMode === "design"
                    ? "bg-white/[0.09] text-zinc-100 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-300"
                }`}
              >
                Design
              </button>
            </div>
          </div>

          {railMode === "design" ? (
            <div className="p-2.5">
              <button
                type="button"
                onClick={() =>
                  selectSiteChrome("design")
                }
                className="flex w-full items-center gap-2.5 rounded-md bg-white/[0.05] px-2.5 py-2.5 text-left"
              >
                <Palette className="h-3.5 w-3.5 shrink-0 text-zinc-400" />

                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-zinc-100">
                    Theme
                  </p>

                  <p className="mt-0.5 truncate text-[10px] text-zinc-600">
                    Color, typography, layout
                  </p>
                </div>
              </button>
            </div>
          ) : null}

          <div
            className={
              railMode === "structure"
                ? "px-2.5 pt-2"
                : "hidden"
            }
          >
<button
              type="button"
              onClick={() => selectSiteChrome("inquiries")}
              className={`mb-1 flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[12px] transition ${
                siteChromeSelection === "inquiries"
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
              }`}
            >
              <Mail className="h-3.5 w-3.5 text-zinc-500" />
              <span className="min-w-0 flex-1 font-medium">
                Inquiries
              </span>
              {newInquiryCount > 0 ? (
                <span className="rounded-full bg-white/[0.1] px-1.5 py-0.5 text-[9px] text-zinc-300">
                  {newInquiryCount}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() =>
                selectSiteChrome(
                  "catalog",
                )
              }
              className={`mb-1 flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[12px] transition ${
                siteChromeSelection ===
                "catalog"
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
              }`}
            >
              <Package className="h-3.5 w-3.5 text-zinc-500" />

              <span className="min-w-0 flex-1 font-medium">
                Catalog
              </span>

              {site.catalog?.items
                .length ? (
                <span className="text-[9px] tabular-nums text-zinc-700">
                  {
                    site.catalog
                      .items.length
                  }
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => selectSiteChrome("header")}
              className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[12px] transition ${
                siteChromeSelection === "header"
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
              }`}
            >
              <Globe2 className="h-3.5 w-3.5 text-zinc-500" />
              <span className="font-medium">Header</span>
            </button>

            <div className="ml-[17px] border-l border-white/[0.05] pl-2">
              <button
                type="button"
                onClick={() => selectSiteChrome("header")}
                className={`flex h-6 w-full items-center gap-2 rounded-sm px-2 text-left text-[11px] transition ${
                  siteChromeSelection === "header"
                    ? "bg-white/[0.04] text-zinc-100"
                    : "text-zinc-600 hover:bg-white/[0.02] hover:text-zinc-400"
                }`}
              >
                <Type className="h-3 w-3 text-zinc-700" />
                Brand
              </button>

              <button
                type="button"
                onClick={() => selectSiteChrome("navigation")}
                className={`flex h-6 w-full items-center gap-2 rounded-sm px-2 text-left text-[11px] transition ${
                  siteChromeSelection === "navigation"
                    ? "bg-white/[0.04] text-zinc-100"
                    : "text-zinc-600 hover:bg-white/[0.02] hover:text-zinc-400"
                }`}
              >
                <Menu className="h-3 w-3 text-zinc-700" />
                Navigation
              </button>
            </div>
          </div>

          <div
            className={
              railMode === "structure"
                ? "px-2.5 py-3"
                : "hidden"
            }
          >
            <div className="flex h-7 items-center px-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">
                Pages
              </p>
            </div>

            <div className="mt-1 space-y-px">
              {site.pages.map((page) => {
                const pageExpanded = expandedPageIds.has(page.id);
                const activePage = page.id === selectedPage?.id;
                const activePageRow =
                  activePage && !selectedSection && !siteChromeSelection;
                const isHomePage = page.id === site.homePageId;

                return (
                  <div key={page.id}>
                    <div
                      className={`group flex h-8 items-center gap-1 rounded pr-1 transition ${
                        activePageRow
                          ? "bg-white/[0.065] text-zinc-100"
                          : activePage
                          ? "bg-white/[0.018] text-zinc-200 hover:bg-white/[0.035]"
                          : "text-zinc-500 hover:bg-white/[0.025] hover:text-zinc-200"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => togglePageExpanded(page.id)}
                        className="flex h-8 w-6 shrink-0 items-center justify-center text-zinc-600 transition hover:text-zinc-200"
                        title={pageExpanded ? "Collapse page" : "Expand page"}
                      >
                        {pageExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => selectPage(page.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12.5px]"
                      >
                        <FileText
                          className={`h-3.5 w-3.5 shrink-0 ${
                            activePage ? "text-zinc-300" : "text-zinc-500"
                          }`}
                        />
                        <span className="truncate font-medium">
                          {page.title}
                        </span>
                        {isHomePage ? (
                          <Home className="h-3 w-3 shrink-0 text-zinc-600" />
                        ) : null}
                      </button>

                      <details className="relative shrink-0 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 open:opacity-100">
                        <summary
                          className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-100 [&::-webkit-details-marker]:hidden"
                          title="Page actions"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </summary>
                        <div className="absolute right-0 top-8 z-30 w-44 rounded-md border border-white/[0.1] bg-[#111214] p-1 shadow-2xl">
                          <InspectorMenuButton
                            icon={Pencil}
                            label="Page settings"
                            onClick={() => openPageSettings(page.id)}
                          />
                          <InspectorMenuButton
                            icon={Copy}
                            label="Duplicate"
                            onClick={() => duplicatePage(page.id)}
                          />
                          <InspectorMenuButton
                            icon={Home}
                            label="Set homepage"
                            onClick={() => setHomepage(page.id)}
                            disabled={isHomePage}
                          />
                          <InspectorMenuButton
                            icon={Trash2}
                            label="Delete"
                            onClick={() => deletePage(page.id)}
                            disabled={site.pages.length <= 1 || isHomePage}
                            danger
                          />
                        </div>
                      </details>
                    </div>

                    {pageExpanded ? (
                      <div className="ml-[17px] border-l border-white/[0.05] pl-2.5">
                        {page.sections.length === 0 ? (
                          <p className="h-8 px-2 pt-2 text-[11px] text-zinc-700">
                            Empty
                          </p>
                        ) : null}

                        {page.sections.map((section, index) => {
                          const active =
                            activePage && section.id === selectedSection?.id;
                          const activeSectionRow =
                            active && editorSelection?.kind === "section";
                          const activeSectionAncestor =
                            active &&
                            (
                              editorSelection?.kind === "content" ||
                              editorSelection?.kind === "block"
                            );
                          const canMoveUp = index > 0;
                          const canMoveDown = index < page.sections.length - 1;
                          const childNodes = getSectionNavigationChildren(section);
                          const sectionExpanded =
                            expandedSectionIds.has(section.id);
                          const SectionIcon =
                            getSectionTreeIcon(section.type);

                          return (
                            <div key={section.id}>
                              {index > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => openSectionLibrary(page.id, index)}
                                  className="group flex h-3 w-full items-center"
                                  title="Add section here"
                                >
                                  <span className="h-px flex-1 bg-transparent transition group-hover:bg-white/[0.14]" />
                                  <span className="mx-1 hidden h-[18px] w-[18px] items-center justify-center rounded-full border border-white/[0.16] bg-[#111214] text-zinc-400 shadow-sm group-hover:flex">
                                    <Plus className="h-3 w-3" />
                                  </span>
                                  <span className="h-px flex-1 bg-transparent transition group-hover:bg-white/[0.14]" />
                                </button>
                              ) : null}

                              <div
                                className={`group flex h-7 items-center gap-1 rounded pr-1 transition ${
                                  activeSectionRow
                                    ? "bg-white/[0.055] text-zinc-100"
                                    : activeSectionAncestor
                                    ? "bg-white/[0.025] text-zinc-200"
                                    : section.visible
                                    ? "text-zinc-500 hover:bg-white/[0.022] hover:text-zinc-300"
                                    : "text-zinc-700 hover:bg-white/[0.015] hover:text-zinc-500"
                                }`}
                              >
                                {childNodes.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleSectionExpanded(
                                        section.id,
                                      )
                                    }
                                    className="flex h-7 w-6 shrink-0 items-center justify-center text-zinc-700 transition hover:text-zinc-300"
                                    title={
                                      sectionExpanded
                                        ? "Collapse section"
                                        : "Expand section"
                                    }
                                  >
                                    {sectionExpanded ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="h-7 w-6 shrink-0" />
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    selectSection(
                                      page.id,
                                      section.id,
                                    )
                                  }
                                  className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left text-[11.5px]"
                                >
                                  <SectionIcon
                                    className={`h-3.5 w-3.5 shrink-0 ${
                                      activeSectionRow || activeSectionAncestor
                                        ? "text-zinc-300"
                                        : section.visible
                                        ? "text-zinc-600"
                                        : "text-zinc-800"
                                    }`}
                                  />
                                  <span
                                    className={`truncate ${
                                      activeSectionRow || activeSectionAncestor
                                        ? "font-medium"
                                        : "font-normal"
                                    }`}
                                  >
                                    {section.label}
                                  </span>
                                  {!section.visible ? (
                                    <EyeOff className="h-3 w-3 shrink-0 text-zinc-700" />
                                  ) : null}
                                </button>

                                <details className="relative shrink-0 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 open:opacity-100">
                                  <summary
                                    className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-100 [&::-webkit-details-marker]:hidden"
                                    title="Section actions"
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </summary>
                                  <div className="absolute right-0 top-8 z-30 w-40 rounded-md border border-white/[0.1] bg-[#111214] p-1 shadow-2xl">
                                    <InspectorMenuButton
                                      icon={Copy}
                                      label="Duplicate"
                                      onClick={() => duplicateSection(page.id, section.id)}
                                    />
                                    <InspectorMenuButton
                                      icon={ArrowUp}
                                      label="Move up"
                                      onClick={() => moveSection(page.id, section.id, "up")}
                                      disabled={!canMoveUp}
                                    />
                                    <InspectorMenuButton
                                      icon={ArrowDown}
                                      label="Move down"
                                      onClick={() => moveSection(page.id, section.id, "down")}
                                      disabled={!canMoveDown}
                                    />
                                    <InspectorMenuButton
                                      icon={section.visible ? EyeOff : Eye}
                                      label={section.visible ? "Hide" : "Show"}
                                      onClick={() => toggleSectionVisibility(page.id, section.id)}
                                    />
                                    <InspectorMenuButton
                                      icon={Trash2}
                                      label="Delete"
                                      onClick={() => deleteSection(page.id, section.id)}
                                      danger
                                    />
                                  </div>
                                </details>
                              </div>

                              {childNodes.length > 0 &&
                              sectionExpanded ? (
                                <div className="ml-[39px] border-l border-white/[0.04] pl-2">
                                  {childNodes.map((child) => {
                                    const ChildIcon = child.icon;
                                    const childActive =
                                      active &&
                                      (
                                        child.kind === "block"
                                          ? (
                                              editorSelection?.kind ===
                                                "block" &&
                                              editorSelection.blockId ===
                                                child.id
                                            )
                                          : (
                                              editorSelection?.kind ===
                                                "content" &&
                                              editorSelection.node ===
                                                child.id
                                            )
                                      );

                                    return (
                                      <button
                                        key={`${section.id}-${child.id}`}
                                        type="button"
                                        onClick={() => {
                                          if (
                                            child.kind ===
                                            "block"
                                          ) {
                                            selectSectionBlock(
                                              page.id,
                                              section.id,
                                              child.id,
                                            );
                                            return;
                                          }

                                          selectSectionContentChild(
                                            page.id,
                                            section.id,
                                            child.id,
                                          );
                                        }}
                                        className={`flex h-6 w-full items-center gap-2 rounded-sm px-2 text-left text-[11px] transition ${
                                          childActive
                                            ? "bg-white/[0.04] text-zinc-100"
                                            : active
                                            ? "text-zinc-400 hover:bg-white/[0.025] hover:text-zinc-200"
                                            : "text-zinc-600 hover:bg-white/[0.02] hover:text-zinc-400"
                                        }`}
                                      >
                                        <ChildIcon
                                          className={`h-3 w-3 shrink-0 ${
                                            childActive
                                              ? "text-zinc-300"
                                              : "text-zinc-700"
                                          }`}
                                        />
                                        <span
                                          className={`truncate ${
                                            childActive ? "font-medium" : "font-normal"
                                          }`}
                                        >
                                          {child.label}
                                        </span>
                                      </button>
                                    );
                                  })}

                                  {section.type ===
                                  "cards" ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        addCardToSection(
                                          page.id,
                                          section.id,
                                        )
                                      }
                                      className="mt-1 flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-[10px] text-zinc-700 transition hover:bg-white/[0.025] hover:text-zinc-300"
                                    >
                                      <Plus className="h-3 w-3" />

                                      <span>
                                        Add card
                                      </span>
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() =>
                            openSectionLibrary(
                              page.id,
                              page.sections.length,
                            )
                          }
                          className="group mt-1 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-zinc-600 transition hover:bg-white/[0.025] hover:text-zinc-300"
                        >
                          <span className="flex h-4 w-4 items-center justify-center rounded border border-white/[0.07] transition group-hover:border-white/[0.14]">
                            <Plus className="h-3 w-3" />
                          </span>

                          <span>Add section</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={openNewPageDialog}
                className="group mt-2 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-zinc-600 transition hover:bg-white/[0.025] hover:text-zinc-300"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded border border-white/[0.07] transition group-hover:border-white/[0.14]">
                  <Plus className="h-3 w-3" />
                </span>

                <span>Add page</span>
              </button>
            </div>
          </div>

          <div
            className={
              railMode === "structure"
                ? "border-t border-white/[0.05] px-2.5 py-3"
                : "hidden"
            }
          >
            <button
              type="button"
              onClick={() => selectSiteChrome("footer")}
              className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[12px] transition ${
                siteChromeSelection === "footer"
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-zinc-500" />
              <span className="font-medium">Footer</span>
            </button>
          </div>
        </aside>

        {/* CENTER: actual renderer */}
        <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#0c0d0e]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
            <div className="flex items-center gap-4 text-[11px] text-zinc-500">
              <span className="flex items-center gap-2">
                <Monitor className="h-3.5 w-3.5" />
                {previewModes[previewMode].label} preview
              </span>
              <span
                className={`flex items-center gap-2 ${
                  draftLoadStatus === "error" || draftSaveStatus === "error"
                    ? "text-red-200/80"
                    : draftSaveStatus === "saved"
                    ? "text-emerald-200/80"
                    : "text-zinc-500"
                }`}
                title={draftStatusTitle}
              >
                <DraftStatusIcon
                  className={`h-3.5 w-3.5 ${
                    draftLoadStatus === "loading" ||
                    draftSaveStatus === "saving"
                      ? "animate-spin"
                      : ""
                  }`}
                />
                {draftStatusLabel}
              </span>
              {draftLoadStatus === "error" ? (
                <button
                  type="button"
                  onClick={loadDraft}
                  className="h-7 rounded-md border border-red-200/20 px-2.5 text-[11px] font-medium text-red-100/80 transition hover:border-red-100/40 hover:bg-red-100/[0.06] hover:text-red-50"
                >
                  Retry draft load
                </button>
              ) : null}
            </div>

            <div className="flex rounded-md border border-white/[0.08] bg-black/20 p-1">
              {Object.entries(previewModes).map(([mode, config]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPreviewMode(mode as PreviewMode)}
                  className={`h-7 px-3 text-[11px] transition ${
                    previewMode === mode
                      ? "rounded bg-white/[0.1] text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {config.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={publishSite}
              disabled={
                editorLocked ||
                !siteHandleValid ||
                publishRequestStatus === "checking" ||
                publishRequestStatus === "publishing"
              }
              title={publishTitle}
              className={`flex h-7 items-center gap-2 rounded-md border px-2.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                publishRequestStatus === "error"
                  ? "border-red-200/20 text-red-100/80"
                  : siteIsPublished && !hasUnpublishedChanges
                  ? "border-emerald-200/15 text-emerald-100/75"
                  : "border-white/[0.1] text-zinc-300 hover:border-white/[0.2] hover:text-zinc-100"
              }`}
            >
              <Globe2 className="h-3.5 w-3.5" />
              {publishLabel}
            </button>

            <div className="flex items-center gap-4">
              <a
                href={getDraftPreviewHref(
                  site,
                  selectedPage?.id,
                )}
                target="_blank"
                rel="noreferrer"
                title="Open the latest saved draft as a real website"
                className="flex items-center gap-2 text-[11px] text-zinc-300 transition hover:text-white"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview draft
              </a>

              {siteIsPublished ? (
                <a
                  href={getPublicPageHref(
                    site,
                    selectedPage?.id,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  title="Open the currently published website"
                  className="flex items-center gap-2 text-[11px] text-zinc-600 transition hover:text-zinc-300"
                >
                  <Globe2 className="h-3.5 w-3.5" />
                  Published site
                </a>
              ) : (
                <span
                  title="Publish the site before opening the public version"
                  className="flex items-center gap-2 text-[11px] text-zinc-700"
                >
                  <Globe2 className="h-3.5 w-3.5" />
                  Not published
                </span>
              )}
            </div>
          </div>

          <div
            ref={previewStageRef}
            className="relative min-h-0 flex-1 overflow-hidden p-6"
          >
            {selectedPage && selectedPage.sections.length === 0 ? (
              <div className="flex min-h-[620px] items-center justify-center rounded-md border border-dashed border-white/[0.1] bg-black/25">
                <div className="text-center">
                  <p className="text-[18px] font-medium tracking-[-0.02em] text-zinc-100">
                    Start this page
                  </p>
                  <p className="mt-2 text-[12px] text-zinc-500">
                    Add a section to begin.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      openSectionLibrary(
                        selectedPage.id,
                        selectedPage.sections.length,
                      )
                    }
                    className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-white/[0.12] px-3 text-[12px] text-zinc-200 transition hover:border-white/[0.24] hover:bg-white/[0.05]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add section
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full w-full items-start justify-center">
                <div
                  className="relative mx-auto overflow-hidden rounded-md border border-white/[0.08] bg-black shadow-[0_24px_80px_rgba(0,0,0,0.4)]"
                  style={{
                    width: previewFrameWidth,
                    height: previewFrameHeight,
                  }}
                >
                  <iframe
                    ref={previewIframeRef}
                    key={`${selectedPage?.id ?? "site"}-${previewMode}`}
                    src="/site/preview"
                    onLoad={postPreviewInitialMessages}
                    className="absolute left-0 top-0 block origin-top-left border-0 bg-black"
                    style={{
                      width: previewLogicalWidth,
                      height: previewRenderedLogicalHeight,
                      transform: `scale(${previewScale})`,
                    }}
                  />
                </div>
              </div>
            )}
            {editorLocked ? (
              <div className="absolute inset-0 z-20 bg-black/[0.03]">
                <div className="absolute left-1/2 top-4 w-[min(360px,calc(100%-32px))] -translate-x-1/2 rounded-md border border-white/[0.1] bg-[#111214]/95 px-3 py-2.5 shadow-2xl backdrop-blur">
                  <div className="flex items-start gap-2.5">
                    <DraftStatusIcon
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        draftLoadStatus === "loading"
                          ? "animate-spin text-zinc-400"
                          : "text-red-200/80"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-zinc-100">
                        {draftLoadNoticeTitle}
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                        {draftLoadNoticeBody}
                      </p>
                    </div>
                    {draftLoadStatus === "error" ? (
                      <button
                        type="button"
                        onClick={loadDraft}
                        className="h-7 shrink-0 rounded-md border border-white/[0.12] px-2 text-[11px] text-zinc-200 transition hover:border-white/[0.22] hover:bg-white/[0.05]"
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </main>

        {/* RIGHT: selected section inspector */}
        <aside
          className={`h-full min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y border-l border-white/[0.07] bg-[#090a0b] [-webkit-overflow-scrolling:touch] ${
            editorLocked ? "pointer-events-none select-none opacity-60" : ""
          }`}
        >
          {siteChromeSelection === "inquiries" ? (
            <SiteInquiriesInspector
              inquiries={siteInquiries}
              status={inquiryLoadStatus}
              error={inquiryLoadError}
              onRefresh={() => {
                void loadSiteInquiries();
              }}
            />
          ) : siteChromeSelection === "catalog" ? (
            <SiteCatalogInspector
              site={site}
              onCatalogChange={
                updateSiteCatalog
              }
            />
          ) : siteChromeSelection ? (
            <SiteChromeInspector
              selection={siteChromeSelection}
              site={site}
              onSiteNameChange={updateSiteName}
              onSiteHandleChange={updateSiteHandle}
              onThemeChange={updateSiteTheme}
              onHeaderChange={updateSiteHeaderField}
              onFooterChange={updateSiteFooterField}
              onNavigationChange={updateSiteNavigation}
            />
          ) : selectedSection &&
            selectedBlockId &&
            selectedSection.type === "cards" ? (
            <CardBlockInspectorPanel
              site={site}
              section={selectedSection}
              blockId={selectedBlockId}
              onContentChange={updateSelectedSectionContent}
            />
          ) : selectedSection && selectedContentNode ? (
            <ContentNodeInspectorPanel
              site={site}
              section={selectedSection}
              node={selectedContentNode}
              onContentChange={updateSelectedSectionContent}
            />
          ) : selectedSection ? (
            <>
              <InspectorHeader
                pageTitle={selectedPage?.title ?? "Page"}
                section={selectedSection}
                canMoveUp={(selectedSectionIndex ?? 0) > 0}
                canMoveDown={
                  selectedPage
                    ? (selectedSectionIndex ?? -1) <
                      selectedPage.sections.length - 1
                    : false
                }
                canDelete={
                  Boolean(selectedPage)
                }
                onDuplicate={duplicateSelectedSection}
                onToggleVisible={toggleSelectedSectionVisibility}
                onMoveUp={() => moveSelectedSection("up")}
                onMoveDown={() => moveSelectedSection("down")}
                onDelete={deleteSelectedSection}
              />

              <div className="p-4">
                <div className="grid grid-cols-2 gap-1 rounded-md border border-white/[0.08] bg-black/20 p-1">
                  {inspectorModes.map((mode) => {
                    const disabled =
                      mode.id === "design" &&
                      !sectionHasDesignControls(selectedSection);

                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          if (!disabled) setActiveInspectorMode(mode.id);
                        }}
                        disabled={disabled}
                        className={`h-7 rounded text-[11px] transition disabled:cursor-not-allowed disabled:text-zinc-700 ${
                          activeInspectorMode === mode.id
                            ? "bg-white/[0.1] text-zinc-100"
                            : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">
                  {activeInspectorMode === "content" ? (
                    <InspectorContentPanel
                      site={site}
                      section={selectedSection}
                      onContentChange={updateSelectedSectionContent}
                      onSelectBlock={(blockId) =>
                        selectSectionBlock(
                          selectedPage.id,
                          selectedSection.id,
                          blockId,
                        )
                      }
                      onSourceChange={
                        updateSelectedSectionSource
                      }
                      sourceStatus={sourceStatus}
                      sourceError={sourceError}
                      sourceProducts={sourceProducts}
                      sourceServices={sourceServices}
                      selectedProductIds={selectedProductIds}
                      selectedServiceIds={selectedServiceIds}
                      onLoadSourceListings={loadSourceListings}
                      onToggleSourceListing={toggleSourceListing}
                    />
                  ) : null}

                  {activeInspectorMode === "design" ? (
                    <InspectorDesignPanel
                      section={selectedSection}
                      onLayoutChange={updateSelectedSectionLayout}
                      onStyleChange={updateSelectedSectionStyle}
                    />
                  ) : null}
                </div>
              </div>
            </>
          ) : selectedPage ? (
            <PageInspector
              site={site}
              page={selectedPage}
              onOpenSettings={() =>
                openPageSettings(
                  selectedPage.id,
                )
              }
              onDuplicate={() =>
                duplicatePage(
                  selectedPage.id,
                )
              }
              onSetHomepage={() =>
                setHomepage(
                  selectedPage.id,
                )
              }
              onDelete={() =>
                deletePage(
                  selectedPage.id,
                )
              }
            />
          ) : (
            <div className="p-4">
              <p className="text-[12px] leading-5 text-zinc-500">
                Select something to edit.
              </p>
            </div>
          )}
        </aside>
	      </div>
	    </div>
	  );
	}
