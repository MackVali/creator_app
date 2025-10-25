"use client";

import { Calendar, Link2, MapPin, Share2, Sparkles, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Profile } from "@/lib/types";

interface ProfileHighlightsProps {
  profile: Profile;
  stats?: {
    linkCount: number;
    socialCount: number;
  };
  activeModuleCount: number;
}

interface HighlightItem {
  icon: LucideIcon;
  label: string;
  value: string;
  helper?: string;
}

function formatJoinedDate(createdAt?: string | null) {
  if (!createdAt) return null;

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(new Date(createdAt));
  } catch (error) {
    console.error("Failed to format joined date", error);
    return null;
  }
}

export function ProfileHighlights({ profile, stats, activeModuleCount }: ProfileHighlightsProps) {
  const joinedDate = formatJoinedDate(profile.created_at ?? profile.updated_at);
  const location = (profile.location_display ?? profile.city)?.trim();
  const pronouns = profile.pronouns?.trim();
  const linkCount = stats?.linkCount ?? 0;
  const socialCount = stats?.socialCount ?? 0;

  const highlights: HighlightItem[] = [];

  if (location) {
    highlights.push({
      icon: MapPin,
      label: "Based in",
      value: location,
    });
  }

  if (pronouns) {
    highlights.push({
      icon: UserRound,
      label: "Pronouns",
      value: pronouns,
    });
  }

  if (joinedDate) {
    highlights.push({
      icon: Calendar,
      label: "Joined",
      value: joinedDate,
    });
  }

  highlights.push({
    icon: Sparkles,
    label: "Creator lineup",
    value: activeModuleCount === 0 ? "Modules coming soon" : `${activeModuleCount} active ${activeModuleCount === 1 ? "module" : "modules"}`,
    helper:
      activeModuleCount === 0
        ? "Add a module to showcase drops, media, or proof."
        : "Keep the momentum with fresh drops and spotlights.",
  });

  highlights.push({
    icon: Link2,
    label: "Links live",
    value: linkCount === 0 ? "Add your first link" : `${linkCount} ${linkCount === 1 ? "link" : "links"}`,
    helper:
      linkCount === 0 ? "Drive fans to the next thing you want them to do." : "Curate your most essential destinations.",
  });

  highlights.push({
    icon: Share2,
    label: "Social reach",
    value: socialCount === 0 ? "Connect socials" : `${socialCount} active ${socialCount === 1 ? "channel" : "channels"}`,
    helper:
      socialCount === 0
        ? "Drop in your socials so fans always know where else to find you."
        : "Keep these links fresh so new fans can follow everywhere.",
  });

  return (
    <section className="mx-auto mt-14 w-full max-w-5xl px-4">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_45px_80px_-45px_rgba(15,23,42,0.7)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Profile highlights</h2>
            <p className="mt-1 text-sm text-white/60">
              Keep these essentials sharp so every visit feels intentional.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {highlights.map(({ icon: Icon, label, value, helper }) => (
            <div
              key={label}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/5 blur-3xl" />
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white/80">
                  <Icon className="h-5 w-5" />
                </span>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">{label}</p>
                  <p className="mt-1 text-base font-semibold text-white">{value}</p>
                  {helper ? <p className="mt-2 text-xs text-white/55">{helper}</p> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProfileHighlights;
