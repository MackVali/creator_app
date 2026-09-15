import Image from "next/image";
import Link from "next/link";
import PortfolioVisual from "./PortfolioVisual";
import type {
  PortfolioProject,
  PortfolioSiteData,
} from "@/lib/portfolio/types";


function ProjectEvidence({
  slug,
}: {
  slug: string;
}) {
  if (slug === "creator") {
    return (
      <section className="border-t border-white/[0.08] py-10 sm:py-14">
        <div className="mb-7 flex items-center gap-5">
          <span className="text-[9px] uppercase tracking-[0.3em] text-white/28">
            Selected product surfaces
          </span>
          <span className="h-px flex-1 bg-white/[0.07]" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.45fr_0.55fr]">
          <div className="relative aspect-[16/9] overflow-hidden border border-white/[0.08] bg-[#0a0a0a]">
            <Image
              src="/images/portfolio/mackvali/software/creator-schedule-desktop.png"
              alt="CREATOR desktop schedule"
              fill
              sizes="(max-width: 1024px) 100vw, 70vw"
              className="object-cover"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="relative aspect-[9/16] overflow-hidden border border-white/[0.08] bg-[#0a0a0a]">
              <Image
                src="/images/portfolio/mackvali/software/creator-mobile-command.webp"
                alt="CREATOR mobile dashboard"
                fill
                sizes="(max-width: 1024px) 50vw, 25vw"
                className="object-cover"
              />
            </div>

            <div className="relative aspect-[9/16] overflow-hidden border border-white/[0.08] bg-[#0a0a0a]">
              <Image
                src="/images/portfolio/mackvali/software/creator-nutrition.webp"
                alt="CREATOR nutrition system"
                fill
                sizes="(max-width: 1024px) 50vw, 25vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 border-t border-white/[0.07] pt-7 sm:grid-cols-3">
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] text-white/25">
              Planning
            </p>
            <p className="mt-3 text-sm leading-6 text-white/48">
              Scheduling, goals, projects, routines, and priorities live inside
              one connected system.
            </p>
          </div>

          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] text-white/25">
              Daily execution
            </p>
            <p className="mt-3 text-sm leading-6 text-white/48">
              The mobile experience keeps the same system usable while moving
              through the day.
            </p>
          </div>

          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] text-white/25">
              Personal tools
            </p>
            <p className="mt-3 text-sm leading-6 text-white/48">
              Nutrition, health, money, focus, and other modules operate as
              parts of the larger CREATOR system.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (slug === "small-business-sites") {
    return (
      <section className="border-t border-white/[0.08] py-10 sm:py-14">
        <div className="mb-7 flex items-center gap-5">
          <span className="text-[9px] uppercase tracking-[0.3em] text-white/28">
            Website + operations
          </span>
          <span className="h-px flex-1 bg-white/[0.07]" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.55fr_0.45fr]">
          <div className="relative aspect-[16/9] overflow-hidden border border-white/[0.08] bg-[#0a0a0a]">
            <Image
              src="/images/portfolio/mackvali/software/iron-prairie-site.webp"
              alt="Iron Prairie Logistics website"
              fill
              sizes="(max-width: 1024px) 100vw, 72vw"
              className="object-cover"
            />
          </div>

          <div className="relative min-h-[420px] overflow-hidden border border-white/[0.08] bg-[#0a0a0a]">
            <Image
              src="/images/portfolio/mackvali/software/iron-prairie-ops-redacted.webp"
              alt="Iron Prairie internal operations application"
              fill
              sizes="(max-width: 1024px) 100vw, 25vw"
              className="object-cover"
            />
          </div>
        </div>

        <div className="mt-8 grid gap-6 border-t border-white/[0.07] pt-7 sm:grid-cols-2">
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] text-white/25">
              Customer facing
            </p>
            <p className="mt-3 text-sm leading-6 text-white/48">
              A focused marketing site built around services, trust, and
              generating real customer requests.
            </p>
          </div>

          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] text-white/25">
              Internal operations
            </p>
            <p className="mt-3 text-sm leading-6 text-white/48">
              The same business also has internal tooling for handling requests,
              jobs, scheduling, and day-to-day operations.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return null;
}

export default function PortfolioProjectPage({
  site,
  project,
}: {
  site: PortfolioSiteData;
  project: PortfolioProject;
}) {
  if (!project.detail) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#080808] text-[#f4f3ef] selection:bg-white selection:text-black">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 sm:px-8">
          <Link
            href={`/portfolio/${site.handle}`}
            className="text-[11px] font-semibold tracking-[0.36em] text-white/90"
          >
            {site.name}
          </Link>

          <Link
            href={`/portfolio/${site.handle}`}
            className="text-[11px] text-white/45 transition hover:text-white"
          >
            ← All work
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <section className="grid gap-10 border-b border-white/[0.08] py-14 sm:py-20 lg:grid-cols-[1fr_0.42fr]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-white/32">
              {project.eyebrow}
            </p>

            <h1 className="mt-5 text-[clamp(3.5rem,9vw,8rem)] leading-[0.9] tracking-[-0.07em] text-white/95">
              {project.title}
            </h1>

            <p className="mt-7 max-w-2xl text-xl leading-8 tracking-[-0.02em] text-white/45">
              {project.description}
            </p>
          </div>

          <div className="flex flex-col justify-end border-l-0 border-white/[0.08] text-xs text-white/40 lg:border-l lg:pl-10">
            {project.year ? (
              <p className="border-t border-white/[0.07] py-4">
                <span className="mr-8 text-white/20">Year</span>
                {project.year}
              </p>
            ) : null}

            {project.role ? (
              <p className="border-t border-white/[0.07] py-4">
                <span className="mr-8 text-white/20">Role</span>
                {project.role}
              </p>
            ) : null}
          </div>
        </section>

        {project.imageSrc ? (
          <div className="relative mt-8 aspect-[16/8] min-h-[330px] w-full overflow-hidden border border-white/[0.08] bg-[#0d0d0d] sm:mt-12">
            <Image
              src={project.imageSrc}
              alt={project.title}
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
        ) : (
          <PortfolioVisual
            kind={project.visual}
            className="mt-8 aspect-[16/8] min-h-[330px] w-full sm:mt-12"
          />
        )}

        <section className="grid gap-10 border-b border-white/[0.08] py-14 sm:py-20 lg:grid-cols-[0.35fr_1fr]">
          <p className="text-[10px] uppercase tracking-[0.32em] text-white/28">
            Introduction
          </p>
          <p className="max-w-3xl text-2xl leading-[1.45] tracking-[-0.03em] text-white/72 sm:text-3xl">
            {project.detail.intro}
          </p>
        </section>

        {project.detail.sections.map((section) => (
          <section
            key={`${project.slug}-${section.eyebrow}`}
            className="grid gap-10 border-b border-white/[0.08] py-14 sm:py-20 lg:grid-cols-[0.35fr_1fr]"
          >
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/28">
              {section.eyebrow}
            </p>

            <div>
              <h2 className="max-w-3xl text-3xl tracking-[-0.04em] text-white/88 sm:text-5xl">
                {section.title}
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/45">
                {section.body}
              </p>

              {section.visual ? (
                <PortfolioVisual
                  kind={section.visual}
                  className="mt-10 aspect-[16/9] min-h-[300px] w-full"
                />
              ) : null}
            </div>
          </section>
        ))}

        {project.stack?.length ? (
          <section className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[0.35fr_1fr]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/28">
              Stack
            </p>

            <div className="flex flex-wrap gap-2">
              {project.stack.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/[0.09] px-4 py-2 text-xs text-white/45"
                >
                  {item}
                </span>
              ))}
            </div>
          </section>
        ) : null}
        <ProjectEvidence slug={project.slug} />

      </main>

      <footer className="border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-[1180px] justify-between px-5 py-7 text-[9px] uppercase tracking-[0.28em] text-white/25 sm:px-8">
          <span>{site.name}</span>
          <Link href={`/portfolio/${site.handle}`}>Back to portfolio →</Link>
        </div>
      </footer>
    </div>
  );
}
