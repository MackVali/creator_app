import { describe, expect, it } from "vitest";

import { mackValiSiteDocument } from "@/lib/site-builder/mackValiSite";
import {
  getSitePageHref,
  resolveSiteNavigationHref,
} from "@/lib/site-builder/siteLinks";

describe("site builder links", () => {
  it("resolves the homepage from the current site handle", () => {
    const site = structuredClone(mackValiSiteDocument);
    site.handle = "new-handle";

    expect(
      getSitePageHref(site, site.homePageId),
    ).toBe("/portfolio/new-handle");
  });

  it("resolves subpages from page ids instead of frozen preview paths", () => {
    const site = structuredClone(mackValiSiteDocument);
    site.handle = "new-handle";

    const page = site.pages.find(
      (candidate) => candidate.id !== site.homePageId,
    );

    if (!page) {
      throw new Error("Expected a non-home page.");
    }

    expect(
      getSitePageHref(site, page.id),
    ).toBe(`/portfolio/new-handle/${page.slug}`);
  });

  it("keeps page-backed navigation valid after a handle change", () => {
    const site = structuredClone(mackValiSiteDocument);
    site.handle = "renamed-site";

    const page = site.pages.find(
      (candidate) => candidate.id !== site.homePageId,
    );

    if (!page) {
      throw new Error("Expected a non-home page.");
    }

    expect(
      resolveSiteNavigationHref(
        site,
        "fallback",
        {
          id: "nav-test",
          label: page.title,
          href: "/old-url",
          pageId: page.id,
          visible: true,
        },
      ),
    ).toBe(
      `/portfolio/renamed-site/${page.slug}`,
    );
  });

  it("preserves custom navigation URLs", () => {
    expect(
      resolveSiteNavigationHref(
        undefined,
        "mackvali",
        {
          id: "nav-external",
          label: "External",
          href: "https://example.com",
          visible: true,
        },
      ),
    ).toBe("https://example.com");
  });
});
