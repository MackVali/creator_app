"use client"

import { useAuth } from './AuthProvider'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { Loader2 } from 'lucide-react'

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0b0c] p-4">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  // If not authenticated, render children without sidebar/topbar
  if (!user) {
    return <>{children}</>
  }

  // If authenticated, render with sidebar and topbar
  return (
    <div className="flex min-h-dvh">
      {/* Sidebar - hidden on mobile, visible on desktop */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      
      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
