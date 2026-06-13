"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { parseSupabaseError } from "@/lib/error-handling";
import RoleOption from "@/components/auth/RoleOption";
import { cn } from "@/lib/utils";

// Password validation function - relaxed requirements
const validatePassword = (password: string): string | null => {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[a-zA-Z]/.test(password))
    return "Password must contain at least 1 letter";
  if (!/\d/.test(password)) return "Password must contain at least 1 number";
  return null;
};

const authSegmentedToggleContainerClassName =
  "inline-flex w-full rounded-xl border border-zinc-600/70 bg-[#232326] p-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] sm:w-auto";

const authSegmentedToggleButtonClassName =
  "min-h-9 flex-1 rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition sm:flex-none";

const authSegmentedToggleActiveClassName =
  "bg-[#3a3a3d] text-white shadow-[0_1px_2px_rgba(0,0,0,0.24),0_8px_18px_rgba(0,0,0,0.18)]";

const authSegmentedToggleInactiveClassName =
  "text-zinc-400 hover:bg-[#2d2d30] hover:text-zinc-100";

export default function AuthForm() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"CREATOR" | "MANAGER" | "ENTERPRISE">(
    "CREATOR"
  );
  const [stay, setStay] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Rate limiting state
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<Date | null>(null);
  const [lockoutDuration] = useState(5 * 60 * 1000); // 5 minutes

  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowser();
  const authCopy =
    tab === "signin"
      ? {
          title: "Welcome back!",
          subtitle: "Sign in to continue building your future.",
        }
      : {
          title: "Create your account",
          subtitle: "Start building goals, systems, and momentum.",
        };
  const labelClassName =
    "mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300";
  const inputClassName =
    "h-12 w-full rounded-xl border border-zinc-600 bg-zinc-800/80 px-4 text-sm text-zinc-100 placeholder-zinc-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.035)] outline-none transition-all duration-200 focus:border-zinc-400 focus:bg-zinc-800 focus:ring-2 focus:ring-zinc-300/15 disabled:cursor-not-allowed disabled:bg-zinc-700/40 disabled:text-zinc-500";
  const statusClassName =
    "mb-5 rounded-xl border px-4 py-3 text-sm leading-relaxed";
  const submitClassName =
    "h-12 w-full rounded-xl border border-black bg-[#232326] px-4 text-sm font-bold text-zinc-50 shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition-all duration-200 hover:bg-[#2d2d30] disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-[#232326]/50 disabled:text-zinc-500 disabled:shadow-none";

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

  useEffect(() => {
    setSignupStep(1);
  }, [tab]);

  // Add this check at the beginning of your component
  if (!supabase) {
    return (
      <div className="relative z-10 mx-auto w-full max-w-[25rem]">
        <div className="mb-6 text-center">
          <h1 className="mb-2 text-4xl font-black uppercase tracking-[0.16em] text-zinc-100">
            CREATOR
          </h1>
          <p className="text-sm font-medium text-zinc-400">
            Turn your life into a system.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-600/70 bg-[#363638] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.22)] sm:p-6">
          <div className="text-center">
            <div className="mb-4 rounded-xl border border-red-400/30 bg-red-950/25 p-4 text-sm font-semibold text-red-200">
              Configuration Error
            </div>
            <p className="mb-4 text-sm text-zinc-300">
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

  const handleAuthError = (error: { message?: string }) => {
    const appError = parseSupabaseError(error);
    setAttempts((prev: number) => prev + 1);

    // Lock out after 5 failed attempts
    if (attempts >= 4) {
      setLockoutTime(new Date());
      setError(
        "Too many failed attempts. Please wait 5 minutes before trying again."
      );
    } else {
      setError(appError.userMessage);
    }
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

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        handleAuthError(error);
      } else {
        setAttempts(0);
        const redirectTo = searchParams.get("redirect") || "/dashboard";
        let destination = redirectTo;

        try {
          const userId =
            data.user?.id ||
            (await supabase.auth.getUser()).data.user?.id ||
            null;

          if (userId) {
            const { data: profileData, error: profileError } = await supabase
              .from("profiles")
              .select("id")
              .eq("user_id", userId)
              .maybeSingle();

            const hasProfile = !!profileData && !profileError;
            if (!hasProfile) {
              const params = new URLSearchParams({ onboarding: "1" });
              params.set("redirect", redirectTo);
              destination = `/profile/edit?${params.toString()}`;
            }
          }
        } catch (profileCheckError) {
          console.error("Error verifying profile after sign-in:", profileCheckError);
        }

        const normalizeRedirect = (path?: string | null) =>
          path && path.startsWith("/") ? path : "/dashboard";

        const finalDestination = normalizeRedirect(destination);

        const shouldCheckSkillStack = !finalDestination.startsWith(
          "/onboarding/skills"
        );

        if (shouldCheckSkillStack) {
          try {
            const res = await fetch("/api/onboarding/needs-skill-stack", {
              cache: "no-store",
            });
            if (res.ok) {
              const body = (await res.json()) as {
                needsSkillStack?: boolean;
              };
              if (body.needsSkillStack) {
                const onboardingRedirect = `/onboarding/skills?redirect=${encodeURIComponent(
                  finalDestination
                )}`;
                router.replace(onboardingRedirect);
                return;
              }
            } else {
              console.error(
                "Failed to check skill stack needs after sign-in:",
                res.status,
                res.statusText
              );
            }
          } catch (fetchError) {
            console.error(
              "Unable to evaluate skill stack requirement after sign-in:",
              fetchError
            );
          }
        }

        router.replace(finalDestination);
      }
    } catch (err) {
      handleAuthError(err as { message?: string });
    } finally {
      setLoading(false);
    }
  }

  function handleSignUpNext(e: React.FormEvent) {
    e.preventDefault();
    if (isLockedOut) {
      setError("Account temporarily locked. Please wait before trying again.");
      return;
    }

    if (!fullName.trim()) {
      setError("Full name is required");
      return;
    }

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setError(null);
    setSuccess(null);
    setSignupStep(2);
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

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        handleAuthError(error);
      } else {
        setAttempts(0);
        // Check if email confirmation is required
        if (data.user && !data.user.email_confirmed_at) {
          setSuccess(
            "Account created! Please check your email to confirm your account."
          );
        } else {
          // Email confirmation disabled, redirect to dashboard
          const redirectTo = searchParams.get("redirect") || "/dashboard";
          router.replace(redirectTo);
        }
      }
    } catch (err) {
      handleAuthError(err as { message?: string });
    } finally {
      setLoading(false);
    }
  }

  const handleForgotPassword = () => {
    router.push("/forgot-password");
  };

  const handleTabChange = (nextTab: "signin" | "signup") => {
    setTab(nextTab);
  };

  return (
    <div className="relative z-10 mx-auto w-full max-w-[25rem]">
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="mb-2 text-4xl font-black uppercase tracking-[0.16em] text-zinc-100 sm:text-[2.65rem]">
          CREATOR
        </h1>
        <p className="text-sm font-medium text-zinc-400">
          Turn your life into a system.
        </p>
      </div>

      {/* Main Card */}
      <div className="rounded-3xl border border-zinc-600/70 bg-[#363638] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.22)] sm:p-6">
        {/* Welcome Section */}
        <div className="mb-6">
          <h2 className="mb-2 text-2xl font-bold text-zinc-100">
            {authCopy.title}
          </h2>
          <p className="text-sm leading-6 text-zinc-400">
            {authCopy.subtitle}
          </p>
        </div>

        {/* Tab System */}
        <div className="mb-6">
          <div
            className={authSegmentedToggleContainerClassName}
            aria-label="Auth mode"
          >
            {(
              [
                { value: "signin", label: "Sign In" },
                { value: "signup", label: "Sign Up" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleTabChange(option.value)}
                className={cn(
                  authSegmentedToggleButtonClassName,
                  tab === option.value
                    ? authSegmentedToggleActiveClassName
                    : authSegmentedToggleInactiveClassName
                )}
                aria-pressed={tab === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div
            className={`${statusClassName} border-zinc-500/60 bg-zinc-700/45 text-zinc-100`}
          >
            {success}
          </div>
        )}

        {/* Sign In Form */}
        {tab === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className={labelClassName}>
                Email
              </label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                className={inputClassName}
                required
              />
            </div>

            <div>
              <label className={labelClassName}>
                Password
              </label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
                className={inputClassName}
                required
              />
            </div>

            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={stay}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setStay(e.target.checked)
                }
                className="h-4 w-4 rounded border-zinc-500 bg-zinc-800 text-zinc-200 focus:ring-2 focus:ring-zinc-300/15 focus:ring-offset-0 focus:ring-offset-transparent"
              />
              <span>Remain signed in</span>
            </label>

            {isLockedOut && (
              <div
                className={`${statusClassName} border-amber-300/30 bg-amber-950/25 text-amber-200`}
              >
                Account temporarily locked. Please wait 5 minutes.
              </div>
            )}

            {error && !isLockedOut && (
              <div
                className={`${statusClassName} border-red-400/30 bg-red-950/25 text-red-200`}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || Boolean(isLockedOut)}
              className={submitClassName}
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
                className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
              >
                Forgot your password?
              </button>
            </div>
          </form>
        )}

        {/* Sign Up Form */}
        {tab === "signup" && (
          <form
            onSubmit={signupStep === 1 ? handleSignUpNext : handleSignUp}
            className="space-y-4"
          >
            {signupStep === 1 ? (
              <>
                <div>
                  <label className={labelClassName}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFullName(e.target.value)
                    }
                    className={inputClassName}
                    required
                  />
                </div>

                <div>
                  <label className={labelClassName}>
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEmail(e.target.value)
                    }
                    className={inputClassName}
                    required
                  />
                </div>

                <div>
                  <label className={labelClassName}>
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="Create a password (min 8 chars, 1 letter, 1 number)"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setPassword(e.target.value)
                    }
                    className={inputClassName}
                    required
                  />
                </div>
              </>
            ) : (
              <div>
                <label className={labelClassName}>
                  Choose Your Role
                </label>
                <div className="space-y-3">
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
                    title="ENTERPRISE"
                    desc="Enterprise analytics and team management"
                    selected={role === "ENTERPRISE"}
                    disabled
                    onSelect={() => {}}
                  />
                </div>
              </div>
            )}

            {isLockedOut && (
              <div
                className={`${statusClassName} border-amber-300/30 bg-amber-950/25 text-amber-200`}
              >
                Account temporarily locked. Please wait 5 minutes.
              </div>
            )}

            {error && !isLockedOut && (
              <div
                className={`${statusClassName} border-red-400/30 bg-red-950/25 text-red-200`}
              >
                {error}
              </div>
            )}

            {signupStep === 2 && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSignupStep(1);
                }}
                className="h-11 w-full rounded-xl border border-zinc-600/70 bg-transparent px-4 text-sm font-bold text-zinc-200 transition-all duration-200 hover:bg-zinc-700/45 hover:text-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-500"
                disabled={loading}
              >
                Back
              </button>
            )}

            <button
              type="submit"
              disabled={loading || Boolean(isLockedOut)}
              className={submitClassName}
            >
              {loading
                ? "Creating…"
                : isLockedOut
                ? "Account Locked"
                : signupStep === 1
                ? "Next"
                : "Create Account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
