import type { SiteDocument } from "@/lib/site-builder/types";
import type { SourceListing } from "@/types/source";

export const SITE_PREVIEW_MESSAGE_NAMESPACE = "creator-site-preview";

export type SitePreviewStatePayload = {
  site: SiteDocument;
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

export type SitePreviewMessage =
  | SitePreviewStateMessage
  | SitePreviewHeightMessage;

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

export function isSitePreviewStateMessage(
  value: unknown,
): value is SitePreviewStateMessage {
  if (!isRecord(value)) return false;
  if (value.namespace !== SITE_PREVIEW_MESSAGE_NAMESPACE) return false;
  if (value.type !== "state") return false;
  if (!isRecord(value.payload)) return false;

  return (
    isSiteDocument(value.payload.site) &&
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
