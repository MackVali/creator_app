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
