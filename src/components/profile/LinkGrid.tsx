"use client";

import { ContentCard } from "@/lib/types";
import LinkTile from "./LinkTile";

interface LinkGridProps {
  links: ContentCard[];
  loading?: boolean;
  isOwner?: boolean;
  onManageLinks?: () => void;
}

export default function LinkGrid({
  links,
  loading = false,
  isOwner = false,
  onManageLinks,
}: LinkGridProps) {
  const activeLinks = (links || [])
    .filter((link) => link.is_active)
    .sort((a, b) => a.position - b.position);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`link-skeleton-${index}`}
            className="h-64 rounded-[28px] border border-white/12 bg-white/5 shadow-[0_32px_70px_rgba(2,6,23,0.55)] sm:h-72 sm:rounded-[34px]">
            <div className="h-full w-full animate-pulse rounded-[28px] bg-gradient-to-br from-black/40 via-black/30 to-black/20 sm:rounded-[34px]" />
          </div>
        ))}
      </div>
    );
  }

  if (activeLinks.length === 0) {
    return (
      <div className="rounded-[30px] border border-white/12 bg-gradient-to-br from-[#090909] via-[#111111] to-[#1a1a1a] p-10 text-center text-white shadow-[0_40px_90px_-30px_rgba(2,6,23,0.65)] sm:rounded-[38px] sm:p-12">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/60 sm:h-16 sm:w-16">
          <svg
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold sm:text-xl">No links yet</h3>
        <p className="mt-3 text-sm text-white/60">
          Publish your first link to unveil the experiences you want to spotlight.
        </p>
        {isOwner ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={onManageLinks}
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-transform duration-200 hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Add a featured link
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2">
      {activeLinks.map((link) => (
        <LinkTile
          key={link.id}
          title={link.title}
          url={link.url}
          thumbUrl={link.thumbnail_url || undefined}
          description={link.description || undefined}
        />
      ))}
    </div>
  );
}
