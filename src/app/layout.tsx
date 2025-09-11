export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import "./globals.css";
import "@/styles/theme.css";
import DitherBackground from "@/components/ui/DitherBackground";
import ClientProviders from "@/components/ClientProviders";
import ErrorBoundary from "@/components/debug/ErrorBoundary";
import AuthProvider from "@/components/auth/AuthProvider";
import React from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="relative text-[var(--text-primary)] antialiased flex min-h-screen flex-col">
        <DitherBackground parallax={true} tint={true} />
        <ErrorBoundary>
          <AuthProvider>
            <ClientProviders>
              <main className="relative z-10 flex-1">{children}</main>
            </ClientProviders>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
