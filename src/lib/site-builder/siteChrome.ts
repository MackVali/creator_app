import type {
  SiteDocument,
  SiteFooterConfig,
  SiteHeaderConfig,
} from "@/lib/site-builder/types";

function cloneSiteNavigation(
  items: SiteHeaderConfig["navigation"],
): SiteHeaderConfig["navigation"] {
  return items.map((item) => ({
    ...item,
    children:
      item.children
        ? cloneSiteNavigation(
            item.children,
          )
        : undefined,
  }));
}


export function createDefaultSiteHeader(
  brandLabel: string,
): SiteHeaderConfig {
  return {
    brandLabel,
    tagline: "",
    navigation: [],
  };
}

export function createDefaultSiteFooter(
  brandLabel: string,
): SiteFooterConfig {
  return {
    brandLabel,
    tagline: "",
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
    navigation:
      cloneSiteNavigation(
        site.header.navigation,
      ),
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
