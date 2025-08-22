export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

import type { Metadata } from "next";
import { ReactNode } from "react";
import "../styles/globals.css";
import ClientProviders from "@/components/ClientProviders";
import ErrorBoundary from "@/components/debug/ErrorBoundary";
import TopNav from "../components/navigation/TopNav";
import BottomNav from "../components/navigation/BottomNav";

export const metadata: Metadata = {
  title: "ACCOUNTABILITY",
  description:
    "Productivity with skills, goals, projects, tasks, habits, monuments.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen text-white">
        <ErrorBoundary>
          <ClientProviders>
            <TopNav username="MackVali" />
            <main className="px-4 pb-24 pt-16 max-w-screen-md mx-auto">
              {children}
            </main>
            <BottomNav />
          </ClientProviders>
        </ErrorBoundary>
      </body>
    </html>
  );
}
