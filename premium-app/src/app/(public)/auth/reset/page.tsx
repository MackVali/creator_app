"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { parseSupabaseError } from "@/lib/error-handling";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();
  const supabase = getSupabaseBrowser();

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

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address");
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });

      if (error) {
        const appError = parseSupabaseError(error);
        setError(appError.userMessage);
      } else {
        setSuccess(
          "Password reset email sent! Check your inbox for instructions."
        );
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-5xl font-black tracking-widest text-white mb-4">
          CREATOR
        </h1>
        <p className="text-lg text-zinc-300">Reset your password</p>
      </div>

      {/* Main Card */}
      <div className="bg-[#1E1E1E] rounded-3xl border border-[#333] shadow-2xl p-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-3">Reset Password</h2>
          <p className="text-base text-zinc-300">
            Enter your email address and we&apos;ll send you a link to reset
            your password
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="text-sm text-green-400 bg-green-900/20 p-4 rounded-xl border border-green-500/30 mb-6">
            ✅ {success}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleResetPassword} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              Email
            </label>
            <input
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEmail(e.target.value)
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
            {loading ? "Sending..." : "Send Reset Link"}
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
