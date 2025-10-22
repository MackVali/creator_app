"use client";
import { useEffect, useState, createContext, useContext } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

const AuthCtx = createContext<{ session: Session | null; user: User | null }>({
  session: null,
  user: null,
});
export const useAuth = () => useContext(AuthCtx);

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser?.()
    if (!supabase) { setReady(true); return }

    let timed = false
    const t = setTimeout(() => { timed = true; setReady(true) }, 4000)
    let active = true

    const updateAuthState = async () => {
      try {
        const [sessionResult, userResult] = await Promise.all([
          supabase.auth.getSession(),
          supabase.auth.getUser(),
        ])

        if (!active) return

        setSession(sessionResult.data.session ?? null)
        setUser(userResult.data.user ?? null)
      } catch {
        if (!active) return

        setSession(null)
        setUser(null)
      } finally {
        if (!active) return

        if (!timed) {
          setReady(true)
          clearTimeout(t)
          timed = true
        }
      }
    }

    void updateAuthState()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void updateAuthState()
    })

    return () => {
      active = false
      clearTimeout(t)
      sub?.subscription.unsubscribe()
    }
  }, [])

  if (!ready) return null;
  return <AuthCtx.Provider value={{ session, user }}>{children}</AuthCtx.Provider>;
}
