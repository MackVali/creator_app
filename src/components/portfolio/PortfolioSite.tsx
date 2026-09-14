import Link from "next/link";
import PortfolioVisual from "./PortfolioVisual";
import type {
  PortfolioProject,
  PortfolioSiteData,
} from "@/lib/portfolio/types";

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

function SectionLabel({
  index,
  title,
}: {
  index: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-5">
      <span className="text-[10px] tabular-nums text-white/30">{index}</span>
      <span className="text-[10px] font-medium uppercase tracking-[0.34em] text-white/65">
        {title}
      </span>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

function ProjectLink({
  project,
  handle,
  className = "",
}: {
  project: PortfolioProject;
  handle: string;
  className?: string;
}) {
  const content = (
    <>
      <PortfolioVisual
        kind={project.visual}
        className="aspect-[16/10] w-full transition-transform duration-500 group-hover:scale-[1.015]"
      />
      <div className="flex items-start justify-between gap-4 px-1 pb-1 pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.26em] text-white/35">
            {project.eyebrow}
          </p>
          <h3 className="mt-2 text-xl font-medium tracking-[-0.025em] text-white/92">
            {project.title}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-white/48">
            {project.description}
          </p>
        </div>
        <span className="mt-8 text-lg text-white/35 transition-transform group-hover:translate-x-1">
          <Arrow />
        </span>
      </div>
    </>
  );

  if (!project.detail) {
    return (
      <article className={`group block ${className}`}>
        {content}
      </article>
    );
  }

  return (
    <Link
      href={`/portfolio/${handle}/work/${project.slug}`}
      className={`group block ${className}`}
    >
      {content}
    </Link>
  );
}




function VisualProjectTile({
  project,
}: {
  project: PortfolioProject;
}) {
  return (
    <article className="group relative overflow-hidden border border-white/[0.08] bg-white/[0.01]">
      <PortfolioVisual
        kind={project.visual}
        className="aspect-[16/10] w-full border-0 transition-transform duration-500 group-hover:scale-[1.015]"
      />

      <div className="flex items-end justify-between gap-4 border-t border-white/[0.07] px-4 py-3">
        <div>
          <h3 className="text-sm font-medium tracking-[-0.02em] text-white/78">
            {project.title}
          </h3>
          <p className="mt-1 text-[10px] text-white/28">
            {project.description}
          </p>
        </div>

        <span className="shrink-0 text-sm text-white/25 transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </div>
    </article>
  );
}

function ClothingProjectLink({
  project,
  handle,
}: {
  project: PortfolioProject;
  handle: string;
}) {
  const inner = (
    <div className="group grid min-h-0 overflow-hidden sm:min-h-[250px] border border-white/[0.08] bg-white/[0.012] transition hover:bg-white/[0.022] sm:grid-cols-[0.9fr_1.1fr]">
      <div className="flex flex-col justify-between p-5 sm:p-6">
        <div>
          <p className="text-[9px] uppercase tracking-[0.28em] text-white/28">
            {project.eyebrow}
          </p>

          <h3 className="mt-4 text-3xl tracking-[-0.045em] text-white/90">
            {project.title}
          </h3>

          <p className="mt-4 max-w-xs text-sm leading-6 text-white/42">
            {project.description}
          </p>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-white/[0.07] pt-4">
          <span className="text-[9px] uppercase tracking-[0.24em] text-white/32">
            View brand
          </span>
          <span className="text-white/30 transition-transform group-hover:translate-x-1">
            →
          </span>
        </div>
      </div>

      <PortfolioVisual
        kind={project.visual}
        className="min-h-[190px] border-0 border-t border-white/[0.08] sm:min-h-[210px] sm:min-h-0 sm:border-l sm:border-t-0"
      />
    </div>
  );

  return project.detail ? (
    <Link href={`/portfolio/${handle}/work/${project.slug}`}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default function PortfolioSite({
  site,
}: {
  site: PortfolioSiteData;
}) {
  const featured =
    site.software.find((project) => project.featured) ?? site.software[0];
  const secondarySoftware = site.software.filter(
    (project) => project.slug !== featured.slug,
  );

  return (
    <div className="min-h-screen bg-[#080808] text-[#f4f3ef] selection:bg-white selection:text-black">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link
            href={`/portfolio/${site.handle}`}
            className="text-[11px] font-semibold tracking-[0.36em] text-white/90"
          >
            {site.name}
          </Link>

          <nav className="hidden items-center gap-8 text-[11px] text-white/48 sm:flex">
            <a className="transition hover:text-white" href="#software">
              Software
            </a>
            <a className="transition hover:text-white" href="#clothing">
              Clothing
            </a>
            <a className="transition hover:text-white" href="#visual">
              Visual
            </a>
            <a className="transition hover:text-white" href="#studio">
              Studio
            </a>
            <a className="transition hover:text-white" href="#contact">
              Contact
            </a>
          </nav>

          <details className="relative sm:hidden">
            <summary className="cursor-pointer list-none text-[11px] text-white/60">
              Menu
            </summary>
            <div className="absolute right-0 top-8 flex w-40 flex-col gap-3 border border-white/10 bg-[#0c0c0c] p-4 text-xs text-white/60 shadow-2xl">
              <a href="#software">Software</a>
              <a href="#clothing">Clothing</a>
              <a href="#visual">Visual</a>
              <a href="#studio">Studio</a>
              <a href="#contact">Contact</a>
            </div>
          </details>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-10">
        <section className="grid min-h-[470px] items-stretch border-b border-white/[0.08] lg:grid-cols-[0.92fr_1.08fr]">
          <div className="flex flex-col justify-center py-10 pr-0 sm:py-14 lg:py-16 lg:pr-14">
            <p className="mb-7 text-[10px] uppercase tracking-[0.34em] text-white/32">
              Designer · Developer · Artist
            </p>
            <h1 className="max-w-[680px] text-[clamp(3rem,6vw,5.7rem)] font-normal leading-[0.92] tracking-[-0.06em] text-white/94">
              {site.headline}
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-white/52 sm:mt-7 sm:text-base">
              {site.intro}
            </p>

            <div className="mt-7 grid grid-cols-[1.45fr_0.75fr] gap-2 lg:hidden">
              <PortfolioVisual
                kind="creator"
                className="aspect-[5/4] min-h-0 border-white/[0.07]"
              />

              <div className="grid min-h-0 grid-rows-2 gap-2">
                <PortfolioVisual
                  kind="yump"
                  className="min-h-0 border-white/[0.07]"
                />
                <PortfolioVisual
                  kind="studio"
                  className="min-h-0 border-white/[0.07]"
                />
              </div>
            </div>

            <a
              href="#software"
              className="mt-8 inline-flex w-fit items-center gap-5 text-[10px] font-medium uppercase tracking-[0.25em] text-white/75 sm:mt-10"
            >
              Explore my work <Arrow />
            </a>
          </div>

          <div className="relative hidden min-h-[470px] overflow-hidden border-l border-white/[0.06] lg:block">
            <div className="absolute inset-8 grid grid-cols-[1.45fr_0.72fr] gap-3">
              <PortfolioVisual
                kind="creator"
                className="h-full min-h-0 border-white/[0.07]"
              />

              <div className="grid min-h-0 grid-rows-2 gap-3">
                <PortfolioVisual
                  kind="yump"
                  className="min-h-0 border-white/[0.07]"
                />
                <PortfolioVisual
                  kind="studio"
                  className="min-h-0 border-white/[0.07]"
                />
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between bg-gradient-to-t from-[#080808] via-[#080808]/85 to-transparent px-8 pb-5 pt-14">
              <div>
                <p className="text-[8px] uppercase tracking-[0.3em] text-white/25">
                  Selected work
                </p>
                <p className="mt-1 text-[11px] text-white/48">
                  Software · Clothing · Studio
                </p>
              </div>

              <p className="max-w-[9rem] text-right text-[8px] uppercase leading-4 tracking-[0.25em] text-white/25">
                {site.note}
              </p>
            </div>
          </div>
        </section>

        <section
          id="software"
          className="scroll-mt-20 border-b border-white/[0.08] py-10 sm:py-12"
        >
          <SectionLabel index="01" title="Software" />

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.75fr_0.85fr]">
            <ProjectLink
              project={featured}
              handle={site.handle}
              className="min-w-0"
            />

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-1">
              {secondarySoftware.map((project) => (
                <ProjectLink
                  key={project.slug}
                  project={project}
                  handle={site.handle}
                />
              ))}
            </div>
          </div>
        </section>

        <section
          id="clothing"
          className="scroll-mt-20 border-b border-white/[0.08] py-10 sm:py-12"
        >
          <SectionLabel index="02" title="Clothing" />
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {site.clothing.map((project) => (
              <ClothingProjectLink
                key={project.slug}
                project={project}
                handle={site.handle}
              />
            ))}
          </div>
        </section>

        <section
          id="visual"
          className="scroll-mt-20 border-b border-white/[0.08] py-10 sm:py-12"
        >
          <SectionLabel index="03" title="Visual" />
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {site.visual.map((project) => (
              <VisualProjectTile
                key={project.slug}
                project={project}
              />
            ))}
          </div>
        </section>

        <section
          id="studio"
          className="scroll-mt-20 border-b border-white/[0.08] py-10 sm:py-12"
        >
          <SectionLabel index="04" title="Studio" />

          <Link
            href={`/portfolio/${site.handle}/studio`}
            className="group mt-7 grid overflow-hidden border border-white/[0.08] transition hover:bg-white/[0.015] lg:grid-cols-[0.78fr_1.22fr]"
          >
            <div className="flex flex-col justify-between p-5 sm:p-7">
              <div>
                <p className="text-[9px] uppercase tracking-[0.28em] text-white/28">
                  Workspace / Equipment
                </p>

                <h2 className="mt-4 max-w-sm text-2xl leading-tight tracking-[-0.04em] text-white/88 sm:text-3xl">
                  {site.studio.title}
                </h2>

                <p className="mt-4 max-w-sm text-sm leading-6 text-white/42">
                  {site.studio.description}
                </p>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-white/[0.07] pt-5 text-[11px] text-white/34">
                {site.studio.equipment.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            <PortfolioVisual
              kind={site.studio.visual}
              className="aspect-[16/9] min-h-[250px] border-0 border-t border-white/[0.08] lg:aspect-auto lg:min-h-[360px] lg:border-l lg:border-t-0"
            />
          </Link>
        </section>

        <section
          id="contact"
          className="scroll-mt-20 grid gap-10 py-14 sm:py-16 lg:grid-cols-2"
        >
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-white/30">
              05 · Contact
            </p>
            <h2 className="mt-6 max-w-xl text-4xl tracking-[-0.05em] text-white/90 sm:text-6xl">
              Build something worth showing.
            </h2>
          </div>

          <div className="flex items-end lg:justify-end">
            <p className="max-w-sm text-sm leading-7 text-white/45">
              Contact links and real availability can live here once the shell
              is populated with final portfolio content.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-7 text-[9px] uppercase tracking-[0.28em] text-white/25 sm:px-8 lg:px-10">
          <span>{site.name}</span>
          <span>Portfolio · 2026</span>
        </div>
      </footer>
    </div>
  );
}
