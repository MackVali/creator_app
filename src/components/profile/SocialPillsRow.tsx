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
      color: "bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700",
      label: "Instagram",
    },
    x: {
      icon: Twitter,
      color: "bg-black",
      label: "X (Twitter)",
    },
    twitter: {
      icon: Twitter,
      color: "bg-neutral-900",
      label: "Twitter",
    },
    youtube: {
      icon: Youtube,
      color: "bg-neutral-900",
      label: "YouTube",
    },
    tiktok: {
      icon: Music,
      color: "bg-black",
      label: "TikTok",
    },
    linkedin: {
      icon: Linkedin,
      color: "bg-neutral-900",
      label: "LinkedIn",
    },
    email: {
      icon: Mail,
      color: "bg-neutral-800",
      label: "Email",
    },
    website: {
      icon: Globe,
      color: "bg-gradient-to-br from-black via-neutral-900 to-neutral-700",
      label: "Website",
    },
    github: {
      icon: Github,
      color: "bg-black",
      label: "GitHub",
    },
    discord: {
      icon: MessageCircle,
      color: "bg-neutral-900",
      label: "Discord",
    },
    facebook: {
      icon: Facebook,
      color: "bg-neutral-900",
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
    <div className="flex flex-wrap justify-center gap-4">
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
            className="group relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-black/40 shadow-[0_22px_40px_rgba(2,6,23,0.55)] transition-all duration-200 hover:-translate-y-1 hover:border-white/25 hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <span
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg transition-transform duration-200 group-hover:scale-[1.05] ${config.color}`}
            >
              <IconComponent className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="sr-only">{config.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
