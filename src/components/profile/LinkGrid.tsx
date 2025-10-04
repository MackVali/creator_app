"use client";

import Link from "next/link";

import { ContentCard } from "@/lib/types";
import LinkTile from "./LinkTile";

interface LinkGridProps {
  links: ContentCard[];
  loading?: boolean;
  isOwner?: boolean;
}

export default function LinkGrid({
  links,
  loading = false,
  isOwner = false,
}: LinkGridProps) {
  const activeLinks = (links || [])
    .filter((link) => link.is_active)
    .sort((a, b) => a.position - b.position);

  const listWrapperClass =
    "mx-auto flex w-full max-w-xl flex-col gap-3 sm:gap-4 lg:max-w-2xl";

  if (loading) {
    return (
      <div className={listWrapperClass}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`link-skeleton-${index}`}
            className="h-20 rounded-full border border-white/10 bg-white/5"
          >
            <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-white/5 via-white/10 to-white/5" />
          </div>
        ))}
      </div>
    );
  }

  if (activeLinks.length === 0) {
    return (
      <div className="mx-auto w-full max-w-xl rounded-[32px] border border-white/10 bg-white/5 p-8 text-center text-white shadow-[0_26px_70px_-30px_rgba(2,6,23,0.55)] sm:p-10 lg:max-w-2xl">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/60 sm:mb-6 sm:h-14 sm:w-14">
          <svg
            className="h-6 w-6"
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
        <h3 className="text-base font-semibold sm:text-lg">No links yet</h3>
        <p className="mt-2 text-sm text-white/60 sm:mt-3">
          Publish your first link to unveil the experiences you want to spotlight.
        </p>
        {isOwner ? (
          <div className="mt-6 flex justify-center">
            <Link
              href="/profile/linked-accounts"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-transform duration-200 hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              Add your first link
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={listWrapperClass}>
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
