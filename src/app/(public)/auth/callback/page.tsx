"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ROUTES } from "@/lib/routes";

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
      const next = searchParams.get("next") || ROUTES.dashboard;
      router.replace(next);
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
