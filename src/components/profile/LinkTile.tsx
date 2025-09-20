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
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-[0_20px_45px_rgba(15,23,42,0.45)] transition-all duration-200 hover:border-white/25 hover:shadow-[0_28px_60px_rgba(15,23,42,0.55)]">
        <div className="relative h-32 w-full overflow-hidden">
          {thumbUrl ? (
            <Image
              src={thumbUrl}
              alt={`${title} preview`}
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/10 to-transparent" />

          <div className="absolute right-4 top-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white transition-colors group-hover:border-white/30 group-hover:bg-black/50">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <h3 className="text-lg font-semibold text-white transition-colors group-hover:text-white/90">
            {title}
          </h3>

          {description ? (
            <p className="text-sm leading-relaxed text-white/70 line-clamp-3">
              {description}
            </p>
          ) : (
            <p className="text-sm text-white/40">Tap to open this link in a new tab.</p>
          )}

          <div className="mt-auto flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
            <span className="h-px w-6 bg-white/20" />
            <span>Open link</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
