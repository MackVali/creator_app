import { notFound } from "next/navigation";
import PortfolioSite from "@/components/portfolio/PortfolioSite";
import { mackValiPortfolio } from "@/lib/portfolio/mackValiPortfolio";

type PortfolioPageProps = {
  params: Promise<{
    handle: string;
  }>;
};

export default async function PortfolioPage({
  params,
}: PortfolioPageProps) {
  const { handle } = await params;

  if (handle.trim().toLowerCase() !== mackValiPortfolio.handle) {
    notFound();
  }

  return <PortfolioSite site={mackValiPortfolio} />;
}
