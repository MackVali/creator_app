"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { SupportedPlatform } from "@/lib/db/linked-accounts";
import { getSocialIconDefinition, SocialIcon } from "./SocialIcon";

const LINKED_PLATFORMS: SupportedPlatform[] = [
  "instagram",
  "tiktok",
  "youtube",
  "spotify",
  "snapchat",
  "facebook",
  "twitter",
];

function isLinkedPlatform(platform: string): platform is SupportedPlatform {
  return LINKED_PLATFORMS.includes(platform as SupportedPlatform);
}

interface SocialPillsRowProps {
  socials: Record<string, string | undefined>;
  editMode?: boolean;
  onPlatformSelect?: (platform?: SupportedPlatform) => void;
  layout?: "horizontal" | "vertical";
}

export default function SocialPillsRow({
  socials,
  editMode = false,
  onPlatformSelect,
  layout = "horizontal",
}: SocialPillsRowProps) {
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

  const hasSocials = availableSocials.length > 0;

  const circleClasses =
    "group relative inline-flex h-11 w-11 shrink-0 snap-center items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

  const rowClasses =
    layout === "vertical"
      ? "flex flex-col items-center gap-3"
      : editMode
        ? "-mx-2 flex snap-x snap-mandatory items-center gap-2.5 overflow-x-auto overflow-y-visible px-2 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        : "-mx-2 flex snap-x snap-mandatory items-center gap-4 overflow-x-auto overflow-y-visible px-2 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 lg:justify-start";

  if (!hasSocials && !editMode) {
    if (layout === "vertical") {
      return null;
    }
    return (
      <div className="w-full text-center text-sm text-white/60">
        No social links added yet
      </div>
    );
  }

  return (
    <>
      <div className={rowClasses}>
        {availableSocials.map(([platform, url]) => {
          const definition = getSocialIconDefinition(platform);
          if (!url) return null;

          const icon = (
            <>
              <span
                className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                aria-hidden="true"
              />
              <span
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110"
                aria-hidden="true"
              >
                <SocialIcon
                  platform={platform}
                  className="h-8 w-8 shadow-none"
                  iconClassName="h-4 w-4"
                />
              </span>
              <span className="sr-only">{definition.label}</span>
            </>
          );

          if (editMode && onPlatformSelect && isLinkedPlatform(platform)) {
            return (
              <button
                key={platform}
                type="button"
                onClick={() => onPlatformSelect(platform)}
                aria-label={`Edit ${definition.label}`}
                className={circleClasses}
              >
                {icon}
              </button>
            );
          }

          return (
            <Link
              key={platform}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={definition.label}
              className={circleClasses}
            >
              {icon}
            </Link>
          );
        })}

        {editMode && onPlatformSelect ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => onPlatformSelect()}
              aria-label="Add or edit social links"
              className={circleClasses}
            >
              <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
              <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/35">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
          </div>
        ) : null}
      </div>
      {!hasSocials && !editMode ? (
        <div className="mt-2 w-full text-center text-sm text-white/60">
          No social links added yet
        </div>
      ) : null}
    </>
  );
}
