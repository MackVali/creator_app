"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/hooks/useProfile";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  BellRing,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Lock,
  MoonStar,
  Palette,
  PenSquare,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const APP_VERSION = "v1.0.0";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const { profile } = useProfile();
  const [email, setEmail] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function loadEmail() {
      const user = await getCurrentUser();
      setEmail(user?.email || "");
    }

    loadEmail();
  }, []);

  const initials = getInitials(profile?.name || null, email);
  const completion = profile
    ? Math.round(
        ([
          profile.name,
          profile.bio,
          profile.city,
          profile.avatar_url,
          profile.username,
        ].filter(Boolean).length /
          5) *
          100
      )
    : 0;
  const safeCompletion = Number.isFinite(completion)
    ? Math.min(100, Math.max(0, completion))
    : 0;

  return (
    <div
      className="min-h-screen text-[var(--text)]"
      style={{
        backgroundColor: "var(--bg)",
        backgroundImage: "var(--bg-gradient)",
      }}
    >
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--muted)]">
              Account
            </span>
            <h1 className="text-3xl font-semibold text-white md:text-4xl">
              Settings
            </h1>
            <p className="text-sm text-white/70 md:text-base">
              Configure how Creator App looks, keeps you informed, and protects
              your account.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={() => router.push("/dashboard")}
          >
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Back to dashboard
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8">
        <div className="grid gap-6 lg:grid-cols-[340px,1fr]">
          <div className="space-y-6">
            <Panel className="p-6">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="size-16 border border-white/10">
                      {profile?.avatar_url ? (
                        <AvatarImage
                          src={profile.avatar_url}
                          alt={profile.name || email || "Profile avatar"}
                        />
                      ) : (
                        <AvatarFallback className="bg-white/10 text-lg font-semibold text-white">
                          {initials || "U"}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div>
                      <p className="text-sm uppercase tracking-wide text-white/50">
                        Signed in as
                      </p>
                      <p className="text-xl font-semibold text-white">
                        {profile?.name || email || "Your profile"}
                      </p>
                      <p className="text-sm text-white/60">
                        {email
                          ? email
                          : "Add an email to keep your account recoverable."}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                    onClick={() =>
                      router.push(
                        profile?.username
                          ? `/u/${profile.username}`
                          : "/dashboard"
                      )
                    }
                  >
                    <PenSquare className="size-4" aria-hidden="true" />
                    Update profile
                  </Button>
                </div>

                <ProfileCompletion completion={safeCompletion} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <ProfileDetail
                    label="Username"
                    value={
                      profile?.username
                        ? `@${profile.username}`
                        : "Pick a username to share your page"
                    }
                    highlight={!profile?.username}
                  />
                  <ProfileDetail
                    label="City"
                    value={
                      profile?.city
                        ? profile.city
                        : "Let others know where you're based"
                    }
                    highlight={!profile?.city}
                  />
                  <ProfileDetail
                    label="Theme"
                    value={profile?.theme_color || "Default theme"}
                  />
                  <ProfileDetail
                    label="Notifications"
                    value={notifications ? "Enabled" : "Muted"}
                    highlight={!notifications}
                  />
                </div>
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <SettingsSection
              title="Appearance"
              description="Personalize the interface so it feels comfortable during long sessions."
            >
              <SettingToggle
                icon={MoonStar}
                title="Dark mode"
                description="Dim the interface for low-light environments and reduce eye strain."
                checked={darkMode}
                onChange={() => setDarkMode((value) => !value)}
                ariaLabel="Toggle dark mode"
              />
              <SettingLinkRow
                icon={Palette}
                title="Accent color"
                description="Coming soon — choose a highlight color that matches your brand."
                actionLabel="Soon"
                disabled
              />
            </SettingsSection>

            <SettingsSection
              title="Notifications"
              description="Decide what requires your attention and when."
            >
              <SettingToggle
                icon={BellRing}
                title="Product updates"
                description="Get notified about launches, feature drops, and community happenings."
                checked={notifications}
                onChange={() => setNotifications((value) => !value)}
                ariaLabel="Toggle notifications"
              />
              <SettingLinkRow
                icon={Smartphone}
                title="Push notifications"
                description="Send reminders to this device when tasks are about to start."
                actionLabel="Configure"
                disabled
              />
            </SettingsSection>

            <SettingsSection
              title="Security"
              description="Keep your account protected with extra layers."
            >
              <SettingLinkRow
                icon={Lock}
                title="Change password"
                description="Use a unique password to keep your account protected."
                actionLabel="Reset password"
                onClick={() => router.push("/auth/reset")}
              />
              <SettingLinkRow
                icon={ShieldCheck}
                title="Two-factor authentication"
                description="Add a verification step when signing in on a new device."
                actionLabel="Coming soon"
                disabled
              />
            </SettingsSection>

            <SettingsSection
              title="About"
              description="Legal documents and app information."
            >
              <SettingInfoRow
                icon={FileText}
                title="Terms of service"
                description="Review the terms that cover using Creator App."
                value="Read online"
              />
              <SettingInfoRow
                icon={Shield}
                title="Privacy policy"
                description="Understand how we handle and protect your data."
                value="We keep it private"
              />
              <SettingInfoRow
                icon={Sparkles}
                title="App version"
                description="You are running the latest build of the Creator App."
                value={APP_VERSION}
              />
            </SettingsSection>
          </div>
        </div>
      </main>
    </div>
  );
}

type PanelProps = {
  children: ReactNode;
  className?: string;
};

function Panel({ children, className }: PanelProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_18px_38px_rgba(0,0,0,0.45)] backdrop-blur",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent"
        aria-hidden
      />
      <div className="relative">{children}</div>
    </section>
  );
}

function ProfileCompletion({ completion }: { completion: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-white">Profile completeness</p>
          <p className="text-xs text-white/60">
            Add a photo, location, and bio to complete your public profile.
          </p>
        </div>
        <span className="text-sm font-semibold text-white">{completion}%</span>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-white/80 transition-[width]"
          style={{ width: `${completion}%` }}
        />
      </div>
    </div>
  );
}

type ProfileDetailProps = {
  label: string;
  value: string;
  highlight?: boolean;
};

function ProfileDetail({ label, value, highlight }: ProfileDetailProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p
        className={cn(
          "mt-2 text-sm font-medium text-white/70",
          highlight && "text-white"
        )}
      >
        {value}
      </p>
    </div>
  );
}

type SettingsSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <Panel>
      <div className="border-b border-white/5 px-6 py-6">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-sm text-white/60">{description}</p>
      </div>
      <div className="divide-y divide-white/5">{children}</div>
    </Panel>
  );
}

type SettingToggleProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
};

function SettingToggle({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  ariaLabel,
}: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-5">
      <div className="flex items-start gap-4">
        <IconBadge Icon={Icon} />
        <div>
          <p className="font-medium text-white">{title}</p>
          <p className="text-sm text-white/60">{description}</p>
        </div>
      </div>
      <ToggleControl
        checked={checked}
        onChange={onChange}
        ariaLabel={ariaLabel}
      />
    </div>
  );
}

type SettingLinkRowProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
};

function SettingLinkRow({
  icon: Icon,
  title,
  description,
  actionLabel = "Manage",
  onClick,
  disabled,
}: SettingLinkRowProps) {
  const content = (
    <>
      <div className="flex items-start gap-4">
        <IconBadge Icon={Icon} />
        <div>
          <p className="font-medium text-white">{title}</p>
          <p className="text-sm text-white/60">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm font-medium text-white/60">
        <span>{actionLabel}</span>
        {onClick && <ChevronRight className="size-4" aria-hidden="true" />}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-4 px-6 py-5",
        disabled && "opacity-60"
      )}
    >
      {content}
    </div>
  );
}

type SettingInfoRowProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  value?: string;
  action?: ReactNode;
};

function SettingInfoRow({
  icon: Icon,
  title,
  description,
  value,
  action,
}: SettingInfoRowProps) {
  return (
    <div className="flex w-full items-center justify-between gap-4 px-6 py-5">
      <div className="flex items-start gap-4">
        <IconBadge Icon={Icon} />
        <div>
          <p className="font-medium text-white">{title}</p>
          <p className="text-sm text-white/60">{description}</p>
        </div>
      </div>
      {action ? (
        action
      ) : value ? (
        <span className="text-sm font-medium text-white/60">{value}</span>
      ) : null}
    </div>
  );
}

type ToggleControlProps = {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
};

function ToggleControl({ checked, onChange, ariaLabel }: ToggleControlProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
        {checked ? "On" : "Off"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={onChange}
        className={cn(
          "relative h-7 w-12 rounded-full border border-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
          checked ? "bg-white text-black" : "bg-white/10"
        )}
      >
        <span
          className={cn(
            "absolute left-1 top-1 size-5 rounded-full bg-[var(--bg)] transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

function IconBadge({ Icon }: { Icon: LucideIcon }) {
  return (
    <span className="mt-1 flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

function getInitials(name: string | null, email: string) {
  if (name) {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();
  }

  if (email) {
    return email.charAt(0).toUpperCase();
  }

  return "";
}
