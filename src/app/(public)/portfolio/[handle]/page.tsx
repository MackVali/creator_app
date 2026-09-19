import { notFound } from "next/navigation";

import PortfolioSite from "@/components/portfolio/PortfolioSite";
import { mackValiPortfolio } from "@/lib/portfolio/mackValiPortfolio";
import {
  mackValiSiteDocument,
  renderMackSiteDraft,
} from "@/lib/site-builder/mackValiSite";
import { getPublishedSiteRecordByHandle } from "@/lib/site-builder/publicPersistence";
import { getPublishedSiteSourceListings } from "@/lib/site-builder/publicSourceListings";

export const dynamic = "force-dynamic";

type PortfolioPageProps = {
  params: Promise<{
    handle: string;
  }>;
};

export default async function PortfolioPage({
  params,
}: PortfolioPageProps) {
  const { handle: requestedHandle } = await params;
  const handle = requestedHandle.trim().toLowerCase();

  const publishedRecord =
    await getPublishedSiteRecordByHandle(handle);

  if (publishedRecord) {
    const publishedSite = publishedRecord.site;
    const sourceListings =
      await getPublishedSiteSourceListings(
        publishedRecord.userId,
      );

    const homePage =
      publishedSite.pages.find(
        (page) => page.id === publishedSite.homePageId,
      ) ?? publishedSite.pages[0];

    if (!homePage) {
      notFound();
    }

    return (
      <PortfolioSite
        site={renderMackSiteDraft(publishedSite)}
        siteDocument={publishedSite}
        sections={homePage.sections}
        sourceListings={sourceListings}
      />
    );
  }

  // Keep the existing Mack Vali public portfolio online until the
  // first Site Builder publish occurs.
  if (handle !== mackValiPortfolio.handle) {
    notFound();
  }

  const legacyHome =
    mackValiSiteDocument.pages.find(
      (page) => page.id === mackValiSiteDocument.homePageId,
    ) ?? mackValiSiteDocument.pages[0];

  return (
    <PortfolioSite
      site={mackValiPortfolio}
      siteDocument={mackValiSiteDocument}
      sections={legacyHome?.sections}
    />
  );
}
