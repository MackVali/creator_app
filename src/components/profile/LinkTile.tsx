"use client";

import { ExternalLink, Globe2 } from "lucide-react";
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
    } catch {
      return url.replace(/^https?:\/\//, "");
    }
  })();

  const leadingVisual = thumbUrl ? (
    <Image
      src={thumbUrl}
      alt=""
      width={48}
      height={48}
      className="h-12 w-12 flex-none rounded-2xl object-cover sm:h-14 sm:w-14 sm:rounded-full"
      unoptimized
    />
  ) : (
    <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-white/10 text-white/70 sm:h-14 sm:w-14 sm:rounded-full">
      <Globe2 className="h-5 w-5" aria-hidden="true" />
    </div>
  );

  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      <article className="flex items-start gap-3 rounded-[26px] border border-white/10 bg-white/5 px-4 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10 hover:shadow-[0_18px_45px_-20px_rgba(2,6,23,0.65)] sm:items-center sm:gap-4 sm:rounded-full sm:px-5">
        {leadingVisual}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 sm:items-center">
            <h3 className="line-clamp-2 text-base font-semibold leading-tight text-white sm:truncate sm:text-lg">
              {title}
            </h3>
            <ExternalLink className="mt-1 h-4 w-4 flex-none text-white/50 transition-colors duration-200 group-hover:text-white/80 sm:mt-0" aria-hidden="true" />
          </div>

          <div className="mt-1 space-y-1 text-sm text-white/60 sm:text-[0.95rem]">
            {description ? (
              <p className="line-clamp-2 leading-snug text-white/70">{description}</p>
            ) : null}
            <p className="truncate text-xs uppercase tracking-[0.3em] text-white/40">{displayHost}</p>
          </div>
        </div>
      </article>
    </Link>
  );
}
