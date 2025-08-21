"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.exchangeCodeForSession();
      if (error) {
        setErr(error.message);
        return;
      }
      router.replace("/dashboard");
    };
    run();
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center text-zinc-200">
      {err ? `Auth error: ${err}` : "Signing you in…"}
    </div>
  );
}
