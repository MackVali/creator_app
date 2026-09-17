import type {
  SiteDocument,
  SiteNavigationItem,
} from "@/lib/site-builder/types";

type SitePageLinkDocument = Pick<
  SiteDocument,
  "handle" | "homePageId" | "pages"
>;

export function getSitePageHref(
  site: SitePageLinkDocument,
  pageId: string | undefined,
) {
  const base = `/portfolio/${site.handle}`;
  const page = site.pages.find(
    (candidate) => candidate.id === pageId,
  );

  if (!page || page.id === site.homePageId) {
    return base;
  }

  return `${base}/${page.slug}`;
}

export function resolveSiteLinkHref(
  site: SiteDocument | undefined,
  fallbackHandle: string,
  target: {
    href?: string;
    pageId?: string;
  },
) {
  if (site && target.pageId) {
    const pageExists = site.pages.some(
      (page) => page.id === target.pageId,
    );

    if (pageExists) {
      return getSitePageHref(site, target.pageId);
    }
  }

  return target.href || "#";
}

export function resolveSiteNavigationHref(
  site: SiteDocument | undefined,
  fallbackHandle: string,
  item: SiteNavigationItem,
) {
  return resolveSiteLinkHref(
    site,
    fallbackHandle,
    item,
  );
}
