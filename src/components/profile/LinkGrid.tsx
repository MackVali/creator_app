"use client";

import { ContentCard } from "@/lib/types";
import LinkTile from "./LinkTile";
import { ProfileSkeleton } from "./ProfileSkeleton";

interface LinkGridProps {
  links: ContentCard[];
  loading?: boolean;
}

export default function LinkGrid({ links, loading = false }: LinkGridProps) {
  if (loading) {
    return (
      <div className="px-4">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="aspect-square rounded-2xl bg-white/5 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!links || links.length === 0) {
    return (
      <div className="px-4">
        <div
          className="
          rounded-2xl bg-slate-900/60 
          ring-1 ring-white/10 
          p-8 text-center
          shadow-[inset_0_1px_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.45)]
        "
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white/50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-.758l1.102-1.101a4 4 0 105.656-5.656l4-4a4 4 0 00-5.656 0l-1.102 1.101"
              />
            </svg>
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">
            No links yet
          </h3>
          <p className="text-white/50 text-sm">
            Add your first link to get started
          </p>
        </div>
      </div>
    );
  }

  // Filter active links and sort by position
  const activeLinks = links
    .filter((link) => link.is_active)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="px-4">
      <div className="grid grid-cols-2 gap-3">
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
