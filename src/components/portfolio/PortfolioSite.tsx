"use client";

/* eslint-disable @next/next/no-img-element -- Source listing images can be user-provided remote URLs. */

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { resolveListingImage } from "@/components/profile/detailSheetUtils";
import PortfolioVisual from "@/components/portfolio/PortfolioVisual";
import { normalizeSourceListingCardProps } from "@/components/source/SourceListingCard";
import type {
  PortfolioProject,
  PortfolioSiteData,
} from "@/lib/portfolio/types";
import type { SiteSection } from "@/lib/site-builder/types";
import type { SourceListing } from "@/types/source";

type PortfolioSiteProps = {
  site: PortfolioSiteData;
  sections?: SiteSection[];
  sourceListings?: SourceListing[];
  editorPreview?: boolean;
};

const creatorLogo = "/images/creator-logo.png";
const scheduleImage =
  "/images/portfolio/mackvali/software/creator-schedule-desktop.png";
const commandMobile =
  "/images/portfolio/mackvali/software/creator-mobile-command.webp";
const ironPrairieImage =
  "/images/portfolio/mackvali/software/iron-prairie-site.webp";
const heroCover = "/images/portfolio/mackvali/hero-devices.png";

function PillLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 w-fit items-center gap-4 rounded-full border border-white/[0.18] px-4 text-[8px] font-medium uppercase tracking-[0.18em] text-white/72 transition hover:border-white/35 hover:text-white"
    >
      {children}
      <span className="text-xs">→</span>
    </Link>
  );
}

function SectionRule({
  number,
  label,
}: {
  number: string;
  label: string;
}) {
  return (
    <div className="flex h-[30px] items-center gap-4">
      <span className="text-[8px] text-white/25">{number}</span>
      <span className="text-[8px] font-medium uppercase tracking-[0.3em] text-white/58">
        {label}
      </span>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

function HeroStage() {
  return (
    <div className="absolute inset-0 hidden overflow-hidden bg-black lg:block">
      <div className="absolute inset-y-0 left-[31%] right-[2%]">
        <Image
          src={heroCover}
          alt=""
          fill
          priority
          sizes="67vw"
          className="object-contain object-right"
        />
      </div>
    </div>
  );
}

function CreatorCard({
  project,
  handle,
}: {
  project: PortfolioProject;
  handle: string;
}) {
  return (
    <article className="grid overflow-hidden lg:h-[165px] lg:grid-cols-[43%_57%]">
      <div className="flex min-w-0 flex-col justify-between px-5 py-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="relative h-[44px] w-[44px] shrink-0 overflow-hidden rounded-[4px] border border-white/[0.1] bg-white/[0.018]">
              <Image
                src={creatorLogo}
                alt=""
                fill
                sizes="44px"
                className="object-contain p-2"
              />
            </div>

            <div className="min-w-0">
              <h3 className="text-[18px] tracking-[-0.035em] text-white/92">
                CREATOR
              </h3>
              <p className="text-[10px] text-white/52">
                Plan. Create. Execute. Grow.
              </p>
            </div>
          </div>

          <p className="mt-3 max-w-[330px] text-[8.5px] leading-[1.55] text-white/40">
            A focused system for planning, scheduling, goals, health, money,
            focus, creativity, and everyday execution — all in one place.
          </p>
        </div>

        <PillLink href={`/portfolio/${handle}/work/${project.slug}`}>
          View project
        </PillLink>
      </div>

      <div className="grid min-w-0 grid-cols-[1fr_62px] items-center gap-3 px-3 py-3">
        <div className="relative h-full min-h-[126px] overflow-hidden border border-white/[0.08] bg-black">
          <Image
            src={scheduleImage}
            alt="CREATOR schedule"
            fill
            sizes="27vw"
            className="object-cover"
          />
        </div>

        <div className="space-y-[2px] text-[8px] leading-[1.35] text-white/34">
          <p>Ideas</p>
          <p>Plan</p>
          <p>Schedule</p>
          <p>Create</p>
          <p>Analyze</p>
          <p>Grow</p>
        </div>
      </div>
    </article>
  );
}

function IronPrairieCard({
  project,
  handle,
}: {
  project: PortfolioProject;
  handle: string;
}) {
  return (
    <article className="grid overflow-hidden lg:h-[165px] lg:grid-cols-[44%_56%]">
      <div className="flex min-w-0 flex-col justify-between px-5 py-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[4px] bg-[#f0c400] text-[9px] font-black text-black">
              IPL
            </div>

            <div className="min-w-0">
              <h3 className="text-[18px] tracking-[-0.035em] text-white/92">
                Iron Prairie Logistics
              </h3>
              <p className="text-[10px] text-white/52">
                Real work. Real results.
              </p>
            </div>
          </div>

          <p className="mt-3 max-w-[330px] text-[8.5px] leading-[1.55] text-white/40">
            A customer-facing service website and internal operations software
            built around a real local moving, hauling, and handyman business.
          </p>
        </div>

        <PillLink href={`/portfolio/${handle}/work/${project.slug}`}>
          View project
        </PillLink>
      </div>

      <div className="relative m-3 ml-0 min-h-[126px] overflow-hidden border border-white/[0.08] bg-black">
        <Image
          src={ironPrairieImage}
          alt="Iron Prairie Logistics website"
          fill
          sizes="28vw"
          className="object-cover object-center"
        />
      </div>
    </article>
  );
}

function ClothingCard({
  project,
  handle,
}: {
  project: PortfolioProject;
  handle: string;
}) {
  const body = (
    <div className="grid h-full grid-cols-[41%_59%]">
      <div className="flex min-w-0 flex-col justify-between p-4">
        <div>
          <h3 className="text-[18px] font-medium tracking-[-0.04em] text-white/92">
            {project.title}
          </h3>

          <p className="mt-3 max-w-[150px] text-[8.5px] leading-[1.55] text-white/40">
            {project.description}
          </p>
        </div>

        <span className="inline-flex h-7 w-fit items-center gap-3 rounded-full border border-white/[0.15] px-3 text-[7px] uppercase tracking-[0.14em] text-white/62">
          View {project.title}
          <span>→</span>
        </span>
      </div>

      <PortfolioVisual
        kind={project.visual}
        className="h-full min-h-0 border-0 border-l border-white/[0.07]"
      />
    </div>
  );

  if (!project.detail) {
    return <article className="h-full">{body}</article>;
  }

  return (
    <Link
      href={`/portfolio/${handle}/work/${project.slug}`}
      className="block h-full transition hover:bg-white/[0.012]"
    >
      {body}
    </Link>
  );
}

type MackSectionKind =
  | "hero"
  | "software"
  | "clothing"
  | "visual"
  | "studio"
  | "contact"
  | "products"
  | "content"
  | "services"
  | "gallery"
  | "media"
  | "cta";

const defaultMackSections: Array<Pick<SiteSection, "id" | "label" | "type" | "visible" | "source" | "content">> =
  [
    {
      id: "home-hero",
      label: "Hero",
      type: "hero",
      visible: true,
      source: { kind: "manual" },
      content: {},
    },
    {
      id: "home-software",
      label: "Software",
      type: "projects",
      visible: true,
      source: { kind: "creator", entity: "project", mode: "selected" },
      content: { templateKind: "software" },
    },
    {
      id: "home-clothing",
      label: "Clothing",
      type: "projects",
      visible: true,
      source: { kind: "manual" },
      content: { templateKind: "clothing" },
    },
    {
      id: "home-visual",
      label: "Visual",
      type: "gallery",
      visible: true,
      source: { kind: "manual" },
      content: { templateKind: "visual" },
    },
    {
      id: "home-studio",
      label: "Studio",
      type: "media",
      visible: true,
      source: { kind: "manual" },
      content: { templateKind: "studio" },
    },
    {
      id: "home-contact",
      label: "Contact",
      type: "contact",
      visible: true,
      source: { kind: "manual" },
      content: {},
    },
  ];

function getTemplateKind(section: SiteSection): MackSectionKind {
  const templateKind = section.content.templateKind;
  if (
    templateKind === "software" ||
    templateKind === "clothing" ||
    templateKind === "visual" ||
    templateKind === "studio"
  ) {
    return templateKind;
  }

  if (section.type === "hero") return "hero";
  if (section.type === "products") return "products";
  if (section.type === "services") return "services";
  if (section.type === "gallery") return "gallery";
  if (section.type === "media") return "media";
  if (section.type === "cta") return "cta";
  if (section.type === "content") return "content";
  if (section.type === "contact") return "contact";

  return section.label.trim().toLowerCase() === "software"
    ? "software"
    : "content";
}

function isLowerWorkKind(kind: MackSectionKind) {
  return kind === "clothing" || kind === "visual" || kind === "studio";
}

function readContentString(
  section: SiteSection | undefined,
  key: string,
  fallback = "",
) {
  const value = section?.content[key];
  return typeof value === "string" ? value : fallback;
}

function sectionAlignmentClass(section: SiteSection | undefined) {
  return section?.layout?.alignment === "center"
    ? "mx-auto text-center"
    : "";
}

function sectionWidthClass(section: SiteSection | undefined) {
  if (section?.layout?.width === "narrow") return "max-w-[520px]";
  if (section?.layout?.width === "wide") return "max-w-[900px]";
  return "max-w-[620px]";
}

function sectionPaddingClass(section: SiteSection | undefined) {
  if (section?.layout?.spacing === "compact") return "py-5";
  if (section?.layout?.spacing === "spacious") return "py-12";
  return "py-8";
}

function sectionBackgroundClass(section: SiteSection | undefined) {
  if (section?.style?.background === "plain") return "bg-[#0c0c0c]";
  if (
    section?.style?.background === "dark" ||
    section?.style?.background === "contrast"
  ) {
    return "bg-black";
  }
  if (section?.style?.background === "muted" || section?.style?.muted) {
    return "bg-white/[0.018]";
  }
  return "";
}

function HeroSection({
  site,
  section,
}: {
  site: PortfolioSiteData;
  section?: SiteSection;
}) {
  const eyebrow = readContentString(
    section,
    "eyebrow",
    "Design · Build · Create",
  );
  const ctaLabel = readContentString(
    section,
    "primaryCtaLabel",
    "Explore my work",
  );
  const ctaHref = readContentString(section, "primaryCtaHref", "#software");
  const centered =
    section?.layout?.alignment === "center" ||
    section?.layout?.variant === "centered";

  return (
    <section
      className={`relative overflow-hidden border-b border-white/[0.08] lg:h-[410px] ${sectionBackgroundClass(
        section,
      )}`}
    >
      <div className="relative mx-auto h-full max-w-[1600px]">
        {centered ? null : <HeroStage />}

        <div className="relative z-10 flex min-h-[360px] flex-col justify-center px-5 py-10 sm:px-8 lg:h-full lg:min-h-0 lg:w-[31%] lg:px-[58px] lg:py-0">
          <p className="text-[7px] font-medium uppercase tracking-[0.38em] text-white/38">
            {eyebrow}
          </p>

          <h1
            className={`mt-4 whitespace-pre-line text-[clamp(3rem,3.8vw,4rem)] leading-[0.93] tracking-[-0.065em] text-white/95 ${
              centered ? "mx-auto max-w-[760px] text-center" : ""
            }`}
          >
            {site.headline}
          </h1>

          <p
            className={`mt-5 max-w-[355px] text-[11px] leading-[1.55] text-white/53 ${
              centered ? "mx-auto text-center" : ""
            }`}
          >
            {site.intro}
          </p>

          <a
            href={ctaHref || "#software"}
            className={`mt-5 inline-flex h-8 w-fit items-center gap-4 rounded-full border border-white/[0.18] px-4 text-[7px] uppercase tracking-[0.2em] text-white/70 transition hover:border-white/35 hover:text-white ${
              centered ? "mx-auto" : ""
            }`}
          >
            {ctaLabel}
            <span>→</span>
          </a>
        </div>

        <div className={`px-5 pb-7 ${centered ? "" : "lg:hidden"}`}>
          <div className="relative aspect-[16/9] overflow-hidden border border-white/[0.08] bg-black">
            <Image
              src={scheduleImage}
              alt="CREATOR schedule"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>

          <div className="mt-3 grid grid-cols-[0.58fr_1.42fr] gap-3">
            <div className="relative aspect-[568/1220] overflow-hidden border border-white/[0.08] bg-black">
              <Image
                src={commandMobile}
                alt="CREATOR mobile dashboard"
                fill
                sizes="35vw"
                className="object-cover"
              />
            </div>

            <div className="relative min-h-[180px] overflow-hidden border border-white/[0.08] bg-black">
              <Image
                src={ironPrairieImage}
                alt="Iron Prairie Logistics"
                fill
                sizes="65vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SoftwareSection({ site }: { site: PortfolioSiteData }) {
  const creator =
    site.software.find((project) => project.slug === "creator") ??
    site.software[0];

  const ironPrairie =
    site.software.find((project) => project.slug === "small-business-sites") ??
    site.software[1];

  return (
    <section
      id="software"
      className="scroll-mt-16 border-b border-white/[0.08]"
    >
      <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-[58px]">
        <SectionRule number="01" label="Software" />

        <div className="grid overflow-hidden border-x border-t border-white/[0.08] lg:h-[165px] lg:grid-cols-2">
          <div className="overflow-hidden border-b border-white/[0.08] lg:border-b-0 lg:border-r">
            <CreatorCard project={creator} handle={site.handle} />
          </div>

          <div className="overflow-hidden">
            <IronPrairieCard project={ironPrairie} handle={site.handle} />
          </div>
        </div>
      </div>
    </section>
  );
}

function LowerWorkSection({
  site,
  kinds,
}: {
  site: PortfolioSiteData;
  kinds: MackSectionKind[];
}) {
  const visibleKinds = kinds.filter(isLowerWorkKind);
  if (visibleKinds.length === 0) return null;

  return (
    <section className="border-b border-white/[0.08]">
      <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-[58px]">
        <div className="grid lg:h-[164px] lg:grid-cols-[1.28fr_1.28fr_0.82fr_0.82fr]">
          {visibleKinds.includes("clothing") ? (
            <>
              <div
                id="clothing"
                className="overflow-hidden border-b border-white/[0.08] lg:border-b-0 lg:border-r"
              >
                <div className="h-[28px] px-0">
                  <SectionRule number="03" label="Clothing" />
                </div>

                <div className="h-[136px]">
                  {site.clothing[0] && (
                    <ClothingCard
                      project={site.clothing[0]}
                      handle={site.handle}
                    />
                  )}
                </div>
              </div>

              <div className="overflow-hidden border-b border-white/[0.08] lg:border-b-0 lg:border-r">
                <div className="h-[28px] border-b border-transparent" />

                <div className="h-[136px]">
                  {site.clothing[1] && (
                    <ClothingCard
                      project={site.clothing[1]}
                      handle={site.handle}
                    />
                  )}
                </div>
              </div>
            </>
          ) : null}

          {visibleKinds.includes("visual") ? (
            <div
              id="visual"
              className="overflow-hidden border-b border-white/[0.08] lg:border-b-0 lg:border-r"
            >
              <div className="h-[28px]">
                <SectionRule number="04" label="Visual" />
              </div>

              <div className="grid h-[136px] grid-cols-[48%_52%]">
                <div className="flex min-w-0 flex-col justify-between p-4">
                  <div>
                    <h3 className="text-[17px] tracking-[-0.04em] text-white/90">
                      Visual Work
                    </h3>
                    <p className="mt-2 text-[8px] leading-[1.5] text-white/38">
                      Designs, experiments, graphics, and creative exploration.
                    </p>
                  </div>

                  <span className="text-[7px] uppercase tracking-[0.14em] text-white/55">
                    View work →
                  </span>
                </div>

                <PortfolioVisual
                  kind={site.visual[0]?.visual ?? "visual-one"}
                  className="h-full min-h-0 border-0 border-l border-white/[0.07]"
                />
              </div>
            </div>
          ) : null}

          {visibleKinds.includes("studio") ? (
            <div id="studio" className="overflow-hidden">
              <div className="h-[28px]">
                <SectionRule number="05" label="Studio" />
              </div>

              <Link
                href={`/portfolio/${site.handle}/studio`}
                className="grid h-[136px] grid-cols-[45%_55%] transition hover:bg-white/[0.012]"
              >
                <div className="flex min-w-0 flex-col justify-between p-4">
                  <div>
                    <h3 className="text-[17px] leading-[1.02] tracking-[-0.04em] text-white/90">
                      The Creative
                      <br />
                      Setup
                    </h3>

                    <p className="mt-2 text-[8px] leading-[1.5] text-white/38">
                      Tools, process, and environment behind the work.
                    </p>
                  </div>

                  <span className="text-[7px] uppercase tracking-[0.14em] text-white/55">
                    View studio →
                  </span>
                </div>

                <PortfolioVisual
                  kind={site.studio.visual}
                  className="h-full min-h-0 border-0 border-l border-white/[0.07]"
                />
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ProductsSection({
  section,
  listings,
  editorPreview,
}: {
  section: SiteSection;
  listings: SourceListing[];
  editorPreview: boolean;
}) {
  const selectedIds =
    section.source.kind === "source" && section.source.mode === "selected"
      ? section.source.listingIds ?? []
      : [];
  const listingType =
    section.source.kind === "source" ? section.source.listingType : "product";
  const products = listings.filter(
    (listing) =>
      listing.type === listingType &&
      (section.source.kind !== "source" ||
        section.source.mode !== "selected" ||
        selectedIds.includes(listing.id)),
  );
  const heading = readContentString(section, "heading", section.label);
  const intro = readContentString(section, "intro");
  const showPrice = section.style?.showPrice !== false;
  const showDescription = section.style?.showDescription !== false;
  const columns = section.layout?.columns ?? 3;
  const variant = section.layout?.variant ?? "grid";
  const gridClass =
    variant === "row"
      ? "grid gap-3 border-x border-t border-white/[0.08] p-3"
      : `grid gap-3 border-x border-t border-white/[0.08] p-3 sm:grid-cols-2 ${
          columns === 4
            ? "lg:grid-cols-4"
            : columns === 2
            ? "lg:grid-cols-2"
            : "lg:grid-cols-3"
        }`;

  if (products.length === 0 && !editorPreview) return null;

  return (
    <section
      className={`border-b border-white/[0.08] ${sectionBackgroundClass(
        section,
      )}`}
    >
      <div className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8 lg:px-[58px]">
        <SectionRule number="02" label={heading} />
        {intro ? (
          <p className="mb-4 max-w-[620px] text-[11px] leading-[1.6] text-white/45">
            {intro}
          </p>
        ) : null}

        {products.length > 0 ? (
          <div className={gridClass}>
            {products.map((product) => {
              const card = normalizeSourceListingCardProps(product);
              const image = resolveListingImage(product) ?? card.image;

              return (
                <article
                  key={product.id}
                  className="grid min-h-[132px] overflow-hidden border border-white/[0.08] bg-white/[0.018] sm:grid-cols-[42%_58%]"
                >
                  <div className="relative min-h-[128px] bg-black">
                    {image ? (
                      <img
                        src={image}
                        alt={product.title}
                        className="h-full min-h-[128px] w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full min-h-[128px] items-center justify-center text-[8px] uppercase tracking-[0.24em] text-white/28">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-col justify-between p-4">
                    <div>
                      {showPrice ? (
                        <p className="text-[7px] font-medium uppercase tracking-[0.25em] text-white/35">
                        {card.priceLabel}
                        </p>
                      ) : null}
                      <h3 className="mt-2 text-[18px] leading-tight tracking-[-0.04em] text-white/92">
                        {product.title}
                      </h3>
                      {showDescription && product.description ? (
                        <p className="mt-2 line-clamp-3 text-[8.5px] leading-[1.55] text-white/42">
                          {product.description}
                        </p>
                      ) : null}
                    </div>

                    <span className="mt-4 text-[7px] uppercase tracking-[0.14em] text-white/55">
                      Source {listingType}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-white/[0.12] px-4 py-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/35">
            Select Source {listingType} listings to preview this section
          </div>
        )}
      </div>
    </section>
  );
}

function SimpleManualSection({ section }: { section: SiteSection }) {
  const heading = readContentString(section, "heading", section.label);
  const body = readContentString(section, "body");

  return (
    <section
      className={`border-b border-white/[0.08] ${sectionBackgroundClass(
        section,
      )}`}
    >
      <div
        className={`mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-[58px] ${sectionPaddingClass(
          section,
        )}`}
      >
        <SectionRule number="02" label={section.label} />
        <div
          className={`${sectionWidthClass(section)} py-5 ${sectionAlignmentClass(
            section,
          )}`}
        >
          <h2 className="text-[28px] leading-none tracking-[-0.05em] text-white/92">
            {heading}
          </h2>
          {body ? (
            <p className="mt-3 text-[11px] leading-[1.65] text-white/48">
              {body}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function GallerySection({ section }: { section: SiteSection }) {
  const heading = readContentString(section, "heading", section.label);
  const columns = section.layout?.columns ?? 3;

  return (
    <section
      className={`border-b border-white/[0.08] ${sectionBackgroundClass(
        section,
      )}`}
    >
      <div className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8 lg:px-[58px]">
        <SectionRule number="02" label={heading} />
        <div
          className={`grid gap-3 border-x border-t border-white/[0.08] p-3 ${
            columns === 4
              ? "lg:grid-cols-4"
              : columns === 2
              ? "lg:grid-cols-2"
              : "lg:grid-cols-3"
          }`}
        >
          <div className="col-span-full border border-dashed border-white/[0.12] px-4 py-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/35">
            Add media in a future media library slice
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaSection({ section }: { section: SiteSection }) {
  const heading = readContentString(section, "heading", section.label);
  const body = readContentString(section, "body");
  const label = readContentString(section, "buttonLabel", "Get started");
  const href = readContentString(section, "buttonHref", "#contact");
  const centered = section.layout?.alignment === "center";

  return (
    <section
      className={`border-b border-white/[0.08] ${sectionBackgroundClass(
        section,
      )}`}
    >
      <div
        className={`mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-[58px] ${sectionPaddingClass(
          section,
        )}`}
      >
        <div
          className={`max-w-[680px] ${centered ? "mx-auto text-center" : ""}`}
        >
          <h2 className="text-[32px] leading-none tracking-[-0.055em] text-white/92">
            {heading}
          </h2>
          {body ? (
            <p className="mt-3 text-[11px] leading-[1.65] text-white/48">
              {body}
            </p>
          ) : null}
          <a
            href={href || "#contact"}
            className={`mt-5 inline-flex h-8 w-fit items-center gap-4 rounded-full border border-white/[0.18] px-4 text-[7px] uppercase tracking-[0.2em] text-white/70 transition hover:border-white/35 hover:text-white ${
              centered ? "mx-auto" : ""
            }`}
          >
            {label}
            <span>→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function ContactSection({
  site,
  section,
}: {
  site: PortfolioSiteData;
  section?: SiteSection;
}) {
  const heading = readContentString(
    section,
    "heading",
    "Let’s build something useful.",
  );
  const body = readContentString(
    section,
    "body",
    "Open to creative opportunities, collaborations, and interesting projects.",
  );
  const label = readContentString(section, "buttonLabel", "Get in touch");
  const href = readContentString(section, "buttonHref", "#contact");

  return (
    <section id="contact">
      <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-[58px]">
        <div className="grid min-h-[48px] items-center gap-4 border-b border-white/[0.08] lg:grid-cols-[210px_1fr_auto]">
          <SectionRule number="06" label="Contact" />

          <div className="flex items-baseline gap-7">
            <p className="text-[13px] tracking-[-0.02em] text-white/80">
              {heading}
            </p>

            <p className="hidden text-[8px] text-white/32 xl:block">
              {body}
            </p>
          </div>

          <a
            href={href || "#contact"}
            className="inline-flex h-7 w-fit items-center gap-4 rounded-full border border-white/[0.17] px-4 text-[7px] uppercase tracking-[0.17em] text-white/65"
          >
            {label}
            <span>→</span>
          </a>
        </div>

        <footer className="flex h-[32px] items-center justify-between">
          <p className="text-[8px] font-semibold tracking-[0.42em] text-white/66">
            {site.name}
          </p>

          <p className="text-[6px] uppercase tracking-[0.33em] text-white/17">
            Better tools · Brighter days.
          </p>
        </footer>
      </div>
    </section>
  );
}

function MackHomeSections({
  site,
  sections,
  sourceListings,
  editorPreview,
}: {
  site: PortfolioSiteData;
  sections: SiteSection[];
  sourceListings: SourceListing[];
  editorPreview: boolean;
}) {
  const visibleSections = sections.filter((section) => section.visible);
  const nodes: ReactNode[] = [];

  for (let index = 0; index < visibleSections.length; index += 1) {
    const section = visibleSections[index];
    const kind = getTemplateKind(section);

    if (isLowerWorkKind(kind)) {
      const lowerKinds: MackSectionKind[] = [kind];

      while (
        visibleSections[index + 1] &&
        isLowerWorkKind(getTemplateKind(visibleSections[index + 1]))
      ) {
        index += 1;
        lowerKinds.push(getTemplateKind(visibleSections[index]));
      }

      nodes.push(
        <LowerWorkSection
          key={`${section.id}-lower-work`}
          site={site}
          kinds={lowerKinds}
        />,
      );
      continue;
    }

    if (kind === "hero") {
      nodes.push(<HeroSection key={section.id} site={site} section={section} />);
    } else if (kind === "software") {
      nodes.push(<SoftwareSection key={section.id} site={site} />);
    } else if (kind === "products") {
      nodes.push(
        <ProductsSection
          key={section.id}
          section={section}
          listings={sourceListings}
          editorPreview={editorPreview}
        />,
      );
    } else if (kind === "services") {
      nodes.push(
        <ProductsSection
          key={section.id}
          section={section}
          listings={sourceListings}
          editorPreview={editorPreview}
        />,
      );
    } else if (kind === "gallery") {
      nodes.push(<GallerySection key={section.id} section={section} />);
    } else if (kind === "cta") {
      nodes.push(<CtaSection key={section.id} section={section} />);
    } else if (kind === "contact") {
      nodes.push(<ContactSection key={section.id} site={site} section={section} />);
    } else {
      nodes.push(<SimpleManualSection key={section.id} section={section} />);
    }
  }

  return <>{nodes}</>;
}

export default function PortfolioSite({
  site,
  sections,
  sourceListings = [],
  editorPreview = false,
}: PortfolioSiteProps) {
  const renderSections = (sections ?? defaultMackSections) as SiteSection[];

  return (
    <div className="min-h-screen bg-[#080808] text-[#f4f3ef]">
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#080808]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[48px] max-w-[1600px] items-center justify-between px-5 sm:px-8 lg:px-[58px]">
          <Link
            href={`/portfolio/${site.handle}`}
            className="text-[10px] font-semibold tracking-[0.43em] text-white/88"
          >
            {site.name}
          </Link>

          <nav className="hidden items-center gap-9 text-[9px] text-white/48 md:flex">
            <a href="#work" className="hover:text-white/82">
              Work
            </a>
            <a href="#software" className="hover:text-white/82">
              Software
            </a>
            <a href="#clothing" className="hover:text-white/82">
              Clothing
            </a>
            <a href="#visual" className="hover:text-white/82">
              Visual
            </a>
            <a href="#studio" className="hover:text-white/82">
              Studio
            </a>
            <a href="#contact" className="hover:text-white/82">
              Contact
            </a>
          </nav>

          <p className="hidden text-[8px] text-white/40 xl:block">
            • &nbsp; Ideas. Products. A Quieter Internet.
          </p>
        </div>
      </header>

      <main id="work">
        <MackHomeSections
          site={site}
          sections={renderSections}
          sourceListings={sourceListings}
          editorPreview={editorPreview}
        />
      </main>
    </div>
  );
}
