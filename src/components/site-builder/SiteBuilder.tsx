"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  Monitor,
  MoreHorizontal,
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
type InspectorMode = "content" | "design";

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

function sectionSourceLabel(section: SiteSection) {
  if (section.source.kind === "manual") {
    return "Manual";
  }

  if (section.source.kind === "source") {
    return `Source ${section.source.listingType}s`;
  }

  return `CREATOR ${section.source.entity}s`;
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

function createDuplicateSectionId(sectionId: string) {
  return `${sectionId}-copy-${Date.now().toString(36)}`;
}

function sectionHasDesignControls(section: SiteSection) {
  return (
    section.type === "hero" ||
    section.type === "content" ||
    section.type === "products" ||
    section.type === "services" ||
    section.type === "gallery" ||
    section.type === "cta"
  );
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
  icon: typeof Eye;
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

function CtaFields({
  labelId,
  hrefId,
  label,
  href,
  labelKey,
  hrefKey,
  onContentChange,
}: {
  labelId: string;
  hrefId: string;
  label: string;
  href: string;
  labelKey: string;
  hrefKey: string;
  onContentChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[0.9fr_1.1fr] gap-2">
      <TextInput
        id={labelId}
        label="Label"
        value={label}
        onChange={(value) => onContentChange(labelKey, value)}
      />
      <TextInput
        id={hrefId}
        label="Link"
        value={href}
        onChange={(value) => onContentChange(hrefKey, value)}
      />
    </div>
  );
}

function MediaSummary({ section }: { section: SiteSection }) {
  return (
    <div className="rounded-md border border-white/[0.08] bg-black/20 px-3 py-2.5">
      <p className="text-[11px] font-medium text-zinc-300">
        {section.type === "hero" ? "Template media" : "Media"}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-zinc-600">
        Media replacement is not connected in this builder slice yet.
      </p>
    </div>
  );
}

function InspectorContentPanel({
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
  onContentChange: (key: string, value: string) => void;
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
            labelId="site-hero-cta-label"
            hrefId="site-hero-cta-href"
            label={getContentString(section, "primaryCtaLabel")}
            href={getContentString(section, "primaryCtaHref")}
            labelKey="primaryCtaLabel"
            hrefKey="primaryCtaHref"
            onContentChange={onContentChange}
          />
        </InspectorGroup>
        <InspectorGroup title="Media">
          <MediaSummary section={section} />
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
        <InspectorGroup title="Media">
          <MediaSummary section={section} />
        </InspectorGroup>
      </div>
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
          labelId="site-action-button-label"
          hrefId="site-action-button-href"
          label={getContentString(section, "buttonLabel")}
          href={getContentString(section, "buttonHref")}
          labelKey="buttonLabel"
          hrefKey="buttonHref"
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
  const supportsAlignment =
    section.type === "hero" ||
    section.type === "content" ||
    section.type === "cta";
  const supportsVariant =
    section.type === "hero" ||
    section.type === "products" ||
    section.type === "services";
  const supportsColumns =
    section.type === "products" ||
    section.type === "services" ||
    section.type === "gallery";
  const supportsWidth = section.type === "content";
  const supportsSpacing = section.type === "content" || section.type === "cta";
  const supportsBackground =
    section.type === "hero" ||
    section.type === "content" ||
    section.type === "products" ||
    section.type === "services" ||
    section.type === "gallery" ||
    section.type === "cta";
  const supportsListingDisplay = section.type === "products";

  if (
    !supportsAlignment &&
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
      {supportsAlignment || supportsVariant || supportsColumns || supportsWidth ? (
        <InspectorGroup title="Layout">
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

export default function SiteBuilder() {
  const [site, setSite] = useState<SiteDocument>(cloneInitialSite);
  const [selectedPageId, setSelectedPageId] = useState("home");
  const [selectedSectionId, setSelectedSectionId] =
    useState("home-hero");
  const [showSectionLibrary, setShowSectionLibrary] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [activeInspectorMode, setActiveInspectorMode] =
    useState<InspectorMode>("content");
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

  function duplicateSelectedSection() {
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
    setSelectedSectionId(duplicate.id);
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
      !sectionHasDesignControls(selectedSection)
    ) {
      setActiveInspectorMode("content");
    }
  }, [activeInspectorMode, selectedSection]);

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
                      height: previewLogicalHeight,
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
          {selectedSection ? (
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
                  selectedSection.type !== "hero" &&
                  Boolean(selectedPage && selectedPage.sections.length > 1)
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
