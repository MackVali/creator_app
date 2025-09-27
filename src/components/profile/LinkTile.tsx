"use client";

import { ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface LinkTileProps {
  title: string;
  url: string;
  thumbUrl?: string;
  description?: string;
}

export default function LinkTile({
  title,
  url,
  thumbUrl,
  description,
}: LinkTileProps) {
  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <article className="relative flex h-72 flex-col overflow-hidden rounded-[32px] border border-white/10 bg-black/70 shadow-[0_32px_70px_rgba(2,6,23,0.65)] transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_36px_90px_rgba(2,6,23,0.7)]">
        <div className="absolute inset-0">
          {thumbUrl ? (
            <Image
              src={thumbUrl}
              alt={`${title} preview`}
              fill
              sizes="(min-width: 768px) 40vw, 100vw"
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" />
          )}
        </div>

        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/10 via-slate-900/40 to-slate-950/85" />

        <div className="absolute right-5 top-5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white transition-colors duration-200 group-hover:border-white/30 group-hover:bg-black/70">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>

        <div className="relative mt-auto flex flex-col gap-4 p-6">
          <h3 className="text-xl font-semibold text-white transition-colors duration-200 group-hover:text-white/90">
            {title}
          </h3>

          {description ? (
            <p className="text-sm leading-relaxed text-white/75 line-clamp-3">
              {description}
            </p>
          ) : (
            <p className="text-sm text-white/60">Tap to open this link in a new tab.</p>
          )}

          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
            <span className="h-px w-8 bg-white/30" />
            <span>Open link</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
