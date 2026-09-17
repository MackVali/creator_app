"use client";

/* eslint-disable @next/next/no-img-element -- Source listing images can be user-provided remote URLs. */

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { resolveListingImage } from "@/components/profile/detailSheetUtils";
import PortfolioVisual from "@/components/portfolio/PortfolioVisual";
import { normalizeSourceListingCardProps } from "@/components/source/SourceListingCard";
import type {
  PortfolioProject,
  PortfolioSiteData,
} from "@/lib/portfolio/types";
import type { SitePreviewInlineEditField } from "@/lib/site-builder/previewMessages";
import {
  getSiteFooterConfig,
  getSiteHeaderConfig,
} from "@/lib/site-builder/siteChrome";
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
  }) => void;
  onEditorContentEditRequest?: (edit: {
    pageId: string;
    sectionId: string;
    field: SitePreviewInlineEditField;
    value: string;
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
  }) => void;
  onContentEditRequest?: (edit: {
    pageId: string;
    sectionId: string;
    field: SitePreviewInlineEditField;
    value: string;
  }) => void;
};

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

const creatorLogo = "/images/creator-logo.png";
const scheduleImage =
  "/images/portfolio/mackvali/software/creator-schedule-desktop.png";
const commandMobile =
  "/images/portfolio/mackvali/software/creator-mobile-command.webp";
const ironPrairieImage =
  "/images/portfolio/mackvali/software/iron-prairie-site.webp";
const heroCover = "/images/portfolio/mackvali/hero-devices.png";

function PillLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 w-fit items-center gap-4 rounded-full border border-white/[0.18] px-4 text-[8px] font-medium uppercase tracking-[0.18em] text-[var(--site-accent)] transition hover:border-white/35"
    >
      {children}
      <span className="text-xs">→</span>
    </Link>
  );
}

function SectionRule({
  number,
  label,
}: {
  number: string;
  label: string;
}) {
  return (
    <div className="flex h-[30px] items-center gap-4">
      <span className="text-[8px] text-white/25">{number}</span>
      <span
        className="text-[8px] font-medium uppercase tracking-[0.3em]"
        style={{ color: "var(--site-accent)" }}
      >
        {label}
      </span>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

function HeroStage({
  section,
  editorContext,
}: {
  section?: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const mediaUrl = readContentString(section, "mediaUrl", heroCover);
  const mediaAlt = readContentString(section, "mediaAlt");
  const mediaFit =
    readContentString(section, "mediaFit") === "cover" ? "cover" : "contain";

  return (
    <div
      data-creator-editor-node={
        editorContext.editorPreview ? "media" : undefined
      }
      onClick={(event) =>
        handleEditorNodeClick(event, editorContext, section?.id, "media")
      }
      className={`absolute inset-0 hidden overflow-hidden bg-[var(--site-surface-strong)] lg:block ${editorNodeClass(
        editorContext,
        section?.id,
        "media",
      )}`}
    >
      <div className="absolute inset-y-0 left-[31%] right-[2%]">
        <img
          src={mediaUrl}
          alt={mediaAlt}
          className={`h-full w-full object-right ${
            mediaFit === "cover" ? "object-cover" : "object-contain"
          }`}
        />
      </div>
    </div>
  );
}

function CreatorCard({
  project,
  handle,
}: {
  project: PortfolioProject;
  handle: string;
}) {
  return (
    <article className="grid overflow-hidden lg:h-[165px] lg:grid-cols-[43%_57%]">
      <div className="flex min-w-0 flex-col justify-between px-5 py-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="relative h-[44px] w-[44px] shrink-0 overflow-hidden rounded-[var(--site-radius)] border border-white/[0.1] bg-white/[0.018]">
              <Image
                src={creatorLogo}
                alt=""
                fill
                sizes="44px"
                className="object-contain p-2"
              />
            </div>

            <div className="min-w-0">
              <h3 className="text-[18px] tracking-[-0.035em] text-white/92">
                CREATOR
              </h3>
              <p className="text-[10px] text-white/52">
                Plan. Create. Execute. Grow.
              </p>
            </div>
          </div>

          <p className="mt-3 max-w-[330px] text-[8.5px] leading-[1.55] text-white/40">
            A focused system for planning, scheduling, goals, health, money,
            focus, creativity, and everyday execution — all in one place.
          </p>
        </div>

        <PillLink href={`/portfolio/${handle}/work/${project.slug}`}>
          View project
        </PillLink>
      </div>

      <div className="grid min-w-0 grid-cols-[1fr_62px] items-center gap-3 px-3 py-3">
        <div className="relative h-full min-h-[126px] overflow-hidden border border-white/[0.08] bg-[var(--site-surface-strong)]">
          <Image
            src={scheduleImage}
            alt="CREATOR schedule"
            fill
            sizes="27vw"
            className="object-cover"
          />
        </div>

        <div className="space-y-[2px] text-[8px] leading-[1.35] text-white/34">
          <p>Ideas</p>
          <p>Plan</p>
          <p>Schedule</p>
          <p>Create</p>
          <p>Analyze</p>
          <p>Grow</p>
        </div>
      </div>
    </article>
  );
}

function IronPrairieCard({
  project,
  handle,
}: {
  project: PortfolioProject;
  handle: string;
}) {
  return (
    <article className="grid overflow-hidden lg:h-[165px] lg:grid-cols-[44%_56%]">
      <div className="flex min-w-0 flex-col justify-between px-5 py-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--site-radius)] bg-[#f0c400] text-[9px] font-black text-black">
              IPL
            </div>

            <div className="min-w-0">
              <h3 className="text-[18px] tracking-[-0.035em] text-white/92">
                Iron Prairie Logistics
              </h3>
              <p className="text-[10px] text-white/52">
                Real work. Real results.
              </p>
            </div>
          </div>

          <p className="mt-3 max-w-[330px] text-[8.5px] leading-[1.55] text-white/40">
            A customer-facing service website and internal operations software
            built around a real local moving, hauling, and handyman business.
          </p>
        </div>

        <PillLink href={`/portfolio/${handle}/work/${project.slug}`}>
          View project
        </PillLink>
      </div>

      <div className="relative m-3 ml-0 min-h-[126px] overflow-hidden border border-white/[0.08] bg-[var(--site-surface-strong)]">
        <Image
          src={ironPrairieImage}
          alt="Iron Prairie Logistics website"
          fill
          sizes="28vw"
          className="object-cover object-center"
        />
      </div>
    </article>
  );
}

function ClothingCard({
  project,
  handle,
}: {
  project: PortfolioProject;
  handle: string;
}) {
  const body = (
    <div className="grid h-full grid-cols-[41%_59%]">
      <div className="flex min-w-0 flex-col justify-between p-4">
        <div>
          <h3 className="text-[18px] font-medium tracking-[-0.04em] text-white/92">
            {project.title}
          </h3>

          <p className="mt-3 max-w-[150px] text-[8.5px] leading-[1.55] text-white/40">
            {project.description}
          </p>
        </div>

        <span className="inline-flex h-7 w-fit items-center gap-3 rounded-full border border-white/[0.15] px-3 text-[7px] uppercase tracking-[0.14em] text-white/62">
          View {project.title}
          <span>→</span>
        </span>
      </div>

      <PortfolioVisual
        kind={project.visual}
        className="h-full min-h-0 border-0 border-l border-white/[0.07]"
      />
    </div>
  );

  if (!project.detail) {
    return <article className="h-full">{body}</article>;
  }

  return (
    <Link
      href={`/portfolio/${handle}/work/${project.slug}`}
      className="block h-full transition hover:bg-white/[0.012]"
    >
      {body}
    </Link>
  );
}

type MackSectionKind =
  | "hero"
  | "software"
  | "clothing"
  | "visual"
  | "studio"
  | "contact"
  | "products"
  | "content"
  | "services"
  | "gallery"
  | "media"
  | "cta";

const defaultMackSections: Array<Pick<SiteSection, "id" | "label" | "type" | "visible" | "source" | "content">> =
  [
    {
      id: "home-hero",
      label: "Hero",
      type: "hero",
      visible: true,
      source: { kind: "manual" },
      content: {},
    },
    {
      id: "home-software",
      label: "Software",
      type: "projects",
      visible: true,
      source: { kind: "manual" },
      content: { templateKind: "software" },
    },
    {
      id: "home-clothing",
      label: "Clothing",
      type: "projects",
      visible: true,
      source: { kind: "manual" },
      content: { templateKind: "clothing" },
    },
    {
      id: "home-visual",
      label: "Visual",
      type: "gallery",
      visible: true,
      source: { kind: "manual" },
      content: { templateKind: "visual" },
    },
    {
      id: "home-studio",
      label: "Studio",
      type: "media",
      visible: true,
      source: { kind: "manual" },
      content: { templateKind: "studio" },
    },
    {
      id: "home-contact",
      label: "Contact",
      type: "contact",
      visible: true,
      source: { kind: "manual" },
      content: {},
    },
  ];

function getTemplateKind(section: SiteSection): MackSectionKind {
  const templateKind = section.content.templateKind;
  if (
    templateKind === "software" ||
    templateKind === "clothing" ||
    templateKind === "visual" ||
    templateKind === "studio"
  ) {
    return templateKind;
  }

  if (section.type === "hero") return "hero";
  if (section.type === "products") return "products";
  if (section.type === "services") return "services";
  if (section.type === "gallery") return "gallery";
  if (section.type === "media") return "media";
  if (section.type === "cta") return "cta";
  if (section.type === "content") return "content";
  if (section.type === "contact") return "contact";

  return section.label.trim().toLowerCase() === "software"
    ? "software"
    : "content";
}

function isLowerWorkKind(kind: MackSectionKind) {
  return kind === "clothing" || kind === "visual" || kind === "studio";
}

function readContentString(
  section: SiteSection | undefined,
  key: string,
  fallback = "",
) {
  const value = section?.content[key];
  return typeof value === "string" ? value : fallback;
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

function sectionPaddingClass(section: SiteSection | undefined) {
  if (section?.layout?.spacing === "compact") return "py-5";
  if (section?.layout?.spacing === "spacious") return "py-12";
  return "py-[var(--site-section-y)]";
}

function sectionBackgroundClass(section: SiteSection | undefined) {
  if (section?.style?.background === "plain") {
    return "bg-[var(--site-surface)]";
  }

  if (
    section?.style?.background === "dark" ||
    section?.style?.background === "contrast"
  ) {
    return "bg-[var(--site-surface-strong)]";
  }

  if (
    section?.style?.background === "muted" ||
    section?.style?.muted
  ) {
    return "bg-[var(--site-surface-muted)]";
  }

  return "";
}

function sectionVariant(section: SiteSection | undefined, fallback: string) {
  const variant = section?.layout?.variant;
  return typeof variant === "string" && variant.length > 0
    ? variant
    : fallback;
}

function HeroSection({
  site,
  section,
  editorContext,
}: {
  site: PortfolioSiteData;
  section?: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const eyebrow = readContentString(
    section,
    "eyebrow",
    "Design · Build · Create",
  );
  const ctaLabel = readContentString(
    section,
    "primaryCtaLabel",
    "Explore my work",
  );
  const ctaHref = readContentString(section, "primaryCtaHref", "#software");
  const headline = readContentString(section, "headline", site.headline);
  const intro = readContentString(section, "intro", site.intro);
  const variant = sectionVariant(section, "split");
  const centered = variant === "centered";
  const editorial = variant === "editorial";
  const minimal = variant === "minimal";

  return (
    <section
      data-creator-editor-section={editorContext.editorPreview ? section?.id : undefined}
      onClick={(event) => handleEditorSectionClick(event, editorContext, section?.id)}
      className={`relative overflow-hidden border-b border-white/[0.08] ${
        minimal ? "" : "lg:min-h-[410px]"
      } ${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(editorContext, section?.id)}`}
    >
      <div
        className={`relative mx-auto max-w-[var(--site-page-width)] ${
          centered
            ? "px-5 py-12 text-center sm:px-8 lg:px-[58px] lg:py-16"
            : editorial
            ? "grid gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-[58px] lg:py-14"
            : minimal
            ? "px-5 py-8 sm:px-8 lg:px-[58px]"
            : "h-full"
        }`}
      >
        {variant === "split" ? (
          <HeroStage
            section={section}
            editorContext={editorContext}
          />
        ) : null}

        <div
          className={`relative z-10 flex flex-col justify-center ${
            centered
              ? "mx-auto min-h-0 max-w-[840px]"
              : editorial
              ? "min-h-[300px] max-w-[860px]"
              : minimal
              ? "max-w-[760px]"
              : "min-h-[360px] px-5 py-10 sm:px-8 lg:h-[410px] lg:min-h-0 lg:w-[31%] lg:px-[58px] lg:py-0"
          }`}
        >
          <div
            data-creator-editor-node={editorContext.editorPreview ? "text" : undefined}
            onClick={(event) =>
              handleEditorNodeClick(event, editorContext, section?.id, "text")
            }
            className={editorNodeClass(editorContext, section?.id, "text")}
          >
            <InlineEditableText
              as="p"
              value={eyebrow}
              field="eyebrow"
              sectionId={section?.id}
              node="text"
              editorContext={editorContext}
              className="text-[7px] font-medium uppercase tracking-[0.38em] text-white/38"
            />

            <InlineEditableText
              as="h1"
              value={headline}
              field="headline"
              sectionId={section?.id}
              node="text"
              editorContext={editorContext}
              className={`mt-4 whitespace-pre-line leading-[0.93] tracking-[-0.065em] text-white/95 ${
                editorial
                  ? "text-[clamp(3.5rem,7vw,7.5rem)]"
                  : minimal
                  ? "text-[clamp(2.25rem,4vw,4.25rem)]"
                  : "text-[clamp(3rem,3.8vw,4rem)]"
              } ${
                centered ? "mx-auto max-w-[760px] text-center" : ""
              }`}
            />

            <InlineEditableText
              as="p"
              value={intro}
              field="intro"
              sectionId={section?.id}
              node="text"
              editorContext={editorContext}
              multiline
              className={`mt-5 text-[11px] leading-[1.55] text-white/53 ${
                editorial ? "max-w-[560px]" : "max-w-[355px]"
              } ${
                centered ? "mx-auto text-center" : ""
              }`}
            />
          </div>

          <a
            href={ctaHref || "#software"}
            data-creator-editor-node={editorContext.editorPreview ? "button" : undefined}
            onClick={(event) =>
              handleEditorNodeClick(event, editorContext, section?.id, "button")
            }
            className={`mt-5 inline-flex h-8 w-fit items-center gap-4 rounded-full border border-white/[0.18] px-4 text-[7px] uppercase tracking-[0.2em] text-[var(--site-accent)] transition hover:border-white/35 ${
              centered ? "mx-auto" : ""
            } ${editorNodeClass(editorContext, section?.id, "button")}`}
          >
            <InlineEditableText
              value={ctaLabel}
              field="primaryCtaLabel"
              sectionId={section?.id}
              node="button"
              editorContext={editorContext}
            />
            <span>→</span>
          </a>
        </div>

        {minimal ? null : (
        <div
          className={`${
            centered
              ? "mx-auto mt-8 max-w-[880px]"
              : editorial
              ? "self-center"
              : "px-5 pb-7 lg:hidden"
          }`}
        >
          <div className="relative aspect-[16/9] overflow-hidden border border-white/[0.08] bg-[var(--site-surface-strong)]">
            <Image
              src={scheduleImage}
              alt="CREATOR schedule"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>

          <div className="mt-3 grid grid-cols-[0.58fr_1.42fr] gap-3">
            <div className="relative aspect-[568/1220] overflow-hidden border border-white/[0.08] bg-[var(--site-surface-strong)]">
              <Image
                src={commandMobile}
                alt="CREATOR mobile dashboard"
                fill
                sizes="35vw"
                className="object-cover"
              />
            </div>

            <div className="relative min-h-[180px] overflow-hidden border border-white/[0.08] bg-[var(--site-surface-strong)]">
              <Image
                src={ironPrairieImage}
                alt="Iron Prairie Logistics"
                fill
                sizes="65vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
        )}
      </div>
    </section>
  );
}

function SoftwareSection({
  site,
  section,
  editorContext,
}: {
  site: PortfolioSiteData;
  section: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const creator =
    site.software.find((project) => project.slug === "creator") ??
    site.software[0];

  const ironPrairie =
    site.software.find((project) => project.slug === "small-business-sites") ??
    site.software[1];

  return (
    <section
      id="software"
      data-creator-editor-section={editorContext.editorPreview ? section.id : undefined}
      onClick={(event) => handleEditorSectionClick(event, editorContext, section.id)}
      className={`scroll-mt-16 border-b border-white/[0.08] ${editorSectionClass(
        editorContext,
        section.id,
      )}`}
    >
      <div className="mx-auto max-w-[var(--site-page-width)] px-5 sm:px-8 lg:px-[58px]">
        <SectionRule number="01" label="Software" />

        <div className="grid overflow-hidden border-x border-t border-white/[0.08] lg:h-[165px] lg:grid-cols-2">
          <div className="overflow-hidden border-b border-white/[0.08] lg:border-b-0 lg:border-r">
            <CreatorCard project={creator} handle={site.handle} />
          </div>

          <div className="overflow-hidden">
            <IronPrairieCard project={ironPrairie} handle={site.handle} />
          </div>
        </div>
      </div>
    </section>
  );
}

function LowerWorkSection({
  site,
  sections,
  editorContext,
}: {
  site: PortfolioSiteData;
  sections: SiteSection[];
  editorContext: EditorSelectionContext;
}) {
  const kinds = sections.map(getTemplateKind);
  const visibleKinds = kinds.filter(isLowerWorkKind);
  if (visibleKinds.length === 0) return null;
  const clothingSection = sections.find(
    (section) => getTemplateKind(section) === "clothing",
  );
  const visualSection = sections.find(
    (section) => getTemplateKind(section) === "visual",
  );
  const studioSection = sections.find(
    (section) => getTemplateKind(section) === "studio",
  );

  return (
    <section className="border-b border-white/[0.08]">
      <div className="mx-auto max-w-[var(--site-page-width)] px-5 sm:px-8 lg:px-[58px]">
        <div className="grid lg:h-[164px] lg:grid-cols-[1.28fr_1.28fr_0.82fr_0.82fr]">
          {visibleKinds.includes("clothing") ? (
            <>
              <div
                id="clothing"
                data-creator-editor-section={
                  editorContext.editorPreview ? clothingSection?.id : undefined
                }
                onClick={(event) =>
                  handleEditorSectionClick(
                    event,
                    editorContext,
                    clothingSection?.id,
                  )
                }
                className={`overflow-hidden border-b border-white/[0.08] lg:border-b-0 lg:border-r ${editorSectionClass(
                  editorContext,
                  clothingSection?.id,
                )}`}
              >
                <div className="h-[28px] px-0">
                  <SectionRule number="03" label="Clothing" />
                </div>

                <div className="h-[136px]">
                  {site.clothing[0] && (
                    <ClothingCard
                      project={site.clothing[0]}
                      handle={site.handle}
                    />
                  )}
                </div>
              </div>

              <div
                data-creator-editor-section={
                  editorContext.editorPreview ? clothingSection?.id : undefined
                }
                onClick={(event) =>
                  handleEditorSectionClick(
                    event,
                    editorContext,
                    clothingSection?.id,
                  )
                }
                className={`overflow-hidden border-b border-white/[0.08] lg:border-b-0 lg:border-r ${editorSectionClass(
                  editorContext,
                  clothingSection?.id,
                )}`}
              >
                <div className="h-[28px] border-b border-transparent" />

                <div className="h-[136px]">
                  {site.clothing[1] && (
                    <ClothingCard
                      project={site.clothing[1]}
                      handle={site.handle}
                    />
                  )}
                </div>
              </div>
            </>
          ) : null}

          {visibleKinds.includes("visual") ? (
            <div
              id="visual"
              data-creator-editor-section={
                editorContext.editorPreview ? visualSection?.id : undefined
              }
              onClick={(event) =>
                handleEditorSectionClick(event, editorContext, visualSection?.id)
              }
              className={`overflow-hidden border-b border-white/[0.08] lg:border-b-0 lg:border-r ${editorSectionClass(
                editorContext,
                visualSection?.id,
              )}`}
            >
              <div className="h-[28px]">
                <SectionRule number="04" label="Visual" />
              </div>

              <div className="grid h-[136px] grid-cols-[48%_52%]">
                <div className="flex min-w-0 flex-col justify-between p-4">
                  <div>
                    <h3 className="text-[17px] tracking-[-0.04em] text-white/90">
                      Visual Work
                    </h3>
                    <p className="mt-2 text-[8px] leading-[1.5] text-white/38">
                      Designs, experiments, graphics, and creative exploration.
                    </p>
                  </div>

                  <span className="text-[7px] uppercase tracking-[0.14em] text-white/55">
                    View work →
                  </span>
                </div>

                <PortfolioVisual
                  kind={site.visual[0]?.visual ?? "visual-one"}
                  className="h-full min-h-0 border-0 border-l border-white/[0.07]"
                />
              </div>
            </div>
          ) : null}

          {visibleKinds.includes("studio") ? (
            <div
              id="studio"
              data-creator-editor-section={
                editorContext.editorPreview ? studioSection?.id : undefined
              }
              onClick={(event) =>
                handleEditorSectionClick(event, editorContext, studioSection?.id)
              }
              className={`overflow-hidden ${editorSectionClass(
                editorContext,
                studioSection?.id,
              )}`}
            >
              <div className="h-[28px]">
                <SectionRule number="05" label="Studio" />
              </div>

              <Link
                href={`/portfolio/${site.handle}/studio`}
                className="grid h-[136px] grid-cols-[45%_55%] transition hover:bg-white/[0.012]"
              >
                <div className="flex min-w-0 flex-col justify-between p-4">
                  <div>
                    <h3 className="text-[17px] leading-[1.02] tracking-[-0.04em] text-white/90">
                      The Creative
                      <br />
                      Setup
                    </h3>

                    <p className="mt-2 text-[8px] leading-[1.5] text-white/38">
                      Tools, process, and environment behind the work.
                    </p>
                  </div>

                  <span className="text-[7px] uppercase tracking-[0.14em] text-white/55">
                    View studio →
                  </span>
                </div>

                <PortfolioVisual
                  kind={site.studio.visual}
                  className="h-full min-h-0 border-0 border-l border-white/[0.07]"
                />
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ProductsSection({
  section,
  listings,
  editorPreview,
  editorContext,
}: {
  section: SiteSection;
  listings: SourceListing[];
  editorPreview: boolean;
  editorContext: EditorSelectionContext;
}) {
  const selectedIds =
    section.source.kind === "source" && section.source.mode === "selected"
      ? section.source.listingIds ?? []
      : [];
  const listingType =
    section.source.kind === "source" ? section.source.listingType : "product";
  const products = listings.filter(
    (listing) =>
      listing.type === listingType &&
      (section.source.kind !== "source" ||
        section.source.mode !== "selected" ||
        selectedIds.includes(listing.id)),
  );
  const heading = readContentString(section, "heading", section.label);
  const intro = readContentString(section, "intro");
  const showPrice = section.style?.showPrice !== false;
  const showDescription = section.style?.showDescription !== false;
  const columns = section.layout?.columns ?? 3;
  const variant = sectionVariant(section, "grid");
  const isServices = listingType === "service";
  const listMode = variant === "list";
  const featuredMode = variant === "featured";
  const editorialMode = variant === "editorial";
  const gridClass = listMode
    ? "grid gap-3 border-x border-t border-white/[0.08] p-3"
    : featuredMode
    ? "grid gap-3 border-x border-t border-white/[0.08] p-3 lg:grid-cols-[1.45fr_1fr]"
    : editorialMode
    ? "grid gap-3 border-x border-t border-white/[0.08] p-3 md:grid-cols-2"
    : `grid gap-3 border-x border-t border-white/[0.08] p-3 sm:grid-cols-2 ${
        columns === 4
          ? "lg:grid-cols-4"
          : columns === 2
          ? "lg:grid-cols-2"
          : "lg:grid-cols-3"
      }`;

  if (products.length === 0 && !editorPreview) return null;

  return (
    <section
      data-creator-editor-section={editorContext.editorPreview ? section.id : undefined}
      onClick={(event) => handleEditorSectionClick(event, editorContext, section.id)}
      className={`border-b border-white/[0.08] ${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(editorContext, section.id)}`}
    >
      <div className="mx-auto max-w-[var(--site-page-width)] px-5 py-6 sm:px-8 lg:px-[58px]">
        <SectionRule number="02" label={heading} />
        {intro ? (
          <p className="mb-4 max-w-[620px] text-[11px] leading-[1.6] text-white/45">
            {intro}
          </p>
        ) : null}

        {products.length > 0 ? (
          <div className={gridClass}>
            {products.map((product, index) => {
              const card = normalizeSourceListingCardProps(product);
              const image = resolveListingImage(product) ?? card.image;
              const featured = featuredMode && index === 0;

              return (
                <article
                  key={product.id}
                  className={`grid overflow-hidden border border-white/[0.08] bg-white/[0.018] ${
                    listMode
                      ? "min-h-[112px] sm:grid-cols-[180px_1fr]"
                      : editorialMode
                      ? "min-h-[190px]"
                      : featured
                      ? "min-h-[260px] lg:row-span-2"
                      : "min-h-[132px] sm:grid-cols-[42%_58%]"
                  }`}
                >
                  <div
                    className={`relative bg-[var(--site-surface-strong)] ${
                      listMode
                        ? "min-h-[112px]"
                        : editorialMode
                        ? "hidden"
                        : featured
                        ? "min-h-[220px]"
                        : "min-h-[128px]"
                    }`}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt={product.title}
                        className={`h-full w-full object-cover ${
                          listMode
                            ? "min-h-[112px]"
                            : featured
                            ? "min-h-[220px]"
                            : "min-h-[128px]"
                        }`}
                      />
                    ) : (
                      <div className="flex h-full min-h-[112px] items-center justify-center text-[8px] uppercase tracking-[0.24em] text-white/28">
                        No image
                      </div>
                    )}
                  </div>

                  <div
                    className={`flex min-w-0 flex-col justify-between ${
                      editorialMode
                        ? "p-6"
                        : featured
                        ? "p-5"
                        : "p-4"
                    }`}
                  >
                    <div>
                      {showPrice ? (
                        <p className="text-[7px] font-medium uppercase tracking-[0.25em] text-white/35">
                        {card.priceLabel}
                        </p>
                      ) : null}
                      <h3
                        className={`mt-2 leading-tight tracking-[-0.04em] text-white/92 ${
                          editorialMode || featured
                            ? "text-[28px]"
                            : "text-[18px]"
                        }`}
                      >
                        {product.title}
                      </h3>
                      {showDescription && product.description ? (
                        <p
                          className={`mt-2 leading-[1.55] text-white/42 ${
                            editorialMode || featured
                              ? "text-[11px]"
                              : "line-clamp-3 text-[8.5px]"
                          }`}
                        >
                          {product.description}
                        </p>
                      ) : null}
                    </div>

                    <span className="mt-4 text-[7px] uppercase tracking-[0.14em] text-white/55">
                      Source {isServices ? "service" : "product"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-white/[0.12] px-4 py-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/35">
            Select Source {listingType} listings to preview this section
          </div>
        )}
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
  const mediaUrl = readContentString(section, "mediaUrl");
  const mediaAlt = readContentString(section, "mediaAlt");
  const mediaFit =
    readContentString(section, "mediaFit") === "cover" ? "cover" : "contain";
  const variant = sectionVariant(section, "contained");

  if (!mediaUrl && !editorContext.editorPreview) return null;

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview ? section.id : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(event, editorContext, section.id)
      }
      className={`border-b border-white/[0.08] ${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(editorContext, section.id)}`}
    >
      <div
        className={`mx-auto px-5 sm:px-8 lg:px-[58px] ${sectionPaddingClass(
          section,
        )} ${
          variant === "wide"
            ? "max-w-[var(--site-page-width)]"
            : "max-w-[1200px]"
        }`}
      >
        <div
          data-creator-editor-node={
            editorContext.editorPreview ? "media" : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "media",
            )
          }
          className={`relative min-h-[220px] overflow-hidden border border-white/[0.08] bg-[var(--site-surface-strong)] ${editorNodeClass(
            editorContext,
            section.id,
            "media",
          )}`}
        >
          {mediaUrl ? (
            <img
              src={mediaUrl}
              alt={mediaAlt}
              className={`h-full min-h-[220px] w-full ${
                mediaFit === "cover"
                  ? "object-cover"
                  : "object-contain"
              }`}
            />
          ) : (
            <div className="flex min-h-[260px] items-center justify-center border border-dashed border-white/[0.08] text-[10px] uppercase tracking-[0.18em] text-white/30">
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

  return (
    <section
      data-creator-editor-section={editorContext.editorPreview ? section.id : undefined}
      onClick={(event) => handleEditorSectionClick(event, editorContext, section.id)}
      className={`border-b border-white/[0.08] ${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(editorContext, section.id)}`}
    >
      <div
        className={`mx-auto max-w-[var(--site-page-width)] px-5 sm:px-8 lg:px-[58px] ${sectionPaddingClass(
          section,
        )}`}
      >
        <SectionRule number="02" label={section.label} />
        <div
          className={`py-5 ${
            split
              ? "grid gap-5 md:grid-cols-[0.8fr_1.2fr]"
              : `${narrow ? "mx-auto max-w-[520px] text-center" : sectionWidthClass(section)} ${sectionAlignmentClass(section)}`
          }`}
        >
          <h2
            className={`leading-none tracking-[-0.05em] text-white/92 ${
              split ? "text-[36px]" : "text-[28px]"
            }`}
          >
            {heading}
          </h2>
          {body ? (
            <p
              className={`text-[11px] leading-[1.65] text-white/48 ${
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
  const heading = readContentString(section, "heading", section.label);
  const items = readGalleryItems(section);
  const columns = section.layout?.columns ?? 3;

  if (items.length === 0 && !editorPreview) return null;

  const gridColumns =
    columns === 4
      ? "lg:grid-cols-4"
      : columns === 2
      ? "lg:grid-cols-2"
      : "lg:grid-cols-3";

  return (
    <section
      data-creator-editor-section={
        editorContext.editorPreview ? section.id : undefined
      }
      onClick={(event) =>
        handleEditorSectionClick(event, editorContext, section.id)
      }
      className={`border-b border-white/[0.08] ${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(editorContext, section.id)}`}
    >
      <div className="mx-auto max-w-[var(--site-page-width)] px-5 py-6 sm:px-8 lg:px-[58px]">
        <SectionRule number="02" label={heading} />

        <div
          data-creator-editor-node={
            editorContext.editorPreview ? "media" : undefined
          }
          onClick={(event) =>
            handleEditorNodeClick(
              event,
              editorContext,
              section.id,
              "media",
            )
          }
          className={`mt-3 ${editorNodeClass(
            editorContext,
            section.id,
            "media",
          )}`}
        >
          {items.length > 0 ? (
            <div
              className={`grid gap-3 border-x border-t border-white/[0.08] p-3 sm:grid-cols-2 ${gridColumns}`}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  className="relative aspect-[4/3] overflow-hidden border border-white/[0.08] bg-[var(--site-surface-strong)]"
                >
                  <img
                    src={item.url}
                    alt={item.alt}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center border border-dashed border-white/[0.12] text-[10px] uppercase tracking-[0.18em] text-white/35">
              Add gallery images
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CtaSection({
  section,
  editorContext,
}: {
  section: SiteSection;
  editorContext: EditorSelectionContext;
}) {
  const heading = readContentString(section, "heading", section.label);
  const body = readContentString(section, "body");
  const label = readContentString(section, "buttonLabel", "Get started");
  const href = readContentString(section, "buttonHref", "#contact");
  const variant = sectionVariant(section, "banner");
  const centered = variant === "centered";
  const minimal = variant === "minimal";

  return (
    <section
      data-creator-editor-section={editorContext.editorPreview ? section.id : undefined}
      onClick={(event) => handleEditorSectionClick(event, editorContext, section.id)}
      className={`border-b border-white/[0.08] ${sectionBackgroundClass(
        section,
      )} ${editorSectionClass(editorContext, section.id)}`}
    >
      <div
        className={`mx-auto max-w-[var(--site-page-width)] px-5 sm:px-8 lg:px-[58px] ${sectionPaddingClass(
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
              className={`leading-none tracking-[-0.055em] text-white/92 ${
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
                className="mt-3 text-[11px] leading-[1.65] text-white/48"
              />
            ) : null}
          </div>
          <a
            href={href || "#contact"}
            data-creator-editor-node={editorContext.editorPreview ? "button" : undefined}
            onClick={(event) =>
              handleEditorNodeClick(event, editorContext, section.id, "button")
            }
            className={`mt-5 inline-flex h-8 w-fit items-center gap-4 rounded-full border border-white/[0.18] px-4 text-[7px] uppercase tracking-[0.2em] text-[var(--site-accent)] transition hover:border-white/35 ${
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
  section,
  editorContext,
}: {
  section?: SiteSection;
  editorContext: EditorSelectionContext;
}) {
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
  const label = readContentString(section, "buttonLabel", "Get in touch");
  const href = readContentString(section, "buttonHref", "#contact");
  const centered = sectionVariant(section, "standard") === "centered";

  return (
    <section
      id="contact"
      data-creator-editor-section={editorContext.editorPreview ? section?.id : undefined}
      onClick={(event) => handleEditorSectionClick(event, editorContext, section?.id)}
      className={editorSectionClass(editorContext, section?.id)}
    >
      <div className="mx-auto max-w-[var(--site-page-width)] px-5 sm:px-8 lg:px-[58px]">
        <div
          className={`grid items-center gap-4 border-b border-white/[0.08] ${
            centered
              ? "min-h-[180px] py-8 text-center"
              : "min-h-[48px] lg:grid-cols-[210px_1fr_auto]"
          }`}
        >
          <SectionRule number="06" label="Contact" />

          <div
            data-creator-editor-node={editorContext.editorPreview ? "text" : undefined}
            onClick={(event) =>
              handleEditorNodeClick(event, editorContext, section?.id, "text")
            }
            className={`${
              centered
                ? "mx-auto max-w-[620px]"
                : "flex items-baseline gap-7"
            } ${editorNodeClass(editorContext, section?.id, "text")}`}
          >
            <InlineEditableText
              as="p"
              value={heading}
              field="heading"
              sectionId={section?.id}
              node="text"
              editorContext={editorContext}
              className="text-[13px] tracking-[-0.02em] text-white/80"
            />

            <InlineEditableText
              as="p"
              value={body}
              field="body"
              sectionId={section?.id}
              node="text"
              editorContext={editorContext}
              multiline
              className={`text-white/32 ${
                centered
                  ? "mt-3 text-[10px] leading-5"
                  : "hidden text-[8px] xl:block"
              }`}
            />
          </div>

          <a
            href={href || "#contact"}
            data-creator-editor-node={editorContext.editorPreview ? "button" : undefined}
            onClick={(event) =>
              handleEditorNodeClick(event, editorContext, section?.id, "button")
            }
            className={`inline-flex h-7 w-fit items-center gap-4 rounded-full border border-white/[0.17] px-4 text-[7px] uppercase tracking-[0.17em] text-[var(--site-accent)] ${
              centered ? "mx-auto" : ""
            } ${editorNodeClass(editorContext, section?.id, "button")}`}
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

function MackHomeSections({
  site,
  sections,
  sourceListings,
  editorPreview,
  editorContext,
}: {
  site: PortfolioSiteData;
  sections: SiteSection[];
  sourceListings: SourceListing[];
  editorPreview: boolean;
  editorContext: EditorSelectionContext;
}) {
  const visibleSections = sections.filter((section) => section.visible);
  const nodes: ReactNode[] = [];

  for (let index = 0; index < visibleSections.length; index += 1) {
    const section = visibleSections[index];
    const kind = getTemplateKind(section);

    if (isLowerWorkKind(kind)) {
      const lowerSections: SiteSection[] = [section];

      while (
        visibleSections[index + 1] &&
        isLowerWorkKind(getTemplateKind(visibleSections[index + 1]))
      ) {
        index += 1;
        lowerSections.push(visibleSections[index]);
      }

      nodes.push(
        <LowerWorkSection
          key={`${section.id}-lower-work`}
          site={site}
          sections={lowerSections}
          editorContext={editorContext}
        />,
      );
      continue;
    }

    if (kind === "hero") {
      nodes.push(
        <HeroSection
          key={section.id}
          site={site}
          section={section}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "software") {
      nodes.push(
        <SoftwareSection
          key={section.id}
          site={site}
          section={section}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "products") {
      nodes.push(
        <ProductsSection
          key={section.id}
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
          section={section}
          listings={sourceListings}
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
          section={section}
          editorContext={editorContext}
        />,
      );
    } else if (kind === "contact") {
      nodes.push(
        <ContactSection
          key={section.id}
          section={section}
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
  const editorContext: EditorSelectionContext = {
    editorPreview,
    pageId: editorPageId,
    activeSelection: editorSelection,
    onSelectionRequest: onEditorSelectionRequest,
    onContentEditRequest: onEditorContentEditRequest,
  };

  return (
    <div
      style={themeStyle}
      className="min-h-screen bg-[var(--site-bg)] text-[var(--site-text)]"
    >
      <header className="sticky top-0 z-50 border-b border-[var(--site-border)] bg-[var(--site-bg)] backdrop-blur-xl">
        <div className="mx-auto flex h-[48px] max-w-[var(--site-page-width)] items-center justify-between px-5 sm:px-8 lg:px-[58px]">
          <Link
            href={`/portfolio/${site.handle}`}
            className="text-[10px] font-semibold tracking-[0.43em]"
            style={{ color: "var(--site-accent)" }}
          >
            {headerConfig.brandLabel}
          </Link>

          <nav className="hidden items-center gap-9 text-[9px] text-white/48 md:flex">
            {headerConfig.navigation
              .filter((item) => item.visible)
              .map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  className="hover:text-white/82"
                >
                  {item.label}
                </a>
              ))}
          </nav>

          {headerConfig.tagline ? (
            <p className="hidden text-[8px] text-white/40 xl:block">
              • &nbsp; {headerConfig.tagline}
            </p>
          ) : null}
        </div>
      </header>

      <main id="work">
        <MackHomeSections
          site={site}
          sections={renderSections}
          sourceListings={sourceListings}
          editorPreview={editorPreview}
          editorContext={editorContext}
        />
      </main>

      <footer className="border-t border-[var(--site-border)]">
        <div className="mx-auto flex min-h-[42px] max-w-[var(--site-page-width)] items-center justify-between gap-4 px-5 sm:px-8 lg:px-[58px]">
          <p
            className="text-[8px] font-semibold tracking-[0.42em]"
            style={{ color: "var(--site-accent)" }}
          >
            {footerConfig.brandLabel}
          </p>

          {footerConfig.tagline ? (
            <p className="text-right text-[6px] uppercase tracking-[0.33em] text-white/17">
              {footerConfig.tagline}
            </p>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
