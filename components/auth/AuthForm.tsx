"use client";
import { useState, useEffect } from "react";
import { Label, Input, Button, Card, TabButton } from "@/components/ui/field";
import RoleOption from "@/components/auth/RoleOption";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { parseSupabaseError } from "@/lib/error-handling";

// Password validation function
const validatePassword = (password: string): string | null => {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain lowercase letter";
  if (!/\d/.test(password)) return "Password must contain number";
  if (!/\W/.test(password)) return "Password must contain special character";
  return null;
};

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

  // Rate limiting state
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<Date | null>(null);
  const [lockoutDuration] = useState(5 * 60 * 1000); // 5 minutes

  const router = useRouter();

  const supabase = getSupabaseBrowser?.();

  // Check if user is locked out
  const isLockedOut =
    lockoutTime &&
    new Date().getTime() - lockoutTime.getTime() < lockoutDuration;

  // Reset lockout after duration
  useEffect(() => {
    if (lockoutTime) {
      const timer = setTimeout(() => {
        setLockoutTime(null);
        setAttempts(0);
      }, lockoutDuration);
      return () => clearTimeout(timer);
    }
  }, [lockoutTime, lockoutDuration]);

  const handleAuthError = (error: { message?: string }) => {
    const appError = parseSupabaseError(error);
    setAttempts((prev) => prev + 1);

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

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        handleAuthError(error);
      } else {
        // Reset attempts on successful login
        setAttempts(0);
        router.replace("/dashboard");
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

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role } },
      });

      if (error) {
        handleAuthError(error);
      } else {
        // Reset attempts on successful signup
        setAttempts(0);
        router.replace("/dashboard");
      }
    } catch (err) {
      handleAuthError(err as { message?: string });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      <div className="mb-6 text-center">
        <div className="text-3xl font-extrabold tracking-widest text-zinc-200">
          <span className="text-zinc-400">ACCOUNT</span>ABILITY
        </div>
        <div className="mt-2 text-sm text-zinc-400">Level up your life!</div>
      </div>

      <Card className="pt-5">
        <div className="px-1">
          <div className="text-lg font-semibold text-zinc-200">Welcome</div>
          <div className="mt-1 text-sm text-zinc-400">
            Sign in to your account or create a new one
          </div>
        </div>

        <div className="mt-4 flex rounded-md border border-zinc-800/70 bg-zinc-900/50 p-1">
          <TabButton active={tab === "signin"} onClick={() => setTab("signin")}>
            Sign In
          </TabButton>
          <TabButton active={tab === "signup"} onClick={() => setTab("signup")}>
            Sign Up
          </TabButton>
        </div>

        {tab === "signin" ? (
          <form onSubmit={handleSignIn} className="mt-5 space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <label className="mt-1 flex select-none items-center gap-2 text-[13px] text-zinc-400">
              <input
                type="checkbox"
                checked={stay}
                onChange={(e) => setStay(e.target.checked)}
                className="h-3.5 w-3.5 rounded border border-zinc-700 bg-zinc-900"
              />
              Remain signed in
            </label>
            {isLockedOut && (
              <div className="text-[13px] text-orange-400 bg-orange-900/20 p-2 rounded border border-orange-500/30">
                ⚠️ Account temporarily locked. Please wait 5 minutes.
              </div>
            )}
            {error && !isLockedOut ? (
              <div className="text-[13px] text-red-400">{error}</div>
            ) : null}
            <Button disabled={loading || Boolean(isLockedOut)}>
              {loading
                ? "Signing in…"
                : isLockedOut
                ? "Account Locked"
                : "Sign In"}
            </Button>
            <div className="mt-1 text-center text-xs text-zinc-500">
              Forgot your password?
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="mt-5 space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Create a password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <Label>Choose Your Role</Label>
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
                  title="BUSINESS"
                  desc="Enterprise analytics and team management"
                  selected={role === "BUSINESS"}
                  disabled
                  onSelect={() => {}}
                />
              </div>
            </div>

            {isLockedOut && (
              <div className="text-[13px] text-orange-400 bg-orange-900/20 p-2 rounded border border-orange-500/30">
                ⚠️ Account temporarily locked. Please wait 5 minutes.
              </div>
            )}
            {error && !isLockedOut ? (
              <div className="text-[13px] text-red-400">{error}</div>
            ) : null}
            <Button disabled={loading || Boolean(isLockedOut)}>
              {loading
                ? "Creating…"
                : isLockedOut
                ? "Account Locked"
                : "Create Account"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
