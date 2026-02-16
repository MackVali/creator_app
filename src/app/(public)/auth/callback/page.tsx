"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const mod = await import("@/lib/supabase");
      const getSupabaseBrowser = mod.getSupabaseBrowser;
      const supabase = getSupabaseBrowser?.();
      if (!supabase) {
        setErr("Supabase not initialized");
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(
        window.location.search
      );
      if (error) {
        setErr(error.message);
        return;
      }
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("[AuthCallback] Unable to load user", userError);
      }

      if (!user) {
        setErr("Unable to determine authenticated user.");
        return;
      }

      const { data: legalAcceptance, error: legalError } = await supabase
        .from("user_legal_acceptances")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (legalError) {
        console.error("[AuthCallback] Failed to check legal acceptance", legalError);
      }

      if (!legalAcceptance) {
        router.replace("/legal/accept");
        return;
      }
      const redirectTo =
        searchParams.get("redirect") || "/dashboard";

      const normalizeRedirect = (path?: string | null) =>
        path && path.startsWith("/") ? path : "/dashboard";

      const finalRedirect = normalizeRedirect(redirectTo);

      router.replace(finalRedirect);
    })();
  }, [router, searchParams]);
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100dvh",
        color: "#ddd",
      }}
    >
      {" "}
      {err ? `Auth error: ${err}` : "Signing you in…"}{" "}
    </div>
  );
}
