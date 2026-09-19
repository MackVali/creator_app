"use client";

/* eslint-disable @next/next/no-img-element -- Source listing images can be user-provided remote URLs. */

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { resolveListingImage } from "@/components/profile/detailSheetUtils";
import { normalizeSourceListingCardProps } from "@/components/source/SourceListingCard";
import type { PortfolioSiteData } from "@/lib/portfolio/types";
import type { SitePreviewInlineEditField } from "@/lib/site-builder/previewMessages";
import {
  getSiteFooterConfig,
  getSiteHeaderConfig,
} from "@/lib/site-builder/siteChrome";
import {
  resolveSiteLinkHref,
  resolveSiteNavigationHref,
} from "@/lib/site-builder/siteLinks";
import { mackValiSiteDocument } from "@/lib/site-builder/mackValiSite";
import { migrateLegacyMackSite } from "@/lib/site-builder/migrateLegacyMackSite";
import {
  resolveSiteEmbedUrl,
} from "@/lib/site-builder/siteEmbeds";
import {
  getSiteThemeConfig,
  getSiteThemeStyle,
} from "@/lib/site-builder/siteTheme";
import type {
  SiteContentNodeId,
  SiteDocument,
  SiteEditorSelection,
  SiteSection,
} from "@/lib/site-builder/types";
import type { SourceListing } from "@/types/source";

type PortfolioSiteProps = {
  site: PortfolioSiteData;
  siteDocument?: SiteDocument;
  sections?: SiteSection[];
  sourceListings?: SourceListing[];
  editorPreview?: boolean;
  editorPageId?: string;
  editorSelection?: SiteEditorSelection | null;
  onEditorSelectionRequest?: (selection: {
    pageId: string;
    sectionId: string;
    node?: SiteContentNodeId;
    blockId?: string;
  }) => void;
  onEditorContentEditRequest?: (edit: {
    pageId: string;
    sectionId: string;
    field: SitePreviewInlineEditField;
    value: string;
  }) => void;
  onEditorSectionInsertRequest?: (request: {
    pageId: string;
    insertionIndex: number;
  }) => void;
};

type EditorNodeId = SiteContentNodeId;

type EditorSelectionContext = {
  editorPreview: boolean;
  pageId: string;
  activeSelection: SiteEditorSelection | null;
  onSelectionRequest?: (selection: {
    pageId: string;
    sectionId: string;
    node?: EditorNodeId;
    blockId?: string;
  }) => void;
  onContentEditRequest?: (edit: {
    pageId: string;
    sectionId: string;
    field: SitePreviewInlineEditField;
    value: string;
  }) => void;
  onSectionInsertRequest?: (request: {
    pageId: string;
    insertionIndex: number;
  }) => void;
};

function EditorSectionInsertControl({
  editorContext,
  insertionIndex,
}: {
  editorContext:
    EditorSelectionContext;
  insertionIndex: number;
}) {
  if (
    !editorContext.editorPreview ||
    !editorContext.onSectionInsertRequest
  ) {
    return null;
  }

  return (
    <div className="group relative z-40 -my-2 h-4">
      <div className="absolute inset-0 flex items-center px-[var(--site-page-x)]">
        <span className="h-px flex-1 bg-transparent transition group-hover:bg-white/15" />

        <button
          type="button"
          title="Add section here"
          aria-label="Add section here"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();

            editorContext
              .onSectionInsertRequest?.({
                pageId:
                  editorContext.pageId,
                insertionIndex,
              });
          }}
          className="mx-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[#111214] text-[17px] font-light leading-none text-white/60 opacity-0 shadow-xl transition group-hover:opacity-100 hover:border-white/35 hover:bg-[#1a1b1d] hover:text-white focus:opacity-100"
        >
          +
        </button>

        <span className="h-px flex-1 bg-transparent transition group-hover:bg-white/15" />
      </div>
    </div>
  );
}


function getSectionSelectionState(
  context: EditorSelectionContext,
  sectionId: string,
) {
  const active =
    context.activeSelection?.pageId === context.pageId &&
    context.activeSelection.sectionId === sectionId;

  return {
    active,
    selected: active && context.activeSelection?.kind === "section",
  };
}

function getNodeSelectionState(
  context: EditorSelectionContext,
  sectionId: string,
  node: EditorNodeId,
) {
  const active =
    context.activeSelection?.pageId === context.pageId &&
    context.activeSelection.sectionId === sectionId &&
    context.activeSelection.kind === "content" &&
    context.activeSelection.node === node;

  return {
    active,
    sectionActive:
      context.activeSelection?.pageId === context.pageId &&
      context.activeSelection.sectionId === sectionId,
  };
}

function editorSectionClass(
  context: EditorSelectionContext,
  sectionId: string | undefined,
) {
  if (!context.editorPreview || !sectionId) return "";

  const state = getSectionSelectionState(context, sectionId);

  if (state.selected) {
    return "outline outline-1 -outline-offset-1 outline-white/45";
  }

  if (state.active) {
    return "outline outline-1 -outline-offset-1 outline-white/22 hover:outline-white/32";
  }

  return "outline outline-1 -outline-offset-1 outline-transparent transition-[outline-color,background-color] hover:outline-white/12";
}

function editorNodeClass(
  context: EditorSelectionContext,
  sectionId: string | undefined,
  node: EditorNodeId,
) {
  if (!context.editorPreview || !sectionId) return "";

  const state = getNodeSelectionState(context, sectionId, node);

  if (state.active) {
    return "rounded-[3px] bg-white/[0.045] outline outline-1 -outline-offset-1 outline-white/50";
  }

  return "rounded-[3px] outline outline-1 -outline-offset-1 outline-transparent transition-[outline-color,background-color] hover:bg-white/[0.025] hover:outline-white/24";
}


function editorBlockClass(
  context: EditorSelectionContext,
  sectionId: string,
  blockId: string,
) {
  if (!context.editorPreview) return "";

  const selected =
    context.activeSelection?.pageId ===
      context.pageId &&
    context.activeSelection.sectionId ===
      sectionId &&
    context.activeSelection.kind === "block" &&
    context.activeSelection.blockId === blockId;

  if (selected) {
    return "outline outline-2 -outline-offset-2 outline-white/55";
  }

  return "outline outline-1 -outline-offset-1 outline-transparent transition-[outline-color] hover:outline-white/20";
}

function handleEditorBlockClick(
  event: MouseEvent<HTMLElement>,
  context: EditorSelectionContext,
  sectionId: string,
  blockId: string,
) {
  if (!context.editorPreview) return;

  event.preventDefault();
  event.stopPropagation();

  context.onSelectionRequest?.({
    pageId: context.pageId,
    sectionId,
    blockId,
  });
}

function handleEditorSectionClick(
  event: MouseEvent<HTMLElement>,
  context: EditorSelectionContext,
  sectionId: string | undefined,
) {
  if (!context.editorPreview || !sectionId) return;

  if (event.target instanceof Element && event.target.closest("a")) {
    event.preventDefault();
  }

  context.onSelectionRequest?.({
    pageId: context.pageId,
    sectionId,
  });
}

function handleEditorNodeClick(
  event: MouseEvent<HTMLElement>,
  context: EditorSelectionContext,
  sectionId: string | undefined,
  node: EditorNodeId,
) {
  if (!context.editorPreview || !sectionId) return;

  event.preventDefault();
  event.stopPropagation();

  context.onSelectionRequest?.({
    pageId: context.pageId,
    sectionId,
    node,
  });
}

type InlineEditableTextProps = {
  as?: "span" | "p" | "h1" | "h2";
  value: string;
  field: SitePreviewInlineEditField;
  sectionId: string | undefined;
  node: EditorNodeId;
  editorContext: EditorSelectionContext;
  className?: string;
  multiline?: boolean;
  children?: ReactNode;
};

function getPlainEditableText(element: HTMLElement) {
  return element.innerText.replace(/\u00a0/g, " ");
}

function InlineEditableText({
  as: Tag = "span",
  value,
  field,
  sectionId,
  node,
  editorContext,
  className = "",
  multiline = false,
  children,
}: InlineEditableTextProps) {
  const elementRef = useRef<HTMLElement | null>(null);
  const startingValueRef = useRef(value);
  const escapeRestoreRef = useRef<string | null>(null);
  const editKeyRef = useRef(`${editorContext.pageId}:${sectionId ?? ""}:${field}`);
  const [editing, setEditing] = useState(false);
  const editable =
    editorContext.editorPreview &&
    Boolean(sectionId) &&
    Boolean(editorContext.onContentEditRequest);

  useEffect(() => {
    if (editing) return;
    if (elementRef.current && elementRef.current.innerText !== value) {
      elementRef.current.innerText = value;
    }
  }, [editing, value]);

  useLayoutEffect(() => {
    if (!editing || !elementRef.current) return;
    elementRef.current.innerText = startingValueRef.current;
  }, [editing]);

  useEffect(() => {
    const nextKey = `${editorContext.pageId}:${sectionId ?? ""}:${field}`;
    if (editKeyRef.current === nextKey) return;
    editKeyRef.current = nextKey;
    setEditing(false);
  }, [editorContext.pageId, sectionId, field]);

  function requestValue(nextValue: string) {
    if (!sectionId) return;
    editorContext.onContentEditRequest?.({
      pageId: editorContext.pageId,
      sectionId,
      field,
      value: nextValue,
    });
  }

  function enterEditing(event: MouseEvent<HTMLElement>) {
    if (!editable || !sectionId) return;

    event.preventDefault();
    event.stopPropagation();
    editorContext.onSelectionRequest?.({
      pageId: editorContext.pageId,
      sectionId,
      node,
    });
    startingValueRef.current = value;
    setEditing(true);

    window.requestAnimationFrame(() => {
      const element = elementRef.current;
      if (!element) return;

      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  }

  function handleInput() {
    const element = elementRef.current;
    if (!element) return;
    requestValue(getPlainEditableText(element));
  }

  function handleBlur() {
    if (escapeRestoreRef.current !== null) {
      requestValue(escapeRestoreRef.current);
      escapeRestoreRef.current = null;
    } else {
      const element = elementRef.current;
      if (element) requestValue(getPlainEditableText(element));
    }

    setEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      escapeRestoreRef.current = startingValueRef.current;
      elementRef.current?.blur();
      return;
    }

    if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      elementRef.current?.blur();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(
      document.createTextNode(multiline ? text : text.replace(/\s+/g, " ")),
    );
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    handleInput();
  }

  return (
    <Tag
      ref={elementRef as never}
      contentEditable={editing}
      suppressContentEditableWarning
      tabIndex={editing ? 0 : undefined}
      onDoubleClick={enterEditing}
      onInput={handleInput}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      className={`${className} ${
        editable
          ? "cursor-text rounded-[3px] outline outline-1 -outline-offset-1 outline-transparent hover:outline-white/20"
          : ""
      } ${
        editing
          ? "bg-white/[0.055] outline-white/45"
          : ""
      }`}
    >
      {editing ? null : children ?? value}
    </Tag>
  );
}

const heroCover = "/images/portfolio/mackvali/hero-devices.png";

const defaultMackSections: SiteSection[] = (() => {
  const migrated =
    migrateLegacyMackSite(
      mackValiSiteDocument,
    );

  return (
    migrated.pages.find(
      (page) =>
        page.id ===
        migrated.homePageId,
    )?.sections ??
    migrated.pages[0]?.sections ??
    []
  );
})();

function readContentString(
  section: SiteSection | undefined,
  key: string,
  fallback = "",
) {
  const value = section?.content[key];
  return typeof value === "string" ? value : fallback;
}

function readContentNumber(
  section: SiteSection | undefined,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value =
    section?.content[key];

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

function sectionMediaSettings(
  section: SiteSection | undefined,
) {
  const fit =
    readContentString(
      section,
      "mediaFit",
    ) === "cover"
      ? "cover"
      : "contain";

  const ratioValue =
    readContentString(
      section,
      "mediaRatio",
    );

  const ratio =
    ratioValue === "auto" ||
    ratioValue === "3:2" ||
    ratioValue === "4:3" ||
    ratioValue === "1:1" ||
    ratioValue === "4:5"
      ? ratioValue
      : "16:9";

  const frameValue =
    readContentString(
      section,
      "mediaFrame",
    );

  const frame =
    frameValue === "outline" ||
    frameValue === "surface"
      ? frameValue
      : "none";

  return {
    fit,
    ratio,
    frame,

    height:
      readContentNumber(
        section,
        "mediaHeight",
        360,
        160,
        900,
      ),

    zoom:
      readContentNumber(
        section,
        "mediaZoom",
        100,
        50,
        180,
      ),

    positionX:
      readContentNumber(
        section,
        "mediaPositionX",
        50,
        0,
        100,
      ),

    positionY:
      readContentNumber(
        section,
        "mediaPositionY",
        50,
        0,
        100,
      ),

    radius:
      readContentNumber(
        section,
        "mediaRadius",
        12,
        0,
        48,
      ),
  };
}

function mediaAspectRatio(
  ratio: string,
) {
  if (ratio === "1:1") {
    return "1 / 1";
  }

  if (ratio === "4:5") {
    return "4 / 5";
  }

  if (ratio === "4:3") {
    return "4 / 3";
  }

  if (ratio === "3:2") {
    return "3 / 2";
  }

  return "16 / 9";
}

function mediaFrameClass(
  frame: string,
) {
  if (frame === "outline") {
    return "border border-[var(--site-border)]";
  }

  if (frame === "surface") {
    return "bg-[var(--site-surface-strong)]";
  }

  return "";
}


function sectionItemFrame(
  section: SiteSection | undefined,
) {
  const value =
    section?.style?.itemFrame;

  return value === "outline" ||
    value === "surface"
    ? value
    : "none";
}

function sectionItemRadius(
  section: SiteSection | undefined,
  fallback = 12,
) {
  const value =
    section?.style?.itemRadius;

  return typeof value === "number" &&
    Number.isFinite(value)
    ? Math.max(
        0,
        Math.min(48, value),
      )
    : fallback;
}

function sectionItemMediaFit(
  section: SiteSection | undefined,
) {
  return section?.style?.itemMediaFit ===
    "contain"
    ? "contain"
    : "cover";
}

function sectionItemMediaRatio(
  section: SiteSection | undefined,
  fallback: string,
) {
  const value =
    section?.style?.itemMediaRatio;

  return value === "auto" ||
    value === "16:9" ||
    value === "3:2" ||
    value === "4:3" ||
    value === "1:1" ||
    value === "4:5"
    ? value
    : fallback;
}

function sectionItemPadding(
  section: SiteSection | undefined,
  fallback = 20,
) {
  const value =
    section?.style?.itemPadding;

  return typeof value === "number" &&
    Number.isFinite(value)
    ? Math.max(
        0,
        Math.min(96, value),
      )
    : fallback;
}

function itemFrameClass(
  frame: string,
) {
  if (frame === "outline") {
    return "border border-[var(--site-border)]";
  }

  if (frame === "surface") {
    return "bg-[var(--site-surface)]";
  }

  return "";
}


type SiteGalleryItem = {
  id: string;
  url: string;
  path: string;
  alt: string;
};

function readGalleryItems(section: SiteSection): SiteGalleryItem[] {
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
      typeof candidate.url !== "string"
    ) {
      return [];
    }

    return [{
      id: candidate.id,
      url: candidate.url,
      path: typeof candidate.path === "string" ? candidate.path : "",
      alt: typeof candidate.alt === "string" ? candidate.alt : "",
    }];
  });
}

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

function readCardItems(section: SiteSection): SiteCardItem[] {
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

type SiteStatItem = {
  id: string;
  value: string;
  label: string;
};

function readStatItems(
  section: SiteSection,
): SiteStatItem[] {
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

function readFaqItems(section: SiteSection): SiteFaqItem[] {
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

function readTestimonialItems(
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

function sectionAlignmentClass(section: SiteSection | undefined) {
  return section?.layout?.alignment === "center"
    ? "mx-auto text-center"
    : "";
}

function sectionWidthClass(section: SiteSection | undefined) {
  if (section?.layout?.width === "narrow") return "max-w-[520px]";
  if (section?.layout?.width === "wide") return "max-w-[900px]";
  return "max-w-[620px]";
}

function sectionPaddingClass(
  section: SiteSection | undefined,
) {
  const size =
    section?.layout?.size ??
    "default";

  if (size === "compact") {
    return "py-6 md:py-8";
  }

  if (size === "standard") {
    return "py-10 md:py-12";
  }

  if (size === "large") {
    return "py-14 md:py-16 lg:py-20";
  }

  const top =
    section?.layout?.paddingTop;

  const bottom =
    section?.layout?.paddingBottom;

  const resolvePadding = (
    side: "top" | "bottom",
    value:
      | "none"
      | "small"
      | "medium"
      | "large"
      | "xlarge"
      | undefined,
  ) => {
    const prefix =
      side === "top" ? "pt" : "pb";

    if (value === "none")
      return `${prefix}-0`;

    if (value === "small")
      return `${prefix}-4`;

    if (value === "medium")
      return `${prefix}-8`;

    if (value === "large")
      return `${prefix}-12`;

    if (value === "xlarge")
      return `${prefix}-16`;

    if (
      section?.layout?.spacing ===
      "compact"
    ) {
      return `${prefix}-5`;
    }

    if (
      section?.layout?.spacing ===
      "spacious"
    ) {
      return `${prefix}-12`;
    }

    return `${prefix}-[var(--site-section-y)]`;
  };

  return [
    resolvePadding("top", top),
    resolvePadding(
      "bottom",
      bottom,
    ),
  ].join(" ");
}

function cardsContentWidthStyle(section: SiteSection) {
  const contentWidth =
    section.layout?.contentWidth;

  if (
    typeof contentWidth === "number" &&
    Number.isFinite(contentWidth)
  ) {
    return {
      maxWidth: `${Math.max(320, contentWidth)}px`,
    } satisfies CSSProperties;
  }

  const width =
    section.layout?.width ?? "wide";

  if (width === "narrow") {
    return {
      maxWidth: "900px",
    } satisfies CSSProperties;
  }

  if (width === "normal") {
    return {
      maxWidth: "1180px",
    } satisfies CSSProperties;
  }

  if (width === "full") {
    return {
      maxWidth: "min(100%, 1680px)",
    } satisfies CSSProperties;
  }

  return {
    maxWidth: "var(--site-page-width)",
  } satisfies CSSProperties;
}

function cardsSectionStyle(section: SiteSection) {
  const mode =
    section.layout?.heightMode ?? "auto";

  if (mode === "minimum") {
    return {
      minHeight: `${Math.max(
        0,
        section.layout?.minHeight ?? 560,
      )}px`,
    } satisfies CSSProperties;
  }

  if (mode === "screen") {
    return {
      minHeight: "100svh",
      display: "flex",
      alignItems: "center",
    } satisfies CSSProperties;
  }

  return undefined;
}

function cardsContainerStyle(section: SiteSection) {
  const style: CSSProperties =
    cardsContentWidthStyle(section);
  const layout = section.layout;

  if (!layout) return style;

  if (
    typeof layout.paddingTopPx ===
      "number" &&
    Number.isFinite(
      layout.paddingTopPx,
    )
  ) {
    style.paddingTop = `${Math.max(
      0,
      layout.paddingTopPx,
    )}px`;
  }

  if (
    typeof layout.paddingRightPx ===
      "number" &&
    Number.isFinite(
      layout.paddingRightPx,
    )
  ) {
    style.paddingRight = `${Math.max(
      0,
      layout.paddingRightPx,
    )}px`;
  }

  if (
    typeof layout.paddingBottomPx ===
      "number" &&
    Number.isFinite(
      layout.paddingBottomPx,
    )
  ) {
    style.paddingBottom = `${Math.max(
      0,
      layout.paddingBottomPx,
    )}px`;
  }

  if (
    typeof layout.paddingLeftPx ===
      "number" &&
    Number.isFinite(
      layout.paddingLeftPx,
    )
  ) {
    style.paddingLeft = `${Math.max(
      0,
      layout.paddingLeftPx,
    )}px`;
  }

  return style;
}

function cardsGridStyle(section: SiteSection) {
  const gap = section.layout?.gap;

  if (
    typeof gap !== "number" ||
    !Number.isFinite(gap)
  ) {
    return undefined;
  }

  return {
    gap: `${Math.max(0, gap)}px`,
  } satisfies CSSProperties;
}

function sectionDividerClass(
  section: SiteSection | undefined,
) {
  const divider =
    section?.style?.divider ??
    "none";

  if (divider === "none") {
    return "";
  }

  const strength =
    section?.style?.dividerStrength ??
    "hairline";

  const borderColor =
    strength === "strong"
      ? "border-[var(--site-border-strong)]"
      : "border-[var(--site-border)]";

  if (divider === "top") {
    return `border-t ${borderColor}`;
  }

  if (divider === "bottom") {
    return `border-b ${borderColor}`;
  }

  return `border-y ${borderColor}`;
}

function sectionBackgroundClass(
  section: SiteSection | undefined,
) {
  let background = "";

  if (
    section?.style?.background === "plain"
  ) {
    background =
      "bg-[var(--site-surface)]";
  } else if (
    section?.style?.background === "dark" ||
    section?.style?.background === "contrast"
  ) {
    background =
      "bg-[var(--site-surface-strong)]";
  } else if (
    section?.style?.background === "muted" ||
    section?.style?.muted
  ) {
    background =
      "bg-[var(--site-surface-muted)]";
  }

  return [
    background,
    sectionDividerClass(section),
  ]
    .filter(Boolean)
    .join(" ");
}

function sectionVariant(section: SiteSection | undefined, fallback: string) {
  const variant = section?.layout?.variant;
  return typeof variant === "string" && variant.length > 0
    ? variant
    : fallback;
}


type SectionTextDefaults = {
  headingSize: number;
  headingWidth: number;
  bodySize: number;
  bodyWidth: number;
  textGap: number;
};

function sectionShellOuterStyle(
  section: SiteSection | undefined,
) {
  if (!section?.layout) {
    return undefined;
  }

  const layout =
    section.layout;

  if (
    layout.heightMode ===
    "screen"
  ) {
    return {
      minHeight: "100svh",
    } satisfies CSSProperties;
  }

  if (
    layout.heightMode ===
    "minimum"
  ) {
    return {
      minHeight:
        `${Math.max(
          0,
          layout.minHeight ??
            520,
        )}px`,
    } satisfies CSSProperties;
  }

  return undefined;
}

function sectionShellContainerStyle(
  section: SiteSection | undefined,
) {
  const layout =
    section?.layout;

  const style: CSSProperties =
    {};

  if (!layout) {
    return style;
  }

  if (
    typeof layout.contentWidth ===
      "number" &&
    Number.isFinite(
      layout.contentWidth,
    )
  ) {
    style.maxWidth =
      `${Math.max(
        320,
        layout.contentWidth,
      )}px`;
  } else if (
    layout.width === "narrow"
  ) {
    style.maxWidth = "900px";
  } else if (
    layout.width === "normal"
  ) {
    style.maxWidth = "1180px";
  } else if (
    layout.width === "full"
  ) {
    style.maxWidth =
      "min(100%, 1680px)";
  }

  const precisePadding = [
    ["paddingTop", layout.paddingTopPx],
    ["paddingRight", layout.paddingRightPx],
    ["paddingBottom", layout.paddingBottomPx],
    ["paddingLeft", layout.paddingLeftPx],
  ] as const;

  for (const [
    property,
    value,
  ] of precisePadding) {
    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      style[property] =
        `${Math.max(
          0,
          value,
        )}px`;
    }
  }

  return style;
}

function sectionHeadingTextStyle(
  section: SiteSection | undefined,
  defaults: SectionTextDefaults,
) {
  const size =
    section?.layout?.headingSize ??
    defaults.headingSize;

  const width =
    section?.layout?.headingWidth ??
    defaults.headingWidth;

  const mobile =
    Math.max(
      22,
      Math.round(
        size * 0.56,
      ),
    );

  return {
    fontSize:
      `clamp(${mobile}px, ${Math.max(
        2.4,
        size / 14,
      )}vw, ${size}px)`,
    maxWidth:
      `${width}px`,
  } satisfies CSSProperties;
}

function sectionBodyTextStyle(
  section: SiteSection | undefined,
  defaults: SectionTextDefaults,
) {
  return {
    fontSize:
      `${section?.layout?.bodySize ??
      defaults.bodySize}px`,
    maxWidth:
      `${section?.layout?.bodyWidth ??
      defaults.bodyWidth}px`,
  } satisfies CSSProperties;
}

function sectionTextGap(
  section: SiteSection | undefined,
  defaults: SectionTextDefaults,
) {
  return (
    section?.layout?.textGap ??
    defaults.textGap
  );
}

function HeroInlineMedia({
  section,
  editorContext,
}: {
  section?: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const mediaUrl =
    readContentString(
      section,
      "mediaUrl",
      heroCover,
    );

  const mediaAlt =
    readContentString(
      section,
      "mediaAlt",
    );

  const media =
    sectionMediaSettings(
      section,
    );

  const fixedRatio =
    media.ratio !== "auto";

  return (
    <div
      data-creator-editor-node={
        editorContext.editorPreview
          ? "media"
          : undefined
      }
      onClick={(event) =>
        handleEditorNodeClick(
          event,
          editorContext,
          section?.id,
          "media",
        )
      }
      className={`relative w-full overflow-hidden ${mediaFrameClass(
        media.frame,
      )} ${editorNodeClass(
        editorContext,
        section?.id,
        "media",
      )}`}
      style={{
        borderRadius:
          `${media.radius}px`,

        ...(fixedRatio
          ? {
              aspectRatio:
                mediaAspectRatio(
                  media.ratio,
                ),
            }
          : {
              minHeight:
                `${media.height}px`,
            }),
      }}
    >
      {mediaUrl ? (
        <img
          src={mediaUrl}
          alt={mediaAlt}
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit:
              media.fit,
            objectPosition:
              `${media.positionX}% ${media.positionY}%`,
            transform:
              `scale(${media.zoom / 100})`,
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--site-surface-strong)] text-[9px] uppercase tracking-[0.18em] text-[var(--site-text-faint)]">
          Add media
        </div>
      )}
    </div>
  );
}

function HeroSection({
  site,
  siteDocument,
  section,
  editorContext,
}: {
  site: PortfolioSiteData;
  siteDocument?: SiteDocument;
  section?: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const eyebrow =
    readContentString(
      section,
      "eyebrow",
      "Design · Build · Create",
    );

  const headline =
    readContentString(
      section,
      "headline",
      site.headline,
    );

  const intro =
    readContentString(
      section,
      "intro",
      site.intro,
    );

  const ctaLabel =
    readContentString(
      section,
      "primaryCtaLabel",
      "Explore my work",
    );

  const ctaHref =
    readContentString(
      section,
      "primaryCtaHref",
      "#software",
    );

  const ctaPageId =
    readContentString(
      section,
      "primaryCtaPageId",
    );

  const resolvedCtaHref =
    resolveSiteLinkHref(
      siteDocument,
      site.handle,
      {
        href: ctaHref,
        pageId:
          ctaPageId ||
          undefined,
      },
    );

  const variant =
    sectionVariant(
      section,
      "split",
    );

  const centered =
    variant === "centered";

  const editorial =
    variant === "editorial";

  const minimal =
    variant === "minimal";

  const textDefaults:
    SectionTextDefaults = {
      headingSize: 72,
      headingWidth: 780,
      bodySize: 14,
      bodyWidth: 520,
      textGap: 20,
    };

  const mediaShare =
    section?.layout
      ?.mediaShare ??
    60;

  const gap =
    section?.layout?.gap ??
    40;

  const copy = (
    <div
      className={`flex min-w-0 flex-col justify-center ${
        centered
          ? "mx-auto text-center"
          : ""
      }`}
    >
      <div
        data-creator-editor-node={
          editorContext.editorPreview
            ? "text"
            : undefined
        }
        onClick={(event) =>
          handleEditorNodeClick(
            event,
            editorContext,
            section?.id,
            "text",
          )
        }
        className={editorNodeClass(
          editorContext,
          section?.id,
          "text",
        )}
      >
        {eyebrow ? (
          <InlineEditableText
            as="p"
            value={eyebrow}
            field="eyebrow"
            sectionId={section?.id}
            node="text"
            editorContext={
              editorContext
            }
            className="text-[8px] font-medium uppercase tracking-[0.3em] text-[var(--site-text-subtle)]"
          />
        ) : null}

        <InlineEditableText
          as="h1"
          value={headline}
          field="headline"
          sectionId={section?.id}
          node="text"
          editorContext={
            editorContext
          }
          style={sectionHeadingTextStyle(
            section,
            textDefaults,
          )}
          className={`${
            eyebrow ? "mt-4" : ""
          } whitespace-pre-line leading-[0.94] tracking-[-0.06em] text-[var(--site-text)] ${
            centered
              ? "mx-auto"
              : ""
          }`}
        />

        {intro ? (
          <InlineEditableText
            as="p"
            value={intro}
            field="intro"
            sectionId={section?.id}
            node="text"
            editorContext={
              editorContext
            }
            multiline
            style={{
              ...sectionBodyTextStyle(
                section,
                textDefaults,
              ),
              marginTop:
                `${sectionTextGap(
                  section,
                  textDefaults,
                )}px`,
            }}
            className={`leading-[1.7] text-[var(--site-text-muted)] ${
              centered
                ? "mx-auto"
                : ""
            }`}
          />
        ) : null}
      </div>

      {ctaLabel ? (
        <a
          href={resolvedCtaHref}
          data-creator-editor-node={
            editorContext.editorPreview
              ? "button"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section?.id,
              "button",
            )
          }
          className={`mt-6 inline-flex h-9 w-fit items-center gap-3 rounded-full border border-[var(--site-border-strong)] px-4 text-[8px] font-medium uppercase tracking-[0.18em] text-[var(--site-accent)] transition hover:border-white/35 ${
            centered
              ? "mx-auto"
              : ""
          } ${editorNodeClass(
            editorContext,
            section?.id,
            "button",
          )}`}
        >
          <InlineEditableText
            value={ctaLabel}
            field="primaryCtaLabel"
            sectionId={section?.id}
            node="button"
            editorContext={
              editorContext
            }
          />

          <span>→</span>
        </a>
      ) : null}
    </div>
  );

  const media = minimal ? null : (
    <HeroInlineMedia
      section={section}
      editorContext={
        editorContext
      }
    />
  );

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview
          ? section?.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section?.id,
        )
      }
      style={
        sectionShellOuterStyle(
          section,
        )
      }
      className={`relative ${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(
        editorContext,
        section?.id,
      )}`}
    >
      <div
        style={
          sectionShellContainerStyle(
            section,
          )
        }
        className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        {variant === "split" ? (
          <div
            className="grid items-center lg:grid-cols-[var(--hero-copy)_var(--hero-media)]"
            style={{
              gap:
                `${gap}px`,
              "--hero-copy":
                `${100 - mediaShare}fr`,
              "--hero-media":
                `${mediaShare}fr`,
            } as CSSProperties}
          >
            {copy}
            {media}
          </div>
        ) : centered ? (
          <div
            className="mx-auto max-w-[1100px]"
          >
            {copy}

            {media ? (
              <div
                className="mx-auto mt-10"
                style={{
                  maxWidth:
                    `${Math.min(
                      1100,
                      section?.layout
                        ?.contentWidth ??
                        1100,
                    )}px`,
                }}
              >
                {media}
              </div>
            ) : null}
          </div>
        ) : editorial ? (
          <div
            className="grid items-center lg:grid-cols-[1.15fr_0.85fr]"
            style={{
              gap:
                `${gap}px`,
            }}
          >
            {copy}
            {media}
          </div>
        ) : (
          <div className="max-w-[900px]">
            {copy}
          </div>
        )}
      </div>
    </section>
  );
}

function ProductsSection({
  siteDocument,
  section,
  listings,
  editorPreview,
  editorContext,
}: {
  siteDocument?: SiteDocument;
  section: SiteSection;
  listings: SourceListing[];
  editorPreview: boolean;
  editorContext: EditorSelectionContext;
}) {
  type DisplayProduct = {
    id: string;
    title: string;
    description: string;
    image: string;
    priceLabel: string;
    metaLabel: string;
    href: string;
  };

  const heading =
    readContentString(
      section,
      "heading",
      section.label,
    );

  const intro =
    readContentString(
      section,
      "intro",
    );

  const showPrice =
    section.style?.showPrice !==
    false;

  const showDescription =
    section.style?.showDescription ===
    true;

  const columns =
    section.layout?.columns ??
    3;

  const gap =
    section.layout?.gap ??
    20;

  const variant =
    sectionVariant(
      section,
      "grid",
    );

  const listMode =
    variant === "list";

  const featuredMode =
    variant === "featured";

  const editorialMode =
    variant === "editorial";

  const frame =
    sectionItemFrame(
      section,
    );

  const radius =
    sectionItemRadius(
      section,
      0,
    );

  const mediaFit =
    sectionItemMediaFit(
      section,
    );

  const mediaRatio =
    sectionItemMediaRatio(
      section,
      "4:5",
    );

  const cardPadding =
    sectionItemPadding(
      section,
      0,
    );

  const catalog =
    siteDocument?.catalog;

  const catalogCollections =
    catalog?.collections ??
    [];

  const catalogItems =
    catalog?.items ??
    [];

  const products:
    DisplayProduct[] =
    section.source.kind ===
    "catalog"
      ? catalogItems
          .filter(
            (item) =>
              item.visible,
          )
          .filter(
            (item) => {
              if (
                section.source.kind !==
                "catalog"
              ) {
                return false;
              }

              if (
                section.source.mode ===
                "collection"
              ) {
                return (
                  Boolean(
                    section.source
                      .collectionId,
                  ) &&
                  item.collectionId ===
                    section.source
                      .collectionId
                );
              }

              if (
                section.source.mode ===
                "selected"
              ) {
                return (
                  section.source
                    .itemIds ??
                  []
                ).includes(
                  item.id,
                );
              }

              return true;
            },
          )
          .slice()
          .sort(
            (a, b) =>
              a.sortOrder -
              b.sortOrder,
          )
          .map((item) => {
            const collection =
              catalogCollections.find(
                (candidate) =>
                  candidate.id ===
                  item.collectionId,
              );

            const statusLabel =
              item.status ===
              "coming-soon"
                ? "Coming soon"
                : item.status ===
                    "available"
                  ? "Available"
                  : "";

            return {
              id: item.id,
              title: item.title,
              description:
                item.subtitle ??
                "",
              image:
                item.imageUrl,
              priceLabel:
                item.priceLabel ??
                "",
              metaLabel: [
                collection?.title,
                statusLabel,
              ]
                .filter(Boolean)
                .join(" · "),
              href:
                item.href ?? "",
            };
          })
      : section.source.kind ===
          "source"
        ? listings
            .filter(
              (listing) =>
                listing.type ===
                  section.source
                    .listingType &&
                (
                  section.source
                    .mode !==
                    "selected" ||
                  (
                    section.source
                      .listingIds ??
                    []
                  ).includes(
                    listing.id,
                  )
                ),
            )
            .map(
              (listing) => {
                const card =
                  normalizeSourceListingCardProps(
                    listing,
                  );

                return {
                  id:
                    listing.id,
                  title:
                    listing.title,
                  description:
                    listing.description ??
                    "",
                  image:
                    resolveListingImage(
                      listing,
                    ) ??
                    card.image ??
                    "",
                  priceLabel:
                    card.priceLabel ??
                    "",
                  metaLabel: "",
                  href: "",
                };
              },
            )
        : [];

  const textDefaults:
    SectionTextDefaults = {
      headingSize: 48,
      headingWidth: 900,
      bodySize: 14,
      bodyWidth: 640,
      textGap: 16,
    };

  const desktopColumns =
    columns === 4
      ? "lg:grid-cols-4"
      : columns === 2
        ? "lg:grid-cols-2"
        : "lg:grid-cols-3";

  const gridClass =
    listMode
      ? "grid"
      : editorialMode
        ? "grid grid-cols-1 md:grid-cols-2"
        : `grid grid-cols-2 ${desktopColumns}`;

  if (
    products.length === 0 &&
    !editorPreview
  ) {
    return null;
  }

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview
          ? section.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section.id,
        )
      }
      style={
        sectionShellOuterStyle(
          section,
        )
      }
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(
        editorContext,
        section.id,
      )}`}
    >
      <div
        style={
          sectionShellContainerStyle(
            section,
          )
        }
        className={`mx-auto w-full max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          data-creator-editor-node={
            editorContext.editorPreview
              ? "text"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "text",
            )
          }
          className={`mb-8 md:mb-10 ${editorNodeClass(
            editorContext,
            section.id,
            "text",
          )}`}
        >
          <InlineEditableText
            as="h2"
            value={heading}
            field="heading"
            sectionId={
              section.id
            }
            node="text"
            editorContext={
              editorContext
            }
            style={
              sectionHeadingTextStyle(
                section,
                textDefaults,
              )
            }
            className="leading-[0.96] tracking-[-0.05em] text-[var(--site-text)]"
          />

          {intro ? (
            <InlineEditableText
              as="p"
              value={intro}
              field="intro"
              sectionId={
                section.id
              }
              node="text"
              editorContext={
                editorContext
              }
              multiline
              style={{
                ...sectionBodyTextStyle(
                  section,
                  textDefaults,
                ),
                marginTop:
                  `${sectionTextGap(
                    section,
                    textDefaults,
                  )}px`,
              }}
              className="leading-[1.7] text-[var(--site-text-muted)]"
            />
          ) : null}
        </div>

        {products.length >
        0 ? (
          <div
            className={
              gridClass
            }
            style={{
              gap:
                `${gap}px`,
            }}
          >
            {products.map(
              (
                product,
                index,
              ) => {
                const featured =
                  featuredMode &&
                  index === 0;

                const sideLayout =
                  listMode ||
                  featured;

                const fixedRatio =
                  mediaRatio !==
                  "auto";

                const media = (
                  <div
                    className={`relative overflow-hidden bg-[var(--site-surface-strong)] ${
                      sideLayout
                        ? "min-h-[220px]"
                        : ""
                    }`}
                    style={
                      !sideLayout &&
                      fixedRatio
                        ? {
                            aspectRatio:
                              mediaAspectRatio(
                                mediaRatio,
                              ),
                          }
                        : undefined
                    }
                  >
                    {product.image ? (
                      <img
                        src={
                          product.image
                        }
                        alt={
                          product.title
                        }
                        className={
                          sideLayout ||
                          fixedRatio
                            ? "absolute inset-0 h-full w-full"
                            : "block h-auto w-full"
                        }
                        style={
                          sideLayout ||
                          fixedRatio
                            ? {
                                objectFit:
                                  mediaFit,
                                objectPosition:
                                  "50% 50%",
                              }
                            : undefined
                        }
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[9px] uppercase tracking-[0.18em] text-[var(--site-text-faint)]">
                        No image
                      </div>
                    )}
                  </div>
                );

                const copy = (
                  <div
                    className={`flex min-w-0 flex-1 flex-col ${
                      frame ===
                      "none"
                        ? "pt-3"
                        : ""
                    }`}
                    style={
                      frame ===
                      "none"
                        ? undefined
                        : {
                            padding:
                              `${cardPadding || 16}px`,
                          }
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3
                          className={`leading-[1.15] tracking-[-0.025em] text-[var(--site-text)] ${
                            sideLayout ||
                            editorialMode
                              ? "text-[20px] sm:text-[24px]"
                              : "text-[13px] sm:text-[14px]"
                          }`}
                        >
                          {
                            product.title
                          }
                        </h3>

                        {product.metaLabel ? (
                          <p className="mt-1 truncate text-[9px] leading-4 text-[var(--site-text-muted)] sm:text-[10px]">
                            {
                              product.metaLabel
                            }
                          </p>
                        ) : null}
                      </div>

                      {showPrice &&
                      product.priceLabel ? (
                        <p className="shrink-0 text-[10px] tabular-nums text-[var(--site-text-subtle)] sm:text-[11px]">
                          {
                            product.priceLabel
                          }
                        </p>
                      ) : null}
                    </div>

                    {showDescription &&
                    product.description ? (
                      <p
                        className={`mt-2 leading-[1.55] text-[var(--site-text-muted)] ${
                          sideLayout ||
                          editorialMode
                            ? "text-[13px]"
                            : "line-clamp-2 text-[10px]"
                        }`}
                      >
                        {
                          product.description
                        }
                      </p>
                    ) : null}
                  </div>
                );

                return (
                  <article
                    key={
                      product.id
                    }
                    className={[
                      "overflow-hidden",
                      itemFrameClass(
                        frame,
                      ),
                      featured
                        ? "col-span-2"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      borderRadius:
                        `${radius}px`,
                    }}
                  >
                    {sideLayout ? (
                      <div
                        className="flex flex-col md:grid"
                        style={{
                          gridTemplateColumns:
                            listMode
                              ? "minmax(160px, 28%) minmax(0, 1fr)"
                              : "minmax(0, 1.35fr) minmax(0, 0.65fr)",
                        }}
                      >
                        {media}
                        {copy}
                      </div>
                    ) : (
                      <div className="flex h-full flex-col">
                        {media}
                        {copy}
                      </div>
                    )}
                  </article>
                );
              },
            )}
          </div>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center border border-dashed border-[var(--site-border-strong)] px-6 text-center">
            <div>
              <p className="text-[11px] font-medium text-[var(--site-text-muted)]">
                No products to
                show
              </p>

              <p className="mt-2 text-[9px] leading-4 text-[var(--site-text-faint)]">
                {section.source.kind ===
                "catalog"
                  ? "Add Catalog items or change this section’s Catalog scope."
                  : "Select Source products for this section."}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CardsSection({
  siteHandle,
  siteDocument,
  section,
  editorPreview,
  editorContext,
}: {
  siteHandle: string;
  siteDocument?: SiteDocument;
  section: SiteSection;
  editorPreview: boolean;
  editorContext: EditorSelectionContext;
}) {
  const heading =
    readContentString(
      section,
      "heading",
      section.label,
    );

  const intro =
    readContentString(
      section,
      "intro",
    );

  const items =
    readCardItems(section);

  const variant =
    sectionVariant(
      section,
      "grid",
    );

  const columns =
    section.layout?.columns ??
    3;

  const sectionTextDefaults:
    SectionTextDefaults = {
      headingSize: 64,
      headingWidth: 1000,
      bodySize: 14,
      bodyWidth: 680,
      textGap: 18,
    };

  if (
    items.length === 0 &&
    !editorPreview
  ) {
    return null;
  }

  const gridColumns =
    columns === 4
      ? "lg:grid-cols-4"
      : columns === 2
        ? "lg:grid-cols-2"
        : "lg:grid-cols-3";

  const sectionStyle =
    cardsSectionStyle(
      section,
    );

  const containerStyle =
    cardsContainerStyle(
      section,
    );

  const gridStyle =
    cardsGridStyle(
      section,
    );

  const cardFrame =
    sectionItemFrame(
      section,
    );

  const cardRadius =
    sectionItemRadius(
      section,
      12,
    );

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview
          ? section.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section.id,
        )
      }
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(
        editorContext,
        section.id,
      )}`}
      style={sectionStyle}
    >
      <div
        className={`mx-auto w-full px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
        style={containerStyle}
      >
        <div
          data-creator-editor-node={
            editorContext.editorPreview
              ? "text"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "text",
            )
          }
          className={`mb-8 md:mb-10 ${editorNodeClass(
            editorContext,
            section.id,
            "text",
          )}`}
        >
          <InlineEditableText
            as="h2"
            value={heading}
            field="heading"
            sectionId={
              section.id
            }
            node="text"
            editorContext={
              editorContext
            }
            style={sectionHeadingTextStyle(
              section,
              sectionTextDefaults,
            )}
            className="leading-[0.92] tracking-[-0.06em] text-[var(--site-text)]"
          />

          {intro ? (
            <InlineEditableText
              as="p"
              value={intro}
              field="intro"
              sectionId={
                section.id
              }
              node="text"
              editorContext={
                editorContext
              }
              multiline
              style={{
                ...sectionBodyTextStyle(
                  section,
                  sectionTextDefaults,
                ),
                marginTop:
                  `${sectionTextGap(
                    section,
                    sectionTextDefaults,
                  )}px`,
              }}
              className="leading-[1.7] text-[var(--site-text-muted)]"
            />
          ) : null}
        </div>

        {items.length > 0 ? (
          <div
            className={
              variant === "list"
                ? "grid"
                : `grid sm:grid-cols-2 ${gridColumns}`
            }
            style={gridStyle}
          >
            {items.map(
              (item, index) => {
                const legacyFeatured =
                  item.emphasis ===
                    undefined &&
                  variant ===
                    "featured" &&
                  index === 0;

                const featured =
                  item.span ===
                    "full" ||
                  item.emphasis ===
                    "featured" ||
                  legacyFeatured;

                const span =
                  item.span ??
                  (
                    featured
                      ? "full"
                      : "one"
                  );

                const mediaPosition =
                  item.mediaPosition ??
                  (
                    featured ||
                    variant ===
                      "list"
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

                const cardMinHeight =
                  item.minHeight ??
                  (
                    featured
                      ? 460
                      : 320
                  );

                const cardPadding =
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

                const resolvedLink =
                  resolveSiteLinkHref(
                    siteDocument,
                    siteHandle,
                    {
                      href:
                        item.linkHref,
                      pageId:
                        item.linkPageId ||
                        undefined,
                    },
                  );

                const hasImage =
                  Boolean(
                    item.imageUrl,
                  );

                const aspectRatio =
                  mediaRatio === "1:1"
                    ? "1 / 1"
                    : mediaRatio === "4:3"
                      ? "4 / 3"
                      : mediaRatio === "3:2"
                        ? "3 / 2"
                        : "16 / 9";

                const sideLayout =
                  mediaPosition ===
                    "left" ||
                  mediaPosition ===
                    "right";

                const media = (
                  <div
                    className={`relative overflow-hidden bg-[var(--site-surface-strong)] ${
                      sideLayout
                        ? "min-h-[220px]"
                        : ""
                    } ${
                      mediaPosition ===
                      "right"
                        ? "md:order-2"
                        : ""
                    }`}
                    style={
                      sideLayout
                        ? undefined
                        : {
                            aspectRatio,
                          }
                    }
                  >
                    {hasImage ? (
                      <img
                        src={
                          item.imageUrl
                        }
                        alt={
                          item.imageAlt
                        }
                        className="absolute inset-0 h-full w-full transition duration-300"
                        style={{
                          objectFit:
                            mediaFit,
                          objectPosition:
                            `${mediaPositionX}% ${mediaPositionY}%`,
                          transform:
                            `scale(${mediaZoom / 100})`,
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[9px] uppercase tracking-[0.22em] text-[var(--site-text-faint)]">
                        Add media
                      </div>
                    )}
                  </div>
                );

                const copy = (
                  <div
                    className={`flex min-w-0 flex-1 flex-col justify-between ${
                      mediaPosition ===
                      "right"
                        ? "md:order-1"
                        : ""
                    }`}
                    style={{
                      padding:
                        `${cardPadding}px`,
                    }}
                  >
                    <div
                      style={{
                        maxWidth:
                          `${textWidth}px`,
                      }}
                    >
                      {item.eyebrow ? (
                        <p className="text-[8px] font-medium uppercase tracking-[0.24em] text-[var(--site-accent)]">
                          {
                            item.eyebrow
                          }
                        </p>
                      ) : null}

                      <h3
                        className="mt-3 leading-[0.98] tracking-[-0.05em] text-[var(--site-text)]"
                        style={{
                          fontSize:
                            `clamp(22px, ${Math.max(
                              2,
                              titleSize /
                                12,
                            )}vw, ${titleSize}px)`,
                        }}
                      >
                        {item.title ||
                          "Untitled"}
                      </h3>

                      {item.body ? (
                        <p
                          className="mt-4 leading-[1.7] text-[var(--site-text-muted)]"
                          style={{
                            fontSize:
                              `${bodySize}px`,
                          }}
                        >
                          {
                            item.body
                          }
                        </p>
                      ) : null}
                    </div>

                    {item.linkLabel ? (
                      <span className="mt-8 inline-flex items-center gap-3 text-[8px] font-medium uppercase tracking-[0.18em] text-[var(--site-accent)]">
                        {
                          item.linkLabel
                        }
                        <span>→</span>
                      </span>
                    ) : null}
                  </div>
                );

                const body =
                  sideLayout ? (
                    <div
                      className="flex flex-col md:grid"
                      style={{
                        gridTemplateColumns:
                          mediaPosition ===
                          "left"
                            ? `${mediaShare}% minmax(0, 1fr)`
                            : `minmax(0, 1fr) ${mediaShare}%`,
                        minHeight:
                          `${cardMinHeight}px`,
                      }}
                    >
                      {media}
                      {copy}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col">
                      {media}
                      {copy}
                    </div>
                  );

                const spanClass =
                  variant === "list"
                    ? "sm:col-span-full"
                    : span === "full"
                      ? "sm:col-span-2 lg:col-span-full"
                      : span === "two"
                        ? "sm:col-span-2"
                        : "";

                const className = [
                  "group relative overflow-hidden",
                  itemFrameClass(
                    cardFrame,
                  ),
                  "transition duration-200",
                  editorBlockClass(
                    editorContext,
                    section.id,
                    item.id,
                  ),
                  resolvedLink &&
                  resolvedLink !== "#"
                    ? "hover:-translate-y-[2px] hover:border-[var(--site-border-strong)]"
                    : "",
                  spanClass,
                ]
                  .filter(Boolean)
                  .join(" ");

                const editorLabel =
                  editorPreview ? (
                    <span className="pointer-events-none absolute left-2 top-2 z-20 max-w-[calc(100%-16px)] truncate rounded bg-black/75 px-2 py-1 text-[8px] font-medium tracking-[0.03em] text-white/75 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                      {item.title ||
                        "Card"}
                    </span>
                  ) : null;

                if (
                  resolvedLink &&
                  resolvedLink !== "#"
                ) {
                  return (
                    <a
                      key={
                        item.id
                      }
                      href={
                        resolvedLink
                      }
                      data-creator-editor-block={
                        editorContext.editorPreview
                          ? item.id
                          : undefined
                      }
                      onClick={(event) =>
                        handleEditorBlockClick(
                          event,
                          editorContext,
                          section.id,
                          item.id,
                        )
                      }
                      className={
                        className
                      }
                      style={{
                        borderRadius:
                          `${cardRadius}px`,
                      }}
                    >
                      {editorLabel}
                      {body}
                    </a>
                  );
                }

                return (
                  <article
                    key={
                      item.id
                    }
                    data-creator-editor-block={
                      editorContext.editorPreview
                        ? item.id
                        : undefined
                    }
                    onClick={(event) =>
                      handleEditorBlockClick(
                        event,
                        editorContext,
                        section.id,
                        item.id,
                      )
                    }
                    className={
                      className
                    }
                    style={{
                      borderRadius:
                        `${cardRadius}px`,
                    }}
                  >
                    {editorLabel}
                    {body}
                  </article>
                );
              },
            )}
          </div>
        ) : (
          <div className="flex min-h-[260px] items-center justify-center rounded-[var(--site-radius)] border border-dashed border-[var(--site-border)] text-[9px] uppercase tracking-[0.2em] text-[var(--site-text-faint)]">
            Add cards
          </div>
        )}
      </div>
    </section>
  );
}
function SplitSection({
  siteHandle,
  siteDocument,
  section,
  editorContext,
}: {
  siteHandle: string;
  siteDocument?: SiteDocument;
  section: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const eyebrow =
    readContentString(
      section,
      "eyebrow",
    );

  const heading =
    readContentString(
      section,
      "heading",
      section.label,
    );

  const body =
    readContentString(
      section,
      "body",
    );

  const buttonLabel =
    readContentString(
      section,
      "buttonLabel",
    );

  const buttonHref =
    readContentString(
      section,
      "buttonHref",
      "#",
    );

  const buttonPageId =
    readContentString(
      section,
      "buttonPageId",
    );

  const mediaUrl =
    readContentString(
      section,
      "mediaUrl",
    );

  const mediaAlt =
    readContentString(
      section,
      "mediaAlt",
    );

  const media =
    sectionMediaSettings(
      section,
    );

  const variant =
    sectionVariant(
      section,
      "media-right",
    );

  const mediaShare =
    section.layout
      ?.mediaShare ??
    50;

  const gap =
    section.layout?.gap ??
    40;

  const resolvedHref =
    resolveSiteLinkHref(
      siteDocument,
      siteHandle,
      {
        href:
          buttonHref,
        pageId:
          buttonPageId ||
          undefined,
      },
    );

  const textDefaults:
    SectionTextDefaults = {
      headingSize: 48,
      headingWidth: 760,
      bodySize: 14,
      bodyWidth: 620,
      textGap: 18,
    };

  const copy = (
    <div
      data-creator-editor-node={
        editorContext.editorPreview
          ? "text"
          : undefined
      }
      onClick={(event) =>
        handleEditorNodeClick(
          event,
          editorContext,
          section.id,
          "text",
        )
      }
      className={`flex min-w-0 flex-col justify-center ${editorNodeClass(
        editorContext,
        section.id,
        "text",
      )}`}
    >
      {eyebrow ? (
        <InlineEditableText
          value={eyebrow}
          field="eyebrow"
          sectionId={section.id}
          node="text"
          editorContext={
            editorContext
          }
          className="text-[8px] font-medium uppercase tracking-[0.24em] text-[var(--site-accent)]"
        />
      ) : null}

      <InlineEditableText
        as="h2"
        value={heading}
        field="heading"
        sectionId={section.id}
        node="text"
        editorContext={
          editorContext
        }
        style={sectionHeadingTextStyle(
          section,
          textDefaults,
        )}
        className={`${eyebrow ? "mt-3" : ""} leading-[0.96] tracking-[-0.055em] text-[var(--site-text)]`}
      />

      {body ? (
        <InlineEditableText
          as="p"
          value={body}
          field="body"
          sectionId={section.id}
          node="text"
          editorContext={
            editorContext
          }
          multiline
          style={{
            ...sectionBodyTextStyle(
              section,
              textDefaults,
            ),
            marginTop:
              `${sectionTextGap(
                section,
                textDefaults,
              )}px`,
          }}
          className="leading-[1.75] text-[var(--site-text-muted)]"
        />
      ) : null}

      {buttonLabel ? (
        <a
          href={resolvedHref}
          data-creator-editor-node={
            editorContext.editorPreview
              ? "button"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "button",
            )
          }
          className={`mt-7 inline-flex h-9 w-fit items-center gap-3 rounded-full border border-[var(--site-border-strong)] px-4 text-[8px] font-medium uppercase tracking-[0.18em] text-[var(--site-accent)] ${editorNodeClass(
            editorContext,
            section.id,
            "button",
          )}`}
        >
          <InlineEditableText
            value={buttonLabel}
            field="buttonLabel"
            sectionId={section.id}
            node="button"
            editorContext={
              editorContext
            }
          />
          <span>→</span>
        </a>
      ) : null}
    </div>
  );

  const mediaNode = (
    <div
      data-creator-editor-node={
        editorContext.editorPreview
          ? "media"
          : undefined
      }
      onClick={(event) =>
        handleEditorNodeClick(
          event,
          editorContext,
          section.id,
          "media",
        )
      }
      className={`relative overflow-hidden ${mediaFrameClass(
        media.frame,
      )} ${editorNodeClass(
        editorContext,
        section.id,
        "media",
      )}`}
      style={{
        minHeight:
          `${media.height}px`,
        borderRadius:
          `${media.radius}px`,
      }}
    >
      {mediaUrl ? (
        <img
          src={mediaUrl}
          alt={mediaAlt}
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit:
              media.fit,
            objectPosition:
              `${media.positionX}% ${media.positionY}%`,
            transform:
              `scale(${media.zoom / 100})`,
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--site-surface-strong)] text-[9px] uppercase tracking-[0.18em] text-[var(--site-text-faint)]">
          Add media
        </div>
      )}
    </div>
  );

  const textShare =
    100 - mediaShare;

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview
          ? section.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section.id,
        )
      }
      style={
        sectionShellOuterStyle(
          section,
        )
      }
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(
        editorContext,
        section.id,
      )}`}
    >
      <div
        style={
          sectionShellContainerStyle(
            section,
          )
        }
        className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        {variant === "stacked" ? (
          <div
            className="grid"
            style={{
              gap:
                `${gap}px`,
            }}
          >
            {copy}
            {mediaNode}
          </div>
        ) : (
          <div
            className="grid items-center lg:grid-cols-[var(--split-left)_var(--split-right)]"
            style={{
              gap:
                `${gap}px`,

              "--split-left":
                variant ===
                "media-left"
                  ? `${mediaShare}fr`
                  : `${textShare}fr`,

              "--split-right":
                variant ===
                "media-left"
                  ? `${textShare}fr`
                  : `${mediaShare}fr`,
            } as CSSProperties}
          >
            {variant ===
            "media-left" ? (
              <>
                {mediaNode}
                {copy}
              </>
            ) : (
              <>
                {copy}
                {mediaNode}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function StatsSection({
  section,
  editorPreview,
  editorContext,
}: {
  section: SiteSection;
  editorPreview: boolean;
  editorContext: EditorSelectionContext;
}) {
  const heading = readContentString(
    section,
    "heading",
    section.label,
  );
  const intro = readContentString(section, "intro");
  const items = readStatItems(section);
  const variant = sectionVariant(section, "grid");
  const columns = section.layout?.columns ?? 3;

  if (items.length === 0 && !editorPreview) {
    return null;
  }

  const gridColumns =
    columns === 4
      ? "lg:grid-cols-4"
      : columns === 2
      ? "lg:grid-cols-2"
      : "lg:grid-cols-3";

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview
          ? section.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section.id,
        )
      }
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(
        editorContext,
        section.id,
      )}`}
    >
      <div
        className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          data-creator-editor-node={
            editorContext.editorPreview
              ? "text"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "text",
            )
          }
          className={`mb-5 ${editorNodeClass(
            editorContext,
            section.id,
            "text",
          )}`}
        >
          <InlineEditableText
            as="h2"
            value={heading}
            field="heading"
            sectionId={section.id}
            node="text"
            editorContext={editorContext}
            className="text-[clamp(2rem,4vw,3.5rem)] leading-[0.96] tracking-[-0.055em] text-[var(--site-text)]"
          />

          {intro ? (
            <InlineEditableText
              as="p"
              value={intro}
              field="intro"
              sectionId={section.id}
              node="text"
              editorContext={editorContext}
              multiline
              className="mt-3 max-w-[620px] text-[11px] leading-[1.65] text-[var(--site-text-muted)]"
            />
          ) : null}
        </div>

        {items.length > 0 ? (
          <div
            className={
              variant === "strip"
                ? `grid border-y border-[var(--site-border)] sm:grid-cols-2 ${gridColumns}`
                : `grid gap-3 sm:grid-cols-2 ${gridColumns}`
            }
          >
            {items.map((item) => (
              <article
                key={item.id}
                className={
                  variant === "strip"
                    ? "border-b border-[var(--site-border)] py-5 sm:border-b-0 sm:border-r sm:px-5 first:pl-0 last:border-r-0"
                    : variant === "editorial"
                    ? "py-6"
                    : "rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5"
                }
              >
                <p
                  className={`leading-none tracking-[-0.07em] text-[var(--site-accent)] ${
                    variant === "editorial"
                      ? "text-[clamp(4rem,8vw,8rem)]"
                      : "text-[clamp(2.8rem,5vw,5rem)]"
                  }`}
                >
                  {item.value}
                </p>

                {item.label ? (
                  <p className="mt-3 text-[9px] uppercase tracking-[0.16em] text-[var(--site-text-subtle)]">
                    {item.label}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[140px] items-center justify-center rounded-[var(--site-radius)] border border-dashed border-[var(--site-border)] text-[10px] uppercase tracking-[0.18em] text-[var(--site-text-subtle)]">
            Add stats
          </div>
        )}
      </div>
    </section>
  );
}

function FaqSection({
  section,
  editorPreview,
  editorContext,
}: {
  section: SiteSection;
  editorPreview: boolean;
  editorContext: EditorSelectionContext;
}) {
  const heading = readContentString(
    section,
    "heading",
    section.label,
  );
  const intro = readContentString(section, "intro");
  const items = readFaqItems(section);
  const variant = sectionVariant(
    section,
    "accordion",
  );

  if (items.length === 0 && !editorPreview) {
    return null;
  }

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview
          ? section.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section.id,
        )
      }
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(
        editorContext,
        section.id,
      )}`}
    >
      <div
        className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          data-creator-editor-node={
            editorContext.editorPreview
              ? "text"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "text",
            )
          }
          className={`mb-6 ${editorNodeClass(
            editorContext,
            section.id,
            "text",
          )}`}
        >
          <InlineEditableText
            as="h2"
            value={heading}
            field="heading"
            sectionId={section.id}
            node="text"
            editorContext={editorContext}
            className="text-[clamp(2rem,4vw,3.5rem)] leading-[0.96] tracking-[-0.055em] text-[var(--site-text)]"
          />

          {intro ? (
            <InlineEditableText
              as="p"
              value={intro}
              field="intro"
              sectionId={section.id}
              node="text"
              editorContext={editorContext}
              multiline
              className="mt-3 max-w-[620px] text-[11px] leading-[1.65] text-[var(--site-text-muted)]"
            />
          ) : null}
        </div>

        {items.length > 0 ? (
          <div
            className={
              variant === "columns"
                ? "grid gap-3 md:grid-cols-2"
                : "grid"
            }
          >
            {items.map((item) =>
              variant === "accordion" ? (
                <details
                  key={item.id}
                  className="group border-t border-[var(--site-border)] last:border-b"
                >
                  <summary className="flex min-h-[58px] cursor-pointer list-none items-center justify-between gap-6 py-3 text-[13px] font-medium text-[var(--site-text)] [&::-webkit-details-marker]:hidden">
                    <span>{item.question}</span>
                    <span className="text-[18px] font-light text-[var(--site-text-subtle)] transition group-open:rotate-45">
                      +
                    </span>
                  </summary>

                  {item.answer ? (
                    <p className="max-w-[760px] pb-5 text-[11px] leading-[1.7] text-white/47">
                      {item.answer}
                    </p>
                  ) : null}
                </details>
              ) : (
                <article
                  key={item.id}
                  className={`border-[var(--site-border)] ${
                    variant === "columns"
                      ? "rounded-[var(--site-radius)] border bg-[var(--site-surface)] p-5"
                      : "border-t py-5 last:border-b"
                  }`}
                >
                  <h3 className="text-[14px] font-medium tracking-[-0.02em] text-[var(--site-text)]">
                    {item.question}
                  </h3>
                  {item.answer ? (
                    <p className="mt-3 text-[11px] leading-[1.7] text-white/47">
                      {item.answer}
                    </p>
                  ) : null}
                </article>
              ),
            )}
          </div>
        ) : (
          <div className="flex min-h-[150px] items-center justify-center rounded-[var(--site-radius)] border border-dashed border-[var(--site-border)] text-[10px] uppercase tracking-[0.18em] text-[var(--site-text-subtle)]">
            Add FAQ questions
          </div>
        )}
      </div>
    </section>
  );
}

function TestimonialsSection({
  section,
  editorPreview,
  editorContext,
}: {
  section: SiteSection;
  editorPreview: boolean;
  editorContext: EditorSelectionContext;
}) {
  const heading = readContentString(
    section,
    "heading",
    section.label,
  );
  const intro = readContentString(section, "intro");
  const items = readTestimonialItems(section);
  const variant = sectionVariant(section, "grid");
  const columns = section.layout?.columns ?? 3;

  if (items.length === 0 && !editorPreview) {
    return null;
  }

  const gridColumns =
    columns === 4
      ? "lg:grid-cols-4"
      : columns === 2
      ? "lg:grid-cols-2"
      : "lg:grid-cols-3";

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview
          ? section.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section.id,
        )
      }
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(
        editorContext,
        section.id,
      )}`}
    >
      <div
        className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          data-creator-editor-node={
            editorContext.editorPreview
              ? "text"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "text",
            )
          }
          className={`mb-6 ${editorNodeClass(
            editorContext,
            section.id,
            "text",
          )}`}
        >
          <InlineEditableText
            as="h2"
            value={heading}
            field="heading"
            sectionId={section.id}
            node="text"
            editorContext={editorContext}
            className="text-[clamp(2rem,4vw,3.5rem)] leading-[0.96] tracking-[-0.055em] text-[var(--site-text)]"
          />

          {intro ? (
            <InlineEditableText
              as="p"
              value={intro}
              field="intro"
              sectionId={section.id}
              node="text"
              editorContext={editorContext}
              multiline
              className="mt-3 max-w-[620px] text-[11px] leading-[1.65] text-[var(--site-text-muted)]"
            />
          ) : null}
        </div>

        {items.length > 0 ? (
          <div
            className={
              variant === "list"
                ? "grid gap-3"
                : `grid gap-3 sm:grid-cols-2 ${gridColumns}`
            }
          >
            {items.map((item, index) => {
              const featured =
                variant === "featured" && index === 0;

              return (
                <article
                  key={item.id}
                  className={`flex flex-col justify-between border border-[var(--site-border)] bg-[var(--site-surface)] p-5 rounded-[var(--site-radius)] ${
                    featured
                      ? "min-h-[260px] sm:col-span-2"
                      : variant === "list"
                      ? "min-h-[150px]"
                      : "min-h-[190px]"
                  }`}
                >
                  <p
                    className={`leading-[1.45] tracking-[-0.025em] text-[var(--site-text)] ${
                      featured
                        ? "max-w-[900px] text-[clamp(1.8rem,3vw,3rem)]"
                        : "text-[18px]"
                    }`}
                  >
                    “{item.quote}”
                  </p>

                  <div className="mt-8 border-t border-[var(--site-border)] pt-3">
                    <p className="text-[10px] font-medium text-[var(--site-accent)]">
                      {item.name}
                    </p>
                    {item.role ? (
                      <p className="mt-1 text-[9px] text-[var(--site-text-subtle)]">
                        {item.role}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[150px] items-center justify-center rounded-[var(--site-radius)] border border-dashed border-[var(--site-border)] text-[10px] uppercase tracking-[0.18em] text-[var(--site-text-subtle)]">
            Add testimonials
          </div>
        )}
      </div>
    </section>
  );
}

function EmbedSection({
  section,
  editorPreview,
  editorContext,
}: {
  section: SiteSection;
  editorPreview: boolean;
  editorContext: EditorSelectionContext;
}) {
  const heading = readContentString(
    section,
    "heading",
    section.label,
  );
  const intro = readContentString(
    section,
    "intro",
  );
  const rawUrl = readContentString(
    section,
    "url",
  );
  const title =
    readContentString(
      section,
      "title",
      heading || "Embedded media",
    ) || "Embedded media";

  const embed =
    resolveSiteEmbedUrl(rawUrl);

  const variant = sectionVariant(
    section,
    "contained",
  );

  if (!embed && !editorPreview) {
    return null;
  }

  const stageWidth =
    variant === "wide"
      ? "max-w-[var(--site-page-width)]"
      : "max-w-[1100px]";

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview
          ? section.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section.id,
        )
      }
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(
        editorContext,
        section.id,
      )}`}
    >
      <div
        className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          data-creator-editor-node={
            editorContext.editorPreview
              ? "text"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "text",
            )
          }
          className={`mb-5 ${editorNodeClass(
            editorContext,
            section.id,
            "text",
          )}`}
        >
          <InlineEditableText
            as="h2"
            value={heading}
            field="heading"
            sectionId={section.id}
            node="text"
            editorContext={editorContext}
            className="text-[clamp(2rem,4vw,3.5rem)] leading-[0.96] tracking-[-0.055em] text-[var(--site-text)]"
          />

          {intro ? (
            <InlineEditableText
              as="p"
              value={intro}
              field="intro"
              sectionId={section.id}
              node="text"
              editorContext={editorContext}
              multiline
              className="mt-3 max-w-[620px] text-[11px] leading-[1.65] text-[var(--site-text-muted)]"
            />
          ) : null}
        </div>

        <div
          data-creator-editor-node={
            editorContext.editorPreview
              ? "media"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "media",
            )
          }
          className={`mx-auto overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface-strong)] ${stageWidth} ${editorNodeClass(
            editorContext,
            section.id,
            "media",
          )}`}
        >
          {embed?.kind === "video" ? (
            <video
              src={embed.src}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full bg-black object-contain"
            />
          ) : embed?.kind === "iframe" ? (
            <iframe
              src={embed.src}
              title={title}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className={
                embed.provider === "spotify"
                  ? "h-[352px] w-full border-0"
                  : "aspect-video w-full border-0"
              }
            />
          ) : (
            <div className="flex aspect-video items-center justify-center px-6 text-center">
              <div>
                <p className="text-[11px] font-medium text-[var(--site-text-muted)]">
                  Add an embed URL
                </p>
                <p className="mt-2 text-[9px] leading-4 text-[var(--site-text-faint)]">
                  YouTube, Vimeo, Spotify,
                  MP4, WebM, OGG, or OGV
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StandaloneMediaSection({
  section,
  editorContext,
}: {
  section: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const mediaUrl =
    readContentString(
      section,
      "mediaUrl",
    );

  const mediaAlt =
    readContentString(
      section,
      "mediaAlt",
    );

  const media =
    sectionMediaSettings(
      section,
    );

  if (
    !mediaUrl &&
    !editorContext.editorPreview
  ) {
    return null;
  }

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview
          ? section.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section.id,
        )
      }
      style={
        sectionShellOuterStyle(
          section,
        )
      }
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(
        editorContext,
        section.id,
      )}`}
    >
      <div
        style={
          sectionShellContainerStyle(
            section,
          )
        }
        className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          data-creator-editor-node={
            editorContext.editorPreview
              ? "media"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "media",
            )
          }
          className={`relative overflow-hidden ${mediaFrameClass(
            media.frame,
          )} ${editorNodeClass(
            editorContext,
            section.id,
            "media",
          )}`}
          style={{
            minHeight:
              `${media.height}px`,
            borderRadius:
              `${media.radius}px`,
          }}
        >
          {mediaUrl ? (
            <img
              src={mediaUrl}
              alt={mediaAlt}
              className="absolute inset-0 h-full w-full"
              style={{
                objectFit:
                  media.fit,
                objectPosition:
                  `${media.positionX}% ${media.positionY}%`,
                transform:
                  `scale(${media.zoom / 100})`,
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--site-surface-strong)] text-[10px] uppercase tracking-[0.18em] text-[var(--site-text-subtle)]">
              Upload media
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SimpleManualSection({
  section,
  editorContext,
}: {
  section: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const heading = readContentString(section, "heading", section.label);
  const body = readContentString(section, "body");
  const variant = sectionVariant(section, "standard");
  const narrow = variant === "narrow";
  const split = variant === "split";

  const textDefaults:
    SectionTextDefaults = {
      headingSize: 48,
      headingWidth: 760,
      bodySize: 14,
      bodyWidth: 620,
      textGap: 18,
    };

  return (
    <section
      data-creator-editor-section={editorContext.editorPreview ? section.id : undefined}
      onClick={(event) => handleEditorSectionClick(event, editorContext, section.id)}
      style={sectionShellOuterStyle(section)}
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(editorContext, section.id)}`}
    >
      <div
        style={sectionShellContainerStyle(
          section,
        )}
        className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          className={`${
            split
              ? "grid gap-5 md:grid-cols-[0.8fr_1.2fr]"
              : `${narrow ? "mx-auto max-w-[520px] text-center" : sectionWidthClass(section)} ${sectionAlignmentClass(section)}`
          }`}
        >
          <h2
            style={sectionHeadingTextStyle(
              section,
              textDefaults,
            )}
            className={`leading-[0.96] tracking-[-0.05em] text-[var(--site-text)] ${
              split ? "text-[36px]" : "text-[28px]"
            }`}
          >
            {heading}
          </h2>
          {body ? (
            <p
              style={{
                ...sectionBodyTextStyle(
                  section,
                  textDefaults,
                ),
                marginTop:
                  `${sectionTextGap(
                    section,
                    textDefaults,
                  )}px`,
              }}
              className={`leading-[1.7] text-[var(--site-text-muted)] ${
                split ? "mt-1 max-w-[620px]" : "mt-3"
              }`}
            >
              {body}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function GallerySection({
  section,
  editorPreview,
  editorContext,
}: {
  section: SiteSection;
  editorPreview: boolean;
  editorContext: EditorSelectionContext;
}) {
  const heading =
    readContentString(
      section,
      "heading",
      section.label,
    );

  const items =
    readGalleryItems(
      section,
    );

  const columns =
    section.layout?.columns ??
    3;

  const gap =
    section.layout?.gap ??
    28;

  const frame =
    sectionItemFrame(
      section,
    );

  const radius =
    sectionItemRadius(
      section,
      12,
    );

  const mediaFit =
    sectionItemMediaFit(
      section,
    );

  const mediaRatio =
    sectionItemMediaRatio(
      section,
      "auto",
    );

  const textDefaults:
    SectionTextDefaults = {
      headingSize: 48,
      headingWidth: 900,
      bodySize: 14,
      bodyWidth: 620,
      textGap: 18,
    };

  if (
    items.length === 0 &&
    !editorPreview
  ) {
    return null;
  }

  const gridColumns =
    columns === 4
      ? "lg:grid-cols-4"
      : columns === 2
        ? "lg:grid-cols-2"
        : "lg:grid-cols-3";

  const fixedRatio =
    mediaRatio !== "auto";

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview
          ? section.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section.id,
        )
      }
      style={
        sectionShellOuterStyle(
          section,
        )
      }
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(
        editorContext,
        section.id,
      )}`}
    >
      <div
        style={
          sectionShellContainerStyle(
            section,
          )
        }
        className={`mx-auto w-full max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          data-creator-editor-node={
            editorContext.editorPreview
              ? "text"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "text",
            )
          }
          className={`mb-8 md:mb-10 ${editorNodeClass(
            editorContext,
            section.id,
            "text",
          )}`}
        >
          <InlineEditableText
            as="h2"
            value={heading}
            field="heading"
            sectionId={section.id}
            node="text"
            editorContext={editorContext}
            style={
              sectionHeadingTextStyle(
                section,
                textDefaults,
              )
            }
            className="leading-[0.96] tracking-[-0.05em] text-[var(--site-text)]"
          />
        </div>

        <div
          data-creator-editor-node={
            editorContext.editorPreview
              ? "media"
              : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "media",
            )
          }
          className={
            editorNodeClass(
              editorContext,
              section.id,
              "media",
            )
          }
        >
          {items.length > 0 ? (
            <div
              className={`grid sm:grid-cols-2 ${gridColumns}`}
              style={{
                gap: `${gap}px`,
              }}
            >
              {items.map(
                (item) => (
                  <div
                    key={item.id}
                    className={`relative overflow-hidden ${itemFrameClass(
                      frame,
                    )} ${
                      fixedRatio ||
                      mediaFit ===
                        "contain"
                        ? "bg-[var(--site-surface-strong)]"
                        : ""
                    }`}
                    style={{
                      borderRadius:
                        `${radius}px`,
                      aspectRatio:
                        fixedRatio
                          ? mediaAspectRatio(
                              mediaRatio,
                            )
                          : undefined,
                    }}
                  >
                    <img
                      src={item.url}
                      alt={item.alt}
                      className={
                        fixedRatio
                          ? "absolute inset-0 h-full w-full"
                          : "block h-auto w-full"
                      }
                      style={
                        fixedRatio
                          ? {
                              objectFit:
                                mediaFit,
                              objectPosition:
                                "50% 50%",
                            }
                          : undefined
                      }
                    />
                  </div>
                ),
              )}
            </div>
          ) : (
            <div
              className="flex min-h-[180px] items-center justify-center border border-dashed border-[var(--site-border-strong)] text-[10px] uppercase tracking-[0.16em] text-[var(--site-text-subtle)]"
              style={{
                borderRadius:
                  `${radius}px`,
              }}
            >
              Add gallery images
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CtaSection({
  siteHandle,
  siteDocument,
  section,
  editorContext,
}: {
  siteHandle: string;
  siteDocument?: SiteDocument;
  section: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const heading = readContentString(section, "heading", section.label);
  const body = readContentString(section, "body");
  const label = readContentString(section, "buttonLabel", "Get started");
  const href = readContentString(section, "buttonHref", "#contact");
  const pageId = readContentString(section, "buttonPageId");
  const resolvedHref = resolveSiteLinkHref(
    siteDocument,
    siteHandle,
    {
      href,
      pageId: pageId || undefined,
    },
  );
  const variant = sectionVariant(section, "banner");
  const centered = variant === "centered";
  const minimal = variant === "minimal";

  const textDefaults:
    SectionTextDefaults = {
      headingSize: 40,
      headingWidth: 760,
      bodySize: 14,
      bodyWidth: 620,
      textGap: 14,
    };

  return (
    <section
      data-creator-editor-section={editorContext.editorPreview ? section.id : undefined}
      onClick={(event) => handleEditorSectionClick(event, editorContext, section.id)}
      style={sectionShellOuterStyle(section)}
      className={`${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(editorContext, section.id)}`}
    >
      <div
        style={sectionShellContainerStyle(
          section,
        )}
        className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          className={`${
            centered
              ? "mx-auto max-w-[680px] text-center"
              : minimal
              ? "flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
              : "grid gap-5 md:grid-cols-[1fr_auto] md:items-center"
          }`}
        >
          <div
            data-creator-editor-node={editorContext.editorPreview ? "text" : undefined}
            onClick={(event) =>
              handleEditorNodeClick(event, editorContext, section.id, "text")
            }
            className={`${minimal ? "max-w-[720px]" : ""} ${editorNodeClass(
              editorContext,
              section.id,
              "text",
            )}`}
          >
            <InlineEditableText
              as="h2"
              value={heading}
              field="heading"
              sectionId={section.id}
              node="text"
              editorContext={editorContext}
              style={sectionHeadingTextStyle(
                section,
                textDefaults,
              )}
              className={`leading-[0.98] tracking-[-0.055em] text-[var(--site-text)] ${
                minimal ? "text-[22px]" : "text-[32px]"
              }`}
            />
            {body ? (
              <InlineEditableText
                as="p"
                value={body}
                field="body"
                sectionId={section.id}
                node="text"
                editorContext={editorContext}
                multiline
                style={{
                  ...sectionBodyTextStyle(
                    section,
                    textDefaults,
                  ),
                  marginTop:
                    `${sectionTextGap(
                      section,
                      textDefaults,
                    )}px`,
                }}
                className="leading-[1.7] text-[var(--site-text-muted)]"
              />
            ) : null}
          </div>
          <a
            href={resolvedHref}
            data-creator-editor-node={editorContext.editorPreview ? "button" : undefined}
            onClick={(event) =>
              handleEditorNodeClick(event, editorContext, section.id, "button")
            }
            className={`mt-5 inline-flex h-8 w-fit items-center gap-4 rounded-full border border-[var(--site-border-strong)] px-4 text-[7px] uppercase tracking-[0.2em] text-[var(--site-accent)] transition hover:border-white/35 ${
              centered ? "mx-auto" : minimal ? "mt-0 shrink-0" : "mt-0 shrink-0"
            } ${editorNodeClass(editorContext, section.id, "button")}`}
          >
            <InlineEditableText
              value={label}
              field="buttonLabel"
              sectionId={section.id}
              node="button"
              editorContext={editorContext}
            />
            <span>→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function ContactSection({
  siteHandle,
  siteDocument,
  section,
  editorContext,
}: {
  siteHandle: string;
  siteDocument?: SiteDocument;
  section?: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [submitError, setSubmitError] =
    useState<string | null>(null);

  const heading = readContentString(
    section,
    "heading",
    "Let’s build something useful.",
  );
  const body = readContentString(
    section,
    "body",
    "Open to creative opportunities, collaborations, and interesting projects.",
  );

  const formEnabled =
    section?.content.formEnabled === true;

  const label = readContentString(
    section,
    "buttonLabel",
    formEnabled
      ? "Send message"
      : "Get in touch",
  );

  const href = readContentString(
    section,
    "buttonHref",
    "#contact",
  );
  const pageId = readContentString(
    section,
    "buttonPageId",
  );

  const resolvedHref = resolveSiteLinkHref(
    siteDocument,
    siteHandle,
    {
      href,
      pageId: pageId || undefined,
    },
  );

  const nameLabel =
    readContentString(
      section,
      "nameLabel",
      "Name",
    ) || "Name";

  const emailLabel =
    readContentString(
      section,
      "emailLabel",
      "Email",
    ) || "Email";

  const messageLabel =
    readContentString(
      section,
      "messageLabel",
      "Message",
    ) || "Message";

  const successMessage =
    readContentString(
      section,
      "successMessage",
      "Thanks — your message was sent.",
    ) || "Thanks — your message was sent.";

  const centered =
    sectionVariant(
      section,
      "standard",
    ) === "centered";

  const contactTextDefaults:
    SectionTextDefaults = {
      headingSize:
        formEnabled
          ? 52
          : 32,
      headingWidth: 720,
      bodySize: 14,
      bodyWidth: 560,
      textGap: 16,
    };

  async function submitInquiry(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      editorContext.editorPreview ||
      !section?.id ||
      !formEnabled ||
      submitState === "submitting"
    ) {
      return;
    }

    const formData = new FormData(
      event.currentTarget,
    );

    const company =
      formData.get("company");

    setSubmitState("submitting");
    setSubmitError(null);

    try {
      const response = await fetch(
        `/api/site-builder/public/${encodeURIComponent(
          siteHandle,
        )}/inquiries`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            sectionId: section.id,
            name: senderName,
            email: senderEmail,
            message,
            company:
              typeof company === "string"
                ? company
                : "",
          }),
        },
      );

      const payload = (await response
        .json()
        .catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Unable to send message.",
        );
      }

      setSubmitState("success");
      setSenderName("");
      setSenderEmail("");
      setMessage("");
    } catch (error) {
      setSubmitState("error");
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to send message.",
      );
    }
  }

  if (!formEnabled) {
    return (
      <section
        id="contact"
        data-creator-editor-section={
          editorContext.editorPreview
            ? section?.id
            : undefined
        }
        onClick={(event) =>
          handleEditorSectionClick(
            event,
            editorContext,
            section?.id,
          )
        }
        style={sectionShellOuterStyle(
          section,
        )}
        className={editorSectionClass(
          editorContext,
          section?.id,
        )}
      >
        <div
          style={sectionShellContainerStyle(
            section,
          )}
          className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
            section,
          )}`}
        >
          <div
            className={`grid items-center border-b border-[var(--site-border)] ${
              centered
                ? "text-center"
                : "lg:grid-cols-[1fr_auto]"
            }`}
            style={{
              gap:
                `${section?.layout?.gap ?? 24}px`,
            }}
          >

            <div
              data-creator-editor-node={
                editorContext.editorPreview
                  ? "text"
                  : undefined
              }
              onClick={(event) =>
                handleEditorNodeClick(
                  event,
                  editorContext,
                  section?.id,
                  "text",
                )
              }
              className={`${
                centered
                  ? "mx-auto max-w-[620px]"
                  : "flex items-baseline gap-7"
              } ${editorNodeClass(
                editorContext,
                section?.id,
                "text",
              )}`}
            >
              <InlineEditableText
                as="h2"
                value={heading}
                field="heading"
                sectionId={section?.id}
                node="text"
                editorContext={editorContext}
                style={sectionHeadingTextStyle(
                  section,
                  contactTextDefaults,
                )}
                className="leading-[0.98] tracking-[-0.03em] text-[var(--site-text)]"
              />

              <InlineEditableText
                as="p"
                value={body}
                field="body"
                sectionId={section?.id}
                node="text"
                editorContext={editorContext}
                multiline
                style={{
                  ...sectionBodyTextStyle(
                    section,
                    contactTextDefaults,
                  ),
                  marginTop:
                    `${sectionTextGap(
                      section,
                      contactTextDefaults,
                    )}px`,
                }}
                className={`leading-[1.65] text-[var(--site-text-subtle)] ${
                  centered
                    ? "mx-auto"
                    : "hidden xl:block"
                }`}
              />
            </div>

            <a
              href={resolvedHref}
              data-creator-editor-node={
                editorContext.editorPreview
                  ? "button"
                  : undefined
              }
              onClick={(event) =>
                handleEditorNodeClick(
                  event,
                  editorContext,
                  section?.id,
                  "button",
                )
              }
              className={`inline-flex h-7 w-fit items-center gap-4 rounded-[var(--site-radius)] border border-[var(--site-border)] px-4 text-[7px] uppercase tracking-[0.17em] text-[var(--site-accent)] ${
                centered ? "mx-auto" : ""
              } ${editorNodeClass(
                editorContext,
                section?.id,
                "button",
              )}`}
            >
              <InlineEditableText
                value={label}
                field="buttonLabel"
                sectionId={section?.id}
                node="button"
                editorContext={editorContext}
              />
              <span>→</span>
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="contact"
      data-creator-editor-section={
        editorContext.editorPreview
          ? section?.id
          : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(
          event,
          editorContext,
          section?.id,
        )
      }
      style={sectionShellOuterStyle(
        section,
      )}
      className={editorSectionClass(
        editorContext,
        section?.id,
      )}
    >
      <div
        style={sectionShellContainerStyle(
          section,
        )}
        className={`mx-auto max-w-[var(--site-page-width)] px-[var(--site-page-x)] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          style={{
            gap:
              `${section?.layout?.gap ?? 48}px`,
          }}
          className={`grid ${
            centered
              ? "mx-auto max-w-[760px]"
              : "lg:grid-cols-[0.85fr_1.15fr] lg:gap-14"
          }`}
        >
          <div
            data-creator-editor-node={
              editorContext.editorPreview
                ? "text"
                : undefined
            }
            onClick={(event) =>
              handleEditorNodeClick(
                event,
                editorContext,
                section?.id,
                "text",
              )
            }
            className={`${centered ? "text-center" : ""} ${editorNodeClass(
              editorContext,
              section?.id,
              "text",
            )}`}
          >
            <InlineEditableText
              as="h2"
              value={heading}
              field="heading"
              sectionId={section?.id}
              node="text"
              editorContext={editorContext}
              style={sectionHeadingTextStyle(
                section,
                contactTextDefaults,
              )}
              className="leading-[0.95] tracking-[-0.055em] text-[var(--site-text)]"
            />

            {body ? (
              <InlineEditableText
                as="p"
                value={body}
                field="body"
                sectionId={section?.id}
                node="text"
                editorContext={editorContext}
                multiline
                style={{
                  ...sectionBodyTextStyle(
                    section,
                    contactTextDefaults,
                  ),
                  marginTop:
                    `${sectionTextGap(
                      section,
                      contactTextDefaults,
                    )}px`,
                }}
                className={`leading-[1.75] text-[var(--site-text-subtle)] ${
                  centered
                    ? "mx-auto"
                    : ""
                }`}
              />
            ) : null}
          </div>

          <form
            onSubmit={submitInquiry}
            className="relative space-y-4 rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5 sm:p-6"
          >
            <div
              className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
              aria-hidden="true"
            >
              <label>
                Company
                <input
                  type="text"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--site-text-subtle)]">
                {nameLabel}
              </span>
              <input
                name="name"
                type="text"
                required
                maxLength={120}
                autoComplete="name"
                readOnly={
                  editorContext.editorPreview
                }
                value={senderName}
                onChange={(event) =>
                  setSenderName(
                    event.target.value,
                  )
                }
                className="mt-2 h-10 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-bg)] px-3 text-[12px] text-[var(--site-text)] outline-none placeholder:text-[var(--site-text-faint)] focus:border-white/25"
              />
            </label>

            <label className="block">
              <span className="text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--site-text-subtle)]">
                {emailLabel}
              </span>
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                readOnly={
                  editorContext.editorPreview
                }
                value={senderEmail}
                onChange={(event) =>
                  setSenderEmail(
                    event.target.value,
                  )
                }
                className="mt-2 h-10 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-bg)] px-3 text-[12px] text-[var(--site-text)] outline-none placeholder:text-[var(--site-text-faint)] focus:border-white/25"
              />
            </label>

            <label className="block">
              <span className="text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--site-text-subtle)]">
                {messageLabel}
              </span>
              <textarea
                name="message"
                required
                maxLength={5000}
                rows={6}
                readOnly={
                  editorContext.editorPreview
                }
                value={message}
                onChange={(event) =>
                  setMessage(
                    event.target.value,
                  )
                }
                className="mt-2 w-full resize-y rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-bg)] px-3 py-3 text-[12px] leading-5 text-[var(--site-text)] outline-none placeholder:text-[var(--site-text-faint)] focus:border-white/25"
              />
            </label>

            <button
              type="submit"
              disabled={
                submitState === "submitting"
              }
              data-creator-editor-node={
                editorContext.editorPreview
                  ? "button"
                  : undefined
              }
              onClick={(event) => {
                if (
                  editorContext.editorPreview
                ) {
                  handleEditorNodeClick(
                    event,
                    editorContext,
                    section?.id,
                    "button",
                  );
                }
              }}
              className={`inline-flex h-10 items-center gap-4 rounded-[var(--site-radius)] border border-[var(--site-border)] px-4 text-[8px] font-medium uppercase tracking-[0.18em] text-[var(--site-accent)] transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50 ${editorNodeClass(
                editorContext,
                section?.id,
                "button",
              )}`}
            >
              {submitState === "submitting" ? (
                <span>Sending…</span>
              ) : (
                <InlineEditableText
                  value={label}
                  field="buttonLabel"
                  sectionId={section?.id}
                  node="button"
                  editorContext={editorContext}
                />
              )}
              <span>→</span>
            </button>

            {submitState === "success" ? (
              <p className="text-[11px] leading-5 text-[var(--site-accent)]">
                {successMessage}
              </p>
            ) : null}

            {submitState === "error" ? (
              <p className="text-[11px] leading-5 text-red-200/80">
                {submitError ??
                  "Unable to send message."}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}

function MackHomeSections({
  site,
  siteDocument,
  sections,
  sourceListings,
  editorPreview,
  editorContext,
}: {
  site: PortfolioSiteData;
  siteDocument?: SiteDocument;
  sections: SiteSection[];
  sourceListings: SourceListing[];
  editorPreview: boolean;
  editorContext: EditorSelectionContext;
}) {
  const visibleSections = sections.filter((section) => section.visible);
  const nodes: ReactNode[] = [];

  for (let index = 0; index < visibleSections.length; index += 1) {
    const section = visibleSections[index];
    const kind = section.type;

    const originalIndex =
      sections.findIndex(
        (candidate) =>
          candidate.id ===
          section.id,
      );

    nodes.push(
      <EditorSectionInsertControl
        key={`insert-before-${section.id}`}
        editorContext={
          editorContext
        }
        insertionIndex={
          originalIndex < 0
            ? index
            : originalIndex
        }
      />,
    );

    if (kind === "hero") {
      nodes.push(
        <HeroSection
          key={section.id}
          site={site}
          siteDocument={siteDocument}
          section={section}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "products") {
      nodes.push(
        <ProductsSection
          key={section.id}
          siteDocument={siteDocument}
          section={section}
          listings={sourceListings}
          editorPreview={editorPreview}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "services") {
      nodes.push(
        <ProductsSection
          key={section.id}
          siteDocument={siteDocument}
          section={section}
          listings={sourceListings}
          editorPreview={editorPreview}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "split") {
      nodes.push(
        <SplitSection
          key={section.id}
          siteHandle={site.handle}
          siteDocument={siteDocument}
          section={section}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "stats") {
      nodes.push(
        <StatsSection
          key={section.id}
          section={section}
          editorPreview={editorPreview}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "cards") {
      nodes.push(
        <CardsSection
          key={section.id}
          siteHandle={site.handle}
          siteDocument={siteDocument}
          section={section}
          editorPreview={editorPreview}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "faq") {
      nodes.push(
        <FaqSection
          key={section.id}
          section={section}
          editorPreview={editorPreview}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "testimonials") {
      nodes.push(
        <TestimonialsSection
          key={section.id}
          section={section}
          editorPreview={editorPreview}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "gallery") {
      nodes.push(
        <GallerySection
          key={section.id}
          section={section}
          editorPreview={editorPreview}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "cta") {
      nodes.push(
        <CtaSection
          key={section.id}
          siteHandle={site.handle}
          siteDocument={siteDocument}
          section={section}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "contact") {
      nodes.push(
        <ContactSection
          key={section.id}
          siteHandle={site.handle}
          siteDocument={siteDocument}
          section={section}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "embed") {
      nodes.push(
        <EmbedSection
          key={section.id}
          section={section}
          editorPreview={editorPreview}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "media") {
      nodes.push(
        <StandaloneMediaSection
          key={section.id}
          section={section}
          editorContext={editorContext}
        />,
      );
    } else {
      nodes.push(
        <SimpleManualSection
          key={section.id}
          section={section}
          editorContext={editorContext}
        />,
      );
    }
  }

  nodes.push(
    <EditorSectionInsertControl
      key="insert-at-end"
      editorContext={
        editorContext
      }
      insertionIndex={
        sections.length
      }
    />,
  );

  return <>{nodes}</>;
}

export default function PortfolioSite({
  site,
  siteDocument,
  sections,
  sourceListings = [],
  editorPreview = false,
  editorPageId = "",
  editorSelection = null,
  onEditorSelectionRequest,
  onEditorContentEditRequest,
  onEditorSectionInsertRequest,
}: PortfolioSiteProps) {
  const renderSections = (sections ?? defaultMackSections) as SiteSection[];
  const headerConfig = getSiteHeaderConfig({
    name: site.name,
    header: siteDocument?.header,
  });
  const footerConfig = getSiteFooterConfig({
    name: site.name,
    footer: siteDocument?.footer,
  });
  const themeConfig = getSiteThemeConfig({
    theme: siteDocument?.theme,
  });
  const themeStyle = getSiteThemeStyle(themeConfig);
  const visibleNavigation = headerConfig.navigation.filter(
    (item) => item.visible,
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const editorContext: EditorSelectionContext = {
    editorPreview,
    pageId: editorPageId,
    activeSelection: editorSelection,
    onSelectionRequest:
      onEditorSelectionRequest,
    onContentEditRequest:
      onEditorContentEditRequest,
    onSectionInsertRequest:
      onEditorSectionInsertRequest,
  };

  return (
    <div
      data-site-theme-root
      style={themeStyle}
      className="min-h-screen bg-[var(--site-bg)] text-[var(--site-text)]"
    >
      <header className="sticky top-0 z-50 border-b border-[var(--site-border)] bg-[var(--site-bg)] backdrop-blur-xl">
        <div className="mx-auto flex h-[48px] max-w-[var(--site-page-width)] items-center justify-between px-[var(--site-page-x)]">
          <Link
            href={`/portfolio/${site.handle}`}
            className="text-[10px] font-semibold tracking-[0.43em]"
            style={{ color: "var(--site-accent)" }}
          >
            {headerConfig.brandLabel}
          </Link>

          <div className="flex items-center gap-6">
            <nav className="hidden items-center gap-9 text-[9px] text-[var(--site-text-muted)] md:flex">
              {visibleNavigation.map((item) => (
                <a
                  key={item.id}
                  href={resolveSiteNavigationHref(
                    siteDocument,
                    site.handle,
                    item,
                  )}
                  className="transition hover:text-[var(--site-text)]"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            {headerConfig.tagline ? (
              <p className="hidden text-[8px] text-[var(--site-text-subtle)] xl:block">
                • &nbsp; {headerConfig.tagline}
              </p>
            ) : null}

            {visibleNavigation.length > 0 ? (
              <button
                type="button"
                aria-expanded={mobileNavOpen}
                aria-controls="site-mobile-navigation"
                onClick={() =>
                  setMobileNavOpen((current) => !current)
                }
                className="text-[8px] font-medium uppercase tracking-[0.18em] text-[var(--site-text-muted)] transition hover:text-[var(--site-text)] md:hidden"
              >
                {mobileNavOpen ? "Close" : "Menu"}
              </button>
            ) : null}
          </div>
        </div>

        {mobileNavOpen && visibleNavigation.length > 0 ? (
          <nav
            id="site-mobile-navigation"
            className="border-t border-[var(--site-border)] md:hidden"
          >
            <div className="mx-auto max-w-[var(--site-page-width)] px-5 py-3 sm:px-8">
              {visibleNavigation.map((item) => (
                <a
                  key={item.id}
                  href={resolveSiteNavigationHref(
                    siteDocument,
                    site.handle,
                    item,
                  )}
                  onClick={(event) => {
                    if (editorPreview) {
                      event.preventDefault();
                    }

                    setMobileNavOpen(false);
                  }}
                  className="flex min-h-10 items-center border-b border-[var(--site-border)] text-[11px] text-[var(--site-text-muted)] transition last:border-b-0 hover:text-[var(--site-text)]"
                >
                  {item.label}
                </a>
              ))}

              {headerConfig.tagline ? (
                <p className="pt-3 text-[8px] leading-4 text-[var(--site-text-subtle)]">
                  {headerConfig.tagline}
                </p>
              ) : null}
            </div>
          </nav>
        ) : null}
      </header>

      <main id="work">
        <MackHomeSections
          site={site}
          siteDocument={siteDocument}
          sections={renderSections}
          sourceListings={sourceListings}
          editorPreview={editorPreview}
          editorContext={editorContext}
        />
      </main>

      <footer className="border-t border-[var(--site-border)]">
        <div className="mx-auto flex min-h-[42px] max-w-[var(--site-page-width)] items-center justify-between gap-4 px-[var(--site-page-x)]">
          <p
            className="text-[8px] font-semibold tracking-[0.42em]"
            style={{ color: "var(--site-accent)" }}
          >
            {footerConfig.brandLabel}
          </p>

          {footerConfig.tagline ? (
            <p className="text-right text-[6px] uppercase tracking-[0.33em] text-[var(--site-text-faint)]">
              {footerConfig.tagline}
            </p>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
