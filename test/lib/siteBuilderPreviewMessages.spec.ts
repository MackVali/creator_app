import { describe, expect, it } from "vitest";

import {
  SITE_PREVIEW_MESSAGE_NAMESPACE,
  isSitePreviewContentEditRequestMessage,
  sectionTypeSupportsInlineEditField,
} from "@/lib/site-builder/previewMessages";

describe("site builder preview messages", () => {
  it("accepts a typed inline content edit request for supported text fields", () => {
    expect(
      isSitePreviewContentEditRequestMessage({
        namespace: SITE_PREVIEW_MESSAGE_NAMESPACE,
        type: "content-edit-request",
        payload: {
          pageId: "home",
          sectionId: "home-hero",
          field: "headline",
          value: "Build useful things.",
        },
      }),
    ).toBe(true);
  });

  it("rejects href edits and arbitrary content paths from the preview frame", () => {
    for (const field of [
      "primaryCtaHref",
      "buttonHref",
      "content.headline",
      "__proto__",
    ]) {
      expect(
        isSitePreviewContentEditRequestMessage({
          namespace: SITE_PREVIEW_MESSAGE_NAMESPACE,
          type: "content-edit-request",
          payload: {
            pageId: "home",
            sectionId: "home-hero",
            field,
            value: "https://example.com",
          },
        }),
      ).toBe(false);
    }
  });

  it("keeps inline fields scoped to section types", () => {
    expect(sectionTypeSupportsInlineEditField("hero", "headline")).toBe(true);
    expect(sectionTypeSupportsInlineEditField("hero", "primaryCtaLabel")).toBe(
      true,
    );
    expect(sectionTypeSupportsInlineEditField("cta", "buttonLabel")).toBe(true);
    expect(sectionTypeSupportsInlineEditField("contact", "body")).toBe(true);

    expect(sectionTypeSupportsInlineEditField("cta", "headline")).toBe(false);
    expect(sectionTypeSupportsInlineEditField("contact", "primaryCtaLabel")).toBe(
      false,
    );
    expect(sectionTypeSupportsInlineEditField("products", "heading")).toBe(false);
  });
});
