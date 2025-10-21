"use client";

import Link from "next/link";

import { getSocialIconDefinition } from "./SocialIcon";

interface SocialPillsRowProps {
  socials: Record<string, string | undefined>;
}

export default function SocialPillsRow({ socials }: SocialPillsRowProps) {
  // Filter out undefined URLs and sort by platform priority
  const priority = [
    "instagram",
    "x",
    "twitter",
    "youtube",
    "tiktok",
    "linkedin",
    "facebook",
    "email",
    "website",
    "github",
    "discord",
  ];

  const getPriority = (platform: string) => {
    const index = priority.indexOf(platform);
    return index === -1 ? priority.length : index;
  };

  const availableSocials = Object.entries(socials)
    .filter(([, url]) => url && url !== "#")
    .sort(([a], [b]) => getPriority(a) - getPriority(b));

  if (availableSocials.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-center text-sm text-white/60">
        No social links added yet
      </div>
    );
  }

  return (
    <div className="-mx-2 flex snap-x snap-mandatory items-center gap-4 overflow-x-auto px-2 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 lg:justify-start">
      {availableSocials.map(([platform, url]) => {
        const definition = getSocialIconDefinition(platform);
        if (!url) return null;

        const Icon = definition.icon;

        return (
          <Link
            key={platform}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={definition.label}
            className="group relative inline-flex h-16 w-16 shrink-0 snap-center items-center justify-center rounded-full border border-white/10 bg-black/60 text-white shadow-[0_18px_36px_rgba(2,6,23,0.55)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:h-14 sm:w-14"
          >
            <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
            <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 shadow-[0_10px_25px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover:scale-110" aria-hidden="true">
              <span className={`flex h-full w-full items-center justify-center rounded-full text-white ${definition.background}`}>
                <Icon className="h-5 w-5" />
              </span>
            </span>
            <span className="sr-only">{definition.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
