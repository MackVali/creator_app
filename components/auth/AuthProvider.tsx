"use client"

import { createContext, useContext, ReactNode } from 'react'
import { User } from '@supabase/supabase-js'
import { useAuth as useAuthHook } from '@/lib/hooks/useAuth'

interface AuthContextType {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { user, loading } = useAuthHook()

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
