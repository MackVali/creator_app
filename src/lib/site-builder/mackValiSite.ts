import type { PortfolioSiteData } from "@/lib/portfolio/types";
import { mackValiPortfolio } from "@/lib/portfolio/mackValiPortfolio";
import {
  createDefaultSiteFooter,
  createDefaultSiteHeader,
} from "@/lib/site-builder/siteChrome";
import { createDefaultSiteTheme } from "@/lib/site-builder/siteTheme";
import type {
  SiteDocument,
  SiteSection,
} from "@/lib/site-builder/types";

export const mackValiSiteDocument: SiteDocument = {
  id: "mackvali-site",
  name: "Mack Vali",
  handle: "mackvali",
  homePageId: "home",

  header:
    createDefaultSiteHeader(
      "Mack Vali",
    ),

  footer:
    createDefaultSiteFooter(
      "Mack Vali",
    ),

  theme:
    createDefaultSiteTheme(),

  pages: [
    {
      id: "home",
      title: "Home",
      slug: "",
      previewPath:
        "/portfolio/mackvali",
      sections: [],
    },
  ],
};

function readString(
  section: SiteSection | undefined,
  key: string,
  fallback: string,
) {
  const value = section?.content[key];
  return typeof value === "string" ? value : fallback;
}

export function renderMackSiteDraft(
  site: SiteDocument,
): PortfolioSiteData {
  const home =
    site.pages.find((page) => page.id === site.homePageId) ??
    site.pages.find((page) => page.id === "home") ??
    site.pages[0];
  const hero = home?.sections.find((section) => section.type === "hero");

  return {
    ...mackValiPortfolio,
    name: site.name,
    handle: site.handle,
    headline: readString(
      hero,
      "headline",
      mackValiPortfolio.headline,
    ),
    intro: readString(
      hero,
      "intro",
      mackValiPortfolio.intro,
    ),
  };
}
