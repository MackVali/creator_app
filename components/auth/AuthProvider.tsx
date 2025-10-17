"use client";
import { useEffect, useState, createContext, useContext } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
};

const AuthCtx = createContext<AuthContextValue>({
  session: null,
  loading: true,
});

export const useAuth = () => useContext(AuthCtx);

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowser?.();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setLoading(false);
    }, 4000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session ?? null);
      })
      .finally(() => {
        if (!timedOut) {
          setLoading(false);
        }
        clearTimeout(timeoutId);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [])

  return (
    <AuthCtx.Provider value={{ session, loading }}>
      {children}
    </AuthCtx.Provider>
  );
}
