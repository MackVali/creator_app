import { cn } from "@/lib/utils";
import * as simpleIcons from "simple-icons/icons";
import {
  type LucideIcon,
  Facebook,
  Github,
  Globe,
  Instagram,
  Link as LinkIcon,
  Linkedin,
  Mail,
  MessageCircle,
  Pin,
  Twitch,
  Youtube,
  Disc3,
  Apple,
  Chrome,
  Radio,
} from "lucide-react";

interface SimpleIconData {
  hex: string;
  path: string;
}

function pickSimpleIcon(...keys: string[]): SimpleIconData | null {
  const iconRegistry = simpleIcons as Record<string, SimpleIconData | undefined>;
  for (const key of keys) {
    const match = iconRegistry[key];
    if (match) return match;
  }
  return null;
}

const BRAND_ICONS = {
  instagram: pickSimpleIcon("siInstagram"),
  facebook: pickSimpleIcon("siFacebook"),
  twitter: pickSimpleIcon("siX", "siXdotcom", "siTwitter"),
  x: pickSimpleIcon("siX", "siXdotcom", "siTwitter"),
  linkedin: pickSimpleIcon("siLinkedin"),
  youtube: pickSimpleIcon("siYoutube"),
  tiktok: pickSimpleIcon("siTiktok"),
  github: pickSimpleIcon("siGithub"),
  discord: pickSimpleIcon("siDiscord"),
  snapchat: pickSimpleIcon("siSnapchat"),
  pinterest: pickSimpleIcon("siPinterest"),
  reddit: pickSimpleIcon("siReddit"),
  twitch: pickSimpleIcon("siTwitch"),
  spotify: pickSimpleIcon("siSpotify"),
  apple: pickSimpleIcon("siApplemusic", "siApplemusic"),
  google: pickSimpleIcon("siGoogle"),
} as const;

export interface SocialIconDefinition {
  icon: LucideIcon;
  label: string;
  background: string;
  brandIcon?: SimpleIconData | null;
}

export const SOCIAL_ICON_DEFINITIONS: Record<string, SocialIconDefinition> = {
  instagram: {
    icon: Instagram,
    label: "Instagram",
    background: "bg-gradient-to-r from-purple-500 to-pink-500",
    brandIcon: BRAND_ICONS.instagram,
  },
  facebook: {
    icon: Facebook,
    label: "Facebook",
    background: "bg-blue-600",
    brandIcon: BRAND_ICONS.facebook,
  },
  twitter: {
    icon: LinkIcon,
    label: "Twitter",
    background: "bg-black",
    brandIcon: BRAND_ICONS.twitter,
  },
  x: {
    icon: LinkIcon,
    label: "X",
    background: "bg-black",
    brandIcon: BRAND_ICONS.x,
  },
  linkedin: {
    icon: Linkedin,
    label: "LinkedIn",
    background: "bg-blue-700",
    brandIcon: BRAND_ICONS.linkedin,
  },
  youtube: {
    icon: Youtube,
    label: "YouTube",
    background: "bg-red-600",
    brandIcon: BRAND_ICONS.youtube,
  },
  tiktok: {
    icon: LinkIcon,
    label: "TikTok",
    background: "bg-black",
    brandIcon: BRAND_ICONS.tiktok,
  },
  email: {
    icon: Mail,
    label: "Email",
    background: "bg-gray-600",
  },
  website: {
    icon: Globe,
    label: "Website",
    background: "bg-blue-500",
  },
  github: {
    icon: Github,
    label: "GitHub",
    background: "bg-gray-800",
    brandIcon: BRAND_ICONS.github,
  },
  discord: {
    icon: MessageCircle,
    label: "Discord",
    background: "bg-indigo-600",
    brandIcon: BRAND_ICONS.discord,
  },
  snapchat: {
    icon: LinkIcon,
    label: "Snapchat",
    background: "bg-yellow-400",
    brandIcon: BRAND_ICONS.snapchat,
  },
  pinterest: {
    icon: Pin,
    label: "Pinterest",
    background: "bg-red-500",
    brandIcon: BRAND_ICONS.pinterest,
  },
  reddit: {
    icon: LinkIcon,
    label: "Reddit",
    background: "bg-orange-500",
    brandIcon: BRAND_ICONS.reddit,
  },
  twitch: {
    icon: Twitch,
    label: "Twitch",
    background: "bg-purple-600",
    brandIcon: BRAND_ICONS.twitch,
  },
  spotify: {
    icon: Disc3,
    label: "Spotify",
    background: "bg-green-500",
    brandIcon: BRAND_ICONS.spotify,
  },
  apple: {
    icon: Apple,
    label: "Apple Music",
    background: "bg-gray-900",
    brandIcon: BRAND_ICONS.apple,
  },
  google: {
    icon: Chrome,
    label: "Google",
    background: "bg-blue-500",
    brandIcon: BRAND_ICONS.google,
  },
  podcast: {
    icon: Radio,
    label: "Podcast",
    background: "bg-purple-500",
  },
};

const DEFAULT_ICON: SocialIconDefinition = {
  icon: LinkIcon,
  label: "Link",
  background: "bg-gray-600",
};

export function getSocialIconDefinition(platform: string): SocialIconDefinition {
  const key = platform?.toLowerCase?.();
  if (!key) return DEFAULT_ICON;
  return SOCIAL_ICON_DEFINITIONS[key] ?? DEFAULT_ICON;
}

interface SocialIconProps {
  platform: string;
  className?: string;
  iconClassName?: string;
}

export function SocialIcon({ platform, className, iconClassName }: SocialIconProps) {
  const definition = getSocialIconDefinition(platform);
  const Icon = definition.icon;

  return (
    <span
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-white transition-transform duration-200",
        definition.background,
        className
      )}
      style={definition.brandIcon ? { backgroundColor: `#${definition.brandIcon.hex}` } : undefined}
      aria-hidden="true"
    >
      {definition.brandIcon ? (
        <svg
          viewBox="0 0 24 24"
          className={cn("h-4 w-4", iconClassName)}
          fill={platform.toLowerCase() === "snapchat" ? "#000" : "currentColor"}
          role="img"
          aria-label={definition.label}
        >
          <path d={definition.brandIcon.path} />
        </svg>
      ) : (
        <Icon className={cn("h-4 w-4", iconClassName)} />
      )}
    </span>
  );
}
