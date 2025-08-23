"use client";
import { useEffect, useState, createContext, useContext } from "react";
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

  if (!ready) return null;
  return <AuthCtx.Provider value={{ session }}>{children}</AuthCtx.Provider>;
}
