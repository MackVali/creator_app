"use client";

import { ContentCard } from "@/lib/types";
import LinkTile from "./LinkTile";

interface LinkGridProps {
  links: ContentCard[];
  loading?: boolean;
}

export default function LinkGrid({ links, loading = false }: LinkGridProps) {
  const activeLinks = (links || [])
    .filter((link) => link.is_active)
    .sort((a, b) => a.position - b.position);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`link-skeleton-${index}`}
            className="h-72 rounded-[36px] border border-white/12 bg-white/5 shadow-[0_32px_70px_rgba(2,6,23,0.55)]">
            <div className="h-full w-full animate-pulse rounded-[36px] bg-gradient-to-br from-black/40 via-black/30 to-black/20" />
          </div>
        ))}
      </div>
    );
  }

  if (activeLinks.length === 0) {
    return (
      <div className="rounded-[38px] border border-white/12 bg-gradient-to-br from-[#090909] via-[#111111] to-[#1a1a1a] p-12 text-center text-white shadow-[0_40px_90px_-30px_rgba(2,6,23,0.65)]">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/60">
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
        <h3 className="text-xl font-semibold">No links yet</h3>
        <p className="mt-3 text-sm text-white/60">
          Publish your first link to unveil the experiences you want to spotlight.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
