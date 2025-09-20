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
      <div className="px-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`link-skeleton-${index}`}
              className="h-44 rounded-3xl bg-white/5 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (activeLinks.length === 0) {
    return (
      <div className="px-4">
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-10 text-center shadow-[0_25px_45px_rgba(15,23,42,0.45)]">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-white/50">
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
          <h3 className="text-lg font-semibold text-white">No links yet</h3>
          <p className="mt-2 text-sm text-white/50">
            Publish your first link to showcase what you are working on.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
    </div>
  );
}
