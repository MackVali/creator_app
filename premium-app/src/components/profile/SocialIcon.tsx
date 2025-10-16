import { cn } from "@/lib/utils";
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
  Music2,
  Pin,
  Twitch,
  Twitter,
  Youtube,
  Ghost,
  MessageSquare,
  Disc3,
  Apple,
  Chrome,
  Radio,
} from "lucide-react";

export interface SocialIconDefinition {
  icon: LucideIcon;
  label: string;
  background: string;
}

export const SOCIAL_ICON_DEFINITIONS: Record<string, SocialIconDefinition> = {
  instagram: {
    icon: Instagram,
    label: "Instagram",
    background: "bg-gradient-to-r from-purple-500 to-pink-500",
  },
  facebook: {
    icon: Facebook,
    label: "Facebook",
    background: "bg-blue-600",
  },
  twitter: {
    icon: Twitter,
    label: "Twitter",
    background: "bg-sky-500",
  },
  x: {
    icon: Twitter,
    label: "X",
    background: "bg-black",
  },
  linkedin: {
    icon: Linkedin,
    label: "LinkedIn",
    background: "bg-blue-700",
  },
  youtube: {
    icon: Youtube,
    label: "YouTube",
    background: "bg-red-600",
  },
  tiktok: {
    icon: Music2,
    label: "TikTok",
    background: "bg-black",
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
  },
  discord: {
    icon: MessageCircle,
    label: "Discord",
    background: "bg-indigo-600",
  },
  snapchat: {
    icon: Ghost,
    label: "Snapchat",
    background: "bg-yellow-400",
  },
  pinterest: {
    icon: Pin,
    label: "Pinterest",
    background: "bg-red-500",
  },
  reddit: {
    icon: MessageSquare,
    label: "Reddit",
    background: "bg-orange-500",
  },
  twitch: {
    icon: Twitch,
    label: "Twitch",
    background: "bg-purple-600",
  },
  spotify: {
    icon: Disc3,
    label: "Spotify",
    background: "bg-green-500",
  },
  apple: {
    icon: Apple,
    label: "Apple Music",
    background: "bg-gray-900",
  },
  google: {
    icon: Chrome,
    label: "Google",
    background: "bg-blue-500",
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
        "flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-transform duration-200",
        definition.background,
        className
      )}
      aria-hidden="true"
    >
      <Icon className={cn("h-5 w-5", iconClassName)} />
    </span>
  );
}
