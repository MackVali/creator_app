export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

import "./globals.css";
import ClientProviders from "@/components/ClientProviders";
import ErrorBoundary from "@/components/debug/ErrorBoundary";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import React from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <ErrorBoundary>
          <ClientProviders>
            <TopNav username="MackVali" />
            <main className="flex-1">{children}</main>
            <BottomNav />
          </ClientProviders>
        </ErrorBoundary>
      </body>
    </html>
  );
}
