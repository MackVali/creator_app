"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser, supabaseEnvDebug } from "@/lib/supabase";
import {
  ERROR_CODES,
  parseSupabaseError,
  type AppError,
} from "@/lib/error-handling";
import {
  getAuthRedirectResolution,
  type AuthRedirectResolution,
} from "@/lib/auth-redirect";
import RoleOption from "@/components/auth/RoleOption";

// Email validation helper
const validateEmail = (email: string): string | null => {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return "Please enter a valid email address";
  }
  return null;
};

// Password validation function - relaxed requirements
const validatePassword = (password: string): string | null => {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[a-zA-Z]/.test(password))
    return "Password must contain at least 1 letter";
  if (!/\d/.test(password)) return "Password must contain at least 1 number";
  return null;
};

const REDIRECT_SOURCE_LABELS: Record<AuthRedirectResolution["source"], string> = {
  supabaseRedirectEnv: "NEXT_PUBLIC_SUPABASE_REDIRECT_URL",
  siteUrlEnv: "NEXT_PUBLIC_SITE_URL",
  vercelProduction: "NEXT_PUBLIC_VERCEL_URL (production)",
  browserPreview: "Browser origin (preview)",
  browserDevelopment: "Browser origin (development)",
  none: "Not configured",
};

function renderRedirectSource(resolution: AuthRedirectResolution) {
  return REDIRECT_SOURCE_LABELS[resolution.source] ?? "Unknown";
}

export default function AuthForm() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"CREATOR" | "MANAGER" | "BUSINESS">(
    "CREATOR"
  );
  const [stay, setStay] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastAppError, setLastAppError] = useState<AppError | null>(null);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [redirectResolution, setRedirectResolution] =
    useState<AuthRedirectResolution>({ url: null, source: "none" });

  // Rate limiting state
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<Date | null>(null);
  const [lockoutDuration] = useState(5 * 60 * 1000); // 5 minutes

  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    setRedirectResolution(getAuthRedirectResolution());
  }, []);

  // Reset lockout after duration - placed before any early returns to fix hooks rules
  useEffect(() => {
    if (lockoutTime) {
      const timer = setTimeout(() => {
        setLockoutTime(null);
        setAttempts(0);
      }, lockoutDuration);
      return () => clearTimeout(timer);
    }
  }, [lockoutTime, lockoutDuration]);

  // Add this check at the beginning of your component
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
            <p className="text-sm text-zinc-400">
              Required: NEXT_PUBLIC_SUPABASE_URL and
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check if user is locked out
  const isLockedOut =
    lockoutTime &&
    new Date().getTime() - lockoutTime.getTime() < lockoutDuration;

  const handleAuthError = (error: { message?: string; code?: string }) => {
    const appError = parseSupabaseError(error);
    setAttempts((prev: number) => prev + 1);
    setLastAppError(appError);
    setDebugPanelOpen(true);

    // Lock out after 5 failed attempts
    if (attempts >= 4) {
      setLockoutTime(new Date());
      setError(
        "Too many failed attempts. Please wait 5 minutes before trying again."
      );
    } else {
      setError(appError.userMessage);
    }
    return appError;
  };

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (isLockedOut) {
      setError("Account temporarily locked. Please wait before trying again.");
      return;
    }
    if (!supabase) {
      setError("Supabase not initialized");
      return;
    }

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    const sanitizedEmail = email.trim().toLowerCase();

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: sanitizedEmail,
        password,
      });
      if (error) {
        handleAuthError(error);
      } else {
        setAttempts(0);
        setLastAppError(null);
        const redirectTo = searchParams.get("redirect") || "/dashboard";
        router.replace(redirectTo);
      }
    } catch (err) {
      handleAuthError(err as { message?: string });
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (isLockedOut) {
      setError("Account temporarily locked. Please wait before trying again.");
      return;
    }
    if (!supabase) {
      setError("Supabase not initialized");
      return;
    }

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedFullName = fullName.trim();
    if (!sanitizedFullName) {
      setError("Please provide your full name");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const resolution = getAuthRedirectResolution();
    setRedirectResolution(resolution);
    const emailRedirectTo = resolution.url;

    const finalizeSignup = (
      resultData: Awaited<ReturnType<typeof supabase.auth.signUp>>["data"],
      usedFallback = false,
    ) => {
      setAttempts(0);
      setLastAppError(null);
      if (resultData.user && !resultData.user.email_confirmed_at) {
        setSuccess(
          usedFallback
            ? "Account created! Please check your email to confirm your account. Supabase is still pointing at your default SITE_URL, so update Authentication → URL Configuration (or set NEXT_PUBLIC_SUPABASE_REDIRECT_URL) to your preview domain after confirming."
            : "Account created! Please check your email to confirm your account."
        );
      } else {
        const redirectTo = searchParams.get("redirect") || "/dashboard";
        router.replace(redirectTo);
      }
    };

    try {
      const metadata = { full_name: sanitizedFullName, role };
      const signupOptions = {
        data: metadata,
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      };

      const initialResult = await supabase.auth.signUp({
        email: sanitizedEmail,
        password,
        options: signupOptions,
      });

      if (initialResult.error) {
        const appError = handleAuthError(initialResult.error);

        if (appError.code === ERROR_CODES.AUTH_SIGNUPS_DISABLED) {
          setSuccess(null);
        }

        if (
          appError.code === ERROR_CODES.AUTH_INVALID_REDIRECT &&
          emailRedirectTo
        ) {
          const fallbackResult = await supabase.auth.signUp({
            email: sanitizedEmail,
            password,
            options: { data: metadata },
          });

          if (fallbackResult.error) {
            handleAuthError(fallbackResult.error);
            return;
          }

          setError(null);
          finalizeSignup(fallbackResult.data, true);
        }

        return;
      }

      finalizeSignup(initialResult.data);
    } catch (err) {
      handleAuthError(err as { message?: string });
    } finally {
      setLoading(false);
    }
  }

  const handleForgotPassword = () => {
    router.push("/auth/reset");
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-5xl font-black tracking-widest text-white mb-4">
          CREATOR
        </h1>
        <p className="text-lg text-zinc-300">Level up your life!</p>
      </div>

      {/* Main Card */}
      <div className="bg-[#1E1E1E] rounded-3xl border border-[#333] shadow-2xl p-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-3">Welcome</h2>
          <p className="text-base text-zinc-300">
            Sign in to your account or create a new one
          </p>
        </div>

        {/* Tab System */}
        <div className="flex bg-[#2C2C2C] rounded-xl p-1.5 mb-8">
          <button
            onClick={() => setTab("signin")}
            className={`flex-1 py-3 px-6 rounded-lg text-sm font-semibold transition-all duration-200 ${
              tab === "signin"
                ? "bg-[#1E1E1E] text-white shadow-lg"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setTab("signup")}
            className={`flex-1 py-3 px-6 rounded-lg text-sm font-semibold transition-all duration-200 ${
              tab === "signup"
                ? "bg-[#1E1E1E] text-white shadow-lg"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="text-sm text-green-400 bg-green-900/20 p-4 rounded-xl border border-green-500/30 mb-6">
            ✅ {success}
          </div>
        )}

        {/* Sign In Form */}
        {tab === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Email
              </label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                className="w-full bg-[#2C2C2C] border border-[#333] text-white placeholder-zinc-400 rounded-xl px-5 py-4 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 transition-all duration-200"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Password
              </label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
                className="w-full bg-[#2C2C2C] border border-[#333] text-white placeholder-zinc-400 rounded-xl px-5 py-4 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 transition-all duration-200"
                required
              />
            </div>

            <label className="flex items-center gap-4 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={stay}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setStay(e.target.checked)
                }
                className="h-5 w-5 rounded border-[#333] bg-[#2C2C2C] text-white focus:ring-2 focus:ring-zinc-500 focus:ring-offset-0 focus:ring-offset-transparent"
              />
              <span>Remain signed in</span>
            </label>

            {isLockedOut && (
              <div className="text-sm text-orange-400 bg-orange-900/20 p-4 rounded-xl border border-orange-500/30">
                ⚠️ Account temporarily locked. Please wait 5 minutes.
              </div>
            )}

            {error && !isLockedOut && (
              <div className="text-sm text-red-400 bg-red-900/20 p-4 rounded-xl border border-red-500/30">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || Boolean(isLockedOut)}
              className="w-full bg-white text-[#1E1E1E] font-bold py-4 rounded-xl hover:bg-zinc-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading
                ? "Signing in…"
                : isLockedOut
                ? "Account Locked"
                : "Sign In"}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                Forgot your password?
              </button>
            </div>
          </form>
        )}

        {/* Sign Up Form */}
        {tab === "signup" && (
          <form onSubmit={handleSignUp} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Full Name
              </label>
              <input
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFullName(e.target.value)
                }
                className="w-full bg-[#2C2C2C] border border-[#333] text-white placeholder-zinc-400 rounded-xl px-5 py-4 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 transition-all duration-200"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Email
              </label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                className="w-full bg-[#2C2C2C] border border-[#333] text-white placeholder-zinc-400 rounded-xl px-5 py-4 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 transition-all duration-200"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Password
              </label>
              <input
                type="password"
                placeholder="Create a password (min 8 chars, 1 letter, 1 number)"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
                className="w-full bg-[#2C2C2C] border border-[#333] text-white placeholder-zinc-400 rounded-xl px-5 py-4 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 transition-all duration-200"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-4">
                Choose Your Role
              </label>
              <div className="space-y-4">
                <RoleOption
                  title="CREATOR"
                  desc="Build habits, track goals, and level up your life"
                  selected={role === "CREATOR"}
                  onSelect={() => setRole("CREATOR")}
                />
                <RoleOption
                  title="MANAGER"
                  desc="Manage teams and track collective progress"
                  selected={role === "MANAGER"}
                  disabled
                  onSelect={() => {}}
                />
                <RoleOption
                  title="BUSINESS"
                  desc="Enterprise analytics and team management"
                  selected={role === "BUSINESS"}
                  disabled
                  onSelect={() => {}}
                />
              </div>
            </div>

            {isLockedOut && (
              <div className="text-sm text-orange-400 bg-orange-900/20 p-4 rounded-xl border border-orange-500/30">
                ⚠️ Account temporarily locked. Please wait 5 minutes.
              </div>
            )}

            {error && !isLockedOut && (
              <div className="text-sm text-red-400 bg-red-900/20 p-4 rounded-xl border border-red-500/30">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || Boolean(isLockedOut)}
              className="w-full bg-white text-[#1E1E1E] font-bold py-4 rounded-xl hover:bg-zinc-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading
                ? "Creating…"
                : isLockedOut
                ? "Account Locked"
                : "Create Account"}
            </button>
          </form>
        )}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setDebugPanelOpen((prev) => !prev)}
            className="w-full text-sm font-semibold text-zinc-200 bg-[#161616] border border-[#333] rounded-xl px-4 py-3 hover:border-zinc-500 transition-colors"
          >
            {debugPanelOpen
              ? "Hide Supabase debugging details"
              : "Show Supabase debugging details"}
          </button>
          {debugPanelOpen && (
            <div className="mt-4 space-y-3 text-sm text-zinc-300 bg-[#161616] border border-[#333] rounded-xl p-5">
              <p className="text-zinc-400">
                Copy the information below when asking for help. It explains
                which environment variables are loaded and what redirect the
                preview is sending to Supabase.
              </p>
              <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 sm:gap-x-6">
                <div className="space-y-1">
                  <dt className="uppercase tracking-wide text-zinc-500">
                    Supabase URL
                  </dt>
                  <dd className="font-mono text-zinc-200 break-all">
                    {supabaseEnvDebug.url || "Not set"}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="uppercase tracking-wide text-zinc-500">
                    Anon key
                  </dt>
                  <dd className="font-mono text-zinc-200">
                    {supabaseEnvDebug.keyPresent
                      ? "Loaded in browser"
                      : "Missing"}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="uppercase tracking-wide text-zinc-500">
                    Redirect being sent
                  </dt>
                  <dd className="font-mono text-zinc-200 break-all">
                    {redirectResolution.url || "No redirect override"}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="uppercase tracking-wide text-zinc-500">
                    Redirect source
                  </dt>
                  <dd className="font-mono text-zinc-200">
                    {renderRedirectSource(redirectResolution)}
                  </dd>
                </div>
                {redirectResolution.details?.envVar && (
                  <div className="space-y-1">
                    <dt className="uppercase tracking-wide text-zinc-500">
                      Env var in use
                    </dt>
                    <dd className="font-mono text-zinc-200">
                      {redirectResolution.details.envVar}
                    </dd>
                  </div>
                )}
                {redirectResolution.details?.note && (
                  <div className="space-y-1 sm:col-span-2">
                    <dt className="uppercase tracking-wide text-zinc-500">
                      Notes
                    </dt>
                    <dd className="text-zinc-200">
                      {redirectResolution.details.note}
                    </dd>
                  </div>
                )}
                {supabaseEnvDebug.usedFallback && (
                  <div className="space-y-1 sm:col-span-2">
                    <dt className="uppercase tracking-wide text-zinc-500">
                      Legacy fallback
                    </dt>
                    <dd className="text-zinc-200">
                      Using VITE_SUPABASE_* variables because NEXT_PUBLIC_*
                      are missing.
                    </dd>
                  </div>
                )}
                {lastAppError && (
                  <>
                    <div className="space-y-1">
                      <dt className="uppercase tracking-wide text-zinc-500">
                        Last Supabase error code
                      </dt>
                      <dd className="font-mono text-zinc-200 break-all">
                        {lastAppError.code || "unknown"}
                      </dd>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <dt className="uppercase tracking-wide text-zinc-500">
                        Raw Supabase message
                      </dt>
                      <dd className="font-mono text-zinc-200 break-words">
                        {lastAppError.message}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
              <p className="text-xs text-zinc-500">
                Need to update Supabase? Go to Authentication → URL
                Configuration and make sure the domain above is allowed, or set
                NEXT_PUBLIC_SUPABASE_REDIRECT_URL in Vercel.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
