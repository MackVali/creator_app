"use client";

import Link from "next/link";
import {
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
      color: "bg-gradient-to-r from-purple-500 to-pink-500",
      label: "Instagram",
    },
    x: {
      icon: Twitter,
      color: "bg-black",
      label: "X (Twitter)",
    },
    twitter: {
      icon: Twitter,
      color: "bg-blue-400",
      label: "Twitter",
    },
    youtube: {
      icon: Youtube,
      color: "bg-red-600",
      label: "YouTube",
    },
    tiktok: {
      icon: Music,
      color: "bg-black",
      label: "TikTok",
    },
    linkedin: {
      icon: Linkedin,
      color: "bg-blue-700",
      label: "LinkedIn",
    },
    email: {
      icon: Mail,
      color: "bg-gray-600",
      label: "Email",
    },
    website: {
      icon: Globe,
      color: "bg-blue-500",
      label: "Website",
    },
    github: {
      icon: Github,
      color: "bg-gray-800",
      label: "GitHub",
    },
    discord: {
      icon: MessageCircle,
      color: "bg-indigo-600",
      label: "Discord",
    },
  };

  // Filter out undefined URLs and sort by platform priority
  const availableSocials = Object.entries(socials)
    .filter(([, url]) => url && url !== "#")
    .sort(([a], [b]) => {
      const priority = [
        "instagram",
        "x",
        "twitter",
        "youtube",
        "tiktok",
        "linkedin",
        "email",
        "website",
        "github",
        "discord",
      ];
      return priority.indexOf(a) - priority.indexOf(b);
    });

  if (availableSocials.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-white/50 text-sm">No social links added yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-3">
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
            className="group inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-all hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <span
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-white shadow-lg ${config.color}`}
            >
              <IconComponent className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>{config.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
