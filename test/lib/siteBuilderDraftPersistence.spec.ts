import { describe, expect, it } from "vitest";

import { isSiteDocument } from "@/lib/site-builder/draftPersistence";
import { mackValiSiteDocument } from "@/lib/site-builder/mackValiSite";

describe("site builder draft persistence validation", () => {
  it("accepts the current Mack SiteDocument seed", () => {
    expect(isSiteDocument(mackValiSiteDocument)).toBe(true);
  });

  it("rejects documents without a valid homepage", () => {
    expect(
      isSiteDocument({
        ...mackValiSiteDocument,
        homePageId: "missing",
      }),
    ).toBe(false);
  });

  it("rejects invalid site theme values", () => {
    const site = structuredClone(mackValiSiteDocument);

    if (!site.theme) {
      throw new Error("Expected Mack seed theme.");
    }

    site.theme.palette = "rainbow" as never;

    expect(isSiteDocument(site)).toBe(false);
  });

  it("rejects invalid site navigation items", () => {
    const site = structuredClone(mackValiSiteDocument);

    if (!site.header) {
      throw new Error("Expected Mack seed header.");
    }

    site.header.navigation[0] = {
      ...site.header.navigation[0],
      href: 123,
    } as never;

    expect(isSiteDocument(site)).toBe(false);
  });

  it("rejects sections with invalid source bindings", () => {
    const site = structuredClone(mackValiSiteDocument);
    site.pages[0].sections[0].source = {
      kind: "source",
      listingType: "product",
      mode: "selected",
      listingIds: [123],
    } as never;

    expect(isSiteDocument(site)).toBe(false);
  });
});
