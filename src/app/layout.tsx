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
import ClientProviders from "@/components/ClientProviders";
import ErrorBoundary from "@/components/debug/ErrorBoundary";
import AuthProvider from "@/components/auth/AuthProvider";
import React from "react";
import Dither from "@/components/dither/Dither";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="relative min-h-screen">
        <Dither />
        <div className="relative z-10 flex min-h-screen flex-col">
          <ErrorBoundary>
            <AuthProvider>
              <ClientProviders>
                <main className="flex-1">{children}</main>
              </ClientProviders>
            </AuthProvider>
          </ErrorBoundary>
        </div>
      </body>
    </html>
  );
}
