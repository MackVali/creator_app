"use client";

import { useEffect, useState } from "react";
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
}

export default function LinkedAccountsBar({ userId }: Props) {
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
    <div className="flex space-x-3 justify-center mt-4">
      {accounts.map((acc) => {
        const platform = acc.platform as SupportedPlatform;
        const Icon = ICON_MAP[platform];
        const color = PLATFORM_CONFIG[platform].color;
        return (
          <a
            key={acc.platform}
            href={acc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200"
            style={{ color }}
          >
            {Icon && <Icon className="h-5 w-5" />}
          </a>
        );
      })}
    </div>
  );
}
