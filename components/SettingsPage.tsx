"use client";
// Render <SettingsPage /> in /settings route
import { useState, ReactNode } from "react";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="bg-[#1E1E1E] min-h-screen text-[#E6E6E6]">
      <header className="sticky top-0 z-10 backdrop-blur bg-[#1E1E1E]/80 border-b border-[#353535]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            aria-label="Go back"
            className="text-2xl text-[#E6E6E6] focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
          >
            ←
          </button>
          <div>
            <h1 className="font-bold text-lg">Settings</h1>
            <p className="text-sm text-[#A6A6A6]">
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
              <div className="h-12 w-12 rounded-full bg-[#353535] flex items-center justify-center text-lg">
                MV
              </div>
            }
            label={
              <div>
                <p className="font-medium">Mona Valdez</p>
                <p className="text-sm text-[#A6A6A6]">mona@example.com</p>
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
            right={<span className="text-[#A6A6A6]">v1.0.0</span>}
          />
        </SectionCard>
      </main>
    </div>
  );
}

function Chevron() {
  return <span className="text-[#A6A6A6]">›</span>;
}

type SectionCardProps = {
  title: string;
  children: ReactNode;
};

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <section className="bg-[#242424] border border-[#353535] rounded-2xl overflow-hidden">
      <h2 className="px-4 py-3 font-semibold">{title}</h2>
      <div className="divide-y divide-[#353535]">{children}</div>
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
      className="w-full flex items-center justify-between h-14 px-4 text-left transition-all duration-[160ms] hover:bg-[#2B2B2B] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
    >
      <div className="flex items-center gap-4">
        <span className="text-xl">{left}</span>
        <span className="text-[#E6E6E6]">{label}</span>
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
        checked ? "bg-[#9966CC]" : "bg-[#353535]"
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

