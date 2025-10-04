"use client";

import { ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/hooks/useProfile";
import { getCurrentUser } from "@/lib/auth";
import type { Profile as ProfileType } from "@/lib/types";
import { updateProfilePreferences } from "@/lib/db";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  FileText,
  Globe2,
  Info,
  Link2,
  Lock,
  Moon,
  Pencil,
  Shield,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const { profile, userId, refreshProfile } = useProfile();
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [savingPreference, setSavingPreference] = useState({
    darkMode: false,
    notifications: false,
  });
  const router = useRouter();

  useEffect(() => {
    async function loadEmail() {
      const user = await getCurrentUser();
      setEmail(user?.email || "");

      if (user) {
        const possibleRoles = new Set<string>();
        const addRole = (value: unknown) => {
          if (typeof value === "string") {
            possibleRoles.add(value.toLowerCase());
          }
        };

        const addRoles = (values: unknown) => {
          if (Array.isArray(values)) {
            values.forEach((role) => addRole(role));
          }
        };

        addRole(user.user_metadata?.role);
        addRole(user.app_metadata?.role);
        addRoles(user.user_metadata?.roles);
        addRoles(user.app_metadata?.roles);

        if (user.user_metadata?.is_admin === true || user.app_metadata?.is_admin === true) {
          possibleRoles.add("admin");
        }

        setIsAdmin(possibleRoles.has("admin"));
      } else {
        setIsAdmin(false);
      }
    }

    loadEmail();
  }, []);

  useEffect(() => {
    if (profile) {
      setDarkMode(profile.prefers_dark_mode ?? false);
      setNotifications(profile.notifications_enabled ?? true);
      setPreferenceError(null);
    } else {
      setDarkMode(false);
      setNotifications(true);
    }
  }, [profile]);

  const handleDarkModeToggle = async () => {
    if (!userId || savingPreference.darkMode) return;

    setPreferenceError(null);
    const previousValue = darkMode;
    const nextValue = !darkMode;
    setDarkMode(nextValue);
    setSavingPreference((prev) => ({ ...prev, darkMode: true }));

    const { error } = await updateProfilePreferences(userId, {
      prefers_dark_mode: nextValue,
    });

    if (error) {
      console.error("Failed to update dark mode preference:", error);
      setDarkMode(previousValue);
      setPreferenceError("We couldn't save your preferences. Please try again.");
    } else {
      await refreshProfile();
    }

    setSavingPreference((prev) => ({ ...prev, darkMode: false }));
  };

  const handleNotificationsToggle = async () => {
    if (!userId || savingPreference.notifications) return;

    setPreferenceError(null);
    const previousValue = notifications;
    const nextValue = !notifications;
    setNotifications(nextValue);
    setSavingPreference((prev) => ({ ...prev, notifications: true }));

    const { error } = await updateProfilePreferences(userId, {
      notifications_enabled: nextValue,
    });

    if (error) {
      console.error("Failed to update notifications preference:", error);
      setNotifications(previousValue);
      setPreferenceError("We couldn't save your preferences. Please try again.");
    } else {
      await refreshProfile();
    }

    setSavingPreference((prev) => ({ ...prev, notifications: false }));
  };

  const initials = getInitials(profile?.name || profile?.username || null, email);

  return (
    <div
      className="min-h-screen text-[var(--text)]"
      style={{
        backgroundColor: "var(--bg)",
        backgroundImage: "var(--bg-gradient)",
      }}
    >
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Go back to dashboard"
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back</span>
            </button>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Your space</p>
              <h1 className="text-xl font-semibold leading-tight">Settings</h1>
              <p className="text-sm text-[var(--muted)]">Tune Creator to match the way you work.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[var(--muted)]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Account secure
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-12 px-4 pb-16 pt-10">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ProfileOverview
            profile={profile}
            email={email}
            initials={initials}
            onEdit={() => router.push("/profile/edit")}
            onViewProfile={(handle) => router.push(`/profile/${handle}`)}
          />
          <SettingsCard
            title="Security & access"
            description="Control where your account is connected and how you sign in."
          >
            <SettingsActionRow
              icon={Link2}
              title="Linked accounts"
              description="Manage the services connected to your Creator profile."
              onClick={() => router.push("/profile/linked-accounts")}
            />
            <SettingsStaticRow
              icon={Lock}
              title="Password"
              description="Passwords are handled by your authentication provider."
              value="Managed externally"
            />
            <SettingsStaticRow
              icon={Shield}
              title="Two-factor authentication"
              description="Add another layer of protection to your account."
              value="Coming soon"
            />
          </SettingsCard>
        </section>

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
              description="Reduce eye strain with our midnight palette."
              checked={darkMode}
              onChange={handleDarkModeToggle}
              ariaLabel="Toggle dark mode"
              disabled={!userId || savingPreference.darkMode}
            />
            <SettingsToggleRow
              icon={Bell}
              title="Notifications"
              description="Get nudges when teammates share something important."
              checked={notifications}
              onChange={handleNotificationsToggle}
              ariaLabel="Toggle notifications"
              disabled={!userId || savingPreference.notifications}
            />
            <SettingsStaticRow
              icon={Globe2}
              title="Language"
              description="Choose the language used throughout the dashboard."
              value="English (US)"
            />
          </SettingsCard>

          <SettingsCard
            title="About Creator"
            description="Stay informed about policies and the version you're using."
          >
            <SettingsStaticRow
              icon={FileText}
              title="Terms of Service"
              description="Read the agreement that keeps everything running smoothly."
              value="Coming soon"
            />
            <SettingsStaticRow
              icon={Shield}
              title="Privacy Policy"
              description="Learn how we handle your data and respect your privacy."
              value="Coming soon"
            />
            <SettingsStaticRow
              icon={Info}
              title="App version"
              description="You're running the latest build available."
              value="v1.0.0"
            />
          </SettingsCard>
        </section>

        {isAdmin && (
          <section className="grid gap-6">
            <SettingsCard
              title="Administration"
              description="Manage application-wide content and messaging."
            >
              <SettingsActionRow
                icon={FileText}
                title="Content overrides"
                description="Update any copy that appears throughout the app."
                onClick={() => router.push("/settings/content")}
              />
            </SettingsCard>
          </section>
        )}
      </main>
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

function ProfileOverview({ profile, email, initials, onEdit, onViewProfile }: ProfileOverviewProps) {
  const handle = profile?.username?.trim();
  const displayName =
    profile?.name?.trim() ||
    handle ||
    email ||
    "Your profile";
  const username = handle ? `@${handle}` : "Not set";
  const location = profile?.city?.trim() || "Add your location";
  const bio = profile?.bio?.trim();
  const avatarUrl = profile?.avatar_url;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-6 px-6 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <ProfileAvatar src={avatarUrl} alt={displayName} fallback={initials} />
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Profile overview</p>
              <h2 className="text-xl font-semibold leading-tight">{displayName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
                <span>{username}</span>
                {email ? (
                  <>
                    <span aria-hidden="true" className="text-white/20">
                      •
                    </span>
                    <span>{email}</span>
                  </>
                ) : (
                  <span>Add an email to finish setup</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {bio && (
          <p className="text-sm leading-relaxed text-[var(--muted)]">{bio}</p>
        )}

        <dl className="grid gap-4 sm:grid-cols-2">
          <InfoItem label="Email" value={email || "Not provided"} />
          <InfoItem label="Username" value={username} />
          <InfoItem label="Location" value={location} />
        </dl>

        <div className="flex flex-wrap gap-3">
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

type InfoItemProps = {
  label: string;
  value: string;
};

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-[var(--text)] break-words">{value}</dd>
    </div>
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
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
        className="h-16 w-16 rounded-2xl object-cover shadow-lg shadow-black/30"
      />
    );
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold text-white shadow-inner shadow-black/40">
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
    <section className="card overflow-hidden">
      <div className="px-6 py-5 inner-hair">
        <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        )}
      </div>
      <div className="divide-y divide-white/5">{children}</div>
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
      className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors duration-200 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
    >
      <SettingsIcon icon={Icon} />
      <div className="flex-1">
        <p className="font-medium text-[var(--text)]">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
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
    <div className="flex items-center gap-4 px-6 py-4">
      <SettingsIcon icon={Icon} />
      <div className="flex-1">
        <p className="font-medium text-[var(--text)]">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
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

type SettingsStaticRowProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  value?: string;
};

function SettingsStaticRow({ icon: Icon, title, description, value }: SettingsStaticRowProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <SettingsIcon icon={Icon} />
      <div className="flex-1">
        <p className="font-medium text-[var(--text)]">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        )}
      </div>
      {value && <span className="text-sm font-medium text-[var(--muted)]">{value}</span>}
    </div>
  );
}

type SettingsIconProps = {
  icon: LucideIcon;
};

function SettingsIcon({ icon: Icon }: SettingsIconProps) {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
      <Icon className="h-5 w-5 text-[var(--text)]" aria-hidden="true" />
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
        checked ? "bg-[var(--accent)]" : "bg-white/10"
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
