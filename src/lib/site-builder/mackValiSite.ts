import type { PortfolioSiteData } from "@/lib/portfolio/types";
import { mackValiPortfolio } from "@/lib/portfolio/mackValiPortfolio";
import {
  createDefaultSiteFooter,
  createDefaultSiteHeader,
} from "@/lib/site-builder/siteChrome";
import type {
  SiteDocument,
  SiteSection,
} from "@/lib/site-builder/types";

export const mackValiSiteDocument: SiteDocument = {
  id: "mackvali-site",
  name: "Mack Vali",
  handle: "mackvali",
  homePageId: "home",
  header: createDefaultSiteHeader("Mack Vali"),
  footer: createDefaultSiteFooter("Mack Vali"),
  pages: [
    {
      id: "home",
      title: "Home",
      slug: "",
      previewPath: "/portfolio/mackvali",
      sections: [
        {
          id: "home-hero",
          label: "Hero",
          type: "hero",
          visible: true,
          source: { kind: "manual" },
          content: {
            eyebrow: "Design · Build · Create",
            headline: mackValiPortfolio.headline,
            intro: mackValiPortfolio.intro,
            primaryCtaLabel: "Explore my work",
            primaryCtaHref: "#software",
          },
          layout: {
            variant: "split",
            alignment: "left",
            width: "normal",
            spacing: "normal",
          },
          style: {
            background: "default",
          },
        },
        {
          id: "home-software",
          label: "Software",
          type: "projects",
          visible: true,
          source: { kind: "manual" },
          content: {
            templateKind: "software",
          },
        },
        {
          id: "home-clothing",
          label: "Clothing",
          type: "projects",
          visible: true,
          source: { kind: "manual" },
          content: {
            templateKind: "clothing",
          },
        },
        {
          id: "home-visual",
          label: "Visual",
          type: "gallery",
          visible: true,
          source: { kind: "manual" },
          content: {
            templateKind: "visual",
          },
          layout: {
            variant: "grid",
            columns: 3,
          },
        },
        {
          id: "home-studio",
          label: "Studio",
          type: "media",
          visible: true,
          source: { kind: "manual" },
          content: {
            templateKind: "studio",
          },
        },
        {
          id: "home-contact",
          label: "Contact",
          type: "contact",
          visible: true,
          source: { kind: "manual" },
          content: {
            heading: "Let’s build something useful.",
            body: "Open to creative opportunities, collaborations, and interesting projects.",
            buttonLabel: "Get in touch",
            buttonHref: "#contact",
          },
        },
      ],
    },
    {
      id: "creator",
      title: "CREATOR",
      slug: "creator",
      previewPath: "/portfolio/mackvali/work/creator",
      sections: [
        {
          id: "creator-hero",
          label: "Project Hero",
          type: "hero",
          visible: true,
          source: { kind: "manual" },
          content: {},
        },
        {
          id: "creator-content",
          label: "Case Study",
          type: "content",
          visible: true,
          source: { kind: "manual" },
          content: {},
        },
      ],
    },
    {
      id: "yump",
      title: "Yump.",
      slug: "yump",
      previewPath: "/portfolio/mackvali/work/yump",
      sections: [
        {
          id: "yump-hero",
          label: "Brand Hero",
          type: "hero",
          visible: true,
          source: { kind: "manual" },
          content: {},
        },
        {
          id: "yump-products",
          label: "Products",
          type: "products",
          visible: true,
          source: {
            kind: "source",
            listingType: "product",
            mode: "selected",
          },
          content: {},
        },
      ],
    },
    {
      id: "abyssal",
      title: "Abyssal Insight",
      slug: "abyssal-insight",
      previewPath: "/portfolio/mackvali/work/abyssal-insight",
      sections: [
        {
          id: "abyssal-hero",
          label: "Brand Hero",
          type: "hero",
          visible: true,
          source: { kind: "manual" },
          content: {},
        },
        {
          id: "abyssal-products",
          label: "Products",
          type: "products",
          visible: true,
          source: {
            kind: "source",
            listingType: "product",
            mode: "selected",
          },
          content: {},
        },
      ],
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
