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
import { SectionVariantPicker } from "@/components/site-builder/SectionVariantPicker";
import { normalizeSourceListingCardProps } from "@/components/source/SourceListingCard";
import { mackValiSiteDocument } from "@/lib/site-builder/mackValiSite";
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
  getSiteThemeConfig,
} from "@/lib/site-builder/siteTheme";
import {
  createSitePreviewActiveSelectionMessage,
  createSitePreviewStateMessage,
  isSitePreviewContentEditRequestMessage,
  isSitePreviewHeightMessage,
  isSitePreviewSelectionRequestMessage,
  sectionTypeSupportsInlineEditField,
} from "@/lib/site-builder/previewMessages";
import {
  changeSectionVariant,
  createSiteSection,
  getDefaultSectionVariant,
  getSectionDefinition,
  type AddableSiteSectionType,
} from "@/lib/site-builder/sectionRegistry";
import type {
  SiteContentNodeId,
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
  | "header"
  | "navigation"
  | "footer";
type SectionNavigationChild = {
  id: SiteContentNodeId;
  label: string;
  icon: LucideIcon;
};

type SiteContentChangeHandler = (key: string, value: unknown) => void;

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
  desktop: { label: "Desktop", width: 1440, viewportHeight: null },
  tablet: { label: "Tablet", width: 768, viewportHeight: 1024 },
  mobile: { label: "Mobile", width: 390, viewportHeight: 844 },
};

const inspectorModes: Array<{ id: InspectorMode; label: string }> = [
  { id: "content", label: "Content" },
  { id: "design", label: "Design" },
];

function cloneInitialSite(): SiteDocument {
  return JSON.parse(
    JSON.stringify(mackValiSiteDocument),
  ) as SiteDocument;
}

function getInitialEditorSelection(site: SiteDocument): SiteEditorSelection | null {
  const page =
    site.pages.find((candidate) => candidate.id === site.homePageId) ??
    site.pages[0];
  const section = page?.sections[0];

  if (!page || !section) return null;

  return {
    kind: "section",
    pageId: page.id,
    sectionId: section.id,
  };
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

  if (section.type === "cta" || section.type === "contact") {
    return [
      { id: "text", label: "Text", icon: Type },
      { id: "button", label: "Button", icon: MousePointerClick },
    ];
  }

  if (section.type === "cards") {
    return [
      { id: "text", label: "Section text", icon: Type },
    ];
  }

  if (
    section.type === "faq" ||
    section.type === "testimonials"
  ) {
    return [
      { id: "text", label: "Section text", icon: Type },
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

    const candidate = item as Record<string, unknown>;

    if (typeof candidate.id !== "string") {
      return [];
    }

    const read = (key: string) =>
      typeof candidate[key] === "string"
        ? (candidate[key] as string)
        : "";

    return [
      {
        id: candidate.id,
        eyebrow: read("eyebrow"),
        title: read("title"),
        body: read("body"),
        imageUrl: read("imageUrl"),
        imagePath: read("imagePath"),
        imageAlt: read("imageAlt"),
        linkLabel: read("linkLabel"),
        linkHref: read("linkHref"),
        linkPageId: read("linkPageId"),
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

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-zinc-500">
        {label}
      </p>
      <div className="mt-1.5 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1 rounded-md border border-white/[0.08] bg-black/20 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-6 rounded text-[11px] transition ${
              value === option.value
                ? "bg-white/[0.1] text-zinc-100"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
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

function MediaEditor({
  section,
  onContentChange,
}: {
  site: SiteDocument;
  section: SiteSection;
  onContentChange: SiteContentChangeHandler;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mediaUrl = getContentString(section, "mediaUrl");
  const mediaAlt = getContentString(section, "mediaAlt");
  const mediaFit =
    getContentString(section, "mediaFit") === "cover" ? "cover" : "contain";

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);

    try {
      const result = await uploadSiteImage(file);
      onContentChange("mediaUrl", result.url);
      onContentChange("mediaPath", result.path);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Unable to upload image.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="relative aspect-[16/9] overflow-hidden rounded-md border border-white/[0.08] bg-black/30 bg-center bg-no-repeat"
        style={
          mediaUrl
            ? {
                backgroundImage: `url(${mediaUrl})`,
                backgroundSize: mediaFit,
              }
            : undefined
        }
      >
        {!mediaUrl ? (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-600">
            Using template media
          </div>
        ) : null}
      </div>

      <div className="flex gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-white/[0.1] px-3 text-[11px] text-zinc-300 transition hover:border-white/[0.2] hover:text-zinc-100">
          {uploading ? "Uploading…" : mediaUrl ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) return;

              void upload(file).finally(() => {
                input.value = "";
              });
            }}
          />
        </label>

        {mediaUrl ? (
          <button
            type="button"
            onClick={() => {
              onContentChange("mediaUrl", "");
              onContentChange("mediaPath", "");
            }}
            className="h-8 rounded-md border border-white/[0.08] px-3 text-[11px] text-zinc-500 transition hover:border-red-300/20 hover:text-red-200"
          >
            Remove
          </button>
        ) : null}
      </div>

      {uploadError ? (
        <p className="text-[11px] leading-4 text-red-200/80">{uploadError}</p>
      ) : null}

      <TextInput
        id={`site-${section.id}-media-alt`}
        label="Alt text"
        value={mediaAlt}
        onChange={(value) => onContentChange("mediaAlt", value)}
        placeholder="Describe this image"
      />

      <SegmentedControl
        label="Fit"
        value={mediaFit}
        options={[
          { label: "Contain", value: "contain" },
          { label: "Cover", value: "cover" },
        ]}
        onChange={(value) => onContentChange("mediaFit", value)}
      />
    </div>
  );
}

function CardsEditor({
  site,
  section,
  onContentChange,
}: {
  site: SiteDocument;
  section: SiteSection;
  onContentChange: SiteContentChangeHandler;
}) {
  const items = getCardItems(section);
  const [uploadingItemId, setUploadingItemId] =
    useState<string | null>(null);
  const [uploadError, setUploadError] =
    useState<string | null>(null);

  function setItems(nextItems: SiteCardItem[]) {
    onContentChange("items", nextItems);
  }

  function updateItem(
    itemId: string,
    updater: (item: SiteCardItem) => SiteCardItem,
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

  function addItem() {
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        eyebrow: "Project",
        title: "New card",
        body: "Describe this item.",
        imageUrl: "",
        imagePath: "",
        imageAlt: "",
        linkLabel: "View",
        linkHref: "#",
        linkPageId: "",
      },
    ]);
  }

  function duplicateItem(item: SiteCardItem) {
    const index = items.findIndex(
      (candidate) => candidate.id === item.id,
    );

    const copy: SiteCardItem = {
      ...item,
      id: crypto.randomUUID(),
      title: item.title
        ? `${item.title} copy`
        : "Card copy",
    };

    const next = [...items];
    next.splice(index + 1, 0, copy);
    setItems(next);
  }

  async function uploadImage(
    itemId: string,
    file: File,
  ) {
    setUploadingItemId(itemId);
    setUploadError(null);

    try {
      const result = await uploadSiteImage(file);

      updateItem(itemId, (item) => ({
        ...item,
        imageUrl: result.url,
        imagePath: result.path,
      }));
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to upload card image.",
      );
    } finally {
      setUploadingItemId(null);
    }
  }

  return (
    <div className="space-y-2">
      {uploadError ? (
        <p className="rounded-md border border-red-400/20 bg-red-400/[0.04] px-3 py-2 text-[11px] leading-4 text-red-200/80">
          {uploadError}
        </p>
      ) : null}

      {items.map((item, index) => (
        <details
          key={item.id}
          className="group rounded-md border border-white/[0.08] bg-black/20"
          open={items.length <= 2}
        >
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-2.5 text-[11px] text-zinc-300 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition group-open:rotate-90" />

            {item.imageUrl ? (
              <span
                className="h-5 w-6 shrink-0 rounded-sm border border-white/[0.08] bg-cover bg-center"
                style={{
                  backgroundImage: `url(${item.imageUrl})`,
                }}
              />
            ) : (
              <span className="flex h-5 w-6 shrink-0 items-center justify-center rounded-sm border border-white/[0.08]">
                <ImageIcon className="h-3 w-3 text-zinc-700" />
              </span>
            )}

            <span className="min-w-0 flex-1 truncate font-medium">
              {item.title || `Card ${index + 1}`}
            </span>

            <span className="text-[10px] text-zinc-700">
              {index + 1}
            </span>
          </summary>

          <div className="space-y-3 border-t border-white/[0.06] p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <TextInput
                id={`site-card-eyebrow-${item.id}`}
                label="Eyebrow"
                value={item.eyebrow}
                onChange={(value) =>
                  updateItem(item.id, (current) => ({
                    ...current,
                    eyebrow: value,
                  }))
                }
              />

              <TextInput
                id={`site-card-title-${item.id}`}
                label="Title"
                value={item.title}
                onChange={(value) =>
                  updateItem(item.id, (current) => ({
                    ...current,
                    title: value,
                  }))
                }
              />
            </div>

            <TextAreaInput
              id={`site-card-body-${item.id}`}
              label="Description"
              value={item.body}
              rows={3}
              onChange={(value) =>
                updateItem(item.id, (current) => ({
                  ...current,
                  body: value,
                }))
              }
            />

            <div>
              <FieldLabel>Image</FieldLabel>

              {item.imageUrl ? (
                <div className="mt-1.5 overflow-hidden rounded-md border border-white/[0.08] bg-black/30">
                  <div
                    className="h-24 bg-contain bg-center bg-no-repeat"
                    style={{
                      backgroundImage: `url(${item.imageUrl})`,
                    }}
                  />

                  <div className="flex gap-2 border-t border-white/[0.06] p-2">
                    <label className="flex h-7 cursor-pointer items-center rounded border border-white/[0.09] px-2 text-[10px] text-zinc-400 hover:text-zinc-100">
                      {uploadingItemId === item.id
                        ? "Uploading…"
                        : "Replace"}

                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                        disabled={uploadingItemId !== null}
                        className="hidden"
                        onChange={(event) => {
                          const input = event.currentTarget;
                          const file = input.files?.[0];
                          if (!file) return;

                          void uploadImage(
                            item.id,
                            file,
                          ).finally(() => {
                            input.value = "";
                          });
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        updateItem(
                          item.id,
                          (current) => ({
                            ...current,
                            imageUrl: "",
                            imagePath: "",
                          }),
                        )
                      }
                      className="h-7 rounded border border-white/[0.09] px-2 text-[10px] text-zinc-500 hover:text-red-200"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className="mt-1.5 flex h-16 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-white/[0.1] text-[10px] text-zinc-600 hover:border-white/[0.18] hover:text-zinc-300">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {uploadingItemId === item.id
                    ? "Uploading…"
                    : "Upload image"}

                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    disabled={uploadingItemId !== null}
                    className="hidden"
                    onChange={(event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;

                      void uploadImage(
                        item.id,
                        file,
                      ).finally(() => {
                        input.value = "";
                      });
                    }}
                  />
                </label>
              )}

              {item.imageUrl ? (
                <div className="mt-2">
                  <TextInput
                    id={`site-card-alt-${item.id}`}
                    label="Alt text"
                    value={item.imageAlt}
                    onChange={(value) =>
                      updateItem(
                        item.id,
                        (current) => ({
                          ...current,
                          imageAlt: value,
                        }),
                      )
                    }
                  />
                </div>
              ) : null}
            </div>

            <TextInput
              id={`site-card-link-label-${item.id}`}
              label="Link label"
              value={item.linkLabel}
              onChange={(value) =>
                updateItem(item.id, (current) => ({
                  ...current,
                  linkLabel: value,
                }))
              }
            />

            <SiteLinkTargetEditor
              idPrefix={`site-card-link-${item.id}`}
              site={site}
              pageId={item.linkPageId}
              href={item.linkHref}
              onPageIdChange={(value) =>
                updateItem(item.id, (current) => ({
                  ...current,
                  linkPageId: value,
                }))
              }
              onHrefChange={(value) =>
                updateItem(item.id, (current) => ({
                  ...current,
                  linkHref: value,
                }))
              }
            />

            <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
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
                  disabled={
                    index === items.length - 1
                  }
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
                  onClick={() =>
                    duplicateItem(item)
                  }
                  className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] text-zinc-500 hover:text-zinc-200"
                  title="Duplicate card"
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
                title="Delete card"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </details>
      ))}

      <button
        type="button"
        onClick={addItem}
        className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-white/[0.1] text-[11px] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100"
      >
        <Plus className="h-3.5 w-3.5" />
        Add card
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
  onContentChange: SiteContentChangeHandler;
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

  if (section.type === "products" || section.type === "services") {
    return (
      <div className="space-y-4">
        <InspectorGroup title="Content">
          <TextInput
            id="site-section-heading"
            label="Heading"
            value={getContentString(section, "heading")}
            onChange={(value) => onContentChange("heading", value)}
          />
          <TextAreaInput
            id="site-section-intro"
            label="Intro"
            value={getContentString(section, "intro")}
            onChange={(value) => onContentChange("intro", value)}
            rows={3}
          />
        </InspectorGroup>
        <SourceListingSelector
          section={section}
          sourceStatus={sourceStatus}
          sourceError={sourceError}
          sourceProducts={sourceProducts}
          sourceServices={sourceServices}
          selectedProductIds={selectedProductIds}
          selectedServiceIds={selectedServiceIds}
          onLoadSourceListings={onLoadSourceListings}
          onToggleSourceListing={onToggleSourceListing}
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

        <InspectorGroup title="Cards">
          <CardsEditor
            site={site}
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

  if (section.type === "cta" || section.type === "contact") {
    return (
      <InspectorGroup title={section.type === "contact" ? "Contact" : "Content"}>
        <TextInput
          id="site-action-heading"
          label="Heading"
          value={getContentString(section, "heading")}
          onChange={(value) => onContentChange("heading", value)}
        />
        <TextAreaInput
          id="site-action-body"
          label="Body"
          value={getContentString(section, "body")}
          onChange={(value) => onContentChange("body", value)}
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
      section.type === "faq" ||
      section.type === "testimonials"
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

    if (section.type === "hero" || section.type === "cta" || section.type === "contact") {
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
          </div>
        </>
      );
    }
  }

  if (
    node === "media" &&
    (section.type === "hero" || section.type === "media")
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

function InspectorDesignPanel({
  section,
  onLayoutChange,
  onStyleChange,
}: {
  section: SiteSection;
  onLayoutChange: (
    key: keyof SiteSectionLayoutConfig,
    value: SiteSectionLayoutConfig[keyof SiteSectionLayoutConfig],
  ) => void;
  onStyleChange: (
    key: keyof SiteSectionStyleConfig,
    value: SiteSectionStyleConfig[keyof SiteSectionStyleConfig],
  ) => void;
}) {
  const definition = getSectionDefinition(section.type);
  const supportsVariant = Boolean(definition && definition.variants.length > 1);
  const supportsColumns = Boolean(definition?.supportsColumns);
  const supportsWidth = Boolean(definition?.supportsWidth);
  const supportsSpacing = Boolean(definition?.supportsSpacing);
  const supportsBackground = Boolean(definition?.supportsBackground);
  const supportsListingDisplay = Boolean(definition?.supportsListingDisplay);

  if (
    !supportsVariant &&
    !supportsColumns &&
    !supportsWidth &&
    !supportsSpacing &&
    !supportsBackground &&
    !supportsListingDisplay
  ) {
    return (
      <p className="text-[12px] leading-5 text-zinc-500">
        This section keeps the Mack template design.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {supportsVariant || supportsColumns || supportsWidth ? (
        <InspectorGroup title="Layout">
          {supportsVariant && definition ? (
            <SectionVariantPicker
              label="Variant"
              variants={definition.variants}
              value={
                section.layout?.variant ??
                getDefaultSectionVariant(definition.type as AddableSiteSectionType) ??
                definition.variants[0]?.id
              }
              onChange={(value) => onLayoutChange("variant", value)}
            />
          ) : null}
          {supportsColumns ? (
            <SegmentedControl
              label="Columns"
              value={String(section.layout?.columns ?? 3)}
              options={[
                { label: "2", value: "2" },
                { label: "3", value: "3" },
                { label: "4", value: "4" },
              ]}
              onChange={(value) =>
                onLayoutChange("columns", Number(value) as 2 | 3 | 4)
              }
            />
          ) : null}
          {supportsWidth ? (
            <SegmentedControl
              label="Content width"
              value={section.layout?.width ?? "normal"}
              options={[
                { label: "Narrow", value: "narrow" },
                { label: "Normal", value: "normal" },
                { label: "Wide", value: "wide" },
              ]}
              onChange={(value) => onLayoutChange("width", value)}
            />
          ) : null}
        </InspectorGroup>
      ) : null}

      {supportsBackground ? (
        <InspectorGroup title="Appearance">
          <SegmentedControl
            label="Background"
            value={section.style?.background ?? "default"}
            options={[
              { label: "Default", value: "default" },
              { label: "Plain", value: "plain" },
              { label: "Dark", value: "dark" },
              { label: "Muted", value: "muted" },
            ]}
            onChange={(value) => onStyleChange("background", value)}
          />
        </InspectorGroup>
      ) : null}

      {supportsSpacing ? (
        <InspectorGroup title="Spacing">
          <SegmentedControl
            label="Padding"
            value={section.layout?.spacing ?? "normal"}
            options={[
              { label: "Small", value: "compact" },
              { label: "Medium", value: "normal" },
              { label: "Large", value: "spacious" },
            ]}
            onChange={(value) => onLayoutChange("spacing", value)}
          />
        </InspectorGroup>
      ) : null}

      {supportsListingDisplay ? (
        <InspectorGroup title="Cards">
          <ToggleRow
            label="Show price"
            checked={section.style?.showPrice !== false}
            onChange={(checked) => onStyleChange("showPrice", checked)}
          />
          <ToggleRow
            label="Show description"
            checked={section.style?.showDescription !== false}
            onChange={(checked) => onStyleChange("showDescription", checked)}
          />
        </InspectorGroup>
      ) : null}
    </div>
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
        <div className="border-b border-white/[0.07] px-4 py-3">
          <p className="text-[15px] font-medium text-zinc-100">
            Design
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            Site / Design
          </p>
        </div>

        <div className="space-y-5 p-4">
          <InspectorGroup title="Color">
            <SegmentedControl
              label="Palette"
              value={theme.palette}
              options={[
                { label: "Graphite", value: "graphite" },
                { label: "Ink", value: "ink" },
                { label: "Slate", value: "slate" },
                { label: "Warm", value: "warm" },
              ]}
              onChange={(palette) =>
                onThemeChange({ ...theme, palette })
              }
            />

            <div>
              <FieldLabel htmlFor="site-theme-accent">
                Accent
              </FieldLabel>

              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="site-theme-accent"
                  type="color"
                  value={theme.accentColor}
                  onChange={(event) =>
                    onThemeChange({
                      ...theme,
                      accentColor: event.target.value,
                    })
                  }
                  className="h-8 w-10 cursor-pointer rounded border border-white/[0.1] bg-transparent p-1"
                />

                <div className="flex h-8 flex-1 items-center rounded-md border border-white/[0.09] bg-black/30 px-2.5 text-[11px] text-zinc-400">
                  {theme.accentColor.toUpperCase()}
                </div>
              </div>
            </div>
          </InspectorGroup>

          <InspectorGroup title="Typography">
            <SegmentedControl
              label="Typeface"
              value={theme.typography}
              options={[
                { label: "Sans", value: "sans" },
                { label: "Serif", value: "serif" },
                { label: "Mono", value: "mono" },
              ]}
              onChange={(typography) =>
                onThemeChange({ ...theme, typography })
              }
            />
          </InspectorGroup>

          <InspectorGroup title="Layout">
            <SegmentedControl
              label="Page width"
              value={theme.width}
              options={[
                { label: "Compact", value: "compact" },
                { label: "Standard", value: "standard" },
                { label: "Wide", value: "wide" },
              ]}
              onChange={(width) =>
                onThemeChange({ ...theme, width })
              }
            />

            <SegmentedControl
              label="Spacing"
              value={theme.spacing}
              options={[
                { label: "Compact", value: "compact" },
                { label: "Normal", value: "normal" },
                { label: "Spacious", value: "spacious" },
              ]}
              onChange={(spacing) =>
                onThemeChange({ ...theme, spacing })
              }
            />

            <SegmentedControl
              label="Corners"
              value={theme.radius}
              options={[
                { label: "Sharp", value: "sharp" },
                { label: "Soft", value: "soft" },
                { label: "Rounded", value: "rounded" },
              ]}
              onChange={(radius) =>
                onThemeChange({ ...theme, radius })
              }
            />
          </InspectorGroup>
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

      const nextSite = payload.site ?? cloneInitialSite();
      const nextSelection = getInitialEditorSelection(nextSite);
      const nextPageId =
        nextSite.pages.find((page) => page.id === nextSite.homePageId)?.id ??
        nextSite.pages[0]?.id ??
        "";
      const nextSiteJson = JSON.stringify(nextSite);

      setSite(nextSite);
      setSelectedPageId(nextPageId);
      setEditorSelection(nextSelection);
      setSiteChromeSelection(null);
      setExpandedPageIds(nextPageId ? new Set([nextPageId]) : new Set());
      latestSiteJsonRef.current = nextSiteJson;
      lastPersistedSiteJsonRef.current = nextSiteJson;
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

  function selectSiteChrome(selection: SiteChromeSelection) {
    if (editorLocked) return;

    setSiteChromeSelection(selection);
    setEditorSelection(null);
    setActiveInspectorMode("content");
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

  function updateSiteTheme(theme: SiteThemeConfig) {
    if (editorLocked) return;

    setSite((current) => ({
      ...current,
      theme,
    }));
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

  function selectPage(pageId: string) {
    const page = site.pages.find((candidate) => candidate.id === pageId);
    if (!page) return;

    setSelectedPageId(page.id);
    setSiteChromeSelection(null);
    setEditorSelection(
      page.sections[0]
        ? {
            kind: "section",
            pageId: page.id,
            sectionId: page.sections[0].id,
          }
        : null,
    );
    setExpandedPageIds((current) => new Set(current).add(page.id));
  }

  function selectSection(pageId: string, sectionId: string) {
    setSelectedPageId(pageId);
    setSiteChromeSelection(null);
    setEditorSelection({ kind: "section", pageId, sectionId });
    setExpandedPageIds((current) => new Set(current).add(pageId));
  }

  function selectSectionContentChild(
    pageId: string,
    sectionId: string,
    node: SiteContentNodeId,
  ) {
    setSelectedPageId(pageId);
    setSiteChromeSelection(null);
    setEditorSelection({ kind: "content", pageId, sectionId, node });
    setActiveInspectorMode("content");
    setExpandedPageIds((current) => new Set(current).add(pageId));
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

  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewAvailableWidth, setPreviewAvailableWidth] = useState(0);
  const [previewContentHeight, setPreviewContentHeight] = useState(720);

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
  }, [postPreviewActiveSelection, postPreviewState]);

  useEffect(() => {
    const viewportNode = previewViewportRef.current;
    if (!viewportNode) return;

    const updatePreviewMetrics = () => {
      setPreviewAvailableWidth(Math.floor(viewportNode.clientWidth));
    };

    updatePreviewMetrics();

    const observer = new ResizeObserver(updatePreviewMetrics);
    observer.observe(viewportNode);

    return () => observer.disconnect();
  }, [selectedPage?.sections.length]);

  useEffect(() => {
    postPreviewState();
  }, [postPreviewState, previewMode, selectedPage?.id]);

  useEffect(() => {
    postPreviewActiveSelection();
  }, [postPreviewActiveSelection, previewMode, selectedPage?.id]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== previewIframeRef.current?.contentWindow) return;

      if (isSitePreviewHeightMessage(event.data)) {
        setPreviewContentHeight(Math.ceil(event.data.payload.height));
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

      const { pageId, sectionId, node } = event.data.payload;
      const page = site.pages.find((candidate) => candidate.id === pageId);
      const section = page?.sections.find(
        (candidate) => candidate.id === sectionId,
      );

      if (!page || !section) return;

      if (node) {
        if (!sectionSupportsContentNode(section, node)) return;
        selectSectionContentChild(page.id, section.id, node);
        return;
      }

      selectSection(page.id, section.id);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [site.pages, updateSectionContent]);

  const previewLogicalWidth = previewModes[previewMode].width;
  const previewLogicalHeight =
    previewModes[previewMode].viewportHeight ?? previewContentHeight;
  const previewScale =
    previewAvailableWidth > 0
      ? Math.min(1, previewAvailableWidth / previewLogicalWidth)
      : 1;
  const previewFrameWidth = Math.ceil(previewLogicalWidth * previewScale);
  const previewFrameHeight = Math.ceil(previewLogicalHeight * previewScale);

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
    <div className="min-h-screen bg-[#08090a] text-zinc-100 lg:h-screen lg:overflow-hidden">
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

      <div className="border-b border-white/[0.07] bg-[#090a0b] px-4 py-3 lg:hidden">
        <p className="text-sm font-medium">Site</p>
        <p className="mt-1 text-xs text-zinc-500">
          Desktop editor shell is the first implementation slice.
        </p>
      </div>

      <div className="hidden h-full min-h-0 lg:grid lg:grid-cols-[240px_minmax(0,1fr)_310px]">
        {/* LEFT: site tree */}
        <aside
          className={`min-h-0 overflow-y-auto border-r border-white/[0.07] bg-[#090a0b] ${
            editorLocked ? "pointer-events-none select-none opacity-60" : ""
          }`}
        >
          <div className="border-b border-white/[0.07] p-2.5">
            <button
              type="button"
              onClick={() => selectSiteChrome("site")}
              className={`w-full rounded-md px-2 py-2 text-left transition ${
                siteChromeSelection === "site"
                  ? "bg-white/[0.06]"
                  : "hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe2
                  className={`h-4 w-4 ${
                    siteChromeSelection === "site"
                      ? "text-zinc-200"
                      : "text-zinc-400"
                  }`}
                />
                <p className="text-[13px] font-semibold text-zinc-100">
                  Site
                </p>
              </div>

              <p className="mt-1 truncate pl-6 text-[11px] text-zinc-500">
                {site.name || "Untitled site"}
              </p>
            </button>
          </div>

          <div className="px-2.5 pt-3">
            <button
              type="button"
              onClick={() => selectSiteChrome("design")}
              className={`mb-1 flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[12px] transition ${
                siteChromeSelection === "design"
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
              }`}
            >
              <Palette className="h-3.5 w-3.5 text-zinc-500" />
              <span className="font-medium">Design</span>
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

            <div className="ml-[15px] border-l border-white/[0.05] pl-2.5">
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

          <div className="px-2.5 py-3">
            <div className="flex h-7 items-center justify-between px-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">
                Pages
              </p>
              <button
                type="button"
                onClick={openNewPageDialog}
                className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200"
                title="New page"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New</span>
              </button>
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
                          ? "bg-white/[0.06] text-zinc-100"
                          : activePage
                          ? "text-zinc-100 hover:bg-white/[0.035]"
                          : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
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
                            active && editorSelection?.kind === "content";
                          const canMoveUp = index > 0;
                          const canMoveDown = index < page.sections.length - 1;
                          const childNodes = getSectionNavigationChildren(section);

                          return (
                            <div key={section.id}>
                              {index > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => openSectionLibrary(page.id, index)}
                                  className="group flex h-2 w-full items-center"
                                  title="Add section here"
                                >
                                  <span className="h-px flex-1 bg-transparent transition group-hover:bg-white/[0.14]" />
                                  <span className="mx-1 hidden h-4 w-4 items-center justify-center rounded-full border border-white/[0.14] bg-[#111214] text-zinc-500 group-hover:flex">
                                    <Plus className="h-3 w-3" />
                                  </span>
                                  <span className="h-px flex-1 bg-transparent transition group-hover:bg-white/[0.14]" />
                                </button>
                              ) : null}

                              <div
                                className={`group flex h-7 items-center gap-1 rounded pr-1 transition ${
                                  activeSectionRow
                                    ? "bg-white/[0.05] text-zinc-100"
                                    : activeSectionAncestor
                                    ? "bg-white/[0.025] text-zinc-200"
                                    : section.visible
                                    ? "text-zinc-500 hover:bg-white/[0.025] hover:text-zinc-300"
                                    : "text-zinc-700 hover:bg-white/[0.02] hover:text-zinc-500"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => selectSection(page.id, section.id)}
                                  className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left text-[11.5px]"
                                >
                                  <Package
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

                              {childNodes.length > 0 ? (
                                <div className="ml-[15px] border-l border-white/[0.04] pl-2.5">
                                  {childNodes.map((child) => {
                                    const ChildIcon = child.icon;
                                    const childActive =
                                      active &&
                                      editorSelection?.kind === "content" &&
                                      editorSelection.node === child.id;

                                    return (
                                      <button
                                        key={`${section.id}-${child.id}`}
                                        type="button"
                                        onClick={() =>
                                          selectSectionContentChild(
                                            page.id,
                                            section.id,
                                            child.id,
                                          )
                                        }
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
                                </div>
                              ) : null}
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => openSectionLibrary(page.id, page.sections.length)}
                          className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[11px] text-zinc-600 transition hover:bg-white/[0.025] hover:text-zinc-300"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add section
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-white/[0.05] px-2.5 py-3">
            <button
              type="button"
              onClick={() => selectSiteChrome("footer")}
              className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[12px] transition ${
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
        <main className="flex min-w-0 flex-col bg-[#0c0d0e]">
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

            <a
              href={getPublicPageHref(site, selectedPage?.id)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-[11px] text-zinc-500 transition hover:text-zinc-200"
            >
              <Eye className="h-3.5 w-3.5" />
              Open public page
            </a>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto p-6">
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
              <div
                ref={previewViewportRef}
                className="mx-auto w-full max-w-[1440px]"
              >
                <div
                  className="relative mx-auto overflow-hidden rounded-md border border-white/[0.08] bg-black shadow-[0_24px_80px_rgba(0,0,0,0.4)]"
                  style={{
                    width: previewFrameWidth,
                    height: previewFrameHeight,
                  }}
                >
                  <iframe
                    ref={previewIframeRef}
                    title={`${selectedPage?.title ?? "Site"} preview`}
                    key={selectedPage?.id}
                    src="/site/preview"
                    onLoad={postPreviewInitialMessages}
                    className="absolute left-0 top-0 block origin-top-left border-0 bg-black"
                    style={{
                      width: previewLogicalWidth,
                      height: previewLogicalHeight,
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
          className={`min-h-0 overflow-y-auto border-l border-white/[0.07] bg-[#090a0b] ${
            editorLocked ? "pointer-events-none select-none opacity-60" : ""
          }`}
        >
          {siteChromeSelection ? (
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
          ) : (
            <div className="p-4">
              <p className="text-[12px] leading-5 text-zinc-500">
                Select a section to edit.
              </p>
            </div>
          )}
        </aside>
	      </div>
	    </div>
	  );
	}
