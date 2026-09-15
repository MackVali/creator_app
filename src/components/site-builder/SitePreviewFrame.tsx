"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PortfolioSite from "@/components/portfolio/PortfolioSite";
import {
  mackValiSiteDocument,
  renderMackSiteDraft,
} from "@/lib/site-builder/mackValiSite";
import {
  createSitePreviewHeightMessage,
  isSitePreviewStateMessage,
} from "@/lib/site-builder/previewMessages";
import type { SiteDocument } from "@/lib/site-builder/types";
import type { SourceListing } from "@/types/source";

function cloneInitialSite(): SiteDocument {
  return JSON.parse(JSON.stringify(mackValiSiteDocument)) as SiteDocument;
}

function getDocumentHeight() {
  const body = document.body;
  const element = document.documentElement;

  return Math.ceil(
    Math.max(
      body.scrollHeight,
      body.offsetHeight,
      element.clientHeight,
      element.scrollHeight,
      element.offsetHeight,
    ),
  );
}

export default function SitePreviewFrame() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [site, setSite] = useState<SiteDocument>(cloneInitialSite);
  const [sourceListings, setSourceListings] = useState<SourceListing[]>([]);

  const previewSite = useMemo(() => renderMackSiteDraft(site), [site]);
  const homePage =
    site.pages.find((page) => page.id === "home") ?? site.pages[0];

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isSitePreviewStateMessage(event.data)) return;

      setSite(event.data.payload.site);
      setSourceListings(event.data.payload.sourceListings);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    let animationFrame = 0;

    const postHeight = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        window.parent.postMessage(
          createSitePreviewHeightMessage(getDocumentHeight()),
          window.location.origin,
        );
      });
    };

    postHeight();

    const observer = new ResizeObserver(postHeight);
    observer.observe(document.documentElement);
    observer.observe(document.body);

    if (rootRef.current) {
      observer.observe(rootRef.current);
    }

    window.addEventListener("load", postHeight);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("load", postHeight);
    };
  }, [site, sourceListings]);

  return (
    <div ref={rootRef}>
      <PortfolioSite
        site={previewSite}
        sections={homePage?.sections ?? []}
        sourceListings={sourceListings}
        editorPreview
      />
    </div>
  );
}
