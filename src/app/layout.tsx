export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

import "./globals.css";
import ClientProviders from "@/components/ClientProviders";
import React from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="antialiased">
      <body className="bg-[#0b0b0c] text-white/90 selection:bg-white/20 selection:text-white">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
