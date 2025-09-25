"use client";

import { ReactNode, useCallback, useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

type TextOverrideProviderProps = {
  children: ReactNode;
};

type OverrideEntry = {
  id: string;
  original: string;
  override: string;
};

type OverridesState = {
  byOriginal: Map<string, OverrideEntry>;
  byId: Map<string, OverrideEntry>;
};

type NodeMetadata = {
  originalTrimmed: string;
  prefix: string;
  suffix: string;
  overrideId?: string;
};

function buildOverrides(entries: OverrideEntry[]): OverridesState {
  const byOriginal = new Map<string, OverrideEntry>();
  const byId = new Map<string, OverrideEntry>();

  entries.forEach((entry) => {
    if (!entry.original) return;
    byOriginal.set(entry.original, entry);
    byId.set(entry.id, entry);
  });

  return { byOriginal, byId };
}

function computePrefixAndSuffix(full: string, trimmed: string): [string, string] {
  const startIndex = trimmed ? full.indexOf(trimmed) : -1;

  if (startIndex === -1) {
    return ["", ""];
  }

  const prefix = full.slice(0, startIndex);
  const suffix = full.slice(startIndex + trimmed.length);
  return [prefix, suffix];
}

export default function TextOverrideProvider({ children }: TextOverrideProviderProps) {
  const overridesRef = useRef<OverridesState>({ byOriginal: new Map(), byId: new Map() });
  const nodeMetadataRef = useRef<WeakMap<Text, NodeMetadata>>(new WeakMap());
  const observerRef = useRef<MutationObserver | null>(null);

  const applyOverridesToNode = useCallback((root: Node | null) => {
    if (!root) return;
    const overrides = overridesRef.current;
    const metadataMap = nodeMetadataRef.current;

    const processTextNode = (node: Text) => {
      const currentText = node.textContent;
      if (!currentText) return;

      const metadata = metadataMap.get(node);
      const trimmedCurrent = currentText.trim();
      const canonicalOriginal = metadata?.originalTrimmed ?? trimmedCurrent;

      if (!canonicalOriginal) return;

      let overrideEntry = overrides.byOriginal.get(canonicalOriginal);

      if (!overrideEntry && metadata?.overrideId) {
        overrideEntry = overrides.byId.get(metadata.overrideId);
      }

      if (overrideEntry) {
        const [prefix, suffix] = metadata
          ? [metadata.prefix, metadata.suffix]
          : computePrefixAndSuffix(currentText, trimmedCurrent);

        const targetText = `${prefix}${overrideEntry.override}${suffix}`;

        if (node.textContent !== targetText) {
          node.textContent = targetText;
        }

        metadataMap.set(node, {
          originalTrimmed: canonicalOriginal,
          prefix,
          suffix,
          overrideId: overrideEntry.id,
        });

        return;
      }

      if (metadata?.overrideId) {
        const originalTarget = `${metadata.prefix}${metadata.originalTrimmed}${metadata.suffix}`;

        if (node.textContent !== originalTarget) {
          node.textContent = originalTarget;
        }

        metadataMap.set(node, {
          originalTrimmed: metadata.originalTrimmed,
          prefix: metadata.prefix,
          suffix: metadata.suffix,
        });
      }
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
        .select("id, original_text, override_text")
        .order("original_text", { ascending: true });

      if (!isActive) return;

      if (error) {
        console.error("Failed to load text overrides", error);
        return;
      }

      const entries: OverrideEntry[] = [];

      data?.forEach((entry) => {
        const original = entry.original_text.trim();
        if (!original) {
          return;
        }

        entries.push({
          id: entry.id,
          original,
          override: entry.override_text,
        });
      });

      overridesRef.current = buildOverrides(entries);
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
