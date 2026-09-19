"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PortfolioSite from "@/components/portfolio/PortfolioSite";
import {
  mackValiSiteDocument,
  renderMackSiteDraft,
} from "@/lib/site-builder/mackValiSite";
import { migrateLegacyMackSite } from "@/lib/site-builder/migrateLegacyMackSite";
import {
  createSitePreviewContentEditRequestMessage,
  createSitePreviewSectionInsertRequestMessage,
  createSitePreviewReadyMessage,
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
  const site = JSON.parse(
    JSON.stringify(mackValiSiteDocument),
  ) as SiteDocument;

  return migrateLegacyMackSite(site);
}


export default function SitePreviewFrame() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [site, setSite] = useState<SiteDocument>(cloneInitialSite);
  const [selectedPageId, setSelectedPageId] = useState(
    () => cloneInitialSite().homePageId,
  );
  const [editorSelection, setEditorSelection] =
    useState<SiteEditorSelection | null>(null);
  const [sourceListings, setSourceListings] =
    useState<SourceListing[]>([]);

  const [
    standaloneMode,
    setStandaloneMode,
  ] = useState(false);

  const [
    standaloneLoading,
    setStandaloneLoading,
  ] = useState(false);

  const [
    standaloneError,
    setStandaloneError,
  ] = useState<string | null>(
    null,
  );

  const previewSite = useMemo(() => renderMackSiteDraft(site), [site]);
  const selectedPage =
    site.pages.find((page) => page.id === selectedPageId) ??
    site.pages.find((page) => page.id === site.homePageId) ??
    site.pages[0];

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search,
      );

    if (
      params.get(
        "standalone",
      ) === "1"
    ) {
      return;
    }

    const html =
      document.documentElement;

    const body =
      document.body;

    const previousHtmlOverflow =
      html.style.overflow;

    const previousBodyOverflow =
      body.style.overflow;

    html.style.overflow =
      "hidden";

    body.style.overflow =
      "hidden";

    return () => {
      html.style.overflow =
        previousHtmlOverflow;

      body.style.overflow =
        previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search,
      );

    if (
      params.get(
        "standalone",
      ) !== "1"
    ) {
      return;
    }

    setStandaloneMode(true);
    setStandaloneLoading(true);
    setStandaloneError(null);

    let cancelled = false;

    async function loadStandaloneDraft() {
      try {
        const [
          draftResponse,
          listingsResponse,
        ] = await Promise.all([
          fetch(
            "/api/site-builder/draft",
            {
              method: "GET",
              headers: {
                Accept:
                  "application/json",
              },
              cache: "no-store",
            },
          ),

          fetch(
            "/api/source/listings",
            {
              method: "GET",
              headers: {
                Accept:
                  "application/json",
              },
              cache: "no-store",
            },
          ),
        ]);

        const draftPayload =
          (await draftResponse.json()) as {
            site?:
              | SiteDocument
              | null;
            error?: string;
          };

        if (
          !draftResponse.ok
        ) {
          throw new Error(
            draftPayload.error ??
              "Unable to load site draft.",
          );
        }

        let nextListings:
          SourceListing[] = [];

        if (
          listingsResponse.ok
        ) {
          const listingsPayload =
            (await listingsResponse.json()) as {
              listings?:
                SourceListing[];
            };

          nextListings =
            listingsPayload.listings ??
            [];
        }

        if (cancelled) {
          return;
        }

        const nextSite =
          migrateLegacyMackSite(
            draftPayload.site ??
              cloneInitialSite(),
          );

        const requestedPageId =
          params.get(
            "page",
          );

        const nextPageId =
          requestedPageId &&
          nextSite.pages.some(
            (page) =>
              page.id ===
              requestedPageId,
          )
            ? requestedPageId
            : nextSite.homePageId;

        setSite(nextSite);

        setSelectedPageId(
          nextPageId,
        );

        setSourceListings(
          nextListings,
        );

        setEditorSelection(
          null,
        );

        setStandaloneError(
          null,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStandaloneError(
          error instanceof Error
            ? error.message
            : "Unable to load site draft.",
        );
      } finally {
        if (!cancelled) {
          setStandaloneLoading(
            false,
          );
        }
      }
    }

    void loadStandaloneDraft();

    return () => {
      cancelled = true;
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
        setSite(
          migrateLegacyMackSite(
            event.data.payload.site,
          ),
        );
        setSelectedPageId(
          event.data.payload.selectedPageId,
        );
        setSourceListings(
          event.data.payload.sourceListings,
        );
        return;
      }

      if (isSitePreviewActiveSelectionMessage(event.data)) {
        setEditorSelection(event.data.payload.selection);
      }
    }

    window.addEventListener(
      "message",
      handleMessage,
    );

    // Do not depend on the parent iframe onLoad timing.
    // Tell the builder only after this listener exists.
    const params =
      new URLSearchParams(
        window.location.search,
      );

    if (
      params.get(
        "standalone",
      ) !== "1" &&
      window.parent !== window
    ) {
      window.parent.postMessage(
        createSitePreviewReadyMessage(),
        window.location.origin,
      );
    }

    return () =>
      window.removeEventListener(
        "message",
        handleMessage,
      );
  }, []);



  return (
    <div
      ref={rootRef}
      data-site-preview-scroll-root
      className={
        standaloneMode
          ? "min-h-dvh overflow-x-hidden"
          : "h-dvh overflow-y-auto overflow-x-hidden overscroll-contain"
      }
      style={{
        WebkitOverflowScrolling:
          "touch",
      }}
    >
      {standaloneLoading ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-[12px] text-white/50">
          Loading draft preview…
        </div>
      ) : null}

      {standaloneError ? (
        <div className="fixed left-1/2 top-4 z-[110] w-[min(420px,calc(100%-32px))] -translate-x-1/2 rounded-md border border-red-200/20 bg-black/95 px-3 py-2 text-[12px] leading-5 text-red-100 shadow-2xl">
          {standaloneError}
        </div>
      ) : null}

      <PortfolioSite
        site={previewSite}
        siteDocument={site}
        sections={selectedPage?.sections ?? []}
        sourceListings={sourceListings}
        editorPreview={!standaloneMode}
        editorSelection={
          standaloneMode
            ? null
            : editorSelection
        }
        editorPageId={
          selectedPage?.id ??
          selectedPageId
        }
        onEditorSelectionRequest={
          standaloneMode
            ? undefined
            : (selection) => {
                window.parent.postMessage(
                  createSitePreviewSelectionRequestMessage(
                    selection,
                  ),
                  window.location.origin,
                );
              }
        }
        onEditorContentEditRequest={
          standaloneMode
            ? undefined
            : (edit) => {
                window.parent.postMessage(
                  createSitePreviewContentEditRequestMessage(
                    edit,
                  ),
                  window.location.origin,
                );
              }
        }
        onEditorSectionInsertRequest={
          standaloneMode
            ? undefined
            : (request) => {
                window.parent.postMessage(
                  createSitePreviewSectionInsertRequestMessage(
                    request,
                  ),
                  window.location.origin,
                );
              }
        }
      />
    </div>
  );
}
