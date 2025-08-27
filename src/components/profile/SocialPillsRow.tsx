"use client";

import Link from "next/link";
import {
  Instagram,
  Twitter,
  Youtube,
  Music,
  Linkedin,
  Mail,
  Globe,
  Github,
  MessageCircle,
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
    .filter(([_, url]) => url && url !== "#")
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
    <div className="flex justify-center space-x-3">
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
            className="group"
          >
            <div
              className={`
              w-11 h-11 rounded-full 
              ${config.color} 
              ring-1 ring-white/10 
              hover:bg-white/8 
              hover:ring-white/20
              transition-all duration-200 
              flex items-center justify-center
              shadow-lg hover:shadow-xl
              transform hover:scale-105
            `}
            >
              <IconComponent className="w-5 h-5 text-white" />
            </div>
            <span className="sr-only">{config.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
