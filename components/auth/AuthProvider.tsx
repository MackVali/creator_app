"use client";
import { useEffect, useRef, useState, createContext, useContext } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const AuthCtx = createContext<{ session: Session | null }>({ session: null });
export const useAuth = () => useContext(AuthCtx);

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser?.()
    if (!supabase) { setReady(true); return }

    let timed = false
    const t = setTimeout(() => { timed = true; setReady(true) }, 4000)

    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null)).finally(() => {
      if (!timed) setReady(true)
      clearTimeout(t)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  const ensuredProfileForUser = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      ensuredProfileForUser.current = null;
      return;
    }

    if (ensuredProfileForUser.current === userId) {
      return;
    }

    let cancelled = false;

    const ensureProfile = async () => {
      try {
        ensuredProfileForUser.current = userId;
        const response = await fetch("/api/profile/ensure", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        if (!response.ok && !cancelled) {
          ensuredProfileForUser.current = null;
        }
      } catch (error) {
        if (!cancelled) {
          ensuredProfileForUser.current = null;
          console.error("Failed to ensure profile", error);
        }
      }
    };

    ensureProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  if (!ready) return null;
  return <AuthCtx.Provider value={{ session }}>{children}</AuthCtx.Provider>;
}
