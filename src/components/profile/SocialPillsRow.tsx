"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { SupportedPlatform } from "@/lib/db/linked-accounts";
import { getSocialIconDefinition } from "./SocialIcon";

const LINKED_PLATFORMS: SupportedPlatform[] = [
  "instagram",
  "tiktok",
  "youtube",
  "spotify",
  "snapchat",
  "facebook",
  "twitter",
];

interface SocialPillsRowProps {
  socials: Record<string, string | undefined>;
  editMode?: boolean;
  onPlatformSelect?: (platform?: SupportedPlatform) => void;
}

export default function SocialPillsRow({
  socials,
  editMode = false,
  onPlatformSelect,
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

  if (!hasSocials && !editMode) {
    return (
      <div className="w-full text-center text-sm text-white/60">
        No social links added yet
      </div>
    );
  }

  const [isPlatformMenuOpen, setIsPlatformMenuOpen] = useState(false);
  const plusButtonRef = useRef<HTMLButtonElement | null>(null);
  const platformMenuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);

  const clamp = useCallback((value: number, min: number, max: number) => {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!plusButtonRef.current) {
      return;
    }

    const rect = plusButtonRef.current.getBoundingClientRect();
    const menuWidth = platformMenuRef.current?.offsetWidth ?? 256;
    const menuHeight = platformMenuRef.current?.offsetHeight ?? 220;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const horizontalMargin = 12;
    const verticalMargin = 12;

    const desiredLeft = rect.left + rect.width / 2 - menuWidth / 2;
    const left = clamp(desiredLeft, horizontalMargin, Math.max(horizontalMargin, viewportWidth - menuWidth - horizontalMargin));

    const spacing = 8;
    let top = rect.bottom + spacing;
    const maxTop = viewportHeight - menuHeight - verticalMargin;
    if (top > maxTop) {
      top = Math.max(rect.top - menuHeight - spacing, verticalMargin);
    }

    setMenuPosition({ left, top });
  }, [clamp]);

  useEffect(() => {
    if (!isPlatformMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        platformMenuRef.current?.contains(event.target as Node) ||
        plusButtonRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setIsPlatformMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPlatformMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isPlatformMenuOpen]);

  useEffect(() => {
    if (!isPlatformMenuOpen) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();

    const handleUpdate = () => updateMenuPosition();

    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, true);

    return () => {
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate, true);
    };
  }, [isPlatformMenuOpen, updateMenuPosition]);

  const circleClasses =
    "group relative inline-flex h-12 w-12 shrink-0 snap-center items-center justify-center rounded-full text-white transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:h-11 sm:w-11";

  return (
    <>
      <div className="-mx-2 flex snap-x snap-mandatory items-center gap-4 overflow-x-auto overflow-y-visible px-2 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 lg:justify-start">
        {editMode && onPlatformSelect ? (
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setIsPlatformMenuOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    updateMenuPosition();
                  } else {
                    setMenuPosition(null);
                  }
                  return next;
                })
              }
              aria-label="Add or edit social links"
              aria-expanded={isPlatformMenuOpen}
              className={circleClasses}
              ref={plusButtonRef}
            >
              <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
              <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
            {isPlatformMenuOpen ? (
              <div
                ref={platformMenuRef}
                style={
                  menuPosition
                    ? {
                        left: menuPosition.left,
                        position: "fixed",
                        top: menuPosition.top,
                      }
                    : undefined
                }
                className="z-50 w-64 rounded-[1.5rem] border border-white/10 bg-[#15161A] px-3 py-2 shadow-[0_25px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm transition duration-200 sm:w-72"
              >
                <p className="pointer-events-auto px-2 py-1 text-[0.65rem] uppercase tracking-[0.4em] text-zinc-500">
                  Add a platform
                </p>
                <div className="pointer-events-auto divide-y divide-white/5">
                  {LINKED_PLATFORMS.map((platform) => {
                    const definition = getSocialIconDefinition(platform);
                    const Icon = definition.icon;

                    return (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => {
                          setIsPlatformMenuOpen(false);
                          onPlatformSelect(platform);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-3 text-sm text-white transition hover:bg-white/5"
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${definition.background}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span>{definition.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

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
              className={circleClasses}
            >
              <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
              <span
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110"
                aria-hidden="true"
              >
                <span className={`flex h-full w-full items-center justify-center rounded-full text-white ${definition.background}`}>
                  <Icon className="h-4 w-4" />
                </span>
              </span>
              <span className="sr-only">{definition.label}</span>
            </Link>
          );
        })}
      </div>
      {!hasSocials && !editMode ? (
        <div className="mt-2 w-full text-center text-sm text-white/60">
          No social links added yet
        </div>
      ) : null}
    </>
  );
}
