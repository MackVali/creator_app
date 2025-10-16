"use client";

import { ExternalLink, Globe2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface LinkTileProps {
  title: string;
  url: string;
  thumbUrl?: string;
  description?: string;
  onClick?: () => void;
}

export default function LinkTile({
  title,
  url,
  thumbUrl,
  description,
  onClick,
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
      className="h-12 w-12 flex-none rounded-full object-cover"
      unoptimized
    />
  ) : (
    <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white/10 text-white/70">
      <Globe2 className="h-5 w-5" aria-hidden="true" />
    </div>
  );

  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      <article className="flex items-center gap-4 rounded-full border border-white/10 bg-white/5 px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10 hover:shadow-[0_18px_45px_-20px_rgba(2,6,23,0.65)]">
        {leadingVisual}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-base font-semibold text-white sm:text-lg">
              {title}
            </h3>
            <ExternalLink className="h-4 w-4 flex-none text-white/50 transition-colors duration-200 group-hover:text-white/80" aria-hidden="true" />
          </div>

          <div className="mt-1 space-y-1 text-sm text-white/60">
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
