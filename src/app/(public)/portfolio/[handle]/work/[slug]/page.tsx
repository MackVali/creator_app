import { notFound } from "next/navigation";
import PortfolioProjectPage from "@/components/portfolio/PortfolioProjectPage";
import { mackValiPortfolio } from "@/lib/portfolio/mackValiPortfolio";

type ProjectPageProps = {
  params: Promise<{
    handle: string;
    slug: string;
  }>;
};

export default async function ProjectPage({
  params,
}: ProjectPageProps) {
  const { handle, slug } = await params;

  if (handle.trim().toLowerCase() !== mackValiPortfolio.handle) {
    notFound();
  }

  const projects = [
    ...mackValiPortfolio.software,
    ...mackValiPortfolio.clothing,
    ...mackValiPortfolio.visual,
  ];

  const project = projects.find(
    (item) => item.slug === slug && Boolean(item.detail),
  );

  if (!project) {
    notFound();
  }

  return (
    <PortfolioProjectPage
      site={mackValiPortfolio}
      project={project}
    />
  );
}
