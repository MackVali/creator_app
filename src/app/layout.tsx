import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { EnvChecker } from "@/components/env-checker";
import EnvBadge from "@/components/debug/EnvBadge";
import ErrorBoundary from "@/components/debug/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Premium Dashboard",
  description: "Personal performance OS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const preview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
  const Wrapped = preview ? (
    <ErrorBoundary>{children}</ErrorBoundary>
  ) : (
    <>{children}</>
  );

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased text-zinc-100`}
      >
        <EnvChecker>
          <Providers>
            <AuthLayout>{Wrapped}</AuthLayout>
          </Providers>
        </EnvChecker>
        <EnvBadge />
      </body>
    </html>
  );
}
