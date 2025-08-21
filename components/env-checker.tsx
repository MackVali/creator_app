"use client"

import { ReactNode } from 'react'
import { EnvError } from './ui/env-error'

interface EnvCheckerProps {
  children: ReactNode
}

export function EnvChecker({ children }: EnvCheckerProps) {
  // Check if required environment variables are present
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) {
    const missingVars = []
    if (!supabaseUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!supabaseAnonKey) missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    
    // Only show error component in development
    if (process.env.NODE_ENV === 'development') {
      return <EnvError missingVars={missingVars} />
    }
    
    // In production, this should have thrown during build, but as a fallback:
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0b0c] text-zinc-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Configuration Error</h1>
          <p className="text-muted-foreground">
            Missing required environment variables. Please check your deployment configuration.
          </p>
        </div>
      </div>
    )
  }
  
  return <>{children}</>
}
