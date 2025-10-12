"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getLinkedAccounts,
  PLATFORM_CONFIG,
  SupportedPlatform,
} from "@/lib/db/linked-accounts";
import { LinkedAccount } from "@/lib/types";
import {
  Instagram,
  Youtube,
  Twitter,
  Music,
  Music2,
  Ghost,
  Facebook,
  LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<SupportedPlatform, LucideIcon> = {
  instagram: Instagram,
  tiktok: Music2,
  youtube: Youtube,
  spotify: Music,
  snapchat: Ghost,
  facebook: Facebook,
  twitter: Twitter,
};

interface Props {
  userId: string;
  className?: string;
  iconClassName?: string;
}

export default function LinkedAccountsBar({
  userId,
  className,
  iconClassName,
}: Props) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);

  useEffect(() => {
    async function load() {
      const data = await getLinkedAccounts(userId);
      setAccounts(data);
    }
    load();
  }, [userId]);

  if (accounts.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {accounts.map((acc) => {
        const platform = acc.platform as SupportedPlatform;
        const Icon = ICON_MAP[platform];
        const { label, color } = PLATFORM_CONFIG[platform];

        return (
          <a
            key={acc.platform}
            href={acc.url}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            className="group inline-flex items-center gap-3 rounded-full border border-border/40 bg-background/80 px-4 py-2 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm transition group-hover:scale-105 dark:bg-white/10"
              style={{ color }}
              aria-hidden="true"
            >
              {Icon && (
                <Icon className={cn("h-4 w-4", iconClassName)} />
              )}
            </span>
            <span className="leading-tight">{label}</span>
            <span className="sr-only">profile link</span>
          </a>
        );
      })}
    </div>
  );
}
