"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

import { AREAS, type AreaConfig } from "@/config/areas";
import { AreaDetail } from "@/components/areas/AreaDetail";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import { CLOSE_ACTIVE_AREA_DETAIL_EVENT } from "@/components/areas/events";
import { hapticPress } from "@/lib/haptics/creatorHaptics";
import { normalizeGoalStatus } from "@/lib/goals/status";
import { getSupabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const DASHBOARD_DETAIL_SAFE_TOP_GAP = 8;
const AREA_CARD_BORDER_RADIUS = 16;
const AREA_DETAIL_BORDER_RADIUS = 24;

const areaEmojiStyle = {
  fontFamily:
    '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
  WebkitTouchCallout: "none",
  WebkitTapHighlightColor: "transparent",
  WebkitUserSelect: "none",
  userSelect: "none",
} as CSSProperties;

type MeasuredAreaRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type AreaDetailViewportRect = {
  top: number;
  height: number;
};

type AreaDetailTransition = {
  areaId: string;
  phase: "opening" | "open" | "closing";
  sourceRect: MeasuredAreaRect;
  targetRect: MeasuredAreaRect;
  sourceBorderRadius: number;
  targetBorderRadius: number;
  closeRect: MeasuredAreaRect | null;
};

type AreaGoalCountRow = {
  area_id: string | null;
  status: string | null;
  active: boolean | null;
};

function measureAreaRect(rect: DOMRect): MeasuredAreaRect {
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

function getAreaDetailViewport(): AreaDetailViewportRect {
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

function getAreaDetailPopupRect(
  viewportRect = getAreaDetailViewport()
): MeasuredAreaRect {
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
    top: viewportRect.top,
    left: Math.max(horizontalInset, (viewportWidth - width) / 2),
    width,
    height: viewportRect.height,
  };
}

function getAreaDetailTransform(
  rect: MeasuredAreaRect,
  targetRect: MeasuredAreaRect
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

  return Number.isFinite(radius) ? radius : AREA_CARD_BORDER_RADIUS;
}

function scrollAreaDashboardPageToTop() {
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

function AreaCard({
  area,
  goalCount,
  isHidden,
  onClick,
  setCardRef,
}: {
  area: AreaConfig;
  goalCount: number;
  isHidden: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  setCardRef: (areaId: string, node: HTMLButtonElement | null) => void;
}) {
  const setCombinedRef = useCallback(
    (node: HTMLButtonElement | null) => {
      setCardRef(area.id, node);
    },
    [area.id, setCardRef]
  );

  return (
    <button
      ref={setCombinedRef}
      type="button"
      aria-label={`${area.label} area`}
      onClick={onClick}
      className={cn(
        "card app-dashboard-area-card flex aspect-square w-full select-none flex-col items-center justify-center p-1 transition-colors hover:bg-[var(--subtle-surface)] active:scale-[0.98]",
        isHidden && "pointer-events-none opacity-0"
      )}
    >
      <div
        className="mb-1 select-none text-[22px] leading-none"
        style={areaEmojiStyle}
        aria-hidden="true"
      >
        {area.emoji}
      </div>
      <h3 className="w-full select-none break-words text-center text-[10px] font-semibold leading-tight">
        {area.label.toUpperCase()}
      </h3>
      <p className="mt-0.5 select-none text-[9px] text-zinc-500">
        {goalCount} Goal{goalCount === 1 ? "" : "s"}
      </p>
    </button>
  );
}

function AreasGrid() {
  const sortedAreas = useMemo(
    () => [...AREAS].sort((a, b) => a.sortOrder - b.sortOrder),
    []
  );
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [goalCounts, setGoalCounts] = useState<Record<string, number>>({});
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [areaTransition, setAreaTransition] =
    useState<AreaDetailTransition | null>(null);
  const [isPortalMounted, setIsPortalMounted] = useState(false);
  const [detailOverlayTop, setDetailOverlayTop] = useState(0);
  const [detailOverlayHeight, setDetailOverlayHeight] = useState<number | null>(
    null
  );
  const previousFocus = useRef<HTMLElement | null>(null);
  const previousBodyOverflow = useRef<string | null>(null);
  const previousHtmlOverflow = useRef<string | null>(null);
  const previousBodyOverscrollBehavior = useRef<string | null>(null);
  const previousHtmlOverscrollBehavior = useRef<string | null>(null);
  const detailOverlayScrollRef = useRef<HTMLDivElement | null>(null);
  const areaCardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const selectedArea = activeAreaId
    ? (sortedAreas.find((area) => area.id === activeAreaId) ?? null)
    : null;

  const loadAreaGoalCounts = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Failed to load Area goal counts", userError);
      return;
    }

    if (!user) {
      setGoalCounts({});
      return;
    }

    const { data, error } = await supabase
      .from("goals")
      .select("area_id,status,active")
      .eq("user_id", user.id)
      .in(
        "area_id",
        sortedAreas.map((area) => area.id)
      )
      .is("monument_id", null);

    if (error) {
      console.error("Failed to load Area goal counts", error);
      return;
    }

    const nextCounts = ((data ?? []) as AreaGoalCountRow[]).reduce<
      Record<string, number>
    >((counts, goal) => {
      if (
        goal.area_id &&
        normalizeGoalStatus(goal.status, goal.active) !== "COMPLETED"
      ) {
        counts[goal.area_id] = (counts[goal.area_id] ?? 0) + 1;
      }

      return counts;
    }, {});

    setGoalCounts(nextCounts);
  }, [sortedAreas, supabase]);

  useEffect(() => {
    void loadAreaGoalCounts();
  }, [loadAreaGoalCounts]);

  useEffect(() => {
    const handleCreatorEntitySaved = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string }>).detail;

      if (detail?.entityType === "GOAL") {
        void loadAreaGoalCounts();
      }
    };

    window.addEventListener("creator:entity-saved", handleCreatorEntitySaved);

    return () => {
      window.removeEventListener(
        "creator:entity-saved",
        handleCreatorEntitySaved
      );
    };
  }, [loadAreaGoalCounts]);

  const setAreaCardRef = useCallback(
    (areaId: string, node: HTMLButtonElement | null) => {
      if (node) {
        areaCardRefs.current.set(areaId, node);
      } else {
        areaCardRefs.current.delete(areaId);
      }
    },
    []
  );

  const getAreaCardRect = useCallback((areaId: string) => {
    const sourceCard = areaCardRefs.current.get(areaId);

    if (!sourceCard) {
      return null;
    }

    const rect = sourceCard.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return measureAreaRect(rect);
  }, []);

  const closeAreaDetail = useCallback(() => {
    if (!activeAreaId) {
      return;
    }

    detailOverlayScrollRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    const closeRect = getAreaCardRect(activeAreaId);

    setAreaTransition((currentTransition) => {
      if (!currentTransition || currentTransition.phase === "closing") {
        return currentTransition;
      }

      return {
        ...currentTransition,
        phase: "closing",
        closeRect,
      };
    });
  }, [activeAreaId, getAreaCardRect]);

  const handleAreaShellAnimationComplete = useCallback(() => {
    if (!areaTransition) {
      return;
    }

    if (areaTransition.phase === "opening") {
      setAreaTransition({
        ...areaTransition,
        phase: "open",
      });
      return;
    }

    if (areaTransition.phase === "closing") {
      setActiveAreaId(null);
      setAreaTransition(null);
    }
  }, [areaTransition]);

  useEffect(() => {
    setIsPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!activeAreaId) {
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
    body.classList.add("area-detail-open");

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
      body.classList.remove("area-detail-open");
    };
  }, [activeAreaId]);

  useLayoutEffect(() => {
    if (!activeAreaId) {
      return;
    }

    detailOverlayScrollRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [activeAreaId]);

  useEffect(() => {
    if (!activeAreaId) {
      setDetailOverlayTop(0);
      setDetailOverlayHeight(null);
      return;
    }

    const updateStableOverlayHeight = () => {
      const nextViewport = getAreaDetailViewport();
      setDetailOverlayTop(Math.round(nextViewport.top));
      if (nextViewport.height > 0) {
        setDetailOverlayHeight(Math.round(nextViewport.height));
      }
      setAreaTransition((currentTransition) => {
        if (!currentTransition || currentTransition.phase === "closing") {
          return currentTransition;
        }

        return {
          ...currentTransition,
          targetRect: getAreaDetailPopupRect(nextViewport),
          targetBorderRadius:
            window.innerWidth >= 768
              ? AREA_DETAIL_BORDER_RADIUS
              : AREA_CARD_BORDER_RADIUS,
        };
      });
    };

    updateStableOverlayHeight();
    window.addEventListener("resize", updateStableOverlayHeight);
    window.addEventListener("orientationchange", updateStableOverlayHeight);
    window.visualViewport?.addEventListener("resize", updateStableOverlayHeight);

    return () => {
      window.removeEventListener("resize", updateStableOverlayHeight);
      window.removeEventListener("orientationchange", updateStableOverlayHeight);
      window.visualViewport?.removeEventListener(
        "resize",
        updateStableOverlayHeight
      );
    };
  }, [activeAreaId]);

  useEffect(() => {
    const closeActiveDetail = () => closeAreaDetail();

    window.addEventListener(CLOSE_ACTIVE_AREA_DETAIL_EVENT, closeActiveDetail);
    return () => {
      window.removeEventListener(
        CLOSE_ACTIVE_AREA_DETAIL_EVENT,
        closeActiveDetail
      );
    };
  }, [closeAreaDetail]);

  useEffect(() => {
    if (!activeAreaId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAreaDetail();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeAreaId, closeAreaDetail]);

  const openAreaDetail = (
    areaId: string,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    const sourceElement = event.currentTarget;
    const sourceRect = measureAreaRect(sourceElement.getBoundingClientRect());

    if (sourceRect.width <= 0 || sourceRect.height <= 0) {
      return;
    }

    void hapticPress();
    scrollAreaDashboardPageToTop();

    const nextViewport = getAreaDetailViewport();
    const targetRect = getAreaDetailPopupRect(nextViewport);
    setDetailOverlayTop(Math.round(nextViewport.top));
    if (nextViewport.height > 0) {
      setDetailOverlayHeight(Math.round(nextViewport.height));
    }
    setAreaTransition({
      areaId,
      phase: "opening",
      sourceRect,
      targetRect,
      sourceBorderRadius: getElementBorderRadius(sourceElement),
      targetBorderRadius:
        window.innerWidth >= 768
          ? AREA_DETAIL_BORDER_RADIUS
          : AREA_CARD_BORDER_RADIUS,
      closeRect: null,
    });
    setActiveAreaId(areaId);
  };

  const detailOverlayStyle = {
    "--area-detail-overlay-height": detailOverlayHeight
      ? `${detailOverlayHeight}px`
      : "100dvh",
  } as CSSProperties;
  const detailOverlayScrollStyle = {
    top: `${detailOverlayTop}px`,
    height: detailOverlayHeight ? `${detailOverlayHeight}px` : "100dvh",
  } as CSSProperties;
  const areaShellRect =
    areaTransition?.phase === "closing"
      ? (areaTransition.closeRect ?? areaTransition.targetRect)
      : areaTransition?.targetRect;
  const areaShellIsFallbackClose =
    areaTransition?.phase === "closing" && !areaTransition.closeRect;
  const areaShellBorderRadius =
    areaTransition?.phase === "closing" && areaTransition.closeRect
      ? areaTransition.sourceBorderRadius
      : (areaTransition?.targetBorderRadius ?? AREA_DETAIL_BORDER_RADIUS);
  const areaDetailContentVisible = areaTransition?.phase === "open";
  const isAreaSourceCardHidden =
    areaTransition !== null &&
    areaTransition.areaId === activeAreaId &&
    areaTransition.phase !== "open";

  const areaDetailOverlay =
    selectedArea && areaTransition && areaShellRect
      ? (() => {
          const openingTransform = getAreaDetailTransform(
            areaTransition.sourceRect,
            areaTransition.targetRect
          );
          const activeShellRect =
            areaTransition.phase === "closing" && areaTransition.closeRect
              ? areaTransition.closeRect
              : areaTransition.targetRect;
          const activeTransform = getAreaDetailTransform(
            activeShellRect,
            areaTransition.targetRect
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
                  opacity: areaTransition.phase === "closing" ? 0 : 1,
                }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={`${selectedArea.label} area dashboard`}
                className={cn(
                  "app-card relative z-10 mx-auto flex min-h-[var(--area-detail-overlay-height,100dvh)] max-h-none w-full max-w-[min(100vw-1.25rem,420px)] flex-col shadow-[0_6px_24px_rgba(0,0,0,0.18)] sm:max-w-[min(100vw-4rem,640px)] md:rounded-3xl lg:max-w-[min(100vw-6rem,960px)] xl:max-w-[min(100vw-8rem,1160px)]",
                  areaTransition.phase === "open"
                    ? "overflow-visible"
                    : "overflow-hidden"
                )}
                style={{
                  ...detailOverlayStyle,
                  width: areaTransition.targetRect.width,
                  transformOrigin: "top left",
                }}
                initial={{
                  x: openingTransform.x,
                  y: openingTransform.y,
                  scaleX: openingTransform.scaleX,
                  scaleY: openingTransform.scaleY,
                  borderRadius: areaTransition.sourceBorderRadius,
                  opacity: 1,
                }}
                animate={{
                  x:
                    areaTransition.phase === "closing" ? activeTransform.x : 0,
                  y:
                    areaTransition.phase === "closing" ? activeTransform.y : 0,
                  scaleX: areaShellIsFallbackClose
                    ? 0.96
                    : areaTransition.phase === "closing"
                      ? activeTransform.scaleX
                      : 1,
                  scaleY: areaShellIsFallbackClose
                    ? 0.96
                    : areaTransition.phase === "closing"
                      ? activeTransform.scaleY
                      : 1,
                  borderRadius: areaShellBorderRadius,
                  opacity: areaShellIsFallbackClose ? 0 : 1,
                }}
                transition={{
                  type: "spring",
                  stiffness: 520,
                  damping: 44,
                  mass: 0.9,
                }}
                onAnimationComplete={handleAreaShellAnimationComplete}
              >
                <motion.div
                  className="min-h-full w-full overflow-visible"
                  initial={false}
                  animate={{ opacity: areaDetailContentVisible ? 1 : 0 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                >
                  <AreaDetail area={selectedArea} onClose={closeAreaDetail} />
                </motion.div>
              </motion.div>
            </div>
          );
        })()
      : null;

  return (
    <div>
      <div className="app-dashboard-areas-panel px-4">
        <div className="grid grid-cols-4 gap-1">
          {sortedAreas.map((area) => (
            <AreaCard
              key={area.id}
              area={area}
              goalCount={goalCounts[area.id] ?? 0}
              isHidden={isAreaSourceCardHidden && areaTransition?.areaId === area.id}
              onClick={(event) => openAreaDetail(area.id, event)}
              setCardRef={setAreaCardRef}
            />
          ))}
        </div>
      </div>

      {isPortalMounted ? createPortal(areaDetailOverlay, document.body) : null}
    </div>
  );
}

export function AreasContainer() {
  return (
    <section className="section app-dashboard-section mt-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="h-label block">Areas</h2>
      </div>

      <div className="w-full overflow-x-auto overscroll-x-contain snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-full">
          <div className="w-full shrink-0 snap-start">
            <AreasGrid />
          </div>

          <div className="w-full shrink-0 snap-start">
            <MonumentContainer embedded />
          </div>
        </div>
      </div>
    </section>
  );
}
