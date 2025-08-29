"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  PLATFORM_CONFIG,
  SupportedPlatform,
  getLinkedAccounts,
  upsertLinkedAccount,
  deleteLinkedAccount,
  validateLinkedAccountUrl,
} from "@/lib/db/linked-accounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface AccountState {
  id?: string;
  url: string;
}

export default function LinkedAccountsForm() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [accounts, setAccounts] = useState<Record<SupportedPlatform, AccountState>>({
    instagram: { url: "" },
    tiktok: { url: "" },
    youtube: { url: "" },
    spotify: { url: "" },
    snapchat: { url: "" },
    facebook: { url: "" },
    twitter: { url: "" },
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!userId) return;
      const data = await getLinkedAccounts(userId);
      setAccounts((prev) => {
        const copy = { ...prev };
        data.forEach((acc) => {
          const platform = acc.platform as SupportedPlatform;
          copy[platform] = { id: acc.id, url: acc.url };
        });
        return copy;
      });
    }
    load();
  }, [userId]);

  const handleSave = async (platform: SupportedPlatform) => {
    if (!userId) return;
    setError(null);
    const url = accounts[platform].url.trim();
    const { valid, cleaned, error } = validateLinkedAccountUrl(platform, url);
    if (!valid || !cleaned) {
      setError(error || "Invalid URL");
      return;
    }
    setSaving(platform);
    const { success, error: saveError } = await upsertLinkedAccount(
      userId,
      platform,
      cleaned
    );
    setSaving(null);
    if (success) {
      setSuccess(`${PLATFORM_CONFIG[platform].label} link saved`);
    } else {
      setError(saveError || "Failed to save link");
    }
  };

  const handleRemove = async (platform: SupportedPlatform) => {
    if (!userId) return;
    setSaving(platform);
    const { success, error: delError } = await deleteLinkedAccount(userId, platform);
    setSaving(null);
    if (success) {
      setAccounts((prev) => ({ ...prev, [platform]: { url: "" } }));
      setSuccess(`${PLATFORM_CONFIG[platform].label} link removed`);
    } else {
      setError(delError || "Failed to remove link");
    }
  };

  const renderRow = (platform: SupportedPlatform) => {
    const Icon = ICON_MAP[platform];
    const config = PLATFORM_CONFIG[platform];
    const value = accounts[platform]?.url || "";
    return (
      <div key={platform} className="flex items-center space-x-3 py-2">
        <Icon className="h-5 w-5" style={{ color: config.color }} />
        <Input
          value={value}
          onChange={(e) =>
            setAccounts((prev) => ({
              ...prev,
              [platform]: { ...prev[platform], url: e.target.value },
            }))
          }
          placeholder={`https://${config.domain}/username`}
          className="flex-1"
        />
        <Button
          onClick={() => handleSave(platform)}
          disabled={saving === platform}
          size="sm"
        >
          Save
        </Button>
        {value && (
          <Button
            variant="outline"
            onClick={() => handleRemove(platform)}
            disabled={saving === platform}
            size="sm"
          >
            Remove
          </Button>
        )}
      </div>
    );
  };

  const platformKeys: SupportedPlatform[] = [
    "instagram",
    "tiktok",
    "youtube",
    "spotify",
    "snapchat",
    "facebook",
    "twitter",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Accounts</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
        {success && <p className="text-sm text-green-500 mb-2">{success}</p>}
        {platformKeys.map((p) => renderRow(p))}
      </CardContent>
    </Card>
  );
}
