"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { parseSupabaseError } from "@/lib/error-handling";

// Password validation function - same as signup
const validatePassword = (password: string): string | null => {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[a-zA-Z]/.test(password))
    return "Password must contain at least 1 letter";
  if (!/\d/.test(password)) return "Password must contain at least 1 number";
  return null;
};

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  const router = useRouter();
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    // Check if we have a recovery session
    const checkRecoverySession = async () => {
      if (!supabase) return;

      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setError("Invalid or expired reset link. Please request a new one.");
        return;
      }

      if (data.user.aud === "authenticated") {
        setHasRecoverySession(true);
      } else {
        setError("Invalid or expired reset link. Please request a new one.");
      }
    };

    checkRecoverySession();
  }, [supabase]);

  if (!supabase) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black tracking-widest text-white mb-4">
            CREATOR
          </h1>
          <p className="text-lg text-zinc-300">Level up your life!</p>
        </div>

        <div className="bg-[#1E1E1E] rounded-3xl border border-[#333] shadow-2xl p-8">
          <div className="text-center">
            <div className="text-red-400 bg-red-900/20 p-4 rounded-xl border border-red-500/30 mb-4">
              ⚠️ Configuration Error
            </div>
            <p className="text-zinc-300 mb-4">
              Supabase is not properly configured. Please check your environment
              variables.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();

    if (!password || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (!supabase) {
      setError("Supabase not initialized");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        const appError = parseSupabaseError(error);
        setError(appError.userMessage);
      } else {
        setSuccess(
          "Password updated successfully! Redirecting to dashboard..."
        );
        setTimeout(() => {
          router.replace("/dashboard");
        }, 2000);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!hasRecoverySession) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black tracking-widest text-white mb-4">
            CREATOR
          </h1>
          <p className="text-lg text-zinc-300">Update your password</p>
        </div>

        <div className="bg-[#1E1E1E] rounded-3xl border border-[#333] shadow-2xl p-8">
          <div className="text-center">
            <div className="text-red-400 bg-red-900/20 p-4 rounded-xl border border-red-500/30 mb-4">
              ⚠️ {error || "Invalid reset link"}
            </div>
            <p className="text-zinc-300 mb-4">
              Please request a new password reset link.
            </p>
            <button
              onClick={() => router.push("/auth/reset")}
              className="bg-white text-[#1E1E1E] font-bold py-3 px-6 rounded-xl hover:bg-zinc-100 transition-all duration-200"
            >
              Request New Reset Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-5xl font-black tracking-widest text-white mb-4">
          CREATOR
        </h1>
        <p className="text-lg text-zinc-300">Set your new password</p>
      </div>

      {/* Main Card */}
      <div className="bg-[#1E1E1E] rounded-3xl border border-[#333] shadow-2xl p-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-3">New Password</h2>
          <p className="text-base text-zinc-300">
            Enter your new password below
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="text-sm text-green-400 bg-green-900/20 p-4 rounded-xl border border-green-500/30 mb-6">
            ✅ {success}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleUpdatePassword} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              New Password
            </label>
            <input
              type="password"
              placeholder="Enter new password (min 8 chars, 1 letter, 1 number)"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setPassword(e.target.value)
              }
              className="w-full bg-[#2C2C2C] border border-[#333] text-white placeholder-zinc-400 rounded-xl px-5 py-4 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 transition-all duration-200"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              Confirm New Password
            </label>
            <input
              type="password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setConfirmPassword(e.target.value)
              }
              className="w-full bg-[#2C2C2C] border border-[#333] text-white placeholder-zinc-400 rounded-xl px-5 py-4 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 transition-all duration-200"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 p-4 rounded-xl border border-red-500/30">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-[#1E1E1E] font-bold py-4 rounded-xl hover:bg-zinc-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push("/auth")}
              className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              ← Back to Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
