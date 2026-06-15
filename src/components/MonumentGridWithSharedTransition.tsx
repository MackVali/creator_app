"use client";

import {
  useState,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  MonumentDetail,
  type MonumentDetailMonument,
} from "@/components/monuments/MonumentDetail";
import { OPEN_MONUMENT_DIALOG_EVENT } from "@/components/monuments/AddMonumentDialog";
import { CLOSE_ACTIVE_MONUMENT_DETAIL_EVENT } from "@/components/monuments/events";
import { MAX_MONUMENTS } from "@/lib/monuments/constants";

export interface Monument extends MonumentDetailMonument {
  stats: string; // e.g. "12 Goals"
}

interface MonumentGridProps {
  monuments: Monument[];
  showNewCard?: boolean;
}

export function MonumentGridWithSharedTransition({
  monuments,
  showNewCard = true,
}: MonumentGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPortalMounted, setIsPortalMounted] = useState(false);
  const isEmpty = monuments.length === 0;
  const selected = isEmpty
    ? null
    : monuments.find((m) => m.id === activeId) || null;
  const allowNewMonumentCard = showNewCard && monuments.length < MAX_MONUMENTS;

  const previousFocus = useRef<HTMLElement | null>(null);
  const previousBodyOverflow = useRef<string | null>(null);
  const previousHtmlOverflow = useRef<string | null>(null);
  const previousBodyOverscrollBehavior = useRef<string | null>(null);
  const previousHtmlOverscrollBehavior = useRef<string | null>(null);
  const detailOverlayScrollRef = useRef<HTMLDivElement | null>(null);
  const [detailOverlayHeight, setDetailOverlayHeight] = useState<number | null>(
    null
  );

  useEffect(() => {
    setIsPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!activeId) {
      previousFocus.current?.focus();
      return;
    }

    previousFocus.current = document.activeElement as HTMLElement;
    const { body, documentElement } = document;

    previousBodyOverflow.current = body.style.overflow;
    previousHtmlOverflow.current = documentElement.style.overflow;
    previousBodyOverscrollBehavior.current = body.style.overscrollBehavior;
    previousHtmlOverscrollBehavior.current =
      documentElement.style.overscrollBehavior;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    documentElement.style.overscrollBehavior = "none";
    document.body.classList.add("monument-detail-open");

    return () => {
      body.style.overflow = previousBodyOverflow.current ?? "";
      documentElement.style.overflow = previousHtmlOverflow.current ?? "";
      body.style.overscrollBehavior =
        previousBodyOverscrollBehavior.current ?? "";
      documentElement.style.overscrollBehavior =
        previousHtmlOverscrollBehavior.current ?? "";
      previousBodyOverflow.current = null;
      previousHtmlOverflow.current = null;
      previousBodyOverscrollBehavior.current = null;
      previousHtmlOverscrollBehavior.current = null;
      document.body.classList.remove("monument-detail-open");
    };
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;

    requestAnimationFrame(() => {
      detailOverlayScrollRef.current?.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    });
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      setDetailOverlayHeight(null);
      return;
    }

    const isFabKeyboardHandlingViewport = () => {
      const activeElement = document.activeElement;
      return (
        document.body.classList.contains("fab-keyboard-active") ||
        (activeElement instanceof Element &&
          Boolean(activeElement.closest("[data-fab-overlay]")))
      );
    };

    const updateStableOverlayHeight = () => {
      if (isFabKeyboardHandlingViewport()) return;

      const nextHeight = Math.max(
        window.innerHeight || 0,
        window.visualViewport?.height ?? 0
      );
      if (nextHeight > 0) {
        setDetailOverlayHeight(Math.round(nextHeight));
      }
    };

    updateStableOverlayHeight();
    window.addEventListener("resize", updateStableOverlayHeight);
    window.addEventListener("orientationchange", updateStableOverlayHeight);
    window.visualViewport?.addEventListener("resize", updateStableOverlayHeight);

    return () => {
      window.removeEventListener("resize", updateStableOverlayHeight);
      window.removeEventListener(
        "orientationchange",
        updateStableOverlayHeight
      );
      window.visualViewport?.removeEventListener(
        "resize",
        updateStableOverlayHeight
      );
    };
  }, [activeId]);

  useEffect(() => {
    const closeActiveDetail = () => setActiveId(null);

    window.addEventListener(CLOSE_ACTIVE_MONUMENT_DETAIL_EVENT, closeActiveDetail);
    return () => {
      window.removeEventListener(
        CLOSE_ACTIVE_MONUMENT_DETAIL_EVENT,
        closeActiveDetail
      );
    };
  }, []);

  const openDialog = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(OPEN_MONUMENT_DIALOG_EVENT));
  };

  const detailOverlayStyle = {
    "--monument-detail-overlay-height": detailOverlayHeight
      ? `${detailOverlayHeight}px`
      : "100dvh",
  } as CSSProperties;

  const renderNewMonumentCard = () => (
    <button
      type="button"
      data-tour="new-monument"
      onClick={openDialog}
      className="card app-dashboard-monument-card flex aspect-square w-full flex-col items-center justify-center p-1 transition-colors hover:bg-[var(--subtle-surface)]"
    >
      <div className="mb-1 text-lg leading-none">🏛️</div>
      <h3 className="w-full break-words text-center text-[10px] font-semibold leading-tight text-zinc-500">
        NEW MONUMENT
      </h3>
    </button>
  );

  const monumentDetailOverlay = (
    <AnimatePresence>
      {!isEmpty && selected && (
        <motion.div
          key="overlay"
          ref={detailOverlayScrollRef}
          className="fixed inset-0 z-40 flex items-start justify-center overflow-x-hidden overflow-y-auto overscroll-y-contain bg-black/60 px-0 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-0 backdrop-blur-md [-webkit-overflow-scrolling:touch] sm:pb-[calc(2rem+env(safe-area-inset-bottom,0px))]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="app-card relative flex min-h-[var(--monument-detail-overlay-height,100dvh)] max-h-none w-full max-w-[min(100vw-1.25rem,420px)] flex-col overflow-visible rounded-2xl shadow-[0_6px_24px_rgba(0,0,0,0.18)] sm:max-w-[min(100vw-4rem,640px)] md:rounded-3xl lg:max-w-[min(100vw-6rem,960px)] xl:max-w-[min(100vw-8rem,1160px)]"
            style={detailOverlayStyle}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 40,
              mass: 0.9,
            }}
          >
            <MonumentDetail
              monument={selected}
              onClose={() => setActiveId(null)}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!allowNewMonumentCard && isEmpty) {
    return (
      <div className="grid grid-cols-4 gap-1">
        <div className="card app-dashboard-monument-card flex aspect-square w-full flex-col items-center justify-center p-1">
          <p className="text-xs text-[var(--muted)]">
            Maximum of {MAX_MONUMENTS} monuments reached.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-1">
        {isEmpty
          ? Array.from({ length: 3 }, (_, index) => (
              <button
                key={`empty-${index}`}
                data-tour="new-monument"
                onClick={openDialog}
                className="card app-dashboard-monument-card flex aspect-square w-full flex-col items-center justify-center p-1 transition-colors hover:bg-[var(--subtle-surface)]"
              >
                <div className="mb-1 text-lg opacity-60">🏛️</div>
                <h3 className="w-full break-words text-center text-[10px] font-semibold leading-tight text-zinc-500">
                  NEW MONUMENT
                </h3>
              </button>
            ))
          : monuments.map((m) => (
              <motion.button
                key={m.id}
                layoutId={`card-${m.id}`}
                onClick={() => setActiveId(m.id)}
                className="card app-dashboard-monument-card flex aspect-square w-full flex-col items-center justify-center p-1 transition-colors hover:bg-[var(--subtle-surface)]"
              >
                <motion.div layoutId={`emoji-${m.id}`} className="mb-1 text-lg">
                  {m.emoji ?? "\uD83C\uDFDB\uFE0F"}
                </motion.div>
                <motion.h3
                  layoutId={`title-${m.id}`}
                  className="w-full break-words text-center text-[10px] font-semibold leading-tight"
                >
                  {m.title}
                </motion.h3>
                <p className="mt-0.5 text-[9px] text-zinc-500">{m.stats}</p>
              </motion.button>
            ))}
        {allowNewMonumentCard && renderNewMonumentCard()}
      </div>

      {isPortalMounted ? createPortal(monumentDetailOverlay, document.body) : null}
    </div>
  );
}

export default MonumentGridWithSharedTransition;
