"use client";

import { useAuth } from "./AuthProvider";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { user } = useAuth();

  // If not authenticated, render children without sidebar/topbar
  if (!user) {
    return <>{children}</>;
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
        <main className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
