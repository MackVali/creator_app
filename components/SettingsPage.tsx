"use client";

import React, { ReactNode, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/hooks/useProfile";
import type { Profile as ProfileType } from "@/lib/types";
import { updateProfilePreferences } from "@/lib/db";
import { getSupabaseBrowser } from "@/lib/supabase";
import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { useAuth } from "@/components/auth/AuthProvider";
import { useEntitlement } from "@/components/entitlement/EntitlementProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  FileText,
  Globe2,
  Info,
  Link2,
  Lock,
  Music,
  Moon,
  Pencil,
  RefreshCw,
  ShoppingBag,
  Shield,
  Timer,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  hapticComplete,
  hapticErrorPattern,
  hapticSnap,
  hapticSoftTick,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";
import {
  updateFocusGateSettings,
  useFocusGateStatus,
} from "@/lib/focus-gate/client";
import {
  getFocusGateAuthorizationStatus,
  getFocusGateEnforcementState,
  getFocusGateNativeAvailability,
  getFocusGateSelectionSummary,
  presentFocusGateActivityPicker,
  requestFocusGateAuthorization,
  syncFocusGateAllowance,
  type FocusGateNativeAvailability,
  type FocusGateSelectionSummary,
} from "@/lib/focus-gate/focusGateNative";
import type {
  FocusGateNativeAuthorizationStatus,
  FocusGateNativeEnforcementState,
} from "@/lib/focus-gate/types";

const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Australia/Sydney",
];

const getLocalTimeZone = () => {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && resolved.trim()) {
      return resolved;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Unable to resolve local time zone", error);
    }
  }
  return "UTC";
};

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (input: string) => string[];
};

type AccessRoleMetadata = {
  role?: unknown;
  roles?: unknown;
  is_admin?: unknown;
};

const normalizeAccessRole = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
};

const collectAccessRoles = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectAccessRoles);
  }

  return [];
};

const userHasAdminAccess = (
  user: {
    user_metadata?: AccessRoleMetadata | null;
    app_metadata?: AccessRoleMetadata | null;
  } | null,
) => {
  if (!user) {
    return false;
  }

  const userMetadata = user.user_metadata ?? {};
  const appMetadata = user.app_metadata ?? {};

  if (userMetadata.is_admin === true || appMetadata.is_admin === true) {
    return true;
  }

  const roles = [
    ...collectAccessRoles(userMetadata.role),
    ...collectAccessRoles(appMetadata.role),
    ...collectAccessRoles(userMetadata.roles),
    ...collectAccessRoles(appMetadata.roles),
  ];

  return roles.some((role) => normalizeAccessRole(role) === "admin");
};

const getSupportedTimeZones = () => {
  const intl = Intl as IntlWithSupportedValues;
  if (typeof intl.supportedValuesOf === "function") {
    try {
      const zones = intl.supportedValuesOf("timeZone");
      if (Array.isArray(zones) && zones.length > 0) {
        return zones;
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Unable to resolve supported time zones", error);
      }
    }
  }
  return FALLBACK_TIMEZONES;
};

const formatTimeZoneLabel = (timeZone: string) => {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(new Date());
    const zoneName = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    return zoneName && zoneName !== timeZone ? `${timeZone} (${zoneName})` : timeZone;
  } catch {
    return timeZone;
  }
};

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const { profile, userId, loading, error, refreshProfile } = useProfile();
  const { user } = useAuth();
  const { isPlus, is_active, isReady, current_period_end } = useEntitlement();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [savingPreference, setSavingPreference] = useState({
    notifications: false,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string>(() => getLocalTimeZone());
  const [savingTimezone, setSavingTimezone] = useState(false);
  const baseTimeZones = useMemo(() => getSupportedTimeZones(), []);
  const timezoneOptions = useMemo(() => {
    const zones =
      timezone && !baseTimeZones.includes(timezone)
        ? [timezone, ...baseTimeZones]
        : baseTimeZones;
    return zones.map((tz) => ({
      value: tz,
      label: formatTimeZoneLabel(tz),
    }));
  }, [baseTimeZones, timezone]);
  const router = useRouter();

  const planStatusLabel = !isReady ? "Loading" : is_active ? "Active" : "Free plan";
  const accessLevelLabel = userHasAdminAccess(user)
    ? "ADMIN"
    : userHasAppManagerAccess(user)
      ? "MANAGER"
      : isPlus || is_active
        ? "PRO"
        : null;
  const handlePlanAction = () => router.push("/settings/billing");
  const planRenewalDate = (() => {
    if (!current_period_end) {
      return null;
    }
    const parsedDate = new Date(current_period_end);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }
    return parsedDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  })();

  useEffect(() => {
    const authUser = user ?? null;
    setEmail(authUser?.email ?? "");
  }, [user]);

  useEffect(() => {
    if (profile) {
      setNotifications(profile.notifications_enabled ?? true);
      const profileTimezone =
        profile.timezone && profile.timezone.trim().length > 0
          ? profile.timezone
          : getLocalTimeZone();
      setTimezone(profileTimezone);
      setPreferenceError(null);
    } else {
      setNotifications(true);
      setTimezone(getLocalTimeZone());
    }
  }, [profile]);

  const handleNotificationsToggle = async () => {
    if (!userId || savingPreference.notifications) return;

    setPreferenceError(null);
    const previousValue = notifications;
    const nextValue = !notifications;
    void hapticSoftTick();
    setNotifications(nextValue);
    setSavingPreference((prev) => ({ ...prev, notifications: true }));

    const { error } = await updateProfilePreferences(userId, {
      notifications_enabled: nextValue,
    });

    if (error) {
      console.error("Failed to update notifications preference:", error);
      void hapticErrorPattern();
      setNotifications(previousValue);
      setPreferenceError("We couldn't save your preferences. Please try again.");
    } else {
      await refreshProfile();
    }

    setSavingPreference((prev) => ({ ...prev, notifications: false }));
  };

  const handleTimezoneChange = async (nextTimezone: string) => {
    if (!userId || savingTimezone) return;
    if (!nextTimezone || nextTimezone === timezone) return;

    setPreferenceError(null);
    const previousValue = timezone;
    void hapticSoftTick();
    setTimezone(nextTimezone);
    setSavingTimezone(true);

    const { error: timezoneError } = await updateProfilePreferences(userId, {
      timezone: nextTimezone,
    });

    if (timezoneError) {
      console.error("Failed to update timezone preference:", timezoneError);
      void hapticErrorPattern();
      setTimezone(previousValue);
      setPreferenceError("We couldn't save your preferences. Please try again.");
    } else {
      await refreshProfile();
    }

    setSavingTimezone(false);
  };

  const initials = loading
    ? ""
    : getInitials(profile?.name || profile?.username || null, email);
  const isDarkTheme = theme === "dark";

  const handleRetry = () => {
    void refreshProfile();
  };

  const openDeleteDialog = () => {
    setDeleteDialogOpen(true);
    setDeleteConfirmation("");
    setDeleteError(null);
  };

  const closeDeleteDialog = () => {
    if (deletingAccount) return;
    void hapticSnap();
    setDeleteDialogOpen(false);
    setDeleteConfirmation("");
    setDeleteError(null);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE" || deletingAccount) {
      void hapticWarningPattern();
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);

    try {
      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        void hapticErrorPattern();
        setDeleteError(result?.error || "We couldn't delete your account. Please try again.");
        setDeletingAccount(false);
        return;
      }

      void hapticComplete();
      const supabase = getSupabaseBrowser();
      await supabase?.auth.signOut().catch(() => undefined);
      router.replace("/auth");
      router.refresh();
    } catch (error) {
      console.error("Failed to delete account:", error);
      void hapticErrorPattern();
      setDeleteError("We couldn't delete your account. Please try again.");
      setDeletingAccount(false);
    }
  };

  const mainContent: ReactNode = loading ? (
    <SettingsLoadingState />
  ) : error ? (
    <SettingsErrorState message={error} onRetry={handleRetry} />
  ) : (
    <>
      <section className="grid gap-6">
        <section className="app-premium-panel relative overflow-hidden rounded-[28px] border">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-80"
            style={{ backgroundImage: "url('/images/paywall-stone-bg.png')" }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(110,231,183,0.17),transparent_30%),radial-gradient(ellipse_at_88%_92%,rgba(0,0,0,0.78),transparent_54%),linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.6))]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-emerald-100/70 to-transparent"
          />
          <div className="relative z-10 grid gap-6 px-6 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-7">
            <div className="flex gap-4">
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-white/18 bg-black/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_14px_28px_rgba(0,0,0,0.4)]">
                <Image
                  src="/images/creator-logo.png"
                  alt=""
                  width={48}
                  height={48}
                  className="h-full w-full rounded-[14px] object-cover"
                />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.42em] text-emerald-300">
                    CREATOR Pro
                  </p>
                  {isPlus && (
                    <span className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      {planStatusLabel}
                    </span>
                  )}
                </div>
                {!isPlus && (
                  <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-normal text-[var(--text)]">
                    Upgrade when your system outgrows free.
                  </h2>
                )}
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                  {isPlus
                    ? "Full CREATOR Pro planning and execution layer is unlocked."
                    : "More room for goals, projects, tasks, and habits. Bigger roadmaps for bigger life systems."}
                </p>
                {planRenewalDate && (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Renews {planRenewalDate}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handlePlanAction}
              className={
                isPlus
                  ? "app-button inline-flex h-12 items-center justify-center rounded-2xl px-5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-300/55"
                  : "focus-pomo-start-glint inline-flex h-12 items-center justify-center rounded-2xl border border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] px-5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(0,0,0,0.48),0_8px_18px_rgba(0,6,4,0.34),inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-green-800/45"
              }
            >
              {isPlus ? "Manage plan" : "Upgrade to CREATOR Pro"}
            </button>
          </div>
        </section>
      </section>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ProfileOverview
          profile={profile}
          email={email}
          initials={initials}
          onEdit={() => router.push("/profile/edit")}
          onViewProfile={(handle) => router.push(`/profile/${handle}`)}
        />
        <SettingsCard
          title="Account & security"
          description="Control where your account is connected and how you sign in."
        >
          <SettingsActionRow
            icon={ShoppingBag}
            title="Order history"
            onClick={() => router.push("/settings/orders")}
          />
          <SettingsActionRow
            icon={Link2}
            title="Linked accounts"
            onClick={() => router.push("/profile/linked-accounts")}
          />
          <SettingsStaticRow
            icon={Lock}
            title="Password"
            value="Managed externally"
          />
          <SettingsStaticRow
            icon={Shield}
            title="Two-factor authentication"
            value="Coming soon"
          />
          <SettingsActionRow
            icon={Trash2}
            title="Delete account"
            onClick={openDeleteDialog}
          />
        </SettingsCard>
      </section>

      <FocusGateSettingsCard />

      <section className="grid gap-6 lg:grid-cols-2">
        <SettingsCard
          title="Preferences"
          description="Dial in the experience so the interface feels familiar."
        >
          {preferenceError && (
            <p className="px-6 pt-4 text-sm text-red-400">{preferenceError}</p>
          )}
          <SettingsToggleRow
            icon={Moon}
            title="Dark mode"
            description={isDarkTheme ? "Current theme: Dark" : "Current theme: Light"}
            checked={isDarkTheme}
            onChange={() => {
              void hapticSoftTick();
              toggleTheme();
            }}
            ariaLabel="Toggle theme"
          />
          <SettingsToggleRow
            icon={Bell}
            title="Notifications"
            checked={notifications}
            onChange={handleNotificationsToggle}
            ariaLabel="Toggle notifications"
            disabled={!userId || savingPreference.notifications}
          />
          <SettingsStaticRow
            icon={Music}
            title="Ambient Sound (experimental)"
            value="Disabled"
          />
          <SettingsSelectRow
            icon={Globe2}
            title="Timezone"
            value={timezone}
            options={timezoneOptions}
            onChange={handleTimezoneChange}
            disabled={!userId || savingTimezone}
          />
          <SettingsStaticRow
            icon={Globe2}
            title="Language"
            value="English (US)"
          />
        </SettingsCard>

        <SettingsCard
          title="About Creator"
          description="Stay informed about policies and the version you're using."
        >
          <SettingsActionRow
            icon={FileText}
            title="Terms of Service"
            onClick={() => router.push("/legal/terms")}
          />
          <SettingsActionRow
            icon={Shield}
            title="Privacy Policy"
            onClick={() => router.push("/legal/privacy")}
          />
          <SettingsStaticRow
            icon={Info}
            title="App version"
            value="v1.0.0"
          />
        </SettingsCard>
      </section>

    </>
  );

  return (
    <div
      className="app-bg app-settings-bg min-h-screen"
    >
      <header className="app-top-nav sticky top-0 z-10 border-b backdrop-blur">
        <div className="relative mx-auto flex max-w-5xl items-center justify-between px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)]">
          <button
            type="button"
            aria-label="Go back to dashboard"
            onClick={() => {
              void hapticSnap();
              router.push("/dashboard");
            }}
            className="inline-flex h-9 w-9 items-center justify-center text-[var(--text)] transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <span aria-hidden="true" className="text-3xl font-light leading-none">
              ‹
            </span>
          </button>
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-lg font-semibold leading-tight">
            Settings
          </h1>
          {accessLevelLabel ? (
            <span className="focus-pomo-start-glint relative inline-flex shrink-0 overflow-hidden text-right text-base font-black uppercase leading-tight tracking-[0.16em] text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.28)]">
              <span>{accessLevelLabel}</span>
            </span>
          ) : (
            <span className="h-9 w-[76px] shrink-0" aria-hidden="true" />
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-4">{mainContent}</main>
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeDeleteDialog}
            aria-hidden="true"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="app-card relative w-full max-w-md rounded-2xl border border-red-500/30 p-6 shadow-2xl"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-200">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="delete-account-title" className="text-lg font-semibold text-[var(--text)]">
                  Delete account
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  This permanently deletes your CREATOR account. This action cannot be
                  undone.
                </p>
              </div>
            </div>
            <label className="mt-6 block text-sm font-medium text-[var(--text)]" htmlFor="delete-confirmation">
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              disabled={deletingAccount}
              autoCapitalize="characters"
              autoComplete="off"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {deleteError ? (
              <p className="mt-3 text-sm text-red-300" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={deletingAccount}
                className="app-button inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmation !== "DELETE" || deletingAccount}
                className="inline-flex items-center justify-center rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingAccount ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

type ProfileOverviewProps = {
  profile: ProfileType | null;
  email: string;
  initials: string;
  onEdit: () => void;
  onViewProfile?: (handle: string) => void;
};

function SettingsLoadingState() {
  return (
    <div
      className="flex flex-col items-center gap-4 py-24 text-[var(--muted)]"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="h-12 w-12 animate-spin rounded-full border-2 border-[var(--border)] border-t-transparent"
      />
      <p className="text-sm">Loading your settings…</p>
    </div>
  );
}

type SettingsErrorStateProps = {
  message: string;
  onRetry: () => void;
};

function SettingsErrorState({ message, onRetry }: SettingsErrorStateProps) {
  return (
    <div
      className="mx-auto max-w-2xl rounded-2xl border border-red-500/30 bg-red-500/10 px-8 py-10 text-center"
      role="alert"
      aria-live="assertive"
    >
      <p className="text-base font-semibold text-red-100">
        We couldn&apos;t load your settings.
      </p>
      <p className="mt-2 text-sm text-red-200/80">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-red-50 transition hover:border-white/40 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-red-200/60"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}

function ProfileOverview({ profile, email, initials, onEdit, onViewProfile }: ProfileOverviewProps) {
  const handle = profile?.username?.trim();
  const displayName =
    profile?.name?.trim() ||
    handle ||
    email ||
    "Your profile";
  const secondaryIdentifier = handle ? `@${handle}` : email && email !== displayName ? email : null;
  const avatarUrl = profile?.avatar_url;

  return (
    <section className="app-settings-surface overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <ProfileAvatar src={avatarUrl} alt={displayName} fallback={initials} />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Profile overview</p>
            <h2 className="truncate text-base font-semibold leading-tight text-[var(--text)]">
              {displayName}
            </h2>
            {secondaryIdentifier && (
              <p className="mt-0.5 truncate text-xs leading-5 text-[var(--muted)]">
                {secondaryIdentifier}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <SecondaryButton onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit profile
          </SecondaryButton>
          {handle && onViewProfile && (
            <SecondaryButton onClick={() => onViewProfile(handle)}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              View public profile
            </SecondaryButton>
          )}
        </div>
      </div>
    </section>
  );
}

type SecondaryButtonProps = {
  onClick?: () => void;
  children: ReactNode;
};

function SecondaryButton({ onClick, children }: SecondaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--subtle-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
    >
      {children}
    </button>
  );
}

type ProfileAvatarProps = {
  src?: string | null;
  alt: string;
  fallback: string;
};

function ProfileAvatar({ src, alt, fallback }: ProfileAvatarProps) {
  const fallbackValue = fallback || alt.charAt(0).toUpperCase();

  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={64}
        height={64}
        unoptimized
        className="h-11 w-11 rounded-xl object-cover shadow-md shadow-black/25"
      />
    );
  }

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--subtle-surface)] text-sm font-semibold text-[var(--text)] shadow-inner shadow-black/10">
      {fallbackValue}
    </div>
  );
}

type SettingsCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

function SettingsCard({ title, description, children }: SettingsCardProps) {
  return (
    <section className="app-settings-surface overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{description}</p>
        )}
      </div>
      <div className="divide-y divide-[var(--border)]">{children}</div>
    </section>
  );
}

type SettingsActionRowProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  onClick: () => void;
};

function SettingsActionRow({ icon: Icon, title, description, onClick }: SettingsActionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition-colors duration-200 hover:bg-[var(--subtle-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] sm:px-6"
    >
      <SettingsIcon icon={Icon} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{description}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden="true" />
    </button>
  );
}

type SettingsToggleRowProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  disabled?: boolean;
};

function SettingsToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}: SettingsToggleRowProps) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-5 py-3 sm:px-6">
      <SettingsIcon icon={Icon} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{description}</p>
        )}
      </div>
      <ToggleSwitch
        checked={checked}
        onChange={onChange}
        ariaLabel={ariaLabel}
        disabled={disabled}
      />
    </div>
  );
}

type SettingsSelectRowProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

function SettingsSelectRow({
  icon: Icon,
  title,
  description,
  value,
  options,
  onChange,
  disabled = false,
}: SettingsSelectRowProps) {
  return (
    <div className="flex min-h-14 flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 gap-3">
        <SettingsIcon icon={Icon} />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight text-[var(--text)]">{title}</p>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{description}</p>
          )}
        </div>
      </div>
      <div className="sm:min-w-[220px]">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={title}
          className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--subtle-surface)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type SettingsStaticRowProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  value?: string;
};

function SettingsStaticRow({ icon: Icon, title, description, value }: SettingsStaticRowProps) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-5 py-3 sm:px-6">
      <SettingsIcon icon={Icon} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{description}</p>
        )}
      </div>
      {value && (
        <span className="shrink-0 text-right text-xs font-medium text-[var(--muted)]">{value}</span>
      )}
    </div>
  );
}

function FocusGateSettingsCard() {
  const { status, isLoading, isRefreshing, error, invalidate } = useFocusGateStatus();
  const [minutesPerXp, setMinutesPerXp] = useState("5");
  const [dailyMaxMinutes, setDailyMaxMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [availability, setAvailability] =
    useState<FocusGateNativeAvailability | null>(null);
  const [authorizationStatus, setAuthorizationStatus] =
    useState<FocusGateNativeAuthorizationStatus>("unavailable");
  const [selectionSummary, setSelectionSummary] =
    useState<FocusGateSelectionSummary | null>(null);
  const [, setEnforcementState] =
    useState<FocusGateNativeEnforcementState | null>(null);
  const [nativeBusy, setNativeBusy] = useState(false);
  const [nativeError, setNativeError] = useState<string | null>(null);

  useEffect(() => {
    if (!status) return;
    setMinutesPerXp(String(status.minutesPerXp));
    setDailyMaxMinutes(
      status.dailyMaxMinutes === null ? "" : String(status.dailyMaxMinutes)
    );
  }, [status]);

  useEffect(() => {
    const nextAvailability = getFocusGateNativeAvailability();
    setAvailability(nextAvailability);
    if (!nextAvailability.canUse) return;

    const loadNativeState = async () => {
      const [authorization, selection, enforcement] = await Promise.all([
        getFocusGateAuthorizationStatus(),
        getFocusGateSelectionSummary(),
        getFocusGateEnforcementState(),
      ]);
      setAuthorizationStatus(authorization.status);
      setSelectionSummary(selection);
      setEnforcementState(enforcement);
    };

    void loadNativeState().catch((error) => {
      console.error("Failed to load Focus Gate native state:", error);
      setNativeError(
        error instanceof Error ? error.message : "Unable to load native Focus Gate state."
      );
    });
  }, []);

  useEffect(() => {
    if (!status) return;
    const nativeAvailability = getFocusGateNativeAvailability();
    if (!nativeAvailability.canUse) return;

    void syncFocusGateAllowance({
        enabled: status.enabled,
        xpToday: status.xpToday,
        allowedMinutes: status.allowedMinutes,
        creatorDayStartsAt: status.creatorDay.startsAt,
        creatorDayEndsAt: status.creatorDay.endsAt,
        timezone: status.creatorDay.timezone,
      })
      .then((result) => {
        if (result.ok) {
          setEnforcementState(result.state);
          setAuthorizationStatus(result.state.authorizationStatus);
          setSelectionSummary({
            selectionStatus: result.state.selectionStatus,
            hasSelection: result.state.selectionStatus === "configured",
            applicationCount: result.state.applicationCount ?? null,
            categoryCount: result.state.categoryCount ?? null,
            webDomainCount: result.state.webDomainCount ?? null,
            totalTokenCount: result.state.totalTokenCount ?? null,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to sync Focus Gate allowance:", error);
        setNativeError(
          error instanceof Error ? error.message : "Unable to sync native Focus Gate."
        );
      });
  }, [status]);

  const refreshNativeState = async () => {
    const [authorization, selection, enforcement] = await Promise.all([
      getFocusGateAuthorizationStatus(),
      getFocusGateSelectionSummary(),
      getFocusGateEnforcementState(),
    ]);
    setAuthorizationStatus(authorization.status);
    setSelectionSummary(selection);
    setEnforcementState(enforcement);
  };

  const requestNativeAuthorization = async () => {
    if (nativeBusy) return;
    setNativeBusy(true);
    setNativeError(null);
    try {
      const authorization = await requestFocusGateAuthorization();
      setAuthorizationStatus(authorization.status);
      await refreshNativeState();
    } catch (error) {
      console.error("Failed to request Screen Time authorization:", error);
      setNativeError(
        error instanceof Error ? error.message : "Unable to request Screen Time authorization."
      );
    } finally {
      setNativeBusy(false);
    }
  };

  const chooseProtectedApps = async () => {
    if (nativeBusy) return;
    setNativeBusy(true);
    setNativeError(null);
    try {
      let authorization = authorizationStatus;
      if (authorization !== "approved") {
        const result = await requestFocusGateAuthorization();
        authorization = result.status;
        setAuthorizationStatus(result.status);
      }
      if (authorization !== "approved") {
        setNativeError("Screen Time authorization is required before choosing protected apps.");
        return;
      }

      const result = await presentFocusGateActivityPicker();
      if (result.ok) {
        setSelectionSummary(result.summary);
      }
      await refreshNativeState();
      if (status) {
        const synced = await syncFocusGateAllowance({
          enabled: status.enabled,
          xpToday: status.xpToday,
          allowedMinutes: status.allowedMinutes,
          creatorDayStartsAt: status.creatorDay.startsAt,
          creatorDayEndsAt: status.creatorDay.endsAt,
          timezone: status.creatorDay.timezone,
        });
        if (synced.ok) {
          setEnforcementState(synced.state);
        }
      }
    } catch (error) {
      console.error("Failed to choose protected apps:", error);
      setNativeError(
        error instanceof Error ? error.message : "Unable to choose protected apps."
      );
    } finally {
      setNativeBusy(false);
    }
  };

  const saveSettings = async (
    updates: Parameters<typeof updateFocusGateSettings>[0]
  ) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateFocusGateSettings(updates);
      await invalidate();
      void hapticComplete();
    } catch (error) {
      console.error("Failed to save Focus Gate settings:", error);
      void hapticErrorPattern();
      setSaveError(
        error instanceof Error ? error.message : "Unable to save Focus Gate."
      );
    } finally {
      setSaving(false);
    }
  };

  const commitMinutesPerXp = () => {
    const parsed = Number(minutesPerXp);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 120) {
      setMinutesPerXp(String(status?.minutesPerXp ?? 5));
      setSaveError("Minutes per XP must be between 1 and 120.");
      void hapticWarningPattern();
      return;
    }
    if (parsed !== status?.minutesPerXp) {
      void saveSettings({ minutesPerXp: parsed });
    }
  };

  const commitDailyMax = () => {
    const trimmed = dailyMaxMinutes.trim();
    if (!trimmed) {
      if (status?.dailyMaxMinutes !== null) {
        void saveSettings({ dailyMaxMinutes: null });
      }
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1440) {
      setDailyMaxMinutes(
        status?.dailyMaxMinutes === null ? "" : String(status?.dailyMaxMinutes ?? "")
      );
      setSaveError("Daily maximum must be between 1 and 1440 minutes.");
      void hapticWarningPattern();
      return;
    }
    if (parsed !== status?.dailyMaxMinutes) {
      void saveSettings({ dailyMaxMinutes: parsed });
    }
  };

  const protectedSelectionLabel = focusGateSelectionLabel(selectionSummary);
  const screenTimeEarnedLabel = isLoading
    ? "..."
    : `${status?.allowedMinutes ?? 0} min earned`;

  return (
    <section className="app-settings-surface overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight text-[var(--text)]">Focus Gate</h2>
          <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">
            XP-backed Screen Time allowance.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            {status?.enabled ? "On" : "Off"}
          </span>
          <ToggleSwitch
            checked={status?.enabled ?? false}
            onChange={() => {
              void hapticSoftTick();
              void saveSettings({ enabled: !(status?.enabled ?? false) });
            }}
            ariaLabel="Toggle Focus Gate"
            disabled={isLoading || saving}
          />
        </div>
      </div>
      {error || saveError || nativeError ? (
        <p className="border-b border-[var(--border)] px-5 py-3 text-sm text-red-400 sm:px-6">
          {saveError ?? error ?? nativeError}
        </p>
      ) : null}
      <div className="grid grid-cols-2 divide-x divide-[var(--border)] border-b border-[var(--border)]">
        <FocusGateMetric label="XP Today" value={isLoading ? "..." : `${status?.xpToday ?? 0} XP`} />
        <FocusGateMetric label="Screen Time" value={screenTimeEarnedLabel} />
      </div>
      <div className="grid grid-cols-2 divide-x divide-[var(--border)] border-b border-[var(--border)]">
        <div className="min-w-0 px-4 py-3 sm:px-6">
          <label
            className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]"
            htmlFor="focus-gate-minutes-per-xp"
          >
            Rate
          </label>
          <div className="mt-2 flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] pr-2 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
            <Timer className="ml-3 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" aria-hidden="true" />
            <input
              id="focus-gate-minutes-per-xp"
              inputMode="numeric"
              type="number"
              min={1}
              max={120}
              value={minutesPerXp}
              disabled={isLoading || saving}
              onChange={(event) => setMinutesPerXp(event.target.value)}
              onBlur={commitMinutesPerXp}
              aria-label="Screen Time Rate minutes per XP"
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm font-semibold text-[var(--text)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              min/XP
            </span>
          </div>
        </div>
        <div className="min-w-0 px-4 py-3 sm:px-6">
          <label
            className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]"
            htmlFor="focus-gate-daily-max"
          >
            Daily Limit
          </label>
          <div className="mt-2 flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] pr-2 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
            <input
              id="focus-gate-daily-max"
              inputMode="numeric"
              type="number"
              min={1}
              max={1440}
              placeholder="No limit"
              value={dailyMaxMinutes}
              disabled={isLoading || saving}
              onChange={(event) => setDailyMaxMinutes(event.target.value)}
              onBlur={commitDailyMax}
              aria-label="Focus Gate daily limit"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            {dailyMaxMinutes.trim() ? (
              <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                min
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 px-5 py-3 sm:px-6">
        <SettingsIcon icon={Lock} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text)]">Protected Apps</p>
          <p className="mt-0.5 truncate text-xs leading-5 text-[var(--muted)]">
            {protectedSelectionLabel}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {authorizationStatus !== "approved" && availability?.canUse ? (
            <button
              type="button"
              disabled={nativeBusy}
              onClick={requestNativeAuthorization}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--subtle-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Authorize
            </button>
          ) : null}
          <button
            type="button"
            disabled={!availability?.canUse || nativeBusy}
            onClick={chooseProtectedApps}
            className="inline-flex min-h-9 items-center justify-center rounded-xl bg-[var(--accent)] px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Edit
          </button>
        </div>
      </div>
      {isRefreshing ? (
        <p className="border-t border-[var(--border)] px-5 py-2 text-xs text-[var(--muted)] sm:px-6">
          Refreshing Focus Gate status.
        </p>
      ) : null}
    </section>
  );
}

function FocusGateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3 sm:px-6">
      <p className="truncate text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold leading-tight text-[var(--text)] sm:text-lg">
        {value}
      </p>
    </div>
  );
}

function focusGateSelectionLabel(selectionSummary: FocusGateSelectionSummary | null) {
  if (
    selectionSummary?.totalTokenCount === null ||
    selectionSummary?.totalTokenCount === undefined
  ) {
    return "Not configured";
  }

  if (selectionSummary.totalTokenCount <= 0) {
    return "No protected apps";
  }

  const pieces = [
    focusGateCountLabel(selectionSummary.applicationCount, "app"),
    focusGateCountLabel(selectionSummary.categoryCount, "category"),
    focusGateCountLabel(selectionSummary.webDomainCount, "website"),
  ].filter(Boolean);

  return pieces.length > 0 ? pieces.join(" · ") : `${selectionSummary.totalTokenCount} selected`;
}

function focusGateCountLabel(value: number | null | undefined, singular: string) {
  if (!value) return null;
  return `${value} ${singular}${value === 1 ? "" : "s"} selected`;
}

type SettingsIconProps = {
  icon: LucideIcon;
};

function SettingsIcon({ icon: Icon }: SettingsIconProps) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--subtle-surface)]">
      <Icon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
    </span>
  );
}

type ToggleSwitchProps = {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  disabled?: boolean;
};

function ToggleSwitch({ checked, onChange, ariaLabel, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${
        checked ? "bg-[var(--accent)]" : "bg-[var(--subtle-surface)]"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function getInitials(name: string | null, email: string) {
  if (name) {
    return name
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();
  }

  if (email) {
    return email.charAt(0).toUpperCase();
  }

  return "";
}
