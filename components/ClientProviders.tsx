"use client";
import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
    const phrases = [
      "made with lovable",
      "made with ai",
      "generated with ai",
      "lovable",
      "lovable ai",
      "powered by ai",
    ];
    const normalized = phrases.map((phrase) => phrase.toLowerCase());
    const markerAttribute = "data-watermark-filtered";

    const shouldHide = (value: string | null | undefined) => {
      if (!value) return false;
      const text = value.toLowerCase();
      return normalized.some((phrase) => text.includes(phrase));
    };

    const hideElement = (element: HTMLElement) => {
      if (element.hasAttribute(markerAttribute)) {
        return;
      }
      element.setAttribute(markerAttribute, "true");
      element.style.setProperty("display", "none", "important");
      element.style.setProperty("visibility", "hidden", "important");
    };

    const inspectNode = (node: Node | null) => {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent && shouldHide(node.textContent)) {
          hideElement(parent);
        }
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (element.hasAttribute(markerAttribute)) {
          return;
        }

        if (shouldHide(element.textContent)) {
          hideElement(element);
          return;
        }

        for (const attributeName of element.getAttributeNames()) {
          if (shouldHide(element.getAttribute(attributeName))) {
            hideElement(element);
            return;
          }
        }

        element.childNodes.forEach((child) => inspectNode(child));
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          inspectNode(mutation.target.parentNode);
        }

        mutation.addedNodes.forEach((node) => {
          inspectNode(node);
        });
      }
    });

    if (document?.body) {
      inspectNode(document.body);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    return () => observer.disconnect();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
