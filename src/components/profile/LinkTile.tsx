"use client";

import { ExternalLink } from "lucide-react";
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
      className="block group"
    >
      <div
        className="
        aspect-square rounded-2xl overflow-hidden relative
        bg-slate-900/60 ring-1 ring-white/10 
        shadow-[inset_0_1px_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.45)]
        hover:ring-white/20 hover:shadow-[inset_0_1px_rgba(255,255,255,0.08),0_15px_40px_rgba(0,0,0,0.6)]
        transition-all duration-200
        active:scale-95
      "
      >
        {/* Background Image or Fallback Gradient */}
        {thumbUrl ? (
          <div
            className="w-full h-full bg-cover bg-center"
            style={{ backgroundImage: `url(${thumbUrl})` }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900" />
        )}

        {/* Overlay Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/10" />

        {/* External Link Badge - Top Right */}
        <div className="absolute top-3 right-3">
          <div
            className="
            w-8 h-8 rounded-full 
            bg-black/40 backdrop-blur-sm
            ring-1 ring-white/20
            flex items-center justify-center
            group-hover:bg-black/60 transition-colors
          "
          >
            <ExternalLink className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Content - Bottom Left */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3
            className="
            text-white font-semibold text-lg leading-tight
            line-clamp-2 mb-1
            group-hover:text-white/90 transition-colors
          "
          >
            {title}
          </h3>

          {description && (
            <p
              className="
              text-white/70 text-sm leading-relaxed
              line-clamp-2
              group-hover:text-white/80 transition-colors
            "
            >
              {description}
            </p>
          )}
        </div>

        {/* Hover Effect Overlay */}
        <div
          className="
          absolute inset-0 
          bg-gradient-to-t from-purple-500/10 to-transparent
          opacity-0 group-hover:opacity-100
          transition-opacity duration-200
        "
        />
      </div>
    </Link>
  );
}
