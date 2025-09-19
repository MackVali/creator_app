"use client";
// Render <SettingsPage /> in /settings route
import { useState, useEffect, useMemo, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/hooks/useProfile";
import { getCurrentUser } from "@/lib/auth";
import TimezoneSelect from "@/components/TimezoneSelect";
import { getTimezoneOptions } from "@/lib/time/tz";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const { profile, refreshProfile } = useProfile();
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);
  const browserTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (error) {
      console.warn("Failed to resolve browser timezone", error);
      return "UTC";
    }
  }, []);
  const [timezoneInput, setTimezoneInput] = useState("");
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [timezoneMessage, setTimezoneMessage] = useState<string | null>(null);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function loadEmail() {
      const user = await getCurrentUser();
      setEmail(user?.email || "");
    }
    loadEmail();
  }, []);

  useEffect(() => {
    const next = profile?.timezone ?? "";
    setTimezoneInput((prev) => (prev === next ? prev : next));
  }, [profile?.timezone]);

  const handleSaveTimezone = async () => {
    const trimmed = timezoneInput.trim();
    setTimezoneSaving(true);
    setTimezoneMessage(null);
    setTimezoneError(null);
    try {
      const response = await fetch("/api/profile/timezone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timezone: trimmed.length > 0 ? trimmed : null,
        }),
      });
      const result = (await response.json()) as {
        success: boolean;
        timezone?: string | null;
        error?: string;
      };
      if (!response.ok || !result.success) {
        setTimezoneError(result.error ?? "Failed to update timezone");
        return;
      }
      const normalized = typeof result.timezone === "string" ? result.timezone : "";
      setTimezoneInput(normalized);
      setTimezoneMessage(
        normalized
          ? `Timezone saved as ${normalized}.`
          : "Timezone cleared. We'll ask you to choose one before you use the schedule."
      );
      await refreshProfile();
    } catch (error) {
      console.error("Failed to update timezone", error);
      setTimezoneError("Failed to update timezone");
    } finally {
      setTimezoneSaving(false);
    }
  };

  const handleUseBrowserTimezone = () => {
    setTimezoneInput(browserTimezone);
    setTimezoneMessage(null);
    setTimezoneError(null);
  };

  const handleClearTimezone = () => {
    setTimezoneInput("");
    setTimezoneMessage(null);
    setTimezoneError(null);
  };

  const initials = getInitials(profile?.name || null, email);

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
          <Row
            ariaLabel="Change language"
            left="🌐"
            label="Language"
            right={<Chevron />}
          />
        </SectionCard>
        <SectionCard title="Time & Calendar">
          <div className="px-4 py-3 space-y-3 text-left">
            <p className="text-sm text-[var(--muted)]">
              We'll use this timezone when scheduling windows and projects. Your browser is currently set to
              <span className="ml-1 font-mono text-[var(--text)]">{browserTimezone}</span>.
            </p>
            <TimezoneSelect
              label="Preferred timezone"
              value={timezoneInput}
              onChange={(value) => {
                setTimezoneInput(value);
                setTimezoneMessage(null);
                setTimezoneError(null);
              }}
              options={timezoneOptions}
              placeholder={browserTimezone}
            />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveTimezone}
                disabled={timezoneSaving}
                className="inline-flex items-center rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {timezoneSaving ? "Saving…" : "Save timezone"}
              </button>
              <button
                type="button"
                onClick={handleUseBrowserTimezone}
                disabled={timezoneSaving}
                className="inline-flex items-center rounded-md border border-white/10 px-3 py-2 text-sm text-[var(--text)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Use browser timezone
              </button>
              <button
                type="button"
                onClick={handleClearTimezone}
                disabled={timezoneSaving || timezoneInput.trim().length === 0}
                className="inline-flex items-center rounded-md px-2 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            <div aria-live="polite" className="min-h-[1.25rem] text-sm">
              {timezoneMessage && <span className="text-emerald-400">{timezoneMessage}</span>}
              {timezoneError && <span className="text-red-400">{timezoneError}</span>}
            </div>
            <p className="text-xs text-[var(--muted)]">
              The scheduler requires a timezone so tasks and projects stay aligned with their Supabase timestamps.
            </p>
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

