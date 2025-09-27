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
  const displayHost = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (_error) {
      return url.replace(/^https?:\/\//, "");
    }
  })();

  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      <article className="relative flex h-80 flex-col overflow-hidden rounded-[38px] border border-white/12 bg-gradient-to-br from-[#0a0a0a] via-[#121212] to-[#1f1f1f] shadow-[0_38px_90px_-30px_rgba(2,6,23,0.75)] transition-all duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_42px_110px_-28px_rgba(2,6,23,0.85)]">
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
            <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_65%)]" />
          )}
        </div>

        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/55 to-black/85" />

        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-white/30 via-transparent to-white/20 opacity-50 transition-opacity duration-300 group-hover:opacity-100" />

        <div className="absolute right-6 top-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/50 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-white/60 transition-colors duration-200 group-hover:border-white/30 group-hover:bg-black/70">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Visit
        </div>

        <div className="relative mt-auto flex flex-col gap-5 px-7 pb-8 pt-28">
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-[0.35em] text-white/55">
              Highlight
            </span>
            <h3 className="text-2xl font-semibold text-white transition-colors duration-200 group-hover:text-white/90">
              {title}
            </h3>
          </div>

          {description ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-white/70">
              {description}
            </p>
          ) : (
            <p className="text-sm text-white/55">Tap to explore this feature in a new window.</p>
          )}

          <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/50">
            <div className="flex items-center gap-2">
              <span className="h-1 w-6 rounded-full bg-white/30" />
              <span>Open link</span>
            </div>
            <span className="text-[0.6rem] text-white/40 transition-colors duration-200 group-hover:text-white/70">
              {displayHost}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
