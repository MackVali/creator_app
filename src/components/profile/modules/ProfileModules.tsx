"use client";

import { Reorder } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight, GripVertical } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { emitProfileModuleEvent } from "@/lib/analytics";
import { ContentCard, ProfileModule, ProfileModuleLinkCards } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  if (module.type === "link_cards") {
    return <LinkCards module={module} isOwner={isOwner} />;
  }
  return null;
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
    <div className="grid grid-cols-2 gap-4">
      {activeCards.map((card) => {
        const isMedium = (card.size ?? "small") === "medium";
        return (
          <ContentCardTile
            key={card.id}
            card={card}
            module={module}
            className={cn(isMedium && "col-span-2")}
          />
        );
      })}
    </div>
  );
}

export function ContentCardTile({
  card,
  module,
  className,
}: {
  card: ContentCard;
  module: ProfileModuleLinkCards;
  className?: string;
}) {
  const sizeLabel = card.size ?? "small";
  const isMedium = sizeLabel === "medium";
  const tileTitle = card.title || "Untitled card";

  const backgroundStyle = card.thumbnail_url
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.35)), url(${card.thumbnail_url})`,
        backgroundSize: "cover",
      }
    : undefined;

  const sizeClasses = isMedium ? "min-h-[220px] sm:aspect-[5/2]" : "aspect-square";

  return (
    <Link
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "relative block overflow-hidden rounded-[32px] border border-white/10 bg-black/30 transition-transform duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
        sizeClasses,
        className,
      )}
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
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className={cn(
            "absolute inset-0 bg-cover bg-center",
            !card.thumbnail_url && "bg-gradient-to-br from-indigo-500/40 via-purple-500/40 to-rose-500/30",
          )}
          style={backgroundStyle}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/60 to-transparent" />
      </div>
      <div className="relative z-10 flex h-full items-end">
        <p className="w-full px-5 pb-5 text-center text-lg font-semibold leading-tight text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.8)] line-clamp-2">
          {tileTitle}
        </p>
      </div>
    </Link>
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
        ? "Add your first block to unlock a cinematic profile narrative with curated link cards."
        : "This creator hasn't published any modules yet. Check back soon for new experiences."}
      </p>
    </div>
  );
}

export function ProfileModulesSkeleton() {
  const modules = [
    {
      id: "module-hero-links",
      titleWidth: "w-40",
      subtitleWidth: "w-64",
      tiles: ["square", "square", "wide"],
    },
    {
      id: "module-secondary-links",
      titleWidth: "w-48",
      subtitleWidth: "w-56",
      tiles: ["square", "square", "square", "square"],
    },
  ] as const;

  return (
    <div className="flex flex-col gap-10">
      {modules.map((module) => (
        <article
          key={module.id}
          className="relative overflow-hidden rounded-[36px] border border-white/12 bg-black/50 shadow-[0_60px_120px_-50px_rgba(15,23,42,0.85)]"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-white/10 via-white/25 to-white/10" />
          <div className="relative z-10 grid gap-6 px-6 py-8 sm:px-9 sm:py-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className={`h-6 rounded-full bg-white/15 ${module.titleWidth}`} />
                <div className={`h-4 rounded-full bg-white/10 ${module.subtitleWidth}`} />
              </div>
              <div className="h-4 w-28 rounded-full bg-white/10" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {module.tiles.map((tile, index) => {
                const sizeClasses =
                  tile === "wide"
                    ? "col-span-2 min-h-[220px] sm:aspect-[5/2]"
                    : "aspect-square";
                return (
                  <div
                    key={`${module.id}-tile-${index}`}
                    className={`relative overflow-hidden rounded-[32px] border border-white/10 bg-white/5 ${sizeClasses}`}
                  >
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-black/40 via-black/30 to-black/20" />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />
                    <div className="relative z-10 flex h-full items-end justify-center px-5 pb-5">
                      <div className="h-4 w-3/4 rounded-full bg-white/15" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default ProfileModules;
