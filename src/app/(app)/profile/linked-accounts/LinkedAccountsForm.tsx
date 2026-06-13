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
} from "@/lib/db/linked-accounts";
import {
  LucideIcon,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSocialUrl, normalizeUsername } from "@/lib/profile/socialLinks";
import { getSocialIconDefinition } from "@/components/profile/SocialIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AccountState {
  id?: string;
  url: string;
  username: string;
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

const USERNAME_PLACEHOLDERS: Partial<Record<SupportedPlatform, string>> = {
  tiktok: "@username",
  youtube: "@username",
};

export default function LinkedAccountsForm() {
  const { user } = useAuth();
  const userId = user?.id;
  const [accounts, setAccounts] = useState<Record<SupportedPlatform, AccountState>>({
    instagram: { url: "", username: "" },
    tiktok: { url: "", username: "" },
    youtube: { url: "", username: "" },
    spotify: { url: "", username: "" },
    snapchat: { url: "", username: "" },
    facebook: { url: "", username: "" },
    twitter: { url: "", username: "" },
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [editingPlatform, setEditingPlatform] = useState<SupportedPlatform | null>(null);
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
          const username = normalizeUsername(platform, acc.url);
          copy[platform] = { id: acc.id, url: acc.url, username };
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
    const rawInput = accounts[platform].username;
    const normalizedHandle = normalizeUsername(platform, rawInput);
    if (!normalizedHandle) {
      setError("Please enter a username");
      return;
    }

    const canonicalUrl = buildSocialUrl(platform, normalizedHandle);

    setSaving(platform);
    const { success, error: saveError } = await upsertLinkedAccount(
      userId,
      platform,
      { username: normalizedHandle, url: canonicalUrl }
    );
    setSaving(null);
    if (success) {
      setAccounts((prev) => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          url: canonicalUrl,
          username: normalizedHandle,
        },
      }));
      setEditingPlatform(null);
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
      setAccounts((prev) => ({ ...prev, [platform]: { url: "", username: "" } }));
      setEditingPlatform((current) => (current === platform ? null : current));
      setSuccess(`${PLATFORM_CONFIG[platform].label} link removed`);
    } else {
      setError(delError || "Failed to remove link");
    }
  };

  const renderRow = (platform: SupportedPlatform) => {
    const config = PLATFORM_CONFIG[platform];
    const definition = getSocialIconDefinition(platform);
    const Icon = definition.icon;
    const usernameValue = accounts[platform]?.username || "";
    const accountUrl = accounts[platform]?.url || "";
    const isConnected = Boolean(accounts[platform]?.url.trim().length);
    const isSaving = saving === platform;
    const isEditing = editingPlatform === platform;
    const placeholderBase = USERNAME_PLACEHOLDERS[platform] ?? "username";
    const subtext = formatAccountSubtext(platform, usernameValue, accountUrl);

    return (
      <div
        key={platform}
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/30",
          isEditing ? "flex-col items-stretch sm:flex-row sm:items-center" : "",
          isConnected ? "border-white/15 bg-white/[0.07]" : ""
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-white">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">{definition.label}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  isConnected
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-red-500/15 text-red-300"
                )}
              >
                {isConnected ? "Connected" : "Not connected"}
              </span>
            </div>
            <p className="mt-1 truncate text-xs uppercase tracking-[0.35em] text-white/50">
              {subtext}
            </p>
          </div>
        </div>

        {!isEditing ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={isSaving}>
              <button
                type="button"
                aria-label={`${config.label} account actions`}
                className="flex h-10 w-7 shrink-0 items-center justify-center text-white/55 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MoreVertical className="h-5 w-5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-36 rounded-xl border border-white/10 bg-black p-1 text-white shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
            >
              <DropdownMenuItem
                onClick={() => setEditingPlatform(platform)}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-white focus:bg-white/10 focus:text-white"
              >
                Edit
              </DropdownMenuItem>
              {isConnected ? (
                <DropdownMenuItem
                  onClick={() => handleRemove(platform)}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-red-300 focus:bg-red-500/15 focus:text-red-200"
                >
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:min-w-[360px]">
            <Input
              value={usernameValue}
              onChange={(e) =>
                setAccounts((prev) => ({
                  ...prev,
                  [platform]: { ...prev[platform], username: e.target.value },
                }))
              }
              placeholder={`${placeholderBase} only`}
              aria-label={`${config.label} username`}
              className="h-10 flex-1 rounded-xl border-white/10 bg-black/30 text-sm text-white placeholder:text-white/35 focus-visible:border-white/35 focus-visible:bg-black/40"
            />
            <Button
              onClick={() => handleSave(platform)}
              disabled={isSaving}
              size="sm"
              className="h-10 rounded-lg border border-white/10 bg-zinc-800 text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {isSaving ? "Saving" : isConnected ? "Update" : "Save"}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            {hasConnectedAccount ? "Connected profiles" : "No accounts connected yet"}
          </div>
          <p className="text-xs text-zinc-400">
            Enter usernames only. CREATOR builds and saves the public links.
          </p>
        </div>
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

      <div className="grid gap-3">
        {platformKeys.map((p) => renderRow(p))}
      </div>
    </section>
  );
}

function formatAccountSubtext(platform: SupportedPlatform, username: string, url: string) {
  const normalizedUsername = normalizeUsername(platform, username || url);
  if (normalizedUsername) {
    return `@${normalizedUsername}`;
  }

  if (url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  return "Username only";
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
