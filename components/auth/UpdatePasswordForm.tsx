"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { parseSupabaseError } from "@/lib/error-handling";
import { AuthRecoveryShell, StatusMessage } from "@/components/auth/ForgotPasswordForm";

const validatePassword = (password: string): string | null => {
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
};

const isDevelopment = process.env.NODE_ENV === "development";

export default function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  const router = useRouter();
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      if (!supabase) {
        setCheckingSession(false);
        return;
      }

      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const urlError =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error") ||
        hashParams.get("error_description") ||
        hashParams.get("error");

      if (urlError) {
        if (mounted) {
          setError(urlError);
          setCheckingSession(false);
        }
        return;
      }

      const code = url.searchParams.get("code");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const hasHashSession = Boolean(accessToken && refreshToken);
      const hasRecoveryUrl = Boolean(code || hasHashSession);

      let recoveryError: { message?: string } | null = null;

      if (hasRecoveryUrl && isDevelopment) {
        console.log("[update-password] recovery url detected");
      }

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          recoveryError = exchangeError;
          if (isDevelopment) {
            console.error(
              "[update-password] exchangeCodeForSession failed",
              exchangeError
            );
          }
        }
      } else if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (setSessionError) {
          recoveryError = setSessionError;
        }
      }

      const { data, error } = await supabase.auth.getUser();

      if (!mounted) return;

      if (error || !data.user) {
        if (isDevelopment) {
          console.log("[update-password] no recovery session");
        }
        const appError = recoveryError ? parseSupabaseError(recoveryError) : null;
        setError(
          appError?.userMessage ||
            "Invalid or expired reset link. Please request a new one."
        );
        setHasRecoverySession(false);
      } else {
        if (isDevelopment) {
          console.log("[update-password] recovery session ready");
        }
        setHasRecoverySession(true);
      }

      setCheckingSession(false);
    }

    checkRecoverySession();

    return () => {
      mounted = false;
    };
  }, [supabase]);

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

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();

    if (!password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
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
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const appError = parseSupabaseError(error);
        setError(appError.userMessage);
        return;
      }

      setSuccess("Password updated. Redirecting to your dashboard...");
      setTimeout(() => {
        router.replace("/dashboard");
      }, 1200);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <AuthRecoveryShell eyebrow="Account recovery" title="CREATOR">
        <StatusMessage tone="success" message="Verifying your reset link..." />
      </AuthRecoveryShell>
    );
  }

  if (!hasRecoverySession) {
    return (
      <AuthRecoveryShell eyebrow="Account recovery" title="CREATOR">
        <div className="space-y-6 text-center">
          <StatusMessage
            tone="error"
            message={error || "Invalid or expired reset link."}
          />
          <p className="text-sm text-zinc-300">
            Please request a new password reset link.
          </p>
          <button
            type="button"
            onClick={() => router.push("/forgot-password")}
            className="rounded-xl bg-white px-6 py-3 font-bold text-[#1E1E1E] transition-all duration-200 hover:bg-zinc-100"
          >
            Request new reset link
          </button>
        </div>
      </AuthRecoveryShell>
    );
  }

  return (
    <AuthRecoveryShell eyebrow="Account recovery" title="CREATOR">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">Set a new password</h2>
        <p className="text-sm leading-6 text-zinc-300">
          Choose a password with at least 8 characters.
        </p>
      </div>

      {success && <StatusMessage tone="success" message={success} />}

      <form onSubmit={handleUpdatePassword} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-white mb-3">
            New password
          </label>
          <input
            type="password"
            placeholder="Enter your new password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPassword(e.target.value)
            }
            className="w-full rounded-xl border border-[#333] bg-[#2C2C2C] px-5 py-4 text-white placeholder-zinc-400 transition-all duration-200 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-3">
            Confirm new password
          </label>
          <input
            type="password"
            placeholder="Confirm your new password"
            value={confirmPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setConfirmPassword(e.target.value)
            }
            className="w-full rounded-xl border border-[#333] bg-[#2C2C2C] px-5 py-4 text-white placeholder-zinc-400 transition-all duration-200 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
            autoComplete="new-password"
            required
          />
        </div>

        {error && <StatusMessage tone="error" message={error} />}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-white py-4 font-bold text-[#1E1E1E] shadow-lg transition-all duration-200 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Updating..." : "Update password"}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => router.push("/auth")}
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-300"
          >
            Back to sign in
          </button>
        </div>
      </form>
    </AuthRecoveryShell>
  );
}
