"use client";

import { AnimatePresence, Reorder, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  GripVertical,
  PlayCircle,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { emitProfileModuleEvent } from "@/lib/analytics";
import {
  ContentCard,
  ProfileModule,
  ProfileModuleEmbeddedMediaAccordion,
  ProfileModuleEmbeddedSection,
  ProfileModuleFeaturedCarousel,
  ProfileModuleFeaturedSlide,
  ProfileModuleLinkCards,
  ProfileModuleSocialProofItem,
  ProfileModuleSocialProofStrip,
} from "@/lib/types";

import LinkTile from "../LinkTile";
import { SocialIcon } from "../SocialIcon";

interface ProfileModulesProps {
  modules: ProfileModule[];
  loading?: boolean;
  isOwner?: boolean;
  onReorder?: (next: ProfileModule[]) => void;
}

export function ProfileModules({
  modules,
  loading = false,
  isOwner = false,
  onReorder,
}: ProfileModulesProps) {
  const [internalModules, setInternalModules] = useState<ProfileModule[]>(modules);

  useEffect(() => {
    setInternalModules((prev) => {
      if (prev.length === 0) {
        return modules;
      }

      const nextMap = new Map(modules.map((module) => [module.id, module]));
      const prevIds = new Set(prev.map((module) => module.id));

      const merged = prev
        .map((module) => {
          const next = nextMap.get(module.id);
          if (!next) return module;
          return { ...next, position: module.position };
        })
        .filter((module): module is ProfileModule => !!module);

      modules.forEach((module) => {
        if (!prevIds.has(module.id)) {
          merged.push(module);
        }
      });

      return merged.map((module, index) => ({ ...module, position: index }));
    });
  }, [modules]);

  const hasModules = (internalModules || []).length > 0;

  if (loading) {
    return <ProfileModulesSkeleton />;
  }

  if (!hasModules) {
    return <ProfileModulesEmptyState isOwner={isOwner} />;
  }

  if (isOwner) {
    return (
      <Reorder.Group
        axis="y"
        values={internalModules}
        onReorder={(next) => {
          const previousIndexMap = new Map(
            internalModules.map((module, index) => [module.id, module.position ?? index]),
          );

          const normalized = next.map((module, index) => ({
            ...module,
            position: index,
          }));

          setInternalModules(normalized);
          onReorder?.(normalized);

          normalized.forEach((module) => {
            const previous = previousIndexMap.get(module.id);
            if (previous !== module.position) {
              emitProfileModuleEvent({
                moduleId: module.id,
                moduleType: module.type,
                action: "reorder",
                metadata: {
                  previousPosition: previous,
                  nextPosition: module.position,
                },
              });
            }
          });
        }}
        className="flex flex-col gap-10"
      >
        {internalModules.map((module) => (
          <Reorder.Item
            key={module.id}
            value={module}
            dragTransition={{ bounceStiffness: 200, bounceDamping: 18 }}
            className="rounded-[36px] border border-white/12 bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <ModuleCard module={module} isOwner />
          </Reorder.Item>
        ))}
      </Reorder.Group>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {internalModules.map((module) => (
        <ModuleCard key={module.id} module={module} />
      ))}
    </div>
  );
}

function ModuleCard({ module, isOwner = false }: { module: ProfileModule; isOwner?: boolean }) {
  return (
    <article className="group relative overflow-hidden rounded-[36px] border border-white/12 bg-black/50 shadow-[0_60px_120px_-50px_rgba(15,23,42,0.85)] backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-white/20 via-white/40 to-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      {isOwner ? (
        <div className="absolute right-5 top-5 z-10 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.25em] text-white/60">
          <GripVertical className="h-4 w-4" aria-hidden="true" />
          Drag to reorder
        </div>
      ) : null}

      <div className="relative z-10 grid gap-6 px-6 py-8 sm:px-9 sm:py-10">
        <ModuleHeading module={module} />
        {renderModuleBody(module, isOwner)}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10/0 via-white/0 to-white/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </article>
  );
}

function ModuleHeading({ module }: { module: ProfileModule }) {
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-lg font-semibold text-white sm:text-xl">
          {module.title ?? module.type.replace(/_/g, " ")}
        </h3>
        {module.subtitle ? (
          <p className="mt-1 text-sm leading-relaxed text-white/60 sm:text-base">
            {module.subtitle}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-white/40">
        <span className="inline-flex h-2 w-2 rounded-full bg-white/50" aria-hidden="true" />
        {module.analytics_event_prefix?.replace("profile.", "") || module.type}
      </div>
    </header>
  );
}

function renderModuleBody(module: ProfileModule, isOwner: boolean) {
  switch (module.type) {
    case "featured_carousel":
      return <FeaturedCarousel module={module} isOwner={isOwner} />;
    case "link_cards":
      return <LinkCards module={module} isOwner={isOwner} />;
    case "social_proof_strip":
      return <SocialProofStrip module={module} isOwner={isOwner} />;
    case "embedded_media_accordion":
      return <EmbeddedMediaAccordion module={module} isOwner={isOwner} />;
    default:
      return null;
  }
}

function FeaturedCarousel({
  module,
  isOwner,
}: {
  module: ProfileModuleFeaturedCarousel;
  isOwner: boolean;
}) {
  if (module.slides.length === 0) {
    return (
      <ModuleEmptyState
        icon={<PlayCircle className="h-6 w-6" aria-hidden="true" />}
        title="No featured stories yet"
        description={
          isOwner
            ? "Promote a launch, playlist, or flagship product to create an immersive hero carousel."
            : "This creator hasn't highlighted any stories yet."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between text-sm text-white/60">
        <span>
          {module.slides.length} {module.slides.length === 1 ? "feature" : "features"}
        </span>
        <span>Swipe horizontally</span>
      </div>
      <div className="-mx-2 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pl-2">
        {module.slides.map((slide, index) => (
          <FeaturedSlide key={slide.id} slide={slide} module={module} index={index} />
        ))}
      </div>
    </div>
  );
}

function FeaturedSlide({
  slide,
  module,
  index,
}: {
  slide: ProfileModuleFeaturedSlide;
  module: ProfileModuleFeaturedCarousel;
  index: number;
}) {
  const media = (() => {
    if (slide.media_type === "video") {
      return (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={slide.media_url ?? undefined}
          autoPlay
          muted
          loop
          playsInline
        />
      );
    }

    if (slide.media_url) {
      return (
        <Image
          src={slide.media_url}
          alt=""
          fill
          className="object-cover"
          priority={index === 0}
          unoptimized
        />
      );
    }

    return (
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/60 via-purple-500/60 to-rose-500/50" />
    );
  })();

  return (
    <article className="relative h-80 w-[260px] shrink-0 snap-center overflow-hidden rounded-[32px] border border-white/15 bg-black/40 shadow-[0_40px_110px_-50px_rgba(15,23,42,0.85)]">
      <div className="absolute inset-0">{media}</div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/70" />
      <div className="relative z-10 flex h-full flex-col justify-between p-6">
        <div className="space-y-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
            {index + 1}
          </span>
          <h4 className="text-lg font-semibold text-white">{slide.title}</h4>
          {slide.description ? (
            <p className="text-sm leading-relaxed text-white/70">{slide.description}</p>
          ) : null}
        </div>

        {slide.href ? (
          <Link
            href={slide.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-between rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-white/40 hover:bg-black/60"
            onClick={() =>
              emitProfileModuleEvent({
                moduleId: module.id,
                moduleType: module.type,
                action: "featured_slide_click",
                label: slide.id,
                metadata: {
                  href: slide.href,
                },
              })
            }
          >
            <span>{slide.cta_label ?? "Open"}</span>
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function LinkCards({
  module,
  isOwner,
}: {
  module: ProfileModuleLinkCards;
  isOwner: boolean;
}) {
  const activeCards = useMemo(
    () =>
      (module.cards || [])
        .filter((card) => card.is_active)
        .sort((a, b) => a.position - b.position),
    [module.cards],
  );

  if (activeCards.length === 0) {
    return (
      <ModuleEmptyState
        icon={<ArrowUpRight className="h-6 w-6" aria-hidden="true" />}
        title="No link cards published"
        description={
          isOwner
            ? "Drag in your top calls-to-action to help followers dive deeper."
            : "This creator hasn't shared any link cards yet."
        }
      />
    );
  }

  return (
    <div className="grid gap-3 sm:gap-4">
      {activeCards.map((card) => (
        <TrackedLinkTile key={card.id} card={card} module={module} />
      ))}
    </div>
  );
}

function TrackedLinkTile({
  card,
  module,
}: {
  card: ContentCard;
  module: ProfileModuleLinkCards;
}) {
  return (
    <LinkTile
      title={card.title}
      url={card.url}
      thumbUrl={card.thumbnail_url ?? undefined}
      description={card.description ?? undefined}
      onClick={() =>
        emitProfileModuleEvent({
          moduleId: module.id,
          moduleType: module.type,
          action: "link_card_click",
          label: card.id,
          metadata: {
            href: card.url,
          },
        })
      }
    />
  );
}

function SocialProofStrip({
  module,
  isOwner,
}: {
  module: ProfileModuleSocialProofStrip;
  isOwner: boolean;
}) {
  if (module.items.length === 0) {
    return (
      <ModuleEmptyState
        icon={<ChevronDown className="h-6 w-6" aria-hidden="true" />}
        title="No social proof yet"
        description={
          isOwner
            ? "Connect social accounts, testimonials, or press logos to validate your brand."
            : "Social proof will appear here once the creator adds it."
        }
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {module.items.map((item) => (
        <SocialProofItem key={item.id} item={item} module={module} />
      ))}
    </div>
  );
}

function SocialProofItem({
  item,
  module,
}: {
  item: ProfileModuleSocialProofItem;
  module: ProfileModuleSocialProofStrip;
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white shadow-[0_24px_65px_-40px_rgba(15,23,42,0.85)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/30">
      <SocialIcon platform={item.platform ?? item.label} className="h-10 w-10" iconClassName="h-4 w-4" />
      <div className="min-w-0">
        <p className="truncate text-xs uppercase tracking-[0.35em] text-white/40">{item.label}</p>
        <p className="truncate text-sm font-semibold text-white">{item.value}</p>
      </div>
    </div>
  );

  if (!item.url) {
    return content;
  }

  return (
    <Link
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group"
      onClick={() =>
        emitProfileModuleEvent({
          moduleId: module.id,
          moduleType: module.type,
          action: "social_proof_click",
          label: item.id,
          metadata: {
            href: item.url,
          },
        })
      }
    >
      {content}
    </Link>
  );
}

function EmbeddedMediaAccordion({
  module,
  isOwner,
}: {
  module: ProfileModuleEmbeddedMediaAccordion;
  isOwner: boolean;
}) {
  const [openSectionIds, setOpenSectionIds] = useState<string[]>(() =>
    module.sections.length > 0 ? [module.sections[0].id] : [],
  );

  useEffect(() => {
    if (module.sections.length === 0) {
      setOpenSectionIds([]);
      return;
    }

    setOpenSectionIds((prev) => {
      const existingSet = new Set(prev);
      const valid = module.sections.filter((section) => existingSet.has(section.id));
      if (valid.length > 0) {
        return valid.map((section) => section.id);
      }
      return [module.sections[0].id];
    });
  }, [module.sections]);

  if (module.sections.length === 0) {
    return (
      <ModuleEmptyState
        icon={<PlayCircle className="h-6 w-6" aria-hidden="true" />}
        title="No embeds yet"
        description={
          isOwner
            ? "Drop in YouTube premieres, podcast episodes, or livestream archives to create expandable media moments."
            : "Media embeds will unlock here soon."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {module.sections.map((section) => {
        const isOpen = openSectionIds.includes(section.id);
        return (
          <AccordionItem
            key={section.id}
            moduleId={module.id}
            moduleType={module.type}
            section={section}
            isOpen={isOpen}
            onToggle={() => {
              setOpenSectionIds((prev) => {
                const nextOpen = new Set(prev);
                if (isOpen) {
                  nextOpen.delete(section.id);
                } else if (module.allow_multiple_open) {
                  nextOpen.add(section.id);
                } else {
                  nextOpen.clear();
                  nextOpen.add(section.id);
                }
                const result = Array.from(nextOpen);
                emitProfileModuleEvent({
                  moduleId: module.id,
                  moduleType: module.type,
                  action: isOpen ? "media_collapse" : "media_expand",
                  label: section.id,
                });
                return result;
              });
            }}
          />
        );
      })}
    </div>
  );
}

function AccordionItem({
  moduleId,
  moduleType,
  section,
  isOpen,
  onToggle,
}: {
  moduleId: string;
  moduleType: ProfileModuleEmbeddedMediaAccordion["type"];
  section: ProfileModuleEmbeddedSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/12 bg-white/5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-white/80 transition-colors duration-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-white sm:text-base">{section.title}</p>
          {section.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-white/60 sm:text-sm">{section.description}</p>
          ) : null}
        </div>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-white/15 bg-white/10"
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: "easeOut" }}
          >
            <div className="space-y-4 px-5 pb-5 pt-1">
              <MediaPreview section={section} />
              {section.cta_href ? (
                <Link
                  href={section.cta_href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-white/40 hover:bg-black/60"
                  onClick={() =>
                    emitProfileModuleEvent({
                      moduleId,
                      moduleType,
                      action: "media_cta_click",
                      label: section.id,
                      metadata: {
                        href: section.cta_href,
                      },
                    })
                  }
                >
                  <span>{section.cta_label ?? "Open"}</span>
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MediaPreview({ section }: { section: ProfileModuleEmbeddedSection }) {
  if (section.embed_html) {
    return (
      <div
        className="overflow-hidden rounded-2xl border border-white/10 bg-black/60"
        dangerouslySetInnerHTML={{ __html: section.embed_html }}
      />
    );
  }

  if (section.media_type === "video") {
    return (
      <video
        className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black/60"
        src={section.media_url ?? undefined}
        controls
        playsInline
      />
    );
  }

  if (section.media_type === "audio") {
    return (
      <div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/60 p-4">
        <PlayCircle className="h-10 w-10 flex-none text-white/70" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Listen now</p>
          {section.description ? (
            <p className="text-xs text-white/60">{section.description}</p>
          ) : null}
        </div>
        {section.media_url ? (
          <audio className="hidden" src={section.media_url} controls />
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/30 via-purple-500/30 to-sky-500/30 p-6 text-white/80">
      {section.poster_url ? (
        <div className="relative mb-4 aspect-video overflow-hidden rounded-2xl border border-white/20">
          <Image src={section.poster_url} alt="" fill className="object-cover" unoptimized />
        </div>
      ) : null}
      <p className="text-sm leading-relaxed">
        {section.description ?? "This story will open in a new tab."}
      </p>
    </div>
  );
}

function ModuleEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[28px] border border-dashed border-white/20 bg-white/5 px-6 py-8 text-center text-white/70">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70">
        {icon}
      </span>
      <h4 className="text-base font-semibold text-white">{title}</h4>
      <p className="max-w-sm text-sm text-white/60">{description}</p>
    </div>
  );
}

function ProfileModulesEmptyState({ isOwner }: { isOwner?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[36px] border border-dashed border-white/15 bg-white/5 px-8 py-12 text-center text-white/70">
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70">
        <GripVertical className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="text-lg font-semibold text-white">No modules yet</h3>
      <p className="max-w-md text-sm leading-relaxed text-white/60">
        {isOwner
          ? "Add your first block to unlock a cinematic profile narrative. Combine featured stories, actionable links, media, and social proof."
          : "This creator hasn't published any modules yet. Check back soon for new experiences."}
      </p>
    </div>
  );
}

export function ProfileModulesSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-80 w-full rounded-[36px] border border-white/12 bg-white/5">
        <div className="h-full w-full animate-pulse rounded-[36px] bg-gradient-to-br from-black/40 via-black/30 to-black/20" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`link-card-skeleton-${index}`}
            className="h-20 rounded-full border border-white/12 bg-white/5"
          >
            <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-black/40 via-black/30 to-black/20" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`social-proof-skeleton-${index}`}
            className="h-12 w-32 rounded-full border border-white/12 bg-white/5"
          >
            <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-black/40 via-black/30 to-black/20" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`media-accordion-skeleton-${index}`}
            className="h-24 rounded-[28px] border border-white/12 bg-white/5"
          >
            <div className="h-full w-full animate-pulse rounded-[28px] bg-gradient-to-r from-black/40 via-black/30 to-black/20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProfileModules;
