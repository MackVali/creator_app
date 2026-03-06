"use client";
import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import TextOverrideProvider from "./TextOverrideProvider";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 10 * 60 * 1000, // 10 minutes (replaces cacheTime)
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    const handler = (e: TouchEvent) => e.touches.length > 1 && e.preventDefault();
    document.addEventListener("touchmove", handler, { passive: false });
    return () => document.removeEventListener("touchmove", handler);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    void Keyboard.setResizeMode({ mode: "none" }).catch((error) => {
      console.warn("Failed to set keyboard resize mode", error);
    });

    void Keyboard.setScroll({ isDisabled: true }).catch((error) => {
      console.warn("Failed to disable native keyboard scroll adjustments", error);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TextOverrideProvider>{children}</TextOverrideProvider>
    </QueryClientProvider>
  );
}
