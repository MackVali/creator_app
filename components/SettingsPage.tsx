"use client";
// Render <SettingsPage /> in /settings route
import { useState, useEffect, useMemo, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/hooks/useProfile";
import { getCurrentUser } from "@/lib/auth";
import { updateProfileTimezone } from "@/lib/db";
import {
  listTimeZones,
  formatTimeZoneLabel,
  getResolvedTimeZone,
} from "@/lib/time/tz";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const { profile, loading: profileLoading, refreshProfile } = useProfile();
  const [email, setEmail] = useState("");
  const router = useRouter();
  const resolvedTimezone = useMemo(() => getResolvedTimeZone(), []);
  const timezones = useMemo(() => listTimeZones(), []);
  const [timezone, setTimezone] = useState<string>("UTC");
  const timezoneOptions = useMemo(() => {
    if (timezone && !timezones.includes(timezone)) {
      return [timezone, ...timezones];
    }
    return timezones;
  }, [timezones, timezone]);
  const [timezoneStatus, setTimezoneStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [timezoneError, setTimezoneError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEmail() {
      const user = await getCurrentUser();
      setEmail(user?.email || "");
    }
    loadEmail();
  }, []);

  useEffect(() => {
    if (profileLoading) return;
    const fallback = resolvedTimezone ?? "UTC";
    const next = profile?.timezone ?? fallback;
    setTimezone(next);
  }, [profile?.timezone, profileLoading, resolvedTimezone]);

  const initials = getInitials(profile?.name || null, email);
  const savedTimezone = profile?.timezone ?? "";
  const hasTimezoneChanges = timezone !== savedTimezone;
  const detectedTimezoneLabel = resolvedTimezone
    ? formatTimeZoneLabel(resolvedTimezone)
    : null;

  const handleSaveTimezone = async () => {
    if (timezoneStatus === "saving") return;
    setTimezoneStatus("saving");
    setTimezoneError(null);
    const result = await updateProfileTimezone(timezone || null);
    if (result.success) {
      await refreshProfile();
      setTimezoneStatus("saved");
      setTimeout(() => {
        setTimezoneStatus("idle");
      }, 2500);
    } else {
      setTimezoneStatus("error");
      setTimezoneError(result.error ?? "Failed to update timezone");
    }
  };

  const handleUseDetectedTimezone = () => {
    if (!resolvedTimezone) return;
    setTimezone(resolvedTimezone);
  };

  return (
    <div
      className="min-h-screen text-[var(--text)]"
      style={{
        backgroundColor: "var(--bg)",
        backgroundImage: "var(--bg-gradient)",
      }}
    >
      <header className="sticky top-0 z-10 backdrop-blur bg-[var(--bg)]/80 border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            aria-label="Go back"
            onClick={() => router.push("/dashboard")}
            className="text-2xl text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            ←
          </button>
          <div>
            <h1 className="font-bold text-lg">Settings</h1>
            <p className="text-sm text-[var(--muted)]">
              Manage your account and preferences
            </p>
          </div>
        </div>
      </header>
      <main className="p-4 space-y-6">
        <SectionCard title="Account">
          <Row
            ariaLabel="Profile information"
            left={
              profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.name || email}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center text-lg">
                  {initials}
                </div>
              )
            }
            label={
              <div>
                <p className="font-medium">{profile?.name || email || "User"}</p>
                {email && (
                  <p className="text-sm text-[var(--muted)]">{email}</p>
                )}
              </div>
            }
          />
          <Row
            ariaLabel="Edit profile"
            left="✏️"
            label="Edit Profile"
            right={<Chevron />}
          />
          <Row
            ariaLabel="Change password"
            left="🔒"
            label="Change Password"
            right={<Chevron />}
          />
        </SectionCard>
        <SectionCard title="App">
          <Row
            ariaLabel="Toggle theme"
            left="🌑"
            label="Dark Mode"
            right={
              <ToggleSwitch
                checked={darkMode}
                onChange={() => setDarkMode((v) => !v)}
                ariaLabel="Toggle dark mode"
              />
            }
          />
          <Row
            ariaLabel="Toggle notifications"
            left="🔔"
            label="Notifications"
            right={
              <ToggleSwitch
                checked={notifications}
                onChange={() => setNotifications((v) => !v)}
                ariaLabel="Toggle notifications"
              />
            }
          />
        </SectionCard>
        <SectionCard title="Time & Region">
          <div className="space-y-3 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Timezone</p>
              <p className="text-xs text-[var(--muted)]">
                We use your timezone to schedule windows and projects at the correct
                local time.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                id="timezone"
                value={timezone}
                onChange={(event) => {
                  setTimezone(event.target.value);
                  if (timezoneStatus !== "idle") setTimezoneStatus("idle");
                  if (timezoneError) setTimezoneError(null);
                }}
                className="w-full rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] sm:max-w-sm"
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {formatTimeZoneLabel(tz)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleUseDetectedTimezone}
                disabled={!resolvedTimezone}
                className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-[var(--text)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resolvedTimezone
                  ? `Use ${detectedTimezoneLabel}`
                  : "Detect timezone"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveTimezone}
                disabled={!hasTimezoneChanges || timezoneStatus === "saving"}
                className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {timezoneStatus === "saving" ? "Saving…" : "Save timezone"}
              </button>
              {timezoneStatus === "saved" && (
                <span className="text-xs text-emerald-300">Timezone updated</span>
              )}
              {timezoneStatus === "error" && timezoneError && (
                <span className="text-xs text-red-300">{timezoneError}</span>
              )}
            </div>
            {!profile?.timezone && !profileLoading && (
              <p className="text-xs text-amber-200/80">
                You haven’t saved a timezone yet. Saving one ensures scheduled items
                line up with your day.
              </p>
            )}
          </div>
        </SectionCard>
        <SectionCard title="About">
          <Row
            ariaLabel="View terms of service"
            left="📜"
            label="Terms of Service"
            right={<Chevron />}
          />
          <Row
            ariaLabel="View privacy policy"
            left="🔐"
            label="Privacy Policy"
            right={<Chevron />}
          />
          <Row
            ariaLabel="App version"
            left="ℹ️"
            label="App Version"
            right={<span className="text-[var(--muted)]">v1.0.0</span>}
          />
        </SectionCard>
      </main>
    </div>
  );
}

function Chevron() {
  return <span className="text-[var(--muted)]">›</span>;
}

type SectionCardProps = {
  title: string;
  children: ReactNode;
};

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <section className="card overflow-hidden">
      <h2 className="px-4 py-3 font-semibold inner-hair">{title}</h2>
      <div className="divide-y divide-white/5">{children}</div>
    </section>
  );
}

type RowProps = {
  left: ReactNode;
  label: ReactNode;
  right?: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
};

function Row({ left, label, right, ariaLabel, onClick }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-full flex items-center justify-between h-14 px-4 text-left transition-all duration-200 hover:bg-white/5 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
    >
      <div className="flex items-center gap-4">
        <span className="text-xl">{left}</span>
        <span className="text-[var(--text)]">{label}</span>
      </div>
      {right}
    </button>
  );
}

type ToggleSwitchProps = {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
};

function ToggleSwitch({ checked, onChange, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={`w-12 h-7 rounded-full p-1 transition-colors duration-200 ${
        checked ? "bg-[var(--accent)]" : "bg-white/10"
      }`}
    >
      <span
        className={`h-5 w-5 bg-white rounded-full shadow transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function getInitials(name: string | null, email: string) {
  if (name) {
    return name
      .split(" ")
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase();
  }
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  return "";
}
