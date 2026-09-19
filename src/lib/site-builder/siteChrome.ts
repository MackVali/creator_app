import type {
  SiteDocument,
  SiteFooterConfig,
  SiteHeaderConfig,
} from "@/lib/site-builder/types";

export function createDefaultSiteHeader(
  brandLabel: string,
): SiteHeaderConfig {
  return {
    brandLabel,
    tagline: "Ideas. Products. A Quieter Internet.",
    navigation: [
      { id: "nav-work", label: "Work", href: "#work", visible: true },
      {
        id: "nav-software",
        label: "Software",
        href: "#software",
        visible: true,
      },
      {
        id: "nav-clothing",
        label: "Clothing",
        href: "#clothing",
        visible: true,
      },
      {
        id: "nav-visual",
        label: "Visual",
        href: "#visual",
        visible: true,
      },
      {
        id: "nav-studio",
        label: "Studio",
        href: "#studio",
        visible: true,
      },
      {
        id: "nav-contact",
        label: "Contact",
        href: "#contact",
        visible: true,
      },
    ],
  };
}

export function createDefaultSiteFooter(
  brandLabel: string,
): SiteFooterConfig {
  return {
    brandLabel,
    tagline: "Better tools · Brighter days.",
  };
}

export function getSiteHeaderConfig(
  site: Pick<SiteDocument, "name" | "header">,
): SiteHeaderConfig {
  if (!site.header) {
    return createDefaultSiteHeader(site.name);
  }

  return {
    brandLabel: site.header.brandLabel,
    tagline: site.header.tagline,
    navigation: site.header.navigation.map((item) => ({ ...item })),
  };
}

export function getSiteFooterConfig(
  site: Pick<SiteDocument, "name" | "footer">,
): SiteFooterConfig {
  if (!site.footer) {
    return createDefaultSiteFooter(site.name);
  }

  return { ...site.footer };
}
