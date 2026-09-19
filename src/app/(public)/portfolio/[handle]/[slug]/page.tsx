import { notFound } from "next/navigation";

import PortfolioSite from "@/components/portfolio/PortfolioSite";
import { renderMackSiteDraft } from "@/lib/site-builder/mackValiSite";
import { getPublishedSiteRecordByHandle } from "@/lib/site-builder/publicPersistence";
import { getPublishedSiteSourceListings } from "@/lib/site-builder/publicSourceListings";

export const dynamic = "force-dynamic";

type PublishedSitePageProps = {
  params: Promise<{
    handle: string;
    slug: string;
  }>;
};

export default async function PublishedSitePage({
  params,
}: PublishedSitePageProps) {
  const {
    handle: requestedHandle,
    slug: requestedSlug,
  } = await params;

  const publishedRecord =
    await getPublishedSiteRecordByHandle(requestedHandle);

  if (!publishedRecord) {
    notFound();
  }

  const site = publishedRecord.site;
  const sourceListings =
    await getPublishedSiteSourceListings(
      publishedRecord.userId,
    );

  const slug = requestedSlug.trim().toLowerCase();

  const page = site.pages.find(
    (candidate) =>
      candidate.id !== site.homePageId &&
      candidate.slug.toLowerCase() === slug,
  );

  if (!page) {
    notFound();
  }

  return (
    <PortfolioSite
      site={renderMackSiteDraft(site)}
      siteDocument={site}
      sections={page.sections}
      sourceListings={sourceListings}
    />
  );
}
