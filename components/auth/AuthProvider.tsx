"use client";
import { useEffect, useRef, useState, createContext, useContext } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { initRevenueCatIfCapacitor } from "@/lib/revenuecat/initRevenueCat";
import { registerCreatorPushNotifications } from "@/lib/notifications/registerPushNotifications";
import { BloomingHexagonLoader } from "@/components/loading/BloomingHexagonLoader";
import type { Session, User } from "@supabase/supabase-js";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  ready: boolean;
  loading: boolean;
};

const AuthCtx = createContext<AuthContextValue>({
  session: null,
  user: null,
  ready: false,
  loading: true,
});
export const useAuth = () => useContext(AuthCtx);

const BOOT_LOADER_MINIMUM_MS = 1600;

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [canRender, setCanRender] = useState(false);
  const [bootLoaderMinimumElapsed, setBootLoaderMinimumElapsed] =
    useState(false);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBootLoaderMinimumElapsed(true);
    }, BOOT_LOADER_MINIMUM_MS);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowser?.()
    if (!supabase) {
      setReady(true);
      setCanRender(true);
      return
    }

    let active = true
    let initialSessionResolved = false
    const t = setTimeout(() => {
      if (!active || initialSessionResolved) {
        return
      }

      initialSessionResolved = true
      setSession(sessionRef.current)
      setUser(sessionRef.current?.user ?? null)
      setReady(true)
      setCanRender(true)
    }, 4000)

    const applySession = (nextSession: Session | null) => {
      sessionRef.current = nextSession
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
    }

    const refreshUserForSession = async (currentSession: Session | null) => {
      if (!currentSession) {
        return
      }

      try {
        const userResult = await supabase.auth.getUser()
        if (!active || !userResult.data.user) {
          return
        }

        setUser(userResult.data.user)
      } catch {
        // Keep the session-derived user if getUser is slow or unavailable.
      }
    }

    const updateAuthState = async () => {
      try {
        const sessionResult = await supabase.auth.getSession()

        if (!active) return

        const nextSession = sessionResult.data.session ?? null
        initialSessionResolved = true
        applySession(nextSession)
        setReady(true)
        setCanRender(true)
        clearTimeout(t)
        void refreshUserForSession(nextSession)
      } catch {
        if (!active) return

        initialSessionResolved = true
        applySession(null)
        setReady(true)
        setCanRender(true)
        clearTimeout(t)
      }
    }

    void updateAuthState()

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) {
        return
      }

      applySession(nextSession)
      if (!initialSessionResolved && event === "INITIAL_SESSION") {
        return
      }

      setReady(true)
      setCanRender(true)
      clearTimeout(t)
      void refreshUserForSession(nextSession)
    })

    return () => {
      active = false
      clearTimeout(t)
      sub?.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user?.id) {
      return
    }

    void initRevenueCatIfCapacitor(user.id)
    void registerCreatorPushNotifications({ userId: user.id })
  }, [user?.id])

  const shouldShowBootLoader = !canRender || !bootLoaderMinimumElapsed;

  if (shouldShowBootLoader) {
    return <BloomingHexagonLoader statusText="Syncing your system" />;
  }

  return (
    <AuthCtx.Provider value={{ session, user, ready, loading: !ready }}>
      {children}
    </AuthCtx.Provider>
  );
}
