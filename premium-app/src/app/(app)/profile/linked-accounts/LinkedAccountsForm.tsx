"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Instagram,
  Youtube,
  Twitter,
  Music,
  Music2,
  Ghost,
  Facebook,
  LucideIcon,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const platformKeys: SupportedPlatform[] = [
  "instagram",
  "tiktok",
  "youtube",
  "spotify",
  "snapchat",
  "facebook",
  "twitter",
];

const glassCardStyles =
  "relative overflow-hidden rounded-[28px] border border-white/10 bg-background/40 p-6 shadow-[0_25px_60px_-40px_rgba(15,23,42,0.65)] backdrop-blur";

const pillStyles =
  "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground";

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

  const hasConnectedAccount = useMemo(
    () => platformKeys.some((key) => Boolean(accounts[key]?.url.trim().length)),
    [accounts]
  );

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
    setSuccess(null);
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
      setAccounts((prev) => ({
        ...prev,
        [platform]: { ...prev[platform], url: cleaned },
      }));
      setSuccess(`${PLATFORM_CONFIG[platform].label} link saved`);
    } else {
      setError(saveError || "Failed to save link");
    }
  };

  const handleRemove = async (platform: SupportedPlatform) => {
    if (!userId) return;
    setError(null);
    setSuccess(null);
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
    const accentPrimary = withOpacity(config.color, 0.28);
    const accentSecondary = withOpacity(config.color, 0.08);
    const isSaving = saving === platform;

    return (
      <div
        key={platform}
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-white/20 hover:shadow-[0_25px_50px_-25px_rgba(15,23,42,0.65)]",
          value ? "shadow-[0_25px_60px_-45px_rgba(15,23,42,0.9)]" : ""
        )}
        style={{
          backgroundImage: `linear-gradient(135deg, ${accentSecondary}, rgba(17, 24, 39, 0.4)), linear-gradient(135deg, ${accentPrimary}, transparent)`
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 sm:items-center">
            <div
              className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/10 shadow-inner"
              style={{
                color: config.color,
                boxShadow: `0 12px 24px -12px ${withOpacity(config.color, 0.8)}`,
              }}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {config.label}
                {value ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    Connected
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Not linked yet
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground/80">
                {`https://${config.domain}`}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[280px] sm:flex-row sm:items-center">
            <Input
              value={value}
              onChange={(e) =>
                setAccounts((prev) => ({
                  ...prev,
                  [platform]: { ...prev[platform], url: e.target.value },
                }))
              }
              placeholder={`https://${config.domain}/username`}
              className="h-11 flex-1 rounded-xl border border-white/20 bg-white/5 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:border-white/40 focus-visible:bg-white/10"
            />
            <div className="flex gap-2 sm:w-auto">
              <Button
                onClick={() => handleSave(platform)}
                disabled={isSaving}
                size="sm"
                className="w-full sm:w-auto"
              >
                {isSaving ? "Saving" : value ? "Update" : "Save"}
              </Button>
              {value && (
                <Button
                  variant="outline"
                  onClick={() => handleRemove(platform)}
                  disabled={isSaving}
                  size="sm"
                  className="w-full border-white/30 bg-transparent text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground sm:w-auto"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className={glassCardStyles}>
      <CardContent className="space-y-6 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-white/5 px-6 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {hasConnectedAccount ? "Your socials are synced" : "Start connecting platforms"}
            </div>
            <p className="text-xs text-muted-foreground/80">
              Use polished, verified links to keep your profile feeling premium across the internet.
            </p>
          </div>
          <span className={pillStyles}>
            {hasConnectedAccount ? "Premium ready" : "Curated profile"}
          </span>
        </div>

        {(error || success) && (
          <div className="space-y-2">
            {error && (
              <StatusBanner
                tone="destructive"
                icon={AlertCircle}
                message={error}
              />
            )}
            {success && (
              <StatusBanner tone="success" icon={CheckCircle2} message={success} />
            )}
          </div>
        )}

        <div className="space-y-4">
          {platformKeys.map((p) => renderRow(p))}
        </div>
      </CardContent>
    </Card>
  );
}

function withOpacity(color: string, opacity: number) {
  const parsed = color.replace("#", "");
  if (parsed.length !== 6) {
    return color;
  }
  const bigint = parseInt(parsed, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

interface StatusBannerProps {
  tone: "success" | "destructive";
  icon: LucideIcon;
  message: string;
}

function StatusBanner({ tone, icon: Icon, message }: StatusBannerProps) {
  const isSuccess = tone === "success";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium",
        isSuccess
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
          : "border-destructive/30 bg-destructive/15 text-destructive"
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}
