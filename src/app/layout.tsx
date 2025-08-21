import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { EnvChecker } from "@/components/env-checker";
import EnvBadge from "@/components/debug/EnvBadge";

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
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased text-zinc-100`}>
        <EnvChecker>
          <Providers>
            <AuthLayout>
              {children}
            </AuthLayout>
          </Providers>
        </EnvChecker>
        <EnvBadge />
      </body>
    </html>
  );
}
