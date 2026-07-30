export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

import "./globals.css";
import ClientProviders from "@/components/ClientProviders";
import ErrorBoundary from "@/components/debug/ErrorBoundary";
import AuthProvider from "@/components/auth/AuthProvider";
import EntitlementProvider from "@/components/entitlement/EntitlementProvider";
import { AmbientAudioProvider } from "@/lib/audio/ambientAudio";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";
import React from "react";

const APP_BOOT_BACKGROUND = "var(--bg, #050505)";

const themeInitScript = `
(function() {
  try {
    var storedTheme = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    var theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "${DEFAULT_THEME}";
    var root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.remove("theme-dark", "theme-light");
    root.classList.add("theme-" + theme);
    root.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = "${DEFAULT_THEME}";
    document.documentElement.classList.add("theme-${DEFAULT_THEME}");
    document.documentElement.style.colorScheme = "${DEFAULT_THEME}";
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      className={`theme-${DEFAULT_THEME}`}
      style={{ backgroundColor: APP_BOOT_BACKGROUND }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="flex min-h-screen flex-col"
        style={{ backgroundColor: APP_BOOT_BACKGROUND }}
      >
        <ErrorBoundary>
          <AuthProvider>
            <EntitlementProvider>
              <ClientProviders>
                <AmbientAudioProvider>
                  <main
                    className="flex-1 bg-[var(--bg)] text-[var(--text)]"
                    data-creator-root
                    style={{ backgroundColor: APP_BOOT_BACKGROUND }}
                  >
                    {children}
                  </main>
                </AmbientAudioProvider>
              </ClientProviders>
            </EntitlementProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
