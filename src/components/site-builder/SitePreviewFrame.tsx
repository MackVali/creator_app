"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PortfolioSite from "@/components/portfolio/PortfolioSite";
import {
  mackValiSiteDocument,
  renderMackSiteDraft,
} from "@/lib/site-builder/mackValiSite";
import {
  createSitePreviewHeightMessage,
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
  }, [site, sourceListings, selectedPageId]);

  return (
    <div ref={rootRef}>
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
