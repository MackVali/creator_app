"use client";

import { ReactNode, useCallback, useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

type TextOverrideProviderProps = {
  children: ReactNode;
};

export default function TextOverrideProvider({ children }: TextOverrideProviderProps) {
  const overridesRef = useRef<Map<string, string>>(new Map());
  const observerRef = useRef<MutationObserver | null>(null);

  const applyOverridesToNode = useCallback((root: Node | null) => {
    if (!root) return;
    const overrides = overridesRef.current;
    if (!overrides.size) return;

    const processTextNode = (node: Text) => {
      const originalContent = node.textContent;
      if (!originalContent) return;

      const trimmed = originalContent.trim();
      if (!trimmed) return;

      const override = overrides.get(trimmed);
      if (!override) return;

      if (trimmed === override && originalContent === override) {
        return;
      }

      const startIndex = originalContent.indexOf(trimmed);
      if (startIndex === -1) {
        node.textContent = override;
        return;
      }

      const prefix = originalContent.slice(0, startIndex);
      const suffix = originalContent.slice(startIndex + trimmed.length);
      node.textContent = `${prefix}${override}${suffix}`;
    };

    if (root.nodeType === Node.TEXT_NODE) {
      processTextNode(root as Text);
      return;
    }

    const ownerDocument = (root as HTMLElement | Document).ownerDocument ?? document;
    const walker = ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    let currentNode = walker.nextNode();
    while (currentNode) {
      processTextNode(currentNode as Text);
      currentNode = walker.nextNode();
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    if (!supabase || typeof document === "undefined") {
      return;
    }

    let isActive = true;

    const loadOverrides = async () => {
      const { data, error } = await supabase
        .from("text_overrides")
        .select("original_text, override_text")
        .order("original_text", { ascending: true });

      if (!isActive) return;

      if (error) {
        console.error("Failed to load text overrides", error);
        return;
      }

      const map = new Map<string, string>();
      data?.forEach((entry) => {
        map.set(entry.original_text.trim(), entry.override_text);
      });

      overridesRef.current = map;
      applyOverridesToNode(document.body);
    };

    loadOverrides();

    const channel = supabase
      .channel("text_overrides_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "text_overrides" },
        () => {
          loadOverrides().catch((error) => {
            console.error("Failed to refresh text overrides", error);
          });
        },
      )
      .subscribe();

    observerRef.current = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          applyOverridesToNode(mutation.target);
        } else if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            applyOverridesToNode(node);
          });
        }
      }
    });

    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      isActive = false;
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [applyOverridesToNode]);

  return <>{children}</>;
}
