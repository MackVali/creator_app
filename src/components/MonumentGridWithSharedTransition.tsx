"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  MonumentDetail,
  type MonumentDetailMonument,
} from "@/components/monuments/MonumentDetail";
import { OPEN_MONUMENT_DIALOG_EVENT } from "@/components/monuments/AddMonumentDialog";
import { MAX_MONUMENTS } from "@/lib/monuments/constants";

export interface Monument extends MonumentDetailMonument {
  stats: string; // e.g. "12 Goals"
}

interface MonumentGridProps {
  monuments: Monument[];
  showNewCard?: boolean;
}

const GRID_PAGE_SIZE = 8;
const SWIPE_CONFIDENCE_THRESHOLD = 1000;
const SWIPE_OFFSET_THRESHOLD = 120;

type GridItem =
  | { type: "monument"; id: string; monument: Monument }
  | { type: "new"; id: "new-monument" };

const clampPage = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function MonumentGridWithSharedTransition({
  monuments,
  showNewCard = true,
}: MonumentGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const isEmpty = monuments.length === 0;
  const selected = isEmpty ? null : monuments.find((m) => m.id === activeId) || null;
  const allowNewMonumentCard = showNewCard && monuments.length < MAX_MONUMENTS;

  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (activeId) {
      previousFocus.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
      document.body.classList.add("modal-open");
    } else {
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
      previousFocus.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
    };
  }, [activeId]);

  const openDialog = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(OPEN_MONUMENT_DIALOG_EVENT));
  };

  const renderNewMonumentCard = () => (
    <button
      type="button"
      data-tour="new-monument"
      onClick={openDialog}
      className="card flex aspect-square w-full flex-col items-center justify-center p-1 transition-colors hover:bg-white/5"
    >
      <div className="mb-1 text-lg leading-none">🏛️</div>
      <h3 className="w-full break-words text-center text-[10px] font-semibold leading-tight text-zinc-500">
        NEW MONUMENT
      </h3>
    </button>
  );

  if (!allowNewMonumentCard && isEmpty) {
    return (
      <div className="grid grid-cols-4 gap-1">
        <div className="card flex aspect-square w-full flex-col items-center justify-center p-1">
          <p className="text-xs text-white/50">
            Maximum of {MAX_MONUMENTS} monuments reached.
          </p>
        </div>
      </div>
    );
  }

  const gridItems = useMemo<GridItem[]>(() => {
    const base = monuments.map((monument) => ({
      type: "monument" as const,
      id: monument.id,
      monument,
    }));

    if (allowNewMonumentCard) {
      base.push({ type: "new" as const, id: "new-monument" });
    }

    return base;
  }, [monuments, allowNewMonumentCard]);

  if (isEmpty) {
    return (
      <div className="grid grid-cols-4 gap-1">
        {Array.from({ length: 3 }, (_, index) => (
          <button
            key={`empty-${index}`}
            data-tour="new-monument"
            onClick={openDialog}
            className="card flex aspect-square w-full flex-col items-center justify-center p-1 transition-colors hover:bg-white/5"
          >
            <div className="mb-1 text-lg opacity-60">🏛️</div>
            <h3 className="w-full break-words text-center text-[10px] font-semibold leading-tight text-zinc-500">
              NEW MONUMENT
            </h3>
          </button>
        ))}
        {allowNewMonumentCard && renderNewMonumentCard()}
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(gridItems.length / GRID_PAGE_SIZE));
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    setPage((current) => clampPage(current, 0, pageCount - 1));
  }, [pageCount]);

  const paginate = (delta: number) => {
    setPage((current) => {
      const nextPage = clampPage(current + delta, 0, pageCount - 1);
      if (nextPage === current) return current;
      setDirection(delta);
      return nextPage;
    });
  };

  const swipePower = (offset: number, velocity: number) => Math.abs(offset) * velocity;

  const handleDragEnd = (_: MouseEvent | TouchEvent, info: PanInfo) => {
    const swipe = swipePower(info.offset.x, info.velocity.x);
    if (swipe < -SWIPE_CONFIDENCE_THRESHOLD || info.offset.x < -SWIPE_OFFSET_THRESHOLD) {
      paginate(1);
    } else if (
      swipe > SWIPE_CONFIDENCE_THRESHOLD ||
      info.offset.x > SWIPE_OFFSET_THRESHOLD
    ) {
      paginate(-1);
    }
  };

  const pageVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({
      x: dir < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  const currentPageItems = gridItems.slice(page * GRID_PAGE_SIZE, (page + 1) * GRID_PAGE_SIZE);

  return (
    <div>
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            drag={pageCount > 1 ? "x" : undefined}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.35}
            onDragEnd={handleDragEnd}
            whileTap={pageCount > 1 ? { cursor: "grabbing" } : undefined}
            className="grid grid-cols-4 gap-1"
          >
            {currentPageItems.map((item) =>
              item.type === "monument" ? (
                <motion.button
                  key={item.id}
                  layoutId={`card-${item.id}`}
                  onClick={() => setActiveId(item.id)}
                  className="card flex aspect-square w-full flex-col items-center justify-center p-1 transition-colors hover:bg-white/5"
                >
                  <motion.div layoutId={`emoji-${item.id}`} className="mb-1 text-lg">
                    {item.monument.emoji ?? "\uD83C\uDFDB\uFE0F"}
                  </motion.div>
                  <motion.h3
                    layoutId={`title-${item.id}`}
                    className="w-full break-words text-center text-[10px] font-semibold leading-tight"
                  >
                    {item.monument.title}
                  </motion.h3>
                  <p className="mt-0.5 text-[9px] text-zinc-500">{item.monument.stats}</p>
                </motion.button>
              ) : (
                <div key={item.id}>{renderNewMonumentCard()}</div>
              )
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          {Array.from({ length: pageCount }).map((_, index) => (
            <span
              key={`page-${index}`}
              className={`h-1.5 w-10 rounded-full transition ${
                index === page ? "bg-white" : "bg-white/30"
              }`}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {!isEmpty && selected && (
          <motion.div
            key="overlay"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <motion.div
              layoutId={`card-${selected.id}`}
              role="dialog"
              aria-modal="true"
              className="relative h-full w-full max-h-[min(100vh-3rem,960px)] max-w-[min(100vw-3rem,420px)] overflow-y-auto rounded-2xl border border-white/5 bg-[#0B0E13] shadow-[0_6px_24px_rgba(0,0,0,0.35)] sm:max-h-[min(100vh-4rem,1000px)] sm:max-w-[min(100vw-4rem,640px)] md:rounded-3xl lg:max-w-[min(100vw-6rem,960px)] xl:max-w-[min(100vw-8rem,1160px)]"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 500, damping: 40, mass: 0.9 }}
            >
              <Button
                variant="secondary"
                size="icon"
                aria-label="Close detail"
                onClick={() => setActiveId(null)}
                className="absolute right-4 top-4 z-10"
              >
                <X className="h-4 w-4" />
              </Button>
              <MonumentDetail monument={selected} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MonumentGridWithSharedTransition;
