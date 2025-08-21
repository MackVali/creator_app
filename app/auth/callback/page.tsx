"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = getSupabaseBrowser();

        if (!supabase) {
          setError(
            "Supabase client not available - check environment variables"
          );
          setLoading(false);
          return;
        }

        const code = searchParams.get("code");
        const next = searchParams.get("next") || "/dashboard";

        if (!code) {
          setError("No authorization code provided");
          setLoading(false);
          return;
        }

        // Exchange the code for a session
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          console.error("Auth callback error:", exchangeError);
          setError(exchangeError.message || "Failed to authenticate");
          setLoading(false);
          return;
        }

        // Successfully authenticated, redirect to dashboard
        router.push(next);
      } catch (err) {
        console.error("Unexpected error during auth callback:", err);
        setError("An unexpected error occurred during authentication");
        setLoading(false);
      }
    };

    handleCallback();
  }, [router, searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0b0c] text-zinc-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-100 mx-auto"></div>
          <p className="text-lg">Completing authentication...</p>
          <p className="text-sm text-zinc-400">
            Please wait while we sign you in
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0b0b0c] text-zinc-100 flex items-center justify-center">
        <div className="text-center space-y-6 max-w-md mx-auto px-4">
          <div className="text-red-400 text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold">Authentication Failed</h1>
          <p className="text-zinc-300">{error}</p>
          <div className="space-y-3">
            <button
              onClick={() => router.push("/auth")}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-4 py-2 rounded-lg transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push("/")}
              className="w-full bg-transparent border border-zinc-700 hover:border-zinc-600 text-zinc-300 px-4 py-2 rounded-lg transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
