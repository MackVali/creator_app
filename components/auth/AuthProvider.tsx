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

    let mounted = true;
    let initialResolved = false;

    const resolve = (nextSession: Session | null) => {
      if (!mounted) {
        return;
      }
      setSession(nextSession);
    };

    const markResolved = () => {
      if (!mounted || initialResolved) {
        return;
      }
      initialResolved = true;
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      resolve(nextSession ?? null);

      if (event === "INITIAL_SESSION") {
        markResolved();
        return;
      }

      if (nextSession) {
        markResolved();
        return;
      }

      if (event === "SIGNED_OUT" || event === "USER_DELETED") {
        markResolved();
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      resolve(data.session ?? null);

      if (data.session) {
        markResolved();
      }
    });

    const fallbackId = setTimeout(() => {
      markResolved();
    }, 1500);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      clearTimeout(fallbackId);
    };
  }, []);

  return (
    <AuthCtx.Provider value={{ session, loading }}>
      {children}
    </AuthCtx.Provider>
  );
}
