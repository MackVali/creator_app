"use client";

import {
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  MonumentDetail,
  type MonumentDetailMonument,
} from "@/components/monuments/MonumentDetail";
import { OPEN_MONUMENT_DIALOG_EVENT } from "@/components/monuments/AddMonumentDialog";
import { CLOSE_ACTIVE_MONUMENT_DETAIL_EVENT } from "@/components/monuments/events";
import { MAX_MONUMENTS } from "@/lib/monuments/constants";

const DASHBOARD_DETAIL_SAFE_TOP_GAP = 8;
const MONUMENT_CARD_BORDER_RADIUS = 16;
const MONUMENT_DETAIL_BORDER_RADIUS = 24;

export interface Monument extends MonumentDetailMonument {
  stats: string; // e.g. "12 Goals"
}

interface MonumentGridProps {
  monuments: Monument[];
  showNewCard?: boolean;
}

type MeasuredMonumentRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type MonumentDetailViewportRect = {
  top: number;
  height: number;
};

type MonumentDetailTransition = {
  monumentId: string;
  phase: "opening" | "open" | "closing";
  sourceRect: MeasuredMonumentRect;
  targetRect: MeasuredMonumentRect;
  appViewportRect: MonumentDetailViewportRect;
  sourceBorderRadius: number;
  targetBorderRadius: number;
  closeRect: MeasuredMonumentRect | null;
};

function measureMonumentRect(rect: DOMRect): MeasuredMonumentRect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getSafeAreaInsetTop() {
  if (typeof document === "undefined") {
    return 0;
  }

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.paddingTop = "env(safe-area-inset-top, 0px)";
  document.body.appendChild(probe);

  const safeAreaInsetTop = Number.parseFloat(
    window.getComputedStyle(probe).paddingTop
  );

  probe.remove();

  return Number.isFinite(safeAreaInsetTop) ? safeAreaInsetTop : 0;
}

function getDashboardDetailViewport(): MonumentDetailViewportRect {
  const viewportHeight = Math.max(
    window.innerHeight || 0,
    window.visualViewport?.height ?? 0
  );
  const topNav = document.querySelector<HTMLElement>(".app-top-nav");
  const safeAreaInsetTop = getSafeAreaInsetTop();

  let top =
    safeAreaInsetTop > 0
      ? Math.min(viewportHeight, safeAreaInsetTop + DASHBOARD_DETAIL_SAFE_TOP_GAP)
      : 0;

  if (topNav) {
    const topNavRect = topNav.getBoundingClientRect();

    if (topNavRect.bottom > 0 && topNavRect.top < viewportHeight) {
      top = Math.max(top, Math.min(topNavRect.bottom, viewportHeight));
    }
  }

  return {
    top,
    height: Math.max(0, viewportHeight - top),
  };
}

function getDashboardDetailPopupRect(
  appViewportRect = getDashboardDetailViewport()
): MeasuredMonumentRect {
  const viewportWidth = window.innerWidth || 0;
  const horizontalInset =
    viewportWidth >= 1280
      ? 64
      : viewportWidth >= 1024
        ? 48
        : viewportWidth >= 640
          ? 32
          : 10;
  const maxWidth =
    viewportWidth >= 1280
      ? 1160
      : viewportWidth >= 1024
        ? 960
        : viewportWidth >= 640
          ? 640
          : 420;
  const availableWidth = Math.max(0, viewportWidth - horizontalInset * 2);
  const width = Math.min(maxWidth, availableWidth || viewportWidth);

  return {
    top: appViewportRect.top,
    left: Math.max(horizontalInset, (viewportWidth - width) / 2),
    width,
    height: appViewportRect.height,
  };
}

function getMonumentDetailTransform(
  rect: MeasuredMonumentRect,
  targetRect: MeasuredMonumentRect
) {
  return {
    x: rect.left - targetRect.left,
    y: rect.top - targetRect.top,
    scaleX: targetRect.width > 0 ? rect.width / targetRect.width : 1,
    scaleY: targetRect.height > 0 ? rect.height / targetRect.height : 1,
  };
}

function getElementBorderRadius(element: HTMLElement) {
  const radius = Number.parseFloat(getComputedStyle(element).borderRadius);

  return Number.isFinite(radius) ? radius : MONUMENT_CARD_BORDER_RADIUS;
}

function scrollMonumentDashboardPageToTop() {
  if (typeof document === "undefined") {
    return;
  }

  const scrollTarget =
    document.scrollingElement instanceof HTMLElement
      ? document.scrollingElement
      : document.documentElement;

  if (scrollTarget.scrollTop <= 0 && window.scrollY <= 0) {
    return;
  }

  scrollTarget.scrollTo({
    top: 0,
    left: 0,
    behavior: "auto",
  });
}

export function MonumentGridWithSharedTransition({
  monuments,
  showNewCard = true,
}: MonumentGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [monumentTransition, setMonumentTransition] =
    useState<MonumentDetailTransition | null>(null);
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
  const monumentCardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [detailOverlayTop, setDetailOverlayTop] = useState(0);
  const [detailOverlayHeight, setDetailOverlayHeight] = useState<number | null>(
    null
  );

  const setMonumentCardRef = useCallback(
    (monumentId: string, node: HTMLButtonElement | null) => {
      if (node) {
        monumentCardRefs.current.set(monumentId, node);
      } else {
        monumentCardRefs.current.delete(monumentId);
      }
    },
    []
  );

  const getMonumentCardRect = useCallback((monumentId: string) => {
    const sourceCard = monumentCardRefs.current.get(monumentId);

    if (!sourceCard) {
      return null;
    }

    const rect = sourceCard.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return measureMonumentRect(rect);
  }, []);

  const closeMonumentDetail = useCallback(() => {
    if (!activeId) {
      return;
    }

    detailOverlayScrollRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    const closeRect = getMonumentCardRect(activeId);

    setMonumentTransition((currentTransition) => {
      if (!currentTransition || currentTransition.phase === "closing") {
        return currentTransition;
      }

      return {
        ...currentTransition,
        phase: "closing",
        closeRect,
      };
    });
  }, [activeId, getMonumentCardRect]);

  const handleMonumentShellAnimationComplete = useCallback(() => {
    if (!monumentTransition) {
      return;
    }

    if (monumentTransition.phase === "opening") {
      setMonumentTransition({
        ...monumentTransition,
        phase: "open",
      });
      return;
    }

    if (monumentTransition.phase === "closing") {
      setActiveId(null);
      setMonumentTransition(null);
    }
  }, [monumentTransition]);

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

  useLayoutEffect(() => {
    if (!activeId) return;

    detailOverlayScrollRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      setDetailOverlayTop(0);
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

      const nextViewport = getDashboardDetailViewport();
      setDetailOverlayTop(Math.round(nextViewport.top));
      if (nextViewport.height > 0) {
        setDetailOverlayHeight(Math.round(nextViewport.height));
      }
      setMonumentTransition((currentTransition) => {
        if (!currentTransition || currentTransition.phase === "closing") {
          return currentTransition;
        }

        return {
          ...currentTransition,
          appViewportRect: nextViewport,
          targetRect: getDashboardDetailPopupRect(nextViewport),
          targetBorderRadius:
            window.innerWidth >= 768
              ? MONUMENT_DETAIL_BORDER_RADIUS
              : MONUMENT_CARD_BORDER_RADIUS,
        };
      });
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
    const closeActiveDetail = () => closeMonumentDetail();

    window.addEventListener(CLOSE_ACTIVE_MONUMENT_DETAIL_EVENT, closeActiveDetail);
    return () => {
      window.removeEventListener(
        CLOSE_ACTIVE_MONUMENT_DETAIL_EVENT,
        closeActiveDetail
      );
    };
  }, [closeMonumentDetail]);

  const openDialog = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(OPEN_MONUMENT_DIALOG_EVENT));
  };

  const openMonumentDetail = (
    monumentId: string,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    const sourceElement = event.currentTarget;
    const sourceRect = measureMonumentRect(
      sourceElement.getBoundingClientRect()
    );

    if (sourceRect.width <= 0 || sourceRect.height <= 0) {
      return;
    }

    scrollMonumentDashboardPageToTop();

    const nextViewport = getDashboardDetailViewport();
    const targetRect = getDashboardDetailPopupRect(nextViewport);
    setDetailOverlayTop(Math.round(nextViewport.top));
    if (nextViewport.height > 0) {
      setDetailOverlayHeight(Math.round(nextViewport.height));
    }
    setMonumentTransition({
      monumentId,
      phase: "opening",
      sourceRect,
      targetRect,
      appViewportRect: nextViewport,
      sourceBorderRadius: getElementBorderRadius(sourceElement),
      targetBorderRadius:
        window.innerWidth >= 768
          ? MONUMENT_DETAIL_BORDER_RADIUS
          : MONUMENT_CARD_BORDER_RADIUS,
      closeRect: null,
    });
    setActiveId(monumentId);
  };

  const detailOverlayStyle = {
    "--monument-detail-overlay-height": detailOverlayHeight
      ? `${detailOverlayHeight}px`
      : "100dvh",
  } as CSSProperties;
  const detailOverlayScrollStyle = {
    top: `${detailOverlayTop}px`,
    height: detailOverlayHeight ? `${detailOverlayHeight}px` : "100dvh",
  } as CSSProperties;
  const monumentShellRect =
    monumentTransition?.phase === "closing"
      ? (monumentTransition.closeRect ?? monumentTransition.targetRect)
      : monumentTransition?.targetRect;
  const monumentShellIsFallbackClose =
    monumentTransition?.phase === "closing" && !monumentTransition.closeRect;
  const monumentShellBorderRadius =
    monumentTransition?.phase === "closing" && monumentTransition.closeRect
      ? monumentTransition.sourceBorderRadius
      : (monumentTransition?.targetBorderRadius ??
        MONUMENT_DETAIL_BORDER_RADIUS);
  const monumentDetailContentVisible = monumentTransition?.phase === "open";
  const isMonumentSourceCardHidden =
    monumentTransition !== null &&
    monumentTransition.monumentId === activeId &&
    monumentTransition.phase !== "open";

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

  const monumentDetailOverlay =
    !isEmpty && selected && monumentTransition && monumentShellRect
      ? (() => {
          const openingTransform = getMonumentDetailTransform(
            monumentTransition.sourceRect,
            monumentTransition.targetRect
          );
          const activeShellRect =
            monumentTransition.phase === "closing" &&
            monumentTransition.closeRect
              ? monumentTransition.closeRect
              : monumentTransition.targetRect;
          const activeTransform = getMonumentDetailTransform(
            activeShellRect,
            monumentTransition.targetRect
          );

          return (
            <div
              ref={detailOverlayScrollRef}
              className="fixed inset-x-0 z-40 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-transparent pb-[calc(7rem+env(safe-area-inset-bottom,0px))] [-webkit-overflow-scrolling:touch] sm:pb-[calc(2rem+env(safe-area-inset-bottom,0px))]"
              style={detailOverlayScrollStyle}
            >
              <motion.div
                className="pointer-events-none fixed inset-0 bg-black/60 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: monumentTransition.phase === "closing" ? 0 : 1,
                }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                className={`app-card relative z-10 mx-auto flex min-h-[var(--monument-detail-overlay-height,100dvh)] max-h-none w-full max-w-[min(100vw-1.25rem,420px)] flex-col rounded-2xl shadow-[0_6px_24px_rgba(0,0,0,0.18)] sm:max-w-[min(100vw-4rem,640px)] md:rounded-3xl lg:max-w-[min(100vw-6rem,960px)] xl:max-w-[min(100vw-8rem,1160px)] ${
                  monumentTransition.phase === "open"
                    ? "overflow-visible"
                    : "overflow-hidden"
                }`}
                style={{
                  ...detailOverlayStyle,
                  width: monumentTransition.targetRect.width,
                  transformOrigin: "top left",
                }}
                initial={{
                  x: openingTransform.x,
                  y: openingTransform.y,
                  scaleX: openingTransform.scaleX,
                  scaleY: openingTransform.scaleY,
                  borderRadius: monumentTransition.sourceBorderRadius,
                  opacity: 1,
                }}
                animate={{
                  x:
                    monumentTransition.phase === "closing"
                      ? activeTransform.x
                      : 0,
                  y:
                    monumentTransition.phase === "closing"
                      ? activeTransform.y
                      : 0,
                  scaleX: monumentShellIsFallbackClose
                    ? 0.96
                    : monumentTransition.phase === "closing"
                      ? activeTransform.scaleX
                      : 1,
                  scaleY: monumentShellIsFallbackClose
                    ? 0.96
                    : monumentTransition.phase === "closing"
                      ? activeTransform.scaleY
                      : 1,
                  borderRadius: monumentShellBorderRadius,
                  opacity: monumentShellIsFallbackClose ? 0 : 1,
                }}
                transition={{
                  type: "spring",
                  stiffness: 520,
                  damping: 44,
                  mass: 0.9,
                }}
                onAnimationComplete={handleMonumentShellAnimationComplete}
              >
                <motion.div
                  className="min-h-full w-full overflow-visible"
                  initial={false}
                  animate={{ opacity: monumentDetailContentVisible ? 1 : 0 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                >
                  <MonumentDetail
                    monument={selected}
                    onClose={closeMonumentDetail}
                    suppressWindowScrollReset
                  />
                </motion.div>
              </motion.div>
            </div>
          );
        })()
      : null;

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
                ref={(node) => setMonumentCardRef(m.id, node)}
                layoutId={`card-${m.id}`}
                onClick={(event) => openMonumentDetail(m.id, event)}
                className={`card app-dashboard-monument-card flex aspect-square w-full flex-col items-center justify-center p-1 transition-colors hover:bg-[var(--subtle-surface)] ${
                  isMonumentSourceCardHidden &&
                  monumentTransition?.monumentId === m.id
                    ? "pointer-events-none opacity-0"
                    : ""
                }`}
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
