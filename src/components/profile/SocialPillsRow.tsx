"use client";

import Link from "next/link";
import {
  Facebook,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  Music,
  Twitter,
  Youtube,
} from "lucide-react";

interface SocialPillsRowProps {
  socials: Record<string, string | undefined>;
}

export default function SocialPillsRow({ socials }: SocialPillsRowProps) {
  // Platform configuration with icons and colors
  const platformConfig = {
    instagram: {
      icon: Instagram,
      label: "Instagram",
    },
    x: {
      icon: Twitter,
      label: "X (Twitter)",
    },
    twitter: {
      icon: Twitter,
      label: "Twitter",
    },
    youtube: {
      icon: Youtube,
      label: "YouTube",
    },
    tiktok: {
      icon: Music,
      label: "TikTok",
    },
    linkedin: {
      icon: Linkedin,
      label: "LinkedIn",
    },
    email: {
      icon: Mail,
      label: "Email",
    },
    website: {
      icon: Globe,
      label: "Website",
    },
    github: {
      icon: Github,
      label: "GitHub",
    },
    discord: {
      icon: MessageCircle,
      label: "Discord",
    },
    facebook: {
      icon: Facebook,
      label: "Facebook",
    },
  } as const;

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
    <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
      {availableSocials.map(([platform, url]) => {
        const config = platformConfig[platform as keyof typeof platformConfig];
        if (!config || !url) return null;

        const IconComponent = config.icon;

        return (
          <Link
            key={platform}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={config.label}
            className="group inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-medium text-white/75 shadow-[0_16px_36px_rgba(2,6,23,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white shadow-[0_12px_24px_rgba(2,6,23,0.6)] transition-transform duration-200 group-hover:scale-105">
              <IconComponent className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="pr-1 text-xs uppercase tracking-[0.25em] text-white/60 transition-colors duration-200 group-hover:text-white/80">
              {config.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
