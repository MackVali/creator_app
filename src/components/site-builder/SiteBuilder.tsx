"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  Monitor,
  Package,
  Plus,
  Trash2,
} from "lucide-react";

import { normalizeSourceListingCardProps } from "@/components/source/SourceListingCard";
import { mackValiSiteDocument } from "@/lib/site-builder/mackValiSite";
import {
  createSitePreviewStateMessage,
  isSitePreviewHeightMessage,
} from "@/lib/site-builder/previewMessages";
import type {
  SiteDataSource,
  SiteDocument,
  SiteSection,
  SiteSectionLayoutConfig,
  SiteSectionStyleConfig,
  SiteSectionType,
} from "@/lib/site-builder/types";
import type { ListingsResponse, SourceListing } from "@/types/source";

type PreviewMode = "desktop" | "tablet" | "mobile";
type InspectorTab = "content" | "layout" | "data" | "style" | "visibility";

const previewModes: Record<PreviewMode, { label: string; width: number }> = {
  desktop: { label: "Desktop", width: 1440 },
  tablet: { label: "Tablet", width: 768 },
  mobile: { label: "Mobile", width: 390 },
};

const inspectorTabs: Array<{ id: InspectorTab; label: string }> = [
  { id: "content", label: "Content" },
  { id: "layout", label: "Layout" },
  { id: "data", label: "Data" },
  { id: "style", label: "Style" },
  { id: "visibility", label: "Visibility" },
];

function cloneInitialSite(): SiteDocument {
  return JSON.parse(
    JSON.stringify(mackValiSiteDocument),
  ) as SiteDocument;
}

function sectionSourceLabel(section: SiteSection) {
  if (section.source.kind === "manual") {
    return "Manual content";
  }

  if (section.source.kind === "source") {
    return `Source · ${section.source.listingType}`;
  }

  return `CREATOR · ${section.source.entity}`;
}

const addableSections: Array<{
  type: SiteSectionType;
  label: string;
  source: SiteDataSource;
  content?: Record<string, unknown>;
  layout?: SiteSectionLayoutConfig;
  style?: SiteSectionStyleConfig;
}> = [
  {
    type: "content",
    label: "Content",
    source: { kind: "manual" },
    content: {
      heading: "New content section",
      body: "Add a short message for this page.",
    },
    layout: {
      alignment: "left",
      width: "normal",
      spacing: "normal",
    },
  },
  {
    type: "products",
    label: "Products",
    source: {
      kind: "source",
      listingType: "product",
      mode: "selected",
      listingIds: [],
    },
    content: {
      heading: "Products",
      intro: "",
    },
    layout: {
      variant: "grid",
      columns: 3,
    },
    style: {
      showPrice: true,
      showDescription: true,
    },
  },
  {
    type: "services",
    label: "Services",
    source: {
      kind: "source",
      listingType: "service",
      mode: "selected",
      listingIds: [],
    },
    content: {
      heading: "Services",
      intro: "",
    },
    layout: {
      variant: "grid",
      columns: 3,
    },
  },
  {
    type: "gallery",
    label: "Gallery",
    source: { kind: "manual" },
    content: {
      heading: "Gallery",
    },
    layout: {
      variant: "grid",
      columns: 3,
    },
  },
  {
    type: "cta",
    label: "CTA",
    source: { kind: "manual" },
    content: {
      heading: "Start something useful",
      body: "Invite visitors into the next step.",
      buttonLabel: "Get started",
      buttonHref: "#contact",
    },
    layout: {
      alignment: "left",
      spacing: "normal",
    },
  },
  {
    type: "contact",
    label: "Contact",
    source: { kind: "manual" },
    content: {
      heading: "Let’s build something useful.",
      body: "Open to creative opportunities, collaborations, and interesting projects.",
      buttonLabel: "Get in touch",
      buttonHref: "#contact",
    },
  },
];

function createSectionId(pageId: string, type: SiteSectionType) {
  return `${pageId}-${type}-${Date.now().toString(36)}`;
}

function SectionActions({
  canMoveUp,
  canMoveDown,
  canDelete,
  visible,
  onToggleVisible,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  visible: boolean;
  onToggleVisible: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-600">
        Section
      </p>

      <div className="mt-2 grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={onToggleVisible}
          className="flex h-8 items-center justify-center rounded-md border border-white/[0.09] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100"
          title={visible ? "Hide section" : "Show section"}
        >
          {visible ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className="flex h-8 items-center justify-center rounded-md border border-white/[0.09] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100 disabled:cursor-not-allowed disabled:border-white/[0.05] disabled:text-zinc-700"
          title="Move section up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className="flex h-8 items-center justify-center rounded-md border border-white/[0.09] text-zinc-400 transition hover:border-white/[0.18] hover:text-zinc-100 disabled:cursor-not-allowed disabled:border-white/[0.05] disabled:text-zinc-700"
          title="Move section down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          className="flex h-8 items-center justify-center rounded-md border border-white/[0.09] text-zinc-500 transition hover:border-red-300/30 hover:text-red-200 disabled:cursor-not-allowed disabled:border-white/[0.05] disabled:text-zinc-800"
          title="Delete section"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function getContentString(section: SiteSection, key: string) {
  const value = section.content[key];
  return typeof value === "string" ? value : "";
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
      className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-600"
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
        className="mt-2 h-9 w-full rounded-md border border-white/[0.09] bg-black/30 px-3 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-white/[0.18]"
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
        className="mt-2 w-full resize-none rounded-md border border-white/[0.09] bg-black/30 px-3 py-2.5 text-[13px] leading-5 text-zinc-100 outline-none transition focus:border-white/[0.18]"
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
      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-600">
        {label}
      </p>
      <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1 rounded-md border border-white/[0.08] bg-black/20 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-7 rounded text-[11px] transition ${
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
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-white/[0.08] bg-black/20 px-3 py-2.5">
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

function InspectorContentTab({
  section,
  onContentChange,
}: {
  section: SiteSection;
  onContentChange: (key: string, value: string) => void;
}) {
  if (section.type === "hero") {
    return (
      <>
        <TextInput
          id="site-hero-eyebrow"
          label="Eyebrow"
          value={getContentString(section, "eyebrow")}
          onChange={(value) => onContentChange("eyebrow", value)}
        />
        <TextAreaInput
          id="site-hero-headline"
          label="Headline"
          value={getContentString(section, "headline")}
          onChange={(value) => onContentChange("headline", value)}
          rows={3}
        />
        <TextAreaInput
          id="site-hero-intro"
          label="Intro"
          value={getContentString(section, "intro")}
          onChange={(value) => onContentChange("intro", value)}
          rows={5}
        />
        <TextInput
          id="site-hero-cta-label"
          label="Primary CTA label"
          value={getContentString(section, "primaryCtaLabel")}
          onChange={(value) => onContentChange("primaryCtaLabel", value)}
        />
        <TextInput
          id="site-hero-cta-href"
          label="Primary CTA href"
          value={getContentString(section, "primaryCtaHref")}
          onChange={(value) => onContentChange("primaryCtaHref", value)}
        />
      </>
    );
  }

  if (
    section.type === "content" ||
    section.type === "products" ||
    section.type === "services"
  ) {
    return (
      <>
        <TextInput
          id="site-section-heading"
          label="Section heading"
          value={getContentString(section, "heading")}
          onChange={(value) => onContentChange("heading", value)}
        />
        <TextAreaInput
          id="site-section-intro"
          label={section.type === "content" ? "Body" : "Intro"}
          value={
            section.type === "content"
              ? getContentString(section, "body")
              : getContentString(section, "intro")
          }
          onChange={(value) =>
            onContentChange(section.type === "content" ? "body" : "intro", value)
          }
          rows={5}
        />
      </>
    );
  }

  if (section.type === "gallery") {
    return (
      <>
        <TextInput
          id="site-gallery-heading"
          label="Section heading"
          value={getContentString(section, "heading")}
          onChange={(value) => onContentChange("heading", value)}
        />
        <p className="rounded-md border border-white/[0.08] bg-black/20 px-3 py-3 text-[11px] leading-5 text-zinc-500">
          Media selection will connect to a future media library. This slice only
          previews the section state.
        </p>
      </>
    );
  }

  if (section.type === "cta" || section.type === "contact") {
    return (
      <>
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
          rows={4}
        />
        <TextInput
          id="site-action-button-label"
          label="Button label"
          value={getContentString(section, "buttonLabel")}
          onChange={(value) => onContentChange("buttonLabel", value)}
        />
        <TextInput
          id="site-action-button-href"
          label="Button href"
          value={getContentString(section, "buttonHref")}
          onChange={(value) => onContentChange("buttonHref", value)}
        />
      </>
    );
  }

  return (
    <p className="text-[12px] leading-5 text-zinc-500">
      This section is represented in the generic Site document.
    </p>
  );
}

function InspectorLayoutTab({
  section,
  onLayoutChange,
}: {
  section: SiteSection;
  onLayoutChange: (
    key: keyof SiteSectionLayoutConfig,
    value: SiteSectionLayoutConfig[keyof SiteSectionLayoutConfig],
  ) => void;
}) {
  const supportsAlignment =
    section.type === "hero" ||
    section.type === "content" ||
    section.type === "cta";
  const supportsVariant =
    section.type === "hero" ||
    section.type === "products" ||
    section.type === "services" ||
    section.type === "gallery";
  const supportsColumns =
    section.type === "products" ||
    section.type === "services" ||
    section.type === "gallery";
  const supportsWidth = section.type === "content";

  if (!supportsAlignment && !supportsVariant && !supportsColumns && !supportsWidth) {
    return (
      <p className="text-[12px] leading-5 text-zinc-500">
        This section keeps the Mack template layout.
      </p>
    );
  }

  return (
    <>
      {supportsAlignment ? (
        <SegmentedControl
          label="Alignment"
          value={section.layout?.alignment ?? "left"}
          options={[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
          ]}
          onChange={(value) => onLayoutChange("alignment", value)}
        />
      ) : null}

      {supportsVariant ? (
        <SegmentedControl
          label="Variant"
          value={section.layout?.variant ?? (section.type === "hero" ? "split" : "grid")}
          options={
            section.type === "hero"
              ? [
                  { label: "Split", value: "split" },
                  { label: "Centered", value: "centered" },
                ]
              : section.type === "services"
              ? [
                  { label: "Grid", value: "grid" },
                  { label: "List", value: "row" },
                ]
              : [
                  { label: "Grid", value: "grid" },
                  { label: "Row", value: "row" },
                ]
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
    </>
  );
}

function InspectorDataTab({
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
    return (
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-600">
          Data source
        </p>
        <p className="mt-2 text-[12px] text-zinc-400">
          {sectionSourceLabel(section)}
        </p>
      </div>
    );
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
    <div className="border-t border-white/[0.07] pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-600">
            Source {listingType}s
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {selectedIds.length} selected · {listings.length} loaded
          </p>
        </div>

        <button
          type="button"
          onClick={onLoadSourceListings}
          disabled={sourceStatus === "loading"}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-white/[0.1] px-3 text-[11px] text-zinc-300 transition hover:border-white/[0.2] disabled:cursor-not-allowed disabled:text-zinc-600"
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
              className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition ${
                selected
                  ? "border-white/25 bg-white/[0.07]"
                  : "border-white/[0.08] bg-black/20 hover:border-white/[0.16]"
              }`}
            >
              <span
                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                  selected ? "border-white/60 bg-white" : "border-white/20"
                }`}
              >
                {selected ? (
                  <span className="h-1.5 w-1.5 rounded-sm bg-black" />
                ) : null}
              </span>

              <span className="min-w-0">
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
    </div>
  );
}

function InspectorStyleTab({
  section,
  onStyleChange,
}: {
  section: SiteSection;
  onStyleChange: (
    key: keyof SiteSectionStyleConfig,
    value: SiteSectionStyleConfig[keyof SiteSectionStyleConfig],
  ) => void;
}) {
  const supportsBackground =
    section.type === "hero" ||
    section.type === "content" ||
    section.type === "products" ||
    section.type === "services" ||
    section.type === "gallery" ||
    section.type === "cta";
  const supportsListingDisplay = section.type === "products";

  if (!supportsBackground && !supportsListingDisplay) {
    return (
      <p className="text-[12px] leading-5 text-zinc-500">
        This section keeps the Mack template style.
      </p>
    );
  }

  return (
    <>
      {supportsBackground ? (
        <SegmentedControl
          label="Background"
          value={section.style?.background ?? "default"}
          options={[
            { label: "Default", value: "default" },
            { label: "Plain", value: "plain" },
            { label: "Dark", value: "dark" },
          ]}
          onChange={(value) => onStyleChange("background", value)}
        />
      ) : null}

      {supportsListingDisplay ? (
        <>
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
        </>
      ) : null}
    </>
  );
}

export default function SiteBuilder() {
  const [site, setSite] = useState<SiteDocument>(cloneInitialSite);
  const [selectedPageId, setSelectedPageId] = useState("home");
  const [selectedSectionId, setSelectedSectionId] =
    useState("home-hero");
  const [showSectionLibrary, setShowSectionLibrary] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [activeInspectorTab, setActiveInspectorTab] =
    useState<InspectorTab>("content");
  const [sourceListings, setSourceListings] = useState<SourceListing[]>([]);
  const [sourceStatus, setSourceStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [sourceError, setSourceError] = useState<string | null>(null);

  const selectedPage =
    site.pages.find((page) => page.id === selectedPageId) ?? site.pages[0];

  const selectedSection =
    selectedPage?.sections.find(
      (section) => section.id === selectedSectionId,
    ) ?? selectedPage?.sections[0];

  const selectedSectionIndex = selectedPage?.sections.findIndex(
    (section) => section.id === selectedSection?.id,
  );
  const sourceProducts = sourceListings.filter(
    (listing) => listing.type === "product",
  );
  const sourceServices = sourceListings.filter(
    (listing) => listing.type === "service",
  );

  function selectPage(pageId: string) {
    const page = site.pages.find((candidate) => candidate.id === pageId);
    if (!page) return;

    setSelectedPageId(page.id);
    setSelectedSectionId(page.sections[0]?.id ?? "");
  }

  function updateSelectedSectionContent(
    key: string,
    value: string,
  ) {
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

  function updateSelectedSection(
    updater: (section: SiteSection) => SiteSection,
  ) {
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

  function deleteSelectedSection() {
    if (!selectedPage || !selectedSection) return;
    if (selectedSection.type === "hero" || selectedPage.sections.length <= 1) {
      return;
    }

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
    setSelectedSectionId(nextSelection);
  }

  function addSection(template: (typeof addableSections)[number]) {
    if (!selectedPage) return;

    const section: SiteSection = {
      id: createSectionId(selectedPage.id, template.type),
      label: template.label,
      type: template.type,
      visible: true,
      source: template.source,
      content: template.content ?? {},
      layout: template.layout,
      style: template.style,
    };

    setSite((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id !== selectedPage.id
          ? page
          : {
              ...page,
              sections: [...page.sections, section],
            },
      ),
    }));
    setSelectedSectionId(section.id);
    setShowSectionLibrary(false);
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
    updateSelectedSection((section) => ({
      ...section,
      layout: {
        ...section.layout,
        [key]: value,
      },
    }));
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
        sourceListings,
      }),
      window.location.origin,
    );
  }, [site, sourceListings]);

  useEffect(() => {
    if (selectedPage?.id !== "home") return;

    const viewportNode = previewViewportRef.current;
    if (!viewportNode) return;

    const updatePreviewMetrics = () => {
      setPreviewAvailableWidth(Math.floor(viewportNode.clientWidth));
    };

    updatePreviewMetrics();

    const observer = new ResizeObserver(updatePreviewMetrics);
    observer.observe(viewportNode);

    return () => observer.disconnect();
  }, [selectedPage?.id]);

  useEffect(() => {
    if (selectedPage?.id !== "home") return;
    postPreviewState();
  }, [postPreviewState, previewMode, selectedPage?.id]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isSitePreviewHeightMessage(event.data)) return;

      setPreviewContentHeight(Math.ceil(event.data.payload.height));
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const previewLogicalWidth = previewModes[previewMode].width;
  const previewScale =
    previewAvailableWidth > 0
      ? Math.min(1, previewAvailableWidth / previewLogicalWidth)
      : 1;
  const previewFrameWidth = Math.ceil(previewLogicalWidth * previewScale);
  const previewFrameHeight = Math.ceil(previewContentHeight * previewScale);

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

  return (
    <div className="min-h-screen bg-[#08090a] text-zinc-100 lg:h-screen lg:overflow-hidden">
      <div className="border-b border-white/[0.07] bg-[#090a0b] px-4 py-3 lg:hidden">
        <p className="text-sm font-medium">Site</p>
        <p className="mt-1 text-xs text-zinc-500">
          Desktop editor shell is the first implementation slice.
        </p>
      </div>

      <div className="hidden h-full min-h-0 lg:grid lg:grid-cols-[240px_minmax(0,1fr)_310px]">
        {/* LEFT: pages / sections */}
        <aside className="min-h-0 overflow-y-auto border-r border-white/[0.07] bg-[#090a0b]">
          <div className="border-b border-white/[0.07] px-4 py-4">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-zinc-400" />
              <p className="text-[13px] font-semibold">Site</p>
            </div>

            <p className="mt-1 text-[11px] text-zinc-500">
              {site.name}
            </p>
          </div>

          <div className="px-2.5 py-4">
            <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">
              Pages
            </p>

            <div className="space-y-1">
              {site.pages.map((page) => {
                const activePage = page.id === selectedPage?.id;

                return (
                  <div key={page.id}>
                    <button
                      type="button"
                      onClick={() => selectPage(page.id)}
                      className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition ${
                        activePage
                          ? "bg-white/[0.07] text-white"
                          : "text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200"
                      }`}
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition ${
                          activePage ? "rotate-90" : ""
                        }`}
                      />
                      {page.title}
                    </button>

                    {activePage ? (
                      <div className="ml-[18px] border-l border-white/[0.07] pl-2">
                        {page.sections.map((section) => {
                          const active =
                            section.id === selectedSection?.id;

                          return (
                            <button
                              key={section.id}
                              type="button"
                              onClick={() =>
                                setSelectedSectionId(section.id)
                              }
                              className={`flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-[11px] transition ${
                                active
                                  ? "bg-white/[0.055] text-zinc-100"
                                  : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                              }`}
                            >
                              <span className="truncate">{section.label}</span>
                              {!section.visible ? (
                                <EyeOff className="h-3 w-3 shrink-0 text-zinc-700" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowSectionLibrary((current) => !current)}
              className="mt-4 flex w-full items-center gap-2 rounded-md border border-dashed border-white/[0.1] px-3 py-2 text-left text-[11px] text-zinc-500 transition hover:border-white/[0.18] hover:text-zinc-300"
            >
              <Plus className="h-3.5 w-3.5" />
              Add section
            </button>

            {showSectionLibrary ? (
              <div className="mt-2 rounded-md border border-white/[0.08] bg-black/20 p-1">
                {addableSections.map((section) => (
                  <button
                    key={section.type}
                    type="button"
                    onClick={() => addSection(section)}
                    className="flex h-8 w-full items-center justify-between rounded px-2 text-left text-[11px] text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"
                  >
                    {section.label}
                    <span className="text-[9px] text-zinc-700">
                      {section.type}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        {/* CENTER: actual renderer */}
        <main className="flex min-w-0 flex-col bg-[#0c0d0e]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <Monitor className="h-3.5 w-3.5" />
              {previewModes[previewMode].label} preview
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

            <a
              href={selectedPage?.previewPath ?? "/portfolio/mackvali"}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-[11px] text-zinc-500 transition hover:text-zinc-200"
            >
              <Eye className="h-3.5 w-3.5" />
              Open public page
            </a>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-6">
            {selectedPage?.id === "home" ? (
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
                    title="Mack homepage preview"
                    src="/site/preview"
                    onLoad={postPreviewState}
                    className="absolute left-0 top-0 block origin-top-left border-0 bg-black"
                    style={{
                      width: previewLogicalWidth,
                      height: previewContentHeight,
                      transform: `scale(${previewScale})`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                className="mx-auto min-h-[620px] overflow-hidden rounded-md border border-white/[0.08] bg-black"
                style={{
                  width: previewFrameWidth || "100%",
                  maxWidth: "100%",
                }}
              >
                <iframe
                  key={selectedPage?.previewPath}
                  title={`${selectedPage?.title ?? "Site"} preview`}
                  src={selectedPage?.previewPath}
                  className="h-full min-h-[620px] w-full border-0"
                />
              </div>
            )}
          </div>
        </main>

        {/* RIGHT: selected section inspector */}
        <aside className="min-h-0 overflow-y-auto border-l border-white/[0.07] bg-[#090a0b]">
          <div className="border-b border-white/[0.07] px-4 py-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">
              Inspector
            </p>

            <p className="mt-2 text-[15px] font-medium">
              {selectedSection?.label ?? "Section"}
            </p>

            {selectedSection ? (
              <p className="mt-1 text-[11px] text-zinc-600">
                {selectedSection.type} · {sectionSourceLabel(selectedSection)}
              </p>
            ) : null}
          </div>

          {selectedSection ? (
            <div className="p-4">
              <div className="grid grid-cols-5 gap-1 rounded-md border border-white/[0.08] bg-black/20 p-1">
                {inspectorTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveInspectorTab(tab.id)}
                    className={`h-7 rounded text-[10px] transition ${
                      activeInspectorTab === tab.id
                        ? "bg-white/[0.1] text-zinc-100"
                        : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-5">
                {activeInspectorTab === "content" ? (
                  <InspectorContentTab
                    section={selectedSection}
                    onContentChange={updateSelectedSectionContent}
                  />
                ) : null}

                {activeInspectorTab === "layout" ? (
                  <InspectorLayoutTab
                    section={selectedSection}
                    onLayoutChange={updateSelectedSectionLayout}
                  />
                ) : null}

                {activeInspectorTab === "data" ? (
                  <InspectorDataTab
                    section={selectedSection}
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

                {activeInspectorTab === "style" ? (
                  <InspectorStyleTab
                    section={selectedSection}
                    onStyleChange={updateSelectedSectionStyle}
                  />
                ) : null}

                {activeInspectorTab === "visibility" ? (
                  <SectionActions
                    canMoveUp={(selectedSectionIndex ?? 0) > 0}
                    canMoveDown={
                      selectedPage
                        ? (selectedSectionIndex ?? -1) <
                          selectedPage.sections.length - 1
                        : false
                    }
                    canDelete={
                      selectedSection.type !== "hero" &&
                      Boolean(
                        selectedPage && selectedPage.sections.length > 1,
                      )
                    }
                    visible={selectedSection.visible}
                    onToggleVisible={toggleSelectedSectionVisibility}
                    onMoveUp={() => moveSelectedSection("up")}
                    onMoveDown={() => moveSelectedSection("down")}
                    onDelete={deleteSelectedSection}
                  />
                ) : null}
              </div>
            </div>
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
