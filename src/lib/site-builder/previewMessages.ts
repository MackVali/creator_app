import type {
  SiteContentNodeId,
  SiteDocument,
  SiteEditorSelection,
  SiteSectionType,
} from "@/lib/site-builder/types";
import type { SourceListing } from "@/types/source";

export const SITE_PREVIEW_MESSAGE_NAMESPACE = "creator-site-preview";

export type SitePreviewStatePayload = {
  site: SiteDocument;
  selectedPageId: string;
  sourceListings: SourceListing[];
};

export type SitePreviewStateMessage = {
  namespace: typeof SITE_PREVIEW_MESSAGE_NAMESPACE;
  type: "state";
  payload: SitePreviewStatePayload;
};

export type SitePreviewHeightMessage = {
  namespace: typeof SITE_PREVIEW_MESSAGE_NAMESPACE;
  type: "height";
  payload: {
    height: number;
  };
};

export type SitePreviewSelectionRequestPayload = {
  pageId: string;
  sectionId: string;
  node?: SiteContentNodeId;
};

export type SitePreviewSelectionRequestMessage = {
  namespace: typeof SITE_PREVIEW_MESSAGE_NAMESPACE;
  type: "selection-request";
  payload: SitePreviewSelectionRequestPayload;
};

export const SITE_PREVIEW_INLINE_EDIT_FIELDS = {
  hero: ["eyebrow", "headline", "intro", "primaryCtaLabel"],
  cta: ["heading", "body", "buttonLabel"],
  contact: ["heading", "body", "buttonLabel"],
} as const satisfies Partial<Record<SiteSectionType, readonly string[]>>;

export type SitePreviewInlineEditField =
  (typeof SITE_PREVIEW_INLINE_EDIT_FIELDS)[keyof typeof SITE_PREVIEW_INLINE_EDIT_FIELDS][number];

export type SitePreviewContentEditRequestPayload = {
  pageId: string;
  sectionId: string;
  field: SitePreviewInlineEditField;
  value: string;
};

export type SitePreviewContentEditRequestMessage = {
  namespace: typeof SITE_PREVIEW_MESSAGE_NAMESPACE;
  type: "content-edit-request";
  payload: SitePreviewContentEditRequestPayload;
};

export type SitePreviewActiveSelectionPayload = {
  selection: SiteEditorSelection | null;
};

export type SitePreviewActiveSelectionMessage = {
  namespace: typeof SITE_PREVIEW_MESSAGE_NAMESPACE;
  type: "active-selection";
  payload: SitePreviewActiveSelectionPayload;
};

export type SitePreviewMessage =
  | SitePreviewStateMessage
  | SitePreviewHeightMessage
  | SitePreviewSelectionRequestMessage
  | SitePreviewContentEditRequestMessage
  | SitePreviewActiveSelectionMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSiteDocument(value: unknown): value is SiteDocument {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.handle === "string" &&
    Array.isArray(value.pages)
  );
}

function isSourceListing(value: unknown): value is SourceListing {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    (value.type === "product" ||
      value.type === "service" ||
      value.type === "post") &&
    typeof value.title === "string"
  );
}

function isSelectableNode(value: unknown): value is SiteContentNodeId {
  return value === "text" || value === "button" || value === "media";
}

export function isSitePreviewInlineEditField(
  value: unknown,
): value is SitePreviewInlineEditField {
  if (typeof value !== "string") return false;

  return Object.values(SITE_PREVIEW_INLINE_EDIT_FIELDS).some((fields) =>
    (fields as readonly string[]).includes(value),
  );
}

export function sectionTypeSupportsInlineEditField(
  sectionType: SiteSectionType,
  field: SitePreviewInlineEditField,
) {
  const fields =
    SITE_PREVIEW_INLINE_EDIT_FIELDS[
      sectionType as keyof typeof SITE_PREVIEW_INLINE_EDIT_FIELDS
    ];

  return Boolean((fields as readonly string[] | undefined)?.includes(field));
}

function isSiteEditorSelection(value: unknown): value is SiteEditorSelection {
  if (!isRecord(value)) return false;
  if (typeof value.pageId !== "string") return false;
  if (typeof value.sectionId !== "string") return false;

  if (value.kind === "section") return true;

  return (
    value.kind === "content" &&
    (value.node === "text" || value.node === "button" || value.node === "media")
  );
}

export function createSitePreviewStateMessage(
  payload: SitePreviewStatePayload,
): SitePreviewStateMessage {
  return {
    namespace: SITE_PREVIEW_MESSAGE_NAMESPACE,
    type: "state",
    payload,
  };
}

export function createSitePreviewHeightMessage(
  height: number,
): SitePreviewHeightMessage {
  return {
    namespace: SITE_PREVIEW_MESSAGE_NAMESPACE,
    type: "height",
    payload: {
      height,
    },
  };
}

export function createSitePreviewSelectionRequestMessage(
  payload: SitePreviewSelectionRequestPayload,
): SitePreviewSelectionRequestMessage {
  return {
    namespace: SITE_PREVIEW_MESSAGE_NAMESPACE,
    type: "selection-request",
    payload,
  };
}

export function createSitePreviewContentEditRequestMessage(
  payload: SitePreviewContentEditRequestPayload,
): SitePreviewContentEditRequestMessage {
  return {
    namespace: SITE_PREVIEW_MESSAGE_NAMESPACE,
    type: "content-edit-request",
    payload,
  };
}

export function createSitePreviewActiveSelectionMessage(
  selection: SiteEditorSelection | null,
): SitePreviewActiveSelectionMessage {
  return {
    namespace: SITE_PREVIEW_MESSAGE_NAMESPACE,
    type: "active-selection",
    payload: {
      selection,
    },
  };
}

export function isSitePreviewStateMessage(
  value: unknown,
): value is SitePreviewStateMessage {
  if (!isRecord(value)) return false;
  if (value.namespace !== SITE_PREVIEW_MESSAGE_NAMESPACE) return false;
  if (value.type !== "state") return false;
  if (!isRecord(value.payload)) return false;

  return (
    isSiteDocument(value.payload.site) &&
    typeof value.payload.selectedPageId === "string" &&
    Array.isArray(value.payload.sourceListings) &&
    value.payload.sourceListings.every(isSourceListing)
  );
}

export function isSitePreviewHeightMessage(
  value: unknown,
): value is SitePreviewHeightMessage {
  if (!isRecord(value)) return false;
  if (value.namespace !== SITE_PREVIEW_MESSAGE_NAMESPACE) return false;
  if (value.type !== "height") return false;
  if (!isRecord(value.payload)) return false;

  return (
    typeof value.payload.height === "number" &&
    Number.isFinite(value.payload.height) &&
    value.payload.height > 0
  );
}

export function isSitePreviewSelectionRequestMessage(
  value: unknown,
): value is SitePreviewSelectionRequestMessage {
  if (!isRecord(value)) return false;
  if (value.namespace !== SITE_PREVIEW_MESSAGE_NAMESPACE) return false;
  if (value.type !== "selection-request") return false;
  if (!isRecord(value.payload)) return false;

  return (
    typeof value.payload.pageId === "string" &&
    typeof value.payload.sectionId === "string" &&
    (value.payload.node === undefined || isSelectableNode(value.payload.node))
  );
}

export function isSitePreviewContentEditRequestMessage(
  value: unknown,
): value is SitePreviewContentEditRequestMessage {
  if (!isRecord(value)) return false;
  if (value.namespace !== SITE_PREVIEW_MESSAGE_NAMESPACE) return false;
  if (value.type !== "content-edit-request") return false;
  if (!isRecord(value.payload)) return false;

  return (
    typeof value.payload.pageId === "string" &&
    typeof value.payload.sectionId === "string" &&
    isSitePreviewInlineEditField(value.payload.field) &&
    typeof value.payload.value === "string"
  );
}

export function isSitePreviewActiveSelectionMessage(
  value: unknown,
): value is SitePreviewActiveSelectionMessage {
  if (!isRecord(value)) return false;
  if (value.namespace !== SITE_PREVIEW_MESSAGE_NAMESPACE) return false;
  if (value.type !== "active-selection") return false;
  if (!isRecord(value.payload)) return false;

  return (
    value.payload.selection === null ||
    isSiteEditorSelection(value.payload.selection)
  );
}
