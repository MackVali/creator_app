"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PortfolioSite from "@/components/portfolio/PortfolioSite";
import {
  mackValiSiteDocument,
  renderMackSiteDraft,
} from "@/lib/site-builder/mackValiSite";
import {
  createSitePreviewContentEditRequestMessage,
  createSitePreviewSelectionRequestMessage,
  isSitePreviewActiveSelectionMessage,
  isSitePreviewStateMessage,
} from "@/lib/site-builder/previewMessages";
import type {
  SiteDocument,
  SiteEditorSelection,
} from "@/lib/site-builder/types";
import type { SourceListing } from "@/types/source";

function cloneInitialSite(): SiteDocument {
  return JSON.parse(JSON.stringify(mackValiSiteDocument)) as SiteDocument;
}


export default function SitePreviewFrame() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [site, setSite] = useState<SiteDocument>(cloneInitialSite);
  const [selectedPageId, setSelectedPageId] = useState(
    () => cloneInitialSite().homePageId,
  );
  const [editorSelection, setEditorSelection] =
    useState<SiteEditorSelection | null>(null);
  const [sourceListings, setSourceListings] = useState<SourceListing[]>([]);

  const previewSite = useMemo(() => renderMackSiteDraft(site), [site]);
  const selectedPage =
    site.pages.find((page) => page.id === selectedPageId) ??
    site.pages.find((page) => page.id === site.homePageId) ??
    site.pages[0];

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    rootRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [selectedPageId]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      if (isSitePreviewStateMessage(event.data)) {
        setSite(event.data.payload.site);
        setSelectedPageId(event.data.payload.selectedPageId);
        setSourceListings(event.data.payload.sourceListings);
        return;
      }

      if (isSitePreviewActiveSelectionMessage(event.data)) {
        setEditorSelection(event.data.payload.selection);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);



  return (
    <div
      ref={rootRef}
      data-site-preview-scroll-root
      className="h-dvh overflow-y-auto overflow-x-hidden overscroll-contain"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <PortfolioSite
        site={previewSite}
        siteDocument={site}
        sections={selectedPage?.sections ?? []}
        sourceListings={sourceListings}
        editorPreview
        editorSelection={editorSelection}
        editorPageId={selectedPage?.id ?? selectedPageId}
        onEditorSelectionRequest={(selection) => {
          window.parent.postMessage(
            createSitePreviewSelectionRequestMessage(selection),
            window.location.origin,
          );
        }}
        onEditorContentEditRequest={(edit) => {
          window.parent.postMessage(
            createSitePreviewContentEditRequestMessage(edit),
            window.location.origin,
          );
        }}
      />
    </div>
  );
}
