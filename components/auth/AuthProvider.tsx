"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    if (!supabase) {
      // Supabase client not available - environment variables missing
      setLoading(false);
      setIsReady(true);
      return;
    }

    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setUser(session?.user || null);
        // Always set loading to false and ready to true, regardless of session state
        setLoading(false);
        setIsReady(true);
      } catch (error) {
        console.error("Failed to get initial session:", error);
        setUser(null);
        setLoading(false);
        setIsReady(true);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user || null);
      // Update loading state for auth changes
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Don't render children until we're ready
  if (!isReady) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
