"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { parseSupabaseError } from "@/lib/error-handling";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();
  const supabase = getSupabaseBrowser();

  if (!supabase) {
    return (
      <AuthRecoveryShell eyebrow="Account recovery" title="CREATOR">
        <StatusMessage
          tone="error"
          message="Supabase is not properly configured. Please check your environment variables."
        />
      </AuthRecoveryShell>
    );
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (!supabase) {
      setError("Supabase not initialized.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[forgot-password] resetPasswordForEmail failed", error);
        }
        const appError = parseSupabaseError(error);
        setError(appError.userMessage);
        return;
      }

      setSuccess("If that email exists, we sent a password reset link.");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthRecoveryShell eyebrow="Account recovery" title="CREATOR">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-zinc-100">Reset your password</h2>
        <p className="text-sm leading-6 text-zinc-400">
          Enter the email tied to your CREATOR account. We&apos;ll send a reset
          link if the account exists.
        </p>
      </div>

      {success && <StatusMessage tone="success" message={success} />}

      <form onSubmit={handleResetPassword} className="space-y-6">
        <div>
          <label className="mb-3 block text-sm font-semibold text-zinc-200">
            Email
          </label>
          <input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEmail(e.target.value)
            }
            className="w-full rounded-xl border border-zinc-600 bg-zinc-800/80 px-5 py-4 text-zinc-100 placeholder-zinc-500 transition-all duration-200 focus:border-zinc-400 focus:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300/15"
            autoComplete="email"
            required
          />
        </div>

        {error && <StatusMessage tone="error" message={error} />}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl border border-zinc-600/70 bg-[#232326] py-4 font-bold text-zinc-50 shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition-all duration-200 hover:bg-[#2d2d30] disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-[#232326]/50 disabled:text-zinc-500"
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => router.push("/auth")}
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            Back to sign in
          </button>
        </div>
      </form>
    </AuthRecoveryShell>
  );
}

export function AuthRecoveryShell({
  children,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#050505] px-4 py-12 text-zinc-100">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.4em] text-zinc-500">
            {eyebrow}
          </p>
          <h1 className="text-5xl font-black tracking-widest text-zinc-100">
            {title}
          </h1>
        </div>

        <div className="space-y-8 rounded-3xl border border-zinc-600/70 bg-[#363638] p-8 shadow-[0_22px_60px_rgba(0,0,0,0.22)]">
          {children}
        </div>
      </div>
    </main>
  );
}

export function StatusMessage({
  message,
  tone,
}: {
  message: string;
  tone: "error" | "success";
}) {
  const className =
    tone === "success"
      ? "border-zinc-500/60 bg-zinc-700/45 text-zinc-100"
      : "border-red-400/30 bg-red-950/25 text-red-200";

  return (
    <div className={`rounded-xl border p-4 text-sm ${className}`}>
      {message}
    </div>
  );
}
